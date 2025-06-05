import React, { useState, useEffect } from 'react';
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
  getDocs,
  writeBatch,
  getDoc,
  deleteDoc,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import CommentItem from './CommentItem';
import TagParser from './TagParser';
import { MessageCircle, Send, Loader, User, Clock, Lock, Reply, MessageSquare, X } from 'lucide-react';
import './CommentSection.css';
import { MentionsInput, Mention } from 'react-mentions';
import { getUserMentions } from '../utils/getUserMentions';
import type { UserMention } from '../utils/getUserMentions';
import mentionsStyle from '../styles/mentionsStyle';

interface Comment {
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

interface User {
  uid: string;
  email: string;
  nickname?: string;
  isLoggedIn: boolean;
<<<<<<< HEAD
=======
  role?: string;
>>>>>>> 6599406 (처음 커밋)
}

interface CommentSectionProps {
  postId: string;
  user: User | null;
  post: {
    id: string;
    title: string;
    writerUid: string;
    writerNickname: string;
  };
<<<<<<< HEAD
=======
  noCommentAuthMessage?: string;
  emptyCommentMessageVisibleToRoles?: string[];
>>>>>>> 6599406 (처음 커밋)
}

interface UserData {
  grade?: string;
  role?: string;
  position?: string;
}

// 등급 이모지 매핑
const gradeEmojis = ['🍒', '🫐', '🥝', '🍎', '🍈', '🍉', '🌍', '🪐', '☀️', '🌌', '🍺', '⚡', '⭐', '🌙'];
const gradeToEmoji: { [key: string]: string } = {
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

const emojiToGrade: { [key: string]: string } = {
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

<<<<<<< HEAD
const CommentSection: React.FC<CommentSectionProps> = ({ postId, user, post }) => {
=======
const CommentSection: React.FC<CommentSectionProps> = ({ postId, user, post, noCommentAuthMessage, emptyCommentMessageVisibleToRoles }) => {
>>>>>>> 6599406 (처음 커밋)
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [isReplySecret, setIsReplySecret] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageRecipient, setMessageRecipient] = useState<{uid: string, nickname: string} | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<UserMention[]>([]);

  // 등급 이모지 매핑 함수
  const getGradeEmoji = (grade: string) => {
    if (gradeEmojis.includes(grade)) {
      return grade;
    }
    return gradeToEmoji[grade] || '🍒';
  };

  // 등급 이름 가져오기
  const getGradeName = (emoji: string) => {
    return emojiToGrade[emoji] || '체리';
  };

  // 댓글 실시간 구독
  useEffect(() => {
    if (!postId) return;

    setIsLoading(true);
      const commentsQuery = query(
        collection(db, 'comments'),
        where('postId', '==', postId),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(
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
        
          setComments(commentsData);
          setIsLoading(false);
        },
        (error) => {
        console.error('댓글 구독 에러:', error);
          setIsLoading(false);
        }
      );

    return () => unsubscribe();
  }, [postId]);

  useEffect(() => {
    getUserMentions().then(setMentionUsers);
  }, []);

<<<<<<< HEAD
  const buildCommentTree = () => {
    const commentMap = new Map<string, Comment>();
    const rootComments: Comment[] = [];
    
    // 모든 댓글을 맵에 저장
    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });
    
    // 댓글 트리 구성
    comments.forEach(comment => {
      const processedComment = commentMap.get(comment.id)!;
      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          if (!parent.replies) parent.replies = [];
          parent.replies.push(processedComment);
        }
      } else {
        rootComments.push(processedComment);
      }
    });

    return rootComments;
  };

