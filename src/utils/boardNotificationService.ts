import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot,
  where,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

export interface BoardVisitData {
  userId: string;
  lastVisited: {
    free?: Timestamp;
    recording?: Timestamp;
    evaluation?: Timestamp;
    partner?: Timestamp;
  };
}

export interface NewPostNotification {
  boardType: 'free' | 'recording' | 'evaluation' | 'partner';
  hasNewPosts: boolean;
  newPostCount?: number;
}

// 게시판 타입별 컬렉션 매핑 - 모든 게시판이 'posts' 컬렉션 사용
const BOARD_COLLECTIONS = {
  free: 'posts',
  recording: 'posts', 
  evaluation: 'posts',
  partner: 'posts'
} as const;

// 게시판 타입별 필터 매핑
const BOARD_TYPE_FILTERS = {
  free: 'free',
  recording: 'recording',
  evaluation: 'evaluation',
  partner: 'partner'
} as const;

// 사용자의 게시판 방문 시간 업데이트
export const updateBoardVisitTime = async (userId: string, boardType: keyof typeof BOARD_COLLECTIONS) => {
  try {
    const visitDocRef = doc(db, 'boardVisits', userId);
    const visitData = {
      userId,
      [`lastVisited.${boardType}`]: Timestamp.now(),
      lastUpdated: Timestamp.now() // 변경 감지를 위한 필드 추가
    };
    
    await setDoc(visitDocRef, visitData, { merge: true });
    console.log(`${boardType} 게시판 방문 시간 업데이트 완료`);
  } catch (error) {
    console.error('게시판 방문 시간 업데이트 에러:', error);
  }
};

// 사용자의 게시판 방문 시간 가져오기
export const getBoardVisitTimes = async (userId: string): Promise<BoardVisitData | null> => {
  try {
    if (!userId) {
      console.warn('getBoardVisitTimes: userId가 없습니다');
      return null;
    }
    
    const visitDocRef = doc(db, 'boardVisits', userId);
    const visitDoc = await getDoc(visitDocRef);
    
    if (visitDoc.exists()) {
      const data = visitDoc.data() as BoardVisitData;
      // lastVisited가 없으면 빈 객체로 초기화
      if (!data.lastVisited) {
        data.lastVisited = {};
      }
      return data;
    }
    return null;
  } catch (error) {
    console.error('게시판 방문 시간 가져오기 에러:', error);
    return null;
  }
};

// 특정 게시판의 최신 게시글 시간 가져오기
export const getLatestPostTime = async (boardType: keyof typeof BOARD_COLLECTIONS): Promise<Timestamp | null> => {
  try {
    const collectionName = BOARD_COLLECTIONS[boardType];
    const typeFilter = BOARD_TYPE_FILTERS[boardType];
    const q = query(
      collection(db, collectionName),
      where('type', '==', typeFilter),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const latestPost = snapshot.docs[0].data();
      return latestPost.createdAt;
    }
    return null;
  } catch (error) {
    console.error(`${boardType} 게시판 최신 게시글 시간 가져오기 에러:`, error);
    return null;
  }
};

// 특정 게시판의 새 게시글 개수 가져오기
export const getNewPostCount = async (
  userId: string, 
  boardType: keyof typeof BOARD_COLLECTIONS
): Promise<number> => {
  try {
    const visitData = await getBoardVisitTimes(userId);
    const lastVisited = visitData?.lastVisited?.[boardType];
    
    const collectionName = BOARD_COLLECTIONS[boardType];
    const typeFilter = BOARD_TYPE_FILTERS[boardType];
    
    if (!lastVisited) {
      // 처음 방문하는 경우 - 최근 7일 내 게시글만 새 게시글로 간주
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const q = query(
        collection(db, collectionName),
        where('type', '==', typeFilter),
        where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo))
      );
      const snapshot = await getDocs(q);
      return snapshot.size;
    }
    
    const q = query(
      collection(db, collectionName),
      where('type', '==', typeFilter),
      where('createdAt', '>', lastVisited)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    console.error(`${boardType} 게시판 새 게시글 개수 가져오기 에러:`, error);
    return 0;
  }
};

// 모든 게시판의 새 게시글 알림 상태 가져오기
export const getAllBoardNotifications = async (userId: string): Promise<NewPostNotification[]> => {
  const boardTypes: (keyof typeof BOARD_COLLECTIONS)[] = ['free', 'recording', 'evaluation', 'partner'];
  const notifications: NewPostNotification[] = [];
  
  for (const boardType of boardTypes) {
    try {
      const newPostCount = await getNewPostCount(userId, boardType);
      notifications.push({
        boardType,
        hasNewPosts: newPostCount > 0,
        newPostCount
      });
    } catch (error) {
      console.error(`${boardType} 게시판 알림 확인 에러:`, error);
      notifications.push({
        boardType,
        hasNewPosts: false,
        newPostCount: 0
      });
    }
  }
  
  return notifications;
};

// 실시간으로 게시판 알림 상태 구독
export const subscribeToBoardNotifications = (
  userId: string,
  callback: (notifications: NewPostNotification[]) => void
): (() => void) => {
  const unsubscribeFunctions: (() => void)[] = [];
  
  const boardTypes: (keyof typeof BOARD_COLLECTIONS)[] = ['free', 'recording', 'evaluation', 'partner'];
  
  // 방문 기록 변경 감지
  const visitDocRef = doc(db, 'boardVisits', userId);
  const visitUnsubscribe = onSnapshot(visitDocRef, async () => {
    // 방문 기록이 변경될 때마다 알림 상태 업데이트
    const notifications = await getAllBoardNotifications(userId);
    callback(notifications);
  });
  unsubscribeFunctions.push(visitUnsubscribe);
  
  // 각 게시판의 새 게시글 감지
  boardTypes.forEach(boardType => {
    const collectionName = BOARD_COLLECTIONS[boardType];
    const typeFilter = BOARD_TYPE_FILTERS[boardType];
    const q = query(
      collection(db, collectionName),
      where('type', '==', typeFilter),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    
    const unsubscribe = onSnapshot(q, async () => {
      // 게시글이 추가/변경될 때마다 알림 상태 업데이트
      const notifications = await getAllBoardNotifications(userId);
      callback(notifications);
    });
    
    unsubscribeFunctions.push(unsubscribe);
  });
  
  // 초기 데이터 로드
  getAllBoardNotifications(userId).then(callback);
  
  // 모든 구독 해제 함수 반환
  return () => {
    unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
  };
}; 