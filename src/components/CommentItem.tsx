import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  doc, 
  updateDoc, 
  deleteDoc, 
  arrayUnion, 
  arrayRemove,
  increment,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import TagParser from './TagParser';
import { Heart, MessageCircle, Edit, Trash2, Send, Clock } from 'lucide-react';
import './CommentItem.css';
import { NotificationService } from '../utils/notificationService';

// Types
interface Comment {
  id: string;
  postId: string;
  content: string;
  writerNickname: string;
  writerUid: string;
  createdAt: any;
  parentId?: string | null;
  likedBy: string[];
  likesCount: number;
  replies?: Comment[];
  writerGrade?: string;
}

interface User {
  uid: string;
  email: string;
  nickname?: string;
  role?: string;
  isLoggedIn: boolean;
}

interface CommentItemProps {
  comment: Comment;
  user: User | null;
  postId: string;
  postTitle?: string;
  postType?: string;
  onReply: (commentId: string) => void;
  replyingTo: string | null;
  replyContent: string;
  setReplyContent: (content: string) => void;
  onSubmitReply: (parentId: string) => void;
  onCancelReply: () => void;
  parentAuthor?: string;
  depth?: number;
}

// Constants
const ADMIN_ROLES = ['운영진', '리더'];
const ADMIN_USERS = ['너래'];

