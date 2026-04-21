import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { MentionsInput, Mention } from 'react-mentions';
import { getUserMentions } from '../utils/getUserMentions';
import type { UserMention } from '../utils/getUserMentions';
import mentionsStyle from '../styles/mentionsStyle';
import { NotificationService } from '../utils/notificationService';
import {
  type Comment,
  type User as CommentUser,
  type Post,
  submitComment,
  submitReply,
  sendMessage,
  toggleCommentLike,
  deleteComment,
  subscribeToComments,
  getPostTypeFromPath,
  getFlatComments,
  isCommentVisible
} from './CommentSectionUtils';

interface CommentSectionProps {
  postId: string;
  user: CommentUser | null;
  post: Post;
  noCommentAuthMessage?: string;
  emptyCommentMessageVisibleToRoles?: string[];
}

interface UserData {
  grade?: string;
  role?: string;
  position?: string;
}

const EVALUATOR_ALIAS = '평가자';

// 등급 이모지 매핑 - 체리만 사용
const gradeEmojis = ['🍒'];
const gradeToEmoji: { [key: string]: string } = {
  '체리': '🍒',
  '블루베리': '🍒',
  '키위': '🍒',
  '사과': '🍒',
  '멜론': '🍒',
  '수박': '🍒',
  '지구': '🍒',
  '토성': '🍒',
  '태양': '🍒',
  '은하': '🍒',
  '맥주': '🍒',
  '번개': '🍒',
  '별': '🍒',
  '달': '🍒'
};

const emojiToGrade: { [key: string]: string } = {
  '🍒': '체리',
  '🫐': '체리',
  '🥝': '체리',
  '🍎': '체리',
  '🍈': '체리',
  '🍉': '체리',
  '🌍': '체리',
  '🪐': '체리',
  '☀️': '체리',
  '🌌': '체리',
  '🍺': '체리',
  '⚡': '체리',
  '⭐': '체리',
  '🌙': '체리'
};

