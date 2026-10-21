import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getEvaluationCreatedAtMs } from './evaluationMemberRound';

export const GRADE_BATTLE_CATEGORY = 'gradeBattle';
export const GRADE_BATTLE_DAYS = 3;
export const GRADE_BATTLE_STATUS_PENDING_ASSIGN = '등급부여 대기중';
export const GRADE_BATTLE_STATUS_ASSIGNED = '등급부여완료';

export type GradeBattlePostLike = {
  id?: string;
  category?: string;
  status?: string;
  createdAt?: unknown;
  gradeBattleEndsAt?: unknown;
  writerNickname?: string;
  writerUid?: string;
};

export function computeGradeBattleEndsAt(fromMs = Date.now()): Date {
  return new Date(fromMs + GRADE_BATTLE_DAYS * 24 * 60 * 60 * 1000);
}

export function getGradeBattleDeadlineMs(post: GradeBattlePostLike, now = Date.now()): number {
  const ends = getEvaluationCreatedAtMs(post.gradeBattleEndsAt);
  if (ends) return ends;
  return now + GRADE_BATTLE_DAYS * 24 * 60 * 60 * 1000;
}

export function getGradeBattleDaysLeft(post: GradeBattlePostLike, now = Date.now()): number | null {
  if (post.category !== GRADE_BATTLE_CATEGORY) return null;
  if (post.status && post.status !== '대기') return null;
  const deadline = getGradeBattleDeadlineMs(post, now);
  const remainingMs = deadline - now;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

export function formatGradeBattleDday(post: GradeBattlePostLike, now = Date.now()): string | null {
  const daysLeft = getGradeBattleDaysLeft(post, now);
  if (daysLeft === null) return null;
  if (daysLeft <= 0) return null;
  return `D-${Math.min(daysLeft, GRADE_BATTLE_DAYS)}`;
}

export function isGradeBattleScoringOpen(post: GradeBattlePostLike, now = Date.now()): boolean {
  if (post.category !== GRADE_BATTLE_CATEGORY) return false;
  if (post.status && post.status !== '대기') return false;
  const daysLeft = getGradeBattleDaysLeft(post, now);
  return daysLeft !== null && daysLeft > 0;
}

export async function ensureGradeBattleEndsAt(post: GradeBattlePostLike): Promise<Date | null> {
  if (!post.id || post.category !== GRADE_BATTLE_CATEGORY) return null;
  if (post.gradeBattleEndsAt) {
    const ms = getEvaluationCreatedAtMs(post.gradeBattleEndsAt);
    return ms ? new Date(ms) : null;
  }
  const endsAt = computeGradeBattleEndsAt();
  await updateDoc(doc(db, 'posts', post.id), { gradeBattleEndsAt: endsAt });
  return endsAt;
}

/** 채점 기간 종료 → 등급부여 대기중 */
export async function tryResolveExpiredGradeBattle(
  post: GradeBattlePostLike,
  now = Date.now()
): Promise<string | null> {
  if (!post.id || post.category !== GRADE_BATTLE_CATEGORY) return null;
  if (post.status && post.status !== '대기') return null;

  const deadline = getGradeBattleDeadlineMs(post, now);
  if (!deadline || now < deadline) return null;

  await updateDoc(doc(db, 'posts', post.id), {
    status: GRADE_BATTLE_STATUS_PENDING_ASSIGN,
    statusUpdatedAt: serverTimestamp(),
  });
  return GRADE_BATTLE_STATUS_PENDING_ASSIGN;
}

export function gradeBattleScoresCollection(postId: string) {
  return collection(db, 'posts', postId, 'gradeBattleScores');
}

async function syncUserGradeInDocuments(targetUid: string, grade: string) {
  const CHUNK = 450;
  const commitRefs = async (refs: DocumentReference[]) => {
    for (let i = 0; i < refs.length; i += CHUNK) {
      const batch = writeBatch(db);
      refs.slice(i, i + CHUNK).forEach((ref) => batch.update(ref, { writerGrade: grade }));
      await batch.commit();
    }
  };

  const postsSnapshot = await getDocs(
    query(collection(db, 'posts'), where('writerUid', '==', targetUid))
  );
  const commentsSnapshot = await getDocs(
    query(collection(db, 'comments'), where('writerUid', '==', targetUid))
  );
  await commitRefs(postsSnapshot.docs.map((d) => d.ref));
  await commitRefs(commentsSnapshot.docs.map((d) => d.ref));
}

/** 너래 등급 부여 — 관리자 패널과 동일하게 users.grade + 게시물 writerGrade 반영 */
export async function assignGradeBattleMemberGrade(params: {
  postId: string;
  writerUid: string;
  gradeEmoji: string;
}): Promise<void> {
  const { postId, writerUid, gradeEmoji } = params;
  await updateDoc(doc(db, 'users', writerUid), { grade: gradeEmoji });
  await syncUserGradeInDocuments(writerUid, gradeEmoji);
  await updateDoc(doc(db, 'posts', postId), {
    status: GRADE_BATTLE_STATUS_ASSIGNED,
    assignedMemberGrade: gradeEmoji,
    gradeBattleAssignedAt: serverTimestamp(),
    statusUpdatedAt: serverTimestamp(),
  });
}
