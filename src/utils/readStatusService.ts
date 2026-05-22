import { 
  doc, 
  updateDoc, 
  arrayUnion, 
  increment, 
  getDoc, 
  getDocs, 
  collection, 
  onSnapshot,
  serverTimestamp,
  type QuerySnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { isLegacySubParticipantDocId, NERAE_SUB_SEP } from './anonymousChatNeraePersona';

// 읽음 상태 인터페이스
export interface ReadStatus {
  messageId: string;
  readCount: number;
  totalCount: number;
  readByUsers: ReadByUser[];
  unreadUsers: UnreadUser[];
  readPercentage: number;
}

export interface ReadByUser {
  uid: string;
  nickname: string;
  role: string;
  readAt: any;
  profileImageUrl?: string;
}

export interface UnreadUser {
  uid: string;
  nickname: string;
  role: string;
  profileImageUrl?: string;
}

// 공지방 메시지를 읽음으로 표시
export const markAnnouncementMessageAsRead = async (messageId: string, userId: string): Promise<void> => {
  try {
    const messageRef = doc(db, 'conversations', 'announcement', 'messages', messageId);
    
    // 현재 메시지 확인
    const messageDoc = await getDoc(messageRef);
    if (!messageDoc.exists()) {
      console.error('Message not found:', messageId);
      return;
    }
    
    const messageData = messageDoc.data();
    const readBy = messageData.readBy || {};
    
    // 이미 읽은 메시지인지 확인
    if (readBy[userId]) {
      console.log(`Message ${messageId} already read by user ${userId}`);
      return;
    }
    
    // 메시지에 읽음 정보 추가
    await updateDoc(messageRef, {
      [`readBy.${userId}`]: serverTimestamp(),
      readCount: increment(1)
    });
    
    console.log(`Message ${messageId} marked as read by user ${userId}`);
  } catch (error) {
    console.error('Error marking message as read:', error);
  }
};

// 특정 메시지의 읽음 상태 조회
export const getMessageReadStatus = async (messageId: string): Promise<ReadStatus | null> => {
  try {
    // 메시지 정보 가져오기
    const messageRef = doc(db, 'conversations', 'announcement', 'messages', messageId);
    const messageDoc = await getDoc(messageRef);
    
    if (!messageDoc.exists()) {
      console.error('Message not found:', messageId);
      return null;
    }
    
    const messageData = messageDoc.data();
    const readBy = messageData.readBy || {};
    const readUserIds = Object.keys(readBy);
    
    // 전체 사용자 목록 가져오기
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const allUsers = usersSnapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data() as any
    }));
    
    // 차단된 사용자 제외
    const bannedSnapshot = await getDocs(collection(db, 'announcementBanned'));
    const bannedUserIds = bannedSnapshot.docs.map(doc => doc.data().uid);
    
    const activeUsers = allUsers.filter(user => !bannedUserIds.includes(user.uid));
    
    // 읽은 사용자 정보
    const readByUsers: ReadByUser[] = readUserIds
      .map(uid => {
        const user = activeUsers.find(u => u.uid === uid);
        if (!user) return null;
        
        return {
          uid,
          nickname: user.nickname || 'Unknown',
          role: user.role || '일반',
          readAt: readBy[uid],
          profileImageUrl: user.profileImageUrl
        };
      })
      .filter(Boolean) as ReadByUser[];
    
    // 안읽은 사용자 정보
    const unreadUsers: UnreadUser[] = activeUsers
      .filter(user => !readUserIds.includes(user.uid))
      .map(user => ({
        uid: user.uid,
        nickname: user.nickname || 'Unknown',
        role: user.role || '일반',
        profileImageUrl: user.profileImageUrl
      }));
    
    // 역할별 정렬 (리더 > 운영진 > 부운영진 > 일반)
    const sortByRole = (a: { role: string }, b: { role: string }) => {
      const roleOrder = { '리더': 4, '운영진': 3, '부운영진': 2, '일반': 1 };
      const aOrder = roleOrder[a.role as keyof typeof roleOrder] || 0;
      const bOrder = roleOrder[b.role as keyof typeof roleOrder] || 0;
      return bOrder - aOrder;
    };
    
    readByUsers.sort(sortByRole);
    unreadUsers.sort(sortByRole);
    
    const totalCount = activeUsers.length;
    const readCount = readByUsers.length;
    const readPercentage = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;
    
    return {
      messageId,
      readCount,
      totalCount,
      readByUsers,
      unreadUsers,
      readPercentage
    };
    
  } catch (error) {
    console.error('Error getting read status:', error);
    return null;
  }
};

