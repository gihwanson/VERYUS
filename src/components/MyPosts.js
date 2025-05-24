import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { containerStyle, darkContainerStyle, titleStyle } from "./style";

function MyPosts({ darkMode }) {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const nickname = localStorage.getItem("nickname");

  useEffect(() => {
    const fetchMyPosts = async () => {
      if (!nickname) return;
      
      try {
        setLoading(true);
        
        // 모든 게시판에서 내가 작성한 글 가져오기
        const [duetPosts, freePosts, songPosts, advicePosts] = await Promise.all([
          getDocs(query(collection(db, "posts"), where("nickname", "==", nickname), orderBy("createdAt", "desc"))),
          getDocs(query(collection(db, "freeposts"), where("nickname", "==", nickname), orderBy("createdAt", "desc"))),
          getDocs(query(collection(db, "songs"), where("nickname", "==", nickname), orderBy("createdAt", "desc"))),
          getDocs(query(collection(db, "advice"), where("nickname", "==", nickname), orderBy("createdAt", "desc")))
        ]);

        const allPosts = [
          ...duetPosts.docs.map(doc => ({ id: doc.id, ...doc.data(), type: "post", boardName: "듀엣/합창" })),
          ...freePosts.docs.map(doc => ({ id: doc.id, ...doc.data(), type: "freepost", boardName: "자유게시판" })),
          ...songPosts.docs.map(doc => ({ id: doc.id, ...doc.data(), type: "song", boardName: "노래추천" })),
          ...advicePosts.docs.map(doc => ({ id: doc.id, ...doc.data(), type: "advice", boardName: "고민상담" }))
        ];

        // 최신순으로 정렬
        allPosts.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setPosts(allPosts);
      } catch (error) {
        console.error("내 게시글 조회 오류:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMyPosts();
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
          <p>내 게시글을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>📝 내가 쓴 글 ({posts.length}개)</h1>
      
      {posts.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "60px 20px",
          color: darkMode ? "#888" : "#666"
        }}>
          <div style={{ fontSize: "48px", marginBottom: "20px" }}>📝</div>
          <h3>작성한 게시글이 없습니다</h3>
          <p>첫 번째 글을 작성해보세요!</p>
        </div>
      ) : (
        <div>
          {posts.map((post) => (
            <div
              key={`${post.type}-${post.id}`}
              style={cardStyle}
              onClick={() => handlePostClick(post)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 4px 12px ${darkMode ? "rgba(0, 0, 0, 0.4)" : "rgba(0, 0, 0, 0.15)"}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = `0 2px 8px ${darkMode ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"}`;
              }}
            >
              <div style={boardTagStyle}>{post.boardName}</div>
              <h3 style={{
                margin: "0 0 8px 0",
                color: darkMode ? "#e0e0e0" : "#333",
                fontSize: "16px"
              }}>
                {post.title}
              </h3>
              <p style={{
                margin: "0 0 10px 0",
                color: darkMode ? "#bbb" : "#666",
                fontSize: "14px",
                lineHeight: "1.4",
                display: "-webkit-box",
                "-webkit-line-clamp": 2,
                "-webkit-box-orient": "vertical",
                overflow: "hidden"
              }}>
                {post.content}
              </p>
              <div style={{
                fontSize: "12px",
                color: darkMode ? "#888" : "#999",
                display: "flex",
                justifyContent: "space-between"
              }}>
                <span>작성일: {formatDate(post.createdAt)}</span>
                <span>조회수: {post.views || 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyPosts; 