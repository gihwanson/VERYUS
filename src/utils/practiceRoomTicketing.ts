import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getKstParts, kstToUtcDate } from './gameWeek';
import { ALWAYS_OPEN_COLLECTION } from './practiceRoomAlwaysOpen';

export const TICKETING_DOC_ID = 'ticketing';

export interface PracticeRoomTicketingSettings {
  enabled: boolean;
  /** YYYY-MM-DD — 이 날짜(KST)부터 티켓팅 정책 적용 */
  enabledFrom: string;
  /** 예약 오픈 요일 (0=일) */
  bookingDayOfWeek: number;
  /** 미예약 슬롯 자유 이용 */
  unbookedSlotsAlwaysOpen: boolean;
  updatedBy?: string;
  updatedAt?: unknown;
}

export const DEFAULT_TICKETING_SETTINGS: PracticeRoomTicketingSettings = {
  enabled: true,
  enabledFrom: '2026-08-30',
  bookingDayOfWeek: 0,
  unbookedSlotsAlwaysOpen: true,
};

export const TICKETING_BOOKING_NOTICE =
  '이용할 주(월~일)의 바로 전날 일요일 하루만 예약할 수 있습니다. (금·토 예약 불가)';
export const TICKETING_WALKIN_NOTICE =
  '예약이 없는 시간입니다. 예약 없이 자유롭게 이용해 주세요.';
export const TICKETING_NON_BOOKABLE_NOTICE = '금요일, 토요일은 예약할 수 없습니다.';

/** 티켓팅 적용 시 예약 불가 요일 (0=일 … 5=금, 6=토) */
export const TICKETING_NON_BOOKABLE_WEEKDAYS = [5, 6];

export function getKstWeekdayForDateStr(targetDateStr: string): number {
  const [year, month, day] = targetDateStr.split('-').map(Number);
  return getKstParts(kstToUtcDate(year, month, day)).dayOfWeek;
}

export function isTicketingNonBookableWeekday(targetDateStr: string): boolean {
  return TICKETING_NON_BOOKABLE_WEEKDAYS.includes(getKstWeekdayForDateStr(targetDateStr));
}

export function formatDateYmdKst(date: Date): string {
  const kst = getKstParts(date);
  const month = String(kst.month).padStart(2, '0');
  const day = String(kst.day).padStart(2, '0');
  return `${kst.year}-${month}-${day}`;
}

export function isTicketingPolicyActive(
  settings: PracticeRoomTicketingSettings | null | undefined,
  now = new Date()
): boolean {
  if (!settings?.enabled) return false;
  return formatDateYmdKst(now) >= settings.enabledFrom;
}

/** 이용 대상 날짜가 티켓팅 구간에 포함되는지 (오늘 날짜와 무관) */
export function isTargetDateUnderTicketing(
  targetDateStr: string,
  settings: PracticeRoomTicketingSettings | null | undefined
): boolean {
  if (!settings?.enabled) return false;
  return targetDateStr >= settings.enabledFrom;
}

/** 대상 날짜가 속한 이용 주(월~일) */
export function getBookableWeekRangeForDate(targetDateStr: string): { start: string; end: string } {
  const [year, month, day] = targetDateStr.split('-').map(Number);
  const kst = getKstParts(kstToUtcDate(year, month, day));
  const daysFromMonday = (kst.dayOfWeek + 6) % 7;
  const mondayDay = kst.day - daysFromMonday;
  return {
    start: formatDateYmdKst(kstToUtcDate(kst.year, kst.month, mondayDay)),
    end: formatDateYmdKst(kstToUtcDate(kst.year, kst.month, mondayDay + 6)),
  };
}

/** 이용 주의 예약 오픈일 = 그 주 월요일 바로 전날(일요일) */
export function getBookingSundayForTargetDate(targetDateStr: string): string {
  const { start: mondayStr } = getBookableWeekRangeForDate(targetDateStr);
  const [year, month, day] = mondayStr.split('-').map(Number);
  return formatDateYmdKst(kstToUtcDate(year, month, day - 1));
}

/** 오늘이 일요일일 때, 오늘 예약 가능한 이용 주(월~일) — 전날 일요일 → 다음날 월요일부터 7일 */
export function getBookableWeekRangeOnOpenSunday(now = new Date()): { start: string; end: string } {
  const kst = getKstParts(now);
  const mondayUtc = kstToUtcDate(kst.year, kst.month, kst.day + 1);
  const sundayUtc = kstToUtcDate(kst.year, kst.month, kst.day + 7);
  return {
    start: formatDateYmdKst(mondayUtc),
    end: formatDateYmdKst(sundayUtc),
  };
}

