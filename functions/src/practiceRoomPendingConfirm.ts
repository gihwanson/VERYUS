import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

const KST = 'Asia/Seoul';

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

const kstToUtcDate = (year: number, month: number, day: number, hour = 0): Date =>
  new Date(Date.UTC(year, month - 1, day, hour - 9, 0, 0, 0));

const formatYmd = (date: Date): string => {
  const kst = getKstParts(date);
  return `${kst.year}-${String(kst.month).padStart(2, '0')}-${String(kst.day).padStart(2, '0')}`;
};

const shouldConfirmPendingForDate = (dateYmd: string, now: Date): boolean => {
  const [y, m, d] = dateYmd.split('-').map(Number);
  if (!y || !m || !d) return false;
  const kst = getKstParts(kstToUtcDate(y, m, d));
  const daysFromMonday = (kst.dayOfWeek + 6) % 7;
  const mondayMs = kstToUtcDate(kst.year, kst.month, kst.day - daysFromMonday, 0).getTime();
  return now.getTime() >= mondayMs;
};

/**
 * 매주 월요일 00:00(KST) — 연습실 일요일 대기(pending) 예약을 confirmed로 전환
 */
export const scheduledPracticeRoomPendingConfirm = onSchedule(
  {
    schedule: '0 0 * * 1',
    timeZone: KST,
    region: 'asia-northeast3',
  },
  async () => {
    const now = new Date();
    const snap = await admin
      .firestore()
      .collection('practiceRoomReservations')
      .where('status', '==', 'pending')
      .get();

    if (snap.empty) {
      logger.info('연습실 pending 예약 없음', { at: formatYmd(now) });
      return;
    }

    let batch = admin.firestore().batch();
    let ops = 0;
    let confirmed = 0;

    for (const docSnap of snap.docs) {
      const dateStr = String(docSnap.data()?.date || '');
      if (!dateStr || !shouldConfirmPendingForDate(dateStr, now)) continue;
      batch.update(docSnap.ref, {
        status: 'confirmed',
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      ops += 1;
      confirmed += 1;
      if (ops >= 400) {
        await batch.commit();
        batch = admin.firestore().batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();
    logger.info('연습실 pending → confirmed 완료', { confirmed, at: formatYmd(now) });
  }
);
