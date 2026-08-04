import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  limit,
  type QuerySnapshot,
  type DocumentData,
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
  const now = Timestamp.now();

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
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      email: normalized,
      entries: [newEntry],
      updatedAt: serverTimestamp(),
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
  const deletedAt = Timestamp.now();

  if (!snap.exists()) {
    await setDoc(ref, {
      email: normalized,
      entries: [
        {
          uid,
          nickname: '(기록 없음)',
          registeredAt: deletedAt,
          deletedAt,
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
        deletedAt,
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
  maxDocs = 1000
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

export interface CurrentMemberEmailRow {
  uid: string;
  email: string;
  nickname: string;
  createdAt: unknown;
  historyEntryCount: number;
}

/** 현재 users에 있는 멤버를 이메일 이력에 반영(없는 경우만 추가) */
export async function syncCurrentMembersToEmailHistory(
  usersSnap?: QuerySnapshot<DocumentData>
): Promise<{
  created: number;
  linked: number;
  skipped: number;
}> {
  const snap = usersSnap ?? (await getDocs(collection(db, 'users')));
  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const userDoc of snap.docs) {
    const data = userDoc.data();
    const email = typeof data.email === 'string' ? normalizeEmail(data.email) : '';
    if (!email) {
      skipped += 1;
      continue;
    }

    const uid = userDoc.id;
    const nickname = String(data.nickname || '').trim() || '(닉네임 없음)';
    const registeredAt =
      data.createdAt instanceof Timestamp || data.createdAt instanceof Date
        ? data.createdAt
        : Timestamp.now();

    const ref = doc(db, EMAIL_REGISTRATION_HISTORY_COLLECTION, emailToDocId(email));
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        email,
        entries: [
          {
            uid,
            nickname,
            registeredAt,
            status: 'active' as const,
          },
        ],
        updatedAt: serverTimestamp(),
      });
      created += 1;
      continue;
    }

    const history = snap.data() as EmailRegistrationHistoryDoc;
    const entries = history.entries || [];
    const alreadyActiveForUid = entries.some(
      (entry) => entry.uid === uid && entry.status === 'active'
    );
    if (alreadyActiveForUid) {
      skipped += 1;
      continue;
    }

    await updateDoc(ref, {
      entries: [
        ...entries,
        {
          uid,
          nickname,
          registeredAt,
          status: 'active' as const,
        },
      ],
      updatedAt: serverTimestamp(),
    });
    linked += 1;
  }

  return { created, linked, skipped };
}

export function buildCurrentMemberEmailsFromUsersSnap(
  usersSnap: QuerySnapshot<DocumentData>,
  histories: Array<EmailRegistrationHistoryDoc & { id: string }>
): CurrentMemberEmailRow[] {
  const historyCountByEmail = new Map<string, number>();
  histories.forEach((item) => {
    historyCountByEmail.set(normalizeEmail(item.email), (item.entries || []).length);
  });

  const rows: CurrentMemberEmailRow[] = [];
  usersSnap.docs.forEach((userDoc) => {
    const data = userDoc.data();
    const email = typeof data.email === 'string' ? normalizeEmail(data.email) : '';
    if (!email) return;
    rows.push({
      uid: userDoc.id,
      email,
      nickname: String(data.nickname || '').trim() || '(닉네임 없음)',
      createdAt: data.createdAt ?? null,
      historyEntryCount: historyCountByEmail.get(email) || 1,
    });
  });

  rows.sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
  return rows;
}

/** 현재 가입 중인 멤버 이메일 목록(+이력 건수) */
export async function fetchCurrentMemberEmails(
  histories?: Array<EmailRegistrationHistoryDoc & { id: string }>
): Promise<CurrentMemberEmailRow[]> {
  const [usersSnap, historyRows] = await Promise.all([
    getDocs(collection(db, 'users')),
    histories ? Promise.resolve(histories) : fetchAllEmailRegistrationHistories(),
  ]);

  return buildCurrentMemberEmailsFromUsersSnap(usersSnap, historyRows);
}

/** 이메일 이력 탭용: 이력·멤버 목록을 users 1회 조회로 병렬 로드 */
export async function fetchEmailHistoryPanelData(): Promise<{
  histories: Array<EmailRegistrationHistoryDoc & { id: string }>;
  currentMembers: CurrentMemberEmailRow[];
}> {
  const [histories, usersSnap] = await Promise.all([
    fetchAllEmailRegistrationHistories(),
    getDocs(collection(db, 'users')),
  ]);

  return {
    histories,
    currentMembers: buildCurrentMemberEmailsFromUsersSnap(usersSnap, histories),
  };
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
