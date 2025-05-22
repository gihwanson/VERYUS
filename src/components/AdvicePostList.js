import React, { useState, useEffect } from "react";
import CustomLink from "./CustomLink";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, onSnapshot, where, limit, startAfter, getDocs
} from "firebase/firestore";
import { db } from "../firebase";
import SearchBar from "./SearchBar";
import {
  containerStyle, darkContainerStyle, titleStyle, purpleBtn, smallBtn
} from "../components/style";

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

function AdvicePostList({ darkMode, globalProfilePics, globalGrades }) {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState("newest"); // newest, oldest, popular
  const [categoryFilter, setCategoryFilter] = useState("all"); // all, study, relationship, career, etc
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [pageSize] = useState(10);
  const me = localStorage.getItem("nickname");
  const nav = useNavigate();

  const fetchPosts = async (isInitial = true) => {
    try {
      setLoading(true);
      
      let q;
      // 정렬 조건 설정
      const orderByField = sortOrder === "popular" ? "likes" : "createdAt";
      const orderDirection = sortOrder === "oldest" ? "asc" : "desc";
      
      // 카테고리 필터
      if (isInitial) {
        if (categoryFilter !== "all") {
          q = query(
            collection(db, "advice"),
            where("category", "==", categoryFilter),
            orderBy(orderByField, orderDirection),
            limit(pageSize)
          );
        } else {
          q = query(
            collection(db, "advice"),
            orderBy(orderByField, orderDirection),
            limit(pageSize)
          );
        }
      } else {
        // 추가 데이터 로드 (페이지네이션)
        if (lastVisible) {
          if (categoryFilter !== "all") {
            q = query(
              collection(db, "advice"),
              where("category", "==", categoryFilter),
              orderBy(orderByField, orderDirection),
              startAfter(lastVisible),
              limit(pageSize)
            );
          } else {
            q = query(
              collection(db, "advice"),
              orderBy(orderByField, orderDirection),
              startAfter(lastVisible),
              limit(pageSize)
            );
          }
        } else {
          return; // lastVisible이 없으면 추가 로드 불가능
        }
      }
      
      const snapshot = await getDocs(q);
      
      // 마지막 문서 저장 (페이지네이션을 위해)
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      // 더 로드할 데이터가 있는지 확인
      setHasMore(snapshot.docs.length === pageSize);
      
      const newPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      if (isInitial) {
        setPosts(newPosts);
      } else {
        setPosts(prevPosts => [...prevPosts, ...newPosts]);
      }
    } catch (error) {
      console.error("게시글 로드 중 오류 발생:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 실시간 업데이트를 위한 onSnapshot
    const q = query(
      collection(db, "advice"),
      orderBy("createdAt", "desc")
    );
    
    const unsubscribe = onSnapshot(q, snapshot => {
      // 새 게시글이나 변경사항이 감지되면 fetchPosts 호출
      fetchPosts();
    });
    
    // 컴포넌트 언마운트 시 구독 해제
    return () => unsubscribe();
  }, [fetchPosts]);

  useEffect(() => {
    if (search) {
      fetchPosts();
    }
  }, [search, fetchPosts]);

  const loadMorePosts = () => {
    if (!loading && hasMore) {
      fetchPosts(false);
    }
  };

  const filtered = posts.filter(p =>
    (p.title?.toLowerCase() + p.content?.toLowerCase()).includes(search.toLowerCase()) &&
    (!p.isPrivate || p.nickname === me)
  );

  const getFormattedDate = (seconds) => {
    const now = new Date();
    const postDate = new Date(seconds * 1000);
    
    // 오늘 날짜인 경우 시간만 표시
    if (postDate.toDateString() === now.toDateString()) {
      return `오늘 ${postDate.getHours().toString().padStart(2, '0')}:${postDate.getMinutes().toString().padStart(2, '0')}`;
    }
    
    // 어제 날짜인 경우
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (postDate.toDateString() === yesterday.toDateString()) {
      return `어제 ${postDate.getHours().toString().padStart(2, '0')}:${postDate.getMinutes().toString().padStart(2, '0')}`;
    }
    
    // 일주일 이내인 경우 요일 표시
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    if (postDate > weekAgo) {
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      return `${days[postDate.getDay()]}요일 ${postDate.getHours().toString().padStart(2, '0')}:${postDate.getMinutes().toString().padStart(2, '0')}`;
    }
    
    // 그 외는 전체 날짜 표시
    return `${postDate.getFullYear()}.${postDate.getMonth() + 1}.${postDate.getDate()}`;
  };

  // 카테고리 변환 함수
  const getCategoryName = (category) => {
    switch(category) {
      case "study": return "📚 학업";
      case "relationship": return "💑 인간관계";
      case "career": return "💼 진로/취업";
      case "health": return "🏥 건강";
      case "finance": return "💰 재정/경제";
      case "mental": return "🧠 정신건강";
      default: return "🤔 기타";
    }
  };

  const getPostStatusIcon = (post) => {
    if (post.isResolved) {
      return <span style={{ color: "#4caf50" }}>✅ 해결됨</span>;
    }
    if (post.isPrivate) {
      return <span style={{ color: "#ff9800" }}>🔒 비공개</span>;
    }
    return null;
  };

  const filterStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    margin: "15px 0",
    flexWrap: "wrap"
  };

  const filterButtonStyle = (isActive) => ({
    padding: "6px 12px",
    marginRight: 8,
    marginBottom: 8,
    background: isActive ? (darkMode ? "#7e57c2" : "#9c68e6") : (darkMode ? "#444" : "#e0e0e0"),
    color: isActive ? "#fff" : (darkMode ? "#ccc" : "#555"),
    border: "none",
    borderRadius: 20,
    cursor: "pointer",
    fontSize: 14
  });

  const categoryButtonStyle = (isActive) => ({
    padding: "6px 12px",
    marginRight: 8,
    marginBottom: 8,
    background: isActive ? (darkMode ? "#7e57c2" : "#9c68e6") : (darkMode ? "#444" : "#e0e0e0"),
    color: isActive ? "#fff" : (darkMode ? "#ccc" : "#555"),
    border: "none",
    borderRadius: 20,
    cursor: "pointer",
    fontSize: 14
  });

  const postItemStyle = {
    marginBottom: 16,
    padding: 14,
    border: "1px solid #b49ddb",
    borderRadius: 12,
    background: darkMode ? "#333" : "#f3e7ff",
    color: darkMode ? "#fff" : "#000",
    transition: "transform 0.2s ease-in-out",
    position: "relative"
  };

  const postItemHoverStyle = {
    ...postItemStyle,
    transform: "translateY(-2px)",
    boxShadow: "0 4px 8px rgba(0,0,0,0.1)"
  };

  const profileLinkStyle = {
    display: "flex",
    alignItems: "center",
    textDecoration: "none",
    color: darkMode ? "#ccc" : "#666"
  };

  const profileImageStyle = {
    width: 24,
    height: 24,
    borderRadius: "50%",
    marginRight: 8,
    objectFit: "cover"
  };

  const [hoveredPostId, setHoveredPostId] = useState(null);

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>💬 고민 상담 게시판</h1>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <SearchBar darkMode={darkMode} onSearch={setSearch} placeholder="고민 게시글 검색..." />
        <button 
          onClick={() => nav("/write/advice")} 
          style={{
            ...purpleBtn,
            marginLeft: 10,
            width: "auto",
            padding: "10px 20px"
          }}
        >
          고민 상담 작성
        </button>
      </div>
      
      {/* 필터 옵션 */}
      <div style={filterStyle}>
        <div>
          <button 
            style={filterButtonStyle(sortOrder === "newest")}
            onClick={() => setSortOrder("newest")}
          >
            최신순
          </button>
          <button 
            style={filterButtonStyle(sortOrder === "oldest")}
            onClick={() => setSortOrder("oldest")}
          >
            오래된순
          </button>
          <button 
            style={filterButtonStyle(sortOrder === "popular")}
            onClick={() => setSortOrder("popular")}
          >
            인기순
          </button>
        </div>
      </div>
      
      {/* 카테고리 필터 */}
      <div style={{ marginBottom: 15 }}>
        <button 
          style={categoryButtonStyle(categoryFilter === "all")}
          onClick={() => setCategoryFilter("all")}
        >
          전체
        </button>
        <button 
          style={categoryButtonStyle(categoryFilter === "study")}
          onClick={() => setCategoryFilter("study")}
        >
          📚 학업
        </button>
        <button 
          style={categoryButtonStyle(categoryFilter === "relationship")}
          onClick={() => setCategoryFilter("relationship")}
        >
          💑 인간관계
        </button>
        <button 
          style={categoryButtonStyle(categoryFilter === "career")}
          onClick={() => setCategoryFilter("career")}
        >
          💼 진로/취업
        </button>
        <button 
          style={categoryButtonStyle(categoryFilter === "health")}
          onClick={() => setCategoryFilter("health")}
        >
          🏥 건강
        </button>
        <button 
          style={categoryButtonStyle(categoryFilter === "mental")}
          onClick={() => setCategoryFilter("mental")}
        >
          🧠 정신건강
        </button>
      </div>
      
      {loading && posts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px" }}>
          게시글을 불러오는 중...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ 
          padding: "30px", 
          textAlign: "center",
          background: darkMode ? "#333" : "#f3e7ff",
          borderRadius: 12,
          margin: "20px 0"
        }}>
          <p>😥 검색 결과가 없습니다</p>
          <p style={{ fontSize: 14, color: darkMode ? "#aaa" : "#666", marginTop: 10 }}>
            다른 검색어로 시도하거나 필터를 변경해보세요
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          {filtered.map(post => (
            <div 
              key={post.id} 
              style={hoveredPostId === post.id ? postItemHoverStyle : postItemStyle}
              onMouseEnter={() => setHoveredPostId(post.id)}
              onMouseLeave={() => setHoveredPostId(null)}
            >
              {/* 게시글 상태 표시 (해결됨, 비공개 등) */}
              <div style={{ 
                position: "absolute", 
                top: 10, 
                right: 10,
                fontSize: 13
              }}>
                {getPostStatusIcon(post)}
              </div>
              
              <CustomLink to={`/post/advice/${post.id}`} style={{ textDecoration: "none", color: darkMode ? "#fff" : "#333" }}>
                <h3 style={{ marginBottom: 12 }}>{post.title}</h3>
              </CustomLink>
              
              {/* 카테고리 표시 */}
              <div style={{
                display: "inline-block",
                padding: "3px 8px",
                borderRadius: 12,
                background: darkMode ? "#444" : "#e0d3ff",
                fontSize: 12,
                marginBottom: 10
              }}>
                {getCategoryName(post.category)}
              </div>
              
              {/* 게시글 미리보기 */}
              <p style={{ 
                fontSize: 14, 
                margin: "10px 0", 
                color: darkMode ? "#bbb" : "#555",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}>
                {post.content?.substring(0, 150)}{post.content?.length > 150 ? "..." : ""}
              </p>
              
              <div style={{
                fontSize: 12,
                borderTop: `1px dashed ${darkMode ? "#555" : "#ccc"}`,
                paddingTop: 8,
                marginTop: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <CustomLink to={`/userpage/${post.nickname || "알 수 없음"}`} style={profileLinkStyle}>
                    <img 
                      src={globalProfilePics[post.nickname] || "https://via.placeholder.com/30"} 
                      alt={post.nickname} 
                      style={profileImageStyle}
                    />
                    {post.nickname || "알 수 없음"} {post.nickname && globalGrades[post.nickname] ? gradeEmojis[globalGrades[post.nickname]] : ""}
                  </CustomLink>
                  <span style={{ margin: "0 8px", color: darkMode ? "#777" : "#999" }}>•</span>
                  <span style={{ color: darkMode ? "#777" : "#999" }}>
                    {post.createdAt ? getFormattedDate(post.createdAt.seconds) : "알 수 없음"}
                  </span>
                </div>
                
                <div style={{ color: darkMode ? "#aaa" : "#777" }}>
                  <span title="좋아요">❤️ {post.likes || 0}</span>
                  <span style={{ margin: "0 8px" }}>|</span>
                  <span title="댓글">💬 {post.commentCount || 0}</span>
                </div>
              </div>
            </div>
          ))}
          
          {loading && (
            <div style={{ textAlign: "center", padding: "20px" }}>
              게시글을 불러오는 중...
            </div>
          )}
          
          {hasMore && !loading && (
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <button 
                onClick={loadMorePosts} 
                style={{
                  ...smallBtn,
                  width: "auto",
                  padding: "10px 20px"
                }}
              >
                더 보기 
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* 글쓰기 버튼 (하단에도 추가) */}
      <div style={{ textAlign: "center", marginTop: 30 }}>
        <button 
          onClick={() => nav("/write/advice")} 
          style={{
            ...purpleBtn,
            width: "auto",
            padding: "10px 20px",
            margin: "0 auto"
          }}
        >
          고민 상담 작성하기
        </button>
      </div>
    </div>
  );
}

// Props 검증 추가
AdvicePostList.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object.isRequired,
  globalGrades: PropTypes.object.isRequired
};

// 기본값 설정
AdvicePostList.defaultProps = {
  darkMode: false
};

export default AdvicePostList;
