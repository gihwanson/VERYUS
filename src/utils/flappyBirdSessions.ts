import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { GamePlatform } from './gamePlatform';

export interface FlappyActiveSession {
  id: string;
  uid: string;
  nickname: string;
  platform: GamePlatform;
  score: number;
  birdY: number;
  elapsedMs: number;
  personalBest: number;
  updatedAt?: { seconds: number };
}

export const getFlappyActiveSessionDocId = (uid: string, platform: GamePlatform): string =>
  `${uid}_${platform}`;

const sessionRef = (uid: string, platform: GamePlatform) =>
  doc(db, 'games', 'flappyBird', 'activeSessions', getFlappyActiveSessionDocId(uid, platform));

export const upsertFlappyActiveSession = async (params: {
  uid: string;
  nickname: string;
  platform: GamePlatform;
  score: number;
  birdY: number;
  elapsedMs: number;
  personalBest: number;
}): Promise<void> => {
  await setDoc(
    sessionRef(params.uid, params.platform),
    {
      uid: params.uid,
      nickname: params.nickname,
      platform: params.platform,
      score: params.score,
      birdY: Math.round(params.birdY),
      elapsedMs: Math.round(params.elapsedMs),
      personalBest: params.personalBest,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const clearFlappyActiveSession = async (
  uid: string,
  platform: GamePlatform
): Promise<void> => {
  try {
    await deleteDoc(sessionRef(uid, platform));
  } catch {
    /* ignore */
  }
};

/** 2분 이상 갱신 없는 세션은 표시하지 않음 */
export const isSessionFresh = (updatedAt?: { seconds: number }): boolean => {
  if (!updatedAt?.seconds) return true;
  return Date.now() - updatedAt.seconds * 1000 < 120_000;
};
