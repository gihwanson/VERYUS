import React, { useState, useEffect } from 'react';
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
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(comment.likesCount || 0);
  const [writerRole, setWriterRole] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  // 모바일 환경 감지
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;

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

  const handleLike = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    try {
      const commentRef = doc(db, 'comments', comment.id);
      const newIsLiked = !isLiked;

      await updateDoc(commentRef, {
        likedBy: newIsLiked ? arrayUnion(user.uid) : arrayRemove(user.uid),
        likesCount: increment(newIsLiked ? 1 : -1)
      });

      // 좋아요 알림: 댓글 작성자에게(본인이면 생략, 좋아요 취소시에는 알림 보내지 않음)
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

      setIsLiked(newIsLiked);
      setLikesCount(prev => prev + (newIsLiked ? 1 : -1));
    } catch (error) {
      console.error('좋아요 처리 에러:', error);
      alert('좋아요 처리 중 오류가 발생했습니다.');
    }
  };

  const handleEdit = async () => {
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
  };

  const handleDelete = async () => {
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
  };

  const canEdit = user && (user.uid === comment.writerUid);
  const canDelete = user && (user.uid === comment.writerUid || user.role === '운영진' || user.role === '리더' || user.nickname === '너래');

  const formatDate = (timestamp: any) => {
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

  // 카드 색상 클래스 결정
  let cardClass = 'comment-item';
  if (depth === 0) cardClass += ' comment-root';
  else cardClass += ' comment-reply';

  return (
    <div className={cardClass}>
      <div className="comment-header">
        <div className="comment-info">
          <span className="comment-author">{comment.writerNickname}
            {comment.writerGrade && (
              <span className="comment-grade-emoji" title={comment.writerGrade} style={{ marginLeft: '4px' }}>
                {comment.writerGrade}
              </span>
            )}
          </span>
          {writerRole && (
            <span className={`role-badge ${writerRole}`}>
              {writerRole}
            </span>
          )}
          <span className="comment-date">
            <Clock size={14} />
            {formatDate(comment.createdAt)}
          </span>
        </div>
        <div className="comment-actions">
          <button 
            onClick={handleLike}
            className={`like-button ${isLiked ? 'liked' : ''}`}
            disabled={!user}
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
      </div>

      {/* 부모 닉네임이 있으면 답글임을 표시 */}
      {parentAuthor && (
        <div className="reply-to-info">@{parentAuthor} 님에게 답글</div>
      )}

      <div className="comment-content">
        {isEditing ? (
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
                placeholder="댓글을 입력하세요..."
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onCompositionUpdate={() => setIsComposing(true)}
                spellCheck={false}
                autoComplete="off"
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
        ) : (
          <div className="comment-text">
            <TagParser content={comment.content} />
          </div>
        )}
      </div>

      {replyingTo === comment.id && (
        <div className="reply-form">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="답글을 입력하세요..."
            className="reply-input"
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onCompositionUpdate={() => setIsComposing(true)}
            spellCheck={false}
            autoComplete="off"
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
      )}

      {/* 대댓글 목록 삭제: 평면 구조에서는 replies를 렌더링하지 않음 */}
    </div>
  );
};

export default CommentItem; 