import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, onSnapshot, getDocs, limit, startAfter
} from "firebase/firestore";
import { db } from "../firebase";
import SearchBar from "./SearchBar";
import Avatar from "./Avatar";
import {
  containerStyle,
  darkContainerStyle,
  titleStyle,
  purpleBtn
} from "./style";

// gradeEmojis 배열 추가
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
  "맥주": "🍺",
  "번개": "⚡",
  "달": "🌙",
  "별": "⭐"
};

function SpecialMoments({ darkMode, globalProfilePics, globalGrades, showOnlyPreview = false }) {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [cCnt, setCCnt] = useState({});
  const [sortType, setSortType] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastVisible, setLastVisible] = useState(null);
  const me = localStorage.getItem("nickname");
  const role = localStorage.getItem("role");
  const nav = useNavigate();

  // 권한 확인
  const canWrite = role === "리더" || role === "운영진";

  // 미디어 쿼리 체크 - 모바일 여부 확인
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // 화면 크기 변경 감지
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 초기 게시글 가져오기
  useEffect(() => {
    if (!me) return;
    
    setLoading(true);
    
    const q = query(
      collection(db, "special_moments"),
      orderBy("createdAt", "desc"),
      limit(showOnlyPreview ? 3 : 15)
    );
    
    const unsubscribe = onSnapshot(q, s => {
      if (s.docs.length > 0) {
        const arr = s.docs.map(d => ({ id: d.id, ...d.data() }));
        setPosts(arr);
        setLastVisible(s.docs[s.docs.length - 1]);
        setHasMore(s.docs.length === 15);
        setLoading(false);
        
        // 댓글 수 가져오기
        const postIds = arr.map(p => p.id);
        fetchCommentCounts(postIds);
      } else {
        setPosts([]);
        setHasMore(false);
        setLoading(false);
      }
    });
    
    return unsubscribe;
  }, [me]);

  // 댓글 수 가져오기 함수
  const fetchCommentCounts = async (postIds) => {
    const commentCounts = {};
    
    for (const postId of postIds) {
      if (!(postId in cCnt)) {
        const commentSnap = await getDocs(collection(db, `special-moment-${postId}-comments`));
        commentCounts[postId] = commentSnap.size;
      }
    }
    
    if (Object.keys(commentCounts).length > 0) {
      setCCnt(prevCounts => ({ ...prevCounts, ...commentCounts }));
    }
  };

  // 더 많은 게시글 로드
  const loadMorePosts = useCallback(async () => {
    if (!hasMore || loadingMore || !lastVisible) return;
    
    setLoadingMore(true);
    
    try {
      const q = query(
        collection(db, "special_moments"),
        orderBy("createdAt", "desc"),
        startAfter(lastVisible),
        limit(10)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.docs.length > 0) {
        const newPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setPosts(prevPosts => [...prevPosts, ...newPosts]);
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === 10);
        
        // 새 게시글들의 댓글 수 가져오기
        const newPostIds = newPosts.map(p => p.id);
        await fetchCommentCounts(newPostIds);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("추가 게시글 로드 오류:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, lastVisible, cCnt]);

  // 스크롤 이벤트 처리
  useEffect(() => {
    const handleScroll = () => {
      if (
        hasMore && 
        !loadingMore && 
        window.innerHeight + document.documentElement.scrollTop >= 
        document.documentElement.scrollHeight - 300
      ) {
        loadMorePosts();
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMorePosts, hasMore, loadingMore]);

  // 검색어로 필터링 및 정렬
  const filtered = posts.filter(p => {
    return (p.title + p.content).includes(search) && (!p.isPrivate || p.nickname === me);
  });
  
  // 정렬 기준에 따라 정렬
  const sortedPosts = [...filtered].sort((a, b) => {
    if (sortType === "newest") {
      return b.createdAt.seconds - a.createdAt.seconds;
    } else if (sortType === "popular") {
      return (b.likes || 0) - (a.likes || 0);
    } else if (sortType === "comments") {
      return (cCnt[b.id] || 0) - (cCnt[a.id] || 0);
    }
    return 0;
  });

  // 상대 시간 표시 함수
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    
    const now = new Date();
    const postTime = new Date(timestamp.seconds * 1000);
    const diffInSeconds = Math.floor((now - postTime) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds}초 전`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}일 전`;
    
    return postTime.toLocaleDateString();
  };

  // 스타일 정의
  const pageContainer = {
    backgroundColor: darkMode ? "#1a1a1a" : "#f9f4ff",
    minHeight: "100vh",
    padding: isMobile ? "10px" : "15px",
    color: "#333"
  };
  
  const headerStyle = {
    background: "linear-gradient(135deg, #ff6b6b 0%, #feca57 50%, #48dbfb 100%)",
    color: "white",
    padding: isMobile ? "20px 15px" : "25px 20px",
    borderRadius: "15px",
    marginBottom: "20px",
    textAlign: "center",
    fontWeight: "bold",
    boxShadow: "0 8px 25px rgba(255, 107, 107, 0.3)",
    position: "relative",
    overflow: "hidden"
  };
  
  const headerTitleStyle = {
    margin: 0,
    fontSize: isMobile ? "1.5rem" : "1.8rem",
    textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
    position: "relative",
    zIndex: 1
  };
  
  const sparkleStyle = {
    position: "absolute",
    fontSize: "20px",
    opacity: 0.7,
    animation: "sparkle 2s infinite ease-in-out"
  };

  const sortTabContainerStyle = {
    display: "flex",
    gap: "8px",
    marginBottom: "25px",
    overflowX: "auto",
    paddingBottom: "5px"
  };

  const sortTabStyle = {
    padding: isMobile ? "8px 12px" : "10px 16px",
    backgroundColor: darkMode ? "#333" : "#e8e8e8",
    color: darkMode ? "#bbb" : "#555",
    border: "none",
    borderRadius: "20px",
    cursor: "pointer",
    fontSize: isMobile ? "13px" : "14px",
    fontWeight: "500",
    transition: "all 0.3s ease",
    whiteSpace: "nowrap",
    flexShrink: 0
  };

  const activeSortTabStyle = {
    ...sortTabStyle,
    background: "linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)",
    color: "white",
    fontWeight: "bold",
    boxShadow: "0 4px 12px rgba(255, 107, 107, 0.3)"
  };

  const postCardStyle = {
    background: darkMode 
      ? "linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)"
      : "linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%)",
    borderRadius: "15px",
    padding: isMobile ? "16px" : "20px",
    marginBottom: "20px",
    boxShadow: darkMode 
      ? "0 8px 25px rgba(0, 0, 0, 0.4)" 
      : "0 8px 25px rgba(255, 107, 107, 0.1)",
    border: `2px solid ${darkMode ? "#444" : "#ffe6e6"}`,
    transition: "all 0.3s ease",
    position: "relative",
    overflow: "hidden"
  };

  const writeButtonStyle = {
    background: canWrite 
      ? "linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)"
      : "linear-gradient(135deg, #ccc 0%, #999 100%)",
    color: "white",
    border: "none",
    padding: isMobile ? "14px 0" : "12px 0",
    width: "100%",
    borderRadius: "12px",
    fontSize: isMobile ? "18px" : "16px",
    cursor: canWrite ? "pointer" : "not-allowed",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    boxShadow: canWrite ? "0 6px 20px rgba(255, 107, 107, 0.3)" : "none",
    marginBottom: "20px"
  };

  if (loading) {
    return (
      <div style={pageContainer}>
        <div style={{ textAlign: "center", padding: "40px" }}>
          <div style={{
            width: "50px",
            height: "50px",
            border: "4px solid rgba(255, 107, 107, 0.3)",
            borderTop: "4px solid #ff6b6b",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 20px"
          }}></div>
          <p style={{ color: darkMode ? "#ccc" : "#666" }}>특별한 순간들을 불러오는 중...</p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes sparkle {
              0%, 100% { opacity: 0.7; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.2); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  // 미리보기 모드일 때 간소화된 렌더링
  if (showOnlyPreview) {
    return (
      <div style={{
        backgroundColor: darkMode ? "#1a1a1a" : "#fff3e0",
        padding: isMobile ? "15px" : "20px",
        marginBottom: "20px",
        borderRadius: "15px",
        border: `2px solid ${darkMode ? "#ff6d00" : "#ffcc80"}`,
        boxShadow: darkMode 
          ? "0 8px 25px rgba(255, 109, 0, 0.3)" 
          : "0 8px 25px rgba(255, 152, 0, 0.2)"
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "15px"
        }}>
          <h2 style={{
            margin: 0,
            color: darkMode ? "#ff9800" : "#e65100",
            fontSize: isMobile ? "18px" : "22px",
            fontWeight: "bold"
          }}>
            ✨ 베리어스의 특별한 순간들
          </h2>
          <Link 
            to="/special-moments"
            style={{
              fontSize: "14px",
              color: darkMode ? "#ff9800" : "#e65100",
              textDecoration: "none",
              fontWeight: "bold"
            }}
          >
            더보기 →
          </Link>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "30px" }}>
            <div style={{
              width: "30px",
              height: "30px",
              border: "3px solid rgba(255, 109, 0, 0.3)",
              borderTop: "3px solid #ff6d00",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 15px"
            }}></div>
            <p style={{ color: darkMode ? "#ccc" : "#666", margin: 0 }}>특별한 순간들을 불러오는 중...</p>
          </div>
        ) : sortedPosts.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "30px",
            color: darkMode ? "#aaa" : "#666"
          }}>
            <div style={{ fontSize: "48px", marginBottom: "10px" }}>📸</div>
            <p style={{ margin: 0 }}>아직 공유된 특별한 순간이 없습니다</p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "15px"
          }}>
            {sortedPosts.map((post, index) => (
              <Link
                key={post.id}
                to={`/post/special-moment/${post.id}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "block"
                }}
              >
                <div style={{
                  backgroundColor: darkMode ? "#2a2a2a" : "#ffffff",
                  borderRadius: "12px",
                  padding: "15px",
                  border: `1px solid ${darkMode ? "#444" : "#ffe0b2"}`,
                  transition: "all 0.3s ease",
                  position: "relative",
                  height: "200px",
                  overflow: "hidden"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = darkMode 
                    ? "0 6px 20px rgba(255, 109, 0, 0.4)" 
                    : "0 6px 20px rgba(255, 152, 0, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                >
                  {/* 배경 이미지/미디어 */}
                  {post.images && post.images.length > 0 && (
                    <div style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundImage: `url(${post.images[0]})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      opacity: 0.3,
                      borderRadius: "12px"
                    }} />
                  )}
                  
                  {/* 콘텐츠 */}
                  <div style={{
                    position: "relative",
                    zIndex: 1,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}>
                    <div>
                      <h3 style={{
                        margin: "0 0 8px 0",
                        fontSize: "16px",
                        fontWeight: "bold",
                        color: darkMode ? "#e0e0e0" : "#333",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {post.title}
                      </h3>
                      
                      {post.content && (
                        <p style={{
                          margin: "0 0 10px 0",
                          fontSize: "14px",
                          color: darkMode ? "#ccc" : "#666",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          lineHeight: "1.4"
                        }}>
                          {post.content}
                        </p>
                      )}
                    </div>
                    
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "12px",
                      color: darkMode ? "#aaa" : "#666"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Avatar src={globalProfilePics[post.nickname]} size={20} />
                        <span>{post.nickname}</span>
                      </div>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <span>❤️ {post.likes || 0}</span>
                        <span>💬 {cCnt[post.id] || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
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

  return (
    <div style={pageContainer}>
      <div style={headerStyle}>
        <div style={{...sparkleStyle, top: "10px", left: "20px", animationDelay: "0s"}}>✨</div>
        <div style={{...sparkleStyle, top: "15px", right: "30px", animationDelay: "0.5s"}}>⭐</div>
        <div style={{...sparkleStyle, bottom: "10px", left: "40px", animationDelay: "1s"}}>💫</div>
        <div style={{...sparkleStyle, bottom: "15px", right: "20px", animationDelay: "1.5s"}}>🌟</div>
        <h1 style={headerTitleStyle}>✨ 베리어스의 특별한 순간들 ✨</h1>
        <p style={{
          margin: "5px 0 0 0",
          fontSize: isMobile ? "14px" : "16px",
          opacity: 0.9
        }}>
          우리가 함께 만들어가는 소중한 추억들
        </p>
      </div>
      
      <SearchBar darkMode={darkMode} onSearch={setSearch} isMobile={isMobile} />
      
      <div style={sortTabContainerStyle}>
        <button 
          style={sortType === "newest" ? activeSortTabStyle : sortTabStyle}
          onClick={() => setSortType("newest")}
        >
          최신순
        </button>
        <button 
          style={sortType === "popular" ? activeSortTabStyle : sortTabStyle}
          onClick={() => setSortType("popular")}
        >
          인기순
        </button>
        <button 
          style={sortType === "comments" ? activeSortTabStyle : sortTabStyle}
          onClick={() => setSortType("comments")}
        >
          댓글순
        </button>
      </div>
      
      {/* 글쓰기 버튼 */}
      {!isMobile && (
        <button 
          style={writeButtonStyle} 
          onClick={() => canWrite ? nav("/write/special-moments") : alert("리더와 운영진만 글을 작성할 수 있습니다.")}
          disabled={!canWrite}
        >
          <span role="img" aria-label="sparkles" style={{ marginRight: "8px" }}>✨</span> 
          {canWrite ? "특별한 순간 공유하기" : "작성 권한이 없습니다"}
        </button>
      )}
      
      <div style={{ marginTop: 20 }}>
        {sortedPosts.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "60px 20px",
            color: darkMode ? "#888" : "#666"
          }}>
            <div style={{ fontSize: "64px", marginBottom: "20px" }}>📸</div>
            <h3 style={{ margin: "0 0 10px 0" }}>
              {search ? "검색 결과가 없습니다" : "아직 공유된 특별한 순간이 없습니다"}
            </h3>
            <p style={{ fontSize: "14px", marginBottom: "20px" }}>
              {search ? "다른 검색어로 시도해보세요" : "첫 번째 특별한 순간을 공유해보세요!"}
            </p>
          </div>
        ) : (
          sortedPosts.map(p => (
            <div key={p.id} style={postCardStyle}>
              <Link to={`/post/special-moment/${p.id}`} style={{ 
                textDecoration: "none", 
                color: "inherit",
                display: "block"
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "15px"
                }}>
                  <Avatar src={globalProfilePics[p.nickname]} size={isMobile ? 32 : 40} />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontWeight: "bold",
                      color: darkMode ? "#e0e0e0" : "#333",
                      fontSize: isMobile ? "15px" : "16px",
                      marginBottom: "4px"
                    }}>
                      {p.nickname} {p.nickname ? gradeEmojis[globalGrades[p.nickname]] : ""}
                    </div>
                    <div style={{
                      fontSize: isMobile ? "12px" : "13px",
                      color: darkMode ? "#aaa" : "#666"
                    }}>
                      {getRelativeTime(p.createdAt)}
                    </div>
                  </div>
                </div>

                <h3 style={{
                  margin: "0 0 12px 0",
                  fontSize: isMobile ? "18px" : "20px",
                  fontWeight: "bold",
                  color: darkMode ? "#e0e0e0" : "#333",
                  lineHeight: "1.4"
                }}>
                  {p.title}
                </h3>

                {p.content && (
                  <p style={{
                    margin: "0 0 15px 0",
                    color: darkMode ? "#ccc" : "#666",
                    fontSize: isMobile ? "14px" : "15px",
                    lineHeight: "1.6",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical"
                  }}>
                    {p.content}
                  </p>
                )}

                {/* 미디어 미리보기 */}
                {(p.images && p.images.length > 0) && (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: p.images.length === 1 ? "1fr" : "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "8px",
                    marginBottom: "15px"
                  }}>
                    {p.images.slice(0, 3).map((imageUrl, index) => (
                      <img
                        key={index}
                        src={imageUrl}
                        alt={`미리보기 ${index + 1}`}
                        style={{
                          width: "100%",
                          height: "120px",
                          objectFit: "cover",
                          borderRadius: "8px",
                          border: `2px solid ${darkMode ? "#555" : "#ffe6e6"}`
                        }}
                      />
                    ))}
                    {p.images.length > 3 && (
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: darkMode ? "#444" : "#f0f0f0",
                        borderRadius: "8px",
                        border: `2px solid ${darkMode ? "#555" : "#ffe6e6"}`,
                        fontSize: "14px",
                        color: darkMode ? "#ccc" : "#666"
                      }}>
                        +{p.images.length - 3}개 더
                      </div>
                    )}
                  </div>
                )}
              </Link>

              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "15px",
                borderTop: `2px dashed ${darkMode ? "#444" : "#ffe6e6"}`
              }}>
                <div style={{
                  display: "flex",
                  gap: "15px",
                  fontSize: isMobile ? "13px" : "14px",
                  color: darkMode ? "#aaa" : "#666"
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    ❤️ {p.likes || 0}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    💬 {cCnt[p.id] || 0}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}

        {/* 추가 로딩 중일 때 표시 */}
        {loadingMore && (
          <div style={{ 
            textAlign: "center", 
            padding: "20px",
            color: "#666"
          }}>
            <div style={{
              display: "inline-block",
              width: "30px",
              height: "30px",
              border: "3px solid rgba(255, 107, 107, 0.3)",
              borderTop: "3px solid #ff6b6b",
              borderRadius: "50%",
              animation: "spin 1s linear infinite"
            }}></div>
            <p style={{ margin: "10px 0 0 0" }}>더 많은 추억을 불러오는 중...</p>
          </div>
        )}

        {/* 더 불러올 게시글이 없을 때 표시 */}
        {!loading && !loadingMore && !hasMore && sortedPosts.length > 0 && (
          <div style={{ 
            textAlign: "center", 
            padding: "30px",
            color: darkMode ? "#666" : "#999",
            fontSize: "14px"
          }}>
            ✨ 모든 특별한 순간들을 확인했습니다 ✨
          </div>
        )}
      </div>

      {/* 모바일에서 플로팅 글쓰기 버튼 */}
      {isMobile && canWrite && (
        <button 
          style={{
            position: "fixed",
            bottom: "30px",
            right: "20px",
            width: "60px",
            height: "60px",
            background: "linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)",
            color: "white",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            fontSize: "24px",
            boxShadow: "0 6px 20px rgba(255, 107, 107, 0.4)",
            zIndex: 1000,
            border: "none",
            cursor: "pointer"
          }}
          onClick={() => nav("/write/special-moments")}
        >
          ✨
        </button>
      )}
      
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

SpecialMoments.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object,
  globalGrades: PropTypes.object,
  showOnlyPreview: PropTypes.bool
};

SpecialMoments.defaultProps = {
  darkMode: false,
  globalProfilePics: {},
  globalGrades: {},
  showOnlyPreview: false
};

export default SpecialMoments; 