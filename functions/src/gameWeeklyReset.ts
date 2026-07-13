import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

const KST = 'Asia/Seoul';
const GAME_IDS = ['typingSpeed', 'reactionTime', 'rhythmBeat', 'flappyBird', 'nunSalMi'] as const;
const PLATFORMS = ['pc', 'mobile'] as const;

type GameId = (typeof GAME_IDS)[number];
type Platform = (typeof PLATFORMS)[number];

type KstParts = {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
};

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const getKstParts = (date = new Date()): KstParts => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    dayOfWeek: WEEKDAY_MAP[get('weekday')] ?? 0,
  };
};

const kstToUtcDate = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));

const formatWeekKey = (mondayUtc: Date): string => {
  const kst = getKstParts(mondayUtc);
  const m = String(kst.month).padStart(2, '0');
  const d = String(kst.day).padStart(2, '0');
  return `${kst.year}-${m}-${d}`;
};

const formatWeekRangeLabel = (weekKey: string): string => {
  const [y, m, d] = weekKey.split('-').map(Number);
  if (!y || !m || !d) return weekKey;

  const start = kstToUtcDate(y, m, d);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const endKst = getKstParts(end);
  return `${m}/${d} ~ ${endKst.month}/${endKst.day}`;
};

/** 월요일 00시 초기화 시점에 방금 끝난 주의 월요일 키 */
const getEndedWeekMondayKey = (resetAt = new Date()): string => {
  const kst = getKstParts(resetAt);
  const daysFromMonday = (kst.dayOfWeek + 6) % 7;
  const mondayDay = kst.day - daysFromMonday;
  const currentWeekMonday = kstToUtcDate(kst.year, kst.month, mondayDay);
  const endedWeekMonday = new Date(currentWeekMonday);
  endedWeekMonday.setUTCDate(endedWeekMonday.getUTCDate() - 7);
  return formatWeekKey(endedWeekMonday);
};

const deleteCollectionInBatches = async (
  collectionRef: FirebaseFirestore.CollectionReference,
  batchSize = 400
) => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await collectionRef.limit(batchSize).get();
    if (snap.empty) return;
    const batch = admin.firestore().batch();
    snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  }
};

type ScoreDoc = FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;

const pickChampion = (gameId: GameId, docs: ScoreDoc[]): ScoreDoc | null => {
  if (docs.length === 0) return null;

  const sorted = [...docs].sort((a, b) => {
    const aData = a.data();
    const bData = b.data();
    const aDuration = Number(aData.durationMs) || 0;
    const bDuration = Number(bData.durationMs) || 0;

    if (gameId === 'typingSpeed') {
      const aCpm = Number(aData.cpm) || 0;
      const bCpm = Number(bData.cpm) || 0;
      if (bCpm !== aCpm) return bCpm - aCpm;
      return aDuration - bDuration;
    }

    if (gameId === 'rhythmBeat') {
      const aAccuracy = Number(aData.accuracy) || 0;
      const bAccuracy = Number(bData.accuracy) || 0;
      if (bAccuracy !== aAccuracy) return bAccuracy - aAccuracy;
      return aDuration - bDuration;
    }

    if (gameId === 'flappyBird') {
      return bDuration - aDuration;
    }

    return aDuration - bDuration;
  });

  return sorted[0] ?? null;
};

type PastChampionData = {
  platform?: string;
  weekKey?: string;
  durationMs?: number;
  cpm?: number;
  accuracy?: number;
};

const isBetterPastData = (
  gameId: GameId,
  a: PastChampionData,
  b: PastChampionData
): boolean => {
  const aDuration = Number(a.durationMs) || 0;
  const bDuration = Number(b.durationMs) || 0;
  if (gameId === 'typingSpeed') {
    const aCpm = Number(a.cpm) || 0;
    const bCpm = Number(b.cpm) || 0;
    if (aCpm !== bCpm) return aCpm > bCpm;
    return aDuration < bDuration;
  }
  if (gameId === 'rhythmBeat') {
    const aAcc = Number(a.accuracy) || 0;
    const bAcc = Number(b.accuracy) || 0;
    if (aAcc !== bAcc) return aAcc > bAcc;
    return aDuration < bDuration;
  }
  if (gameId === 'flappyBird') {
    return aDuration > bDuration;
  }
  return aDuration < bDuration;
};

