import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import CustomLink from "./CustomLink";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "../firebase";
import { containerStyle, darkContainerStyle, titleStyle } from "../components/style";

function PopularPosts({ darkMode, limit: postLimit }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("views"); // 'views' 또는 'likes'

  const fetchPosts = () => {
    setLoading(true);
    setError(null);
    
    // 정렬 기준에 따라 쿼리 생성
    const q = query(
      collection(db, "posts"), 
      orderBy(sortBy === "views" ? "views" : "likesCount", "desc"),
      limit(postLimit)
    );
    
    return onSnapshot(
      q, 
      (snapshot) => {
        const postsData = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // likes가 undefined일 경우를 대비해 기본값 설정
            likesCount: data.likes?.length || 0
          };
        });
        setPosts(postsData);
        setLoading(false);
      },
      (err) => {
        console.error("인기 게시물 불러오기 오류:", err);
        setError("게시물을 불러오는 중 오류가 발생했습니다.");
        setLoading(false);
      }
    );
  };

  useEffect(() => {
    const unsubscribe = fetchPosts();
    // 컴포넌트 언마운트 시 리스너 제거
    return () => unsubscribe();
  }, [sortBy, postLimit]);

  // 정렬 기준 변경 핸들러
  const handleSortChange = (criteria) => {
    setSortBy(criteria);
  };

  // 새로고침 핸들러
  const handleRefresh = () => {
    fetchPosts();
  };

  // 카드 스타일 - 다크모드에 따라 조정
  const getCardStyle = () => ({
    margin: "12px 0",
    padding: 14,
    borderRadius: 12,
    background: darkMode ? "#3a2a5a" : "#f3e7ff", // 다크모드 시 어두운 보라색
    border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`,
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    cursor: "pointer",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    "&:hover": {
      transform: "translateY(-2px)",
      boxShadow: "0 4px 8px rgba(0,0,0,0.15)"
    }
  });

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <h1 style={titleStyle}>🔥 인기 게시물</h1>
        <div>
          <button 
            onClick={() => handleSortChange("views")} 
            style={{ 
              marginRight: "8px", 
              padding: "4px 8px",
              backgroundColor: sortBy === "views" ? "#7e57c2" : "#e0e0e0",
              color: sortBy === "views" ? "white" : "black",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            조회수순
          </button>
          <button 
            onClick={() => handleSortChange("likes")} 
            style={{ 
              marginRight: "8px",
              padding: "4px 8px",
              backgroundColor: sortBy === "likes" ? "#7e57c2" : "#e0e0e0",
              color: sortBy === "likes" ? "white" : "black",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            좋아요순
          </button>
          <button 
            onClick={handleRefresh} 
            style={{ 
              padding: "4px 8px",
              backgroundColor: "#e0e0e0",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            🔄 새로고침
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <p>인기 게시물을 불러오는 중...</p>
          <div style={{ 
            width: "30px", 
            height: "30px", 
            border: "3px solid #f3e7ff", 
            borderTop: "3px solid #7e57c2", 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite", 
            margin: "0 auto" 
          }}></div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      ) : error ? (
        <div style={{ 
          padding: "20px", 
          textAlign: "center", 
          color: "#d32f2f",
          backgroundColor: darkMode ? "#482121" : "#ffebee",
          borderRadius: "8px"
        }}>
          <p>{error}</p>
          <button 
            onClick={handleRefresh}
            style={{
              padding: "8px 16px",
              backgroundColor: "#d32f2f",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginTop: "10px"
            }}
          >
            다시 시도
          </button>
        </div>
      ) : posts.length === 0 ? (
        <div style={{ 
          padding: "30px", 
          textAlign: "center", 
          backgroundColor: darkMode ? "#333" : "#f5f5f5",
          borderRadius: "8px"
        }}>
          <p style={{ fontSize: "16px", color: darkMode ? "#bbb" : "#666" }}>
            아직 게시물이 없습니다.
          </p>
        </div>
      ) : (
        <div>
          {posts.map(post => (
            <CustomLink to={`/post/duet/${post.id}`} key={post.id} style={{ textDecoration: "none" }}>
              <div style={getCardStyle()}>
                <h3 style={{ 
                  color: darkMode ? "#d4c2ff" : "#7e57c2", 
                  margin: "0 0 8px 0" 
                }}>
                  {post.title}
                </h3>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ 
                    fontSize: 12, 
                    color: darkMode ? "#bbb" : "#666",
                    margin: 0 
                  }}>
                    조회수: {post.views || 0} · 좋아요: {post.likesCount}
                  </p>
                  {post.createdAt && (
                    <p style={{ 
                      fontSize: 12, 
                      color: darkMode ? "#bbb" : "#666",
                      margin: 0 
                    }}>
                      {new Date(post.createdAt.toDate()).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {post.author && (
                  <p style={{ 
                    fontSize: 12, 
                    color: darkMode ? "#bbb" : "#666",
                    margin: "4px 0 0 0",
                    textAlign: "right"
                  }}>
                    작성자: {post.author.displayName || "익명"}
                  </p>
                )}
              </div>
            </CustomLink>
          ))}
          {posts.length === postLimit && (
            <div style={{ textAlign: "center", marginTop: "15px" }}>
              <CustomLink to="/popular" style={{ 
                color: darkMode ? "#d4c2ff" : "#7e57c2", 
                textDecoration: "none",
                fontSize: "14px"
              }}>
                더 많은 인기 게시물 보기 →
              </CustomLink>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

PopularPosts.propTypes = {
  darkMode: PropTypes.bool,
  limit: PropTypes.number
};

PopularPosts.defaultProps = {
  darkMode: false,
  limit: 5
};

export default PopularPosts;
