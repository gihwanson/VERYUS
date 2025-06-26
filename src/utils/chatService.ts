import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  getDocs,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';

interface Message {
  id: string;
  fromUid: string;
  toUid: string;
  fromNickname: string;
  toNickname: string;
  content: string;
  createdAt: any;
  isRead: boolean;
  postId?: string;
  postTitle?: string;
  fromUserRole?: string;
  fileUrl?: string;
  fileType?: string;
  fileName?: string;
  replyTo?: {
    messageId: string;
    content: string;
    senderNickname: string;
    senderUid: string;
  };
}

// 대화방 ID 생성 함수
export const generateConversationId = (uid1: string, uid2: string, postId?: string): string => {
  if (postId === 'announcement') {
    return 'announcement';
  }
  
  if (postId) {
    // 게시글 관련 대화의 경우
    const sortedUids = [uid1, uid2].sort();
    return `${sortedUids[0]}_${sortedUids[1]}_${postId}`;
  }
  
  // 일반 1:1 대화의 경우
  const sortedUids = [uid1, uid2].sort();
  return `${sortedUids[0]}_${sortedUids[1]}`;
};

// 대화방 생성 또는 업데이트
export const createOrUpdateConversation = async (
  conversationId: string,
  participants: string[],
  lastMessage: any,
  postData?: { postId: string; postTitle: string }
) => {
  const conversationRef = doc(db, 'conversations', conversationId);
  
  const conversationData = {
    participants,
    lastMessage,
    lastUpdated: serverTimestamp(),
    ...(postData && { postId: postData.postId, postTitle: postData.postTitle })
  };
  
  await setDoc(conversationRef, conversationData, { merge: true });
  
  // 참여자 정보도 업데이트
  for (const participantId of participants) {
    const participantRef = doc(db, 'conversations', conversationId, 'participants', participantId);
    await setDoc(participantRef, {
      uid: participantId,
      joinedAt: serverTimestamp(),
      lastReadAt: serverTimestamp()
    }, { merge: true });
  }
};

// 메시지 전송
export const sendMessage = async (
  fromUid: string,
  toUid: string,
  content: string,
  fromNickname: string,
  toNickname: string,
  fromUserRole?: string,
  postData?: { postId: string; postTitle: string },
  fileData?: { fileUrl: string; fileType: string; fileName: string },
  replyTo?: { messageId: string; content: string; senderNickname: string; senderUid: string }
) => {
  const conversationId = generateConversationId(fromUid, toUid, postData?.postId);
  
  // 메시지 추가
  const messageData = {
    fromUid,
    toUid,
    fromNickname,
    toNickname,
    content,
    createdAt: serverTimestamp(),
    isRead: false,
    ...(fromUserRole && { fromUserRole }),
    ...(postData && { postId: postData.postId, postTitle: postData.postTitle }),
    ...(fileData && { fileUrl: fileData.fileUrl, fileType: fileData.fileType, fileName: fileData.fileName }),
    ...(replyTo && { replyTo }),
    // 공지방 메시지의 경우 읽음 상태 추적을 위한 초기값
    ...(toUid === 'announcement' && { readBy: {}, readCount: 0 })
  };
  
  const messageRef = await addDoc(
    collection(db, 'conversations', conversationId, 'messages'),
    messageData
  );
  
  // 대화방 정보 업데이트
  await createOrUpdateConversation(
    conversationId,
    [fromUid, toUid],
    {
      content,
      fromNickname,
      createdAt: serverTimestamp(),
      messageId: messageRef.id
    },
    postData
  );
  
  return messageRef.id;
};

// 사용자의 대화방 목록 구독
export const subscribeToUserConversations = (
  userId: string,
  callback: (conversations: any[]) => void
) => {
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', userId),
    orderBy('lastUpdated', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const conversations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(conversations);
  });
};

// 특정 대화방의 메시지 구독
export const subscribeToConversationMessages = (
  conversationId: string,
  callback: (messages: any[]) => void
) => {
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(messages);
  });
};

// 메시지 읽음 처리
export const markMessagesAsRead = async (
  conversationId: string,
  userId: string
) => {
  const participantRef = doc(db, 'conversations', conversationId, 'participants', userId);
  await updateDoc(participantRef, {
    lastReadAt: serverTimestamp()
  });
};

