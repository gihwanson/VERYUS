// 간단한 localStorage 기반 게시판 알림 시스템

interface VisitRecord {
  [boardType: string]: number; // timestamp
}

const VISIT_STORAGE_KEY = 'veryus_board_visits';

// 게시판 방문 기록 저장
export const markBoardAsVisited = (userId: string, boardType: string) => {
  try {
    const key = `${VISIT_STORAGE_KEY}_${userId}`;
    const existingData = localStorage.getItem(key);
    const visits: VisitRecord = existingData ? JSON.parse(existingData) : {};
    
    visits[boardType] = Date.now();
    localStorage.setItem(key, JSON.stringify(visits));
    
    console.log(`${boardType} 게시판 방문 기록 저장됨`);
  } catch (error) {
    console.error('게시판 방문 기록 저장 에러:', error);
  }
};

// 게시판에 새 게시글이 있는지 확인 (항상 false 반환하여 알림 숨김)
export const hasNewPosts = (userId: string, boardType: string): boolean => {
  try {
    const key = `${VISIT_STORAGE_KEY}_${userId}`;
    const existingData = localStorage.getItem(key);
    
    if (!existingData) {
      return true; // 처음 방문하는 경우만 알림 표시
    }
    
    const visits: VisitRecord = JSON.parse(existingData);
    return !visits[boardType]; // 방문 기록이 없으면 true, 있으면 false
  } catch (error) {
    console.error('게시판 알림 확인 에러:', error);
    return false;
  }
};

// 모든 게시판 알림 상태 가져오기
export const getAllBoardNotificationStatus = (userId: string) => {
  const boardTypes = ['free', 'recording', 'evaluation', 'partner'];
  
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