// PostList.js

import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, onSnapshot, getDocs
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
  "태양": "🌞"
};

function PostList({ darkMode, globalProfilePics, globalGrades }) {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [cCnt, setCCnt] = useState({});
  const [sortType, setSortType] = useState("newest"); // newest, popular, comments
  const [filterType, setFilterType] = useState("all"); // all, recruiting, completed
  const me = localStorage.getItem("nickname");
  const nav = useNavigate();

  // 게시글 및 댓글 수 가져오기
  useEffect(() => {
    if (!me) return;
    
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    
    return onSnapshot(q, s => {
      const arr = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setPosts(arr);
      
      // 각 게시글 별 댓글 수 가져오기
      arr.forEach(p => {
        if (!(p.id in cCnt)) {
          getDocs(collection(db, `post-${p.id}-comments`)).then(cs =>
            setCCnt(cc => ({ ...cc, [p.id]: cs.size }))
          );
        }
      });
    });
  }, [me, cCnt]);

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
    
    // 그 이상은 날짜 표시
    return postTime.toLocaleDateString();
  };

  // 스타일 정의
  const pageContainer = {
    backgroundColor: "#f5f0ff",
    minHeight: "100vh",
    padding: "15px",
    color: "#333"
  };
  
  const headerStyle = {
    background: "#8e5bd4",
    color: "white",
    padding: "15px 20px",
    borderRadius: "12px",
    marginBottom: "15px",
    textAlign: "center",
    fontWeight: "bold",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
  };
  
  const tabContainerStyle = {
    display: "flex",
    margin: "15px 0",
    gap: "10px",
    overflowX: "auto",
    padding: "5px 0"
  };
  
  const tabStyle = {
    padding: "10px 15px",
    borderRadius: "20px",
    border: "none",
    background: "#e9e9e9",
    cursor: "pointer",
    fontSize: "14px",
    whiteSpace: "nowrap"
  };
  
  const activeTabStyle = {
    ...tabStyle,
    background: "#8e5bd4",
    color: "white",
    fontWeight: "500"
  };
  
  const sortTabContainerStyle = {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginBottom: "15px"
  };
  
  const sortTabStyle = {
    padding: "5px 10px",
    borderRadius: "15px",
    border: "none",
    fontSize: "12px",
    background: "#e9e9e9",
    cursor: "pointer"
  };
  
  const activeSortTabStyle = {
    ...sortTabStyle,
    background: "#8e5bd4",
    color: "white"
  };
  
  const writeButtonStyle = {
    background: "#8e5bd4",
    color: "white",
    border: "none",
    padding: "12px 0",
    width: "100%",
    borderRadius: "8px",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
  };
  
  const postItemStyle = {
    marginBottom: "15px",
    padding: "16px",
    borderRadius: "12px",
    background: "#f3e7ff",
    color: "#333",
    border: "1px solid #b49ddb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
  };
  
  const postTitleStyle = {
    margin: "0 0 8px 0",
    fontSize: "16px",
    fontWeight: "bold",
    color: "#333",
    display: "flex",
    alignItems: "center",
    gap: "8px"
  };
  
  const userInfoStyle = {
    fontSize: "13px",
    color: "#666",
    borderBottom: "1px dashed #ccc",
    paddingBottom: "8px",
    marginBottom: "10px",
    display: "flex",
    alignItems: "center",
    gap: "5px"
  };
  
  const postTagStyle = {
    fontSize: "12px",
    background: "#8e5bd4",
    color: "white",
    padding: "3px 8px",
    borderRadius: "10px",
    marginLeft: "5px",
    display: "inline-flex",
    alignItems: "center"
  };
  
  const postStatsStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "13px",
    color: "#666",
    marginTop: "10px"
  };
  
  const statItemStyle = {
    display: "inline-flex",
    alignItems: "center",
    marginRight: "10px"
  };
  
  const buttonStyle = {
    background: "#8e5bd4",
    color: "white",
    border: "none",
    padding: "6px 12px",
    borderRadius: "8px",
    fontSize: "13px",
    cursor: "pointer"
  };

  return (
    <div style={pageContainer}>
      <div style={headerStyle}>
        <h1 style={{ margin: 0 }}>🎤 듀엣/합창 게시판</h1>
      </div>
      
      <SearchBar darkMode={darkMode} onSearch={setSearch} />
      
      <div style={tabContainerStyle}>
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
      
      <button 
        style={writeButtonStyle} 
        onClick={() => nav("/write/duet")}
      >
        <span role="img" aria-label="pencil" style={{ marginRight: "5px" }}>✏️</span> 글쓰기
      </button>
      
      <div style={{ marginTop: 20 }}>
        {sortedPosts.length === 0 ? (
          <p style={{ textAlign: "center", padding: "20px", color: "#666" }}>게시글이 없습니다</p>
        ) : (
          sortedPosts.map(p => (
            <div key={p.id} style={postItemStyle}>
              <Link to={`/post/post/${p.id}`} style={{ 
                textDecoration: "none", 
                color: "#333" 
              }}>
                <h3 style={postTitleStyle}>
                  <Avatar src={globalProfilePics[p.nickname]} size={28} />
                  {p.title.length > 50 ? p.title.slice(0, 50) + "..." : p.title}
                  {p.partnerDone ? (
                    <span style={{ ...postTagStyle, background: "#4caf50" }}>
                      ✅ 구인완료
                    </span>
                  ) : (
                    <span style={postTagStyle}>
                      🔍 구인중
                    </span>
                  )}
                </h3>
              </Link>
              
              <div style={userInfoStyle}>
                <Link 
                  to={`/userpage/${p.nickname || "알 수 없음"}`} 
                  style={{ 
                    textDecoration: "none", 
                    color: "#666",
                    fontWeight: "500"
                  }}
                >
                  {p.nickname || "알 수 없음"} {p.nickname ? gradeEmojis[globalGrades[p.nickname]] : ""}
                </Link>
                <span style={{ margin: "0 5px" }}>•</span>
                {getRelativeTime(p.createdAt)}
              </div>
              
              <div style={postStatsStyle}>
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
                    <span role="img" aria-label="report" style={{ marginRight: "3px" }}>🚨</span> 
                    {p.reports || 0}
                  </span>
                </div>
                
                <div>
                  <Link to={`/send-message/${p.nickname || "알 수 없음"}`}>
                    <button style={buttonStyle}>
                      <span role="img" aria-label="message">✉️</span> 쪽지
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
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
