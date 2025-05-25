import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  collection, getDocs, doc, getDoc, updateDoc, deleteDoc, addDoc, Timestamp, query, where, onSnapshot, writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import TaggedText from './TaggedText';
import TagInput from './TagInput';
import { processTaggedUsers, createTagNotification } from '../utils/tagNotification';

// 등급 이모지 매핑
const gradeEmojis = {
  "체리": "🍒",
  "블루베리": "🫐",
  "키위": "🥝",
  "사과": "🍎",
  "멜론": "🍈",
  "수박": "🍉",
  "지구": "🌏",
  "토성": "🪐",
  "태양": "🌞",
  "은하": "🌌",
  "맥주": "🍺",
  "번개": "⚡",
  "달": "🌙",
  "별": "⭐"
};

function PostDetail({ darkMode, globalProfilePics, globalGrades }) {
  const { type, id } = useParams();
  const [post, setPost] = useState(null);
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [isPrivateComment, setIsPrivateComment] = useState(false);
  const me = localStorage.getItem("nickname");
  const role = localStorage.getItem("role");
  const nav = useNavigate();

  // 등급 이모지 가져오기 함수
  const getGradeEmoji = (grade) => {
    return gradeEmojis[grade] || grade;
  };

  // 스타일 정의
  const containerStyle = { 
    padding: "2rem",
    backgroundColor: darkMode ? "#1a1a1a" : "#ffffff",
    minHeight: "100vh"
  };
  const postStyle = {
    background: darkMode ? "#2a2a2a" : "#f3e7ff",
    padding: 24,
    borderRadius: 16,
    border: darkMode ? "1px solid #444" : "1px solid #b49ddb",
    color: darkMode ? "#e0e0e0" : "#000",
    marginBottom: 30,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    // 모바일 반응형
    "@media (max-width: 768px)": {
      padding: "16px",
      marginBottom: "20px"
    }
  };
  const authorBox = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    marginBottom: 10,
  };
  const profilePicStyle = {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: darkMode ? "2px solid #bb86fc" : "2px solid #7e57c2",
    objectFit: "cover",
  };
  const smallBtn = {
    padding: "6px 14px",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  };
  const editBtn = {
    background: darkMode ? "#bb86fc" : "#7e57c2",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontWeight: "bold",
    padding: "10px 16px",
    cursor: "pointer",
  };
  const deleteBtn = {
    background: darkMode ? "#cf6679" : "red",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontWeight: "bold",
    padding: "10px 16px",
    cursor: "pointer",
  };
  const partnerDoneStyle = {
    marginTop: 16,
    padding: "6px 10px",
    background: darkMode ? "#2d5d2d" : "#e0ffe0",
    color: darkMode ? "#81c784" : "#1a6f1a",
    borderRadius: 6,
    fontWeight: "bold",
  };

  // 댓글 스타일
  const commentInputContainerStyle = {
    background: darkMode ? "#333" : "#f9f2ff",
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
    border: darkMode ? "1px solid #555" : "1px solid #d6c4f2",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    // 모바일 반응형
    "@media (max-width: 768px)": {
      padding: "15px",
      marginBottom: "20px"
    }
  };
  const commentInputStyle = {
    width: "100%",
    height: 80,
    padding: 12,
    borderRadius: 8,
    border: darkMode ? "1px solid #555" : "1px solid #d6c4f2",
    backgroundColor: darkMode ? "#444" : "#ffffff",
    color: darkMode ? "#e0e0e0" : "#000",
    resize: "none",
    marginBottom: 8,
    fontFamily: "inherit",
    boxSizing: "border-box",
    fontSize: "16px", // iOS 줌 방지
    wordWrap: "break-word",
    overflowWrap: "break-word",
    // 모바일 반응형
    "@media (max-width: 768px)": {
      height: "60px",
      padding: "10px",
      fontSize: "16px" // iOS 줌 방지 유지
    }
  };
  const commentBtnStyle = {
    padding: "8px 16px",
    background: darkMode ? "#bb86fc" : "#7e57c2",
    color: "white",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: "bold",
  };
  const commentListContainerStyle = {
    background: darkMode ? "#333" : "#f9f2ff",
    padding: 20,
    borderRadius: 12,
    border: darkMode ? "1px solid #555" : "1px solid #d6c4f2",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    // 모바일 반응형
    "@media (max-width: 768px)": {
      padding: "15px"
    }
  };

  // 게시글 정보 가져오기
  useEffect(() => {
    const fetchData = async () => {
      try {
        const coll = getCollectionName(type);
        // 게시물 하나만 직접 가져오기
        const docRef = doc(db, coll, id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setPost({ id: docSnap.id, ...docSnap.data() });
        } else {
          console.log("해당 게시물이 존재하지 않습니다!");
        }
      } catch (error) {
        console.error("게시물 로드 오류:", error);
      }
    };
    
    fetchData();
  }, [type, id]);

  // 댓글 정보 가져오기
  useEffect(() => {
    if (!id) return;
    
    const commentsQuery = query(collection(db, `${type}-${id}-comments`), where("parentId", "==", null));
    const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
      const commentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setComments(commentsData);
    });
    
    return () => unsubscribe();
  }, [type, id]);

  const getCollectionName = (type) => {
    return type === "post"
      ? "posts"
      : type === "freepost"
      ? "freeposts"
      : type === "song"
      ? "songs"
      : type === "advice"
      ? "advice"
      : type === "recording"
      ? "mypage_recordings"
      : type === "special-moment"
      ? "special_moments"
      : "posts"; // 기본값
  };

  const togglePartnerDone = async (newVal) => {
    const coll = getCollectionName(type);
    await updateDoc(doc(db, coll, post.id), {
      partnerDone: newVal,
    });
    setPost((prev) => ({ ...prev, partnerDone: newVal }));
  };

  const onDelete = async () => {
    if (!window.confirm("정말 이 글을 삭제할까요?")) return;
    const coll = getCollectionName(type);
    await deleteDoc(doc(db, coll, post.id));
    alert("삭제되었습니다");
    nav(`/${type === "post" ? "duet" : type === "freepost" ? "freeboard" : type}`);
  };

  const toggleLike = async () => {
    const coll = getCollectionName(type);
    const postRef = doc(db, coll, post.id);
    const updatedLikes = liked ? (post.likes || 0) - 1 : (post.likes || 0) + 1;
    await updateDoc(postRef, { likes: updatedLikes });
    setPost((prev) => ({ ...prev, likes: updatedLikes }));
    setLiked(!liked);
    
    // 게시글 좋아요 시 알림 생성 (본인 글이 아닌 경우)
    if (!liked && post.nickname !== me) {
      await addDoc(collection(db, "notifications"), {
        receiverNickname: post.nickname,
        senderNickname: me,
        type: "like",
        message: `${me}님이 회원님의 게시글을 좋아합니다`,
        icon: "❤️",
        relatedPostId: id,
        relatedPostType: type,
        relatedPostTitle: post.title,
        createdAt: Timestamp.now(),
        isRead: false
      });
    }
  };

  // 새로운 댓글 추가 함수
  const addComment = async () => {
    if (!commentText.trim()) return alert("댓글 내용을 입력하세요");
    
    // 댓글 추가
    const commentRef = await addDoc(collection(db, `${type}-${id}-comments`), {
      nickname: me,
      text: commentText,
      isPrivate: isPrivateComment,
      createdAt: Timestamp.now(),
      parentId: null, // 메인 댓글은 parentId가 null
      likes: 0,
      likedBy: []
    });
    
    // 태그된 사용자들에게 알림 생성
    const taggedUsers = processTaggedUsers(commentText);
    for (const taggedUser of taggedUsers) {
      await createTagNotification({
        taggedUser,
        taggerNickname: me,
        postId: id,
        postType: type,
        postTitle: post.title,
        commentId: commentRef.id,
        commentText
      });
    }
    
    // 게시글 작성자에게 알림 추가 (본인이 아닌 경우에만)
    if (post.nickname !== me) {
      await addDoc(collection(db, "notifications"), {
        receiverNickname: post.nickname,
        senderNickname: me,
        type: "comment",
        message: `${me}님이 회원님의 게시글에 댓글을 달았습니다: "${commentText.slice(0, 20)}${commentText.length > 20 ? '...' : ''}"`,
        icon: "💬",
        relatedPostId: id,
        relatedPostType: type,
        relatedPostTitle: post.title,
        createdAt: Timestamp.now(),
        isRead: false
      });
    }
    
    // 입력 필드 초기화
    setCommentText("");
    setIsPrivateComment(false);
  };

  // 쪽지 보내기 함수
  const sendMessage = async (receiverNickname, relatedPostTitle = null) => {
    if (!me) {
      alert("로그인이 필요합니다.");
      return;
    }
    
    if (me === receiverNickname) {
      alert("자신에게는 쪽지를 보낼 수 없습니다.");
      return;
    }
    
    const messageContent = prompt(`${receiverNickname}님에게 보낼 메시지를 입력하세요:`);
    if (!messageContent || !messageContent.trim()) {
      return;
    }
    
    try {
      await addDoc(collection(db, "messages"), {
        senderNickname: me,
        receiverNickname: receiverNickname,
        content: messageContent.trim(),
        createdAt: Timestamp.now(),
        read: false,
        relatedPostTitle: relatedPostTitle
      });
      
      alert("쪽지가 전송되었습니다.");
    } catch (error) {
      console.error("쪽지 전송 오류:", error);
      alert("쪽지 전송 중 오류가 발생했습니다.");
    }
  };

  if (!post) return <div style={containerStyle}>로딩 중...</div>;

  const author = post.nickname || "알 수 없음";
  const grade = globalGrades?.[author] || "";
  const profileUrl = globalProfilePics?.[author];
  const canEditOrDelete = post.nickname === me || role === "운영진" || role === "리더";

  // 게시글 내용 스타일 추가
  const styles = {
    content: {
      marginTop: 20,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      lineHeight: 1.6,
      fontSize: 15,
      color: darkMode ? "#e0e0e0" : "#333"
    }
  };

  return (
    <div style={{ 
      marginBottom: 40, 
      width: "100%", 
      maxWidth: "100%", 
      boxSizing: "border-box",
      wordWrap: "break-word",
      overflowWrap: "break-word",
      // 모바일 반응형
      "@media (max-width: 768px)": {
        marginBottom: "20px"
      }
    }}>
      <div style={postStyle}>
        <h1 style={{ 
          color: darkMode ? "#bb86fc" : "#7e57c2",
          borderBottom: darkMode ? "2px solid #bb86fc" : "2px solid #7e57c2",
          paddingBottom: "10px",
          marginBottom: "20px"
        }}>{post.title}</h1>

        <div style={authorBox}>
          {profileUrl && <img src={profileUrl} alt="프로필" style={profilePicStyle} />}
          <div>
            <strong>{author}</strong>
            {grade && <span style={{ marginLeft: 6, color: darkMode ? "#bb86fc" : "#7e57c2" }}>({getGradeEmoji(grade)})</span>}
          </div>
        </div>

        <p style={{ fontSize: 12, color: darkMode ? "#aaa" : "#555" }}>
          {new Date(post.createdAt.seconds * 1000).toLocaleString()} | 작성자:{" "}
          <Link to={`/userpage/${post.nickname}`} style={{ color: darkMode ? "#bb86fc" : "#7e57c2", textDecoration: "none" }}>
            {post.nickname}
          </Link>
        </p>

        {/* 첨부 이미지들 표시 */}
        {post.images && post.images.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h4 style={{
              color: darkMode ? "#bb86fc" : "#7e57c2",
              marginBottom: "12px",
              fontSize: "16px"
            }}>
              📷 첨부 이미지
            </h4>
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "15px"
            }}>
              {post.images.map((imageUrl, index) => (
                <div
                  key={index}
                  style={{
                    maxWidth: "500px",
                    borderRadius: "12px",
                    overflow: "hidden",
                    boxShadow: "0 4px 15px rgba(0, 0, 0, 0.1)",
                    border: `2px solid ${darkMode ? "#444" : "#e8dbff"}`,
                    cursor: "pointer",
                    transition: "transform 0.2s ease"
                  }}
                  onClick={() => window.open(imageUrl, '_blank')}
                  onMouseEnter={(e) => e.target.style.transform = "scale(1.02)"}
                  onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
                >
                  <img
                    src={imageUrl}
                    alt={`첨부 이미지 ${index + 1}`}
                    style={{
                      width: "100%",
                      height: "auto",
                      maxHeight: "400px",
                      objectFit: "contain",
                      display: "block"
                    }}
                  />
                </div>
              ))}
            </div>
            <p style={{
              fontSize: "12px",
              color: darkMode ? "#aaa" : "#666",
              marginTop: "8px",
              fontStyle: "italic"
            }}>
              💡 이미지를 클릭하면 원본 크기로 볼 수 있습니다
            </p>
          </div>
        )}

        {/* 레거시 단일 이미지 지원 */}
        {post.fileUrl && !post.images && (
          <img
            src={post.fileUrl}
            alt="첨부 이미지"
            style={{ 
              maxWidth: "100%", 
              marginTop: 10,
              borderRadius: "8px",
              cursor: "pointer"
            }}
            onClick={() => window.open(post.fileUrl, '_blank')}
          />
        )}

        {/* 녹음 파일 표시 */}
        {(post.recordingUrl || post.recordingURL || post.downloadURL) && (
          <div style={{
            backgroundColor: darkMode ? "#333" : "#f8f4ff",
            padding: "15px",
            borderRadius: "10px",
            marginTop: "15px",
            border: `2px solid ${darkMode ? "#7e57c2" : "#e8dbff"}`
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: darkMode ? "#bb86fc" : "#7e57c2",
              fontSize: "16px",
              fontWeight: "bold",
              marginBottom: "10px"
            }}>
              🎵 녹음 파일
            </div>
            <audio 
              controls 
              style={{ 
                width: "100%",
                outline: "none"
              }}
              preload="metadata"
            >
              <source src={post.recordingUrl || post.recordingURL || post.downloadURL} type="audio/mpeg" />
              <source src={post.recordingUrl || post.recordingURL || post.downloadURL} type="audio/wav" />
              <source src={post.recordingUrl || post.recordingURL || post.downloadURL} type="audio/ogg" />
              브라우저가 오디오 재생을 지원하지 않습니다.
            </audio>
          </div>
        )}

        {/* 게시글 내용 */}
        <div style={{
          ...styles.content,
          border: darkMode ? "1px solid #555" : "1px solid #d6c4f2",
          borderRadius: "8px",
          padding: "15px",
          backgroundColor: darkMode ? "#444" : "#fafafa",
          marginTop: "15px",
          lineHeight: "1.6"
        }}>
          <TaggedText 
            text={post.content} 
            darkMode={darkMode}
          />
        </div>

        <button
          onClick={toggleLike}
          style={{ 
            ...smallBtn, 
            background: liked 
              ? (darkMode ? "#d48cff" : "#c77dff") 
              : (darkMode ? "#bb86fc" : "#7e57c2"), 
            marginTop: 16 
          }}
        >
          ❤️ ({post.likes || 0})
        </button>

        {/* 쪽지 보내기 버튼 추가 */}
        {me && me !== post.nickname && (
          <button
            onClick={() => sendMessage(post.nickname, post.title)}
            style={{
              ...smallBtn,
              background: darkMode ? "#4caf50" : "#2e7d32",
              marginTop: 16,
              marginLeft: 8
            }}
          >
            💌 쪽지 보내기
          </button>
        )}

        {canEditOrDelete && (
          <div style={{ marginTop: 20 }}>
            {type === "post" && post.nickname === me && (
              <label>
                <input
                  type="checkbox"
                  checked={post.partnerDone}
                  onChange={(e) => togglePartnerDone(e.target.checked)}
                />{" "}
                파트너 구인 완료
              </label>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              {post.nickname === me && (
                <button
                  style={editBtn}
                  onClick={() => nav(`/edit/${type}/${post.id}`)}
                >✏️</button>
              )}
              <button
                style={deleteBtn}
                onClick={onDelete}
              >🗑️</button>
            </div>
          </div>
        )}

        {!canEditOrDelete && post.partnerDone && type === "post" && (
          <p style={partnerDoneStyle}>✅ 이 글은 파트너 구인을 완료했습니다</p>
        )}
      </div>

      {/* 댓글 작성 부분 */}
      <div style={commentInputContainerStyle}>
        <h3 style={{ color: darkMode ? "#bb86fc" : "#7e57c2", marginBottom: 12 }}>댓글 작성</h3>
        <TagInput
          value={commentText}
          onChange={setCommentText}
          onTag={(username) => console.log('Tagged:', username)}
          placeholder="댓글을 입력하세요... (@를 입력하여 다른 사용자를 태그할 수 있습니다)"
          darkMode={darkMode}
          maxLength={1000}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <label style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              checked={isPrivateComment}
              onChange={(e) => setIsPrivateComment(e.target.checked)}
            />
            비밀 댓글
          </label>
          <button onClick={addComment} style={commentBtnStyle}>댓글 등록</button>
        </div>
      </div>

      {/* 댓글 목록 */}
      <div style={commentListContainerStyle}>
        <h3 style={{ color: darkMode ? "#bb86fc" : "#7e57c2", marginBottom: 12 }}>
          댓글 목록 ({comments.length})
        </h3>
        
        {comments.length === 0 ? (
          <p style={{ textAlign: "center", color: darkMode ? "#aaa" : "#666", marginTop: 20 }}>
            첫 댓글을 작성해보세요!
          </p>
        ) : (
          comments.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              type={type}
              postId={id}
              darkMode={darkMode}
              me={me}
              postOwner={post.nickname}
              postTitle={post.title}
            />
          ))
        )}
      </div>
    </div>
  );
}

