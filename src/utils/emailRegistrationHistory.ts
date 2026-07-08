import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';

export const EMAIL_REGISTRATION_HISTORY_COLLECTION = 'emailRegistrationHistory';

export interface EmailRegistrationEntry {
  uid: string;
  nickname: string;
  registeredAt: unknown;
  deletedAt?: unknown;
  deletedBy?: string;
  status: 'active' | 'deleted';
}

export interface EmailRegistrationHistoryDoc {
  email: string;
  entries: EmailRegistrationEntry[];
  updatedAt: unknown;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailToDocId(email: string): string {
  return normalizeEmail(email).replace(/\./g, '_dot_').replace(/@/g, '_at_');
}

export async function getEmailRegistrationHistory(
  email: string
): Promise<EmailRegistrationHistoryDoc | null> {
  const snap = await getDoc(
    doc(db, EMAIL_REGISTRATION_HISTORY_COLLECTION, emailToDocId(email))
  );
  if (!snap.exists()) return null;
  return snap.data() as EmailRegistrationHistoryDoc;
}

export async function recordEmailRegistration(
  email: string,
  uid: string,
  nickname: string
): Promise<{ isReRegistration: boolean; previousNicknames: string[] }> {
  const normalized = normalizeEmail(email);
  const ref = doc(db, EMAIL_REGISTRATION_HISTORY_COLLECTION, emailToDocId(normalized));
  const snap = await getDoc(ref);
  const now = serverTimestamp();

  const previousEntries = snap.exists()
    ? ((snap.data().entries || []) as EmailRegistrationEntry[])
    : [];

  const previousNicknames = previousEntries
    .map((e) => e.nickname)
    .filter(Boolean);

  const isReRegistration = previousEntries.some((e) => e.status === 'deleted');

  const newEntry: EmailRegistrationEntry = {
    uid,
    nickname: nickname.trim(),
    registeredAt: now,
    status: 'active',
  };

  if (snap.exists()) {
    await updateDoc(ref, {
      entries: [...previousEntries, newEntry],
      updatedAt: now,
    });
  } else {
    await setDoc(ref, {
      email: normalized,
      entries: [newEntry],
      updatedAt: now,
    });
  }

  return {
    isReRegistration,
    previousNicknames: [...new Set(previousNicknames)],
  };
}

export async function markEmailRegistrationDeleted(
  email: string,
  uid: string,
  deletedBy: string
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;

  const ref = doc(db, EMAIL_REGISTRATION_HISTORY_COLLECTION, emailToDocId(normalized));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: normalized,
      entries: [
        {
          uid,
          nickname: '(기록 없음)',
          registeredAt: serverTimestamp(),
          deletedAt: serverTimestamp(),
          deletedBy,
          status: 'deleted',
        },
      ],
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const data = snap.data() as EmailRegistrationHistoryDoc;
  const entries = (data.entries || []).map((entry) => {
    if (entry.uid === uid && entry.status === 'active') {
      return {
        ...entry,
        status: 'deleted' as const,
        deletedAt: serverTimestamp(),
        deletedBy,
      };
    }
    return entry;
  });

  await updateDoc(ref, {
    entries,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchAllEmailRegistrationHistories(
  maxDocs = 200
): Promise<Array<EmailRegistrationHistoryDoc & { id: string }>> {
  const snap = await getDocs(
    query(
      collection(db, EMAIL_REGISTRATION_HISTORY_COLLECTION),
      orderBy('updatedAt', 'desc'),
      limit(maxDocs)
    )
  );

  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as EmailRegistrationHistoryDoc),
  }));
}

export function formatEmailHistoryEntryTime(value: unknown): string {
  if (!value) return '-';
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().toLocaleString('ko-KR');
  }
  if (value instanceof Date) return value.toLocaleString('ko-KR');
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString('ko-KR');
}