=======
  // 댓글 평면 구조로 변환 (depth 정보 포함)
  const getFlatComments = () => {
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
  function isDescendantOfRoot(comment: Comment, rootId: string, commentMap: Map<string, Comment>): boolean {
    let current = comment;
    while (current.parentId) {
      if (current.parentId === rootId) return true;
      const parent = commentMap.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    return false;
  }

>>>>>>> 6599406 (처음 커밋)
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;

    try {
      setIsSubmitting(true);
      await addDoc(collection(db, 'comments'), {
        postId,
        content: newComment.trim(),
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
          await addDoc(collection(db, 'notifications'), {
            toUid: post.writerUid,
            type: 'comment',
            postId: post.id,
            postTitle: post.title,
            fromNickname: user.nickname,
            createdAt: serverTimestamp(),
            isRead: false
          });
        } catch (err) {
          console.error('알림 생성 실패:', err);
        }
      }
      setNewComment('');
      setIsSecret(false);
    } catch (error) {
      console.error('댓글 작성 에러:', error);
      alert('댓글 작성 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!user || !replyContent.trim()) return;

    try {
      setIsSubmitting(true);
      await addDoc(collection(db, 'comments'), {
        postId,
        content: replyContent.trim(),
        writerNickname: user.nickname || '익명',
        writerUid: user.uid,
        createdAt: serverTimestamp(),
        isSecret: isReplySecret,
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
            await addDoc(collection(db, 'notifications'), {
              toUid: parentComment.writerUid,
              type: 'reply',
              postId: post.id,
              postTitle: post.title,
              commentId: parentId,
              fromNickname: user.nickname,
              createdAt: serverTimestamp(),
              isRead: false
            });
          } catch (err) {
            console.error('답글 알림 생성 실패:', err);
          }
        }
      } catch (err) {
        console.error('부모 댓글 정보 조회 실패:', err);
      }
      setReplyContent('');
      setReplyingTo(null);
      setIsReplySecret(false);
    } catch (error) {
      console.error('대댓글 작성 에러:', error);
      alert('대댓글 작성 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendMessage = async () => {
    if (!user || !messageRecipient || !messageContent.trim()) return;

    try {
      setIsSubmitting(true);
      await addDoc(collection(db, 'messages'), {
        fromUid: user.uid,
        fromNickname: user.nickname,
        toUid: messageRecipient.uid,
        toNickname: messageRecipient.nickname,
        content: messageContent.trim(),
        createdAt: serverTimestamp(),
        isRead: false
      });

      setMessageContent('');
      setShowMessageModal(false);
      alert('쪽지를 보냈습니다.');
    } catch (error) {
      console.error('쪽지 전송 에러:', error);
      alert('쪽지 전송 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!user) return;

    try {
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
    } catch (error) {
      console.error('좋아요 처리 중 에러:', error);
      alert('좋아요 처리 중 오류가 발생했습니다.');
    }
  };

  // 댓글/대댓글 삭제
  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('정말로 이 댓글을 삭제하시겠습니까?')) return;
    try {
      await updateDoc(doc(db, 'posts', postId), { commentCount: increment(-1) });
      await updateDoc(doc(db, 'comments', commentId), { content: '[삭제된 댓글입니다.]', isSecret: false });
      // 실제로 완전 삭제하려면 아래 주석 해제
      // await deleteDoc(doc(db, 'comments', commentId));
    } catch (err) {
      alert('댓글 삭제 중 오류가 발생했습니다.');
      console.error('댓글 삭제 에러:', err);
    }
  };

<<<<<<< HEAD
  const commentTree = buildCommentTree();

=======
>>>>>>> 6599406 (처음 커밋)
  const formatDate = (timestamp: any) => {
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

  const isCommentVisible = (comment: Comment) => {
    if (!comment.isSecret) return true;
    if (!user) return false;
    return user.uid === comment.writerUid || user.uid === post.writerUid;
  };

  if (isLoading) {
    return (
      <div className="comment-section loading">
        <div className="loading-spinner">
          <Loader size={24} />
          <span>댓글을 불러오는 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="comment-section">
      <div className="comment-header">
        <h3>
          <MessageCircle size={20} />
          댓글 {comments.length}개
        </h3>
      </div>

      {/* 댓글 작성 폼 */}
<<<<<<< HEAD
      {user && (
=======
      {user && (user.role === '리더' || user.role === '부운영진') ? (
>>>>>>> 6599406 (처음 커밋)
        <form onSubmit={handleSubmitComment} className="comment-form">
          <div className="comment-input-wrapper">
            <div className="input-tabs">
              <button 
                type="button"
                className={`tab-button ${!showPreview ? 'active' : ''}`}
                onClick={() => setShowPreview(false)}
              >
                작성
              </button>
              <button 
                type="button"
                className={`tab-button ${showPreview ? 'active' : ''}`}
                onClick={() => setShowPreview(true)}
              >
                미리보기
              </button>
            </div>
            
            {showPreview ? (
              <div className="preview-content">
                <TagParser content={newComment} />
              </div>
            ) : (
              <MentionsInput
                value={newComment || ''}
                onChange={(event, newValue) => setNewComment(newValue)}
                placeholder="댓글을 입력하세요... (@닉네임으로 태그 가능)"
                style={mentionsStyle}
                allowSuggestionsAboveCursor
                singleLine={false}
                rows={3}
              >
                <Mention
                  trigger="@"
                  data={mentionUsers && mentionUsers.length > 0
                    ? mentionUsers.map(u => ({ id: u.nickname, display: u.nickname }))
                    : []}
                  markup="@{{id}}"
                  appendSpaceOnAdd
                  style={{ backgroundColor: '#F6F2FF', color: '#8A55CC', fontWeight: 600, borderRadius: 4, padding: '2px 4px' }}
                />
              </MentionsInput>
            )}
            
            <div className="comment-form-options">
              <label className="secret-comment-toggle">
                <input
                  type="checkbox"
                  checked={isSecret}
                  onChange={(e) => setIsSecret(e.target.checked)}
                />
                비밀댓글
              </label>
            </div>
            
            <button 
              type="submit" 
              className="comment-submit-btn"
              disabled={isSubmitting || !newComment.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  작성 중...
                </>
              ) : (
                <>
                  <Send size={16} />
                  댓글 작성
                </>
              )}
            </button>
          </div>
        </form>
<<<<<<< HEAD
=======
      ) : (
        noCommentAuthMessage && (
          <div style={{ textAlign: 'center', color: '#8A55CC', fontWeight: 600, margin: '18px 0 12px 0', fontSize: '1.05rem' }}>
            {noCommentAuthMessage}
          </div>
        )
>>>>>>> 6599406 (처음 커밋)
      )}

      {/* 댓글 목록 */}
      <div className="comments-list">
<<<<<<< HEAD
        {commentTree.length === 0 ? (
          <div className="empty-comments">
            <MessageCircle size={48} />
            <p>아직 댓글이 없습니다. 첫 댓글을 작성해보세요!</p>
          </div>
        ) : (
          commentTree.map((comment) => (
=======
        {getFlatComments().length === 0 ? (
          (user && emptyCommentMessageVisibleToRoles && emptyCommentMessageVisibleToRoles.includes(user.role || '')) ? (
            <div className="empty-comments">
              <MessageCircle size={48} />
              <p>아직 댓글이 없습니다. 첫 댓글을 작성해보세요!</p>
            </div>
          ) : null
        ) : (
          getFlatComments().map((comment) => (
>>>>>>> 6599406 (처음 커밋)
            <CommentItem
              key={comment.id}
              comment={comment}
              user={user}
              postId={postId}
              onReply={setReplyingTo}
              replyingTo={replyingTo}
              replyContent={replyContent}
              setReplyContent={setReplyContent}
              onSubmitReply={handleSubmitReply}
              onCancelReply={() => {
                setReplyingTo(null);
                setReplyContent('');
                setIsReplySecret(false);
              }}
<<<<<<< HEAD
=======
              depth={comment.depth}
>>>>>>> 6599406 (처음 커밋)
            />
          ))
        )}
      </div>

      {showMessageModal && messageRecipient && (
        <div className="modal-overlay" onClick={() => setShowMessageModal(false)}>
          <div className="message-modal" onClick={e => e.stopPropagation()}>
            <div className="message-modal-header">
              <h3 className="message-modal-title">
                {messageRecipient.nickname}님에게 쪽지 보내기
              </h3>
              <button
                className="close-modal-button"
                onClick={() => setShowMessageModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="message-form">
              <textarea
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="쪽지 내용을 입력하세요..."
                className="message-textarea"
              />
              <div className="message-form-actions">
                <button
                  className="send-message-button"
                  onClick={handleSendMessage}
                  disabled={isSubmitting || !messageContent.trim()}
                >
                  {isSubmitting ? '전송 중...' : '쪽지 보내기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommentSection; 