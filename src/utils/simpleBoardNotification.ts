import { doc, increment, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

// 간단한 localStorage 기반 게시판 알림 시스템

interface VisitRecord {
  [boardType: string]: number; // timestamp
}

const VISIT_STORAGE_KEY = 'veryus_board_visits';
const LURKING_POINT_PER_ACTION = 0.1;

export const addLurkingScore = (userId: string, actionKey: string) => {
  if (!userId) return;
  void setDoc(
    doc(db, 'boardVisits', userId),
    {
      userId,
      lurkingScore: increment(LURKING_POINT_PER_ACTION),
      [`lurkingActionCount.${actionKey}`]: increment(1),
      lastUpdated: Timestamp.now()
    },
    { merge: true }
  ).catch((error) => {
    console.error('눈팅 점수 저장 에러:', error);
  });
};

// 게시판 방문 기록 저장
export const markBoardAsVisited = (userId: string, boardType: string) => {
  try {
    const key = `${VISIT_STORAGE_KEY}_${userId}`;
    const existingData = localStorage.getItem(key);
    const visits: VisitRecord = existingData ? JSON.parse(existingData) : {};
    
    visits[boardType] = Date.now();
    localStorage.setItem(key, JSON.stringify(visits));

    // 방문 집계용 카운터는 별도로 누적 저장한다.
    void setDoc(
      doc(db, 'boardVisits', userId),
      {
        userId,
        totalVisitCount: increment(1),
        [`visitCountByBoard.${boardType}`]: increment(1),
        [`lastVisited.${boardType}`]: Timestamp.now(),
        lastUpdated: Timestamp.now()
      },
      { merge: true }
    ).catch((error) => {
      console.error('Firestore 방문 기록 저장 에러:', error);
    });
    
    console.log(`${boardType} 게시판 방문 기록 저장됨`);
  } catch (error) {
    console.error('게시판 방문 기록 저장 에러:', error);
  }
};

// 게시판 마지막 방문 시각 (없으면 null)
export const getBoardLastVisitedAt = (userId: string, boardType: string): number | null => {
  try {
    const key = `${VISIT_STORAGE_KEY}_${userId}`;
    const existingData = localStorage.getItem(key);
    if (!existingData) return null;
    const visits: VisitRecord = JSON.parse(existingData);
    return visits[boardType] ?? null;
  } catch (error) {
    console.error('게시판 방문 시각 조회 에러:', error);
    return null;
  }
};

/** 마지막 게시판 방문 이후 올라온 글이면 true */
export const isPostNewSinceBoardVisit = (
  userId: string | undefined,
  boardType: string,
  createdAtMs: number
): boolean => {
  if (!userId || !createdAtMs) return false;
  const lastVisited = getBoardLastVisitedAt(userId, boardType);
  if (lastVisited === null) return true;
  return createdAtMs > lastVisited;
};

// 게시판에 새 게시글이 있는지 확인 (항상 false 반환하여 알림 숨김)
export const hasNewPosts = (userId: string, boardType: string): boolean => {
  try {
    const lastVisited = getBoardLastVisitedAt(userId, boardType);
    return lastVisited === null;
  } catch (error) {
    console.error('게시판 알림 확인 에러:', error);
    return false;
  }
};

// 모든 게시판 알림 상태 가져오기
export const getAllBoardNotificationStatus = (userId: string) => {
  const boardTypes = ['free', 'recording', 'evaluation', 'hallOfFame', 'partner', 'chorus'];
  
  return boardTypes.map(boardType => ({
    boardType,
    hasNewPosts: hasNewPosts(userId, boardType),
    newPostCount: hasNewPosts(userId, boardType) ? 1 : 0
  }));
};

// 특정 사용자의 모든 방문 기록 초기화 (필요시 사용)
export const clearAllVisitRecords = (userId: string) => {
  try {
    const key = `${VISIT_STORAGE_KEY}_${userId}`;
    localStorage.removeItem(key);
    console.log('모든 게시판 방문 기록 초기화됨');
  } catch (error) {
    console.error('방문 기록 초기화 에러:', error);
  }
}; 