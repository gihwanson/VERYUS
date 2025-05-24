import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { containerStyle, darkContainerStyle, titleStyle } from "./style";

function MyLikes({ darkMode }) {
  const navigate = useNavigate();
  const [likedPosts, setLikedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const nickname = localStorage.getItem("nickname");

  useEffect(() => {
    const fetchMyLikes = async () => {
      if (!nickname) return;
      
      try {
        setLoading(true);
        
        // 모든 게시판에서 내가 좋아요한 글 찾기
        const collections = [
          { name: "posts", type: "post", boardName: "듀엣/합창" },
          { name: "freeposts", type: "freepost", boardName: "자유게시판" },
          { name: "songs", type: "song", boardName: "노래추천" },
          { name: "advice", type: "advice", boardName: "고민상담" }
        ];

        const allLikedPosts = [];

        for (const col of collections) {
          const postsSnapshot = await getDocs(collection(db, col.name));
          
          postsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.likedBy && data.likedBy.includes(nickname)) {
              allLikedPosts.push({
                id: doc.id,
                ...data,
                type: col.type,
                boardName: col.boardName
              });
            }
          });
        }

        // 최신순으로 정렬
        allLikedPosts.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setLikedPosts(allLikedPosts);
      } catch (error) {
        console.error("좋아요한 글 조회 오류:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMyLikes();
  }, [nickname]);

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp.seconds * 1000);
    return `${date.getFullYear()}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getDate().toString().padStart(2, '0')}`;
  };

  const handlePostClick = (post) => {
    navigate(`/post/${post.type}/${post.id}`);
  };

  const cardStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "8px",
    padding: "20px",
    marginBottom: "15px",
    boxShadow: `0 2px 8px ${darkMode ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"}`,
    cursor: "pointer",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
  };

  const boardTagStyle = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "bold",
    marginBottom: "8px",
    backgroundColor: darkMode ? "#7e57c2" : "#9c68e6",
    color: "#fff"
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>❤️ 좋아요한 글</h1>
      
      {loading ? (
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
          <p>좋아요한 글을 불러오는 중...</p>
        </div>
      ) : likedPosts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <p style={{ color: darkMode ? "#aaa" : "#666" }}>좋아요한 글이 없습니다.</p>
          <button 
            onClick={() => navigate("/")} 
            style={{
              padding: "10px 20px",
              backgroundColor: darkMode ? "#7e57c2" : "#9c68e6",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              marginTop: "20px"
            }}
          >
            게시판 둘러보기
          </button>
        </div>
      ) : (
        <div>
          <p style={{ 
            marginBottom: "20px", 
            color: darkMode ? "#aaa" : "#666" 
          }}>
            총 {likedPosts.length}개의 글에 좋아요를 눌렀습니다.
          </p>
          
          {likedPosts.map(post => (
            <div 
              key={`${post.type}-${post.id}`}
              style={cardStyle}
              onClick={() => handlePostClick(post)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = darkMode 
                  ? "0 4px 12px rgba(0, 0, 0, 0.4)" 
                  : "0 4px 12px rgba(0, 0, 0, 0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = darkMode 
                  ? "0 2px 8px rgba(0, 0, 0, 0.3)" 
                  : "0 2px 8px rgba(0, 0, 0, 0.1)";
              }}
            >
              <div style={boardTagStyle}>{post.boardName}</div>
              <h3 style={{ 
                margin: "0 0 10px 0", 
                color: darkMode ? "#e0e0e0" : "#333",
                fontSize: "18px"
              }}>
                {post.title}
              </h3>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                fontSize: "14px",
                color: darkMode ? "#aaa" : "#666"
              }}>
                <span>작성자: {post.nickname || "알 수 없음"}</span>
                <span>{formatDate(post.createdAt)}</span>
              </div>
              <div style={{ 
                marginTop: "10px",
                fontSize: "14px",
                color: darkMode ? "#aaa" : "#666",
                display: "flex",
                gap: "15px"
              }}>
                <span>❤️ {post.likes || 0}</span>
                <span>💬 {post.commentCount || 0}</span>
                <span>👁️ {post.viewCount || 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default MyLikes; 