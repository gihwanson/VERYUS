import { 
  doc, 
  updateDoc, 
  arrayUnion, 
  increment, 
  getDoc, 
  getDocs, 
  collection, 
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

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