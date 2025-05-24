import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { containerStyle, darkContainerStyle, titleStyle } from "./style";

function MyComments({ darkMode }) {
  const navigate = useNavigate();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const nickname = localStorage.getItem("nickname");

  useEffect(() => {
    const fetchMyComments = async () => {
      if (!nickname) return;
      
      try {
        setLoading(true);
        
        // 모든 게시판에서 게시글을 먼저 가져온 후 각 게시글의 댓글 컬렉션에서 내 댓글 찾기
        const collections = [
          { name: "posts", type: "post", boardName: "듀엣/합창" },
          { name: "freeposts", type: "freepost", boardName: "자유게시판" },
          { name: "songs", type: "song", boardName: "노래추천" },
          { name: "advice", type: "advice", boardName: "고민상담" }
        ];

        const allComments = [];

        for (const col of collections) {
          // 각 게시판의 모든 게시글 가져오기
          const postsSnapshot = await getDocs(collection(db, col.name));
          
          for (const postDoc of postsSnapshot.docs) {
            const postData = postDoc.data();
            const postId = postDoc.id;
            
            try {
              // 각 게시글의 댓글 컬렉션에서 내가 작성한 댓글 찾기
              const commentCollectionName = `${col.type}-${postId}-comments`;
              const commentsQuery = query(
                collection(db, commentCollectionName),
                where("nickname", "==", nickname),
                orderBy("createdAt", "desc")
              );
              const commentsSnapshot = await getDocs(commentsQuery);
              
              commentsSnapshot.forEach(commentDoc => {
                const commentData = commentDoc.data();
                allComments.push({
                  id: commentDoc.id,
                  ...commentData,
                  postId: postId,
                  postTitle: postData.title,
                  type: col.type,
                  boardName: col.boardName
                });
              });
            } catch (error) {
              // 댓글 컬렉션이 없거나 오류가 발생해도 계속 진행
              console.log(`댓글 컬렉션 ${col.type}-${postId}-comments 처리 중 오류:`, error);
            }
          }
        }

        // 최신순으로 정렬
        allComments.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.seconds - a.createdAt.seconds;
        });
        
        setComments(allComments);
      } catch (error) {
        console.error("내 댓글 조회 오류:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMyComments();
  }, [nickname]);

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp.seconds * 1000);
    return `${date.getFullYear()}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getDate().toString().padStart(2, '0')}`;
  };

  const handleCommentClick = (comment) => {
    navigate(`/post/${comment.type}/${comment.postId}`);
  };

  const cardStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "8px",
    padding: "15px",
    marginBottom: "15px",
    boxShadow: `0 2px 8px ${darkMode ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"}`,
    cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s",
    border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
  };

  const boardTagStyle = {
    display: "inline-block",
    padding: "4px 8px",
    backgroundColor: darkMode ? "#7e57c2" : "#f3e7ff",
    color: darkMode ? "#fff" : "#7e57c2",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "bold",
    marginBottom: "8px"
  };

  if (loading) {
    return (
      <div style={darkMode ? darkContainerStyle : containerStyle}>
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ 
            width: "40px", 
            height: "40px", 
            border: "4px solid #f3e7ff", 
            borderTop: "4px solid #7e57c2", 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite", 
            margin: "0 auto 20px" 
          }}></div>
          <p>내 댓글을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>💬 내가 쓴 댓글 ({comments.length}개)</h1>
      
      {comments.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "60px 20px",
          color: darkMode ? "#888" : "#666"
        }}>
          <div style={{ fontSize: "48px", marginBottom: "20px" }}>💬</div>
          <h3>작성한 댓글이 없습니다</h3>
          <p>첫 번째 댓글을 남겨보세요!</p>
        </div>
      ) : (
        <div>
          {comments.map((comment) => (
            <div
              key={`${comment.type}-${comment.id}`}
              style={cardStyle}
              onClick={() => handleCommentClick(comment)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 4px 12px ${darkMode ? "rgba(0, 0, 0, 0.4)" : "rgba(0, 0, 0, 0.15)"}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = `0 2px 8px ${darkMode ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"}`;
              }}
            >
              <div style={boardTagStyle}>{comment.boardName}</div>
              <h4 style={{
                margin: "0 0 8px 0",
                color: darkMode ? "#bbb" : "#666",
                fontSize: "14px",
                fontWeight: "normal"
              }}>
                게시글: {comment.postTitle}
              </h4>
              <p style={{
                margin: "0 0 10px 0",
                color: darkMode ? "#e0e0e0" : "#333",
                fontSize: "15px",
                lineHeight: "1.5",
                backgroundColor: darkMode ? "#333" : "#f9f9f9",
                padding: "10px",
                borderRadius: "6px",
                borderLeft: `4px solid ${darkMode ? "#7e57c2" : "#e0e0e0"}`
              }}>
                {comment.content}
              </p>
              <div style={{
                fontSize: "12px",
                color: darkMode ? "#888" : "#999",
                textAlign: "right"
              }}>
                작성일: {formatDate(comment.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyComments; 