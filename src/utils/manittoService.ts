import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { computeManittoAssignments } from './manittoDraw';
import {
  MANITTO_MIN_PARTICIPANTS,
  type ManittoAssignment,
  type ManittoAssignmentRow,
  type ManittoParticipant,
  type ManittoSeason,
  type ManittoSeasonStatus,
} from './manittoTypes';

export const MANITTO_SEASONS_COLLECTION = 'manittoSeasons';
export const MANITTO_META_COLLECTION = 'manittoMeta';
export const MANITTO_META_ACTIVE_ID = 'active';

function parseSeason(id: string, data: Record<string, unknown>): ManittoSeason {
  return {
    id,
    title: String(data.title ?? ''),
    status: (data.status as ManittoSeasonStatus) ?? 'recruiting',
    giftGuide: data.giftGuide != null ? String(data.giftGuide) : undefined,
    recruitEndsAt: data.recruitEndsAt as ManittoSeason['recruitEndsAt'],
    eventDate: data.eventDate as ManittoSeason['eventDate'],
    createdBy: String(data.createdBy ?? ''),
    createdByNickname: String(data.createdByNickname ?? ''),
    createdAt: data.createdAt as ManittoSeason['createdAt'],
    drawnAt: data.drawnAt as ManittoSeason['drawnAt'],
    participantCount:
      typeof data.participantCount === 'number' ? data.participantCount : undefined,
  };
}

export function manittoMetaRef() {
  return doc(db, MANITTO_META_COLLECTION, MANITTO_META_ACTIVE_ID);
}

export function manittoSeasonRef(seasonId: string) {
  return doc(db, MANITTO_SEASONS_COLLECTION, seasonId);
}

export function manittoParticipantRef(seasonId: string, uid: string) {
  return doc(db, MANITTO_SEASONS_COLLECTION, seasonId, 'participants', uid);
}

export function manittoAssignmentRef(seasonId: string, giverUid: string) {
  return doc(db, MANITTO_SEASONS_COLLECTION, seasonId, 'assignments', giverUid);
}

export function subscribeActiveManittoSeason(
  onChange: (season: ManittoSeason | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let seasonUnsub: Unsubscribe | null = null;

  const metaUnsub = onSnapshot(
    manittoMetaRef(),
    (metaSnap) => {
      if (seasonUnsub) {
        seasonUnsub();
        seasonUnsub = null;
      }
      const seasonId = metaSnap.exists()
        ? String(metaSnap.data()?.seasonId ?? '').trim()
        : '';
      if (!seasonId) {
        onChange(null);
        return;
      }
      seasonUnsub = onSnapshot(
        manittoSeasonRef(seasonId),
        (seasonSnap) => {
          if (!seasonSnap.exists()) {
            onChange(null);
            return;
          }
          const season = parseSeason(seasonSnap.id, seasonSnap.data() as Record<string, unknown>);
          if (season.status === 'archived' || season.status === 'cancelled') {
            onChange(null);
            return;
          }
          onChange(season);
        },
        (err) => onError?.(err)
      );
    },
    (err) => onError?.(err)
  );

  return () => {
    metaUnsub();
    seasonUnsub?.();
  };
}

export function subscribeManittoParticipant(
  seasonId: string,
  uid: string,
  onChange: (participant: ManittoParticipant | null) => void
): Unsubscribe {
  return onSnapshot(manittoParticipantRef(seasonId, uid), (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    const data = snap.data();
    onChange({
      uid,
      nickname: String(data.nickname ?? ''),
      joinedAt: data.joinedAt as ManittoParticipant['joinedAt'],
    });
  });
}

export function subscribeMyManittoAssignment(
  seasonId: string,
  giverUid: string,
  onChange: (assignment: ManittoAssignment | null) => void
): Unsubscribe {
  return onSnapshot(manittoAssignmentRef(seasonId, giverUid), (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    const data = snap.data();
    onChange({
      receiverUid: String(data.receiverUid ?? ''),
      receiverNickname: String(data.receiverNickname ?? ''),
    });
  });
}

export function subscribeManittoParticipantCount(
  seasonId: string,
  onChange: (count: number) => void
): Unsubscribe {
  return onSnapshot(collection(db, MANITTO_SEASONS_COLLECTION, seasonId, 'participants'), (snap) => {
    onChange(snap.size);
  });
}

export async function createManittoSeason(input: {
  title: string;
  giftGuide?: string;
  recruitEndsAt?: Date | null;
  eventDate?: Date | null;
  createdBy: string;
  createdByNickname: string;
}): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new Error('회차 제목을 입력해 주세요.');

  const seasonRef = doc(collection(db, MANITTO_SEASONS_COLLECTION));
  await runTransaction(db, async (tx) => {
    const metaSnap = await tx.get(manittoMetaRef());
    const currentId = metaSnap.exists() ? String(metaSnap.data()?.seasonId ?? '') : '';
    if (currentId) {
      const currentSnap = await tx.get(manittoSeasonRef(currentId));
      if (currentSnap.exists()) {
        const status = currentSnap.data()?.status as ManittoSeasonStatus;
        if (status && status !== 'archived' && status !== 'cancelled') {
          throw new Error('진행 중인 마니또 회차가 있습니다. 먼저 종료하거나 추첨을 완료해 주세요.');
        }
      }
    }

    tx.set(seasonRef, {
      title,
      status: 'recruiting',
      giftGuide: (input.giftGuide ?? '').trim(),
      recruitEndsAt: input.recruitEndsAt ?? null,
      eventDate: input.eventDate ?? null,
      createdBy: input.createdBy,
      createdByNickname: input.createdByNickname,
      createdAt: serverTimestamp(),
      participantCount: 0,
    });
    tx.set(manittoMetaRef(), { seasonId: seasonRef.id, updatedAt: serverTimestamp() }, { merge: true });
  });

  return seasonRef.id;
}

