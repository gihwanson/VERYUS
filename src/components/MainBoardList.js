import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { Link, useNavigate } from "react-router-dom";
import {
  collection, query, orderBy, limit, getDocs, where, onSnapshot
} from "firebase/firestore";
import { db } from "../firebase";

// 등급 이모지 매핑
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

function MainBoardList({ darkMode, globalProfilePics, globalGrades }) {
  const navigate = useNavigate();
  const [posts, setPosts] = useState({
    duet: { items: [], loading: true, error: null },
    free: { items: [], loading: true, error: null },
    song: { items: [], loading: true, error: null },
    advice: { items: [], loading: true, error: null },
    recording: { items: [], loading: true, error: null },
    score: { items: [], loading: true, error: null },
    specialMoments: { items: [], loading: true, error: null }
  });
  

  
  // ref 객체를 사용하여 직접 DOM에 접근할 링크 참조 생성
  const linkRefs = useRef({});
  
  const [activeHover, setActiveHover] = useState(null);
  const POST_COUNT = 3; // 각 게시판별 표시할 게시물 수
  
  // 댓글 수 실시간 업데이트를 위한 상태 추가
  const [commentCounts, setCommentCounts] = useState({});
  
  const [hotPosts, setHotPosts] = useState([]);
  const [hotPostsLoading, setHotPostsLoading] = useState(true);
  
  // 게시판 타입과 댓글 컬렉션 이름 매핑
  const commentCollectionMap = {
    duet: "post",
    free: "freepost", 
    song: "song",
    advice: "advice",
    recording: "recording-comments",
    specialMoments: "special-moment"
  };
  
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
    fetchPosts("recordings", "recording");
    fetchPosts("special_moments", "specialMoments");
  }, []);
  
  useEffect(() => {
    const fetchHotPosts = async () => {
      try {
        // 일주일 전 날짜 계산
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // 각 게시판의 핫한 게시글 가져오기
        const collections = [
          { name: "posts", type: "duet" },
          { name: "freeposts", type: "free" },
          { name: "songs", type: "song" },
          { name: "advice", type: "advice" },
          { name: "recordings", type: "recording" },
          { name: "special_moments", type: "specialMoments" }
        ];

        let allHotPosts = [];

        for (const col of collections) {
          const q = query(
            collection(db, col.name),
            where("createdAt", ">=", oneWeekAgo),
            orderBy("createdAt", "desc")
          );

          const snapshot = await getDocs(q);
          const posts = await Promise.all(snapshot.docs.map(async (doc) => {
            const postData = {
              id: doc.id,
              type: col.type,
              ...doc.data(),
              likeCount: doc.data().likes ? Object.keys(doc.data().likes).length : 0
            };

            // 댓글 수 가져오기
            try {
              const commentCollectionName = commentCollectionMap[col.type];
              if (commentCollectionName) {
                let commentRef;
                if (col.type === "recording") {
                  // 녹음게시판은 특별한 컬렉션명 사용
                  commentRef = collection(db, `${commentCollectionName}-${doc.id}`);
                } else {
                  commentRef = collection(db, `${commentCollectionName}-${doc.id}-comments`);
                }
                const commentSnapshot = await getDocs(commentRef);
                postData.commentCount = commentSnapshot.size;
              } else {
                postData.commentCount = 0;
              }
            } catch (error) {
              console.error(`댓글 수 가져오기 오류 (${doc.id}):`, error);
              postData.commentCount = 0;
            }

            return postData;
          }));

          allHotPosts = [...allHotPosts, ...posts];
        }

        // 좋아요 수 + 댓글 수 + 조회수로 정렬하고 상위 3개 선택 (가중치: 좋아요 1, 댓글 1.5, 조회수 0.1)
        const sortedHotPosts = allHotPosts
          .sort((a, b) => {
            const scoreA = (a.likes || 0) + (a.commentCount || 0) * 1.5 + (a.viewCount || 0) * 0.1;
            const scoreB = (b.likes || 0) + (b.commentCount || 0) * 1.5 + (b.viewCount || 0) * 0.1;
            return scoreB - scoreA;
          })
          .slice(0, 3);

        setHotPosts(sortedHotPosts);
      } catch (error) {
        console.error("핫한 게시글 로딩 오류:", error);
      } finally {
        setHotPostsLoading(false);
      }
    };

    fetchHotPosts();
  }, []);
  
  // 댓글 수 실시간 감시 설정
  useEffect(() => {
    const unsubscribes = [];

    Object.keys(boardInfo).forEach(boardType => {
      // 각 게시판의 최근 게시글들에 댓글 컬렉션 감시
      posts[boardType].items.forEach(post => {
        const collectionType = commentCollectionMap[boardType];
        if (collectionType) {
          let commentRef;
          if (boardType === "recording") {
            // 녹음게시판은 특별한 컬렉션명 사용
            commentRef = collection(db, `${collectionType}-${post.id}`);
          } else {
            commentRef = collection(db, `${collectionType}-${post.id}-comments`);
          }
          const unsubscribe = onSnapshot(commentRef, (snapshot) => {
            setCommentCounts(prev => ({
              ...prev,
              [`${boardType}-${post.id}`]: snapshot.size
            }));
          });
          unsubscribes.push(unsubscribe);
        }
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
      color: "#7e57c2",
      bgLight: "#f3eaff",
      bgDark: "#3a2a5a",
      hoverLight: "#e8dbff",
      hoverDark: "#4a3a6a",
      route: "/freeboard",
      postRoute: "/post/freepost"
    },
    song: {
      title: "🎵 노래 추천 게시판",
      color: "#7e57c2",
      bgLight: "#f3eaff",
      bgDark: "#3a2a5a",
      hoverLight: "#e8dbff",
      hoverDark: "#4a3a6a",
      route: "/songs",
      postRoute: "/post/song"
    },
    advice: {
      title: "💬 고민 상담 게시판",
      color: "#7e57c2",
      bgLight: "#f3eaff",
      bgDark: "#3a2a5a",
      hoverLight: "#e8dbff",
      hoverDark: "#4a3a6a",
      route: "/advice",
      postRoute: "/post/advice"
    },
    recording: {
      title: "🎤 녹음 게시판",
      color: "#7e57c2",
      bgLight: "#f3eaff",
      bgDark: "#3a2a5a",
      hoverLight: "#e8dbff",
      hoverDark: "#4a3a6a",
      route: "/recordings",
      postRoute: "/recording-comments"
    },
    score: {
      title: "🏆 콘테스트",
      color: "#7e57c2",
      bgLight: "#f3eaff",
      bgDark: "#3a2a5a",
      hoverLight: "#e8dbff",
      hoverDark: "#4a3a6a",
      route: "/scores",
      postRoute: "/post/score"
    },
    specialMoments: {
      title: "✨ 베리어스의 특별한 순간들",
      color: "#ff6d00",
      bgLight: "#fff3e0",
      bgDark: "#5a3a00",
      hoverLight: "#ffe0b2",
      hoverDark: "#6a4a10",
      route: "/special-moments",
      postRoute: "/post/special-moment"
    }
  };
  
  // 기본 카드 스타일
  const getCardStyle = (boardType, isHovering) => {
    const isMobile = window.innerWidth <= 768;
    return {
      padding: isMobile ? 15 : 20,
      borderRadius: isMobile ? 8 : 12,
      marginBottom: isMobile ? 10 : 20,
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
      transform: isHovering ? "translateY(-3px)" : "translateY(0)",
      width: "100%",
      boxSizing: "border-box"
    };
  };
  
  // 게시물 항목 스타일
  const postItemStyle = {
    padding: window.innerWidth <= 768 ? "12px" : "10px 15px",
    marginBottom: window.innerWidth <= 768 ? "10px" : "8px",
    borderRadius: window.innerWidth <= 768 ? "6px" : "8px",
    backgroundColor: darkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.5)",
    transition: "background-color 0.2s",
    cursor: "pointer",
    width: "100%",
    boxSizing: "border-box"
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
    padding: window.innerWidth <= 768 ? "12px 20px" : "8px 15px",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    borderRadius: "20px",
    fontSize: window.innerWidth <= 768 ? "15px" : "14px",
    marginTop: window.innerWidth <= 768 ? "15px" : "10px",
    color: darkMode ? "#e0e0e0" : "#333",
    transition: "background-color 0.2s",
    cursor: "pointer",
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box"
  };

  // 게시글 클릭 핸들러
  const handlePostClick = (boardType, postId) => {
    navigate(`${boardInfo[boardType].postRoute}/${postId}`);
  };



  return (
    <div>
      {/* 메인 게시판 목록 */}
      <div style={{ 
        width: "100%",
        maxWidth: "none",
        margin: "0", 
        padding: window.innerWidth <= 768 ? "10px" : "20px",
        display: "grid",
        gridTemplateColumns: window.innerWidth <= 768 
          ? "1fr" 
          : "repeat(auto-fit, minmax(300px, 1fr))",
        gap: window.innerWidth <= 768 ? "15px" : "20px",
        boxSizing: "border-box"
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
        
        {/* 핫한 게시글 섹션 */}
        <div style={getCardStyle("free", activeHover === "hot")}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
            <h3 style={{ 
              margin: 0, 
              color: darkMode ? "#fff" : "#333",
              fontSize: window.innerWidth <= 768 ? "16px" : "18px"
            }}>
              🔥 지금 핫한 게시글
            </h3>
          </div>

          {hotPostsLoading ? (
            Array(3).fill(null).map((_, i) => (
              <div key={i} style={skeletonStyle}></div>
            ))
          ) : hotPosts.length === 0 ? (
            <div style={postItemStyle}>
              <p style={{ margin: 0, color: darkMode ? "#ccc" : "#666" }}>
                인기 게시글이 없습니다.
              </p>
            </div>
          ) : (
            hotPosts.map(post => (
              <div
                key={post.id}
                style={{
                  ...postItemStyle,
                  ":hover": {
                    backgroundColor: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.7)"
                  }
                }}
                onClick={() => handlePostClick(post.type, post.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1, marginRight: 10 }}>
                    <div style={{ 
                      fontSize: window.innerWidth <= 768 ? "15px" : "14px", 
                      marginBottom: "4px",
                      lineHeight: "1.4"
                    }}>
                      {post.title}
                    </div>
                    <div style={{ 
                      fontSize: window.innerWidth <= 768 ? "13px" : "12px", 
                      color: darkMode ? "#bbb" : "#666" 
                    }}>
                      {post.nickname} {globalGrades[post.nickname] && gradeEmojis[globalGrades[post.nickname]]} • {formatTime(post.createdAt.seconds)} • 
                      <span style={{ marginLeft: "5px" }}>
                        ❤️ {post.likeCount || 0}
                      </span>
                      <span style={{ marginLeft: "5px" }}>
                        💬 {post.commentCount || 0}
                      </span>
                    </div>
                  </div>
                  <div style={{
                    fontSize: "12px",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    backgroundColor: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                    color: darkMode ? "#bbb" : "#666"
                  }}>
                    {boardInfo[post.type].title.split(" ")[1]}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        

        
        {/* 각 게시판 카드 */}
        {Object.keys(boardInfo).map(boardType => {
          if (boardType === "score" || boardType === "specialMoments") return null; // 콘테스트와 특별한 순간들은 별도로 처리
          
          return (
            <div 
              key={boardType} 
              style={getCardStyle(boardType, activeHover === boardType)}
              onMouseEnter={() => setActiveHover(boardType)}
              onMouseLeave={() => setActiveHover(null)}
            >
              <h2 style={{ 
                color: boardInfo[boardType].color, 
                marginBottom: window.innerWidth <= 768 ? 12 : 15,
                fontSize: window.innerWidth <= 768 ? "16px" : "20px",
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
                  {boardType === 'recording' && "녹음 글이 없습니다"} 
                  {boardType === 'score' && "콘테스트 게시물이 없습니다"}
                  {boardType === 'specialMoments' && "특별한 순간이 없습니다"}
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
                          <div style={{ 
                            fontSize: window.innerWidth <= 768 ? "15px" : "14px", 
                            marginBottom: "4px",
                            lineHeight: "1.4"
                          }}>{post.title}</div>
                          <div style={{ 
                            fontSize: window.innerWidth <= 768 ? "13px" : "12px", 
                            color: darkMode ? "#bbb" : "#666" 
                          }}>
                            {post.nickname} {globalGrades[post.nickname] && gradeEmojis[globalGrades[post.nickname]]} • {formatTime(post.createdAt.seconds)} • 
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
                      {boardType === 'recording' && "모든 녹음 게시물 보기"}
                      {boardType === 'score' && "모든 콘테스트 보기"}
                      {boardType === 'specialMoments' && "모든 특별한 순간 보기"}
                    </div>
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

MainBoardList.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object,
  globalGrades: PropTypes.object
};

MainBoardList.defaultProps = {
  darkMode: false,
  globalProfilePics: {},
  globalGrades: {}
};

export default MainBoardList;