// Utility functions
const formatDate = (timestamp: any): string => {
  if (!timestamp) return '';
  
  const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffTime / (1000 * 60));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return '방금 전';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}분 전`;
  } else if (diffHours < 24) {
    return `${diffHours}시간 전`;
  } else if (diffDays < 7) {
    return `${diffDays}일 전`;
  } else {
    return date.toLocaleDateString('ko-KR');
  }
};

const checkAdminAccess = (user: User | null): boolean => {
  if (!user) return false;
  return ADMIN_USERS.includes(user.nickname || '') || 
         Boolean(user.role && ADMIN_ROLES.includes(user.role));
};

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  user,
  postId,
  postTitle,
  postType,
  onReply,
  replyingTo,
  replyContent,
  setReplyContent,
  onSubmitReply,
  onCancelReply,
  parentAuthor,
  depth = 0
}) => {
  // State
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(comment.likesCount || 0);
  const [isLiking, setIsLiking] = useState(false);
  const [writerRole, setWriterRole] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  // Memoized values
  const isMobile = useMemo(() => 
    typeof window !== 'undefined' && window.innerWidth <= 640, 
    []
  );

  const canEdit = useMemo(() => 
    user && user.uid === comment.writerUid, 
    [user, comment.writerUid]
  );

  const canDelete = useMemo(() => 
    user && (user.uid === comment.writerUid || checkAdminAccess(user)), 
    [user, comment.writerUid]
  );

  const cardClass = useMemo(() => {
    let className = 'comment-item';
    if (depth === 0) className += ' comment-root';
    else className += ' comment-reply';
    return className;
  }, [depth]);

  // Effects
  useEffect(() => {
    if (user) {
      setIsLiked(comment.likedBy?.includes(user.uid) || false);
    }
  }, [comment.likedBy, user]);

  useEffect(() => {
    let isMounted = true;

    const fetchWriterRole = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', comment.writerUid));
        if (userDoc.exists() && isMounted) {
          setWriterRole(userDoc.data().role || null);
        }
      } catch (error) {
        console.error('작성자 역할 조회 에러:', error);
      }
    };

    fetchWriterRole();

    return () => {
      isMounted = false;
    };
  }, [comment.writerUid]);

  useEffect(() => {
    setEditContent(comment.content);
  }, [comment.content]);

  useEffect(() => {
    setLikesCount(comment.likesCount || 0);
  }, [comment.likesCount]);

  // Event handlers
  const handleLike = useCallback(async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (isLiking) return;
    setIsLiking(true);

    try {
      const commentRef = doc(db, 'comments', comment.id);
      const newIsLiked = !isLiked;

      // 낙관적 업데이트
      setIsLiked(newIsLiked);
      setLikesCount(prev => prev + (newIsLiked ? 1 : -1));

      // Firebase 업데이트
      await updateDoc(commentRef, {
        likedBy: newIsLiked ? arrayUnion(user.uid) : arrayRemove(user.uid),
        likesCount: increment(newIsLiked ? 1 : -1)
      });

      // 좋아요 알림
      if (newIsLiked && user.uid !== comment.writerUid && postTitle && postType) {
        try {
          await NotificationService.createNotification({
            type: 'like',
            toUid: comment.writerUid,
            fromNickname: user.nickname || '익명',
            postId,
            postTitle,
            postType: postType as any,
            message: `내 댓글을 좋아합니다.`
          });
        } catch (err) {
          console.error('좋아요 알림 생성 실패:', err);
        }
      }
    } catch (error) {
      console.error('좋아요 처리 에러:', error);
      // 상태 롤백
      setIsLiked(!isLiked);
      setLikesCount(prev => prev + (isLiked ? 1 : -1));
      alert('좋아요 처리 중 오류가 발생했습니다.');
    } finally {
      setIsLiking(false);
    }
  }, [user, comment.id, comment.writerUid, isLiked, isLiking, postId, postTitle, postType]);

  const handleEdit = useCallback(async () => {
    if (!editContent.trim()) {
      alert('댓글 내용을 입력해주세요.');
      return;
    }

    try {
      await updateDoc(doc(db, 'comments', comment.id), {
        content: editContent.trim()
      });
      setIsEditing(false);
    } catch (error) {
      console.error('댓글 수정 에러:', error);
      alert('댓글 수정 중 오류가 발생했습니다.');
    }
  }, [comment.id, editContent]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, 'comments', comment.id));
      await updateDoc(doc(db, 'posts', postId), {
        commentCount: increment(-1)
      });
    } catch (error) {
      console.error('댓글 삭제 에러:', error);
      alert('댓글 삭제 중 오류가 발생했습니다.');
    }
  }, [comment.id, postId]);

  const handleTextareaResize = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    const newHeight = Math.min(Math.max(target.scrollHeight, 80), 200);
    target.style.height = newHeight + 'px';
  }, []);

  const handleReplyTextareaResize = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    const newHeight = Math.min(Math.max(target.scrollHeight, 60), 120);
    target.style.height = newHeight + 'px';
  }, []);

  // Render functions
  const renderEditForm = () => (
    <div className="comment-edit">
      <div className="edit-tabs">
        <button 
          className={`tab-button ${!showPreview ? 'active' : ''}`}
          onClick={() => setShowPreview(false)}
        >
          작성
        </button>
        <button 
          className={`tab-button ${showPreview ? 'active' : ''}`}
          onClick={() => setShowPreview(true)}
        >
          미리보기
        </button>
      </div>
      {showPreview ? (
        <div className="preview-content">
          <TagParser content={editContent} />
        </div>
      ) : (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="comment-edit-input"
          rows={3}
          placeholder="댓글을 입력하세요... (Shift+Enter로 줄바꿈)"
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onCompositionUpdate={() => setIsComposing(true)}
          spellCheck={false}
          autoComplete="off"
          style={{
            resize: 'none',
            overflow: 'hidden',
            minHeight: '80px',
            maxHeight: '200px',
            lineHeight: '1.4'
          }}
          onInput={handleTextareaResize}
        />
      )}
      <div className="comment-edit-buttons">
        <button 
          onClick={handleEdit} 
          className="save-btn"
          disabled={!editContent.trim()}
        >
          <Send size={16} />
          저장
        </button>
        <button onClick={() => setIsEditing(false)} className="cancel-btn">
          취소
        </button>
      </div>
    </div>
  );

  const renderReplyForm = () => (
    <div className="reply-form">
      <textarea
        value={replyContent}
        onChange={(e) => setReplyContent(e.target.value)}
        placeholder="답글을 입력하세요... (Shift+Enter로 줄바꿈)"
        className="reply-input"
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onCompositionUpdate={() => setIsComposing(true)}
        spellCheck={false}
        autoComplete="off"
        rows={2}
        style={{
          resize: 'none',
          overflow: 'hidden',
          minHeight: '60px',
          maxHeight: '120px',
          lineHeight: '1.4'
        }}
        onInput={handleReplyTextareaResize}
      />
      <div className="reply-buttons">
        <button 
          onClick={() => onSubmitReply(comment.id)}
          className="submit-reply-btn"
          disabled={!replyContent.trim()}
        >
          <Send size={16} />
          답글 작성
        </button>
        <button 
          onClick={onCancelReply}
          className="cancel-reply-btn"
        >
          취소
        </button>
      </div>
    </div>
  );

  return (
    <div className={cardClass}>
      <div className="comment-header">
        <div className="comment-info">
          <div className="author-info">
            {comment.writerGrade && (
              <span className="comment-grade-emoji" title={comment.writerGrade}>
                {comment.writerGrade}
              </span>
            )}
            <span className="comment-author">{comment.writerNickname}</span>
            <span className={`role-badge ${writerRole || 'general'}`}>
              {writerRole || '일반'}
            </span>
          </div>
          <span className="comment-date">
            <Clock size={14} />
            {formatDate(comment.createdAt)}
          </span>
        </div>
      </div>

      {parentAuthor && (
        <div className="reply-to-info">@{parentAuthor} 님에게 답글</div>
      )}

      <div className="comment-content">
        {isEditing ? renderEditForm() : (
          <div className="comment-text">
            <TagParser content={comment.content} />
          </div>
        )}
      </div>

      <div className="comment-actions">
        <button 
          onClick={handleLike}
          className={`like-button ${isLiked ? 'liked' : ''}`}
          disabled={!user || isLiking}
          title={user ? '좋아요' : '로그인이 필요합니다'}
        >
          <Heart 
            size={16} 
            fill={isLiked ? 'currentColor' : 'none'} 
          />
          <span>{likesCount}</span>
        </button>
        {user && (
          <button 
            onClick={() => onReply(comment.id)}
            className="reply-button"
            title="답글 작성"
          >
            <MessageCircle size={16} />
            답글
          </button>
        )}
        {canEdit && (
          <button 
            onClick={() => setIsEditing(true)}
            className="edit-button"
            title="댓글 수정"
          >
            <Edit size={16} />
          </button>
        )}
        {canDelete && (
          <button 
            onClick={handleDelete}
            className="delete-button"
            title="댓글 삭제"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {replyingTo === comment.id && renderReplyForm()}
    </div>
  );
};

export default CommentItem; 