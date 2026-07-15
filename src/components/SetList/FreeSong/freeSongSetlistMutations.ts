import {
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Transaction,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import type { FreeSongLineupItem, FreeSongSelfWithdrawalNotice } from './types';
import type { FreeSongSubmission } from './types';
import { normalizeSubmissions } from './freeSongSubmissionUtils';

/** Firestore는 undefined 필드 쓰기를 거부하므로 저장 직전에 제거 */
function stripUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (typeof value === 'object') {
    const maybeTs = value as { toMillis?: unknown; seconds?: unknown; nanoseconds?: unknown };
    if (typeof maybeTs.toMillis === 'function') return value;
    if (typeof maybeTs.seconds === 'number' && typeof maybeTs.nanoseconds === 'number') return value;

    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
      if (nested !== undefined) out[key] = stripUndefinedDeep(nested);
    });
    return out as T;
  }
  return value;
}

/** dotted field path(`performers.${nick}`)에서 깨질 수 있는 문자 치환 */
function sanitizePerformerStatsKey(nickname: string): string {
  return nickname.trim().replace(/[./[\]#*$]/g, '_');
}

export function normalizeLineup(lineup: FreeSongLineupItem[] | undefined): FreeSongLineupItem[] {
  return (lineup ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));
}

export function readSetlistFreeSongState(data: Record<string, unknown> | undefined): {
  submissions: FreeSongSubmission[];
  lineup: FreeSongLineupItem[];
  selfWithdrawals: FreeSongSelfWithdrawalNotice[];
} {
  return {
    submissions: normalizeSubmissions(data?.freeSongSubmissions),
    lineup: normalizeLineup(data?.freeSongLineup as FreeSongLineupItem[] | undefined),
    selfWithdrawals: normalizeSelfWithdrawals(data?.freeSongSelfWithdrawals),
  };
}

export function normalizeSelfWithdrawals(
  raw: unknown
): FreeSongSelfWithdrawalNotice[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as FreeSongSelfWithdrawalNotice;
      if (!row.id || !row.title || !row.withdrawnBy) return null;
      return row;
    })
    .filter((item): item is FreeSongSelfWithdrawalNotice => item !== null);
}

export function removeSubmissionFromState(
  submissions: FreeSongSubmission[],
  lineup: FreeSongLineupItem[],
  submissionId: string
): { submissions: FreeSongSubmission[]; lineup: FreeSongLineupItem[] } {
  return {
    submissions: submissions.filter((s) => s.id !== submissionId),
    lineup: normalizeLineup(lineup.filter((item) => item.submissionId !== submissionId)),
  };
}

/** 미완료 항목만 순서 변경 (완료 곡은 뒤에 유지) */
export function reorderPendingLineup(
  lineup: FreeSongLineupItem[],
  submissionId: string,
  direction: 'up' | 'down'
): FreeSongLineupItem[] | null {
  const all = normalizeLineup(lineup);
  const completed = all.filter((item) => item.completedAt);
  const pending = all.filter((item) => !item.completedAt);

  const index = pending.findIndex((item) => item.submissionId === submissionId);
  if (index < 0) return null;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= pending.length) return null;

  const nextPending = [...pending];
  [nextPending[index], nextPending[targetIndex]] = [nextPending[targetIndex], nextPending[index]];

  const merged = [
    ...nextPending.map((item, i) => ({ ...item, order: i })),
    ...completed.map((item, i) => ({ ...item, order: nextPending.length + i })),
  ];
  return normalizeLineup(merged);
}

export function selfWithdrawFromState(
  submissions: FreeSongSubmission[],
  lineup: FreeSongLineupItem[],
  selfWithdrawals: FreeSongSelfWithdrawalNotice[],
  submissionId: string,
  withdrawnBy: string,
  withdrawnAt: FreeSongSelfWithdrawalNotice['withdrawnAt']
): {
  submissions: FreeSongSubmission[];
  lineup: FreeSongLineupItem[];
  freeSongSelfWithdrawals: FreeSongSelfWithdrawalNotice[];
} | null {
  const nick = withdrawnBy.trim();
  if (!nick) return null;

  const item = lineup.find((row) => row.submissionId === submissionId);
  if (!item || item.completedAt) return null;

  const members = (item.members ?? []).map((m) => String(m).trim());
  if (!members.includes(nick)) return null;

  const removed = removeSubmissionFromState(submissions, lineup, submissionId);
  const notice: FreeSongSelfWithdrawalNotice = {
    id: `${submissionId}_${Date.now()}`,
    submissionId,
    title: item.title,
    members: item.members ?? [],
    submittedBy: item.submittedBy,
    withdrawnBy: nick,
    withdrawnAt,
  };

  return {
    ...removed,
    freeSongSelfWithdrawals: [...selfWithdrawals, notice],
  };
}

