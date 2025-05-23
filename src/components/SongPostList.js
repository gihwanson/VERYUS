// SongPostList.js
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, onSnapshot, limit, startAfter, getDocs,
  where
} from "firebase/firestore";
import { db } from "../firebase";
import SearchBar from "./SearchBar";
import {
  containerStyle, darkContainerStyle, titleStyle, purpleBtn,
  cardStyle, darkCardStyle
} from "./style";
import Avatar from "./Avatar";

// gradeEmojis 객체 추가
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

function SongPostList({ darkMode, globalProfilePics, globalGrades }) {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [sortBy, setSortBy] = useState("recent"); // recent, popular
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all"); // 카테고리 필터 (all, ballad, dance, hiphop, rock, pop 등)
  const [showMine, setShowMine] = useState(false);
  const me = localStorage.getItem("nickname");
  const nav = useNavigate();
  const observerRef = useRef(null);
  const POSTS_PER_PAGE = 10;

  // 게시글 로드 함수
  const loadPosts = async (isInitialLoad = false) => {
    try {
      setLoading(true);
      
      let q;
      
      // 정렬 및 필터 조건 설정
      const constraints = [];
      
      // 카테고리 필터
      if (categoryFilter !== "all") {
        constraints.push(where("category", "==", categoryFilter));
      }
      
      // 내 글만 보기
      if (showMine) {
        constraints.push(where("nickname", "==", me));
      }
      
      // 정렬 조건
      const orderByField = sortBy === "popular" ? "likes" : "createdAt";
      const orderDirection = "desc";
      
      if (isInitialLoad || !lastVisible) {
        // 첫 페이지
        q = query(
          collection(db, "songs"),
          ...constraints,
          orderBy(orderByField, orderDirection),
          limit(POSTS_PER_PAGE)
        );
      } else {
        // 추가 페이지
        q = query(
          collection(db, "songs"),
          ...constraints,
          orderBy(orderByField, orderDirection),
          startAfter(lastVisible),
          limit(POSTS_PER_PAGE)
        );
      }
      
      const snapshot = await getDocs(q);
      const newPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      if (isInitialLoad) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }
      
      setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === POSTS_PER_PAGE);
    } catch (error) {
      console.error("게시글 로딩 중 오류:", error);
    } finally {
      setLoading(false);
    }
  };

  // 실시간 업데이트 설정
  useEffect(() => {
    // 실시간 업데이트는 필터가 없을 때만 적용
    if (!search && categoryFilter === "all" && !showMine && sortBy === "recent") {
      // 게시글 실시간 업데이트
      const postsQuery = query(
        collection(db, "songs"),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      
      const unsubscribeFromPosts = onSnapshot(postsQuery, snapshot => {
        const changes = snapshot.docChanges();
        changes.forEach(change => {
          if (change.type === "added") {
            const newPost = {
              id: change.doc.id,
              ...change.doc.data()
            };
            
            setPosts(prev => {
              const exists = prev.some(p => p.id === newPost.id);
              if (!exists) {
                return [newPost, ...prev];
              }
              return prev;
            });
          }
        });
      });

      // 댓글 수 실시간 업데이트를 위한 구독
      const unsubscribeFromComments = onSnapshot(
        collection(db, "comments"),
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const commentData = change.doc.data();
            const postId = commentData.postId;

            if (change.type === "added" || change.type === "removed") {
              // 해당 게시글의 댓글 수 업데이트
              setPosts(prev => prev.map(post => {
                if (post.id === postId) {
                  return {
                    ...post,
                    commentCount: (post.commentCount || 0) + (change.type === "added" ? 1 : -1)
                  };
                }
                return post;
              }));
            }
          });
        }
      );
      
      return () => {
        unsubscribeFromPosts();
        unsubscribeFromComments();
      };
    }
  }, [sortBy, categoryFilter, showMine, search]);

  // 검색이나 필터 변경 시 데이터 다시 로드
  useEffect(() => {
    loadPosts(true);
  }, [search, categoryFilter, showMine, sortBy]);

  // 무한 스크롤
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadPosts();
        }
      },
      { threshold: 0.1 }
    );
    
    if (observerRef.current) {
      observer.observe(observerRef.current);
    }
    
    return () => observer.disconnect();
  }, [lastVisible, hasMore, loading]);

  // 검색 처리
  const handleSearch = (searchTerm) => {
    setSearch(searchTerm);
  };

  // 필터 및 정렬 재설정 시 게시글 다시 로드
  const resetAndLoad = () => {
    setLastVisible(null);
    loadPosts(true);
  };

  // 필터링 및 검색 로직
  const filtered = search ? posts.filter(p =>
    (p.title?.toLowerCase() + p.content?.toLowerCase()).includes(search.toLowerCase()) &&
    (!p.isPrivate || p.nickname === me)
  ) : posts.filter(p => !p.isPrivate || p.nickname === me);

  // 게시글 날짜 포맷팅
  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    
    try {
      const date = new Date(timestamp.seconds * 1000);
      const now = new Date();
      const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
      const diffMinutes = Math.floor((now - date) / (1000 * 60));
      
      if (diffMinutes < 1) {
        return "방금 전";
      } else if (diffHours < 1) {
        return `${diffMinutes}분 전`;
      } else if (diffHours < 24) {
        return `${diffHours}시간 전`;
      } else if (diffDays === 0) {
        return "오늘";
      } else if (diffDays === 1) {
        return "어제";
      } else if (diffDays < 7) {
        return `${diffDays}일 전`;
      } else {
        return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
      }
    } catch (error) {
      console.error("날짜 포맷팅 오류:", error);
      return "";
    }
  };

  // 카테고리별 색상 및 스타일
  const getCategoryStyle = (category) => {
    const categories = {
      "ballad": { color: "#9c27b0", text: "🎵 발라드" },
      "dance": { color: "#2196f3", text: "🕺 댄스" },
      "hiphop": { color: "#ff9800", text: "🎤 힙합" },
      "rock": { color: "#f44336", text: "🤘 락" },
      "pop": { color: "#9c27b0", text: "🌟 팝" },
      "ost": { color: "#4caf50", text: "🎬 OST" },
      "indie": { color: "#795548", text: "🎸 인디" },
      "classic": { color: "#607d8b", text: "🎻 클래식" },
      "trot": { color: "#ff5722", text: "🎶 트로트" }
    };
    
    return categories[category] || { color: "#9e9e9e", text: "🎵 기타" };
  };

  // 스타일 정의
  const currentCardStyle = darkMode ? darkCardStyle : cardStyle;
  
  const postCardStyle = {
    ...currentCardStyle,
    margin: "16px 0",
    position: "relative",
    transition: "transform 0.2s, box-shadow 0.2s",
    cursor: "pointer",
    "&:hover": {
      transform: "translateY(-2px)",
      boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)"
    }
  };
  
  const filterBarStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 10,
    flexWrap: "wrap",
    gap: 10
  };
  
  const filterButtonStyle = {
    padding: "8px 12px",
    border: "none",
    borderRadius: 20,
    background: darkMode ? "#444" : "#f0f0f0",
    color: darkMode ? "#ddd" : "#333",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 14
  };
  
  const sortButtonStyle = (active) => ({
    padding: "8px 12px",
    border: "none",
    borderRadius: 20,
    background: active 
      ? (darkMode ? "#9c68e6" : "#7e57c2") 
      : (darkMode ? "#333" : "#f0f0f0"),
    color: active 
      ? "#fff" 
      : (darkMode ? "#ddd" : "#333"),
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? "bold" : "normal"
  });
  
  const filterDropdownStyle = {
    display: isFilterOpen ? "block" : "none",
    position: "absolute",
    background: darkMode ? "#333" : "#fff",
    border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
    borderRadius: 8,
    padding: 10,
    zIndex: 10,
    marginTop: 5,
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
    width: 200
  };
  
  const filterOptionStyle = (active) => ({
    padding: "8px 12px",
    cursor: "pointer",
    borderRadius: 4,
    background: active 
      ? (darkMode ? "#555" : "#f3e7ff") 
      : "transparent",
    color: active 
      ? (darkMode ? "#fff" : "#7e57c2") 
      : (darkMode ? "#ddd" : "#333"),
    marginBottom: 5,
    fontWeight: active ? "bold" : "normal",
    "&:hover": {
      background: darkMode ? "#444" : "#f9f4ff"
    }
  });
  
  const categoryBadgeStyle = (category) => {
    const categoryInfo = getCategoryStyle(category);
    
    return {
      display: "inline-block",
      padding: "3px 8px",
      borderRadius: 12,
      fontSize: 12,
      background: `${categoryInfo.color}22`,
      color: categoryInfo.color,
      fontWeight: "bold",
      marginRight: 8
    };
  };
  
  const emptyStateStyle = {
    textAlign: "center",
    padding: "40px 20px",
    background: darkMode ? "#333" : "#f5f0ff",
    borderRadius: 12,
    color: darkMode ? "#aaa" : "#666",
    margin: "20px 0"
  };
  
  const postLinkStyle = {
    textDecoration: "none",
    color: darkMode ? "#fff" : "#333",
    display: "block"
  };

  // Avatar 컴포넌트 기본 이미지 수정
  const getDefaultAvatar = (nickname) => {
    if (!nickname) return "/default-avatar.png";
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(nickname)}&background=random`;
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>🎵 노래 추천 게시판</h1>
      
      <SearchBar 
        darkMode={darkMode} 
        onSearch={handleSearch} 
        placeholder="제목이나 내용 검색..." 
      />
      
      <div style={filterBarStyle}>
        <div style={{ display: "flex", gap: 10 }}>
          <button 
            style={sortButtonStyle(sortBy === "recent")}
            onClick={() => {
              setSortBy("recent");
              resetAndLoad();
            }}
          >
            최신순
          </button>
          <button 
            style={sortButtonStyle(sortBy === "popular")}
            onClick={() => {
              setSortBy("popular");
              resetAndLoad();
            }}
          >
            인기순
          </button>
          
          <div style={{ position: "relative" }}>
            <button 
              style={filterButtonStyle}
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              {categoryFilter === "all" ? "전체 카테고리" : getCategoryStyle(categoryFilter).text} ▼
            </button>
            
            <div style={filterDropdownStyle}>
              <div 
                style={filterOptionStyle(categoryFilter === "all")}
                onClick={() => {
                  setCategoryFilter("all");
                  setIsFilterOpen(false);
                  resetAndLoad();
                }}
              >
                전체 카테고리
              </div>
              <div 
                style={filterOptionStyle(categoryFilter === "ballad")}
                onClick={() => {
                  setCategoryFilter("ballad");
                  setIsFilterOpen(false);
                  resetAndLoad();
                }}
              >
                🎵 발라드
              </div>
              <div 
                style={filterOptionStyle(categoryFilter === "dance")}
                onClick={() => {
                  setCategoryFilter("dance");
                  setIsFilterOpen(false);
                  resetAndLoad();
                }}
              >
                🕺 댄스
              </div>
              <div 
                style={filterOptionStyle(categoryFilter === "hiphop")}
                onClick={() => {
                  setCategoryFilter("hiphop");
                  setIsFilterOpen(false);
                  resetAndLoad();
                }}
              >
                🎤 힙합
              </div>
              <div 
                style={filterOptionStyle(categoryFilter === "rock")}
                onClick={() => {
                  setCategoryFilter("rock");
                  setIsFilterOpen(false);
                  resetAndLoad();
                }}
              >
                🤘 락
              </div>
              <div 
                style={filterOptionStyle(categoryFilter === "pop")}
                onClick={() => {
                  setCategoryFilter("pop");
                  setIsFilterOpen(false);
                  resetAndLoad();
                }}
              >
                🌟 팝
              </div>
              <div 
                style={filterOptionStyle(categoryFilter === "ost")}
                onClick={() => {
                  setCategoryFilter("ost");
                  setIsFilterOpen(false);
                  resetAndLoad();
                }}
              >
                🎬 OST
              </div>
              <div 
                style={filterOptionStyle(categoryFilter === "indie")}
                onClick={() => {
                  setCategoryFilter("indie");
                  setIsFilterOpen(false);
                  resetAndLoad();
                }}
              >
                🎸 인디
              </div>
              <div 
                style={filterOptionStyle(categoryFilter === "trot")}
                onClick={() => {
                  setCategoryFilter("trot");
                  setIsFilterOpen(false);
                  resetAndLoad();
                }}
              >
                🎶 트로트
              </div>
            </div>
          </div>
          
          <button 
            style={{
              ...filterButtonStyle,
              background: showMine 
                ? (darkMode ? "#9c68e6" : "#7e57c2")
                : (darkMode ? "#333" : "#f0f0f0"),
              color: showMine ? "#fff" : (darkMode ? "#ddd" : "#333")
            }}
            onClick={() => {
              setShowMine(!showMine);
              resetAndLoad();
            }}
          >
            {showMine ? "✓ 내 글만 보기" : "☐ 내 글만 보기"}
          </button>
        </div>
        
        <button 
          onClick={() => nav("/write/song")} 
          style={{...purpleBtn, width: "auto", padding: "8px 16px"}}
        >
          ✏️ 글쓰기
        </button>
      </div>
      
      <div style={{ marginTop: 20 }}>
        {filtered.length === 0 ? (
          <div style={emptyStateStyle}>
            <p>등록된 게시글이 없습니다.</p>
            {search && <p>다른 검색어로 시도하거나 필터를 초기화해 보세요.</p>}
            {(!search && (categoryFilter !== "all" || showMine)) && (
              <button 
                onClick={() => {
                  setCategoryFilter("all");
                  setShowMine(false);
                  resetAndLoad();
                }}
                style={{
                  padding: "8px 16px",
                  background: darkMode ? "#444" : "#e0e0e0",
                  color: darkMode ? "#ddd" : "#333",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  marginTop: 10
                }}
              >
                필터 초기화
              </button>
            )}
          </div>
        ) : (
          filtered.map(p => (
            <div 
              key={p.id} 
              style={postCardStyle}
              onClick={() => nav(`/post/song/${p.id}`)}
            >
              <Link to={`/post/song/${p.id}`} style={postLinkStyle}>
                <h3 style={{ margin: "0 0 10px" }}>
                  {p.isPrivate && (
                    <span style={{
                      background: "#ff9800",
                      color: "#fff",
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontSize: 12,
                      marginRight: 8
                    }}>
                      🔒 비공개
                    </span>
                  )}
                  {p.title}
                </h3>
                
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  marginBottom: 10,
                  color: darkMode ? "#bbb" : "#666",
                  flexWrap: "wrap"
                }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10
                  }}>
                    <Avatar 
                      src={globalProfilePics[p.nickname] || getDefaultAvatar(p.nickname)}
                      size={24}
                      alt={p.nickname || "알 수 없음"}
                    />
                    <Link 
                      to={`/userpage/${p.nickname || "알 수 없음"}`} 
                      style={{ 
                        textDecoration: "none", 
                        color: darkMode ? "#ccc" : "#666",
                        fontWeight: "bold",
                        display: "flex",
                        alignItems: "center",
                        gap: 4
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {p.nickname || "알 수 없음"} 
                      {p.nickname && globalGrades[p.nickname] && (
                        <span style={{ fontSize: 16 }}>
                          {gradeEmojis[globalGrades[p.nickname]]}
                        </span>
                      )}
                    </Link>
                    <span>{formatDate(p.createdAt)}</span>
                  </div>
                  
                  {p.category && (
                    <span style={categoryBadgeStyle(p.category)}>
                      {getCategoryStyle(p.category).text}
                    </span>
                  )}
                </div>
                
                {/* 게시글 내용 미리보기 */}
                {!p.isPrivate && (
                  <p style={{
                    fontSize: 14,
                    margin: "10px 0",
                    color: darkMode ? "#ddd" : "#333",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical"
                  }}>
                    {p.content}
                  </p>
                )}
                
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 10,
                  borderTop: `1px solid ${darkMode ? "#444" : "#eee"}`,
                  paddingTop: 10
                }}>
                  <div style={{
                    display: "flex",
                    gap: 15,
                    fontSize: 13,
                    color: darkMode ? "#aaa" : "#777"
                  }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      ❤️ {p.likes || 0}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      💬 {p.commentCount || 0}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      👁️ {p.viewCount || 0}
                    </span>
                  </div>
                  
                  {p.artists && p.artists.length > 0 && (
                    <div style={{
                      fontSize: 13,
                      color: darkMode ? "#bb86fc" : "#7e57c2",
                      fontStyle: "italic"
                    }}>
                      {p.artists.join(", ")}
                    </div>
                  )}
                </div>
              </Link>
            </div>
          ))
        )}
        
        {/* 로딩 인디케이터 및 무한 스크롤 감지 영역 */}
        {hasMore && (
          <div 
            ref={observerRef}
            style={{ 
              height: 30, 
              display: "flex", 
              justifyContent: "center", 
              alignItems: "center",
              marginTop: 20,
              marginBottom: 10
            }}
          >
            {loading && <p>게시글을 불러오는 중...</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// Props 검증 추가
SongPostList.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object.isRequired,
  globalGrades: PropTypes.object.isRequired
};

// 기본값 설정
SongPostList.defaultProps = {
  darkMode: false
};

export default SongPostList;
