import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';

const MIN_PARTICIPANTS = 3;
const LEADER_ROLE = '리더';
const SUPER_NICKNAME = '너래';

/** 참가자 UID → 받는 사람 UID (본인 제외 순열) */
function computeManittoAssignments(giverUids: string[]): Map<string, string> {
  const n = giverUids.length;
  if (n < 2) {
    throw new Error('need at least 2 participants');
  }

  const tryRandom = (): Map<string, string> | null => {
    const receivers = [...giverUids];
    for (let i = receivers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [receivers[i], receivers[j]] = [receivers[j], receivers[i]];
    }
    for (let i = 0; i < n; i++) {
      if (receivers[i] === giverUids[i]) return null;
    }
    const map = new Map<string, string>();
    for (let i = 0; i < n; i++) {
      map.set(giverUids[i], receivers[i]);
    }
    return map;
  };

  for (let attempt = 0; attempt < 200; attempt++) {
    const result = tryRandom();
    if (result) return result;
  }

  const map = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    map.set(giverUids[i], giverUids[(i + 1) % n]);
  }
  return map;
}

function isCompleteDerangement(uids: string[], map: Map<string, string>): boolean {
  if (map.size !== uids.length || uids.length < 2) return false;
  const receivers = new Set<string>();
  const uidSet = new Set(uids);
  for (const uid of uids) {
    const receiver = map.get(uid);
    if (!receiver || receiver === uid || !uidSet.has(receiver) || receivers.has(receiver)) {
      return false;
    }
    receivers.add(receiver);
  }
  return receivers.size === uids.length;
}

/** 같은 인원이면 기존 짝을 유지하고, 입·퇴장만 순환에 반영한다. */
function assignManittoStable(
  participantUids: string[],
  existing: Map<string, string>
): Map<string, string> {
  const uids = [...new Set(participantUids)];
  if (uids.length < MIN_PARTICIPANTS) return new Map();

  if (isCompleteDerangement(uids, existing)) {
    const copy = new Map<string, string>();
    for (const uid of uids) copy.set(uid, existing.get(uid)!);
    return copy;
  }

  const prevList = [...existing.keys()];
  if (prevList.length >= MIN_PARTICIPANTS && isCompleteDerangement(prevList, existing)) {
    const working = new Map(existing);
    const nextSet = new Set(uids);

    for (const removed of prevList) {
      if (nextSet.has(removed)) continue;
      let giver: string | undefined;
      for (const [candidate, receiver] of working) {
        if (receiver === removed) {
          giver = candidate;
          break;
        }
      }
      const next = working.get(removed);
      working.delete(removed);
      if (giver && next && giver !== removed) {
        if (giver === next) working.delete(giver);
        else working.set(giver, next);
      }
    }

    for (const added of uids) {
      if (working.has(added)) continue;
      const givers = [...working.keys()];
      if (givers.length === 0) break;
      const giver = givers[Math.floor(Math.random() * givers.length)];
      const oldReceiver = working.get(giver)!;
      working.set(giver, added);
      working.set(added, oldReceiver);
    }

    if (isCompleteDerangement(uids, working)) return working;
  }

  return computeManittoAssignments(uids);
}

function sameReceiverMap(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [giver, receiver] of a) {
    if (b.get(giver) !== receiver) return false;
  }
  return true;
}

async function assertCanSyncSeason(callerUid: string, seasonId: string): Promise<void> {
  const db = admin.firestore();
  const [userSnap, partSnap] = await Promise.all([
    db.doc(`users/${callerUid}`).get(),
    db.doc(`manittoSeasons/${seasonId}/participants/${callerUid}`).get(),
  ]);

  if (partSnap.exists) return;

  if (!userSnap.exists) {
    throw new HttpsError('permission-denied', '마니또 배정을 갱신할 권한이 없습니다.');
  }
  const data = userSnap.data() || {};
  const nickname = String(data.nickname || '');
  const role = String(data.role || '');
  if (nickname === SUPER_NICKNAME || role === LEADER_ROLE) return;

  throw new HttpsError('permission-denied', '마니또 배정을 갱신할 권한이 없습니다.');
}

export async function syncManittoAssignmentsForSeason(seasonId: string): Promise<number> {
  const db = admin.firestore();
  const seasonRef = db.doc(`manittoSeasons/${seasonId}`);
  const seasonSnap = await seasonRef.get();
  if (!seasonSnap.exists) return 0;

  const status = String(seasonSnap.data()?.status || '');
  if (status !== 'recruiting' && status !== 'closed') {
    return 0;
  }

  const partSnap = await seasonRef.collection('participants').get();
  const participants = partSnap.docs.map((d) => ({
    uid: d.id,
    nickname: String(d.data().nickname || ''),
  }));

  const assignCol = seasonRef.collection('assignments');
  const existingAssign = await assignCol.get();
  const existing = new Map<string, string>();
  existingAssign.docs.forEach((d) => {
    existing.set(d.id, String(d.data().receiverUid || ''));
  });

  if (participants.length < MIN_PARTICIPANTS) {
    if (existingAssign.empty && Number(seasonSnap.data()?.participantCount) === participants.length) {
      return 0;
    }
    const batch = db.batch();
    existingAssign.docs.forEach((d) => batch.delete(d.ref));
    batch.set(
      seasonRef,
      {
        participantCount: participants.length,
        pairingSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        livePairing: true,
      },
      { merge: true }
    );
    await batch.commit();
    return 0;
  }

  const assignments = assignManittoStable(
    participants.map((p) => p.uid),
    existing
  );
  if (
    sameReceiverMap(existing, assignments) &&
    Number(seasonSnap.data()?.participantCount) === participants.length
  ) {
    return participants.length;
  }

  const nicknameByUid = new Map(participants.map((p) => [p.uid, p.nickname]));
  const newGivers = new Set(assignments.keys());

  const batch = db.batch();
  existingAssign.docs.forEach((d) => {
    if (!newGivers.has(d.id)) batch.delete(d.ref);
  });
  for (const [giverUid, receiverUid] of assignments) {
    if (existing.get(giverUid) === receiverUid) continue;
    batch.set(
      assignCol.doc(giverUid),
      {
        receiverUid,
        receiverNickname: nicknameByUid.get(receiverUid) ?? receiverUid,
        live: status === 'recruiting',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  batch.set(
    seasonRef,
    {
      participantCount: participants.length,
      pairingSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      livePairing: status === 'recruiting',
    },
    { merge: true }
  );
  await batch.commit();
  return participants.length;
}

export const syncManittoPairing = onCall(
  { region: 'asia-northeast3', timeoutSeconds: 60 },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    const seasonId = String(request.data?.seasonId ?? '').trim();
    if (!seasonId) {
      throw new HttpsError('invalid-argument', 'seasonId가 필요합니다.');
    }

    await assertCanSyncSeason(callerUid, seasonId);
    const count = await syncManittoAssignmentsForSeason(seasonId);
    return { ok: true, count };
  }
);

export const syncManittoOnParticipantChange = onDocumentWritten(
  {
    document: 'manittoSeasons/{seasonId}/participants/{participantUid}',
    region: 'asia-northeast3',
  },
  async (event) => {
    const seasonId = event.params.seasonId;
    try {
      await syncManittoAssignmentsForSeason(seasonId);
    } catch (err) {
      logger.error('manitto live pairing sync failed', { seasonId, err });
    }
  }
);
