import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { GamePlatform } from './gamePlatform';

export interface EscapeRoomBestScore {
  id: string;
  uid: string;
  nickname: string;
  /** 순위용 점수 — 낮을수록 좋음 */
  durationMs: number;
  rankScore: number;
  clearTimeSec: number;
  hintsUsed: number;
  wrongAttempts: number;
  grade: string;
  platform: GamePlatform;
  attemptCount: number;
  updatedAt?: { seconds: number };
}

export const getEscapeRoomBestScoreDocId = (uid: string, platform: GamePlatform): string =>
  `${uid}_${platform}`;

export const isBetterEscapeScore = (
  next: { rankScore: number },
  prev: { rankScore: number }
): boolean => next.rankScore < prev.rankScore;

export type SaveEscapeRoomBestResult = {
  saved: boolean;
  isNewBest: boolean;
  attemptCount: number;
  bestRankScore: number;
};

export const saveEscapeRoomBestScore = async (params: {
  uid: string;
  nickname: string;
  rankScore: number;
  clearTimeSec: number;
  hintsUsed: number;
  wrongAttempts: number;
  grade: string;
  platform: GamePlatform;
}): Promise<SaveEscapeRoomBestResult> => {
  if (params.rankScore < 0 || params.rankScore > 9_999_999) {
    throw new Error('점수가 유효하지 않습니다.');
  }

  const ref = doc(
    db,
    'games',
    'escapeRoom',
    'bestScores',
    getEscapeRoomBestScoreDocId(params.uid, params.platform)
  );

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);

    if (!snap.exists()) {
      transaction.set(ref, {
        uid: params.uid,
        nickname: params.nickname,
        durationMs: params.rankScore,
        rankScore: params.rankScore,
        clearTimeSec: params.clearTimeSec,
        hintsUsed: params.hintsUsed,
        wrongAttempts: params.wrongAttempts,
        grade: params.grade,
        platform: params.platform,
        attemptCount: 1,
        updatedAt: serverTimestamp(),
      });
      return {
        saved: true,
        isNewBest: true,
        attemptCount: 1,
        bestRankScore: params.rankScore,
      };
    }

    const existing = snap.data();
    const prevAttempts = Number(existing.attemptCount) || 0;
    const attemptCount = prevAttempts + 1;
    const prevRankScore = Number(existing.rankScore ?? existing.durationMs);
    const isNewBest = isBetterEscapeScore(
      { rankScore: params.rankScore },
      { rankScore: prevRankScore }
    );

    if (isNewBest) {
      transaction.update(ref, {
        nickname: params.nickname,
        durationMs: params.rankScore,
        rankScore: params.rankScore,
        clearTimeSec: params.clearTimeSec,
        hintsUsed: params.hintsUsed,
        wrongAttempts: params.wrongAttempts,
        grade: params.grade,
        attemptCount,
        updatedAt: serverTimestamp(),
      });
      return {
        saved: true,
        isNewBest: true,
        attemptCount,
        bestRankScore: params.rankScore,
      };
    }

    transaction.update(ref, {
      nickname: params.nickname,
      attemptCount,
      updatedAt: serverTimestamp(),
    });
    return {
      saved: true,
      isNewBest: false,
      attemptCount,
      bestRankScore: prevRankScore,
    };
  });
};
