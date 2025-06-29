import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  updateDoc,
  doc,
  increment,
  getDoc,
  deleteDoc,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import { NotificationService } from '../utils/notificationService';

export interface Comment {
  id: string;
  postId: string;
  content: string;
  writerNickname: string;
  writerUid: string;
  createdAt: any;
  parentId?: string | null;
  isSecret?: boolean;
  likedBy: string[];
  likesCount: number;
  replies?: Comment[];
  writerGrade?: string;
  writerRole?: string;
  writerPosition?: string;
}

export interface User {
  uid: string;
  email: string;
  nickname?: string;
  isLoggedIn: boolean;
  role?: string;
}

export interface UserData {
  grade?: string;
  role?: string;
  position?: string;
}

export interface Post {
  id: string;
  title: string;
  writerUid: string;
  writerNickname: string;
}

// 등급 이모지 매핑
export const gradeEmojis = ['🍒', '🫐', '🥝', '🍎', '🍈', '🍉', '🌍', '🪐', '☀️', '🌌', '🍺', '⚡', '⭐', '🌙'];

export const gradeToEmoji: { [key: string]: string } = {
  '체리': '🍒',
  '블루베리': '🫐',
  '키위': '🥝',
  '사과': '🍎',
  '멜론': '🍈',
  '수박': '🍉',
  '지구': '🌍',
  '토성': '🪐',
  '태양': '☀️',
  '은하': '🌌',
  '맥주': '🍺',
  '번개': '⚡',
  '별': '⭐',
  '달': '🌙'
};

export const emojiToGrade: { [key: string]: string } = {
  '🍒': '체리',
  '🫐': '블루베리',
  '🥝': '키위',
  '🍎': '사과',
  '🍈': '멜론',
  '🍉': '수박',
  '🌍': '지구',
  '🪐': '토성',
  '☀️': '태양',
  '🌌': '은하',
  '🍺': '맥주',
  '⚡': '번개',
  '⭐': '별',
  '🌙': '달'
};

// URL 경로로부터 게시판 타입 결정
export const getPostTypeFromPath = (): string => {
  const path = window.location.pathname;
  if (path.includes('/free/')) return 'free';
  if (path.includes('/recording/')) return 'recording';
  if (path.includes('/evaluation/')) return 'evaluation';
  if (path.includes('/boards/partner/')) return 'partner';
  return 'free'; // 기본값
};

// 등급 이모지 매핑 함수
export const getGradeEmoji = (grade: string): string => {
  if (gradeEmojis.includes(grade)) {
    return grade;
  }
  return gradeToEmoji[grade] || '🍒';
};

// 등급 이름 가져오기
export const getGradeName = (emoji: string): string => {
  return emojiToGrade[emoji] || '체리';
};

// 날짜 포맷팅
export const formatDate = (timestamp: any): string => {
  if (!timestamp) return '';
  
  const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffHours < 1) {
    return '방금 전';
  } else if (diffHours < 24) {
    return `${diffHours}시간 전`;
  } else if (diffDays < 7) {
    return `${diffDays}일 전`;
  } else {
    return date.toLocaleDateString('ko-KR');
  }
};

// 댓글 가시성 확인
export const isCommentVisible = (comment: Comment, user: User | null, postWriterUid: string): boolean => {
  if (!comment.isSecret) return true;
  if (!user) return false;
  return user.uid === comment.writerUid || user.uid === postWriterUid;
};

// 댓글 평면 구조로 변환 (depth 정보 포함)
export const getFlatComments = (comments: Comment[]): (Comment & { depth: number })[] => {
  // 댓글 id로 빠른 접근을 위한 맵 생성
  const commentMap = new Map(comments.map(c => [c.id, c]));
  
  // depth 계산 함수
  const getDepth = (comment: Comment): number => {
    let depth = 0;
    let current = comment;
    while (current.parentId) {
      const parent = commentMap.get(current.parentId);
      if (!parent) break;
      depth++;
      current = parent;
    }
    return depth;
  };
  
  // 원댓글만 추출
  const rootComments = comments.filter(c => !c.parentId);
  
  // 각 원댓글 아래에 해당 원댓글을 부모로 하는 모든 답글(대댓글, 대대댓글 등)을 평면구조로 나열
  const flatList: (Comment & { depth: number })[] = [];
  rootComments.forEach(root => {
    flatList.push({ ...root, depth: 0 });
    // 해당 root 아래의 모든 답글(대댓글, 대대댓글 등)
    comments
      .filter(c => c.parentId && isDescendantOfRoot(c, root.id, commentMap))
      .forEach(reply => {
        flatList.push({ ...reply, depth: getDepth(reply) });
      });
  });
  
  // 시간순(오래된 순) 정렬
  flatList.sort((a, b) => {
    const aTime = a.createdAt?.seconds || a.createdAt || 0;
    const bTime = b.createdAt?.seconds || b.createdAt || 0;
    return aTime - bTime;
  });
  
  return flatList;
};

