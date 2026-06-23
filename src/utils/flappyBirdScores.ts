import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { GamePlatform } from './gamePlatform';
import {
  MAX_REPLAY_POINTS,
  type FlappyReplayPoint,
  parseReplay,
} from './flappyBirdReplay';

/** 파이프 통과 수 상한 (치트 방지) */
export const MAX_FLAPPY_SCORE = 9999;

export interface FlappyBirdBestScore {
  id: string;
  uid: string;
  nickname: string;
  /** 통과한 파이프 수 (높을수록 좋음) */
  durationMs: number;
  platform: GamePlatform;
  attemptCount: number;
  /** 최고 기록 달성 시 플레이 경로 */
  replay?: FlappyReplayPoint[];
  /** 마지막 플레이 점수 (매 판 갱신) */
  lastRunScore?: number;
  /** 마지막 플레이 경로 */
  lastRunReplay?: FlappyReplayPoint[];
  updatedAt?: { seconds: number };
}

export { parseReplay };

export const getFlappyBirdBestScoreDocId = (uid: string, platform: GamePlatform): string =>
  `${uid}_${platform}`;

/** 점수가 높을수록 우수 */
export const isBetterFlappyScore = (
  next: { durationMs: number },
  prev: { durationMs: number }
): boolean => next.durationMs > prev.durationMs;

export type SaveFlappyBirdBestResult = {
  saved: boolean;
  isNewBest: boolean;
  attemptCount: number;
  bestScore: number;
  lastRunScore: number;
};

const normalizeReplay = (replay?: FlappyReplayPoint[]): FlappyReplayPoint[] | undefined => {
  if (!replay || replay.length < 2) return undefined;
  return replay.slice(0, MAX_REPLAY_POINTS);
};

export const saveFlappyBirdBestScore = async (params: {
  uid: string;
  nickname: string;
  score: number;
  platform: GamePlatform;
  replay?: FlappyReplayPoint[];
}): Promise<SaveFlappyBirdBestResult> => {
  if (params.score < 0) {
    throw new Error('점수가 유효하지 않습니다.');
  }
  if (params.score > MAX_FLAPPY_SCORE) {
    throw new Error('점수가 너무 높습니다.');
  }

  const lastRunReplay = normalizeReplay(params.replay);
  const bestReplay = lastRunReplay;

  const ref = doc(
    db,
    'games',
    'flappyBird',
    'bestScores',
    getFlappyBirdBestScoreDocId(params.uid, params.platform)
  );

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);

    const runFields = {
      lastRunScore: params.score,
      ...(lastRunReplay ? { lastRunReplay } : {}),
    };

    if (!snap.exists()) {
      transaction.set(ref, {
        uid: params.uid,
        nickname: params.nickname,
        durationMs: params.score,
        platform: params.platform,
        attemptCount: 1,
        ...runFields,
        ...(bestReplay ? { replay: bestReplay } : {}),
        updatedAt: serverTimestamp(),
      });
      return {
        saved: true,
        isNewBest: true,
        attemptCount: 1,
        bestScore: params.score,
        lastRunScore: params.score,
      };
    }

    const existing = snap.data();
    const prevAttempts = Number(existing.attemptCount) || 0;
    const attemptCount = prevAttempts + 1;
    const prevScore = Number(existing.durationMs) || 0;
    const isNewBest = isBetterFlappyScore(
      { durationMs: params.score },
      { durationMs: prevScore }
    );

    if (isNewBest) {
      transaction.update(ref, {
        nickname: params.nickname,
        durationMs: params.score,
        attemptCount,
        ...runFields,
        ...(bestReplay ? { replay: bestReplay } : {}),
        updatedAt: serverTimestamp(),
      });
      return {
        saved: true,
        isNewBest: true,
        attemptCount,
        bestScore: params.score,
        lastRunScore: params.score,
      };
    }

    transaction.update(ref, {
      nickname: params.nickname,
      attemptCount,
      ...runFields,
      updatedAt: serverTimestamp(),
    });
    return {
      saved: true,
      isNewBest: false,
      attemptCount,
      bestScore: prevScore,
      lastRunScore: params.score,
    };
  });
};
