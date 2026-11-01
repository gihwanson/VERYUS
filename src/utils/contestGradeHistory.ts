import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { contestTypeLabel } from '../types/contest';

export type ContestGradeHistoryComment = {
  comment: string;
};

export type ContestGradeHistoryRecord = {
  id: string;
  contestId: string;
  contestTitle: string;
  contestType: string;
  appliedGrade: string;
  appliedScore: number;
  overallMean: number | null;
  clusterMean: number | null;
  comments: ContestGradeHistoryComment[];
  targetLabel: string;
  appliedAt: { seconds?: number } | null;
};

export type ContestGradeHistoryWrite = {
  contestId: string;
  contestTitle: string;
  contestType: string;
  appliedGrade: string;
  appliedScore: number;
  overallMean: number | null;
  clusterMean: number | null;
  comments: ContestGradeHistoryComment[];
  targetLabel: string;
};

export function commentsFromContestGrades(
  grades: Array<{ target?: string; comment?: string }>,
  target: string
): ContestGradeHistoryComment[] {
  return grades
    .filter((g) => g.target === target && String(g.comment || '').trim())
    .map((g) => ({
      comment: String(g.comment).trim(),
    }));
}

export async function saveContestGradeHistory(
  uid: string,
  payload: ContestGradeHistoryWrite
): Promise<void> {
  if (!uid || !payload.contestId) return;
  await setDoc(doc(db, 'users', uid, 'contestGradeHistory', payload.contestId), {
    contestId: payload.contestId,
    contestTitle: payload.contestTitle,
    contestType: payload.contestType,
    appliedGrade: payload.appliedGrade,
    appliedScore: payload.appliedScore,
    overallMean: payload.overallMean,
    clusterMean: payload.clusterMean,
    comments: payload.comments,
    targetLabel: payload.targetLabel,
    appliedAt: serverTimestamp(),
  });
}

export function subscribeContestGradeHistory(
  uid: string,
  onChange: (records: ContestGradeHistoryRecord[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'users', uid, 'contestGradeHistory'),
    (snap) => {
      const records = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          contestId: String(data.contestId || d.id),
          contestTitle: String(data.contestTitle || '등급전'),
          contestType: String(data.contestType || ''),
          appliedGrade: String(data.appliedGrade || ''),
          appliedScore: Number(data.appliedScore),
          overallMean: data.overallMean == null ? null : Number(data.overallMean),
          clusterMean: data.clusterMean == null ? null : Number(data.clusterMean),
          comments: Array.isArray(data.comments)
            ? data.comments
                .map((item: { comment?: string }) => ({
                  comment: String(item?.comment || '').trim(),
                }))
                .filter((item: ContestGradeHistoryComment) => item.comment)
            : [],
          targetLabel: String(data.targetLabel || ''),
          appliedAt: data.appliedAt || null,
        } satisfies ContestGradeHistoryRecord;
      });
      records.sort((a, b) => contestGradeHistoryAppliedAtMs(b.appliedAt) - contestGradeHistoryAppliedAtMs(a.appliedAt));
      onChange(records);
    },
    (error) => onError?.(error)
  );
}

export function contestGradeHistoryAppliedAtMs(appliedAt: { seconds?: number } | null): number {
  if (appliedAt && typeof appliedAt.seconds === 'number') return appliedAt.seconds * 1000;
  return 0;
}

export function formatContestGradeHistoryDate(appliedAt: { seconds?: number } | null): string {
  const ms = contestGradeHistoryAppliedAtMs(appliedAt);
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('ko-KR');
}

export function formatContestGradeHistoryType(type: string): string {
  return contestTypeLabel(type) || '등급전';
}