export async function joinManittoSeason(
  seasonId: string,
  user: { uid: string; nickname: string }
): Promise<void> {
  const seasonSnap = await getDoc(manittoSeasonRef(seasonId));
  if (!seasonSnap.exists()) throw new Error('회차를 찾을 수 없습니다.');
  if (seasonSnap.data()?.status !== 'recruiting') {
    throw new Error('지금은 참가할 수 없습니다.');
  }

  const nickname = user.nickname.trim();
  if (!nickname) throw new Error('닉네임이 필요합니다.');

  const partRef = manittoParticipantRef(seasonId, user.uid);
  const existing = await getDoc(partRef);
  if (existing.exists()) return;

  await runTransaction(db, async (tx) => {
    const season = await tx.get(manittoSeasonRef(seasonId));
    if (!season.exists() || season.data()?.status !== 'recruiting') {
      throw new Error('참가가 마감되었습니다.');
    }
    tx.set(partRef, {
      uid: user.uid,
      nickname,
      joinedAt: serverTimestamp(),
    });
  });
}

export async function leaveManittoSeason(seasonId: string, uid: string): Promise<void> {
  const seasonSnap = await getDoc(manittoSeasonRef(seasonId));
  if (!seasonSnap.exists()) return;
  if (seasonSnap.data()?.status !== 'recruiting') {
    throw new Error('모집 마감 후에는 참가를 취소할 수 없습니다.');
  }

  const partRef = manittoParticipantRef(seasonId, uid);
  const partSnap = await getDoc(partRef);
  if (!partSnap.exists()) return;

  await runTransaction(db, async (tx) => {
    const season = await tx.get(manittoSeasonRef(seasonId));
    if (!season.exists() || season.data()?.status !== 'recruiting') {
      throw new Error('참가를 취소할 수 없습니다.');
    }
    tx.delete(partRef);
  });
}

