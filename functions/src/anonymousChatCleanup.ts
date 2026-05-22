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

const createKickNotification = async (
  toUid: string,
  roomId: string,
  roomTitle: string,
  banUntilMs: number,
  reason: 'manual_cleanup' | 'auto_inactive'
) => {
  const banUntilText = new Date(banUntilMs).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const message =
    reason === 'auto_inactive'
      ? `"${roomTitle}" 채팅방에서 5일 이상 활동이 없어 자동으로보내졌습니다. ${banUntilText}까지 재입장할 수 없습니다.`
      : `"${roomTitle}" 채팅방에서 5일 이상 채팅이 없어 청소도우미에 의해보내졌습니다. ${banUntilText}까지 재입장할 수 없습니다.`;

  await admin.firestore().collection('notifications').add({
    toUid,
    type: 'anonymous_chat_ban',
    postType: 'anonymous_chat',
    postId: roomId,
    roomId,
    postTitle:
      reason === 'auto_inactive'
        ? `익명채팅 자동퇴장 - ${roomTitle}`
        : `익명채팅 청소 - ${roomTitle}`,
    fromNickname: reason === 'auto_inactive' ? '시스템' : CLEANUP_BOT,
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
}

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
    /* 방장은 매번(쿨다운 없음), 부방장은 24시간 1회 */
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
  }

  try {
    const participantsSnap = await roomRef.collection('participants').get();
    /* 수동 청소는 곧 메시지 전체 삭제하므로 전체 messages .get() 생략(OOM/타임아웃 방지).
       미활동 판별은 participants의 joinedAt / lastMessageAt만 사용(전송 시 클라이언트가 갱신). */
    const messagesSnap = isManualCleanup
      ? { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }
      : await roomRef.collection('messages').get();

    const lastMessageByParticipant = new Map<string, number>();
    const notifyUidByParticipant = new Map<string, string>();
    messagesSnap.docs.forEach((messageDoc) => {
      const data = messageDoc.data();
      const messageUid = String(data.uid || '').trim();
      if (!messageUid || messageUid === '__system__' || messageUid === 'system') {
        return;
      }
      const participantDocId = String(data.senderParticipantDocId || messageUid).trim();
      if (!participantDocId) return;
      const messageMs = getMessageMillis(data);
      if (!messageMs) return;
      lastMessageByParticipant.set(
        participantDocId,
        Math.max(lastMessageByParticipant.get(participantDocId) || 0, messageMs)
      );
      notifyUidByParticipant.set(participantDocId, messageUid);
    });

    const activityByParticipant = new Map<
      string,
      { activityMs: number; nickname: string; notifyUid: string }
    >();

    participantsSnap.docs.forEach((participantDoc) => {
      const participant = participantDoc.data();
      const participantDocId = participantDoc.id;
      if (!participantDocId || participantDocId === roomOwnerUid) return;

      const nickname = String(participant.nickname || '익명').trim() || '익명';
      const joinedMs = toMillis(participant.joinedAt);
      const storedLastMessageMs = toMillis(participant.lastMessageAt);
      const activityMs = Math.max(
        joinedMs,
        storedLastMessageMs,
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
        notifyUid
      });
    });

    const warningMessages: string[] = [];
    const kickTargets: KickTarget[] = [];

    for (const [participantDocId, { activityMs, nickname, notifyUid }] of activityByParticipant.entries()) {
      if (!activityMs) continue;

      const inactiveDays = Math.floor((nowMs - activityMs) / DAY_MS);
      if (inactiveDays >= INACTIVE_KICK_DAYS) {
        kickTargets.push({
          participantDocId,
          nickname,
          notifyUid
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

    if (isManualCleanup) {
      await deleteCollectionInBatches(roomRef.collection('messages'));
    }

    let clientSort = nowMs;
    if (isManualCleanup) {
      await addSystemMessage(roomId, `${CLEANUP_BOT}: 채팅방 청소를 시작합니다`, clientSort++);
    }
    for (const warningText of warningMessages) {
      await addSystemMessage(roomId, warningText, clientSort++);
    }

    const banUntilMs = nowMs + BAN_DAYS * DAY_MS;
    const banUntil = admin.firestore.Timestamp.fromMillis(banUntilMs);
    const banUpdate: Record<string, unknown> = {};
    const kickReason: 'manual_cleanup' | 'auto_inactive' = isManualCleanup
      ? 'manual_cleanup'
      : 'auto_inactive';

    const bannedParticipantIds = (room.bannedParticipantIds as string[] | undefined) || [];

    for (const target of kickTargets) {
      banUpdate[`banUntilByParticipantId.${target.participantDocId}`] = banUntil;
      await roomRef.collection('participants').doc(target.participantDocId).delete();

      await addSystemMessage(
        roomId,
        isManualCleanup
          ? `${CLEANUP_BOT}: "${target.nickname}"님이 5일 이상 미활동으로보내졌습니다.`
          : `${CLEANUP_BOT}: "${target.nickname}"님이 5일 이상 활동이 없어 자동으로보내졌습니다.`,
        clientSort++
      );
      if (target.notifyUid) {
        await createKickNotification(
          target.notifyUid,
          roomId,
          roomTitle,
          banUntilMs,
          kickReason
        );
      }
    }

    if (Object.keys(banUpdate).length > 0) {
      const mergedBanned = Array.from(
        new Set([...bannedParticipantIds, ...kickTargets.map((t) => t.participantDocId)])
      );
      await roomRef.set(
        {
          ...banUpdate,
          bannedParticipantIds: mergedBanned,
          coHostParticipantIds: coHostParticipantIds.filter(
            (id) => !kickTargets.some((t) => t.participantDocId === id)
          ),
          coHostUids: coHostUids.filter(
            (uid) => !kickTargets.some((t) => t.participantDocId === uid)
          )
        },
        { merge: true }
      );
    }

    if (isManualCleanup) {
      await addSystemMessage(roomId, `${CLEANUP_BOT}: 청소가 완료되었습니다`, clientSort++);
      await roomRef.set({ isFrozen: false }, { merge: true });
    }

    return {
      kickedCount: kickTargets.length,
      warningCount: warningMessages.length
    };
  } catch (error) {
    if (isManualCleanup) {
      await roomRef.set({ isFrozen: false }, { merge: true }).catch(() => undefined);
    }
    throw error;
  }
};

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
