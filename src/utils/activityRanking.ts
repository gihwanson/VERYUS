import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export type ActivityRankEntry = {
  uid: string;
  nickname: string;
  grade?: string;
  role?: string;
  score: number;
  rank: number;
};

export type ScoreWeights = {
  post: number;
  comment: number;
  lurking: number;
};

export const DEFAULT_ACTIVITY_WEIGHTS: ScoreWeights = {
  post: 10,
  comment: 5,
  lurking: 0.1,
};

type UserMap = Record<string, { nickname: string; grade?: string; role?: string }>;

const toSortedActivity = (counter: Map<string, number>, userMap: UserMap): ActivityRankEntry[] => {
  const sorted = Array.from(counter.entries())
    .map(([uid, score]) => ({
      uid,
      nickname: userMap[uid]?.nickname || '알 수 없음',
      grade: userMap[uid]?.grade,
      role: userMap[uid]?.role,
      score,
      rank: 0,
    }))
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, 'ko'));

  return sorted.map((entry, index) => ({ ...entry, rank: index + 1 }));
};

/** 명예의전당 종합 활동 순위와 동일한 산식 */
export async function fetchActivityRanking(): Promise<{
  ranking: ActivityRankEntry[];
  weights: ScoreWeights;
}> {
  const [usersSnap, postsSnap, commentsSnap, boardVisitsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'posts')),
    getDocs(collection(db, 'comments')),
    getDocs(collection(db, 'boardVisits')),
  ]);

  let settingData: Record<string, unknown> = {};
  try {
    const hallSettingSnap = await getDoc(doc(db, 'appSettings', 'hallOfFame'));
    settingData = hallSettingSnap.exists() ? (hallSettingSnap.data() as Record<string, unknown>) : {};
  } catch {
    // 기본 가중치 사용
  }

  const weights: ScoreWeights = {
    post: Number.isFinite(Number(settingData.postWeight))
      ? Number(settingData.postWeight)
      : DEFAULT_ACTIVITY_WEIGHTS.post,
    comment: Number.isFinite(Number(settingData.commentWeight))
      ? Number(settingData.commentWeight)
      : DEFAULT_ACTIVITY_WEIGHTS.comment,
    lurking: Number.isFinite(Number(settingData.lurkingWeight))
      ? Number(settingData.lurkingWeight)
      : DEFAULT_ACTIVITY_WEIGHTS.lurking,
  };

  const userMap: UserMap = {};
  usersSnap.forEach((userDoc) => {
    const data = userDoc.data() as Record<string, unknown>;
    userMap[userDoc.id] = {
      nickname: String(data.nickname || '').trim() || '알 수 없음',
      grade: data.grade as string | undefined,
      role: data.role as string | undefined,
    };
  });

  const postCounter = new Map<string, number>();
  const commentCounter = new Map<string, number>();
  const visitCounter = new Map<string, number>();

  postsSnap.forEach((postDoc) => {
    const data = postDoc.data() as Record<string, unknown>;
    const uid = String(data.writerUid || '').trim();
    if (!uid || !userMap[uid]) return;
    postCounter.set(uid, (postCounter.get(uid) || 0) + 1);
  });

  commentsSnap.forEach((commentDoc) => {
    const data = commentDoc.data() as Record<string, unknown>;
    if (data.isEvaluatorAliasComment === true) return;
    const wNick = String(data.writerNickname || '').trim();
    if (wNick === '평가자') return;
    const uid = String(data.writerUid || '').trim();
    if (!uid || !userMap[uid]) return;
    commentCounter.set(uid, (commentCounter.get(uid) || 0) + 1);
  });

  boardVisitsSnap.forEach((visitDoc) => {
    const data = visitDoc.data() as Record<string, unknown>;
    const uid = String(data.userId || visitDoc.id || '').trim();
    if (!uid || !userMap[uid]) return;
    const lurkingScore = Number(data.lurkingScore);
    if (Number.isFinite(lurkingScore) && lurkingScore > 0) {
      visitCounter.set(uid, Math.round(lurkingScore * 10) / 10);
      return;
    }
    const legacyVisitCount = Number(data.totalVisitCount);
    if (Number.isFinite(legacyVisitCount) && legacyVisitCount > 0) {
      visitCounter.set(uid, Math.round(legacyVisitCount * 10) / 10);
    }
  });

  const allUserIds = new Set<string>([
    ...postCounter.keys(),
    ...commentCounter.keys(),
    ...visitCounter.keys(),
  ]);

  const activityCounter = new Map<string, number>();
  allUserIds.forEach((uid) => {
    const total =
      (postCounter.get(uid) || 0) * weights.post +
      (commentCounter.get(uid) || 0) * weights.comment +
      (visitCounter.get(uid) || 0) * weights.lurking;
    activityCounter.set(uid, total);
  });

  return {
    ranking: toSortedActivity(activityCounter, userMap),
    weights,
  };
}

export function getActivityRankMap(ranking: ActivityRankEntry[]): Map<string, ActivityRankEntry> {
  return new Map(ranking.map((entry) => [entry.uid, entry]));
}
