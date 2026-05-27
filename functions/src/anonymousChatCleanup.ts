import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVE_KICK_DAYS = 5;
const BAN_DAYS = 7;
const MANUAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BOT = '청소도우미';
const NERAE_SUB_SEP = '__sub__';

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

const resolveParticipantOwnerUid = (
  participantDocId: string,
  data: FirebaseFirestore.DocumentData
): string => {
  const fromField = String(data.ownerUid || '').trim();
  if (fromField) return fromField;
  const subIdx = participantDocId.indexOf(NERAE_SUB_SEP);
  if (subIdx >= 0) return participantDocId.slice(0, subIdx);
  if (participantDocId.startsWith('sub_')) return '';
  return participantDocId;
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

const isChatPushMutedForUid = (notificationMutedUids: string[], uid: string) =>
  Boolean(uid && notificationMutedUids.includes(uid));

const createKickNotification = async (params: {
  toUid: string;
  roomId: string;
  roomTitle: string;
  banUntilMs: number;
  nickname: string;
  otherPersonaRemains: boolean;
  notificationMutedUids: string[];
}) => {
  const {
    toUid,
    roomId,
    roomTitle,
    banUntilMs,
    nickname,
    otherPersonaRemains,
    notificationMutedUids
  } = params;

  if (!toUid || isChatPushMutedForUid(notificationMutedUids, toUid)) {
    return;
  }

  const banUntilText = new Date(banUntilMs).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const message = otherPersonaRemains
    ? `"${roomTitle}" 방의 "${nickname}" 계정이 5일 이상 활동이 없어 자동으로보내졌습니다. 다른 익명 계정은 방에 남아 있습니다.`
    : `"${roomTitle}" 채팅방에서 5일 이상 활동이 없어 자동으로보내졌습니다. ${banUntilText}까지 재입장할 수 없습니다.`;

  await admin.firestore().collection('notifications').add({
    toUid,
    type: 'anonymous_chat_ban',
    postType: 'anonymous_chat',
    postId: roomId,
    roomId,
    postTitle: `익명채팅 자동퇴장 - ${roomTitle}`,
    fromNickname: '시스템',
    message,
    route: `/anonymous-chat?roomId=${encodeURIComponent(roomId)}`,
    isRead: false,
    hiddenFromInbox: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
};

export type CleanupTrigger = 'manual' | 'scheduled';

interface KickTarget {
  participantDocId: string;
  nickname: string;
  notifyUid: string;
  ownerUid: string;
}

const ownerHasOtherPersonaInRoom = (
  ownerUid: string,
  kickedDocId: string,
  remainingParticipantDocIds: Set<string>,
  participantOwnerByDocId: Map<string, string>
) => {
  if (!ownerUid) return false;
  for (const docId of remainingParticipantDocIds) {
    if (docId === kickedDocId) continue;
    const docOwner = participantOwnerByDocId.get(docId) || docId;
    if (docOwner === ownerUid || docId === ownerUid) return true;
  }
  return false;
};

export const runAnonymousChatRoomCleanup = async (
  roomId: string,
  options: { trigger: CleanupTrigger; requesterUid?: string; requesterParticipantDocId?: string }
) => {
  const db = admin.firestore();
  const roomRef = db.doc(`anonymousChatRooms/${roomId}`);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    throw new HttpsError('not-found', '채팅방을 찾을 수 없습니다.');
  }

  const room = roomSnap.data() || {};
  const roomTitle = String(room.title || '채팅방');
  const roomOwnerUid = String(room.createdByUid || '').trim();
  const coHostUids = (room.coHostUids as string[] | undefined) || [];
  const coHostParticipantIds = (room.coHostParticipantIds as string[] | undefined) || [];
  const notificationMutedUids = (room.notificationMutedUids as string[] | undefined) || [];
  const nowMs = Date.now();
  const isManualCleanup = options.trigger === 'manual';

  if (isManualCleanup) {
    const requesterUid = options.requesterUid || '';
    const requesterParticipantDocId = String(options.requesterParticipantDocId || '').trim();
    const isRoomOwner =
      Boolean(roomOwnerUid && requesterUid === roomOwnerUid) ||
      Boolean(roomOwnerUid && requesterParticipantDocId === roomOwnerUid);
    const isManager =
      isRoomOwner ||
      coHostUids.includes(requesterUid) ||
      Boolean(requesterParticipantDocId && coHostParticipantIds.includes(requesterParticipantDocId));
    if (!isManager) {
      throw new HttpsError('permission-denied', '방장/부방장만 청소할 수 있습니다.');
    }
    const lastCleanupMs = toMillis(room.lastCleanupAt);
    if (
      !isRoomOwner &&
      lastCleanupMs > 0 &&
      nowMs - lastCleanupMs < MANUAL_COOLDOWN_MS
    ) {
      throw new HttpsError('failed-precondition', '청소도우미는 하루에 한 번만 사용할 수 있습니다.');
    }
  }

  const cleanupStartedAt = admin.firestore.Timestamp.fromMillis(nowMs);
  if (isManualCleanup) {
    await roomRef.set(
      {
        isFrozen: true,
        lastCleanupAt: cleanupStartedAt
      },
      { merge: true }
    );

    try {
      await deleteCollectionInBatches(roomRef.collection('messages'));
      let clientSort = nowMs;
      await addSystemMessage(roomId, `${CLEANUP_BOT}: 채팅방 청소를 시작합니다`, clientSort++);
      await addSystemMessage(roomId, `${CLEANUP_BOT}: 청소가 완료되었습니다`, clientSort++);
      await roomRef.set({ isFrozen: false }, { merge: true });
      return { kickedCount: 0, warningCount: 0 };
    } catch (error) {
      await roomRef.set({ isFrozen: false }, { merge: true }).catch(() => undefined);
      throw error;
    }
  }

  try {
    const participantsSnap = await roomRef.collection('participants').get();
    const messagesSnap = await roomRef.collection('messages').get();

    const participantDocIdsByOwnerUid = new Map<string, string[]>();
    const participantOwnerByDocId = new Map<string, string>();
    participantsSnap.docs.forEach((participantDoc) => {
      const participantDocId = participantDoc.id;
      const ownerUid = resolveParticipantOwnerUid(participantDocId, participantDoc.data());
      participantOwnerByDocId.set(participantDocId, ownerUid || participantDocId);
      if (!ownerUid) return;
      const list = participantDocIdsByOwnerUid.get(ownerUid) || [];
      list.push(participantDocId);
      participantDocIdsByOwnerUid.set(ownerUid, list);
    });

    const lastMessageByParticipant = new Map<string, number>();
    const notifyUidByParticipant = new Map<string, string>();

    const touchParticipantActivity = (
      participantDocId: string,
      messageMs: number,
      messageUid: string
    ) => {
      if (!participantDocId || !messageMs) return;
      lastMessageByParticipant.set(
        participantDocId,
        Math.max(lastMessageByParticipant.get(participantDocId) || 0, messageMs)
      );
      if (messageUid) {
        notifyUidByParticipant.set(participantDocId, messageUid);
      }
    };

    messagesSnap.docs.forEach((messageDoc) => {
      const data = messageDoc.data();
      const messageUid = String(data.uid || '').trim();
      if (!messageUid || messageUid === '__system__' || messageUid === 'system') {
        return;
      }
      const messageMs = getMessageMillis(data);
      if (!messageMs) return;

      const explicitParticipantDocId = String(data.senderParticipantDocId || '').trim();
      if (explicitParticipantDocId) {
        touchParticipantActivity(explicitParticipantDocId, messageMs, messageUid);
        return;
      }

      touchParticipantActivity(messageUid, messageMs, messageUid);
      const ownedDocIds = participantDocIdsByOwnerUid.get(messageUid) || [];
      ownedDocIds.forEach((docId) => touchParticipantActivity(docId, messageMs, messageUid));
    });

    const activityByParticipant = new Map<
      string,
      { activityMs: number; nickname: string; notifyUid: string; ownerUid: string }
    >();

    participantsSnap.docs.forEach((participantDoc) => {
      const participant = participantDoc.data();
      const participantDocId = participantDoc.id;
      if (!participantDocId || participantDocId === roomOwnerUid) return;

      const nickname = String(participant.nickname || '익명').trim() || '익명';
      const joinedMs = toMillis(participant.joinedAt);
      const storedLastMessageMs = toMillis(participant.lastMessageAt);
      const storedLastReadMs = toMillis(participant.lastReadAt);
      const activityMs = Math.max(
        joinedMs,
        storedLastMessageMs,
        storedLastReadMs,
        lastMessageByParticipant.get(participantDocId) || 0
      );
      const ownerUid = resolveParticipantOwnerUid(participantDocId, participant);
      const notifyUid =
        notifyUidByParticipant.get(participantDocId) ||
        ownerUid ||
        (participantDocId.startsWith('sub_') ? '' : participantDocId);

      activityByParticipant.set(participantDocId, {
        activityMs,
        nickname,
        notifyUid,
        ownerUid: ownerUid || notifyUid || participantDocId
      });
    });

    const warningMessages: string[] = [];
    const kickTargets: KickTarget[] = [];

    for (const [participantDocId, { activityMs, nickname, notifyUid, ownerUid }] of activityByParticipant.entries()) {
      if (!activityMs) continue;

      const inactiveDays = Math.floor((nowMs - activityMs) / DAY_MS);
      if (inactiveDays >= INACTIVE_KICK_DAYS) {
        kickTargets.push({
          participantDocId,
          nickname,
          notifyUid,
          ownerUid
        });
        continue;
      }

      if (inactiveDays >= 2) {
        const daysLeft = INACTIVE_KICK_DAYS - inactiveDays;
        if (daysLeft >= 1 && daysLeft <= 3) {
          warningMessages.push(
            `${CLEANUP_BOT}: ${nickname}님, 채팅이 없으면 ${daysLeft}일 후 자동으로보내집니다.`
          );
        }
      }
    }

    let clientSort = nowMs;
    for (const warningText of warningMessages) {
      await addSystemMessage(roomId, warningText, clientSort++);
    }

    const kickedDocIds = new Set(kickTargets.map((t) => t.participantDocId));
    const remainingParticipantDocIds = new Set(
      participantsSnap.docs.map((d) => d.id).filter((id) => !kickedDocIds.has(id))
    );

    const banUntilMs = nowMs + BAN_DAYS * DAY_MS;
    const banUntil = admin.firestore.Timestamp.fromMillis(banUntilMs);
    const banUpdate: Record<string, unknown> = {};
    const bannedParticipantIds = (room.bannedParticipantIds as string[] | undefined) || [];

    for (const target of kickTargets) {
      banUpdate[`banUntilByParticipantId.${target.participantDocId}`] = banUntil;
      await roomRef.collection('participants').doc(target.participantDocId).delete();

      await addSystemMessage(
        roomId,
        `${CLEANUP_BOT}: "${target.nickname}"님이 5일 이상 활동이 없어 자동으로보내졌습니다.`,
        clientSort++
      );

      if (!target.notifyUid) continue;

      const otherPersonaRemains = ownerHasOtherPersonaInRoom(
        target.ownerUid,
        target.participantDocId,
        remainingParticipantDocIds,
        participantOwnerByDocId
      );

      await createKickNotification({
        toUid: target.notifyUid,
        roomId,
        roomTitle,
        banUntilMs,
        nickname: target.nickname,
        otherPersonaRemains,
        notificationMutedUids
      });
    }

    if (Object.keys(banUpdate).length > 0) {
      const kickedDocIdSet = new Set(kickTargets.map((t) => t.participantDocId));
      const kickedOwnerUids = new Set(
        kickTargets.map((t) => t.ownerUid).filter(Boolean)
      );

      const mergedBanned = Array.from(
        new Set([...bannedParticipantIds, ...kickTargets.map((t) => t.participantDocId)])
      );
      await roomRef.set(
        {
          ...banUpdate,
          bannedParticipantIds: mergedBanned,
          coHostParticipantIds: coHostParticipantIds.filter((id) => !kickedDocIdSet.has(id)),
          coHostUids: coHostUids.filter((uid) => !kickedOwnerUids.has(uid) && !kickedDocIdSet.has(uid))
        },
        { merge: true }
      );
    }

    return {
      kickedCount: kickTargets.length,
      warningCount: warningMessages.length
    };
  } catch (error) {
    logger.error('익명채팅 미활동 정리 처리 실패', { roomId, error });
    throw error;
  }
};

export const deleteAnonymousChatRoom = onCall(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 300,
    memory: '512MiB'
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    const roomId = String(request.data?.roomId || '').trim();
    if (!roomId) {
      throw new HttpsError('invalid-argument', 'roomId가 필요합니다.');
    }

    const db = admin.firestore();
    const roomRef = db.doc(`anonymousChatRooms/${roomId}`);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      return { ok: true, alreadyDeleted: true };
    }

    const createdByUid = String(roomSnap.data()?.createdByUid || '').trim();
    if (createdByUid !== uid) {
      throw new HttpsError('permission-denied', '방장만 채팅방을 삭제할 수 있습니다.');
    }

    await deleteCollectionInBatches(roomRef.collection('messages'));
    await deleteCollectionInBatches(roomRef.collection('participants'));
    await roomRef.delete();

    logger.info('익명채팅방 삭제 완료', { roomId, uid });
    return { ok: true };
  }
);

export const cleanupAnonymousChatRoom = onCall(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 300,
    memory: '512MiB'
  },
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
      requesterUid: uid,
      requesterParticipantDocId: String(request.data?.requesterParticipantDocId || '').trim()
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
    logger.info('익명채팅 자정 미활동 정리 시작', { roomCount: roomsSnap.size });

    for (const roomDoc of roomsSnap.docs) {
      try {
        const result = await runAnonymousChatRoomCleanup(roomDoc.id, { trigger: 'scheduled' });
        if (result.kickedCount > 0 || result.warningCount > 0) {
          logger.info('익명채팅 미활동 정리 완료', { roomId: roomDoc.id, ...result });
        }
      } catch (error) {
        logger.error('익명채팅 미활동 정리 실패', { roomId: roomDoc.id, error });
      }
    }
  }
);
