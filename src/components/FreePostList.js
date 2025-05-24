import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, orderBy, onSnapshot, getDocs, limit, startAfter,
  getCountFromServer, addDoc, Timestamp
} from "firebase/firestore";
import { db } from "../firebase";
import SearchBar from "./SearchBar";
import Avatar from "./Avatar";
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
  "태양": "🌞",
  "은하": "🌌",
  "맥주": "🍺",
  "번개": "⚡",
  "달": "🌙",
  "별": "⭐"
};

function FreePostList({ darkMode, globalProfilePics, globalGrades }) {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [commentCounts, setCommentCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [sortOption, setSortOption] = useState("date"); // 'date', 'likes', 'comments'
  const [loadingMore, setLoadingMore] = useState(false);
  
  const me = localStorage.getItem("nickname");
  const navigate = useNavigate();
  const location = useLocation();
  const PAGE_SIZE = 10;
  
  // URL에서 쿼리 파라미터 가져오기
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get("search");
    const sortParam = params.get("sort");
    
    if (searchParam) setSearch(searchParam);
    if (sortParam && ['date', 'likes', 'comments'].includes(sortParam)) {
      setSortOption(sortParam);
    }
  }, [location.search]);
  
  // 정렬 조건에 따른 쿼리 생성 함수
  const createQuery = useCallback((afterDoc = null) => {
    let baseQuery;
    
    switch (sortOption) {
      case "likes":
        baseQuery = query(
          collection(db, "freeposts"), 
          orderBy("likes", "desc"), 
          orderBy("createdAt", "desc")
        );
        break;
      case "comments":
        // 댓글 순 정렬은 클라이언트에서 처리 (Firestore에서는 하위 컬렉션 기준 정렬이 어려움)
        baseQuery = query(
          collection(db, "freeposts"), 
          orderBy("createdAt", "desc")
        );
        break;
      case "date":
      default:
        baseQuery = query(
          collection(db, "freeposts"), 
          orderBy("createdAt", "desc")
        );
    }
    
    if (afterDoc) {
      return query(baseQuery, startAfter(afterDoc), limit(PAGE_SIZE));
    }
    
    return query(baseQuery, limit(PAGE_SIZE));
  }, [sortOption]);
  
  // 게시물 불러오기
  useEffect(() => {
    if (!me) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const q = createQuery();
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        if (snapshot.empty) {
          setPosts([]);
          setHasMore(false);
          setLoading(false);
          return;
        }
        
        // 마지막 문서 저장 (페이지네이션용)
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        setLastVisible(lastDoc);
        
        const postsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          likes: doc.data().likes || 0,
          reports: doc.data().reports || 0
        }));
        
        setPosts(postsData);
        setHasMore(postsData.length === PAGE_SIZE);
        
        // 댓글 수 가져오기 - 일괄 처리
        const commentPromises = postsData.map(async (post) => {
          try {
            const commentCollection = collection(db, `freepost-${post.id}-comments`);
            const commentSnapshot = await getCountFromServer(commentCollection);
            return { id: post.id, count: commentSnapshot.data().count };
          } catch (err) {
            console.error(`댓글 수 가져오기 오류 (${post.id}):`, err);
            return { id: post.id, count: 0 };
          }
        });
        
        const commentResults = await Promise.all(commentPromises);
        const newCommentCounts = commentResults.reduce((acc, { id, count }) => {
          acc[id] = count;
          return acc;
        }, {});
        
        setCommentCounts(prev => ({ ...prev, ...newCommentCounts }));
        setLoading(false);
      } catch (err) {
        console.error("게시물 목록 처리 오류:", err);
        setError("게시물을 불러오는 중 오류가 발생했습니다.");
        setLoading(false);
      }
    }, (err) => {
      console.error("게시물 목록 불러오기 오류:", err);
      setError("게시물을 불러오는 중 오류가 발생했습니다.");
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [me, createQuery]);
  
  // 더 많은 게시물 로드
  const loadMorePosts = async () => {
    if (!lastVisible || !hasMore || loading) return;
    
    setLoadingMore(true);
    
    try {
      const q = createQuery(lastVisible);
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setHasMore(false);
        setLoading(false);
        return;
      }
      
      // 마지막 문서 업데이트
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      const newPostsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        likes: doc.data().likes || 0,
        reports: doc.data().reports || 0
      }));
      
      setPosts(prev => [...prev, ...newPostsData]);
      setHasMore(newPostsData.length === PAGE_SIZE);
      
      // 댓글 수 가져오기 - 일괄 처리
      const commentPromises = newPostsData.map(async (post) => {
        try {
          const commentCollection = collection(db, `freepost-${post.id}-comments`);
          const commentSnapshot = await getCountFromServer(commentCollection);
          return { id: post.id, count: commentSnapshot.data().count };
        } catch (err) {
          console.error(`댓글 수 가져오기 오류 (${post.id}):`, err);
          return { id: post.id, count: 0 };
        }
      });
      
      const commentResults = await Promise.all(commentPromises);
      const newCommentCounts = commentResults.reduce((acc, { id, count }) => {
        acc[id] = count;
        return acc;
      }, {});
      
      setCommentCounts(prev => ({ ...prev, ...newCommentCounts }));
    } catch (err) {
      console.error("추가 게시물 불러오기 오류:", err);
      setError("추가 게시물을 불러오는 중 오류가 발생했습니다.");
    }
    
    setLoadingMore(false);
  };
  
  // 정렬 옵션 변경 핸들러
  const handleSortChange = (option) => {
    setSortOption(option);
    
    // URL 업데이트
    const params = new URLSearchParams(location.search);
    params.set("sort", option);
    if (search) params.set("search", search);
    navigate({
      pathname: location.pathname,
      search: params.toString()
    });
  };
  
  // 검색 핸들러
  const handleSearch = (searchTerm) => {
    setSearch(searchTerm);
    
    // URL 업데이트
    const params = new URLSearchParams(location.search);
    if (searchTerm) {
      params.set("search", searchTerm);
    } else {
      params.delete("search");
    }
    if (sortOption !== 'date') params.set("sort", sortOption);
    navigate({
      pathname: location.pathname,
      search: params.toString()
    });
  };
  
  // 댓글 수로 정렬된 게시물 목록 가져오기 (comment 정렬 옵션용)
  const getSortedPostsByComments = (postsToSort) => {
    return [...postsToSort].sort((a, b) => {
      const commentsA = commentCounts[a.id] || 0;
      const commentsB = commentCounts[b.id] || 0;
      if (commentsA === commentsB) {
        // 댓글 수가 같으면 날짜순으로 정렬
        return b.createdAt.seconds - a.createdAt.seconds;
      }
      return commentsB - commentsA;
    });
  };
  
  // 검색 필터링 적용
  const filteredPosts = posts.filter(post =>
    (post.title?.toLowerCase().includes(search.toLowerCase()) || 
     post.content?.toLowerCase().includes(search.toLowerCase())) &&
    (!post.isPrivate || post.nickname === me)
  );
  
  // 정렬 옵션에 따라 게시물 정렬
  const sortedPosts = sortOption === "comments" 
    ? getSortedPostsByComments(filteredPosts)
    : filteredPosts;
  
  // 카드 스타일 - 다크모드 적용
  const getCardStyle = (darkMode) => ({
    marginBottom: 16,
    padding: 14,
    border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`,
    borderRadius: 12,
    background: darkMode ? "#3a2a5a" : "#f3e7ff",
    color: darkMode ? "#e0e0e0" : "#000",
    transition: "transform 0.2s ease",
    boxShadow: `0 2px 4px rgba(0,0,0,${darkMode ? 0.2 : 0.1})`,
    "&:hover": {
      transform: "translateY(-2px)",
      boxShadow: `0 4px 8px rgba(0,0,0,${darkMode ? 0.3 : 0.15})`
    }
  });
  
  // 카드 헤더 스타일
  const cardHeaderStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10
  };
  
  // 카드 하단 메타 스타일
  const cardMetaStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 12,
    color: darkMode ? "#bbb" : "#666",
    marginTop: 10
  };
  
  // 버튼 그룹 스타일
  const buttonGroupStyle = {
    display: "flex",
    gap: "10px",
    marginBottom: "20px",
    flexWrap: "wrap"
  };
  
  // 소트 버튼 스타일
  const getSortButtonStyle = (option) => ({
    padding: "6px 12px",
    backgroundColor: sortOption === option 
      ? (darkMode ? "#7e57c2" : "#7e57c2") 
      : (darkMode ? "#333" : "#f0f0f0"),
    color: sortOption === option 
      ? "white" 
      : (darkMode ? "#e0e0e0" : "#333"),
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    transition: "background-color 0.2s ease"
  });

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
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "15px",
        flexWrap: "wrap",
        gap: "10px"
      }}>
        <h1 style={titleStyle}>📝 자유 게시판</h1>
        
        <button 
          onClick={() => navigate("/write/free")} 
          style={{
            ...purpleBtn,
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
          disabled={!me}
        >
          <span>✏️</span>
          글쓰기
        </button>
      </div>
      
      {/* 검색 바 */}
      <SearchBar 
        darkMode={darkMode} 
        onSearch={handleSearch}
        initialValue={search}
        placeholder="제목 또는 내용으로 검색"
      />
      
      {/* 정렬 옵션 */}
      <div style={buttonGroupStyle}>
        <button 
          onClick={() => handleSortChange("date")}
          style={getSortButtonStyle("date")}
        >
          최신순
        </button>
        <button 
          onClick={() => handleSortChange("likes")}
          style={getSortButtonStyle("likes")}
        >
          좋아요순
        </button>
        <button 
          onClick={() => handleSortChange("comments")}
          style={getSortButtonStyle("comments")}
        >
          댓글순
        </button>
      </div>
      
      {/* 검색 결과 카운트 */}
      {!loading && !error && (
        <div style={{ 
          marginBottom: "15px", 
          fontSize: "14px", 
          color: darkMode ? "#bbb" : "#666" 
        }}>
          {search 
            ? `검색 결과: ${sortedPosts.length}개의 게시물`
            : `전체: ${sortedPosts.length}개${hasMore ? ' 이상' : ''} 게시물`}
        </div>
      )}
      
      {/* 로딩 상태 */}
      {loading && posts.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ 
            width: "40px", 
            height: "40px", 
            border: "4px solid rgba(126, 87, 194, 0.1)", 
            borderTop: "4px solid #7e57c2", 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite", 
            margin: "0 auto 20px" 
          }}></div>
          <p>게시물을 불러오는 중...</p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
      
      {/* 에러 상태 */}
      {error && (
        <div style={{ 
          padding: "20px", 
          textAlign: "center", 
          color: "#d32f2f",
          backgroundColor: darkMode ? "#482121" : "#ffebee",
          borderRadius: "8px",
          marginBottom: "20px"
        }}>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()}
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
      )}
      
      {/* 빈 상태 - 검색 결과 없음 */}
      {!loading && !error && search && sortedPosts.length === 0 && (
        <div style={{ 
          padding: "40px", 
          textAlign: "center", 
          backgroundColor: darkMode ? "#333" : "#f5f5f5",
          borderRadius: "8px",
          marginBottom: "20px"
        }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>🔍</div>
          <p style={{ fontSize: "16px", color: darkMode ? "#bbb" : "#666" }}>
            '{search}'에 대한 검색 결과가 없습니다.
          </p>
          <button 
            onClick={() => handleSearch("")}
            style={{
              padding: "8px 16px",
              backgroundColor: "#7e57c2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginTop: "15px"
            }}
          >
            모든 게시물 보기
          </button>
        </div>
      )}
      
      {/* 빈 상태 - 게시물 없음 */}
      {!loading && !error && !search && sortedPosts.length === 0 && (
        <div style={{ 
          padding: "40px", 
          textAlign: "center", 
          backgroundColor: darkMode ? "#333" : "#f5f5f5",
          borderRadius: "8px",
          marginBottom: "20px"
        }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>📝</div>
          <p style={{ fontSize: "16px", color: darkMode ? "#bbb" : "#666" }}>
            아직 게시물이 없습니다.
            {me && (
              <div style={{ marginTop: "10px" }}>
                <button 
                  onClick={() => navigate("/write/free")}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#7e57c2",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  첫 게시물 작성하기
                </button>
              </div>
            )}
          </p>
        </div>
      )}
      
      {/* 게시물 목록 */}
      <div style={{ marginTop: 20 }}>
        {sortedPosts.map(post => (
          <div 
            key={post.id} 
            style={getCardStyle(darkMode)}
          >
            <Link 
              to={`/post/freepost/${post.id}`} 
              style={{
                textDecoration: "none",
                color: darkMode ? "#e0e0e0" : "#333",
                display: "block"
              }}
            >
              <div style={cardHeaderStyle}>
                <Avatar 
                  src={globalProfilePics[post.nickname]} 
                  size={32}
                  style={{ border: `2px solid ${darkMode ? "#513989" : "#b49ddb"}` }}
                />
                <h3 style={{ 
                  margin: 0,
                  fontWeight: "bold",
                  fontSize: "18px",
                  flexGrow: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical"
                }}>
                  {post.title}
                  {post.isPrivate && (
                    <span style={{ 
                      marginLeft: "8px",
                      fontSize: "14px",
                      color: darkMode ? "#ff9800" : "#e67e22",
                      fontWeight: "normal"
                    }}>
                      🔒 비공개
                    </span>
                  )}
                </h3>
              </div>
            </Link>
            
            {/* 게시물 미리보기 */}
            {post.content && (
              <div style={{
                fontSize: "14px",
                color: darkMode ? "#bbb" : "#555",
                marginTop: "8px",
                marginBottom: "10px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                lineHeight: 1.4
              }}>
                {post.content.replace(/<[^>]*>/g, '').slice(0, 150)}
                {post.content.length > 150 && "..."}
              </div>
            )}
            
            {/* 게시물 하단 정보 */}
            <div style={cardMetaStyle}>
              <div>
                <Link 
                  to={`/userpage/${post.nickname || "알 수 없음"}`} 
                  style={{
                    textDecoration: "none",
                    color: darkMode ? "#d4c2ff" : "#7e57c2",
                    fontWeight: "bold",
                    display: "inline-flex",
                    alignItems: "center",
                    marginRight: "10px"
                  }}
                >
                  {post.nickname || "알 수 없음"} 
                  {post.nickname && globalGrades[post.nickname] && (
                    <span style={{ marginLeft: "4px" }}>
                      {gradeEmojis[globalGrades[post.nickname]]}
                    </span>
                  )}
                </Link>
                <span style={{ marginRight: "10px" }}>
                  {formatDate(post.createdAt.seconds)}
                </span>
              </div>
              
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center" }}>
                  👍 {post.likes || 0}
                </span>
                <span style={{ display: "flex", alignItems: "center" }}>
                  💬 {commentCounts[post.id] || 0}
                </span>
              </div>
            </div>
          </div>
        ))}
        
        {/* 더 보기 버튼 */}
        {!search && hasMore && !loading && (
          <div style={{ textAlign: "center", marginTop: "30px" }}>
            <button 
              onClick={loadMorePosts}
              style={{
                padding: "10px 20px",
                backgroundColor: darkMode ? "#3a2a5a" : "#f3e7ff",
                color: darkMode ? "#d4c2ff" : "#7e57c2",
                border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`,
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "bold"
              }}
            >
              더 보기
            </button>
          </div>
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
              width: "20px",
              height: "20px",
              border: "3px solid #f3f3f3",
              borderTop: "3px solid #7e57c2",
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
            color: "#666",
            borderTop: "1px solid #e0e0e0",
            marginTop: "20px"
          }}>
            <p style={{ margin: 0 }}>📄 모든 게시글을 확인했습니다</p>
          </div>
        )}
        
        {/* 추가 로딩 인디케이터 */}
        {loading && posts.length > 0 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ 
              width: "30px", 
              height: "30px", 
              border: "3px solid rgba(126, 87, 194, 0.1)", 
              borderTop: "3px solid #7e57c2", 
              borderRadius: "50%", 
              animation: "spin 1s linear infinite", 
              margin: "0 auto" 
            }}></div>
          </div>
        )}
      </div>
      
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

// 날짜 포맷팅 함수
function formatDate(seconds) {
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
}

// Props 검증 추가
FreePostList.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object.isRequired,
  globalGrades: PropTypes.object.isRequired
};

// 기본값 설정
FreePostList.defaultProps = {
  darkMode: false
};

export default FreePostList;
