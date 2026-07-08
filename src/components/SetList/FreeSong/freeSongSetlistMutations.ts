import {
  doc,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import type { FreeSongLineupItem, FreeSongSelfWithdrawalNotice } from './types';
import type { FreeSongSubmission } from './types';
import { normalizeSubmissions } from './freeSongSubmissionUtils';

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