export async function closeManittoRecruiting(seasonId: string): Promise<void> {
  const ref = manittoSeasonRef(seasonId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('회차를 찾을 수 없습니다.');
  if (snap.data()?.status !== 'recruiting') throw new Error('모집 중인 회차만 마감할 수 있습니다.');
  await updateDoc(ref, { status: 'closed' });
}

export async function drawManittoSeason(seasonId: string): Promise<number> {
  const seasonRef = manittoSeasonRef(seasonId);
  const seasonSnap = await getDoc(seasonRef);
  if (!seasonSnap.exists()) throw new Error('회차를 찾을 수 없습니다.');
  const status = seasonSnap.data()?.status;
  if (status !== 'closed' && status !== 'recruiting') {
    throw new Error('추첨할 수 있는 상태가 아닙니다.');
  }

  const participantsSnap = await getDocs(collection(db, MANITTO_SEASONS_COLLECTION, seasonId, 'participants'));
  const participants = participantsSnap.docs.map((d) => ({
    uid: d.id,
    nickname: String(d.data().nickname ?? ''),
  }));

  if (participants.length < MANITTO_MIN_PARTICIPANTS) {
    throw new Error(`추첨하려면 참가자가 ${MANITTO_MIN_PARTICIPANTS}명 이상이어야 합니다.`);
  }

  const assignments = computeManittoAssignments(participants.map((p) => p.uid));
  const nicknameByUid = new Map(participants.map((p) => [p.uid, p.nickname]));

  const batch = writeBatch(db);
  for (const [giverUid, receiverUid] of assignments) {
    batch.set(manittoAssignmentRef(seasonId, giverUid), {
      receiverUid,
      receiverNickname: nicknameByUid.get(receiverUid) ?? receiverUid,
      createdAt: serverTimestamp(),
    });
  }
  batch.update(seasonRef, {
    status: 'drawn',
    drawnAt: serverTimestamp(),
    participantCount: participants.length,
  });
  await batch.commit();

  return participants.length;
}

export async function archiveManittoSeason(seasonId: string): Promise<void> {
  await updateDoc(manittoSeasonRef(seasonId), { status: 'archived' });
  const meta = await getDoc(manittoMetaRef());
  if (meta.exists() && meta.data()?.seasonId === seasonId) {
    await setDoc(manittoMetaRef(), { seasonId: '', updatedAt: serverTimestamp() }, { merge: true });
  }
}

export async function fetchManittoParticipants(seasonId: string): Promise<ManittoParticipant[]> {
  const snap = await getDocs(collection(db, MANITTO_SEASONS_COLLECTION, seasonId, 'participants'));
  return snap.docs
    .map((d) => ({
      uid: d.id,
      nickname: String(d.data().nickname ?? ''),
      joinedAt: d.data().joinedAt as ManittoParticipant['joinedAt'],
    }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
}

export function subscribeManittoParticipants(
  seasonId: string,
  onChange: (participants: ManittoParticipant[]) => void
): Unsubscribe {
  return onSnapshot(collection(db, MANITTO_SEASONS_COLLECTION, seasonId, 'participants'), (snap) => {
    const list = snap.docs
      .map((d) => ({
        uid: d.id,
        nickname: String(d.data().nickname ?? ''),
        joinedAt: d.data().joinedAt as ManittoParticipant['joinedAt'],
      }))
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
    onChange(list);
  });
}

export async function fetchAllManittoAssignmentRows(seasonId: string): Promise<ManittoAssignmentRow[]> {
  const [participants, assignSnap] = await Promise.all([
    fetchManittoParticipants(seasonId),
    getDocs(collection(db, MANITTO_SEASONS_COLLECTION, seasonId, 'assignments')),
  ]);
  const nicknameByUid = new Map(participants.map((p) => [p.uid, p.nickname]));
  return assignSnap.docs
    .map((d) => {
      const data = d.data();
      const receiverUid = String(data.receiverUid ?? '');
      return {
        giverUid: d.id,
        giverNickname: nicknameByUid.get(d.id) ?? d.id,
        receiverUid,
        receiverNickname:
          String(data.receiverNickname ?? '') || nicknameByUid.get(receiverUid) || receiverUid,
      };
    })
    .sort((a, b) => a.giverNickname.localeCompare(b.giverNickname, 'ko'));
}

export function subscribeManittoAssignmentRows(
  seasonId: string,
  onChange: (rows: ManittoAssignmentRow[]) => void
): Unsubscribe {
  let participants: ManittoParticipant[] = [];
  let assignDocs: ManittoAssignmentRow[] = [];

  const emit = () => {
    const nicknameByUid = new Map(participants.map((p) => [p.uid, p.nickname]));
    onChange(
      assignDocs
        .map((row) => ({
          ...row,
          giverNickname: nicknameByUid.get(row.giverUid) ?? row.giverNickname,
          receiverNickname:
            nicknameByUid.get(row.receiverUid) ?? row.receiverNickname,
        }))
        .sort((a, b) => a.giverNickname.localeCompare(b.giverNickname, 'ko'))
    );
  };

  const unsubP = subscribeManittoParticipants(seasonId, (list) => {
    participants = list;
    emit();
  });

  const unsubA = onSnapshot(
    collection(db, MANITTO_SEASONS_COLLECTION, seasonId, 'assignments'),
    (snap) => {
      assignDocs = snap.docs.map((d) => {
        const data = d.data();
        const receiverUid = String(data.receiverUid ?? '');
        return {
          giverUid: d.id,
          giverNickname: d.id,
          receiverUid,
          receiverNickname: String(data.receiverNickname ?? receiverUid),
        };
      });
      emit();
    }
  );

  return () => {
    unsubP();
    unsubA();
  };
}

/** 너래 — 모집·마감 단계에서 참가자 추가 */
export async function adminAddManittoParticipant(
  seasonId: string,
  user: { uid: string; nickname: string }
): Promise<void> {
  const seasonSnap = await getDoc(manittoSeasonRef(seasonId));
  if (!seasonSnap.exists()) throw new Error('회차를 찾을 수 없습니다.');
  const status = seasonSnap.data()?.status as ManittoSeasonStatus;
  if (status !== 'recruiting' && status !== 'closed') {
    throw new Error('추첨 전(모집·마감)에만 참가자를 추가할 수 있습니다.');
  }
  const nickname = user.nickname.trim();
  if (!nickname) throw new Error('닉네임이 필요합니다.');
  await setDoc(
    manittoParticipantRef(seasonId, user.uid),
    { uid: user.uid, nickname, joinedAt: serverTimestamp() },
    { merge: true }
  );
}

/** 너래 — 추첨 전 참가자 제거 */
export async function adminRemoveManittoParticipant(seasonId: string, uid: string): Promise<void> {
  const seasonSnap = await getDoc(manittoSeasonRef(seasonId));
  if (!seasonSnap.exists()) throw new Error('회차를 찾을 수 없습니다.');
  const status = seasonSnap.data()?.status as ManittoSeasonStatus;
  if (status !== 'recruiting' && status !== 'closed') {
    throw new Error('추첨 후에는 참가자를 빼려면 재추첨을 먼저 실행해 주세요.');
  }
  await runTransaction(db, async (tx) => {
    tx.delete(manittoParticipantRef(seasonId, uid));
  });
}

/** 너래 — 추첨 결과 한 쌍 수정 (다른 사람과 받는 사람 교환) */
export async function adminSwapManittoReceiver(
  seasonId: string,
  giverUid: string,
  newReceiverUid: string
): Promise<void> {
  if (giverUid === newReceiverUid) {
    throw new Error('본인에게 배정할 수 없습니다.');
  }

  const rows = await fetchAllManittoAssignmentRows(seasonId);
  if (rows.length === 0) throw new Error('추첨 결과가 없습니다.');

  const byGiver = new Map(rows.map((r) => [r.giverUid, r.receiverUid]));
  const giverOfReceiver = new Map<string, string>();
  for (const row of rows) {
    giverOfReceiver.set(row.receiverUid, row.giverUid);
  }

  const oldReceiver = byGiver.get(giverUid);
  if (!oldReceiver) throw new Error('해당 참가자의 배정을 찾을 수 없습니다.');
  if (oldReceiver === newReceiverUid) return;

  const otherGiver = giverOfReceiver.get(newReceiverUid);
  if (!otherGiver) throw new Error('배정을 교환할 상대를 찾을 수 없습니다.');

  const nicknameByUid = new Map(
    (await fetchManittoParticipants(seasonId)).map((p) => [p.uid, p.nickname])
  );

  const batch = writeBatch(db);
  batch.update(manittoAssignmentRef(seasonId, giverUid), {
    receiverUid: newReceiverUid,
    receiverNickname: nicknameByUid.get(newReceiverUid) ?? newReceiverUid,
    updatedAt: serverTimestamp(),
  });
  batch.update(manittoAssignmentRef(seasonId, otherGiver), {
    receiverUid: oldReceiver,
    receiverNickname: nicknameByUid.get(oldReceiver) ?? oldReceiver,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

/** 너래 — 추첨 결과 삭제 후 마감 상태로 (인원 조정 후 재추첨) */
export async function adminClearManittoDraw(seasonId: string): Promise<void> {
  const seasonSnap = await getDoc(manittoSeasonRef(seasonId));
  if (!seasonSnap.exists()) throw new Error('회차를 찾을 수 없습니다.');
  if (seasonSnap.data()?.status !== 'drawn') {
    throw new Error('추첨 완료 상태에서만 재추첨 준비를 할 수 있습니다.');
  }

  const assignSnap = await getDocs(collection(db, MANITTO_SEASONS_COLLECTION, seasonId, 'assignments'));
  const batch = writeBatch(db);
  assignSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.update(manittoSeasonRef(seasonId), {
    status: 'closed',
    drawnAt: null,
  });
  await batch.commit();
}