// CommentItem 컴포넌트 - 댓글 및 답글 표시
function CommentItem({ comment, type, postId, darkMode, me, postOwner, postTitle }) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [likes, setLikes] = useState(comment.likes || 0);
  const [likedBy, setLikedBy] = useState(comment.likedBy || []);
  const [isLiked, setIsLiked] = useState(likedBy.includes(me));
  const [replies, setReplies] = useState([]);

  // 스타일 정의
  const commentContainerStyle = {
    marginBottom: 16,
  };
  const commentBoxStyle = {
    background: darkMode ? "#444" : "#f3e7ff",
    border: darkMode ? "1px solid #666" : "1px solid #b49ddb",
    borderRadius: 10,
    padding: 16,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    // 모바일 반응형
    "@media (max-width: 768px)": {
      padding: "12px"
    }
  };
  const secretCommentBoxStyle = {
    background: darkMode ? "#555" : "#f0f0f0",
    border: darkMode ? "1px solid #777" : "1px solid #ccc",
    borderRadius: 10,
    padding: 16,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    // 모바일 반응형
    "@media (max-width: 768px)": {
      padding: "12px"
    }
  };
  const commentHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  };
  const commentTextStyle = {
    whiteSpace: "pre-wrap",
    fontSize: 15,
    color: darkMode ? "#e0e0e0" : "#000",
  };
  const secretCommentTextStyle = {
    color: darkMode ? "#aaa" : "#888",
    fontStyle: "italic",
    textAlign: "center",
  };
  const commentActionStyle = {
    display: "flex",
    gap: 8,
    marginTop: 12,
  };
  const commentActionBtnStyle = {
    padding: "4px 10px",
    background: darkMode ? "#bb86fc" : "#7e57c2",
    color: "white",
    border: "none",
    borderRadius: 4,
    fontSize: 13,
    cursor: "pointer",
  };
  const replyBoxStyle = {
    marginTop: 12,
    padding: 12,
    background: darkMode ? "#555" : "#efe2ff",
    borderRadius: 8,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    // 모바일 반응형
    "@media (max-width: 768px)": {
      padding: "10px",
      marginTop: "10px"
    }
  };
  const replyInputStyle = {
    width: "100%",
    height: 60,
    padding: 10,
    borderRadius: 6,
    border: darkMode ? "1px solid #666" : "1px solid #d6c4f2",
    backgroundColor: darkMode ? "#666" : "#ffffff",
    color: darkMode ? "#e0e0e0" : "#000",
    resize: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
    fontSize: "16px", // iOS 줌 방지
    wordWrap: "break-word",
    overflowWrap: "break-word",
    // 모바일 반응형
    "@media (max-width: 768px)": {
      height: "50px",
      padding: "8px",
      fontSize: "16px" // iOS 줌 방지 유지
    }
  };
  const repliesContainerStyle = {
    marginTop: 12,
    paddingLeft: 12,
    borderLeft: darkMode ? "2px solid #666" : "2px solid #d6c4f2",
  };
  const commentBtnStyle = {
    padding: "8px 16px",
    background: darkMode ? "#bb86fc" : "#7e57c2",
    color: "white",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: "bold",
  };

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

  const toggleLike = async () => {
    if (isLiked) {
      alert("이미 좋아요를 눌렀습니다");
      return;
    }

    const updatedLikedBy = [...likedBy, me];
    const updatedLikes = likes + 1;

    await updateDoc(commentRef, {
      likedBy: updatedLikedBy,
      likes: updatedLikes
    });

    setLikedBy(updatedLikedBy);
    setLikes(updatedLikes);
    setIsLiked(true);
    
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
  };

  // 답글 작성 함수
  const submitReply = async () => {
    if (!replyText.trim()) return alert("내용을 입력하세요");

    // 답글 추가
    const replyRef = await addDoc(collection(db, `${type}-${postId}-comments`), {
      nickname: me,
      text: replyText,
      isPrivate,
      createdAt: Timestamp.now(),
      parentId: comment.id,
      likes: 0,
      likedBy: []
    });
    
    // 태그된 사용자들에게 알림 생성
    const taggedUsers = processTaggedUsers(replyText);
    for (const taggedUser of taggedUsers) {
      await createTagNotification({
        taggedUser,
        taggerNickname: me,
        postId: postId,
        postType: type,
        postTitle: postTitle,
        commentId: replyRef.id,
        commentText: replyText
      });
    }
    
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
  };

  const deleteComment = async () => {
    if (!window.confirm("댓글을 삭제할까요?")) return;
    await deleteDoc(doc(db, `${type}-${postId}-comments`, comment.id));
  };

  // 쪽지 보내기 함수
  const sendMessageToCommentAuthor = async () => {
    if (!me) {
      alert("로그인이 필요합니다.");
      return;
    }
    
    if (me === comment.author) {
      alert("자신에게는 쪽지를 보낼 수 없습니다.");
      return;
    }
    
    const messageContent = prompt(`${comment.author}님에게 보낸 메시지를 입력하세요:`);
    if (!messageContent || !messageContent.trim()) {
      return;
    }
    
    try {
      await addDoc(collection(db, "messages"), {
        senderNickname: me,
        receiverNickname: comment.author,
        content: messageContent.trim(),
        createdAt: Timestamp.now(),
        read: false,
        relatedPostTitle: postTitle
      });
      
      alert("쪽지가 전송되었습니다.");
    } catch (error) {
      console.error("쪽지 전송 오류:", error);
      alert("쪽지 전송 중 오류가 발생했습니다.");
    }
  };

  return (
    <div style={commentContainerStyle}>
      <div style={canView ? commentBoxStyle : secretCommentBoxStyle}>
        <div style={commentHeaderStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong>{comment.nickname || "알 수 없음"}</strong>
            {comment.isPrivate && <span style={{ fontSize: 14, color: "#e67e22" }}>🔒</span>}
          </div>
          <span style={{ fontSize: 12, color: darkMode ? "#aaa" : "#666" }}>
            {new Date(comment.createdAt.seconds * 1000).toLocaleString()}
          </span>
        </div>
        
        {canView ? (
          <p style={commentTextStyle}>{comment.text}</p>
        ) : (
          <p style={secretCommentTextStyle}>🔒 비밀댓글입니다</p>
        )}

        {canView && (
          <div style={commentActionStyle}>
            <button onClick={toggleLike} style={commentActionBtnStyle}>
              👍 {likes}
            </button>

            <button 
              style={commentActionBtnStyle} 
              onClick={() => setShowReplyBox(x => !x)}
            >
              ↪️ 답글
            </button>

            {comment.nickname === me && (
              <>
                <button
                  onClick={() => window.location.href = `/comment-edit/${type}/${postId}/${comment.id}`}
                  style={{ ...commentActionBtnStyle, background: '#6a1b9a' }}
                >
                  ✏️ 수정
                </button>
                <button
                  onClick={deleteComment}
                  style={{ ...commentActionBtnStyle, background: 'red' }}
                >
                  🗑️ 삭제
                </button>
              </>
            )}
            {/* 쪽지 보내기 버튼 추가 */}
            {me && me !== comment.author && (
              <button 
                onClick={sendMessageToCommentAuthor} 
                style={{
                  ...commentActionBtnStyle,
                  background: darkMode ? "#4caf50" : "#2e7d32"
                }}
              >
                💌 쪽지
              </button>
            )}
          </div>
        )}

        {showReplyBox && (
          <div style={replyBoxStyle}>
            <TagInput
              value={replyText}
              onChange={setReplyText}
              onTag={(username) => console.log('Tagged:', username)}
              placeholder="답글을 입력하세요... (@를 입력하여 다른 사용자를 태그할 수 있습니다)"
              darkMode={darkMode}
              maxLength={1000}
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <label style={{ fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={e => setIsPrivate(e.target.checked)}
                />
                비밀 답글
              </label>
              <button onClick={submitReply} style={commentBtnStyle}>답글 등록</button>
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ReplyItem 컴포넌트 - 답글 표시
function ReplyItem({ reply, type, postId, darkMode, me, postOwner, postTitle }) {
  const [likes, setLikes] = useState(reply.likes || 0);
  const [likedBy, setLikedBy] = useState(reply.likedBy || []);
  const [isLiked, setIsLiked] = useState(likedBy.includes(me));

  // 스타일 정의
  const replyItemStyle = {
    marginTop: 10,
    paddingTop: 10,
    borderTop: darkMode ? "1px dashed #666" : "1px dashed #d6c4f2",
  };
  const replyHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  };
  const replyTextStyle = {
    whiteSpace: "pre-wrap",
    fontSize: 14,
    color: darkMode ? "#e0e0e0" : "#000",
  };
  const secretCommentTextStyle = {
    color: darkMode ? "#aaa" : "#888",
    fontStyle: "italic",
    textAlign: "center",
    fontSize: 14,
  };
  const replyActionStyle = {
    display: "flex",
    gap: 8,
    marginTop: 8,
  };
  const commentActionBtnStyle = {
    padding: "4px 10px",
    background: darkMode ? "#bb86fc" : "#7e57c2",
    color: "white",
    border: "none",
    borderRadius: 4,
    fontSize: 13,
    cursor: "pointer",
  };

  const replyRef = doc(db, `${type}-${postId}-comments`, reply.id);
  const canView = !reply.isPrivate || reply.nickname === me || postOwner === me;

  const toggleLike = async () => {
    if (isLiked) {
      alert("이미 좋아요를 눌렀습니다");
      return;
    }

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
  };

  const deleteReply = async () => {
    if (!window.confirm("답글을 삭제할까요?")) return;
    await deleteDoc(doc(db, `${type}-${postId}-comments`, reply.id));
  };

  // 쪽지 보내기 함수
  const sendMessageToReplyAuthor = async () => {
    if (!me) {
      alert("로그인이 필요합니다.");
      return;
    }
    
    if (me === reply.nickname) {
      alert("자신에게는 쪽지를 보낼 수 없습니다.");
      return;
    }
    
    const messageContent = prompt(`${reply.nickname}님에게 보낼 메시지를 입력하세요:`);
    if (!messageContent || !messageContent.trim()) {
      return;
    }
    
    try {
      await addDoc(collection(db, "messages"), {
        senderNickname: me,
        receiverNickname: reply.nickname,
        content: messageContent.trim(),
        createdAt: Timestamp.now(),
        read: false,
        relatedPostTitle: postTitle
      });
      
      alert("쪽지가 전송되었습니다.");
    } catch (error) {
      console.error("쪽지 전송 오류:", error);
      alert("쪽지 전송 중 오류가 발생했습니다.");
    }
  };

  return (
    <div style={replyItemStyle}>
      <div style={replyHeaderStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong>{reply.nickname || "알 수 없음"}</strong>
          {reply.isPrivate && <span style={{ fontSize: 14, color: "#e67e22" }}>🔒</span>}
        </div>
        <span style={{ fontSize: 12, color: darkMode ? "#aaa" : "#666" }}>
          {new Date(reply.createdAt.seconds * 1000).toLocaleString()}
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
              background: isLiked 
                ? (darkMode ? "#9c27b0" : "#6a1b9a") 
                : (darkMode ? "#bb86fc" : "#7e57c2")
            }}
            disabled={isLiked}
          >
            {isLiked ? "👍" : "👍"} {likes}
          </button>
          {reply.nickname === me && (
            <button onClick={deleteReply} style={{ ...commentActionBtnStyle, background: darkMode ? "#cf6679" : "#dc3545" }}>
              삭제
            </button>
          )}
          {/* 쪽지 보내기 버튼 추가 */}
          {me && me !== reply.nickname && (
            <button 
              onClick={sendMessageToReplyAuthor} 
              style={{
                ...commentActionBtnStyle,
                background: darkMode ? "#4caf50" : "#2e7d32"
              }}
            >
              💌 쪽지
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default PostDetail;
