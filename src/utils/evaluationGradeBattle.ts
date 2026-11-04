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
import { pickApplyContestMean } from './contestGrade';
import {
  commentsFromContestGrades,
  saveContestGradeHistory,
} from './contestGradeHistory';
import {
  buildContestAggregationContext,
  type ContestGradeRecord,
} from './contestGradesAggregation';
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

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 올린 날의 자정부터 GRADE_BATTLE_DAYS번째 자정. 23시에 올려도 다음 자정에 하루가 줄어든다. */
function addLocalCalendarDays(ms: number, days: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

export function computeGradeBattleEndsAt(fromMs = Date.now()): Date {
  return new Date(addLocalCalendarDays(fromMs, GRADE_BATTLE_DAYS));
}

export function getGradeBattleDeadlineMs(post: GradeBattlePostLike, now = Date.now()): number {
  const created = getEvaluationCreatedAtMs(post.createdAt);
  if (created) return addLocalCalendarDays(created, GRADE_BATTLE_DAYS);
  const ends = getEvaluationCreatedAtMs(post.gradeBattleEndsAt);
  if (ends) return startOfLocalDay(ends);
  return addLocalCalendarDays(now, GRADE_BATTLE_DAYS);
}

export function getGradeBattleDaysLeft(post: GradeBattlePostLike, now = Date.now()): number | null {
  if (post.category !== GRADE_BATTLE_CATEGORY) return null;
  if (post.status && post.status !== '대기') return null;
  const deadline = getGradeBattleDeadlineMs(post, now);
  if (now >= deadline) return 0;
  const days = Math.round((startOfLocalDay(deadline) - startOfLocalDay(now)) / (24 * 60 * 60 * 1000));
  return Math.max(0, days);
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

/** 평가게시판 등급전 기록. 콘테스트 순위 조회와 구분한다. */
export function evaluationGradeHistoryId(postId: string): string {
  return `evaluation-${postId}`;
}

/**
 * 콘테스트 결과보기 반영하기와 같이, 전체·중심 평균 중 더 낮은 점수와
 * 멤버 코멘트를 마이페이지 등급전 기록에 남긴다.
 */
async function saveGradeBattleHistory(params: {
  postId: string;
  writerUid: string;
  writerNickname: string;
  postTitle: string;
  gradeEmoji: string;
}): Promise<void> {
  const scoresSnap = await getDocs(gradeBattleScoresCollection(params.postId));
  const grades = scoresSnap.docs.map((d) => d.data() as ContestGradeRecord);
  const aggregation = buildContestAggregationContext(grades);
  const targetKey =
    aggregation.byTarget[params.writerNickname]
      ? params.writerNickname
      : Object.keys(aggregation.byTarget)[0];
  const stats = targetKey ? aggregation.byTarget[targetKey] : undefined;
  const applyScore = stats
    ? pickApplyContestMean(stats.overallMean, stats.clusterMean)
    : null;
  await saveContestGradeHistory(params.writerUid, {
    contestId: evaluationGradeHistoryId(params.postId),
    contestTitle: params.postTitle.trim() || '등급전',
    contestType: '경연',
    appliedGrade: params.gradeEmoji,
    appliedScore: applyScore,
    overallMean: stats?.overallMean ?? null,
    clusterMean: stats?.clusterMean ?? null,
    comments: commentsFromContestGrades(grades, targetKey || params.writerNickname),
    targetLabel: params.writerNickname,
    rank: null,
    rankedCount: null,
  });
}

/** 너래 등급 부여 — 회원 등급과 마이페이지 등급전 기록을 함께 반영 */
export async function assignGradeBattleMemberGrade(params: {
  postId: string;
  writerUid: string;
  writerNickname: string;
  postTitle: string;
  gradeEmoji: string;
}): Promise<void> {
  const { postId, writerUid, gradeEmoji } = params;
  await updateDoc(doc(db, 'users', writerUid), { grade: gradeEmoji });
  await syncUserGradeInDocuments(writerUid, gradeEmoji);
  await saveGradeBattleHistory(params);
  await updateDoc(doc(db, 'posts', postId), {
    status: GRADE_BATTLE_STATUS_ASSIGNED,
    assignedMemberGrade: gradeEmoji,
    gradeBattleAssignedAt: serverTimestamp(),
    statusUpdatedAt: serverTimestamp(),
  });
}