const CommentSection: React.FC<CommentSectionProps> = ({ postId, user, post, noCommentAuthMessage, emptyCommentMessageVisibleToRoles }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageRecipient, setMessageRecipient] = useState<{uid: string, nickname: string} | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<UserMention[]>([]);
  const mentionsInputRef = useRef<any>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [commentAsEvaluator, setCommentAsEvaluator] = useState(false);
  const [commentAsAnonymous, setCommentAsAnonymous] = useState(false);

  // Memoized values
  const flatComments = useMemo(() => getFlatComments(comments), [comments]);
  const postType = useMemo(() => getPostTypeFromPath(), []);
  const canUseEvaluatorAlias = useMemo(() => {
    if (!user) return false;
    if (postType !== 'evaluation') return false;
    return (user.role || '').trim() === EVALUATOR_ALIAS || (user.position || '').trim() === EVALUATOR_ALIAS;
  }, [user, postType]);
  const effectiveCommentNickname = useMemo(() => {
    if (canUseEvaluatorAlias && commentAsEvaluator) return EVALUATOR_ALIAS;
    return user?.nickname || '익명';
  }, [canUseEvaluatorAlias, commentAsEvaluator, user]);
  const canComment = useMemo(() => {
    if (!user) return false;
    // 평가게시판의 경우: 너래 또는 은하 등급 또는 리더/부운영진만 댓글 작성 가능
    if (noCommentAuthMessage) {
      return user.nickname === '너래' || 
             user.grade === '🌌' || 
             user.role === '리더' || 
             user.role === '부운영진';
    }
    // 일반 게시판은 모두 댓글 작성 가능
    return true;
  }, [user, noCommentAuthMessage]);
  const shouldShowEmptyMessage = useMemo(() => {
    if (!user || !emptyCommentMessageVisibleToRoles) return false;
    return emptyCommentMessageVisibleToRoles.includes(user.role || '');
  }, [user, emptyCommentMessageVisibleToRoles]);

  // Callbacks
  const handleCommentsUpdate = useCallback((commentsData: Comment[]) => {
    setComments(commentsData);
    setIsLoading(false);
  }, []);

  const handleCommentsError = useCallback((error: Error) => {
    console.error('댓글 구독 에러:', error);
    setIsLoading(false);
  }, []);

  const handleSubmitComment = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;

    try {
      setIsSubmitting(true);
      const realNickname = user.nickname || '익명';
      const writerNickname = commentAsAnonymous ? '익명' : effectiveCommentNickname;
      await submitComment(
        postId,
        newComment,
        user,
        false,
        post,
        writerNickname,
        commentAsAnonymous,
        commentAsAnonymous ? realNickname : undefined,
        canUseEvaluatorAlias && commentAsEvaluator && !commentAsAnonymous
      );
      setNewComment('');
      setCommentAsAnonymous(false);
    } catch (error) {
      console.error('댓글 작성 에러:', error);
      alert('댓글 작성 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }, [user, newComment, postId, post, effectiveCommentNickname, commentAsAnonymous, canUseEvaluatorAlias, commentAsEvaluator]);

  const handleSubmitReply = useCallback(async (parentId: string) => {
    if (!user || !replyContent.trim()) return;

    try {
      setIsSubmitting(true);
      const realNickname = user.nickname || '익명';
      const writerNickname = commentAsAnonymous ? '익명' : effectiveCommentNickname;
      await submitReply(
        postId,
        parentId,
        replyContent,
        user,
        false,
        post,
        writerNickname,
        commentAsAnonymous,
        commentAsAnonymous ? realNickname : undefined,
        canUseEvaluatorAlias && commentAsEvaluator && !commentAsAnonymous
      );
      setReplyContent('');
      setReplyingTo(null);
      setCommentAsAnonymous(false);
    } catch (error) {
      console.error('대댓글 작성 에러:', error);
      alert('대댓글 작성 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }, [user, replyContent, postId, post, effectiveCommentNickname, commentAsAnonymous, canUseEvaluatorAlias, commentAsEvaluator]);

  const handleSendMessage = useCallback(async () => {
    if (!user || !messageRecipient || !messageContent.trim()) return;

    try {
      setIsSubmitting(true);
      await sendMessage(user, messageRecipient, messageContent);
      setMessageContent('');
      setShowMessageModal(false);
      alert('쪽지를 보냈습니다.');
    } catch (error) {
      console.error('쪽지 전송 에러:', error);
      alert('쪽지 전송 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }, [user, messageRecipient, messageContent]);

  const handleLikeComment = useCallback(async (commentId: string) => {
    if (!user) return;

    try {
      await toggleCommentLike(commentId, user);
    } catch (error) {
      console.error('좋아요 처리 중 에러:', error);
      alert('좋아요 처리 중 오류가 발생했습니다.');
    }
  }, [user]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!window.confirm('정말로 이 댓글을 삭제하시겠습니까?')) return;
    
    try {
      await deleteComment(commentId, postId);
    } catch (err) {
      alert('댓글 삭제 중 오류가 발생했습니다.');
      console.error('댓글 삭제 에러:', err);
    }
  }, [postId]);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
    setReplyContent('');
  }, []);

  const handleInputChange = useCallback((event: any, newValue: string) => {
    setNewComment(newValue);
    // 자동 높이 조절
    setTimeout(() => {
      let textarea: HTMLTextAreaElement | null = null;
      if (mentionsInputRef.current) {
        if (typeof mentionsInputRef.current.querySelector === 'function') {
          textarea = mentionsInputRef.current.querySelector('textarea');
        } else if (mentionsInputRef.current.tagName === 'TEXTAREA') {
          textarea = mentionsInputRef.current as HTMLTextAreaElement;
        }
      }
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(Math.max(textarea.scrollHeight, 80), 200) + 'px';
      }
    }, 0);
  }, []);

  const handleMessageTextareaInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = Math.min(Math.max(target.scrollHeight, 100), 300) + 'px';
  }, []);

  const handleCloseMessageModal = useCallback(() => {
    setShowMessageModal(false);
  }, []);

  const handleMessageModalClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Effects
  useEffect(() => {
    if (!postId) return;

    setIsLoading(true);
    const unsubscribe = subscribeToComments(postId, handleCommentsUpdate, handleCommentsError);
    return () => unsubscribe();
  }, [postId, handleCommentsUpdate, handleCommentsError]);

  useEffect(() => {
    getUserMentions().then(setMentionUsers);
  }, []);

  useEffect(() => {
    if (!canUseEvaluatorAlias) {
      setCommentAsEvaluator(false);
    }
  }, [canUseEvaluatorAlias]);

  // Loading state
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
      {canComment ? (
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
                ref={mentionsInputRef}
                value={newComment}
                onChange={handleInputChange}
                placeholder="댓글을 입력하세요...."
                style={{
                  ...mentionsStyle,
                  control: {
                    ...mentionsStyle.control,
                    minHeight: '80px',
                    maxHeight: '200px'
                  },
                  input: {
                    ...mentionsStyle.input,
                    minHeight: '80px',
                    maxHeight: '200px',
                    overflow: 'auto'
                  }
                }}
                allowSuggestionsAboveCursor
                singleLine={false}
                onBlur={() => setTimeout(() => {}, 200)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onCompositionUpdate={() => setIsComposing(true)}
              >
                <Mention
                  trigger="@"
                  data={mentionUsers.map(u => ({ id: u.nickname, display: u.nickname }))}
                  markup="@{{id}}"
                  appendSpaceOnAdd
                  style={{ backgroundColor: '#F6F2FF', color: '#8A55CC', fontWeight: 600, borderRadius: 4, padding: '2px 4px' }}
                  renderSuggestion={(entry, search, highlightedDisplay, index, focused) => (
                    <div
                      onMouseDown={e => {
                        e.preventDefault();
                        setTimeout(() => {
                          (e.target as HTMLElement).click();
                        }, 0);
                      }}
                      onClick={() => {
                        // react-mentions 내부적으로 하이라이트 처리됨
                      }}
                      style={{
                        background: focused ? '#F6F2FF' : '#fff',
                        color: focused ? '#8A55CC' : '#1F2937',
                        fontWeight: 600,
                        borderRadius: 4,
                        padding: '8px 16px',
                        cursor: 'pointer',
                      }}
                    >
                      {highlightedDisplay}
                    </div>
                  )}
                />
              </MentionsInput>
            )}
            
            <div className="comment-form-footer">
              <div className="comment-form-options">
                <label className="secret-comment-toggle">
                  <input
                    type="checkbox"
                    checked={commentAsAnonymous}
                    onChange={(e) => setCommentAsAnonymous(e.target.checked)}
                  />
                  익명으로 달기
                </label>
                {canUseEvaluatorAlias && (
                  <label className="secret-comment-toggle">
                    <input
                      type="checkbox"
                      checked={commentAsEvaluator}
                      onChange={(e) => setCommentAsEvaluator(e.target.checked)}
                    />
                    평가자로 댓글 달기
                  </label>
                )}
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
          </div>
        </form>
      ) : (
        noCommentAuthMessage && (
          <div style={{ textAlign: 'center', color: '#8A55CC', fontWeight: 600, margin: '18px 0 12px 0', fontSize: '1.05rem' }}>
            {noCommentAuthMessage}
          </div>
        )
      )}

      {/* 댓글 목록 */}
      <div className="comments-list">
        {flatComments.length === 0 ? (
          shouldShowEmptyMessage ? (
            <div className="empty-comments">
              <MessageCircle size={48} />
              <p>아직 댓글이 없습니다. 첫 댓글을 작성해보세요!</p>
            </div>
          ) : null
        ) : (
          flatComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              user={user}
              postId={postId}
              postTitle={post.title}
              postType={postType}
              onReply={setReplyingTo}
              replyingTo={replyingTo}
              replyContent={replyContent}
              setReplyContent={setReplyContent}
              onSubmitReply={handleSubmitReply}
              onCancelReply={handleCancelReply}
              depth={comment.depth}
            />
          ))
        )}
      </div>

      {/* 쪽지 모달 */}
      {showMessageModal && messageRecipient && (
        <div className="modal-overlay" onClick={handleCloseMessageModal}>
          <div className="message-modal" onClick={handleMessageModalClick}>
            <div className="message-modal-header">
              <h3 className="message-modal-title">
                {messageRecipient.nickname}님에게 쪽지 보내기
              </h3>
              <button
                className="close-modal-button"
                onClick={handleCloseMessageModal}
              >
                <X size={20} />
              </button>
            </div>
            <div className="message-form">
              <textarea
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="쪽지 내용을 입력하세요... (Shift+Enter로 줄바꿈)"
                className="message-textarea"
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onCompositionUpdate={() => setIsComposing(true)}
                spellCheck={false}
                autoComplete="off"
                rows={4}
                style={{
                  resize: 'none',
                  overflow: 'hidden',
                  minHeight: '100px',
                  maxHeight: '300px',
                  lineHeight: '1.4'
                }}
                onInput={handleMessageTextareaInput}
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