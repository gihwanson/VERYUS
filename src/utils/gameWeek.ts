export const GAME_WEEKLY_RESET_NOTICE =
  '모든 순위는 1주일 뒤 초기화됩니다. (매주 월요일 00시)';

const KST = 'Asia/Seoul';

type KstParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
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

export const getKstParts = (date = new Date()): KstParts => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    dayOfWeek: WEEKDAY_MAP[get('weekday')] ?? 0,
  };
};

/** KST 기준 날짜·시각을 UTC Date로 변환 */
export const kstToUtcDate = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): Date => new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0));

export const formatWeekKey = (mondayUtc: Date): string => {
  const kst = getKstParts(mondayUtc);
  const y = kst.year;
  const m = String(kst.month).padStart(2, '0');
  const d = String(kst.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** 다음 월요일 00:00 (KST) */
export const getNextMondayResetAtKst = (from = new Date()): Date => {
  const kst = getKstParts(from);
  const daysFromMonday = (kst.dayOfWeek + 6) % 7;
  const mondayDay = kst.day - daysFromMonday;
  let mondayMs = kstToUtcDate(kst.year, kst.month, mondayDay, 0, 0).getTime();

  if (from.getTime() >= mondayMs) {
    mondayMs += 7 * 24 * 60 * 60 * 1000;
  }
  return new Date(mondayMs);
};

export const formatWeekRangeLabel = (weekKey: string): string => {
  const [y, m, d] = weekKey.split('-').map(Number);
  if (!y || !m || !d) return weekKey;

  const start = kstToUtcDate(y, m, d);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const endKst = getKstParts(end);
  return `${m}/${d} ~ ${endKst.month}/${endKst.day}`;
};

export const formatNextResetLabel = (nextReset: Date): string => {
  const kst = getKstParts(nextReset);
  return `${kst.month}월 ${kst.day}일(월) 00:00`;
};
