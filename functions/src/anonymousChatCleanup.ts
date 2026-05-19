import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVE_KICK_DAYS = 5;
const BAN_DAYS = 7;
const MANUAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BOT = '청소도우미';

const toMillis = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === 'object' && value !== null && 'toMillis' in value) {
    const millis = (value as { toMillis?: () => number }).toMillis?.();
    if (typeof millis === 'number') return millis;
  }
  return 0;
};

const getMessageMillis = (data: FirebaseFirestore.DocumentData): number => {
  const client = typeof data.createdAtClient === 'number' ? data.createdAtClient : 0;
  const server = toMillis(data.createdAt);
  return Math.max(client, server);
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

const addSystemMessage = async (
  roomId: string,
  text: string,
  createdAtClient: number
) => {
  await admin.firestore().collection(`anonymousChatRooms/${roomId}/messages`).add({
    uid: '__system__',
    senderLabel: 'system',
    content: text,
    systemText: text,
    createdAtClient,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
};

const createKickNotification = async (
  toUid: string,
  roomId: string,
  roomTitle: string,
  banUntilMs: number
) => {
  const banUntilText = new Date(banUntilMs).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  const message = `"${roomTitle}" 채팅방에서 5일 이상 채팅이 없어 자동보내기되었습니다. ${banUntilText}까지 재입장할 수 없습니다.`;

  await admin.firestore().collection('notifications').add({
    toUid,
    type: 'anonymous_chat_ban',
    postType: 'anonymous_chat',
    postId: roomId,
    roomId,
    postTitle: `익명채팅 - ${roomTitle}`,
    fromNickname: '청소도우미',
    message,
    route: `/anonymous-chat?roomId=${encodeURIComponent(roomId)}`,
    isRead: false,
    hiddenFromInbox: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
};

export type CleanupTrigger = 'manual' | 'scheduled';

export const runAnonymousChatRoomCleanup = async (
  roomId: string,
  options: { trigger: CleanupTrigger; requesterUid?: string }
) => {
  const db = admin.firestore();
  const roomRef = db.doc(`anonymousChatRooms/${roomId}`);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    throw new HttpsError('not-found', '채팅방을 찾을 수 없습니다.');
  }

  const room = roomSnap.data() || {};
  const roomTitle = String(room.title || '채팅방');
  const ownerUid = String(room.createdByUid || '');
  const coHostUids = (room.coHostUids as string[] | undefined) || [];
  const nowMs = Date.now();

  if (options.trigger === 'manual') {
    const requesterUid = options.requesterUid || '';
    const isManager = requesterUid === ownerUid || coHostUids.includes(requesterUid);
    if (!isManager) {
      throw new HttpsError('permission-denied', '방장/부방장만 청소할 수 있습니다.');
    }
    const lastCleanupMs = toMillis(room.lastCleanupAt);
    if (lastCleanupMs > 0 && nowMs - lastCleanupMs < MANUAL_COOLDOWN_MS) {
      throw new HttpsError('failed-precondition', '청소도우미는 하루에 한 번만 사용할 수 있습니다.');
    }
  }

  const cleanupStartedAt = admin.firestore.Timestamp.fromMillis(nowMs);
  await roomRef.set(
    {
      isFrozen: true,
      lastCleanupAt: cleanupStartedAt
    },
    { merge: true }
  );

  try {
    const participantsSnap = await roomRef.collection('participants').get();
    const messagesSnap = await roomRef.collection('messages').get();

    const lastMessageByUid = new Map<string, number>();
    messagesSnap.docs.forEach((messageDoc) => {
      const data = messageDoc.data();
      const uid = String(data.uid || '');
      if (!uid || uid === '__system__' || uid === 'system') return;
      const messageMs = getMessageMillis(data);
      if (!messageMs) return;
      lastMessageByUid.set(uid, Math.max(lastMessageByUid.get(uid) || 0, messageMs));
    });

    const warningMessages: string[] = [];
    const kickTargets: Array<{ uid: string; nickname: string }> = [];

    participantsSnap.docs.forEach((participantDoc) => {
      const uid = participantDoc.id;
      if (!uid || uid === ownerUid) return;

      const participant = participantDoc.data();
      const nickname = String(participant.nickname || '익명').trim() || '익명';
      const joinedMs = toMillis(participant.joinedAt);
      const storedLastMessageMs = toMillis(participant.lastMessageAt);
      const activityMs = Math.max(joinedMs, storedLastMessageMs, lastMessageByUid.get(uid) || 0);

      if (!activityMs) return;

      const inactiveDays = Math.floor((nowMs - activityMs) / DAY_MS);
      if (inactiveDays >= INACTIVE_KICK_DAYS) {
        kickTargets.push({ uid, nickname });
        return;
      }

      if (inactiveDays >= 2) {
        const daysLeft = INACTIVE_KICK_DAYS - inactiveDays;
        if (daysLeft >= 1 && daysLeft <= 3) {
          warningMessages.push(
            `${CLEANUP_BOT}: ${nickname}님, 채팅이 없으면 ${daysLeft}일 후 자동보내기됩니다.`
          );
        }
      }
    });

    await deleteCollectionInBatches(roomRef.collection('messages'));

    let clientSort = nowMs;
    await addSystemMessage(roomId, `${CLEANUP_BOT}: 채팅방 청소를 시작합니다`, clientSort++);
    for (const warningText of warningMessages) {
      await addSystemMessage(roomId, warningText, clientSort++);
    }

    const banUntilMs = nowMs + BAN_DAYS * DAY_MS;
    const banUntil = admin.firestore.Timestamp.fromMillis(banUntilMs);
    const banUpdate: Record<string, unknown> = {};

    for (const target of kickTargets) {
      banUpdate[`banUntilByUid.${target.uid}`] = banUntil;
      await roomRef.collection('participants').doc(target.uid).delete();
      await addSystemMessage(
        roomId,
        `${CLEANUP_BOT}: "${target.nickname}"님이 5일 이상 미활동으로보내졌습니다.`,
        clientSort++
      );
      await createKickNotification(target.uid, roomId, roomTitle, banUntilMs);
    }

    if (Object.keys(banUpdate).length > 0) {
      const legacyBanned = (room.bannedUids as string[] | undefined) || [];
      const mergedBanned = Array.from(new Set([...legacyBanned, ...kickTargets.map((t) => t.uid)]));
      await roomRef.set(
        {
          ...banUpdate,
          bannedUids: mergedBanned,
          coHostUids: coHostUids.filter((uid) => !kickTargets.some((t) => t.uid === uid))
        },
        { merge: true }
      );
    }

    await addSystemMessage(roomId, `${CLEANUP_BOT}: 청소가 완료되었습니다`, clientSort++);
    await roomRef.set({ isFrozen: false }, { merge: true });

    return {
      kickedCount: kickTargets.length,
      warningCount: warningMessages.length
    };
  } catch (error) {
    await roomRef.set({ isFrozen: false }, { merge: true }).catch(() => undefined);
    throw error;
  }
};

export const cleanupAnonymousChatRoom = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    const roomId = String(request.data?.roomId || '').trim();
    if (!roomId) {
      throw new HttpsError('invalid-argument', 'roomId가 필요합니다.');
    }

    const result = await runAnonymousChatRoomCleanup(roomId, {
      trigger: 'manual',
      requesterUid: uid
    });
    return { ok: true, ...result };
  }
);

export const scheduledAnonymousChatCleanup = onSchedule(
  {
    schedule: '0 0 * * *',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3'
  },
  async () => {
    const roomsSnap = await admin.firestore().collection('anonymousChatRooms').get();
    logger.info('익명채팅 자정 청소 시작', { roomCount: roomsSnap.size });

    for (const roomDoc of roomsSnap.docs) {
      try {
        const result = await runAnonymousChatRoomCleanup(roomDoc.id, { trigger: 'scheduled' });
        logger.info('익명채팅 청소 완료', { roomId: roomDoc.id, ...result });
      } catch (error) {
        logger.error('익명채팅 청소 실패', { roomId: roomDoc.id, error });
      }
    }
  }
);
