import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ROLE_SYSTEM, SUPER_ADMIN_NICKNAMES } from '../components/AdminTypes';

/** blockingRules 컬렉션 내 설정 전용 문서 (기존 규칙과 동일한 읽기/쓰기 권한) */
export const PRACTICE_ROOM_SETTINGS_RULE_ID = '__practiceRoomSettings__';

export interface PracticeRoomSettings {
  blockSameDayBooking: boolean;
  updatedAt?: unknown;
  updatedBy?: string;
}

export const DEFAULT_PRACTICE_ROOM_SETTINGS: PracticeRoomSettings = {
  blockSameDayBooking: true,
};

export const SAME_DAY_BOOKING_BLOCK_REASON =
  '당일 예약은 불가합니다. 내일 이후 날짜를 선택해 주세요.';

export type PracticeRoomPrivilegedUser = {
  nickname?: string;
  role?: string;
} | null | undefined;

const getPracticeRoomSettingsRef = () =>
  doc(db, 'blockingRules', PRACTICE_ROOM_SETTINGS_RULE_ID);

export const isPracticeRoomSettingsDoc = (docId: string, data?: Record<string, unknown>) =>
  docId === PRACTICE_ROOM_SETTINGS_RULE_ID || data?.type === 'practiceRoomSettings';

const parsePracticeRoomSettings = (
  data: Record<string, unknown> | undefined
): PracticeRoomSettings => ({
  blockSameDayBooking: data?.blockSameDayBooking !== false,
  updatedAt: data?.updatedAt,
  updatedBy: typeof data?.updatedBy === 'string' ? data.updatedBy : undefined,
});

export const loadPracticeRoomSettings = async (): Promise<PracticeRoomSettings> => {
  const snap = await getDoc(getPracticeRoomSettingsRef());
  if (!snap.exists()) return DEFAULT_PRACTICE_ROOM_SETTINGS;
  return parsePracticeRoomSettings(snap.data() as Record<string, unknown>);
};

export const subscribePracticeRoomSettings = (
  callback: (settings: PracticeRoomSettings) => void
) =>
  onSnapshot(
    getPracticeRoomSettingsRef(),
    (snap) => {
      if (!snap.exists()) {
        callback(DEFAULT_PRACTICE_ROOM_SETTINGS);
        return;
      }
      callback(parsePracticeRoomSettings(snap.data() as Record<string, unknown>));
    },
    () => {
      callback(DEFAULT_PRACTICE_ROOM_SETTINGS);
    }
  );

export const savePracticeRoomSettings = async (
  settings: Pick<PracticeRoomSettings, 'blockSameDayBooking'>,
  updatedBy: string
) => {
  await setDoc(
    getPracticeRoomSettingsRef(),
    {
      type: 'practiceRoomSettings',
      ...settings,
      updatedAt: serverTimestamp(),
      updatedBy,
    },
    { merge: true }
  );
};

/** 당일 예약 제한 예외: 너래, 리더 */
export const canBypassSameDayBookingBlock = (
  user: PracticeRoomPrivilegedUser
): boolean => {
  if (!user) return false;
  if (user.nickname && SUPER_ADMIN_NICKNAMES.includes(user.nickname)) return true;
  return user.role === ROLE_SYSTEM.LEADER;
};

export const formatPracticeRoomDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isSameCalendarDay = (a: Date, b: Date): boolean =>
  formatPracticeRoomDate(a) === formatPracticeRoomDate(b);

export const isSameDayBookingRestricted = (
  date: Date,
  settings: PracticeRoomSettings,
  user: PracticeRoomPrivilegedUser
): boolean => {
  if (!settings.blockSameDayBooking) return false;
  if (canBypassSameDayBookingBlock(user)) return false;
  return isSameCalendarDay(date, new Date());
};
