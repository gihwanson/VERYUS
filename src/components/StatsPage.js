// StatsPage.js
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  collection, getDocs, query, where, orderBy, limit
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, cardStyle, darkCardStyle
} from "../components/style";

function StatsPage({ darkMode }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    users: 0,
    posts: 0,
    comments: 0,
    duets: 0,
    freePosts: 0,
    songs: 0,
    advice: 0
  });
  const [topUsers, setTopUsers] = useState([]);
  const [popularPosts, setPopularPosts] = useState([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        
        // 기본 통계 수집
        const userCount = (await getDocs(collection(db, "users"))).size;
        const duetCount = (await getDocs(collection(db, "posts"))).size;
        const freePostCount = (await getDocs(collection(db, "freeposts"))).size;
        const songCount = (await getDocs(collection(db, "songs"))).size;
        const adviceCount = (await getDocs(collection(db, "advice"))).size;
        
        // 댓글 수 집계
        const duetCommentsCount = (await getDocs(collection(db, "posts-comments"))).size;
        const freeCommentsCount = (await getDocs(collection(db, "freeposts-comments"))).size;
        const songCommentsCount = (await getDocs(collection(db, "songs-comments"))).size;
        const adviceCommentsCount = (await getDocs(collection(db, "advice-comments"))).size;
        
        const totalComments = duetCommentsCount + freeCommentsCount + songCommentsCount + adviceCommentsCount;
        
        // 통계 업데이트
        setStats({
          users: userCount,
          posts: duetCount + freePostCount + songCount + adviceCount,
          comments: totalComments,
          duets: duetCount,
          freePosts: freePostCount,
          songs: songCount,
          advice: adviceCount
        });
        
        // 인기 포스트 가져오기 (좋아요 수 기준)
        const popularPostsArray = [];
        
        // 각 컬렉션에서 인기 게시글 가져오기
        const collections = [
          { name: "posts", type: "듀엣/합창" },
          { name: "freeposts", type: "자유게시판" },
          { name: "songs", type: "노래추천" },
          { name: "advice", type: "고민상담" }
        ];
        
        for (const col of collections) {
          const q = query(
            collection(db, col.name),
            orderBy("likes", "desc"),
            limit(3)
          );
          
          const snapshot = await getDocs(q);
          
          snapshot.forEach(doc => {
            const data = doc.data();
            popularPostsArray.push({
              id: doc.id,
              title: data.title,
              nickname: data.nickname,
              likes: data.likes || 0,
              commentCount: data.commentCount || 0,
              type: col.type,
              collection: col.name
            });
          });
        }
        
        // 좋아요 수로 정렬
        popularPostsArray.sort((a, b) => b.likes - a.likes);
        setPopularPosts(popularPostsArray.slice(0, 5)); // 상위 5개만
        
        // 활발한 사용자 가져오기 (게시글 수 기준)
        // 이 부분은 실제 구현 시 사용자별 게시글 집계가 필요합니다
        // 여기서는 간단한 예시만 보여줍니다
        const userPostCounts = {};
        
        for (const col of collections) {
          const snapshot = await getDocs(collection(db, col.name));
          
          snapshot.forEach(doc => {
            const data = doc.data();
            const nickname = data.nickname;
            
            if (nickname) {
              userPostCounts[nickname] = (userPostCounts[nickname] || 0) + 1;
            }
          });
        }
        
        // 게시글 수로 정렬하여 상위 5명 추출
        const topUsersArray = Object.entries(userPostCounts)
          .map(([nickname, count]) => ({ nickname, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        
        setTopUsers(topUsersArray);
      } catch (error) {
        console.error("통계 데이터 로드 중 오류:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStats();
  }, []);

  // 사용할 스타일
  const currentCardStyle = darkMode ? darkCardStyle : cardStyle;
  
  const statCardStyle = {
    ...currentCardStyle,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    textAlign: "center"
  };
  
  const statGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: 16,
    marginBottom: 32
  };
  
  const statNumberStyle = {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
    color: darkMode ? "#bb86fc" : "#7e57c2"
  };
  
  const statLabelStyle = {
    fontSize: 14,
    color: darkMode ? "#bbb" : "#555"
  };
  
  const sectionTitleStyle = {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 32,
    marginBottom: 16,
    color: darkMode ? "#ddd" : "#333",
    borderBottom: `2px solid ${darkMode ? "#555" : "#ddd"}`,
    paddingBottom: 8
  };
  
  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 16
  };
  
  const thStyle = {
    textAlign: "left",
    padding: "12px 16px",
    backgroundColor: darkMode ? "#444" : "#f3e7ff",
    color: darkMode ? "#ddd" : "#333",
    borderBottom: `1px solid ${darkMode ? "#555" : "#ddd"}`
  };
  
  const tdStyle = {
    padding: "12px 16px",
    borderBottom: `1px solid ${darkMode ? "#444" : "#eee"}`
  };
  
  const rankStyle = {
    display: "inline-block",
    width: 24,
    height: 24,
    borderRadius: "50%",
    backgroundColor: darkMode ? "#666" : "#e0e0e0",
    color: darkMode ? "#fff" : "#333",
    textAlign: "center",
    lineHeight: "24px",
    fontWeight: "bold",
    marginRight: 8
  };
  
  const typeBadgeStyle = (type) => {
    const colors = {
      "듀엣/합창": { bg: "#9c27b0", color: "#fff" },
      "자유게시판": { bg: "#2196f3", color: "#fff" },
      "노래추천": { bg: "#e91e63", color: "#fff" },
      "고민상담": { bg: "#4caf50", color: "#fff" }
    };
    
    const style = colors[type] || { bg: "#9e9e9e", color: "#fff" };
    
    return {
      display: "inline-block",
      padding: "3px 8px",
      borderRadius: 12,
      backgroundColor: style.bg,
      color: style.color,
      fontSize: 12,
      fontWeight: "bold"
    };
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>📊 사이트 통계</h1>
      
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <p>통계 데이터를 불러오는 중...</p>
        </div>
      ) : (
        <>
          {/* 주요 통계 */}
          <div style={statGridStyle}>
            <div style={statCardStyle}>
              <div style={statNumberStyle}>{stats.users}</div>
              <div style={statLabelStyle}>총 회원 수</div>
            </div>
            
            <div style={statCardStyle}>
              <div style={statNumberStyle}>{stats.posts}</div>
              <div style={statLabelStyle}>총 게시글 수</div>
            </div>
            
            <div style={statCardStyle}>
              <div style={statNumberStyle}>{stats.comments}</div>
              <div style={statLabelStyle}>총 댓글 수</div>
            </div>
            
            <div style={statCardStyle}>
              <div style={statNumberStyle}>{stats.duets}</div>
              <div style={statLabelStyle}>듀엣/합창</div>
            </div>
            
            <div style={statCardStyle}>
              <div style={statNumberStyle}>{stats.freePosts}</div>
              <div style={statLabelStyle}>자유게시판</div>
            </div>
            
            <div style={statCardStyle}>
              <div style={statNumberStyle}>{stats.songs}</div>
              <div style={statLabelStyle}>노래추천</div>
            </div>
            
            <div style={statCardStyle}>
              <div style={statNumberStyle}>{stats.advice}</div>
              <div style={statLabelStyle}>고민상담</div>
            </div>
          </div>
          
          {/* 인기 게시글 */}
          <h2 style={sectionTitleStyle}>🔥 인기 게시글</h2>
          {popularPosts.length > 0 ? (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>순위</th>
                  <th style={thStyle}>제목</th>
                  <th style={thStyle}>작성자</th>
                  <th style={thStyle}>분류</th>
                  <th style={thStyle}>좋아요</th>
                  <th style={thStyle}>댓글</th>
                </tr>
              </thead>
              <tbody>
                {popularPosts.map((post, index) => (
                  <tr key={`${post.collection}-${post.id}`}>
                    <td style={tdStyle}>
                      <span style={rankStyle}>{index + 1}</span>
                    </td>
                    <td style={tdStyle}>
                      <a 
                        href={`/post/${post.collection === "posts" ? "duet" : 
                              post.collection === "freeposts" ? "free" :
                              post.collection === "songs" ? "song" : "advice"}/${post.id}`}
                        style={{ 
                          color: darkMode ? "#bb86fc" : "#7e57c2",
                          textDecoration: "none",
                          fontWeight: "bold"
                        }}
                      >
                        {post.title}
                      </a>
                    </td>
                    <td style={tdStyle}>
                      <a 
                        href={`/profile/${post.nickname}`}
                        style={{ 
                          color: darkMode ? "#64b5f6" : "#2196f3",
                          textDecoration: "none"
                        }}
                      >
                        {post.nickname}
                      </a>
                    </td>
                    <td style={tdStyle}>
                      <span style={typeBadgeStyle(post.type)}>
                        {post.type}
                      </span>
                    </td>
                    <td style={{...tdStyle, color: "#e91e63", fontWeight: "bold"}}>
                      ❤️ {post.likes}
                    </td>
                    <td style={tdStyle}>
                      💬 {post.commentCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ textAlign: "center" }}>인기 게시글이 없습니다.</p>
          )}
          
          {/* 활발한 사용자 */}
          <h2 style={sectionTitleStyle}>👑 활발한 사용자</h2>
          {topUsers.length > 0 ? (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>순위</th>
                  <th style={thStyle}>닉네임</th>
                  <th style={thStyle}>게시글 수</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((user, index) => (
                  <tr key={user.nickname}>
                    <td style={tdStyle}>
                      <span style={rankStyle}>{index + 1}</span>
                    </td>
                    <td style={tdStyle}>
                      <a 
                        href={`/profile/${user.nickname}`}
                        style={{ 
                          color: darkMode ? "#64b5f6" : "#2196f3",
                          textDecoration: "none",
                          fontWeight: "bold"
                        }}
                      >
                        {user.nickname}
                      </a>
                    </td>
                    <td style={{...tdStyle, fontWeight: "bold"}}>
                      📝 {user.count}개
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ textAlign: "center" }}>활발한 사용자 데이터를 불러올 수 없습니다.</p>
          )}
        </>
      )}
    </div>
  );
}

StatsPage.propTypes = {
  darkMode: PropTypes.bool
};

StatsPage.defaultProps = {
  darkMode: false
};

export default StatsPage;
