import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { GamePlatform } from './gamePlatform';

/** 비정상적으로 빠른 기록(선반응·치트) 방지 */
export const MIN_REACTION_MS = 100;

/** 초록 신호 후 유효 반응 상한 */
export const MAX_REACTION_MS = 15000;

export interface ReactionBestScore {
  id: string;
  uid: string;
  nickname: string;
  durationMs: number;
  platform: GamePlatform;
  attemptCount: number;
  updatedAt?: { seconds: number };
}

export const getReactionBestScoreDocId = (uid: string, platform: GamePlatform): string =>
  `${uid}_${platform}`;

/** 반응속도는 짧을수록 우수 */
export const isBetterReactionScore = (
  next: { durationMs: number },
  prev: { durationMs: number }
): boolean => next.durationMs < prev.durationMs;

export type SaveReactionBestResult = {
  saved: boolean;
  isNewBest: boolean;
  attemptCount: number;
  bestDurationMs: number;
};

export const saveReactionBestScore = async (params: {
  uid: string;
  nickname: string;
  durationMs: number;
  platform: GamePlatform;
}): Promise<SaveReactionBestResult> => {
  if (params.durationMs < MIN_REACTION_MS) {
    throw new Error(`기록이 너무 빠릅니다. (최소 ${MIN_REACTION_MS}ms)`);
  }
  if (params.durationMs > MAX_REACTION_MS) {
    throw new Error('반응 시간이 너무 깁니다.');
  }

  const ref = doc(
    db,
    'games',
    'reactionTime',
    'bestScores',
    getReactionBestScoreDocId(params.uid, params.platform)
  );

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);

    if (!snap.exists()) {
      transaction.set(ref, {
        uid: params.uid,
        nickname: params.nickname,
        durationMs: params.durationMs,
        platform: params.platform,
        attemptCount: 1,
        updatedAt: serverTimestamp(),
      });
      return {
        saved: true,
        isNewBest: true,
        attemptCount: 1,
        bestDurationMs: params.durationMs,
      };
    }

    const existing = snap.data();
    const prevAttempts = Number(existing.attemptCount) || 0;
    const attemptCount = prevAttempts + 1;
    const prevDurationMs = Number(existing.durationMs);
    const isNewBest = isBetterReactionScore(
      { durationMs: params.durationMs },
      { durationMs: prevDurationMs }
    );

    if (isNewBest) {
      transaction.update(ref, {
        nickname: params.nickname,
        durationMs: params.durationMs,
        attemptCount,
        updatedAt: serverTimestamp(),
      });
      return {
        saved: true,
        isNewBest: true,
        attemptCount,
        bestDurationMs: params.durationMs,
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
      bestDurationMs: prevDurationMs,
    };
  });
};