/** 대상 날짜가 속한 주의 월요일 00:00 KST (UTC ms) */
export function getTargetWeekMondayStartMs(targetDateStr: string): number {
  const { start } = getBookableWeekRangeForDate(targetDateStr);
  const [year, month, day] = start.split('-').map(Number);
  return kstToUtcDate(year, month, day, 0, 0).getTime();
}

export function isBookingWindowOpen(
  settings: PracticeRoomTicketingSettings | null | undefined,
  now = new Date()
): boolean {
  if (!isTicketingPolicyActive(settings, now)) return false;
  const kst = getKstParts(now);
  return kst.dayOfWeek === (settings?.bookingDayOfWeek ?? 0);
}

export function canBookDateUnderTicketing(
  targetDateStr: string,
  settings: PracticeRoomTicketingSettings | null | undefined,
  now = new Date(),
  isPrivileged = false
): { allowed: boolean; reason?: string } {
  if (isPrivileged) return { allowed: true };
  if (!settings?.enabled) return { allowed: true };
  if (!isTargetDateUnderTicketing(targetDateStr, settings)) return { allowed: true };

  if (isTicketingNonBookableWeekday(targetDateStr)) {
    return {
      allowed: false,
      reason: TICKETING_NON_BOOKABLE_NOTICE,
    };
  }

  const today = formatDateYmdKst(now);
  const bookingSunday = getBookingSundayForTargetDate(targetDateStr);
  const weekRange = getBookableWeekRangeForDate(targetDateStr);

  if (today === bookingSunday) {
    return { allowed: true };
  }

  if (today < bookingSunday) {
    return {
      allowed: false,
      reason: `${bookingSunday}(일)에 ${weekRange.start}~${weekRange.end} 예약이 열립니다.`,
    };
  }

  return {
    allowed: false,
    reason: `${weekRange.start}~${weekRange.end} 예약은 ${bookingSunday}(일) 하루만 가능합니다.`,
  };
}

export function isUnbookedSlotWalkInOpen(
  targetDateStr: string,
  hasReservation: boolean,
  settings: PracticeRoomTicketingSettings | null | undefined,
  now = new Date()
): boolean {
  if (!settings?.unbookedSlotsAlwaysOpen) return false;
  if (!isTicketingPolicyActive(settings, now)) return false;
  if (targetDateStr < settings.enabledFrom) return false;
  if (hasReservation) return false;
  if (isTicketingNonBookableWeekday(targetDateStr)) return false;

  const weekMondayMs = getTargetWeekMondayStartMs(targetDateStr);
  return now.getTime() >= weekMondayMs;
}

export function getTicketingStatusMessage(
  settings: PracticeRoomTicketingSettings | null | undefined,
  now = new Date()
): string | null {
  if (!settings?.enabled) return null;

  const today = formatDateYmdKst(now);
  if (today < settings.enabledFrom) {
    return `🎫 ${settings.enabledFrom}부터 티켓팅 시작. ${TICKETING_BOOKING_NOTICE}`;
  }

  if (isBookingWindowOpen(settings, now)) {
    const { start, end } = getBookableWeekRangeOnOpenSunday(now);
    const today = formatDateYmdKst(now);
    return `🎫 오늘(${today})만 예약 가능! ${start}(월)~${end}(일) 중 월~목, 일 연습실을 예약하세요. (금·토 제외)`;
  }

  return `🎫 ${TICKETING_BOOKING_NOTICE}`;
}

export function parseYmdToLocalDate(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export async function loadPracticeRoomTicketingSettings(): Promise<PracticeRoomTicketingSettings | null> {
  const snap = await getDoc(doc(db, ALWAYS_OPEN_COLLECTION, TICKETING_DOC_ID));
  if (!snap.exists()) {
    return { ...DEFAULT_TICKETING_SETTINGS };
  }
  const data = snap.data() as PracticeRoomTicketingSettings;
  return {
    enabled: Boolean(data.enabled),
    enabledFrom: String(data.enabledFrom || DEFAULT_TICKETING_SETTINGS.enabledFrom),
    bookingDayOfWeek: Number(data.bookingDayOfWeek ?? 0),
    unbookedSlotsAlwaysOpen: data.unbookedSlotsAlwaysOpen !== false,
    updatedBy: data.updatedBy,
    updatedAt: data.updatedAt,
  };
}

export async function savePracticeRoomTicketingSettings(
  settings: PracticeRoomTicketingSettings,
  updatedBy: string
): Promise<void> {
  await setDoc(
    doc(db, ALWAYS_OPEN_COLLECTION, TICKETING_DOC_ID),
    {
      enabled: settings.enabled,
      enabledFrom: settings.enabledFrom,
      bookingDayOfWeek: settings.bookingDayOfWeek,
      unbookedSlotsAlwaysOpen: settings.unbookedSlotsAlwaysOpen,
      updatedBy,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
