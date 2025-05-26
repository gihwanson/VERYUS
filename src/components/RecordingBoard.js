import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, onSnapshot, getDocs, limit, startAfter, where, updateDoc, doc, deleteDoc
} from "firebase/firestore";
import { db } from "../firebase";
import SearchBar from "./SearchBar";
import Avatar from "./Avatar";
import {
  containerStyle,
  darkContainerStyle,
  titleStyle,
  purpleBtn,
  smallBtn
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

function RecordingBoard({ darkMode, globalProfilePics, globalGrades }) {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [cCnt, setCCnt] = useState({});
  const [sortType, setSortType] = useState("newest"); // newest, popular, comments
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastVisible, setLastVisible] = useState(null);
  const me = localStorage.getItem("nickname");
  const nav = useNavigate();

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

  // 초기 게시글 가져오기 (mypage_recordings 컬렉션에서)
  useEffect(() => {
    if (!me) return;
    
    setLoading(true);
    
    const q = query(
      collection(db, "recordings"),
      orderBy("createdAt", "desc"),
      limit(15)
    );
    
    const unsubscribe = onSnapshot(q, s => {
      if (s.docs.length > 0) {
        const allPosts = s.docs.map(d => ({ id: d.id, ...d.data() }));
        // 삭제된 게시글 필터링 (클라이언트 사이드)
        const filteredPosts = allPosts.filter(post => !post.deleted);
        setPosts(filteredPosts);
        setLastVisible(s.docs[s.docs.length - 1]);
        setHasMore(s.docs.length === 15);
        setLoading(false);
        
        // 댓글 수 가져오기
        const postIds = filteredPosts.map(p => p.id);
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
        const commentSnap = await getDocs(collection(db, `recording-comments-${postId}`));
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
        collection(db, "recordings"),
        orderBy("createdAt", "desc"),
        startAfter(lastVisible),
        limit(10)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.docs.length > 0) {
        const allNewPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // 삭제된 게시글 필터링
        const newPosts = allNewPosts.filter(post => !post.deleted);
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
    const searchContent = (p.title || '') + (p.description || p.content || '');
    return searchContent.includes(search) && (!p.isPrivate || p.uploaderNickname === me);
  });
  
  // 정렬 기준에 따라 정렬 (공지사항이 항상 최상위)
  const sortedPosts = [...filtered].sort((a, b) => {
    // 먼저 공지사항 여부로 정렬 (공지사항이 위에)
    if (a.isNotice && !b.isNotice) return -1;
    if (!a.isNotice && b.isNotice) return 1;
    
    // 둘 다 공지사항이면 noticeOrder로 정렬 (최신 공지사항이 위에)
    if (a.isNotice && b.isNotice) {
      return (b.noticeOrder || 0) - (a.noticeOrder || 0);
    }
    
    // 일반 게시글 정렬
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
    
    if (diffInSeconds < 60) return '방금 전';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}일 전`;
    if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)}개월 전`;
    return `${Math.floor(diffInSeconds / 31536000)}년 전`;
  };

  // 조회수 증가 함수
  const incrementViewCount = async (postId) => {
    try {
      const postRef = doc(db, "recordings", postId);
      const currentPost = posts.find(p => p.id === postId);
      if (currentPost) {
        await updateDoc(postRef, {
          viewCount: (currentPost.viewCount || 0) + 1
        });
      }
    } catch (error) {
      console.error("조회수 업데이트 오류:", error);
    }
  };

  // 녹음 게시글 삭제 함수
  const deleteRecording = async (postId, uploaderNickname, event) => {
    event.preventDefault();
    event.stopPropagation();

    if (me !== uploaderNickname) {
      alert('본인이 작성한 게시글만 삭제할 수 있습니다.');
      return;
    }

    if (!window.confirm('이 녹음 게시글을 정말로 삭제하시겠습니까?\n삭제된 게시글과 모든 댓글은 복구할 수 없습니다.')) return;

    try {
      // 1. 모든 댓글 삭제
      const commentsSnapshot = await getDocs(collection(db, `recording-comments-${postId}`));
      const deleteCommentPromises = commentsSnapshot.docs.map(commentDoc => 
        deleteDoc(doc(db, `recording-comments-${postId}`, commentDoc.id))
      );
      await Promise.all(deleteCommentPromises);

      // 2. 녹음 게시글 삭제
      await deleteDoc(doc(db, "recordings", postId));

      alert('녹음 게시글이 삭제되었습니다.');
    } catch (error) {
      console.error("녹음 게시글 삭제 오류:", error);
      alert('녹음 게시글 삭제 중 오류가 발생했습니다.');
    }
  };

  // 스타일 정의
  const pageContainer = {
    ...(!darkMode ? containerStyle : darkContainerStyle),
    maxWidth: "1200px",
    margin: "0 auto",
    padding: isMobile ? "15px" : "20px"
  };

  const headerStyle = {
    marginBottom: "30px",
    textAlign: "center"
  };

  const headerTitleStyle = {
    ...titleStyle,
    background: darkMode 
      ? "linear-gradient(135deg, #bb86fc 0%, #7e57c2 100%)"
      : "linear-gradient(135deg, #7e57c2 0%, #5e35b1 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    fontSize: isMobile ? "24px" : "32px",
    fontWeight: "bold",
    margin: "0"
  };

  const tabContainerStyle = {
    display: "flex",
    gap: "8px",
    marginBottom: "20px",
    overflowX: "auto",
    paddingBottom: "5px"
  };

  const hideScrollbarStyle = {
    msOverflowStyle: "none",
    scrollbarWidth: "none",
    "&::-webkit-scrollbar": {
      display: "none"
    }
  };

  const sortTabContainerStyle = {
    display: "flex",
    gap: "8px",
    marginBottom: "25px",
    overflowX: "auto",
    paddingBottom: "5px"
  };

  const tabStyle = {
    padding: isMobile ? "8px 12px" : "10px 16px",
    backgroundColor: darkMode ? "#444" : "#f0f0f0",
    color: darkMode ? "#ccc" : "#666",
    border: "none",
    borderRadius: "20px",
    cursor: "pointer",
    fontSize: isMobile ? "13px" : "14px",
    fontWeight: "500",
    transition: "all 0.3s ease",
    whiteSpace: "nowrap",
    flexShrink: 0
  };

  const activeTabStyle = {
    ...tabStyle,
    backgroundColor: darkMode ? "#7e57c2" : "#7e57c2",
    color: "white",
    fontWeight: "bold"
  };

  const sortTabStyle = {
    padding: isMobile ? "6px 10px" : "8px 14px",
    backgroundColor: darkMode ? "#333" : "#e8e8e8",
    color: darkMode ? "#bbb" : "#555",
    border: "none",
    borderRadius: "15px",
    cursor: "pointer",
    fontSize: isMobile ? "12px" : "13px",
    fontWeight: "500",
    transition: "all 0.3s ease",
    whiteSpace: "nowrap",
    flexShrink: 0
  };

  const activeSortTabStyle = {
    ...sortTabStyle,
    backgroundColor: darkMode ? "#5e35b1" : "#5e35b1",
    color: "white",
    fontWeight: "bold"
  };

  const postCardStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "12px",
    padding: isMobile ? "16px" : "20px",
    marginBottom: "16px",
    boxShadow: darkMode 
      ? "0 4px 15px rgba(0, 0, 0, 0.3)" 
      : "0 4px 15px rgba(0, 0, 0, 0.1)",
    border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`,
    transition: "all 0.3s ease",
    "&:hover": {
      transform: "translateY(-2px)",
      boxShadow: darkMode 
        ? "0 8px 25px rgba(0, 0, 0, 0.4)" 
        : "0 8px 25px rgba(0, 0, 0, 0.15)"
    }
  };

  const noPostsStyle = {
    textAlign: "center",
    padding: "60px 20px",
    color: darkMode ? "#888" : "#666"
  };

  const loadingStyle = {
    textAlign: "center",
    padding: "40px",
    color: darkMode ? "#888" : "#666"
  };

  if (loading) {
    return (
      <div style={pageContainer}>
        <div style={loadingStyle}>
          <div style={{
            width: "40px",
            height: "40px",
            border: `4px solid ${darkMode ? "#444" : "#f3f3f3"}`,
            borderTop: `4px solid ${darkMode ? "#bb86fc" : "#7e57c2"}`,
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 20px"
          }}></div>
          <p>녹음 게시판을 불러오는 중...</p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={pageContainer}>
      <div style={headerStyle}>
        <h1 style={headerTitleStyle}>🎤 녹음 게시판</h1>
      </div>
      
      <SearchBar darkMode={darkMode} onSearch={setSearch} isMobile={isMobile} />
      
      <div style={{ ...sortTabContainerStyle, ...hideScrollbarStyle }}>
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
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <Link 
            to="/upload-recording"
            style={{
              ...purpleBtn,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 20px"
            }}
          >
            🎤 녹음 올리기
          </Link>
        </div>
      )}

      {/* 게시글 목록 */}
      {sortedPosts.length === 0 ? (
        <div style={noPostsStyle}>
          <div style={{ fontSize: "64px", marginBottom: "20px" }}>🎤</div>
          <h3 style={{ margin: "0 0 10px 0", color: darkMode ? "#ccc" : "#555" }}>
            {search ? "검색 결과가 없습니다" : "첫 번째 녹음을 공유해보세요!"}
          </h3>
          <p style={{ fontSize: "14px", marginBottom: "20px" }}>
            {search ? "다른 검색어로 시도해보세요" : "여러분의 아름다운 목소리를 다른 사용자들과 나누어보세요"}
          </p>
          {!search && (
            <Link 
              to="/upload-recording"
              style={{
                ...purpleBtn,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              🎤 첫 녹음 올리기
            </Link>
          )}
        </div>
      ) : (
        <div>
          {sortedPosts.map((post) => (
            <div key={post.id} style={postCardStyle}>
              <div style={{ marginBottom: "15px" }}>
                {/* 카테고리 뱃지 */}
                <div style={{ marginBottom: "10px" }}>
                  {post.category === 'feedback' && (
                    <span style={{
                      backgroundColor: darkMode ? "#4caf50" : "#e8f5e9",
                      color: darkMode ? "#fff" : "#2e7d32",
                      padding: "4px 10px",
                      borderRadius: "15px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}>
                      🎯 피드백 가능
                    </span>
                  )}
                  {post.category === 'work' && (
                    <span style={{
                      backgroundColor: darkMode ? "#ff9800" : "#fff3e0",
                      color: darkMode ? "#fff" : "#e65100",
                      padding: "4px 10px",
                      borderRadius: "15px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}>
                      🎨 작업물
                    </span>
                  )}
                  {post.category === 'confidence' && (
                    <span style={{
                      backgroundColor: darkMode ? "#e91e63" : "#fce4ec",
                      color: darkMode ? "#fff" : "#c2185b",
                      padding: "4px 10px",
                      borderRadius: "15px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}>
                      💝 칭찬해주세요
                    </span>
                  )}
                </div>

                {/* 게시글 내용 */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start"
                }}>
                  <div style={{ flex: 1 }}>
                    <Link
                      to={`/post/recording/${post.id}`}
                      style={{
                        textDecoration: "none",
                        color: "inherit"
                      }}
                    >
                      <h3 style={{
                        margin: "0 0 8px 0",
                        fontSize: isMobile ? "16px" : "18px",
                        color: darkMode ? "#fff" : "#333",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical"
                      }}>
                        {post.title}
                      </h3>
                    </Link>

                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px"
                    }}>
                      <span style={{
                        fontWeight: "bold",
                        color: darkMode ? "#e0e0e0" : "#333",
                        fontSize: isMobile ? "14px" : "15px"
                      }}>
                        {post.uploaderNickname}
                      </span>
                      {globalGrades[post.uploaderNickname] && (
                        <span style={{
                          fontSize: isMobile ? "12px" : "13px",
                          color: darkMode ? "#bb86fc" : "#7e57c2"
                        }}>
                          {gradeEmojis[globalGrades[post.uploaderNickname]]} {globalGrades[post.uploaderNickname]}
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: isMobile ? "11px" : "12px",
                      color: darkMode ? "#aaa" : "#666"
                    }}>
                      {getRelativeTime(post.createdAt)}
                    </div>
                  </div>
                </div>
              </div>

              <Link 
                to={`/recording-comments/${post.id}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "block"
                }}
                onClick={() => incrementViewCount(post.id)}
              >
                {(post.description || post.content) && (
                  <p style={{
                    margin: "0 0 15px 0",
                    color: darkMode ? "#ccc" : "#666",
                    fontSize: isMobile ? "13px" : "14px",
                    lineHeight: "1.5",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical"
                  }}>
                    {post.description || post.content}
                  </p>
                )}
              </Link>

              {/* 녹음 파일 표시 및 플레이어 */}
              {(post.recordingURL || post.downloadURL) && (
                <div style={{
                  backgroundColor: darkMode ? "#333" : "#f8f4ff",
                  padding: "15px",
                  borderRadius: "12px",
                  marginBottom: "15px",
                  border: `2px solid ${darkMode ? "#7e57c2" : "#e8dbff"}`
                }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: darkMode ? "#bb86fc" : "#7e57c2",
                    fontSize: "14px",
                    fontWeight: "bold",
                    marginBottom: "12px"
                  }}>
                    🎵 녹음 파일
                  </div>
                  
                  {/* 오디오 플레이어 */}
                  <audio 
                    controls 
                    style={{ 
                      width: "100%",
                      outline: "none",
                      marginBottom: "10px"
                    }}
                    preload="metadata"
                  >
                    <source src={post.recordingURL || post.downloadURL} type="audio/mpeg" />
                    <source src={post.recordingURL || post.downloadURL} type="audio/wav" />
                    <source src={post.recordingURL || post.downloadURL} type="audio/ogg" />
                    브라우저가 오디오 재생을 지원하지 않습니다.
                  </audio>
                  
                  {/* 파일 정보 */}
                  <div style={{
                    display: "flex",
                    gap: "15px",
                    fontSize: "12px",
                    color: darkMode ? "#aaa" : "#888",
                    flexWrap: "wrap"
                  }}>
                    {post.fileName && <span>📁 {post.fileName}</span>}
                    {post.fileSize && <span>📏 {(post.fileSize / (1024 * 1024)).toFixed(2)} MB</span>}
                  </div>
                </div>
              )}

              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "15px",
                borderTop: `1px solid ${darkMode ? "#444" : "#eee"}`
              }}>
                <div style={{
                  display: "flex",
                  gap: "15px",
                  fontSize: isMobile ? "12px" : "13px",
                  color: darkMode ? "#aaa" : "#666"
                }}>
                  <span>👁️ {post.viewCount || 0}</span>
                  <span>❤️ {post.likes || 0}</span>
                  <span>💬 {cCnt[post.id] || 0}</span>
                </div>
                
                {/* 작성자만 삭제 버튼 표시 */}
                {me === post.uploaderNickname && (
                  <button
                    onClick={(e) => deleteRecording(post.id, post.uploaderNickname, e)}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#dc3545",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: isMobile ? "11px" : "12px",
                      fontWeight: "bold",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    🗑️ 삭제
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* 로딩 더보기 */}
          {loadingMore && (
            <div style={loadingStyle}>
              <div style={{
                width: "30px",
                height: "30px",
                border: `3px solid ${darkMode ? "#444" : "#f3f3f3"}`,
                borderTop: `3px solid ${darkMode ? "#bb86fc" : "#7e57c2"}`,
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 10px"
              }}></div>
              <p>더 많은 게시글을 불러오는 중...</p>
            </div>
          )}

          {/* 더 이상 불러올 게시글이 없을 때 */}
          {!hasMore && sortedPosts.length > 0 && (
            <div style={{
              textAlign: "center",
              padding: "30px",
              color: darkMode ? "#666" : "#999",
              fontSize: "14px"
            }}>
              모든 게시글을 확인했습니다 🎉
            </div>
          )}
        </div>
      )}

      {/* 모바일에서 플로팅 글쓰기 버튼 */}
      {isMobile && (
        <Link 
          to="/upload-recording"
          style={{
            position: "fixed",
            bottom: "30px",
            right: "20px",
            width: "56px",
            height: "56px",
            backgroundColor: darkMode ? "#7e57c2" : "#7e57c2",
            color: "white",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            fontSize: "24px",
            boxShadow: "0 4px 15px rgba(126, 87, 194, 0.4)",
            zIndex: 1000,
            transition: "all 0.3s ease"
          }}
        >
          🎤
        </Link>
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

RecordingBoard.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object,
  globalGrades: PropTypes.object
};

RecordingBoard.defaultProps = {
  darkMode: false,
  globalProfilePics: {},
  globalGrades: {}
};

export default RecordingBoard; 