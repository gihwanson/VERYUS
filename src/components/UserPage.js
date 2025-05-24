// UserPage.js
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  containerStyle, darkContainerStyle, titleStyle, purpleBtn, DEFAULT_AVATAR
} from "../components/style";
import { FaEdit, FaBookOpen, FaMicrophone, FaHeart, FaShare, FaEnvelope } from "react-icons/fa";
import {
  collection, query, where, getDocs, orderBy, limit, onSnapshot, addDoc, deleteDoc, doc, Timestamp
} from "firebase/firestore";
import { db } from "../firebase";
import defaultAvatar from "../assets/default-avatar.png";

// gradeEmojis 객체
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

function UserPage({ 
  darkMode, 
  globalProfilePics, 
  globalIntroductions, 
  globalGrades,
  globalUserStats,
  isOwnProfile,
  onFollowUser
}) {
  const { nickname } = useParams();
  const nav = useNavigate();
  const [isFollowing, setIsFollowing] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [userStats, setUserStats] = useState({
    posts: 0,
    comments: 0,
    guestbookEntries: 0
  });
  const [recentRecordings, setRecentRecordings] = useState([]);
  const [recentComments, setRecentComments] = useState([]);
  const [guestbookEntries, setGuestbookEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("profile");
  
  // 방명록 관련 상태
  const [guestbookMessage, setGuestbookMessage] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  
  const grade = globalGrades[nickname] || "";
  const emoji = gradeEmojis[grade] || "";
  const stats = globalUserStats?.[nickname] || { duets: 0, followers: 0, following: 0, recordings: 0 };
  
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        
        // 사용자 정보 가져오기
        const userQuery = query(collection(db, "users"), where("nickname", "==", nickname));
        const userSnapshot = await getDocs(userQuery);
        
        if (userSnapshot.empty) {
          setError("사용자를 찾을 수 없습니다.");
          return;
        }
        
        const userData = userSnapshot.docs[0].data();
        setUserInfo(userData);
        
        // 통계 계산
        const [duetPosts, freePosts, songPosts, advicePosts] = await Promise.all([
          getDocs(query(collection(db, "posts"), where("nickname", "==", nickname))),
          getDocs(query(collection(db, "freeposts"), where("nickname", "==", nickname))),
          getDocs(query(collection(db, "songs"), where("nickname", "==", nickname))),
          getDocs(query(collection(db, "advice"), where("nickname", "==", nickname)))
        ]);
        
        const totalPosts = duetPosts.size + freePosts.size + songPosts.size + advicePosts.size;
        
        // 댓글 수 계산
        const commentCollections = await Promise.all([
          getDocs(query(collection(db, "comments"), where("author", "==", nickname))),
          getDocs(query(collection(db, "freecomments"), where("author", "==", nickname))),
          getDocs(query(collection(db, "songcomments"), where("author", "==", nickname))),
          getDocs(query(collection(db, "advicecomments"), where("author", "==", nickname)))
        ]);
        
        const totalComments = commentCollections.reduce((total, collection) => total + collection.size, 0);
        
        // 방명록 수 계산
        const guestbookSnapshot = await getDocs(collection(db, `guestbook-${nickname}`));
        const guestbookCount = guestbookSnapshot.size;
        
        setUserStats({
          posts: totalPosts,
          comments: totalComments,
          guestbookEntries: guestbookCount
        });
        
        // 최근 게시물 가져오기 (듀엣/합창 게시판만) - 인덱스 오류 방지를 위해 단순 쿼리 사용
        const recentRecordingsQuery = query(
          collection(db, "posts"),
          where("nickname", "==", nickname),
          limit(10) // 더 많이 가져와서 클라이언트에서 정렬
        );
        const recentRecordingsSnapshot = await getDocs(recentRecordingsQuery);
        const allRecentRecordings = recentRecordingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // 클라이언트 사이드에서 최신순 정렬 후 상위 5개만 선택
        const sortedRecentRecordings = allRecentRecordings
          .sort((a, b) => {
            if (a.createdAt && b.createdAt) {
              return b.createdAt.seconds - a.createdAt.seconds;
            }
            return 0;
          })
          .slice(0, 5);
        
        setRecentRecordings(sortedRecentRecordings);
        
        // 최근 댓글 가져오기 (듀엣/합창 댓글만) - 인덱스 오류 방지를 위해 단순 쿼리 사용
        const recentCommentsQuery = query(
          collection(db, "comments"),
          where("author", "==", nickname),
          limit(10) // 더 많이 가져와서 클라이언트에서 정렬
        );
        const recentCommentsSnapshot = await getDocs(recentCommentsQuery);
        const allRecentComments = recentCommentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // 클라이언트 사이드에서 최신순 정렬 후 상위 5개만 선택
        const sortedRecentComments = allRecentComments
          .sort((a, b) => {
            if (a.createdAt && b.createdAt) {
              return b.createdAt.seconds - a.createdAt.seconds;
            }
            return 0;
          })
          .slice(0, 5);
        
        setRecentComments(sortedRecentComments);
        
      } catch (err) {
        console.error("사용자 데이터 로드 오류:", err);
        setError("사용자 정보를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    if (nickname) {
      fetchUserData();
    }
  }, [nickname]);

  // 방명록 실시간 로드
  useEffect(() => {
    if (!nickname) return;
    
    const q = query(
      collection(db, `guestbook-${nickname}`),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setGuestbookEntries(entries);
    });
    
    return () => unsubscribe();
  }, [nickname]);

  // 방명록 작성
  const addGuestbookEntry = async () => {
    if (!localStorage.getItem("nickname")) {
      alert("로그인이 필요합니다.");
      return;
    }
    
    if (!guestbookMessage.trim()) {
      alert("메시지를 입력해주세요.");
      return;
    }
    
    try {
      const entryData = {
        writer: localStorage.getItem("nickname"),
        text: guestbookMessage.trim(),
        isSecret: isSecret,
        createdAt: Timestamp.now(),
        replies: []
      };
      
      await addDoc(collection(db, `guestbook-${nickname}`), entryData);
      
      // 알림 추가 (방명록 주인이 나와 다를 경우)
      if (localStorage.getItem("nickname") !== nickname) {
        await addDoc(collection(db, "notifications"), {
          receiverNickname: nickname,
          message: `${localStorage.getItem("nickname")}님이 방명록에 새 글을 작성했습니다.`,
          type: "guestbook",
          createdAt: Timestamp.now(),
          read: false,
          link: `/userpage/${nickname}`
        });
      }
      
      setGuestbookMessage("");
      setIsSecret(false);
      alert("방명록이 등록되었습니다!");
      
    } catch (error) {
      console.error("방명록 등록 오류:", error);
      alert("방명록 등록 중 오류가 발생했습니다.");
    }
  };

  // 방명록 삭제
  const deleteGuestbookEntry = async (entryId, entryWriter) => {
    if (localStorage.getItem("nickname") !== entryWriter && localStorage.getItem("nickname") !== nickname) {
      alert("삭제 권한이 없습니다.");
      return;
    }
    
    if (!window.confirm("이 방명록을 삭제하시겠습니까?")) return;
    
    try {
      await deleteDoc(doc(db, `guestbook-${nickname}`, entryId));
      alert("방명록이 삭제되었습니다.");
    } catch (error) {
      console.error("방명록 삭제 오류:", error);
      alert("방명록 삭제 중 오류가 발생했습니다.");
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "날짜 없음";
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const handleFollow = () => {
    setIsFollowing(!isFollowing);
    if (onFollowUser) {
      onFollowUser(nickname, !isFollowing);
    }
  };
  
  const handleShare = () => {
    setShowShareOptions(!showShareOptions);
  };

  const copyProfileLink = () => {
    const profileUrl = `${window.location.origin}/user/${nickname}`;
    navigator.clipboard.writeText(profileUrl);
    alert("프로필 링크가 클립보드에 복사되었습니다!");
    setShowShareOptions(false);
  };
  
  const navigateToRecordings = () => {
    // 타사용자의 녹음 목록을 보여주는 페이지로 이동
    nav(`/user-recordings/${nickname}`);
  };

  // 쪽지 보내기 함수 추가
  const sendMessage = async () => {
    const me = localStorage.getItem("nickname");
    if (!me) {
      alert("로그인이 필요합니다.");
      return;
    }
    
    if (me === nickname) {
      alert("자신에게는 쪽지를 보낼 수 없습니다.");
      return;
    }
    
    const messageContent = prompt(`${nickname}님에게 보낼 메시지를 입력하세요:`);
    if (!messageContent || !messageContent.trim()) {
      return;
    }
    
    try {
      await addDoc(collection(db, "messages"), {
        senderNickname: me,
        receiverNickname: nickname,
        content: messageContent.trim(),
        createdAt: Timestamp.now(),
        read: false,
        relatedPostTitle: null
      });
      
      alert("쪽지가 전송되었습니다.");
    } catch (error) {
      console.error("쪽지 전송 오류:", error);
      alert("쪽지 전송 중 오류가 발생했습니다.");
    }
  };

  if (loading) {
    return (
      <div style={darkMode ? darkContainerStyle : containerStyle}>
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ 
            width: "40px", 
            height: "40px", 
            border: "4px solid #f3e7ff", 
            borderTop: "4px solid #7e57c2", 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite", 
            margin: "0 auto 20px" 
          }}></div>
          <p>사용자 정보를 불러오는 중...</p>
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

  if (error) {
    return (
      <div style={darkMode ? darkContainerStyle : containerStyle}>
        <div style={{ textAlign: "center", padding: "40px 0", color: "#f44336" }}>
          <h2>오류 발생</h2>
          <p>{error}</p>
          <button onClick={() => nav("/")}>홈으로 돌아가기</button>
        </div>
      </div>
    );
  }

  const userGrade = globalGrades[nickname] || userInfo?.grade || "";
  const gradeEmoji = userGrade ? gradeEmojis[userGrade] : null;

  const cardStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "20px",
    boxShadow: `0 4px 12px ${darkMode ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"}`,
    border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
  };

  const textareaStyle = {
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    resize: "vertical",
    fontFamily: "inherit",
    fontSize: "14px",
    boxSizing: "border-box"
  };

  const tabStyle = {
    display: "flex",
    marginBottom: 20,
    borderRadius: "8px",
    overflow: "hidden",
    backgroundColor: darkMode ? "#333" : "#f0f0f0"
  };

  const tabItemStyle = (isActive) => ({
    flex: 1,
    padding: "12px 20px",
    cursor: "pointer",
    background: isActive 
      ? (darkMode ? "#7e57c2" : "#9c68e6") 
      : "transparent",
    color: isActive 
      ? "#fff" 
      : (darkMode ? "#ccc" : "#666"),
    borderRadius: 0,
    border: "none",
    fontWeight: isActive ? "bold" : "normal",
    textAlign: "center",
    transition: "all 0.3s ease"
  });

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      {/* 사용자 프로필 헤더 */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        marginBottom: "30px",
        padding: "30px",
        borderRadius: "16px",
        background: darkMode ? 
          "linear-gradient(135deg, #2a1b3d 0%, #3a2a5a 100%)" : 
          "linear-gradient(135deg, #f8f4ff 0%, #e8daff 100%)",
        boxShadow: `0 8px 32px ${darkMode ? "rgba(126, 87, 194, 0.3)" : "rgba(126, 87, 194, 0.15)"}`,
        border: `1px solid ${darkMode ? "#513989" : "#d4c2ff"}`
      }}>
        {/* 프로필 이미지 */}
        <div style={{ position: "relative", marginBottom: "20px" }}>
          <img
            src={globalProfilePics[nickname] || defaultAvatar}
            alt={`${nickname} 프로필`}
            style={{
              width: 120,
              height: 120,
              objectFit: "cover",
              borderRadius: "50%",
              border: `4px solid ${darkMode ? "#bb86fc" : "#7e57c2"}`,
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
            }}
          />
          {/* 온라인 상태 표시 (선택사항) */}
          <div style={{
            position: "absolute",
            bottom: "8px",
            right: "8px",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            backgroundColor: "#4caf50",
            border: `3px solid ${darkMode ? "#2a1b3d" : "#fff"}`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
          }} />
        </div>

        {/* 사용자 정보 */}
        <h1 style={{
          ...titleStyle,
          marginBottom: "10px",
          fontSize: "28px",
          fontWeight: "bold",
          color: darkMode ? "#e0e0e0" : "#333"
        }}>
          {nickname}
        </h1>

        {/* 등급 표시 */}
        {gradeEmoji && (
          <div style={{
            display: "inline-block",
            padding: "8px 16px",
            backgroundColor: darkMode ? "rgba(126, 87, 194, 0.3)" : "rgba(126, 87, 194, 0.1)",
            borderRadius: "25px",
            color: darkMode ? "#d4c2ff" : "#7e57c2",
            marginBottom: "15px",
            fontSize: "16px",
            fontWeight: "bold"
          }}>
            {gradeEmoji} {userGrade}
          </div>
        )}

        {/* 자기소개 */}
        <p style={{
          margin: "0 0 20px",
          color: darkMode ? "#bbb" : "#666",
          maxWidth: "600px",
          lineHeight: "1.6",
          fontSize: "15px"
        }}>
          {globalIntroductions[nickname] || "작성된 자기소개가 없습니다."}
        </p>

        {/* 액션 버튼들 */}
        <div style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          justifyContent: "center"
        }}>
          <button 
            onClick={sendMessage}
            style={{
              ...purpleBtn,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "25px",
              fontWeight: "600"
            }}
          >
            <FaEnvelope size={16} />
            쪽지 보내기
          </button>
          
          <button 
            onClick={() => nav(`/guestbook/${nickname}`)}
            style={{
              ...purpleBtn,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "25px",
              backgroundColor: darkMode ? "#4a90e2" : "#2196f3",
              fontWeight: "600"
            }}
          >
            <FaBookOpen size={16} />
            방명록 보기
          </button>
        </div>
      </div>

      {/* 활동 통계 카드 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "20px",
        marginBottom: "30px"
      }}>
        <div style={{
          padding: "20px",
          borderRadius: "12px",
          backgroundColor: darkMode ? "#333" : "#fff",
          boxShadow: `0 4px 16px ${darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"}`,
          textAlign: "center",
          cursor: "pointer",
          transition: "transform 0.2s ease",
          border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-5px)"}
        onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
        >
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>📝</div>
          <div style={{ 
            fontSize: "24px", 
            fontWeight: "bold", 
            color: darkMode ? "#e0e0e0" : "#333",
            marginBottom: "5px"
          }}>
            {userStats.posts || 0}
          </div>
          <div style={{ 
            fontSize: "14px", 
            color: darkMode ? "#aaa" : "#666"
          }}>
            게시물
          </div>
        </div>

        <div style={{
          padding: "20px",
          borderRadius: "12px",
          backgroundColor: darkMode ? "#333" : "#fff",
          boxShadow: `0 4px 16px ${darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"}`,
          textAlign: "center",
          cursor: "pointer",
          transition: "transform 0.2s ease",
          border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-5px)"}
        onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
        >
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>💬</div>
          <div style={{ 
            fontSize: "24px", 
            fontWeight: "bold", 
            color: darkMode ? "#e0e0e0" : "#333",
            marginBottom: "5px"
          }}>
            {userStats.comments || 0}
          </div>
          <div style={{ 
            fontSize: "14px", 
            color: darkMode ? "#aaa" : "#666"
          }}>
            댓글
          </div>
        </div>

        <div style={{
          padding: "20px",
          borderRadius: "12px",
          backgroundColor: darkMode ? "#333" : "#fff",
          boxShadow: `0 4px 16px ${darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"}`,
          textAlign: "center",
          cursor: "pointer",
          transition: "transform 0.2s ease",
          border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-5px)"}
        onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
        >
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>🎵</div>
          <div style={{ 
            fontSize: "24px", 
            fontWeight: "bold", 
            color: darkMode ? "#e0e0e0" : "#333",
            marginBottom: "5px"
          }}>
            {userStats.guestbookEntries || 0}
          </div>
          <div style={{ 
            fontSize: "14px", 
            color: darkMode ? "#aaa" : "#666"
          }}>
            방명록 글
          </div>
        </div>
      </div>

      {/* 컨텐츠 섹션 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: "20px"
      }}>
        {/* 최근 게시물 */}
        {recentRecordings.length > 0 && (
          <div style={{
            padding: "25px",
            borderRadius: "12px",
            backgroundColor: darkMode ? "#333" : "#fff",
            boxShadow: `0 4px 16px ${darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"}`,
            border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px"
            }}>
              <h2 style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: "bold",
                color: darkMode ? "#e0e0e0" : "#333"
              }}>
                📝 최근 게시물 ({recentRecordings.length})
              </h2>
              {recentRecordings.length > 3 && (
                <button
                  onClick={() => nav(`/user-recordings/${nickname}`)}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: darkMode ? "#7e57c2" : "#9c68e6",
                    color: "white",
                    border: "none",
                    borderRadius: "20px",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  전체 보기
                </button>
              )}
            </div>
            
            <div style={{
              display: "grid",
              gap: "15px"
            }}>
              {recentRecordings.slice(0, 3).map((post) => (
                <div 
                  key={post.id}
                  style={{
                    padding: "15px",
                    borderRadius: "8px",
                    backgroundColor: darkMode ? "#444" : "#f9f9f9",
                    border: `1px solid ${darkMode ? "#555" : "#e0e0e0"}`
                  }}
                >
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "10px"
                  }}>
                    <div style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: darkMode ? "#7e57c2" : "#bb86fc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px"
                    }}>
                      📝
                    </div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{
                        margin: "0 0 4px 0",
                        color: darkMode ? "#e0e0e0" : "#333",
                        fontSize: "16px"
                      }}>
                        {post.title}
                      </h4>
                      <div style={{
                        fontSize: "12px",
                        color: darkMode ? "#aaa" : "#666"
                      }}>
                        {formatDate(post.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 최근 방명록 */}
        {guestbookEntries.length > 0 && (
          <div style={{
            padding: "25px",
            borderRadius: "12px",
            backgroundColor: darkMode ? "#333" : "#fff",
            boxShadow: `0 4px 16px ${darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"}`,
            border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px"
            }}>
              <h2 style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: "bold",
                color: darkMode ? "#e0e0e0" : "#333"
              }}>
                📖 최근 방명록 ({guestbookEntries.length})
              </h2>
              <button
                onClick={() => nav(`/guestbook/${nickname}`)}
                style={{
                  padding: "8px 16px",
                  backgroundColor: darkMode ? "#4a90e2" : "#2196f3",
                  color: "white",
                  border: "none",
                  borderRadius: "20px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                전체 보기
              </button>
            </div>
            
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "15px"
            }}>
              {guestbookEntries.slice(0, 3).map((entry) => (
                <div 
                  key={entry.id}
                  style={{
                    padding: "15px",
                    borderRadius: "8px",
                    backgroundColor: darkMode ? "#444" : "#f9f9f9",
                    border: `1px solid ${darkMode ? "#555" : "#e0e0e0"}`
                  }}
                >
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "8px"
                  }}>
                    <img
                      src={globalProfilePics[entry.writer] || defaultAvatar}
                      alt={entry.writer}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        objectFit: "cover"
                      }}
                    />
                    <div>
                      <span style={{
                        fontWeight: "bold",
                        color: darkMode ? "#e0e0e0" : "#333",
                        fontSize: "14px"
                      }}>
                        {entry.writer}
                      </span>
                      <div style={{
                        fontSize: "12px",
                        color: darkMode ? "#aaa" : "#666"
                      }}>
                        {formatDate(entry.createdAt)}
                      </div>
                    </div>
                  </div>
                  <p style={{
                    margin: 0,
                    color: darkMode ? "#ccc" : "#555",
                    lineHeight: "1.5",
                    fontSize: "14px"
                  }}>
                    {entry.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

UserPage.propTypes = {
  darkMode: PropTypes.bool,
  globalProfilePics: PropTypes.object.isRequired,
  globalIntroductions: PropTypes.object.isRequired,
  globalGrades: PropTypes.object.isRequired,
  globalUserStats: PropTypes.object,
  isOwnProfile: PropTypes.bool,
  onFollowUser: PropTypes.func
};

UserPage.defaultProps = {
  darkMode: false,
  globalUserStats: {},
  isOwnProfile: false
};

export default UserPage;
