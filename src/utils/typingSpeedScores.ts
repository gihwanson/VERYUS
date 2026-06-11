import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { GamePlatform } from './gamePlatform';

const LEGACY_MIGRATION_KEY = 'typingSpeed_legacy_migrated';

/** 비정상적으로 짧은 기록(치트·버그) 방지 */
export const MIN_TYPING_DURATION_MS = 500;

export interface TypingBestScore {
  id: string;
  uid: string;
  nickname: string;
  durationMs: number;
  cpm: number;
  platform: GamePlatform;
  sentence: string;
  attemptCount: number;
  updatedAt?: { seconds: number };
}

export const getTypingBestScoreDocId = (uid: string, platform: GamePlatform): string =>
  `${uid}_${platform}`;

export const calcTypingCpm = (sentence: string, durationMs: number): number =>
  sentence.length > 0 ? Math.round((sentence.length / durationMs) * 60000) : 0;

/** CPM이 높을수록 우수. 동점이면 더 짧은 시간이 우선 */
export const isBetterTypingScore = (
  next: { cpm: number; durationMs: number },
  prev: { cpm: number; durationMs: number }
): boolean => {
  if (next.cpm !== prev.cpm) return next.cpm > prev.cpm;
  return next.durationMs < prev.durationMs;
};

export type SaveTypingBestResult = {
  saved: boolean;
  isNewBest: boolean;
  attemptCount: number;
  bestCpm: number;
  bestDurationMs: number;
};

export const saveTypingBestScore = async (params: {
  uid: string;
  nickname: string;
  durationMs: number;
  platform: GamePlatform;
  sentence: string;
}): Promise<SaveTypingBestResult> => {
  if (params.durationMs < MIN_TYPING_DURATION_MS) {
    throw new Error(`기록이 너무 빠릅니다. (최소 ${MIN_TYPING_DURATION_MS / 1000}초)`);
  }

  const cpm = calcTypingCpm(params.sentence, params.durationMs);

  const ref = doc(
    db,
    'games',
    'typingSpeed',
    'bestScores',
    getTypingBestScoreDocId(params.uid, params.platform)
  );

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);

    if (!snap.exists()) {
      transaction.set(ref, {
        uid: params.uid,
        nickname: params.nickname,
        durationMs: params.durationMs,
        cpm,
        platform: params.platform,
        sentence: params.sentence,
        attemptCount: 1,
        updatedAt: serverTimestamp(),
      });
      return {
        saved: true,
        isNewBest: true,
        attemptCount: 1,
        bestCpm: cpm,
        bestDurationMs: params.durationMs,
      };
    }

    const existing = snap.data();
    const prevAttempts = Number(existing.attemptCount) || 0;
    const attemptCount = prevAttempts + 1;
    const prevCpm = Number(existing.cpm) || 0;
    const prevDurationMs = Number(existing.durationMs);
    const isNewBest = isBetterTypingScore(
      { cpm, durationMs: params.durationMs },
      { cpm: prevCpm, durationMs: prevDurationMs }
    );

    if (isNewBest) {
      transaction.update(ref, {
        nickname: params.nickname,
        durationMs: params.durationMs,
        cpm,
        sentence: params.sentence,
        attemptCount,
        updatedAt: serverTimestamp(),
      });
      return {
        saved: true,
        isNewBest: true,
        attemptCount,
        bestCpm: cpm,
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
      bestCpm: prevCpm,
      bestDurationMs: prevDurationMs,
    };
  });
};

/** 예전 scores 컬렉션 → bestScores 1회 이전 (세션당 1번) */
export const migrateLegacyTypingScoresIfNeeded = async (): Promise<void> => {
  try {
    if (sessionStorage.getItem(LEGACY_MIGRATION_KEY) === '1') return;

    const legacySnap = await getDocs(collection(db, 'games', 'typingSpeed', 'scores'));
    if (legacySnap.empty) {
      sessionStorage.setItem(LEGACY_MIGRATION_KEY, '1');
      return;
    }

    type Agg = {
      uid: string;
      nickname: string;
      platform: GamePlatform;
      durationMs: number;
      cpm: number;
      sentence: string;
      count: number;
    };
    const agg = new Map<string, Agg>();

    legacySnap.docs.forEach((d) => {
      const data = d.data();
      if (!data.uid || (data.platform !== 'pc' && data.platform !== 'mobile')) return;
      if (typeof data.durationMs !== 'number' || data.durationMs < MIN_TYPING_DURATION_MS) return;

      const platform = data.platform as GamePlatform;
      const key = getTypingBestScoreDocId(data.uid, platform);
      const cur = agg.get(key);

      if (!cur) {
        agg.set(key, {
          uid: data.uid,
          nickname: String(data.nickname ?? ''),
          platform,
          durationMs: data.durationMs,
          cpm: Number(data.cpm) || 0,
          sentence: String(data.sentence ?? ''),
          count: 1,
        });
        return;
      }

      cur.count += 1;
      const dataCpm = Number(data.cpm) || calcTypingCpm(String(data.sentence ?? ''), data.durationMs);
      if (isBetterTypingScore(
        { cpm: dataCpm, durationMs: data.durationMs },
        { cpm: cur.cpm, durationMs: cur.durationMs }
      )) {
        cur.durationMs = data.durationMs;
        cur.cpm = dataCpm;
        cur.sentence = String(data.sentence ?? cur.sentence);
      }
      if (data.nickname) cur.nickname = String(data.nickname);
    });

    for (const [key, item] of agg) {
      const ref = doc(db, 'games', 'typingSpeed', 'bestScores', key);
      const existing = await getDoc(ref);

      if (!existing.exists()) {
        await setDoc(ref, {
          uid: item.uid,
          nickname: item.nickname,
          durationMs: item.durationMs,
          cpm: item.cpm,
          platform: item.platform,
          sentence: item.sentence,
          attemptCount: item.count,
          updatedAt: serverTimestamp(),
        });
        continue;
      }

      const ex = existing.data();
      const attemptCount = Math.max(Number(ex.attemptCount) || 0, item.count);
      const prevCpm = Number(ex.cpm) || 0;
      const prevDurationMs = Number(ex.durationMs);
      const isBetter = isBetterTypingScore(
        { cpm: item.cpm, durationMs: item.durationMs },
        { cpm: prevCpm, durationMs: prevDurationMs }
      );

      await setDoc(
        ref,
        {
          uid: item.uid,
          nickname: item.nickname || ex.nickname,
          platform: item.platform,
          attemptCount,
          ...(isBetter
            ? { durationMs: item.durationMs, cpm: item.cpm, sentence: item.sentence }
            : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    sessionStorage.setItem(LEGACY_MIGRATION_KEY, '1');
  } catch (e) {
    console.warn('레거시 타자 기록 이전 실패:', e);
  }
};
