import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  collection, doc, updateDoc, deleteDoc, addDoc, Timestamp, query, where, onSnapshot
} from "firebase/firestore";
import { db } from "../firebase";
import CustomLink from "./CustomLink";
import Avatar from "./Avatar";

function CommentItem({ comment, type, postId, darkMode, me, postOwner, postTitle, globalProfilePics, globalGrades }) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [likes, setLikes] = useState(comment.likes || 0);
  const [likedBy, setLikedBy] = useState(comment.likedBy || []);
  const [isLiked, setIsLiked] = useState(likedBy.includes(me));
  const [replies, setReplies] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [confirmationAction, setConfirmationAction] = useState(null);

  // 답글 가져오기
  useEffect(() => {
    const repliesQuery = query(
      collection(db, `${type}-${postId}-comments`),
      where("parentId", "==", comment.id)
    );
    
    const unsubscribe = onSnapshot(repliesQuery, (snapshot) => {
      const repliesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => a.createdAt.seconds - b.createdAt.seconds);
      
      setReplies(repliesData);
    });
    
    return () => unsubscribe();
  }, [comment.id, type, postId]);

  const commentRef = doc(db, `${type}-${postId}-comments`, comment.id);
  const canView = !comment.isPrivate || comment.nickname === me || postOwner === me;

  // 스타일 정의 - 다크모드 지원 추가
  const commentContainerStyle = {
    marginBottom: 16,
  };
  
  const commentBoxStyle = {
    background: darkMode ? "#333" : "#f3e7ff",
    border: `1px solid ${darkMode ? "#555" : "#b49ddb"}`,
    borderRadius: 10,
    padding: 16,
    color: darkMode ? "#fff" : "#000",
    position: "relative",  // 좋아요 애니메이션 위치 지정을 위해
    transition: "background 0.3s, transform 0.2s",
  };
  
  const secretCommentBoxStyle = {
    background: darkMode ? "#3a3a3a" : "#f0f0f0",
    border: `1px solid ${darkMode ? "#555" : "#ccc"}`,
    borderRadius: 10,
    padding: 16,
    color: darkMode ? "#aaa" : "#888",
  };
  
  const commentHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  };
  
  const userInfoStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
  };
  
  const commentTextStyle = {
    whiteSpace: "pre-wrap",
    fontSize: 15,
    lineHeight: 1.5,
    wordBreak: "break-word",
    color: darkMode ? "#eee" : "#333",
  };
  
  const secretCommentTextStyle = {
    color: darkMode ? "#999" : "#888",
    fontStyle: "italic",
    textAlign: "center",
  };
  
  const commentActionStyle = {
    display: "flex",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  };
  
  const commentActionBtnStyle = {
    padding: "6px 12px",
    background: darkMode ? "#7e57c2aa" : "#7e57c2",
    color: "white",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
    transition: "background 0.2s",
    boxShadow: darkMode ? "none" : "0 2px 4px rgba(0,0,0,0.1)",
  };
  
  const replyBoxStyle = {
    marginTop: 12,
    padding: 12,
    background: darkMode ? "#444" : "#efe2ff",
    borderRadius: 8,
    transition: "all 0.3s ease",
  };
  
  const replyInputStyle = {
    width: "100%",
    height: 80,
    padding: 10,
    borderRadius: 6,
    border: `1px solid ${darkMode ? "#666" : "#d6c4f2"}`,
    resize: "none",
    fontFamily: "inherit",
    background: darkMode ? "#333" : "#fff",
    color: darkMode ? "#fff" : "#000",
  };
  
  const repliesContainerStyle = {
    marginTop: 16,
    paddingLeft: 16,
    borderLeft: `2px solid ${darkMode ? "#555" : "#d6c4f2"}`,
  };
  
  const replyCountBadgeStyle = {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: 12,
    background: darkMode ? "#7e57c288" : "#e7d8ff",
    color: darkMode ? "#d4b8ff" : "#7e57c2",
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
  };
  
  const dateTimeStyle = {
    fontSize: 12,
    color: darkMode ? "#aaa" : "#666",
  };

  const confirmDialogStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  };

  const confirmDialogContentStyle = {
    backgroundColor: darkMode ? "#333" : "#fff",
    padding: 24,
    borderRadius: 12,
    maxWidth: 400,
    width: "90%",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const confirmDialogButtonsStyle = {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  };

  const formatDate = (timestamp) => {
    const now = new Date();
    const commentDate = new Date(timestamp * 1000);
    
    // 오늘 날짜인 경우 시간만 표시
    if (commentDate.toDateString() === now.toDateString()) {
      return `오늘 ${commentDate.getHours().toString().padStart(2, '0')}:${commentDate.getMinutes().toString().padStart(2, '0')}`;
    }
    
    // 어제 날짜인 경우
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (commentDate.toDateString() === yesterday.toDateString()) {
      return `어제 ${commentDate.getHours().toString().padStart(2, '0')}:${commentDate.getMinutes().toString().padStart(2, '0')}`;
    }
    
    // 이번 주 내의 날짜인 경우
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(now.getDate() - 7);
    if (commentDate > oneWeekAgo) {
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      return `${days[commentDate.getDay()]}요일 ${commentDate.getHours().toString().padStart(2, '0')}:${commentDate.getMinutes().toString().padStart(2, '0')}`;
    }
    
    // 그 외 경우는 전체 날짜 표시
    return `${commentDate.getFullYear()}-${(commentDate.getMonth() + 1).toString().padStart(2, '0')}-${commentDate.getDate().toString().padStart(2, '0')} ${commentDate.getHours().toString().padStart(2, '0')}:${commentDate.getMinutes().toString().padStart(2, '0')}`;
  };

  // 확인 창 표시 함수
  const showConfirmDialog = (message, action) => {
    setConfirmationMessage(message);
    setConfirmationAction(() => action);
    setShowConfirmation(true);
  };

  // 확인 창 처리 함수
  const handleConfirm = () => {
    confirmationAction && confirmationAction();
    setShowConfirmation(false);
  };

  const toggleLike = async () => {
    if (isLiked) {
      alert("이미 좋아요를 눌렀습니다");
      return;
    }

    try {
      setIsLoading(true);
      
      const updatedLikedBy = [...likedBy, me];
      const updatedLikes = likes + 1;

      await updateDoc(commentRef, {
        likedBy: updatedLikedBy,
        likes: updatedLikes
      });

      setLikedBy(updatedLikedBy);
      setLikes(updatedLikes);
      setIsLiked(true);
      
      // 좋아요 애니메이션 효과 (CSS 애니메이션 클래스를 추가했다고 가정)
      const commentElement = document.getElementById(`comment-${comment.id}`);
      if (commentElement) {
        commentElement.classList.add('liked-animation');
        setTimeout(() => {
          commentElement.classList.remove('liked-animation');
        }, 1000);
      }
      
      // 댓글 좋아요 시 알림 추가 (본인 댓글이 아닌 경우)
      if (comment.nickname !== me) {
        await addDoc(collection(db, "notifications"), {
          receiverNickname: comment.nickname,
          senderNickname: me,
          type: "like_comment",
          message: `${me}님이 회원님의 댓글을 좋아합니다`,
          icon: "👍",
          relatedPostId: postId,
          relatedPostType: type,
          relatedPostTitle: postTitle,
          createdAt: Timestamp.now(),
          isRead: false
        });
      }
    } catch (error) {
      console.error("좋아요 처리 중 오류 발생:", error);
      alert("좋아요 처리 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 답글 작성 함수에 알림 생성 로직 추가
  const submitReply = async () => {
    if (!replyText.trim()) {
      alert("내용을 입력하세요");
      return;
    }

    try {
      setIsLoading(true);
      
      // 답글 추가
      await addDoc(collection(db, `${type}-${postId}-comments`), {
        nickname: me,
        text: replyText,
        isPrivate,
        createdAt: Timestamp.now(),
        parentId: comment.id,
        likes: 0,
        likedBy: []
      });
      
      // 원 댓글 작성자에게 알림 추가 (본인 제외)
      if (comment.nickname !== me) {
        await addDoc(collection(db, "notifications"), {
          receiverNickname: comment.nickname,
          senderNickname: me,
          type: "reply",
          message: `${me}님이 회원님의 댓글에 답글을 달았습니다: "${replyText.slice(0, 20)}${replyText.length > 20 ? '...' : ''}"`,
          icon: "↪️",
          relatedPostId: postId,
          relatedPostType: type,
          relatedPostTitle: postTitle,
          createdAt: Timestamp.now(),
          isRead: false
        });
      }
      
      // 게시글 작성자에게도 알림 추가 (댓글 작성자가 아니고, 본인도 아닌 경우)
      if (postOwner !== comment.nickname && postOwner !== me) {
        await addDoc(collection(db, "notifications"), {
          receiverNickname: postOwner,
          senderNickname: me,
          type: "reply_post",
          message: `${me}님이 회원님의 게시글에 새로운 답글을 달았습니다: "${replyText.slice(0, 20)}${replyText.length > 20 ? '...' : ''}"`,
          icon: "💬",
          relatedPostId: postId,
          relatedPostType: type,
          relatedPostTitle: postTitle,
          createdAt: Timestamp.now(),
          isRead: false
        });
      }

      // 입력 필드 초기화 & 답글창 닫기
      setReplyText("");
      setIsPrivate(false);
      setShowReplyBox(false);
    } catch (error) {
      console.error("답글 작성 중 오류 발생:", error);
      alert("답글 작성 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteComment = async () => {
    try {
      setIsLoading(true);
      
      // 답글이 있는 경우 추가 확인
      if (replies.length > 0) {
        showConfirmDialog(
          `이 댓글에 ${replies.length}개의 답글이 있습니다. 댓글을 삭제하면 모든 답글도 함께 삭제됩니다. 계속하시겠습니까?`,
          async () => {
            // 모든 답글 삭제
            for (const reply of replies) {
              await deleteDoc(doc(db, `${type}-${postId}-comments`, reply.id));
            }
            
            // 댓글 삭제
            await deleteDoc(doc(db, `${type}-${postId}-comments`, comment.id));
          }
        );
        return;
      }
      
      // 답글이 없는 경우 바로 삭제
      await deleteDoc(doc(db, `${type}-${postId}-comments`, comment.id));
    } catch (error) {
      console.error("댓글 삭제 중 오류 발생:", error);
      alert("댓글 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 댓글 작성자 정보를 가져오는 함수
  const getAuthorGradeEmoji = (nickname) => {
    if (!nickname || !globalGrades || !globalGrades[nickname]) return null;
    
    const grade = globalGrades[nickname];
    const gradeEmojis = {
      "체리": "🍒",
      "블루베리": "🫐",
      "키위": "🥝",
      "사과": "🍎",
      "멜론": "🍈",
      "수박": "🍉",
      "지구": "🌏",
      "토성": "🪐",
      "태양": "🌞"
    };
    
    return gradeEmojis[grade] || null;
  };

  // 프로필 이미지 URL 가져오기
  const getProfilePic = (nickname) => {
    return globalProfilePics && globalProfilePics[nickname] ? 
      globalProfilePics[nickname] : 
      "https://via.placeholder.com/30";
  };

  // 답글 카운트 표시 최적화
  const replyCountDisplay = () => {
    if (replies.length === 0) return null;
    
    return (
      <div style={replyCountBadgeStyle}>
        💬 답글 {replies.length}개
      </div>
    );
  };

  return (
    <div style={commentContainerStyle}>
      <div 
        id={`comment-${comment.id}`}
        style={canView ? commentBoxStyle : secretCommentBoxStyle}
      >
        <div style={commentHeaderStyle}>
          <div style={userInfoStyle}>
            <CustomLink to={`/userpage/${comment.nickname || "알 수 없음"}`} style={{ textDecoration: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar 
                  src={getProfilePic(comment.nickname)}
                  size={28}
                  alt={comment.nickname || "사용자"}
                />
                <div style={{ display: "flex", alignItems: "center" }}>
                  <strong style={{ color: darkMode ? "#fff" : "#333" }}>{comment.nickname || "알 수 없음"}</strong>
                  {getAuthorGradeEmoji(comment.nickname) && (
                    <span style={{ marginLeft: 4 }}>{getAuthorGradeEmoji(comment.nickname)}</span>
                  )}
                </div>
              </div>
            </CustomLink>
            {comment.isPrivate && (
              <span style={{ fontSize: 14, color: darkMode ? "#ff9800" : "#e67e22" }}>🔒</span>
            )}
          </div>
          <span style={dateTimeStyle}>
            {formatDate(comment.createdAt.seconds)}
          </span>
        </div>
        
        {canView ? (
          <p style={commentTextStyle}>{comment.text}</p>
        ) : (
          <p style={secretCommentTextStyle}>🔒 비밀댓글입니다</p>
        )}

        {canView && (
          <div style={commentActionStyle}>
            <button 
              onClick={toggleLike} 
              style={{
                ...commentActionBtnStyle,
                background: isLiked ? (darkMode ? "#6a1b9a" : "#6a1b9a") : (darkMode ? "#7e57c2aa" : "#7e57c2"),
              }}
              disabled={isLoading || isLiked}
            >
              {isLiked ? "❤️" : "👍"} {likes}
            </button>

            <button 
              style={commentActionBtnStyle} 
              onClick={() => setShowReplyBox(x => !x)}
              disabled={isLoading}
            >
              ↪️ 답글
            </button>

            {comment.nickname === me && (
              <>
                <button
                  onClick={() => window.location.href = `/comment-edit/${type}/${postId}/${comment.id}`}
                  style={{ ...commentActionBtnStyle, background: darkMode ? '#6a1b9a99' : '#6a1b9a' }}
                  disabled={isLoading}
                >
                  ✏️ 수정
                </button>
                <button
                  onClick={() => showConfirmDialog("정말 이 댓글을 삭제하시겠습니까?", deleteComment)}
                  style={{ ...commentActionBtnStyle, background: darkMode ? 'rgba(220, 53, 69, 0.8)' : 'rgba(220, 53, 69, 1)' }}
                  disabled={isLoading}
                >
                  🗑️ 삭제
                </button>
              </>
            )}
          </div>
        )}

        {replyCountDisplay()}

        {showReplyBox && (
          <div style={replyBoxStyle}>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="답글 작성"
              style={replyInputStyle}
              disabled={isLoading}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <label style={{ fontSize: 14, color: darkMode ? "#ccc" : "#333", display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={e => setIsPrivate(e.target.checked)}
                  disabled={isLoading}
                />
                <span style={{ position: "relative", top: 1 }}>비밀 답글로 작성</span>
              </label>
              <button 
                onClick={submitReply} 
                style={{
                  ...commentActionBtnStyle,
                  padding: "8px 16px",
                  fontWeight: "bold",
                  background: darkMode ? "#9c27b0aa" : "#9c27b0",
                }}
                disabled={isLoading}
              >
                {isLoading ? "작성 중..." : "답글 등록"}
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: darkMode ? "#aaa" : "#666" }}>
              * 비밀 답글은 게시글 작성자와 답글 작성자만 볼 수 있습니다.
            </div>
          </div>
        )}

        {/* 답글 목록 표시 */}
        {replies.length > 0 && (
          <div style={repliesContainerStyle}>
            {replies.map(reply => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                type={type}
                postId={postId}
                darkMode={darkMode}
                me={me}
                postOwner={postOwner}
                postTitle={postTitle}
                globalProfilePics={globalProfilePics}
                globalGrades={globalGrades}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </div>

      {/* 확인 다이얼로그 */}
      {showConfirmation && (
        <div style={confirmDialogStyle}>
          <div style={confirmDialogContentStyle}>
            <h3 style={{ margin: 0, color: darkMode ? "#fff" : "#333" }}>확인</h3>
            <p style={{ margin: 0, color: darkMode ? "#ddd" : "#555" }}>{confirmationMessage}</p>
            <div style={confirmDialogButtonsStyle}>
              <button
                onClick={() => setShowConfirmation(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: darkMode ? "#555" : "#eee",
                  color: darkMode ? "#fff" : "#333",
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: darkMode ? "rgba(220, 53, 69, 0.8)" : "rgba(220, 53, 69, 1)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ReplyItem 컴포넌트 - 답글 표시
function ReplyItem({ reply, type, postId, darkMode, me, postOwner, postTitle, globalProfilePics, globalGrades, formatDate }) {
  const [likes, setLikes] = useState(reply.likes || 0);
  const [likedBy, setLikedBy] = useState(reply.likedBy || []);
  const [isLiked, setIsLiked] = useState(likedBy.includes(me));
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // 스타일 정의 - 다크모드 지원 추가
  const replyItemStyle = {
    marginTop: 10,
    paddingTop: 10,
    borderTop: `1px dashed ${darkMode ? "#555" : "#d6c4f2"}`,
  };
  
  const replyHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  };
  
  const userInfoStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
  };
  
  const replyTextStyle = {
    whiteSpace: "pre-wrap",
    fontSize: 14,
    lineHeight: 1.5,
    color: darkMode ? "#ddd" : "#333",
    wordBreak: "break-word"
  };
  
  const secretCommentTextStyle = {
    color: darkMode ? "#999" : "#888",
    fontStyle: "italic",
    textAlign: "center",
    fontSize: 14,
  };
  
  const replyActionStyle = {
    display: "flex",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  };
  
  const commentActionBtnStyle = {
    padding: "4px 10px",
    background: darkMode ? "#7e57c2aa" : "#7e57c2",
    color: "white",
    border: "none",
    borderRadius: 4,
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
    transition: "background 0.2s",
  };
  
  const dateTimeStyle = {
    fontSize: 12,
    color: darkMode ? "#aaa" : "#666",
  };

  const confirmDialogStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  };

  const confirmDialogContentStyle = {
    backgroundColor: darkMode ? "#333" : "#fff",
    padding: 24,
    borderRadius: 12,
    maxWidth: 400,
    width: "90%",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
  };

  const confirmDialogButtonsStyle = {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  };

  const replyRef = doc(db, `${type}-${postId}-comments`, reply.id);
  const canView = !reply.isPrivate || reply.nickname === me || postOwner === me;

  // 확인 창 표시 함수
  const showConfirmDialog = () => {
    setShowConfirmation(true);
  };

  // 확인 창 처리 함수
  const handleConfirm = async () => {
    setShowConfirmation(false);
    await deleteReply();
  };

  const toggleLike = async () => {
    if (isLiked) {
      alert("이미 좋아요를 눌렀습니다");
      return;
    }

    try {
      setIsLoading(true);
      
      const updatedLikedBy = [...likedBy, me];
      const updatedLikes = likes + 1;

      await updateDoc(replyRef, {
        likedBy: updatedLikedBy,
        likes: updatedLikes
      });

      setLikedBy(updatedLikedBy);
      setLikes(updatedLikes);
      setIsLiked(true);
      
      // 답글 좋아요 시 알림 추가 (본인 답글이 아닌 경우)
      if (reply.nickname !== me) {
        await addDoc(collection(db, "notifications"), {
          receiverNickname: reply.nickname,
          senderNickname: me,
          type: "like_reply",
          message: `${me}님이 회원님의 답글을 좋아합니다`,
          icon: "👍",
          relatedPostId: postId,
          relatedPostType: type,
          relatedPostTitle: postTitle,
          createdAt: Timestamp.now(),
          isRead: false
        });
      }
    } catch (error) {
      console.error("좋아요 처리 중 오류 발생:", error);
      alert("좋아요 처리 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteReply = async () => {
    try {
      setIsLoading(true);
      await deleteDoc(doc(db, `${type}-${postId}-comments`, reply.id));
    } catch (error) {
      console.error("답글 삭제 중 오류 발생:", error);
      alert("답글 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

    // 댓글 작성자 정보를 가져오는 함수
  const getAuthorGradeEmoji = (nickname) => {
    if (!nickname || !globalGrades || !globalGrades[nickname]) return null;
    
    const grade = globalGrades[nickname];
    const gradeEmojis = {
      "체리": "🍒",
      "블루베리": "🫐",
      "키위": "🥝",
      "사과": "🍎",
      "멜론": "🍈",
      "수박": "🍉",
      "지구": "🌏",
      "토성": "🪐",
      "태양": "🌞"
    };
    
    return gradeEmojis[grade] || null;
  };

  // 프로필 이미지 URL 가져오기
  const getProfilePic = (nickname) => {
    return globalProfilePics && globalProfilePics[nickname] ? 
      globalProfilePics[nickname] : 
      "https://via.placeholder.com/30";
  };

  return (
    <div style={replyItemStyle}>
      <div style={replyHeaderStyle}>
        <div style={userInfoStyle}>
          <CustomLink to={`/userpage/${reply.nickname || "알 수 없음"}`} style={{ textDecoration: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar 
                src={getProfilePic(reply.nickname)}
                size={24}
                alt={reply.nickname || "사용자"}
              />
              <div style={{ display: "flex", alignItems: "center" }}>
                <strong style={{ color: darkMode ? "#fff" : "#333" }}>{reply.nickname || "알 수 없음"}</strong>
                {getAuthorGradeEmoji(reply.nickname) && (
                  <span style={{ marginLeft: 4 }}>{getAuthorGradeEmoji(reply.nickname)}</span>
                )}
              </div>
            </div>
          </CustomLink>
          {reply.isPrivate && (
            <span style={{ fontSize: 14, color: darkMode ? "#ff9800" : "#e67e22" }}>🔒</span>
          )}
        </div>
        <span style={dateTimeStyle}>
          {formatDate(reply.createdAt.seconds)}
        </span>
      </div>
      
      {canView ? (
        <p style={replyTextStyle}>{reply.text}</p>
      ) : (
        <p style={secretCommentTextStyle}>🔒 비밀답글입니다</p>
      )}

      {canView && (
        <div style={replyActionStyle}>
          <button 
            onClick={toggleLike} 
            style={{
              ...commentActionBtnStyle,
              background: isLiked ? (darkMode ? "#6a1b9a" : "#6a1b9a") : (darkMode ? "#7e57c2aa" : "#7e57c2"),
            }}
            disabled={isLoading || isLiked}
          >
            {isLiked ? "❤️" : "👍"} {likes}
          </button>

          {reply.nickname === me && (
            <>
              <button
                onClick={() => window.location.href = `/comment-edit/${type}/${postId}/${reply.id}`}
                style={{ ...commentActionBtnStyle, background: darkMode ? '#6a1b9a99' : '#6a1b9a' }}
                disabled={isLoading}
              >
                ✏️ 수정
              </button>
              <button
                onClick={showConfirmDialog}
                style={{ ...commentActionBtnStyle, background: darkMode ? 'rgba(220, 53, 69, 0.8)' : 'rgba(220, 53, 69, 1)' }}
                disabled={isLoading}
              >
                🗑️ 삭제
              </button>
            </>
          )}
        </div>
      )}

      {/* 확인 다이얼로그 */}
      {showConfirmation && (
        <div style={confirmDialogStyle}>
          <div style={confirmDialogContentStyle}>
            <h3 style={{ margin: 0, color: darkMode ? "#fff" : "#333" }}>답글 삭제</h3>
            <p style={{ margin: "10px 0", color: darkMode ? "#ddd" : "#555" }}>정말 이 답글을 삭제하시겠습니까?</p>
            <div style={confirmDialogButtonsStyle}>
              <button
                onClick={() => setShowConfirmation(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: darkMode ? "#555" : "#eee",
                  color: darkMode ? "#fff" : "#333",
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: darkMode ? "rgba(220, 53, 69, 0.8)" : "rgba(220, 53, 69, 1)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// PropTypes 정의
CommentItem.propTypes = {
  comment: PropTypes.object.isRequired,
  type: PropTypes.string.isRequired,
  postId: PropTypes.string.isRequired,
  darkMode: PropTypes.bool,
  me: PropTypes.string.isRequired,
  postOwner: PropTypes.string.isRequired,
  postTitle: PropTypes.string,
  globalProfilePics: PropTypes.object,
  globalGrades: PropTypes.object
};

ReplyItem.propTypes = {
  reply: PropTypes.object.isRequired,
  type: PropTypes.string.isRequired,
  postId: PropTypes.string.isRequired,
  darkMode: PropTypes.bool,
  me: PropTypes.string.isRequired,
  postOwner: PropTypes.string.isRequired,
  postTitle: PropTypes.string,
  globalProfilePics: PropTypes.object,
  globalGrades: PropTypes.object,
  formatDate: PropTypes.func.isRequired
};

export default CommentItem;