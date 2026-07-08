import {
  doc,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import type { FreeSongLineupItem } from './types';
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
} {
  return {
    submissions: normalizeSubmissions(data?.freeSongSubmissions),
    lineup: normalizeLineup(data?.freeSongLineup as FreeSongLineupItem[] | undefined),
  };
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

export async function mutateSetlistFreeSong(
  setlistId: string,
  mutator: (
    state: { submissions: FreeSongSubmission[]; lineup: FreeSongLineupItem[] },
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
