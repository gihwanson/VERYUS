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
export { getGradeEmoji, getGradeName } from '../utils/gradeDisplay';

export interface Comment {
  id: string;
  postId: string;
  content: string;
  writerNickname: string;
  realWriterNickname?: string;
  isAnonymousWriter?: boolean;
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
  isEvaluatorAliasComment?: boolean;
}

export interface User {
  uid: string;
  email: string;
  nickname?: string;
  isLoggedIn: boolean;
  role?: string;
  grade?: string;
  position?: string;
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

// URL 경로로부터 게시판 타입 결정
export const getPostTypeFromPath = (): string => {
  const path = window.location.pathname;
  if (path === '/' || path === '/home') return 'home';
  if (path.includes('/free/')) return 'free';
  if (path.includes('/recording/')) return 'recording';
  if (path.includes('/evaluation/')) return 'evaluation';
  if (path.includes('/balance/')) return 'balance';
  if (path.includes('/boards/partner/')) return 'partner';
  return 'free'; // 기본값
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

const getCommentTime = (comment: Comment): number => {
  const raw = comment.createdAt;
  if (typeof raw === 'number') return raw;
  if (raw?.seconds) return raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1_000_000);
  if (raw?.toMillis) return raw.toMillis();
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

// 댓글 평면 구조로 변환 (depth 정보 포함)
export const getFlatComments = (comments: Comment[]): (Comment & { depth: number })[] => {
  const commentMap = new Map(comments.map((c) => [c.id, c]));
  const childrenMap = new Map<string, Comment[]>();

  comments.forEach((comment) => {
    if (!comment.parentId || !commentMap.has(comment.parentId)) return;
    const siblings = childrenMap.get(comment.parentId) || [];
    siblings.push(comment);
    childrenMap.set(comment.parentId, siblings);
  });

  // 부모 아래의 자식은 시간순으로 정렬
  childrenMap.forEach((children, parentId) => {
    children.sort((a, b) => getCommentTime(a) - getCommentTime(b));
    childrenMap.set(parentId, children);
  });

  const rootComments = comments
    .filter((c) => !c.parentId || !commentMap.has(c.parentId))
    .sort((a, b) => getCommentTime(a) - getCommentTime(b));

  const flatList: (Comment & { depth: number })[] = [];
  const visited = new Set<string>();

  const appendWithChildren = (comment: Comment, depth: number) => {
    if (visited.has(comment.id)) return;
    visited.add(comment.id);
    flatList.push({ ...comment, depth });

    const children = childrenMap.get(comment.id) || [];
    children.forEach((child) => appendWithChildren(child, depth + 1));
  };

  rootComments.forEach((root) => appendWithChildren(root, 0));
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
  post: Post,
  writerNicknameOverride?: string,
  isAnonymousWriter: boolean = false,
  realWriterNicknameOverride?: string,
  isEvaluatorAliasComment: boolean = false
): Promise<void> => {
  const writerNickname = writerNicknameOverride || user.nickname || '익명';
  await addDoc(collection(db, 'comments'), {
    postId,
    content: content.trim(),
    writerNickname,
    realWriterNickname: realWriterNicknameOverride || null,
    isAnonymousWriter,
    writerUid: user.uid,
    isEvaluatorAliasComment,
    createdAt: serverTimestamp(),
    isSecret,
    parentId: null
  });
  
  // 댓글 추가 후 commentCount 증가 및 lastCommentAt 업데이트
  await updateDoc(doc(db, 'posts', postId), {
    commentCount: increment(1),
    lastCommentAt: new Date()
  });
  
  // 댓글 알림: 게시글 작성자에게(본인이면 생략). 메인 본문은 단일 작성자 없음.
  const postType = getPostTypeFromPath();
  if (postType !== 'home' && post.writerUid && user.uid !== post.writerUid) {
    try {
      console.info('[comment] notify:attempt', {
        postId: post.id,
        postType,
        fromUid: user.uid,
        toUid: post.writerUid
      });
      const created = await NotificationService.createCommentNotification(
        post.writerUid,
        user.uid,
        writerNickname,
        post.id,
        post.title,
        postType,
        { commentPreview: content.trim(), isSecret }
      );
      console.info('[comment] notify:result', {
        postId: post.id,
        toUid: post.writerUid,
        created
      });
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
  post: Post,
  writerNicknameOverride?: string,
  isAnonymousWriter: boolean = false,
  realWriterNicknameOverride?: string,
  isEvaluatorAliasComment: boolean = false
): Promise<void> => {
  const writerNickname = writerNicknameOverride || user.nickname || '익명';
  await addDoc(collection(db, 'comments'), {
    postId,
    content: content.trim(),
    writerNickname,
    realWriterNickname: realWriterNicknameOverride || null,
    isAnonymousWriter,
    writerUid: user.uid,
    isEvaluatorAliasComment,
    createdAt: serverTimestamp(),
    isSecret,
    parentId
  });
  
  // 대댓글 추가 후 commentCount 증가 및 lastCommentAt 업데이트
  await updateDoc(doc(db, 'posts', postId), {
    commentCount: increment(1),
    lastCommentAt: new Date()
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
          user.uid,
          writerNickname,
          post.id,
          post.title,
          parentId,
          postType,
          { replyPreview: content.trim(), isSecret }
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
      const uniqueWriterUids = Array.from(
        new Set(
          snapshot.docs
            .map((docSnapshot) => (docSnapshot.data() as DocumentData).writerUid as string | undefined)
            .filter((uid): uid is string => Boolean(uid))
        )
      );

      await Promise.all(uniqueWriterUids.map(async (uid) => {
        try {
          const userDoc = await getDoc(doc(db, 'users', uid));
          const userData = userDoc.data() as UserData | undefined;
          userDataCache.set(uid, userData || {
            grade: '🍒',
            role: '일반',
            position: ''
          });
        } catch {
          userDataCache.set(uid, {
            grade: '🍒',
            role: '일반',
            position: ''
          });
        }
      }));

      snapshot.docs.forEach((docSnapshot) => {
        const commentData = docSnapshot.data() as DocumentData;
        const userData = userDataCache.get(commentData.writerUid as string) || {
          grade: '🍒',
          role: '일반',
          position: ''
        };
        const isEvaluatorAliasComment =
          Boolean(commentData.isEvaluatorAliasComment) || commentData.writerNickname === '평가자';

        commentsData.push({
          id: docSnapshot.id,
          ...commentData,
          writerGrade: isEvaluatorAliasComment ? '🍒' : (userData.grade || commentData.writerGrade || '🍒'),
          writerRole: userData.role || commentData.writerRole || '일반',
          writerPosition: userData.position || commentData.writerPosition || '',
          likedBy: commentData.likedBy || [],
          likesCount: commentData.likesCount || 0
        } as Comment);
      });

      onCommentsUpdate(commentsData);
    },
    onError
  );
}; 