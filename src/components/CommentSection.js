import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { 
  collection, query, orderBy, onSnapshot, addDoc, Timestamp, where, 
  limit, startAfter, getDocs, doc, getDoc 
} from "firebase/firestore";
import { db } from "../firebase";
import CommentItem from "./CommentItem"; 
import { getThemeStyles } from "../components/style";

// 댓글 최대 글자 수
const MAX_COMMENT_LENGTH = 1000;
// 페이지당 댓글 수
const COMMENTS_PER_PAGE = 10;

function CommentSection({ postId, type, darkMode, postOwner, postTitle, globalProfilePics, globalGrades }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [replyCount, setReplyCount] = useState(0);
  const [sortOrder, setSortOrder] = useState("asc"); // asc: 오래된 순, desc: 최신 순
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [newCommentIds, setNewCommentIds] = useState([]);
  const [focusedCommentId, setFocusedCommentId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const textareaRef = useRef(null);
  const commentsEndRef = useRef(null);
  
  const me = localStorage.getItem("nickname");
  
  // 스타일 가져오기
  const styles = getThemeStyles(darkMode);

  // URL에서 댓글 ID 가져오기 (댓글로 직접 이동 시)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const commentId = urlParams.get('comment');
    
    if (commentId) {
      setFocusedCommentId(commentId);
      
      // 해당 댓글이 있는지 확인하고 스크롤
      const checkCommentExists = async () => {
        try {
          const commentRef = doc(db, `${type}-${postId}-comments`, commentId);
          const commentSnap = await getDoc(commentRef);
          
          if (commentSnap.exists()) {
            // 댓글이 존재하면 포커스 설정
            setTimeout(() => {
              const element = document.getElementById(`comment-${commentId}`);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('highlight-comment');
                setTimeout(() => {
                  element.classList.remove('highlight-comment');
                }, 3000);
              }
            }, 1000);
          }
        } catch (error) {
          console.error("댓글 확인 중 오류 발생:", error);
        }
      };
      
      checkCommentExists();
    }
  }, [postId, type]);

  // 댓글 로드
  const loadComments = () => {
    // 정렬 순서에 따른 쿼리 생성
    const commentsQuery = query(
      collection(db, `${type}-${postId}-comments`),
      where("parentId", "==", null), // 루트 댓글만 가져오기
      orderBy("createdAt", sortOrder),
      limit(COMMENTS_PER_PAGE)
    );
    
    // 실시간 업데이트 구독
    const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
      const commentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setComments(commentsData);
      
      // 마지막 문서 저장 (페이지네이션용)
      if (snapshot.docs.length > 0) {
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      } else {
        setHasMore(false);
      }
      
      // 새로운 댓글 표시를 위해 ID 저장
      if (snapshot.docChanges().length > 0) {
        const newIds = snapshot.docChanges()
          .filter(change => change.type === 'added')
          .map(change => change.doc.id);
          
        if (newIds.length > 0) {
          setNewCommentIds(prev => [...prev, ...newIds]);
          // 5초 후 새 댓글 강조 표시 제거
          setTimeout(() => {
            setNewCommentIds(prev => prev.filter(id => !newIds.includes(id)));
          }, 5000);
        }
      }
    });
    
    // 전체 댓글 및 답글 수 가져오기
    const countQuery = collection(db, `${type}-${postId}-comments`);
    const countUnsubscribe = onSnapshot(countQuery, (snapshot) => {
      const allComments = snapshot.docs.map(doc => doc.data());
      const rootCount = allComments.filter(c => !c.parentId).length;
      const replyCount = allComments.filter(c => c.parentId).length;
      
      setCommentCount(rootCount);
      setReplyCount(replyCount);
    });
    
    return () => {
      unsubscribe();
      countUnsubscribe();
    };
  };

  // 초기 댓글 로드
  useEffect(() => {
    const unsubscribe = loadComments();
    return () => unsubscribe();
  }, [postId, type, sortOrder]);

  // 더 많은 댓글 로드
  const loadMoreComments = async () => {
    if (!lastVisible || isLoadingMore) return;
    
    setIsLoadingMore(true);
    
    try {
      const nextQuery = query(
        collection(db, `${type}-${postId}-comments`),
        where("parentId", "==", null),
        orderBy("createdAt", sortOrder),
        startAfter(lastVisible),
        limit(COMMENTS_PER_PAGE)
      );
      
      const snapshot = await getDocs(nextQuery);
      
      if (snapshot.empty) {
        setHasMore(false);
        return;
      }
      
      const newComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setComments(prev => [...prev, ...newComments]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      
      // 더 불러올 댓글이 없으면 hasMore를 false로 설정
      if (snapshot.docs.length < COMMENTS_PER_PAGE) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("댓글 더 불러오기 중 오류 발생:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // 정렬 순서 변경
  const toggleSortOrder = () => {
    const newOrder = sortOrder === "asc" ? "desc" : "asc";
    setSortOrder(newOrder);
    // 정렬 순서가 바뀌면 댓글을 처음부터 다시 로드
    setComments([]);
    setLastVisible(null);
    setHasMore(true);
  };

  // 댓글 추가
  const addComment = async () => {
    const trimmedComment = newComment.trim();
    
    if (!trimmedComment) {
      alert("댓글을 입력하세요");
      return;
    }
    
    if (trimmedComment.length > MAX_COMMENT_LENGTH) {
      alert(`댓글은 최대 ${MAX_COMMENT_LENGTH}자까지 입력 가능합니다`);
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // 댓글 추가
      const commentData = {
        nickname: me,
        text: trimmedComment,
        isPrivate: isPrivate,
        createdAt: Timestamp.now(),
        parentId: null,
        likes: 0,
        likedBy: []
      };
      
      const docRef = await addDoc(collection(db, `${type}-${postId}-comments`), commentData);
      
      // 게시글 작성자에게 알림 추가 (본인이 아닌 경우만)
      if (postOwner !== me) {
        await addDoc(collection(db, "notifications"), {
          receiverNickname: postOwner,
          senderNickname: me,
          type: "comment",
          message: `${me}님이 회원님의 게시글에 댓글을 달았습니다: "${trimmedComment.slice(0, 20)}${trimmedComment.length > 20 ? '...' : ''}"`,
          icon: "💬",
          relatedPostId: postId,
          relatedPostType: type,
          relatedPostTitle: postTitle,
          createdAt: Timestamp.now(),
          isRead: false
        });
      }
      
      // 입력 필드 초기화
      setNewComment("");
      setIsPrivate(false);
      
      // 새 댓글로 스크롤 (최신순일 경우 상단으로, 오래된순일 경우 하단으로)
      if (sortOrder === "desc") {
        setTimeout(() => {
          window.scrollTo({
            top: textareaRef.current?.offsetTop - 100,
            behavior: "smooth"
          });
        }, 300);
      } else {
        setTimeout(() => {
          commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 300);
      }
      
    } catch (error) {
      console.error("댓글 추가 중 오류 발생:", error);
      alert("댓글을 추가하는 중 오류가 발생했습니다");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Enter 키로 댓글 제출 (Shift+Enter는 줄바꿈)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSubmitting && newComment.trim()) {
        addComment();
      }
    }
  };

  // 댓글 취소
  const cancelComment = () => {
    if (newComment.trim() && !window.confirm("작성 중인 댓글을 취소하시겠습니까?")) {
      return;
    }
    setNewComment("");
    setIsPrivate(false);
  };

  // 레이블 및 체크박스 스타일
  const checkboxLabelStyle = {
    display: "flex",
    alignItems: "center",
    marginBottom: 16,
    fontSize: 14,
    color: darkMode ? styles.theme.textMuted : styles.theme.textMuted,
    cursor: "pointer"
  };

  // 댓글 수 표시 스타일
  const commentCountStyle = {
    fontSize: 14,
    color: darkMode ? "#aaa" : "#666",
    margin: "10px 0 20px",
    padding: "8px 16px",
    background: darkMode ? "#444" : "#f3eaff",
    borderRadius: 8,
    display: "inline-block"
  };

  // 댓글 목록 컨테이너 스타일
  const commentsContainerStyle = {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    background: darkMode ? "#2a2a2a" : "#f8f5ff",
    border: `1px solid ${darkMode ? "#444" : "#e0d3ff"}`,
    display: comments.length > 0 ? "block" : "none"
  };

  // 댓글 입력 영역 스타일
  const commentBoxStyle = {
    padding: 16,
    borderRadius: 12,
    background: darkMode ? "#333" : "#f3e7ff",
    border: `1px solid ${darkMode ? "#555" : "#d6c4f2"}`,
    marginBottom: 20,
  };

  // 정렬 버튼 스타일
  const sortButtonStyle = {
    background: "transparent",
    border: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
    color: darkMode ? "#bb86fc" : "#7e57c2",
    cursor: "pointer",
    fontSize: 14,
    padding: "4px 8px",
    borderRadius: 4,
    transition: "background 0.2s",
    hover: {
      background: darkMode ? "#333" : "#eee"
    }
  };

  // 댓글 더 보기 버튼 스타일
  const loadMoreButtonStyle = {
    width: "100%",
    padding: "10px",
    marginTop: "16px",
    marginBottom: "16px",
    background: darkMode ? "#333" : "#ede2fd",
    color: darkMode ? "#bb86fc" : "#7e57c2",
    border: `1px solid ${darkMode ? "#444" : "#d6c4f2"}`,
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background 0.2s",
    hover: {
      background: darkMode ? "#3d3d3d" : "#e2d5f8"
    }
  };

  // 새로운 댓글 스타일 (애니메이션 효과)
  const newCommentStyle = {
    animation: "fadeBackground 5s ease-out"
  };

  // CSS 스타일 추가
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.innerHTML = `
      @keyframes fadeBackground {
        0% { background-color: ${darkMode ? '#554070' : '#e0d3ff'}; }
        100% { background-color: transparent; }
      }
      .highlight-comment {
        background-color: ${darkMode ? '#554070' : '#e0d3ff'};
        transition: background-color 2s ease-out;
      }
    `;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, [darkMode]);

  return (
    <div style={{ marginTop: 40 }}>
      {/* 댓글 입력 영역 */}
      <div style={commentBoxStyle} ref={textareaRef}>
        <h2 style={{ 
          color: darkMode ? "#e0d3ff" : "#7e57c2",
          fontSize: 18,
          marginTop: 0,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8
        }}>
          <span>💬 댓글 작성</span>
          {commentCount > 0 && (
            <span style={{
              fontSize: 14,
              color: darkMode ? "#bb86fc" : "#9c68e6",
              fontWeight: "normal"
            }}>
              총 {commentCount + replyCount}개의 댓글
            </span>
          )}
        </h2>

        <textarea
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="댓글을 입력하세요... (Shift+Enter: 줄바꿈, Enter: 등록)"
          style={{
            ...styles.textarea,
            minHeight: "100px",
            fontSize: "15px"
          }}
          disabled={isSubmitting}
        />
        
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          marginTop: 8,
          fontSize: 14,
          color: darkMode ? "#aaa" : "#777"
        }}>
          <span>{newComment.length}/{MAX_COMMENT_LENGTH}자</span>
          {newComment.length > MAX_COMMENT_LENGTH && (
            <span style={{ color: "red" }}>
              {newComment.length - MAX_COMMENT_LENGTH}자 초과
            </span>
          )}
        </div>
        
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, alignItems: "center" }}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={e => setIsPrivate(e.target.checked)}
              disabled={isSubmitting}
              style={{ marginRight: 8 }}
            /> 
            <span>🔒 비밀댓글로 작성</span>
          </label>
          
          <div style={{ display: "flex", gap: 8 }}>
            {newComment.trim() && (
              <button 
                onClick={cancelComment}
                style={{
                  ...styles.button.secondary,
                  opacity: isSubmitting ? 0.7 : 1,
                  cursor: isSubmitting ? "not-allowed" : "pointer"
                }}
                disabled={isSubmitting}
              >
                취소
              </button>
            )}
            
            <button 
              onClick={addComment} 
              style={{
                ...styles.button.primary,
                opacity: (isSubmitting || !newComment.trim() || newComment.length > MAX_COMMENT_LENGTH) ? 0.7 : 1,
                cursor: (isSubmitting || !newComment.trim() || newComment.length > MAX_COMMENT_LENGTH) ? "not-allowed" : "pointer"
              }}
              disabled={isSubmitting || !newComment.trim() || newComment.length > MAX_COMMENT_LENGTH}
            >
              {isSubmitting ? "저장 중..." : "댓글 등록"}
            </button>
          </div>
        </div>
        
        {isPrivate && (
          <div style={{ 
            fontSize: 12, 
            color: darkMode ? "#ff9800" : "#e67e22",
            marginTop: 8
          }}>
            * 비밀댓글은 작성자와 게시글 작성자만 볼 수 있습니다
          </div>
        )}
      </div>

      {/* 댓글 목록 */}
      {comments.length > 0 ? (
        <div>
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            marginBottom: 16
          }}>
            <h2 style={{ 
              color: darkMode ? "#e0d3ff" : "#7e57c2",
              fontSize: 18,
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
              <span>💬 댓글 목록</span>
              <span style={{
                fontSize: 14,
                color: darkMode ? "#bb86fc" : "#9c68e6",
                fontWeight: "normal"
              }}>
                {commentCount}개의 댓글, {replyCount}개의 답글
              </span>
            </h2>
            
            <button 
              onClick={toggleSortOrder}
              style={sortButtonStyle}
              title={sortOrder === "asc" ? "최신 댓글 순서로 보기" : "오래된 댓글 순서로 보기"}
            >
              <span>정렬: {sortOrder === "asc" ? "오래된 순" : "최신 순"}</span>
              <span>{sortOrder === "asc" ? "↑" : "↓"}</span>
            </button>
          </div>
          
          <div style={{ marginTop: 20 }}>
            {comments.map(comment => (
              <div 
                key={comment.id} 
                id={`comment-${comment.id}`}
                style={newCommentIds.includes(comment.id) ? newCommentStyle : {}}
              >
                <CommentItem
                  comment={comment}
                  type={type}
                  postId={postId}
                  darkMode={darkMode}
                  me={me}
                  postOwner={postOwner}
                  postTitle={postTitle}
                  globalProfilePics={globalProfilePics}
                  globalGrades={globalGrades}
                  sortOrder={sortOrder}
                  isFocused={focusedCommentId === comment.id}
                />
              </div>
            ))}
            
            {/* 댓글 더 불러오기 버튼 */}
            {hasMore && (
              <button 
                onClick={loadMoreComments}
                disabled={isLoadingMore}
                style={loadMoreButtonStyle}
              >
                {isLoadingMore ? "불러오는 중..." : "댓글 더 보기"}
              </button>
            )}
            
            {/* 스크롤 기준점 */}
            <div ref={commentsEndRef} />
          </div>
        </div>
      ) : (
        <div style={{ 
          textAlign: "center", 
          padding: "30px 20px", 
          color: darkMode ? "#aaa" : "#777",
          background: darkMode ? "#333" : "#f5f0ff",
          borderRadius: 12,
          margin: "20px 0"
        }}>
          <p>아직 댓글이 없습니다. 첫 댓글을 작성해보세요!</p>
        </div>
      )}
    </div>
  );
}

CommentSection.propTypes = {
  postId: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  darkMode: PropTypes.bool,
  postOwner: PropTypes.string.isRequired,
  postTitle: PropTypes.string,
  globalProfilePics: PropTypes.object,
  globalGrades: PropTypes.object
};

CommentSection.defaultProps = {
  darkMode: false,
  postTitle: ""
};

export default CommentSection;