// 읽음 상태 실시간 구독
export const subscribeToMessageReadStatus = (
  messageId: string, 
  callback: (status: ReadStatus | null) => void
): () => void => {
  const messageRef = doc(db, 'conversations', 'announcement', 'messages', messageId);
  
  return onSnapshot(messageRef, async () => {
    const status = await getMessageReadStatus(messageId);
    callback(status);
  });
};

// 사용자가 공지방에 들어올 때 모든 메시지를 읽음으로 처리
export const markAllAnnouncementMessagesAsRead = async (userId: string): Promise<void> => {
  try {
    const messagesSnapshot = await getDocs(
      collection(db, 'conversations', 'announcement', 'messages')
    );
    
    const batch = messagesSnapshot.docs.map(async (messageDoc) => {
      const messageData = messageDoc.data();
      const readBy = messageData.readBy || {};
      
      // 이미 읽은 메시지는 건너뛰기
      if (readBy[userId]) return;
      
      await markAnnouncementMessageAsRead(messageDoc.id, userId);
    });
    
    await Promise.all(batch);
    console.log(`All announcement messages marked as read for user ${userId}`);
  } catch (error) {
    console.error('Error marking all messages as read:', error);
  }
};

// 특정 역할의 사용자들이 메시지를 읽었는지 확인
export const checkRoleReadStatus = async (
  messageId: string, 
  targetRole: string
): Promise<{ read: number; total: number; percentage: number }> => {
  try {
    const status = await getMessageReadStatus(messageId);
    if (!status) return { read: 0, total: 0, percentage: 0 };
    
    const roleUsers = [...status.readByUsers, ...status.unreadUsers]
      .filter(user => user.role === targetRole);
    
    const readUsers = status.readByUsers.filter(user => user.role === targetRole);
    
    return {
      read: readUsers.length,
      total: roleUsers.length,
      percentage: roleUsers.length > 0 ? Math.round((readUsers.length / roleUsers.length) * 100) : 0
    };
  } catch (error) {
    console.error('Error checking role read status:', error);
    return { read: 0, total: 0, percentage: 0 };
  }
};

// 사용자의 공지방 안읽은 메시지 수 확인
export const getAnnouncementUnreadCount = async (userId: string): Promise<number> => {
  try {
    const messagesSnapshot = await getDocs(
      collection(db, 'conversations', 'announcement', 'messages')
    );
    
    let unreadCount = 0;
    
    for (const messageDoc of messagesSnapshot.docs) {
      const messageData = messageDoc.data();
      
      // 시스템 메시지는 제외
      if (messageData.fromUid === 'system') continue;
      
      // 본인이 보낸 메시지는 제외
      if (messageData.fromUid === userId) continue;
      
      const readBy = messageData.readBy || {};
      
      // 읽지 않은 메시지인 경우
      if (!readBy[userId]) {
        unreadCount++;
      }
    }
    
    return unreadCount;
  } catch (error) {
    console.error('Error getting announcement unread count:', error);
    return 0;
  }
};

// 공지방 안읽은 메시지 수 실시간 구독
export const subscribeToAnnouncementUnreadCount = (
  userId: string,
  callback: (count: number) => void
): (() => void) => {
  const messagesRef = collection(db, 'conversations', 'announcement', 'messages');
  
  return onSnapshot(messagesRef, async () => {
    const count = await getAnnouncementUnreadCount(userId);
    callback(count);
  });
};

// ── 익명채팅 안 읽은 메시지 수 ──

