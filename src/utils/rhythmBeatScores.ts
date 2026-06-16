import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { GamePlatform } from './gamePlatform';

export const MAX_RHYTHM_ERROR_MS = 300;

/** 평균 오차(ms) → 정확도(%) — 게임·저장 로직 공통 */
export const calcRhythmAccuracy = (avgErrorMs: number): number =>
  Math.round(Math.max(0, 100 - (avgErrorMs / MAX_RHYTHM_ERROR_MS) * 100) * 10) / 10;

export interface RhythmBeatBestScore {
  id: string;
  uid: string;
  nickname: string;
  accuracy: number;
  durationMs: number;
  bpm: number;
  platform: GamePlatform;
  attemptCount: number;
  updatedAt?: { seconds: number };
}

export const getRhythmBeatBestScoreDocId = (uid: string, platform: GamePlatform): string =>
  `${uid}_${platform}`;

/** 정확도는 높을수록 우수 */
export const isBetterRhythmScore = (
  next: { accuracy: number; durationMs: number },
  prev: { accuracy: number; durationMs: number }
): boolean => {
  if (next.accuracy !== prev.accuracy) return next.accuracy > prev.accuracy;
  return next.durationMs < prev.durationMs;
};

export type SaveRhythmBeatBestResult = {
  saved: boolean;
  isNewBest: boolean;
  attemptCount: number;
  bestAccuracy: number;
  bestAvgErrorMs: number;
};

export const saveRhythmBeatBestScore = async (params: {
  uid: string;
  nickname: string;
  accuracy: number;
  avgErrorMs: number;
  bpm: number;
  platform: GamePlatform;
}): Promise<SaveRhythmBeatBestResult> => {
  if (params.accuracy < 0 || params.accuracy > 100) {
    throw new Error('정확도가 유효하지 않습니다.');
  }
  if (params.avgErrorMs < 0 || params.avgErrorMs > MAX_RHYTHM_ERROR_MS) {
    throw new Error('오차가 유효하지 않습니다.');
  }

  const expectedAccuracy = calcRhythmAccuracy(params.avgErrorMs);
  if (Math.abs(params.accuracy - expectedAccuracy) > 0.15) {
    throw new Error('정확도와 오차가 일치하지 않습니다.');
  }

  const ref = doc(
    db,
    'games',
    'rhythmBeat',
    'bestScores',
    getRhythmBeatBestScoreDocId(params.uid, params.platform)
  );

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);

    if (!snap.exists()) {
      transaction.set(ref, {
        uid: params.uid,
        nickname: params.nickname,
        accuracy: params.accuracy,
        durationMs: params.avgErrorMs,
        bpm: params.bpm,
        platform: params.platform,
        attemptCount: 1,
        updatedAt: serverTimestamp(),
      });
      return {
        saved: true,
        isNewBest: true,
        attemptCount: 1,
        bestAccuracy: params.accuracy,
        bestAvgErrorMs: params.avgErrorMs,
      };
    }

    const existing = snap.data();
    const prevAttempts = Number(existing.attemptCount) || 0;
    const attemptCount = prevAttempts + 1;
    const prevAccuracy = Number(existing.accuracy);
    const prevAvgErrorMs = Number(existing.durationMs);
    const isNewBest = isBetterRhythmScore(
      { accuracy: params.accuracy, durationMs: params.avgErrorMs },
      { accuracy: prevAccuracy, durationMs: prevAvgErrorMs }
    );

    if (isNewBest) {
      transaction.update(ref, {
        nickname: params.nickname,
        accuracy: params.accuracy,
        durationMs: params.avgErrorMs,
        bpm: params.bpm,
        attemptCount,
        updatedAt: serverTimestamp(),
      });
      return {
        saved: true,
        isNewBest: true,
        attemptCount,
        bestAccuracy: params.accuracy,
        bestAvgErrorMs: params.avgErrorMs,
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
      bestAccuracy: prevAccuracy,
      bestAvgErrorMs: prevAvgErrorMs,
    };
  });
};
