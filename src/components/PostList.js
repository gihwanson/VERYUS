// PostList.js

import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, onSnapshot, getDocs, limit, startAfter, addDoc, Timestamp
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

// gradeEmojis 배열 추가 (App.js에서 가져옴)
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

function PostList({ darkMode, globalProfilePics, globalGrades }) {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [cCnt, setCCnt] = useState({});
  const [sortType, setSortType] = useState("newest"); // newest, popular, comments
  const [filterType, setFilterType] = useState("all"); // all, recruiting, completed
  const [loading, setLoading] = useState(true); // 로딩 상태 추가
  const [loadingMore, setLoadingMore] = useState(false); // 추가 로딩 상태
  const [hasMore, setHasMore] = useState(true); // 더 불러올 게시글이 있는지
  const [lastVisible, setLastVisible] = useState(null); // 마지막으로 불러온 문서
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

  // 초기 게시글 가져오기
  useEffect(() => {
    if (!me) return;
    
    setLoading(true);
    
    // 초기에는 최근 게시글 15개만 가져옴
    const q = query(
      collection(db, "posts"), 
      orderBy("createdAt", "desc"),
      limit(15)
    );
    
    const unsubscribe = onSnapshot(q, s => {
      if (s.docs.length > 0) {
        const arr = s.docs.map(d => ({ id: d.id, ...d.data() }));
        setPosts(arr);
        setLastVisible(s.docs[s.docs.length - 1]);
        setHasMore(s.docs.length === 15); // 15개 미만이면 더 이상 없음
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
        const commentSnap = await getDocs(collection(db, `post-${postId}-comments`));
        commentCounts[postId] = commentSnap.size;
      }
    }
    
    if (Object.keys(commentCounts).length > 0) {
      setCCnt(prevCounts => ({ ...prevCounts, ...commentCounts }));
    }
  };

  // 더 많은 게시글 로드 (무한 스크롤)
  const loadMorePosts = useCallback(async () => {
    if (!hasMore || loadingMore || !lastVisible) return;
    
    setLoadingMore(true);
    
    try {
      const q = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        startAfter(lastVisible),
        limit(10)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.docs.length > 0) {
        const newPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setPosts(prevPosts => [...prevPosts, ...newPosts]);
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === 10); // 10개 미만이면 더 이상 없음
        
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

  // 스크롤 이벤트 처리 (무한 스크롤)
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
    // 기본 검색어 필터
    const searchMatch = (p.title + p.content).includes(search) && (!p.isPrivate || p.nickname === me);
    
    // 필터 타입에 따른 추가 필터링
    if (filterType === "all") return searchMatch;
    if (filterType === "recruiting") return searchMatch && !p.partnerDone;
    if (filterType === "completed") return searchMatch && p.partnerDone;
    
    return searchMatch;
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

  // 현재 보여줄 게시글 (무한 스크롤용)
  const currentPosts = sortedPosts.slice(0, posts.length);

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
    
    // 그 이상은 날짜 표시
    return postTime.toLocaleDateString();
  };

  // 스타일 정의 - 반응형으로 조정
  const pageContainer = {
    backgroundColor: darkMode ? "#1a1a1a" : "#f5f0ff",
    minHeight: "100vh",
    padding: isMobile ? "10px" : "15px",
    color: darkMode ? "#e0e0e0" : "#333"
  };
  
  const headerStyle = {
    background: darkMode ? "#bb86fc" : "#8e5bd4",
    color: "white",
    padding: isMobile ? "12px 15px" : "15px 20px",
    borderRadius: "12px",
    marginBottom: "15px",
    textAlign: "center",
    fontWeight: "bold",
    boxShadow: darkMode ? "0 2px 5px rgba(0,0,0,0.3)" : "0 2px 5px rgba(0,0,0,0.1)"
  };
  
  const headerTitleStyle = {
    margin: 0,
    fontSize: isMobile ? "1.3rem" : "1.5rem"
  };
  
  const tabContainerStyle = {
    display: "flex",
    margin: "15px 0",
    gap: isMobile ? "6px" : "10px",
    overflowX: "auto",
    padding: "5px 0",
    WebkitOverflowScrolling: "touch", // iOS 스크롤 부드럽게
    scrollbarWidth: "none", // Firefox에서 스크롤바 숨기기
    msOverflowStyle: "none" // IE/Edge에서 스크롤바 숨기기
  };
  
  // 스크롤바 숨기기 위한 추가 스타일
  const hideScrollbarStyle = {
    "&::-webkit-scrollbar": {
      display: "none" // Chrome 등에서 스크롤바 숨기기
    }
  };
  
  const tabStyle = {
    padding: isMobile ? "8px 12px" : "10px 15px",
    borderRadius: "20px",
    border: "none",
    background: darkMode ? "#444" : "#e9e9e9",
    color: darkMode ? "#e0e0e0" : "#333",
    cursor: "pointer",
    fontSize: isMobile ? "13px" : "14px",
    whiteSpace: "nowrap",
    minHeight: "36px", // 터치하기 쉽게 최소 높이 설정
    touchAction: "manipulation" // 터치 최적화
  };
  
  const activeTabStyle = {
    ...tabStyle,
    background: darkMode ? "#bb86fc" : "#8e5bd4",
    color: "white",
    fontWeight: "500"
  };
  
  const sortTabContainerStyle = {
    display: "flex",
    justifyContent: "flex-end",
    gap: isMobile ? "5px" : "8px",
    marginBottom: "15px",
    overflowX: isMobile ? "auto" : "visible",
    WebkitOverflowScrolling: "touch"
  };
  
  const sortTabStyle = {
    padding: isMobile ? "6px 10px" : "5px 10px",
    borderRadius: "15px",
    border: "none",
    fontSize: "12px",
    background: darkMode ? "#444" : "#e9e9e9",
    color: darkMode ? "#e0e0e0" : "#333",
    cursor: "pointer",
    minHeight: "32px", // 터치하기 쉽게 최소 높이 설정
    touchAction: "manipulation" // 터치 최적화
  };
  
  const activeSortTabStyle = {
    ...sortTabStyle,
    background: darkMode ? "#bb86fc" : "#8e5bd4",
    color: "white"
  };
  
  const writeButtonStyle = {
    background: darkMode ? "#bb86fc" : "#8e5bd4",
    color: "white",
    border: "none",
    padding: isMobile ? "14px 0" : "12px 0", // 모바일에서 더 크게
    width: "100%",
    borderRadius: "8px",
    fontSize: isMobile ? "18px" : "16px", // 모바일에서 더 크게
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    boxShadow: darkMode ? "0 2px 5px rgba(0,0,0,0.3)" : "0 2px 5px rgba(0,0,0,0.1)",
    position: isMobile ? "sticky" : "static", // 모바일에서는 스티키로
    bottom: isMobile ? "15px" : "auto", // 모바일에서는 하단에 고정
    zIndex: isMobile ? "10" : "auto", // 다른 요소보다 위에 표시
    marginTop: isMobile ? "10px" : "0"
  };
  
  const postItemStyle = {
    marginBottom: "15px",
    padding: isMobile ? "14px" : "16px",
    borderRadius: "12px",
    background: darkMode ? "#2a2a2a" : "#f3e7ff",
    color: darkMode ? "#e0e0e0" : "#333",
    border: darkMode ? "1px solid #444" : "1px solid #b49ddb",
    boxShadow: darkMode ? "0 1px 3px rgba(0,0,0,0.3)" : "0 1px 3px rgba(0,0,0,0.05)"
  };
  
  const postTitleStyle = {
    margin: "0 0 8px 0",
    fontSize: isMobile ? "15px" : "16px",
    fontWeight: "bold",
    color: darkMode ? "#e0e0e0" : "#333",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    wordBreak: "break-word" // 긴 제목이 화면을 벗어나지 않도록
  };
  
  const userInfoStyle = {
    fontSize: isMobile ? "12px" : "13px",
    color: darkMode ? "#aaa" : "#666",
    borderBottom: darkMode ? "1px dashed #555" : "1px dashed #ccc",
    paddingBottom: "8px",
    marginBottom: "10px",
    display: "flex",
    alignItems: "center",
    gap: "5px",
    flexWrap: "wrap" // 모바일에서 공간이 부족할 경우 줄바꿈
  };
  
  const postTagStyle = {
    fontSize: "12px",
    background: darkMode ? "#bb86fc" : "#8e5bd4",
    color: "white",
    padding: "3px 8px",
    borderRadius: "10px",
    marginLeft: "5px",
    display: "inline-flex",
    alignItems: "center"
  };
  
  const postStatsStyle = {
    display: "flex",
    justifyContent: isMobile ? "flex-start" : "space-between", // 모바일에서는 왼쪽 정렬
    alignItems: "center",
    fontSize: "13px",
    color: darkMode ? "#aaa" : "#666",
    marginTop: "10px",
    flexDirection: isMobile ? "column" : "row", // 모바일에서는 세로로 배치
    gap: isMobile ? "10px" : "0" // 모바일에서 간격 추가
  };
  
  const statItemStyle = {
    display: "inline-flex",
    alignItems: "center",
    marginRight: "10px"
  };
  
  const buttonStyle = {
    background: darkMode ? "#bb86fc" : "#8e5bd4",
    color: "white",
    border: "none",
    padding: isMobile ? "8px 15px" : "6px 12px", // 모바일에서 더 크게
    borderRadius: "8px",
    fontSize: "13px",
    cursor: "pointer",
    minHeight: "36px", // 터치하기 쉽게
    touchAction: "manipulation" // 터치 최적화
  };
  
  const loadingStyle = {
    textAlign: "center",
    padding: "20px",
    color: darkMode ? "#aaa" : "#666"
  };
  
  const loadMoreStyle = {
    display: "block",
    width: "100%",
    padding: "12px 0",
    margin: "20px 0",
    background: darkMode ? "#444" : "#e9e9e9",
    color: darkMode ? "#e0e0e0" : "#666",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
    textAlign: "center"
  };
  
  // 스켈레톤 로딩 스타일
  const skeletonStyle = {
    background: darkMode ? "#444" : "#eaeaea",
    borderRadius: "5px",
    animation: "pulse 1.5s infinite",
    minHeight: "16px"
  };
  
  // 플로팅 버튼 스타일 (모바일)
  const floatingButtonStyle = {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: darkMode ? "#bb86fc" : "#8e5bd4",
    color: "white",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    boxShadow: darkMode ? "0 4px 8px rgba(0,0,0,0.4)" : "0 4px 8px rgba(0,0,0,0.2)",
    zIndex: 100,
    fontSize: "24px"
  };

  // 쪽지 보내기 함수
  const sendMessage = async (receiverNickname, postTitle) => {
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
        relatedPostTitle: postTitle
      });
      
      alert("쪽지가 전송되었습니다.");
    } catch (error) {
      console.error("쪽지 전송 오류:", error);
      alert("쪽지 전송 중 오류가 발생했습니다.");
    }
  };

  return (
    <div style={pageContainer}>
      <div style={headerStyle}>
        <h1 style={headerTitleStyle}>🎤 듀엣/합창 게시판</h1>
      </div>
      
      <SearchBar darkMode={darkMode} onSearch={setSearch} isMobile={isMobile} />
      
      <div style={{ ...tabContainerStyle, ...hideScrollbarStyle }}>
        <button 
          style={filterType === "all" ? activeTabStyle : tabStyle}
          onClick={() => setFilterType("all")}
        >
          전체 보기
        </button>
        <button 
          style={filterType === "recruiting" ? activeTabStyle : tabStyle}
          onClick={() => setFilterType("recruiting")}
        >
          <span role="img" aria-label="magnifier">🔍</span> 파트너 구인중
        </button>
        <button 
          style={filterType === "completed" ? activeTabStyle : tabStyle}
          onClick={() => setFilterType("completed")}
        >
          <span role="img" aria-label="check">✓</span> 구인 완료
        </button>
      </div>
      
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
      
      {/* 모바일이 아닌 경우에만 상단에 글쓰기 버튼 표시 */}
      {!isMobile && (
        <button 
          style={writeButtonStyle} 
          onClick={() => nav("/write/duet")}
        >
          <span role="img" aria-label="pencil" style={{ marginRight: "5px" }}>✏️</span> 글쓰기
        </button>
      )}
      
      <div style={{ marginTop: 20 }}>
        {loading ? (
          // 로딩 중일 때 스켈레톤 UI 표시
          Array.from({ length: 3 }).map((_, index) => (
            <div key={`skeleton-${index}`} style={postItemStyle}>
              <div style={{ ...skeletonStyle, width: "80%", height: "20px", marginBottom: "10px" }}></div>
              <div style={{ ...skeletonStyle, width: "60%", height: "16px", marginBottom: "15px" }}></div>
              <div style={{ ...skeletonStyle, width: "100%", height: "40px" }}></div>
            </div>
          ))
        ) : currentPosts.length === 0 ? (
          <p style={{ textAlign: "center", padding: "20px", color: darkMode ? "#aaa" : "#666" }}>게시글이 없습니다</p>
        ) : (
          currentPosts.map(p => (
            <div key={p.id} style={p.isNotice ? {
              ...postItemStyle,
              background: "linear-gradient(135deg, #7e57c2 0%, #9c68e6 100%)",
              color: "white",
              border: "2px solid #7e57c2",
              boxShadow: "0 4px 15px rgba(126, 87, 194, 0.3)",
              position: "relative"
            } : postItemStyle}>
              {p.isNotice && (
                <div style={{
                  position: "absolute",
                  top: "10px",
                  left: "10px",
                  background: "rgba(255, 255, 255, 0.9)",
                  color: "#7e57c2",
                  padding: "4px 8px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}>
                  📢 공지사항
                </div>
              )}
              
              <Link to={`/post/post/${p.id}`} style={{ 
                textDecoration: "none", 
                color: p.isNotice ? "white" : (darkMode ? "#e0e0e0" : "#333"),
                display: "block", // 터치 영역 확장
                margin: "-5px", // 터치 영역 확장
                padding: "5px" // 터치 영역 확장
              }}>
                <h3 style={{
                  ...postTitleStyle,
                  color: p.isNotice ? "white" : (darkMode ? "#e0e0e0" : "#333"),
                  marginTop: p.isNotice ? "25px" : "0"
                }}>
                  <Avatar src={globalProfilePics[p.nickname]} size={isMobile ? 24 : 28} />
                  {p.title.length > (isMobile ? 30 : 50) ? p.title.slice(0, isMobile ? 30 : 50) + "..." : p.title}
                  {!p.isNotice && (p.partnerDone ? (
                    <span style={{ ...postTagStyle, background: "#4caf50" }}>
                      ✅ 구인완료
                    </span>
                  ) : (
                    <span style={postTagStyle}>
                      🔍 구인중
                    </span>
                  ))}
                </h3>
              </Link>
              
              <div style={{
                ...userInfoStyle,
                color: p.isNotice ? "rgba(255, 255, 255, 0.9)" : (darkMode ? "#aaa" : "#666"),
                borderBottom: p.isNotice ? "1px dashed rgba(255, 255, 255, 0.3)" : (darkMode ? "1px dashed #555" : "1px dashed #ccc")
              }}>
                <Link 
                  to={`/userpage/${p.nickname || "알 수 없음"}`} 
                  style={{ 
                    textDecoration: "none", 
                    color: p.isNotice ? "white" : (darkMode ? "#bb86fc" : "#7e57c2"),
                    fontWeight: "500",
                    padding: isMobile ? "3px 0" : "0" // 모바일에서 터치 영역 넓히기
                  }}
                >
                  {p.nickname || "알 수 없음"} {p.nickname ? gradeEmojis[globalGrades[p.nickname]] : ""}
                </Link>
                <span style={{ margin: "0 5px" }}>•</span>
                {getRelativeTime(p.createdAt)}
              </div>
              
              <div style={{
                ...postStatsStyle,
                color: p.isNotice ? "rgba(255, 255, 255, 0.9)" : (darkMode ? "#aaa" : "#666")
              }}>
                <div>
                  <span style={statItemStyle}>
                    <span role="img" aria-label="heart" style={{ marginRight: "3px" }}>❤️</span> 
                    {p.likes || 0}
                  </span>
                  <span style={statItemStyle}>
                    <span role="img" aria-label="comments" style={{ marginRight: "3px" }}>💬</span> 
                    {(cCnt[p.id] ?? 0)}
                  </span>
                  <span style={statItemStyle}>
                    <span role="img" aria-label="views" style={{ marginRight: "3px" }}>👁️</span> 
                    {p.viewCount || 0}
                  </span>
                </div>
                
                <div style={{ width: isMobile ? "100%" : "auto" }}>
                  <Link to={`/send-message/${p.nickname || "알 수 없음"}`} style={{ 
                    display: isMobile ? "block" : "inline-block",
                    width: isMobile ? "100%" : "auto"
                  }}>
                    <button style={{ 
                      ...buttonStyle, 
                      width: isMobile ? "100%" : "auto" 
                    }}>
                      <span role="img" aria-label="message">✉️</span> 쪽지
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
        
        {/* 더 로드할 게시글이 있고, 로딩 중이 아닐 때만 더보기 버튼 표시 */}
        {!loading && currentPosts.length < sortedPosts.length && (
          <button 
            style={loadMoreStyle} 
            onClick={loadMorePosts}
          >
            더 보기 ({currentPosts.length}/{sortedPosts.length})
          </button>
        )}
        
        {/* 추가 로딩 중일 때 표시 */}
        {loadingMore && (
          <div style={{ 
            textAlign: "center", 
            padding: "20px",
            color: darkMode ? "#aaa" : "#666"
          }}>
            <div style={{
              display: "inline-block",
              width: "20px",
              height: "20px",
              border: darkMode ? "3px solid #444" : "3px solid #f3f3f3",
              borderTop: darkMode ? "3px solid #bb86fc" : "3px solid #8e5bd4",
              borderRadius: "50%",
              animation: "spin 1s linear infinite"
            }}></div>
            <p style={{ margin: "10px 0 0 0" }}>더 많은 게시글을 불러오는 중...</p>
          </div>
        )}
        
        {/* 더 불러올 게시글이 없을 때 표시 */}
        {!loading && !loadingMore && !hasMore && posts.length > 0 && (
          <div style={{ 
            textAlign: "center", 
            padding: "20px",
            color: darkMode ? "#aaa" : "#666",
            borderTop: darkMode ? "1px solid #555" : "1px solid #e0e0e0",
            marginTop: "20px"
          }}>
            <p style={{ margin: 0 }}>📄 모든 게시글을 확인했습니다</p>
          </div>
        )}
      </div>
      
      {/* 모바일에서만 플로팅 글쓰기 버튼 표시 */}
      {isMobile && (
        <button 
          style={floatingButtonStyle} 
          onClick={() => nav("/write/duet")}
          aria-label="글쓰기"
        >
          ✏️
        </button>
      )}
      
      {/* 애니메이션 스타일 추가 */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Props 검증 추가
PostList.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object.isRequired,
  globalGrades: PropTypes.object.isRequired
};

// 기본값 설정
PostList.defaultProps = {
  darkMode: false
};

export default PostList;