const toMillis = (v: any): number => {
  if (!v) return 0;
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  if (typeof v?.seconds === 'number') {
    const nanos = typeof v?.nanoseconds === 'number' ? v.nanoseconds : 0;
    return v.seconds * 1000 + Math.floor(nanos / 1_000_000);
  }
  if (typeof v === 'number') return v > 1_000_000_000_000 ? v : v * 1000;
  const parsed = new Date(v).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** 메시지 문서 기준 생성 시각(ms) — 채팅방 UI와 동일하게 createdAt / createdAtClient 병합 */
const anonymousMessageCreatedMs = (data: Record<string, unknown>): number => {
  const serverMs = toMillis(data.createdAt);
  const clientRaw = data.createdAtClient;
  const clientMs = typeof clientRaw === 'number' ? toMillis(clientRaw) : 0;
  return Math.max(serverMs, clientMs);
};

/**
 * 사용자가 참여 중인 모든 익명채팅 방의 안 읽은 메시지 총합을 실시간 구독합니다.
 * 각 방의 `participants/*` 중 본인(·부계정) `lastReadAt` 워터마크와 메시지 생성 시각을 비교합니다.
 */
export const subscribeToAnonymousChatUnreadCount = (
  userId: string,
  callback: (count: number) => void
): (() => void) => {
  const roomsRef = collection(db, 'anonymousChatRooms');
  const unsubscribers: (() => void)[] = [];
  let ownedSubDocIds: string[] = [];

  let roomUnreadMap: Record<string, number> = {};

  type MsgRow = { uid: string; createdAtMs: number; isSystem: boolean };

  type RoomBuffers = {
    participantSnap: QuerySnapshot | null;
    msgs: MsgRow[];
  };

  const buffers = new Map<string, RoomBuffers>();

  const emitTotal = () => {
    const total = Object.values(roomUnreadMap).reduce((s, n) => s + n, 0);
    callback(total);
  };

  const isOwnedParticipant = (participantDocId: string, data: Record<string, unknown>) => {
    if (participantDocId === userId) return true;
    if (ownedSubDocIds.includes(participantDocId)) return true;
    const fromField = String(data.ownerUid || '').trim();
    if (fromField === userId) return true;
    const subIdx = participantDocId.indexOf(NERAE_SUB_SEP);
    if (subIdx >= 0 && participantDocId.slice(0, subIdx) === userId) return true;
    return false;
  };

  const isMessageFromSelf = (senderUid: string) => {
    if (!senderUid) return false;
    if (senderUid === userId) return true;
    if (ownedSubDocIds.includes(senderUid)) return true;
    if (isLegacySubParticipantDocId(senderUid)) {
      const idx = senderUid.indexOf(NERAE_SUB_SEP);
      if (idx >= 0 && senderUid.slice(0, idx) === userId) return true;
    }
    return false;
  };

  const recalcRoom = (roomId: string) => {
    const buf = buffers.get(roomId);
    if (!buf) return;

    let ownedLastReadMs: number[] = [];
    if (buf.participantSnap) {
      ownedLastReadMs = buf.participantSnap.docs
        .filter((participantDoc) => isOwnedParticipant(participantDoc.id, participantDoc.data()))
        .map((participantDoc) => toMillis(participantDoc.data().lastReadAt));
    }

    if (ownedLastReadMs.length === 0) {
      roomUnreadMap[roomId] = 0;
      emitTotal();
      return;
    }

    /** 본계·부계 중 하나라도 해당 시점까지 읽었으면 읽음으로 간주 (AND 조건은 미읽음 과대 집계 유발) */
    const readWatermarkMs = Math.max(0, ...ownedLastReadMs);

    roomUnreadMap[roomId] = buf.msgs.filter((m) => {
      if (!m.uid || m.isSystem) return false;
      if (isMessageFromSelf(m.uid)) return false;
      return m.createdAtMs > readWatermarkMs;
    }).length;

    emitTotal();
  };

  const unsubProfile = onSnapshot(doc(db, 'anonymousChatProfiles', userId), (snap) => {
    const subs = snap.exists()
      ? ((snap.data().subAccounts as { id?: string }[] | undefined) || [])
          .map((item) => String(item.id || '').trim())
          .filter(Boolean)
      : [];
    ownedSubDocIds = subs;
    buffers.forEach((_buf, roomId) => recalcRoom(roomId));
  });

  const unsubRooms = onSnapshot(roomsRef, (roomsSnap) => {
    unsubscribers.forEach((fn) => fn());
    unsubscribers.length = 0;
    buffers.clear();
    roomUnreadMap = {};

    if (roomsSnap.empty) {
      emitTotal();
      return;
    }

    for (const roomDoc of roomsSnap.docs) {
      const roomId = roomDoc.id;

      buffers.set(roomId, { participantSnap: null, msgs: [] });

      const participantsRef = collection(db, 'anonymousChatRooms', roomId, 'participants');
      const messagesRef = collection(db, 'anonymousChatRooms', roomId, 'messages');

      const unsubParticipant = onSnapshot(participantsRef, (snap) => {
        const buf = buffers.get(roomId);
        if (!buf) return;
        buf.participantSnap = snap;
        recalcRoom(roomId);
      });

      const unsubMsgs = onSnapshot(messagesRef, (msgsSnap) => {
        const buf = buffers.get(roomId);
        if (!buf) return;
        buf.msgs = msgsSnap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const uid = String(data.uid || '');
          const senderLabel = String(data.senderLabel || '').toLowerCase();
          const isSystem =
            uid === '__system__' ||
            uid === 'system' ||
            senderLabel === 'system';
          return {
            uid,
            createdAtMs: anonymousMessageCreatedMs(data),
            isSystem
          };
        });
        recalcRoom(roomId);
      });

      unsubscribers.push(unsubParticipant, unsubMsgs);
    }
  });

  return () => {
    unsubProfile();
    unsubRooms();
    unsubscribers.forEach((fn) => fn());
    buffers.clear();
  };
}; 