// 특정 댓글이 rootId를 조상으로 두는지 확인
export const isDescendantOfRoot = (comment: Comment, rootId: string, commentMap: Map<string, Comment>): boolean => {
  let current = comment;
  while (current.parentId) {
    if (current.parentId === rootId) return true;
    const parent = commentMap.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return false;
};

// 댓글 작성
export const submitComment = async (
  postId: string,
  content: string,
  user: User,
  isSecret: boolean,
  post: Post
): Promise<void> => {
  await addDoc(collection(db, 'comments'), {
    postId,
    content: content.trim(),
    writerNickname: user.nickname || '익명',
    writerUid: user.uid,
    createdAt: serverTimestamp(),
    isSecret,
    parentId: null
  });
  
  // 댓글 추가 후 commentCount 증가
  await updateDoc(doc(db, 'posts', postId), {
    commentCount: increment(1)
  });
  
  // 댓글 알림: 게시글 작성자에게(본인이면 생략)
  if (user.uid !== post.writerUid) {
    try {
      const postType = getPostTypeFromPath();
      await NotificationService.createCommentNotification(
        post.writerUid,
        user.nickname || '익명',
        post.id,
        post.title,
        postType
      );
    } catch (err) {
      console.error('알림 생성 실패:', err);
    }
  }
};

// 답글 작성
export const submitReply = async (
  postId: string,
  parentId: string,
  content: string,
  user: User,
  isSecret: boolean,
  post: Post
): Promise<void> => {
  await addDoc(collection(db, 'comments'), {
    postId,
    content: content.trim(),
    writerNickname: user.nickname || '익명',
    writerUid: user.uid,
    createdAt: serverTimestamp(),
    isSecret,
    parentId
  });
  
  // 대댓글 추가 후 commentCount 증가
  await updateDoc(doc(db, 'posts', postId), {
    commentCount: increment(1)
  });
  
  // 답글 알림: 부모 댓글 작성자에게(본인이면 생략)
  try {
    const parentCommentDoc = await getDoc(doc(db, 'comments', parentId));
    const parentComment = parentCommentDoc.data();
    if (parentComment && parentComment.writerUid && parentComment.writerUid !== user.uid) {
      try {
        const postType = getPostTypeFromPath();
        await NotificationService.createReplyNotification(
          parentComment.writerUid,
          user.nickname || '익명',
          post.id,
          post.title,
          parentId,
          postType
        );
      } catch (err) {
        console.error('답글 알림 생성 실패:', err);
      }
    }
  } catch (err) {
    console.error('부모 댓글 정보 조회 실패:', err);
  }
};

// 쪽지 전송
export const sendMessage = async (
  user: User,
  recipient: { uid: string; nickname: string },
  content: string
): Promise<void> => {
  await addDoc(collection(db, 'messages'), {
    fromUid: user.uid,
    fromNickname: user.nickname,
    toUid: recipient.uid,
    toNickname: recipient.nickname,
    content: content.trim(),
    createdAt: serverTimestamp(),
    isRead: false
  });
};

// 댓글 좋아요 처리
export const toggleCommentLike = async (commentId: string, user: User): Promise<void> => {
  const commentRef = doc(db, 'comments', commentId);
  const commentDoc = await getDoc(commentRef);
  const commentData = commentDoc.data();

  if (!commentData) return;

  const likedBy = commentData.likedBy || [];
  const isLiked = likedBy.includes(user.uid);

  // 기존 댓글 데이터 유지를 위해 업데이트할 필드만 지정
  const updateData = {
    likedBy: isLiked 
      ? likedBy.filter((uid: string) => uid !== user.uid)
      : [...likedBy, user.uid],
    likesCount: isLiked 
      ? (commentData.likesCount || 0) - 1 
      : (commentData.likesCount || 0) + 1
  };

  await updateDoc(commentRef, updateData);
};

// 댓글 삭제
export const deleteComment = async (commentId: string, postId: string): Promise<void> => {
  await updateDoc(doc(db, 'posts', postId), { commentCount: increment(-1) });
  await updateDoc(doc(db, 'comments', commentId), { content: '[삭제된 댓글입니다.]', isSecret: false });
  // 실제로 완전 삭제하려면 아래 주석 해제
  // await deleteDoc(doc(db, 'comments', commentId));
};

// 댓글 실시간 구독 설정
export const subscribeToComments = (
  postId: string,
  onCommentsUpdate: (comments: Comment[]) => void,
  onError: (error: Error) => void
) => {
  const commentsQuery = query(
    collection(db, 'comments'),
    where('postId', '==', postId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    commentsQuery,
    async (snapshot) => {
      const commentsData: Comment[] = [];
      const userDataCache = new Map<string, UserData>();
      
      for (const docSnapshot of snapshot.docs) {
        const commentData = docSnapshot.data() as DocumentData;
        
        // 작성자 정보 캐시 확인 또는 가져오기
        let userData: UserData | undefined = userDataCache.get(commentData.writerUid);
        if (!userData) {
          const userDoc = await getDoc(doc(db, 'users', commentData.writerUid));
          userData = userDoc.data() as UserData || {
            grade: '🍒',
            role: '일반',
            position: ''
          };
          userDataCache.set(commentData.writerUid, userData);
        }
        
        // 기존 댓글 데이터를 유지하면서 새로운 데이터 추가
        commentsData.push({
          id: docSnapshot.id,
          ...commentData,
          writerGrade: userData.grade || commentData.writerGrade || '🍒',
          writerRole: userData.role || commentData.writerRole || '일반',
          writerPosition: userData.position || commentData.writerPosition || '',
          likedBy: commentData.likedBy || [],
          likesCount: commentData.likesCount || 0
        } as Comment);
      }
      
      onCommentsUpdate(commentsData);
    },
    onError
  );
}; 