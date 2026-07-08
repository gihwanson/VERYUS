import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface PracticeRoomAlwaysOpenSettings {
  enabled: boolean;
  startDate: string;
  endDate: string;
  updatedBy?: string;
  updatedAt?: unknown;
}

export const ALWAYS_OPEN_DOC_ID = 'alwaysOpen';
export const ALWAYS_OPEN_COLLECTION = 'practiceRoomSettings';

export function formatDateYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isDateInAlwaysOpenPeriod(
  date: Date | string,
  settings: PracticeRoomAlwaysOpenSettings | null | undefined
): boolean {
  if (!settings?.enabled || !settings.startDate || !settings.endDate) return false;
  const dateStr = typeof date === 'string' ? date : formatDateYmd(date);
  return dateStr >= settings.startDate && dateStr <= settings.endDate;
}

export async function loadPracticeRoomAlwaysOpenSettings(): Promise<PracticeRoomAlwaysOpenSettings | null> {
  const snap = await getDoc(doc(db, ALWAYS_OPEN_COLLECTION, ALWAYS_OPEN_DOC_ID));
  if (!snap.exists()) return null;
  const data = snap.data() as PracticeRoomAlwaysOpenSettings;
  if (!data.startDate || !data.endDate) return null;
  return data;
}

export async function savePracticeRoomAlwaysOpenSettings(
  settings: PracticeRoomAlwaysOpenSettings,
  updatedBy: string
): Promise<void> {
  await setDoc(
    doc(db, ALWAYS_OPEN_COLLECTION, ALWAYS_OPEN_DOC_ID),
    {
      enabled: settings.enabled,
      startDate: settings.startDate,
      endDate: settings.endDate,
      updatedBy,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export const ALWAYS_OPEN_NOTICE = '상시개방입니다. 이 기간에는 예약 없이 자유롭게 이용해 주세요.';
