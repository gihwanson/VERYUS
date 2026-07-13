import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { GamePlatform } from './gamePlatform';

/** 비정상적으로 빠른 기록 방지 (5라운드 합산) */
export const MIN_NUN_SAL_MI_MS = 1500;

/** 세션 유효 상한 (3분) */
export const MAX_NUN_SAL_MI_MS = 180000;

export interface NunSalMiBestScore {
  id: string;
  uid: string;
  nickname: string;
  durationMs: number;
  platform: GamePlatform;
  attemptCount: number;
  updatedAt?: { seconds: number };
}

export const getNunSalMiBestScoreDocId = (uid: string, platform: GamePlatform): string =>
  `${uid}_${platform}`;

/** 눈썰미는 총 시간이 짧을수록 우수 */
export const isBetterNunSalMiScore = (
  next: { durationMs: number },
  prev: { durationMs: number }
): boolean => next.durationMs < prev.durationMs;

export type SaveNunSalMiBestResult = {
  saved: boolean;
  isNewBest: boolean;
  attemptCount: number;
  bestDurationMs: number;
};

export const saveNunSalMiBestScore = async (params: {
  uid: string;
  nickname: string;
  durationMs: number;
  platform: GamePlatform;
}): Promise<SaveNunSalMiBestResult> => {
  if (params.durationMs < MIN_NUN_SAL_MI_MS) {
    throw new Error(`기록이 너무 빠릅니다. (최소 ${MIN_NUN_SAL_MI_MS}ms)`);
  }
  if (params.durationMs > MAX_NUN_SAL_MI_MS) {
    throw new Error('완료 시간이 너무 깁니다.');
  }

  const ref = doc(
    db,
    'games',
    'nunSalMi',
    'bestScores',
    getNunSalMiBestScoreDocId(params.uid, params.platform)
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
    const isNewBest = isBetterNunSalMiScore(
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
