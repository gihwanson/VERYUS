import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { collection, query, orderBy, onSnapshot, addDoc, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import CommentItem from "./CommentItem"; 
import { getThemeStyles } from "../components/style";

function CommentSection({ postId, type, darkMode, postOwner, postTitle, globalProfilePics, globalGrades }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [replyCount, setReplyCount] = useState(0);
  const me = localStorage.getItem("nickname");
  
  // 스타일 가져오기
  const styles = getThemeStyles(darkMode);

  // 댓글 실시간 업데이트
  useEffect(() => {
    const commentsQuery = query(
      collection(db, `${type}-${postId}-comments`),
      orderBy("createdAt", "asc")
    );
    
    const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
      const commentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setComments(commentsData);
      
      // 댓글 및 답글 수 계산
      const rootCommentCount = commentsData.filter(c => !c.parentId).length;
      const replyCommentCount = commentsData.filter(c => c.parentId).length;
      
      setCommentCount(rootCommentCount);
      setReplyCount(replyCommentCount);
    });
    
    return () => unsubscribe();
  }, [postId, type]);

  // 댓글 추가
  const addComment = async () => {
    if (!newComment.trim()) {
      alert("댓글을 입력하세요");
      return;
    }
    
    try {
      setIsLoading(true);
      
      // 댓글 추가
      const commentData = {
        nickname: me,
        text: newComment,
        isPrivate: isPrivate,
        createdAt: Timestamp.now(),
        parentId: null,
        likes: 0,
        likedBy: []
      };
      
      await addDoc(collection(db, `${type}-${postId}-comments`), commentData);
      
      // 게시글 작성자에게 알림 추가 (본인이 아닌 경우만)
      if (postOwner !== me) {
        await addDoc(collection(db, "notifications"), {
          receiverNickname: postOwner,
          senderNickname: me,
          type: "comment",
          message: `${me}님이 회원님의 게시글에 댓글을 달았습니다: "${newComment.slice(0, 20)}${newComment.length > 20 ? '...' : ''}"`,
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
    } catch (error) {
      console.error("댓글 추가 중 오류 발생:", error);
      alert("댓글을 추가하는 중 오류가 발생했습니다");
    } finally {
      setIsLoading(false);
    }
  };

  // 루트 댓글만 필터링 (답글은 CommentItem 내부에서 표시)
  const rootComments = comments.filter(c => !c.parentId);

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
    display: rootComments.length > 0 ? "block" : "none"
  };

  // 댓글 입력 영역 스타일
  const commentBoxStyle = {
    padding: 16,
    borderRadius: 12,
    background: darkMode ? "#333" : "#f3e7ff",
    border: `1px solid ${darkMode ? "#555" : "#d6c4f2"}`,
    marginBottom: 20,
  };

  return (
    <div style={{ marginTop: 40 }}>
      {/* 댓글 입력 영역 */}
      <div style={commentBoxStyle}>
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
          placeholder="댓글을 입력하세요..."
          style={darkMode ? styles.textarea : styles.textarea}
          disabled={isLoading}
        />
        
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, alignItems: "center" }}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={e => setIsPrivate(e.target.checked)}
              disabled={isLoading}
              style={{ marginRight: 8 }}
            /> 
            <span>🔒 비밀댓글로 작성</span>
          </label>
          
          <button 
            onClick={addComment} 
            style={darkMode ? styles.button.primary : styles.button.primary}
            disabled={isLoading || !newComment.trim()}
          >
            {isLoading ? "저장 중..." : "댓글 등록"}
          </button>
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
      {rootComments.length > 0 ? (
        <div>
          <h2 style={{ 
            color: darkMode ? "#e0d3ff" : "#7e57c2",
            fontSize: 18,
            marginBottom: 16,
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
          
          <div style={{ marginTop: 20 }}>
            {rootComments.map(comment => (
              <CommentItem
                key={comment.id}
                comment={comment}
                type={type}
                postId={postId}
                darkMode={darkMode}
                me={me}
                postOwner={postOwner}
                postTitle={postTitle}
                globalProfilePics={globalProfilePics}
                globalGrades={globalGrades}
              />
            ))}
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