/** 플랫폼별 역대 최고 + 최근 1건만 남기고 나머지 pastChampions 삭제 */
const prunePastChampions = async (gameId: GameId, platform: Platform) => {
  const db = admin.firestore();
  const snap = await db.collection(`games/${gameId}/pastChampions`).get();
  const docs = snap.docs.filter((d) => d.data().platform === platform);
  if (docs.length <= 2) return;

  const latest = [...docs].sort((a, b) =>
    String(b.data().weekKey || '').localeCompare(String(a.data().weekKey || ''))
  )[0];

  let best = docs[0];
  for (const doc of docs) {
    if (isBetterPastData(gameId, doc.data() as PastChampionData, best.data() as PastChampionData)) {
      best = doc;
    }
  }

  const keep = new Set([best.id, latest.id]);
  const toDelete = docs.filter((d) => !keep.has(d.id));
  if (toDelete.length === 0) return;

  let batch = db.batch();
  let ops = 0;
  for (const doc of toDelete) {
    batch.delete(doc.ref);
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  logger.info('과거최고기록 정리', {
    gameId,
    platform,
    kept: [...keep],
    deletedCount: toDelete.length,
  });
};

const archiveAndResetGame = async (gameId: GameId, weekKey: string) => {
  const db = admin.firestore();
  const bestScoresRef = db.collection(`games/${gameId}/bestScores`);
  const allScores = await bestScoresRef.get();

  if (allScores.empty) {
    logger.info('초기화할 기록 없음', { gameId, weekKey });
    return;
  }

  const [y, m, d] = weekKey.split('-').map(Number);
  const weekStartedAt = admin.firestore.Timestamp.fromDate(kstToUtcDate(y, m, d));
  const weekLabel = formatWeekRangeLabel(weekKey);

  for (const platform of PLATFORMS) {
    const platformDocs = allScores.docs.filter((doc) => doc.data().platform === platform);
    const championDoc = pickChampion(gameId, platformDocs);
    if (!championDoc) continue;

    const data = championDoc.data();
    const championRef = db.doc(`games/${gameId}/pastChampions/${weekKey}_${platform}`);
    const existing = await championRef.get();

    if (!existing.exists) {
      await championRef.set({
        uid: String(data.uid || ''),
        nickname: String(data.nickname || ''),
        platform,
        durationMs: Number(data.durationMs) || 0,
        ...(gameId === 'typingSpeed'
          ? {
              cpm: Number(data.cpm) || 0,
              sentence: String(data.sentence || ''),
            }
          : {}),
        ...(gameId === 'rhythmBeat'
          ? {
              accuracy: Number(data.accuracy) || 0,
              bpm: Number(data.bpm) || 0,
            }
          : {}),
        weekKey,
        weekLabel,
        weekStartedAt,
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        gameId,
      });
      logger.info('주간 1위 기록 보관', {
        gameId,
        platform,
        weekKey,
        uid: data.uid,
        nickname: data.nickname,
      });
    }

    await prunePastChampions(gameId, platform);
  }

  await deleteCollectionInBatches(bestScoresRef);
  logger.info('주간 순위 초기화 완료', { gameId, weekKey, deletedCount: allScores.size });

  if (gameId === 'typingSpeed') {
    const legacyScoresRef = db.collection(`games/${gameId}/scores`);
    await deleteCollectionInBatches(legacyScoresRef);
    await db.doc('games/typingSpeed/meta/legacyMigration').set(
      {
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastWeeklyResetWeekKey: weekKey,
      },
      { merge: true }
    );
    logger.info('레거시 타자 기록 정리 완료', { gameId, weekKey });
  }

  if (gameId === 'flappyBird') {
    const activeSessionsRef = db.collection(`games/${gameId}/activeSessions`);
    await deleteCollectionInBatches(activeSessionsRef);
    logger.info('플래피 버드 활성 세션 정리 완료', { gameId, weekKey });
  }
};

export const scheduledGameWeeklyReset = onSchedule(
  {
    schedule: '0 0 * * 1',
    timeZone: KST,
    region: 'asia-northeast3',
  },
  async () => {
    const weekKey = getEndedWeekMondayKey();
    logger.info('미니게임 주간 초기화 시작', { weekKey });

    for (const gameId of GAME_IDS) {
      try {
        await archiveAndResetGame(gameId, weekKey);
      } catch (error) {
        logger.error('미니게임 주간 초기화 실패', { gameId, weekKey, error });
      }
    }

    logger.info('미니게임 주간 초기화 종료', { weekKey });
  }
);
