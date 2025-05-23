import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { Link, useNavigate } from "react-router-dom";
import {
  collection, query, orderBy, limit, getDocs, where, onSnapshot
} from "firebase/firestore";
import { db } from "../firebase";

function MainBoardList({ darkMode }) {
  const navigate = useNavigate();
  const [posts, setPosts] = useState({
    duet: { items: [], loading: true, error: null },
    free: { items: [], loading: true, error: null },
    song: { items: [], loading: true, error: null },
    advice: { items: [], loading: true, error: null }
  });
  
  // ref 객체를 사용하여 직접 DOM에 접근할 링크 참조 생성
  const linkRefs = useRef({});
  
  const [activeHover, setActiveHover] = useState(null);
  const POST_COUNT = 3; // 각 게시판별 표시할 게시물 수
  
  // 댓글 수 실시간 업데이트를 위한 상태 추가
  const [commentCounts, setCommentCounts] = useState({});
  
  useEffect(() => {
    // ref 객체 초기화
    linkRefs.current = {};
    
    const fetchPosts = async (collectionName, boardType) => {
      try {
        // 쿼리 생성 - 최신순으로 POST_COUNT개 가져오기
        const q = query(
          collection(db, collectionName), 
          orderBy("createdAt", "desc"), 
          limit(POST_COUNT)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setPosts(prev => ({
            ...prev,
            [boardType]: { 
              items: [], 
              loading: false, 
              error: null 
            }
          }));
          return;
        }
        
        const fetchedPosts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setPosts(prev => ({
          ...prev,
          [boardType]: { 
            items: fetchedPosts, 
            loading: false, 
            error: null 
          }
        }));
      } catch (err) {
        console.error(`${collectionName} 게시물 불러오기 오류:`, err);
        setPosts(prev => ({
          ...prev,
          [boardType]: { 
            items: [], 
            loading: false, 
            error: "게시물을 불러오는 중 오류가 발생했습니다." 
          }
        }));
      }
    };

    // 각 게시판의 데이터 가져오기
    fetchPosts("posts", "duet");
    fetchPosts("freeposts", "free");
    fetchPosts("songs", "song");
    fetchPosts("advice", "advice");
  }, []);
  
  // 댓글 수 실시간 감시 설정
  useEffect(() => {
    const unsubscribes = [];

    Object.keys(boardInfo).forEach(boardType => {
      // 각 게시판의 최근 게시글들에 대한 댓글 컬렉션 감시
      posts[boardType].items.forEach(post => {
        const commentRef = collection(db, `${boardType}-${post.id}-comments`);
        const unsubscribe = onSnapshot(commentRef, (snapshot) => {
          setCommentCounts(prev => ({
            ...prev,
            [`${boardType}-${post.id}`]: snapshot.size
          }));
        });
        unsubscribes.push(unsubscribe);
      });
    });

    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [posts]);
  
  // 시간 포맷팅 함수
  const formatTime = (seconds) => {
    if (!seconds) return "";
    
    const date = new Date(seconds * 1000);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffSec < 60) {
      return "방금 전";
    } else if (diffMin < 60) {
      return `${diffMin}분 전`;
    } else if (diffHour < 24) {
      return `${diffHour}시간 전`;
    } else if (diffDay < 7) {
      return `${diffDay}일 전`;
    } else {
      return `${date.getFullYear()}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getDate().toString().padStart(2, '0')}`;
    }
  };
  
  // 게시판 정보
  const boardInfo = {
    duet: {
      title: "🎤 듀엣/합창 게시판",
      color: "#7e57c2",
      bgLight: "#f3eaff",
      bgDark: "#3a2a5a",
      hoverLight: "#e8dbff",
      hoverDark: "#4a3a6a",
      route: "/duet",
      postRoute: "/post/post"
    },
    free: {
      title: "📝 자유 게시판",
      color: "#1976d2",
      bgLight: "#e3f2fd",
      bgDark: "#193c6a",
      hoverLight: "#d6eafb",
      hoverDark: "#23487a",
      route: "/freeboard",
      postRoute: "/post/freepost"
    },
    song: {
      title: "🎵 노래 추천 게시판",
      color: "#d81b60",
      bgLight: "#ffe0f0",
      bgDark: "#5a1d3e",
      hoverLight: "#ffd4e8",
      hoverDark: "#6a2d4e",
      route: "/songs",
      postRoute: "/post/song"
    },
    advice: {
      title: "💬 고민 상담 게시판",
      color: "#3f51b5",
      bgLight: "#e8eaf6",
      bgDark: "#2a325a",
      hoverLight: "#dde0f2",
      hoverDark: "#3a426a",
      route: "/advice",
      postRoute: "/post/advice"
    }
  };
  
  // 기본 카드 스타일
  const getCardStyle = (boardType, isHovering) => ({
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    boxShadow: isHovering 
      ? `0 4px 15px rgba(0,0,0,${darkMode ? 0.3 : 0.15})` 
      : `0 2px 8px rgba(0,0,0,${darkMode ? 0.25 : 0.1})`,
    textDecoration: "none",
    display: "block",
    background: isHovering 
      ? (darkMode ? boardInfo[boardType].hoverDark : boardInfo[boardType].hoverLight)
      : (darkMode ? boardInfo[boardType].bgDark : boardInfo[boardType].bgLight),
    color: darkMode ? "#fff" : "#333",
    transition: "all 0.3s ease",
    transform: isHovering ? "translateY(-3px)" : "translateY(0)"
  });
  
  // 게시물 항목 스타일
  const postItemStyle = {
    padding: "10px 15px",
    marginBottom: "8px",
    borderRadius: "8px",
    backgroundColor: darkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.5)",
    transition: "background-color 0.2s",
    cursor: "pointer"
  };
  
  // 로딩 스켈레톤 스타일
  const skeletonStyle = {
    height: "20px",
    backgroundColor: darkMode ? "#555" : "#f0f0f0",
    borderRadius: "4px",
    marginBottom: "10px",
    animation: "pulse 1.5s infinite ease-in-out"
  };
  
  // 더 보기 버튼 스타일
  const viewMoreStyle = {
    display: "inline-block",
    padding: "8px 15px",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    borderRadius: "20px",
    fontSize: "14px",
    marginTop: "10px",
    color: darkMode ? "#e0e0e0" : "#333",
    transition: "background-color 0.2s",
    cursor: "pointer",
    textAlign: "center"
  };

  // 게시글 클릭 핸들러
  const handlePostClick = (boardType, postId) => {
    navigate(`${boardInfo[boardType].postRoute}/${postId}`);
  };

  return (
    <div style={{ 
      maxWidth: 900, 
      margin: "0 auto", 
      padding: 20,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
      gap: "20px"
    }}>
      {/* 스켈레톤 애니메이션 */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
        
        /* 링크 요소의 히든 스타일 */
        .hidden-link {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
      
      {/* 각 게시판 카드 */}
      {Object.keys(boardInfo).map(boardType => (
        <div 
          key={boardType} 
          style={getCardStyle(boardType, activeHover === boardType)}
          onMouseEnter={() => setActiveHover(boardType)}
          onMouseLeave={() => setActiveHover(null)}
        >
          <h2 style={{ 
            color: boardInfo[boardType].color, 
            marginBottom: 15,
            fontSize: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            {boardInfo[boardType].title}
            <a 
              href={boardInfo[boardType].route} 
              style={{ 
                fontSize: "14px", 
                color: boardInfo[boardType].color,
                opacity: 0.8,
                textDecoration: "none"
              }}
            >
              더보기 →
            </a>
          </h2>
          
          {/* 로딩 중 */}
          {posts[boardType].loading && (
            <>
              <div style={{ ...skeletonStyle, width: "100%" }}></div>
              <div style={{ ...skeletonStyle, width: "80%" }}></div>
              <div style={{ ...skeletonStyle, width: "90%" }}></div>
            </>
          )}
          
          {/* 에러 상태 */}
          {posts[boardType].error && (
            <div style={{
              padding: "15px",
              backgroundColor: darkMode ? "rgba(244, 67, 54, 0.1)" : "rgba(244, 67, 54, 0.05)",
              borderRadius: "8px",
              color: "#f44336",
              fontSize: "14px"
            }}>
              {posts[boardType].error}
            </div>
          )}
          
          {/* 데이터 없음 */}
          {!posts[boardType].loading && !posts[boardType].error && posts[boardType].items.length === 0 && (
            <div style={{
              padding: "20px 0",
              textAlign: "center",
              color: darkMode ? "#aaa" : "#888"
            }}>
              {boardType === 'duet' && "작성된 글이 없습니다"}
              {boardType === 'free' && "작성된 글이 없습니다"}
              {boardType === 'song' && "추천곡이 없습니다"}
              {boardType === 'advice' && "상담글이 없습니다"}
            </div>
          )}
          
          {/* 게시물 목록 */}
          {!posts[boardType].loading && !posts[boardType].error && posts[boardType].items.length > 0 && (
            <div>
              {/* 숨겨진 실제 a 태그들을 미리 준비 */}
              {posts[boardType].items.map((post) => (
                <a
                  key={`link-${boardType}-${post.id}`}
                  id={`${boardType}-${post.id}`}
                  href={`${boardInfo[boardType].postRoute}/${post.id}`}
                  className="hidden-link"
                  rel="noopener noreferrer"
                >
                  {post.title}
                </a>
              ))}
              
              {posts[boardType].items.map((post) => (
                <div 
                  key={post.id} 
                  onClick={() => handlePostClick(boardType, post.id)}
                  style={{
                    ...postItemStyle,
                    backgroundColor: activeHover === boardType 
                      ? (darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.7)") 
                      : (darkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.5)")
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, marginRight: 10 }}>
                      <div style={{ fontSize: "14px", marginBottom: "4px" }}>{post.title}</div>
                      <div style={{ fontSize: "12px", color: darkMode ? "#bbb" : "#666" }}>
                        {post.nickname} • {formatTime(post.createdAt.seconds)} • 
                        <span style={{ marginLeft: "5px" }}>
                          💬 {commentCounts[`${boardType}-${post.id}`] || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              <a 
                href={boardInfo[boardType].route}
                style={{ 
                  textDecoration: "none",
                  display: "block",
                  textAlign: "center"
                }}
              >
                <div style={viewMoreStyle}>
                  {boardType === 'duet' && "모든 듀엣 게시물 보기"}
                  {boardType === 'free' && "모든 자유 게시물 보기"}
                  {boardType === 'song' && "모든 노래 추천 보기"}
                  {boardType === 'advice' && "모든 상담 게시물 보기"}
                </div>
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

MainBoardList.propTypes = {
  darkMode: PropTypes.bool
};

MainBoardList.defaultProps = {
  darkMode: false
};

export default MainBoardList;
