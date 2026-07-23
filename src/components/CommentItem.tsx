import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  doc, 
  updateDoc, 
  deleteDoc, 
  arrayUnion, 
  arrayRemove,
  increment
} from 'firebase/firestore';
import { db } from '../firebase';
import TagParser from './TagParser';
import MentionInputField from './MentionInputField';
import { Heart, MessageCircle, Edit, Trash2, Send, Clock } from 'lucide-react';
import { getPublicRoleBadge } from '../utils/publicRoleBadge';
import { getPostListGradeSpanProps } from '../utils/gradeDisplay';
import { normalizeMentionMarkup, toMentionInputValue } from '../utils/mentionUtils';
import type { UserMention } from '../utils/getUserMentions';
import './CommentItem.css';
import { NotificationService } from '../utils/notificationService';
import { checkAdminAccess, GRADE_SYSTEM } from './AdminTypes';

interface Comment {
  id: string;
  postId: string;
  content: string;
  writerNickname: string;
  realWriterNickname?: string;
  isAnonymousWriter?: boolean;
  writerUid: string;
  createdAt: any;
  parentId?: string | null;
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
  role?: string;
  isLoggedIn: boolean;
}

interface CommentItemProps {
  comment: Comment;
  user: User | null;
  postId: string;
  postTitle?: string;
  postType?: string;
  mentionUsers?: UserMention[];
  onReply: (commentId: string) => void;
  replyingTo: string | null;
  replyContent: string;
  setReplyContent: (content: string) => void;
  onSubmitReply: (parentId: string) => void;
  onCancelReply: () => void;
  parentAuthor?: string;
  depth?: number;
}

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

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  user,
  postId,
  postTitle,
  postType,
  mentionUsers = [],
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
  const [isLiking, setIsLiking] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

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

  const displayAuthorName = useMemo(() => {
    const baseNickname = comment.writerNickname || '익명';
    const isNoraeViewer = user?.nickname === '너래';
    if (!isNoraeViewer || !comment.isAnonymousWriter) return baseNickname;
    const realNickname = (comment.realWriterNickname || '').trim();
    if (!realNickname || realNickname === baseNickname) return baseNickname;
    return `${baseNickname} (${realNickname})`;
  }, [comment.writerNickname, comment.realWriterNickname, comment.isAnonymousWriter, user?.nickname]);

  const displayGradeSpanProps = useMemo(
    () =>
      getPostListGradeSpanProps(
        comment.isAnonymousWriter ? GRADE_SYSTEM.CHERRY : comment.writerGrade
      ),
    [comment.isAnonymousWriter, comment.writerGrade]
  );

  const displayRoleBadge = useMemo(() => {
    return getPublicRoleBadge(comment.writerRole, comment.writerPosition);
  }, [comment.writerRole, comment.writerPosition]);

  const knownNicknames = useMemo(
    () => mentionUsers.map((u) => u.nickname),
    [mentionUsers]
  );

  useEffect(() => {
    if (user) {
      setIsLiked(comment.likedBy?.includes(user.uid) || false);
    }
  }, [comment.likedBy, user]);

  useEffect(() => {
    if (!isEditing) {
      setEditContent(comment.content);
    }
  }, [comment.content, isEditing]);

  useEffect(() => {
    setLikesCount(comment.likesCount || 0);
  }, [comment.likesCount]);

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

      setIsLiked(newIsLiked);
      setLikesCount(prev => prev + (newIsLiked ? 1 : -1));

      await updateDoc(commentRef, {
        likedBy: newIsLiked ? arrayUnion(user.uid) : arrayRemove(user.uid),
        likesCount: increment(newIsLiked ? 1 : -1)
      });

      if (newIsLiked && user.uid !== comment.writerUid && postTitle && postType) {
        try {
          const fromNick = user.nickname || '익명';
          const message = NotificationService.buildCommentLikeMessage(
            fromNick,
            postTitle,
            postType,
            comment.content || ''
          );
          await NotificationService.createNotification({
            type: 'like',
            toUid: comment.writerUid,
            fromUid: user.uid,
            fromNickname: fromNick,
            postId,
            postTitle,
            postType: postType as any,
            commentId: comment.id,
            message
          });
        } catch (err) {
          console.error('좋아요 알림 생성 실패:', err);
        }
      }
    } catch (error) {
      console.error('좋아요 처리 에러:', error);
      setIsLiked(!isLiked);
      setLikesCount(prev => prev + (isLiked ? 1 : -1));
      alert('좋아요 처리 중 오류가 발생했습니다.');
    } finally {
      setIsLiking(false);
    }
  }, [user, comment.id, comment.writerUid, comment.content, isLiked, isLiking, postId, postTitle, postType]);

  const handleEdit = useCallback(async () => {
    const normalized = normalizeMentionMarkup(editContent).trim();
    if (!normalized) {
      alert('댓글 내용을 입력해주세요.');
      return;
    }

    try {
      await updateDoc(doc(db, 'comments', comment.id), {
        content: normalized
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

  const startEditing = useCallback(() => {
    setEditContent(toMentionInputValue(comment.content, knownNicknames));
    setIsEditing(true);
    setShowPreview(false);
  }, [comment.content, knownNicknames]);

  const renderEditForm = () => (
    <div className="comment-edit">
      <div className="edit-tabs">
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
          <TagParser content={editContent} />
        </div>
      ) : (
        <MentionInputField
          value={editContent}
          onChange={setEditContent}
          mentionUsers={mentionUsers}
          placeholder="댓글을 입력하세요... (@로 사람 태그)"
          minHeight={80}
          maxHeight={200}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
        />
      )}
      <div className="comment-edit-buttons">
        <button 
          type="button"
          onClick={handleEdit} 
          className="save-btn"
          disabled={!editContent.trim()}
        >
          <Send size={16} />
          저장
        </button>
        <button type="button" onClick={() => setIsEditing(false)} className="cancel-btn">
          취소
        </button>
      </div>
    </div>
  );

  const renderReplyForm = () => (
    <div className="reply-form">
      <MentionInputField
        value={replyContent}
        onChange={setReplyContent}
        mentionUsers={mentionUsers}
        placeholder="답글을 입력하세요... (@로 사람 태그)"
        minHeight={60}
        maxHeight={120}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
      />
      <div className="reply-buttons">
        <button 
          type="button"
          onClick={() => onSubmitReply(comment.id)}
          className="submit-reply-btn"
          disabled={!replyContent.trim()}
        >
          <Send size={16} />
          답글 작성
        </button>
        <button 
          type="button"
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
            <span {...displayGradeSpanProps} />
            <span className="comment-author">{displayAuthorName}</span>
            {!comment.isAnonymousWriter && (
              <span className={`role-badge ${displayRoleBadge || 'general'}`}>
                {displayRoleBadge}
              </span>
            )}
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
          type="button"
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
            type="button"
            onClick={() => onReply(comment.id)}
            className="reply-button"
          >
            <MessageCircle size={16} />
            {!isMobile && '답글'}
          </button>
        )}
        {canEdit && (
          <button 
            type="button"
            onClick={startEditing}
            className="edit-button"
          >
            <Edit size={16} />
            {!isMobile && '수정'}
          </button>
        )}
        {canDelete && (
          <button 
            type="button"
            onClick={handleDelete}
            className="delete-button"
          >
            <Trash2 size={16} />
            {!isMobile && '삭제'}
          </button>
        )}
      </div>

      {replyingTo === comment.id && renderReplyForm()}
    </div>
  );
};

export default CommentItem;
