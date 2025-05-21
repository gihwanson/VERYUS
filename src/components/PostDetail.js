import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  collection, getDocs, doc, getDoc, updateDoc, deleteDoc, addDoc, Timestamp, query, where, onSnapshot, writeBatch
} from "firebase/firestore";
import { db } from "../firebase";

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

  // 스타일 정의
  const containerStyle = { padding: "2rem" };
  const postStyle = {
    background: "#f3e7ff",
    padding: 24,
    borderRadius: 16,
    border: "1px solid #b49ddb",
    color: "#000",
    marginBottom: 30,
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
    border: "2px solid #7e57c2",
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
    background: "#7e57c2",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontWeight: "bold",
    padding: "10px 16px",
    cursor: "pointer",
  };
  const deleteBtn = {
    background: "red",
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
    background: "#e0ffe0",
    color: "#1a6f1a",
    borderRadius: 6,
    fontWeight: "bold",
  };

  // 댓글 스타일
  const commentInputContainerStyle = {
    background: "#f9f2ff",
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
    border: "1px solid #d6c4f2",
  };
  const commentInputStyle = {
    width: "100%",
    height: 80,
    padding: 12,
    borderRadius: 8,
    border: "1px solid #d6c4f2",
    resize: "none",
    marginBottom: 8,
    fontFamily: "inherit",
  };
  const commentBtnStyle = {
    padding: "8px 16px",
    background: "#7e57c2",
    color: "white",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: "bold",
  };
  const commentListContainerStyle = {
    background: "#f9f2ff",
    padding: 20,
    borderRadius: 12,
    border: "1px solid #d6c4f2",
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
      : "advice";
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
    await addDoc(collection(db, `${type}-${id}-comments`), {
      nickname: me,
      text: commentText,
      isPrivate: isPrivateComment,
      createdAt: Timestamp.now(),
      parentId: null, // 메인 댓글은 parentId가 null
      likes: 0,
      likedBy: []
    });
    
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

  if (!post) return <div style={containerStyle}>로딩 중...</div>;

  const author = post.nickname || "알 수 없음";
  const grade = globalGrades?.[author] || "";
  const profileUrl = globalProfilePics?.[author];
  const canEditOrDelete = post.nickname === me || role === "운영진" || role === "리더";

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={postStyle}>
        <h1 style={{ color: "#7e57c2" }}>{post.title}</h1>

        <div style={authorBox}>
          {profileUrl && <img src={profileUrl} alt="프로필" style={profilePicStyle} />}
          <div>
            <strong>{author}</strong>
            {grade && <span style={{ marginLeft: 6, color: "#7e57c2" }}>({grade})</span>}
          </div>
        </div>

        <p style={{ fontSize: 12, color: "#555" }}>
          {new Date(post.createdAt.seconds * 1000).toLocaleString()} | 작성자:{" "}
          <Link to={`/userpage/${post.nickname}`} style={{ color: "#555", textDecoration: "none" }}>
            {post.nickname}
          </Link>
        </p>

        {post.fileUrl && (
          <img
            src={post.fileUrl}
            alt="첨부 이미지"
            style={{ maxWidth: "100%", marginTop: 10 }}
          />
        )}

        <div style={{ marginTop: 20, whiteSpace: "pre-wrap" }}>{post.content}</div>

        <button
          onClick={toggleLike}
          style={{ ...smallBtn, background: liked ? "#c77dff" : "#7e57c2", marginTop: 16 }}
        >
          ❤️ ({post.likes || 0})
        </button>

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
        <h3 style={{ color: "#7e57c2", marginBottom: 12 }}>댓글 작성</h3>
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="댓글을 입력하세요..."
          style={commentInputStyle}
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
        <h3 style={{ color: "#7e57c2", marginBottom: 12 }}>
          댓글 목록 ({comments.length})
        </h3>
        
        {comments.length === 0 ? (
          <p style={{ textAlign: "center", color: "#666", marginTop: 20 }}>
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
    background: "#f3e7ff",
    border: "1px solid #b49ddb",
    borderRadius: 10,
    padding: 16,
  };
  const secretCommentBoxStyle = {
    background: "#f0f0f0",
    border: "1px solid #ccc",
    borderRadius: 10,
    padding: 16,
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
  };
  const secretCommentTextStyle = {
    color: "#888",
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
    background: "#7e57c2",
    color: "white",
    border: "none",
    borderRadius: 4,
    fontSize: 13,
    cursor: "pointer",
  };
  const replyBoxStyle = {
    marginTop: 12,
    padding: 12,
    background: "#efe2ff",
    borderRadius: 8,
  };
  const replyInputStyle = {
    width: "100%",
    height: 60,
    padding: 10,
    borderRadius: 6,
    border: "1px solid #d6c4f2",
    resize: "none",
    fontFamily: "inherit",
  };
  const repliesContainerStyle = {
    marginTop: 12,
    paddingLeft: 12,
    borderLeft: "2px solid #d6c4f2",
  };
  const commentBtnStyle = {
    padding: "8px 16px",
    background: "#7e57c2",
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

  // 답글 작성 함수에 알림 생성 로직 추가
  const submitReply = async () => {
    if (!replyText.trim()) return alert("내용을 입력하세요");

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
  };

  const deleteComment = async () => {
    if (!window.confirm("댓글을 삭제할까요?")) return;
    await deleteDoc(doc(db, `${type}-${postId}-comments`, comment.id));
  };

  return (
    <div style={commentContainerStyle}>
      <div style={canView ? commentBoxStyle : secretCommentBoxStyle}>
        <div style={commentHeaderStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong>{comment.nickname || "알 수 없음"}</strong>
            {comment.isPrivate && <span style={{ fontSize: 14, color: "#e67e22" }}>🔒</span>}
          </div>
          <span style={{ fontSize: 12, color: "#666" }}>
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
          </div>
        )}

        {showReplyBox && (
          <div style={replyBoxStyle}>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="답글 작성"
              style={replyInputStyle}
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
    borderTop: "1px dashed #d6c4f2",
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
  };
  const secretCommentTextStyle = {
    color: "#888",
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
    background: "#7e57c2",
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

  return (
    <div style={replyItemStyle}>
      <div style={replyHeaderStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong>{reply.nickname || "알 수 없음"}</strong>
          {reply.isPrivate && <span style={{ fontSize: 14, color: "#e67e22" }}>🔒</span>}
        </div>
        <span style={{ fontSize: 12, color: "#666" }}>
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
          <button onClick={toggleLike} style={commentActionBtnStyle}>
            👍 {likes}
          </button>

          {reply.nickname === me && (
            <>
              <button
                onClick={() => window.location.href = `/comment-edit/${type}/${postId}/${reply.id}`}
                style={{ ...commentActionBtnStyle, background: '#6a1b9a' }}
              >
                ✏️ 수정
              </button>
              <button
                onClick={deleteReply}
                style={{ ...commentActionBtnStyle, background: 'red' }}
              >
                🗑️ 삭제
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default PostDetail;