export type CompleteLineupItemResult =
  | 'ok'
  | 'ok_stats_failed'
  | 'not_found'
  | 'already_completed'
  | 'permission_denied';

async function incrementBuskingPerformerStats(members: string[]): Promise<void> {
  const statsPatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  const seen = new Set<string>();
  members.forEach((member) => {
    const nick = sanitizePerformerStatsKey(String(member));
    if (!nick || seen.has(nick)) return;
    seen.add(nick);
    statsPatch[`performers.${nick}`] = increment(1);
  });
  if (Object.keys(statsPatch).length <= 1) return;
  await setDoc(doc(db, 'buskingStats', 'freeSong'), statsPatch, { merge: true });
}

function isPermissionDeniedError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      String((error as { code: unknown }).code) === 'permission-denied'
  );
}

/**
 * 곡 완료는 setlists만 원자적으로 반영하고,
 * 누적 통계(buskingStats)는 별도 best-effort로 반영한다.
 * (통계 권한/필드 오류로 완료 자체가 롤백되지 않게 함)
 */
export async function completeFreeSongLineupItemWithStats(
  setlistId: string,
  submissionId: string,
  completedBy: string
): Promise<CompleteLineupItemResult> {
  const setlistRef = doc(db, 'setlists', setlistId);
  const completedByNick = String(completedBy ?? '').trim();
  let completedMembers: string[] = [];

  try {
    await runTransaction(db, async (transaction) => {
      const setlistSnap = await transaction.get(setlistRef);
      if (!setlistSnap.exists()) throw new Error('SETLIST_NOT_FOUND');

      const state = readSetlistFreeSongState(setlistSnap.data());
      const index = state.lineup.findIndex((i) => i.submissionId === submissionId);
      if (index < 0) throw new Error('NOT_FOUND');
      if (state.lineup[index].completedAt) throw new Error('ALREADY_COMPLETED');

      const item = state.lineup[index];
      completedMembers = item.members ?? [];
      const nextItems = [...state.lineup];
      nextItems[index] = stripUndefinedDeep({
        ...nextItems[index],
        completedAt: Timestamp.now(),
        completedBy: completedByNick || 'unknown',
      });

      transaction.update(setlistRef, {
        freeSongLineup: stripUndefinedDeep(nextItems),
        freeSongSubmissions: stripUndefinedDeep(
          state.submissions.filter((s) => s.id !== submissionId)
        ),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') return 'not_found';
      if (error.message === 'ALREADY_COMPLETED') return 'already_completed';
    }
    if (isPermissionDeniedError(error)) return 'permission_denied';
    throw error;
  }

  try {
    await incrementBuskingPerformerStats(completedMembers);
    return 'ok';
  } catch (statsError) {
    console.error('자유곡 누적 통계 반영 실패:', statsError);
    return 'ok_stats_failed';
  }
}

export async function isFreeSongLineupItemCompleted(
  setlistId: string,
  submissionId: string
): Promise<boolean> {
  const setlistSnap = await getDoc(doc(db, 'setlists', setlistId));
  if (!setlistSnap.exists()) return false;
  const state = readSetlistFreeSongState(setlistSnap.data());
  return state.lineup.some((item) => item.submissionId === submissionId && !!item.completedAt);
}

export async function mutateSetlistFreeSong(
  setlistId: string,
  mutator: (
    state: {
      submissions: FreeSongSubmission[];
      lineup: FreeSongLineupItem[];
      selfWithdrawals: FreeSongSelfWithdrawalNotice[];
    },
    transaction: Transaction
  ) => Record<string, unknown> | null
): Promise<boolean> {
  const ref = doc(db, 'setlists', setlistId);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error('SETLIST_NOT_FOUND');

      const state = readSetlistFreeSongState(snap.data());
      const patch = mutator(state, transaction);
      if (!patch) throw new Error('MUTATION_REJECTED');

      transaction.update(ref, {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    });
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === 'MUTATION_REJECTED') return false;
    throw error;
  }
}