// 안읽은 메시지 수 계산
export const getUnreadMessageCount = async (
  conversationId: string,
  userId: string
): Promise<number> => {
  try {
    const participantDoc = await getDoc(
      doc(db, 'conversations', conversationId, 'participants', userId)
    );
    
    if (!participantDoc.exists()) return 0;
    
    const lastReadAt = participantDoc.data().lastReadAt;
    if (!lastReadAt) return 0;
    
    const unreadQuery = query(
      collection(db, 'conversations', conversationId, 'messages'),
      where('createdAt', '>', lastReadAt),
      where('fromUid', '!=', userId)
    );
    
    const unreadSnapshot = await getDocs(unreadQuery);
    return unreadSnapshot.size;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
};

// 사용자의 전체 안읽은 메시지 수 계산
export const getTotalUnreadMessageCount = async (userId: string): Promise<number> => {
  try {
    // 사용자가 참여중인 모든 대화방 가져오기
    const conversationsQuery = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', userId)
    );
    
    const conversationsSnapshot = await getDocs(conversationsQuery);
    let totalUnread = 0;
    
    for (const conversationDoc of conversationsSnapshot.docs) {
      const conversationId = conversationDoc.id;
      
      // 공지방은 별도로 계산하므로 제외
      if (conversationId === 'announcement') continue;
      
      const unreadCount = await getUnreadMessageCount(conversationId, userId);
      totalUnread += unreadCount;
    }
    
    return totalUnread;
  } catch (error) {
    console.error('Error getting total unread count:', error);
    return 0;
  }
};

// 전체 안읽은 메시지 수 실시간 구독
export const subscribeToTotalUnreadCount = (
  userId: string,
  callback: (count: number) => void
): (() => void) => {
  const conversationsQuery = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', userId)
  );
  
  return onSnapshot(conversationsQuery, async () => {
    const totalCount = await getTotalUnreadMessageCount(userId);
    callback(totalCount);
  });
};

// 기존 메시지 데이터 마이그레이션 함수
export const migrateExistingMessages = async () => {
  console.log('Starting message migration...');
  
  try {
    // 기존 messages 컬렉션에서 모든 메시지 가져오기
    const messagesSnapshot = await getDocs(collection(db, 'messages'));
    const messages = messagesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Message));
    
    console.log(`Found ${messages.length} messages to migrate`);
    
    // 대화방별로 그룹화
    const conversationGroups: Record<string, any[]> = {};
    
    for (const message of messages) {
      const conversationId = generateConversationId(
        message.fromUid,
        message.toUid,
        message.postId
      );
      
      if (!conversationGroups[conversationId]) {
        conversationGroups[conversationId] = [];
      }
      conversationGroups[conversationId].push(message);
    }
    
    // 각 대화방으로 메시지 이동
    for (const [conversationId, conversationMessages] of Object.entries(conversationGroups)) {
      console.log(`Migrating conversation ${conversationId} with ${conversationMessages.length} messages`);
      
      // 대화방 생성
      const participants = Array.from(new Set(
        conversationMessages.flatMap(msg => [msg.fromUid, msg.toUid])
      ));
      
      const lastMessage = conversationMessages.reduce((latest, msg) => 
        (msg.createdAt?.seconds || 0) > (latest.createdAt?.seconds || 0) ? msg : latest
      );
      
      await createOrUpdateConversation(
        conversationId,
        participants,
        {
          content: lastMessage.content,
          fromNickname: lastMessage.fromNickname,
          createdAt: lastMessage.createdAt,
          messageId: lastMessage.id
        },
        lastMessage.postId ? {
          postId: lastMessage.postId,
          postTitle: lastMessage.postTitle || ''
        } : undefined
      );
      
      // 메시지들을 새 구조로 복사
      for (const message of conversationMessages) {
        const { id, ...messageData } = message;
        await addDoc(
          collection(db, 'conversations', conversationId, 'messages'),
          messageData
        );
      }
    }
    
    console.log('Migration completed successfully!');
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    return false;
  }
}; 