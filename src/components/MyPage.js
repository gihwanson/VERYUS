import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import { collection, query, where, onSnapshot, deleteDoc, doc, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import { useGrades } from "../contexts/GradeContext";
import DEFAULT_AVATAR from "../assets/default-avatar.png"; // 기본 프로필 이미지 경로
import {
  containerStyle,
  darkContainerStyle,
  titleStyle,
  purpleBtn
} from "../components/style";

function MyPage({ 
  darkMode, 
  userStats = {} // 기본값 추가
}) {
  const navigate = useNavigate();
  const [nick, setNick] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserGrade, setCurrentUserGrade] = useState(""); // 현재 사용자 등급 상태 추가
  const [guestbookEntries, setGuestbookEntries] = useState([]);
  const [recordings, setRecordings] = useState([]);
  
  // Context에서 등급 정보 가져오기
  const { grades: globalGrades, profilePics: globalProfilePics, introductions: globalIntroductions } = useGrades();

  // 컴포넌트 마운트 시 로그인 체크
  useEffect(() => {
    const storedNickname = localStorage.getItem("nickname");
    if (storedNickname) {
      setNick(storedNickname);
      setIsLoggedIn(true);
    } else {
      // 로그인하지 않은 경우 로그인 페이지로 리다이렉트
      navigate("/login", { state: { from: "/mypage", message: "마이페이지는 로그인 후 이용 가능합니다." } });
    }
  }, [navigate]);

  // 현재 사용자의 등급 실시간 업데이트
  useEffect(() => {
    if (!nick) return;
    
    const q = query(collection(db, "users"), where("nickname", "==", nick));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data();
        setCurrentUserGrade(userData.grade || "");
        console.log("마이페이지 등급 업데이트:", userData.grade);
      }
    }, (error) => {
      console.error("사용자 등급 정보 조회 오류:", error);
    });
    
    return () => unsubscribe();
  }, [nick]);

  // 방명록 실시간 로드
  useEffect(() => {
    if (!nick) return;
    
    const q = query(
      collection(db, `guestbook-${nick}`),
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
  }, [nick]);

  // 녹음 파일 실시간 로드
  useEffect(() => {
    if (!nick) return;
    
    console.log("마이페이지 녹음 파일 로드 시작:", nick);
    
    // 인덱스 오류를 피하기 위해 단순 쿼리 사용
    const q = query(
      collection(db, "mypage_recordings"),
      where("uploaderNickname", "==", nick)
    );
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const recordingList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // 클라이언트 사이드에서 날짜순 정렬
        recordingList.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
            return b.createdAt.seconds - a.createdAt.seconds;
          }
          return 0;
        });
        
        console.log("마이페이지 녹음 파일 로드 완료:", recordingList.length, "개");
        setRecordings(recordingList);
      },
      (error) => {
        console.error("녹음 파일 로드 오류:", error);
        // 에러가 발생해도 빈 배열로 설정하여 UI가 깨지지 않도록 함
        setRecordings([]);
      }
    );
    
    return () => unsubscribe();
  }, [nick]);

  // 방명록 작성 (자신의 방명록에는 작성 불가)
  const addGuestbookEntry = async () => {
    alert("자신의 방명록에는 글을 작성할 수 없습니다.");
  };

  // 방명록 삭제 (방명록 주인이므로 모든 글 삭제 가능)
  const deleteGuestbookEntry = async (entryId) => {
    if (!window.confirm("이 방명록을 삭제하시겠습니까?")) return;
    
    try {
      await deleteDoc(doc(db, `guestbook-${nick}`, entryId));
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

  // ✅ 이모지 → 등급명 매핑
  const gradeNames = {
    "🍒": "체리",
    "🫐": "블루베리",
    "🥝": "키위",
    "🍎": "사과",
    "🍈": "멜론",
    "🍉": "수박",
    "🌏": "지구",
    "🪐": "토성",
    "🌞": "태양",
    "🌌": "은하",
    "🍺": "맥주",
    "⚡": "번개",
    "🌙": "달",
    "⭐": "별"
  };

  // 등급명 → 이모지 매핑 (역방향)
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

  const userGrade = currentUserGrade || globalGrades[nick] || "";
  const gradeEmoji = gradeEmojis[userGrade];
  const gradeName = userGrade;
  
  // 기본 유저 통계
  const { postCount = 0, commentCount = 0, likesReceived = 0, visitorCount = guestbookEntries.length } = userStats[nick] || {};
  
  // 회원 탈퇴 확인 핸들러
  const handleDeleteAccount = () => {
    setShowDeleteConfirm(true);
  };
  
  // 회원 탈퇴 취소 핸들러
  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };
  
  // 회원 탈퇴 확정 핸들러
  const handleConfirmDelete = () => {
    // 실제 회원 탈퇴 로직은 해당 페이지에서 처리
    navigate("/delete-account");
  };
  
  // 탭 데이터
  const tabs = [
    { icon: "👤", label: "프로필 관리", color: "#7e57c2" },
    { icon: "🔒", label: "계정 설정", color: "#5e35b1" },
    { icon: "📊", label: "활동 내역", color: "#3949ab" },
    { icon: "🎤", label: "내 녹음", color: "#8e24aa" },
    { icon: "📖", label: "방명록", color: "#8e24aa" },
  ];
  
  // 현재 선택된 탭
  const [selectedTab, setSelectedTab] = useState(0);
  
  // 카드 스타일
  const cardStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "8px",
    padding: "20px",
    marginBottom: "20px",
    boxShadow: `0 2px 8px ${darkMode ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"}`,
    transition: "all 0.3s ease"
  };
  
  // 통계 카드 스타일
  const statCardStyle = {
    padding: "15px",
    borderRadius: "8px",
    textAlign: "center",
    backgroundColor: darkMode ? "#3a2a5a" : "#f3e7ff",
    border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`,
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    cursor: "pointer",
    "&:hover": {
      transform: "translateY(-5px)"
    }
  };
  
  // 버튼 그룹 스타일
  const buttonGroupStyle = {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    marginTop: 20
  };
  
  // 녹음 파일 삭제
  const deleteRecording = async (recordingId, fileName) => {
    if (!window.confirm("이 녹음 파일을 삭제하시겠습니까?")) return;
    
    try {
      // Firestore에서 문서 삭제
      await deleteDoc(doc(db, "mypage_recordings", recordingId));
      alert("녹음 파일이 삭제되었습니다.");
    } catch (error) {
      console.error("녹음 파일 삭제 오류:", error);
      alert("녹음 파일 삭제 중 오류가 발생했습니다.");
    }
  };
  
  // 로딩 중이거나 로그인하지 않은 경우
  if (!isLoggedIn) {
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
          <p>로그인 정보를 확인하는 중...</p>
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
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <div style={{ 
        display: "flex", 
        flexDirection: "column",
        maxWidth: "100%", 
        margin: "0", 
        padding: "0"
      }}>
        {/* 프로필 헤더 */}
        <div style={{
          ...cardStyle,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "30px",
          position: "relative",
          marginBottom: "30px",
          background: darkMode ? 
            "linear-gradient(135deg, #2a1b3d 0%, #3a2a5a 100%)" : 
            "linear-gradient(135deg, #f3e7ff 0%, #e8daff 100%)"
        }}>
          <img
            src={globalProfilePics[nick] || DEFAULT_AVATAR}
            alt="프로필"
            style={{
              width: 120,
              height: 120,
              objectFit: "cover",
              borderRadius: "50%",
              border: `3px solid ${darkMode ? "#7e57c2" : "#7e57c2"}`,
              boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
              marginBottom: "15px"
            }}
          />
          
          <h1 style={{
            ...titleStyle,
            marginBottom: "5px",
            fontSize: "28px",
            color: darkMode ? "#e0e0e0" : "#333"
          }}>
            {nick}님의 마이페이지
          </h1>
          
          <div style={{
            display: "inline-block",
            padding: "4px 12px",
            backgroundColor: darkMode ? "rgba(126, 87, 194, 0.3)" : "rgba(126, 87, 194, 0.1)",
            borderRadius: "20px",
            color: darkMode ? "#d4c2ff" : "#7e57c2",
            marginBottom: "15px",
            fontSize: "14px",
            fontWeight: "bold"
          }}>
            {gradeEmoji ? `${gradeName} ${gradeEmoji}` : "등급 미설정"}
          </div>
          
          <p style={{
            margin: "5px 0 15px",
            color: darkMode ? "#bbb" : "#666",
            maxWidth: "600px",
            lineHeight: "1.5"
          }}>
            {globalIntroductions[nick] || "작성된 자기소개가 없습니다. '자기소개 수정' 버튼을 눌러 자기소개를 작성해보세요!"}
          </p>
          
          {/* 통계 요약 */}
          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: "20px",
            marginTop: "10px",
            flexWrap: "wrap"
          }}>
            <div 
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: "8px",
                transition: "background-color 0.2s ease"
              }}
              onClick={() => navigate("/my-posts")}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? "rgba(126, 87, 194, 0.1)" : "rgba(126, 87, 194, 0.05)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <div style={{ fontWeight: "bold", fontSize: "18px", color: darkMode ? "#e0e0e0" : "#333" }}>{postCount}</div>
              <div style={{ fontSize: "14px", color: darkMode ? "#aaa" : "#666" }}>게시물</div>
            </div>
            <div 
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: "8px",
                transition: "background-color 0.2s ease"
              }}
              onClick={() => navigate("/my-comments")}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? "rgba(126, 87, 194, 0.1)" : "rgba(126, 87, 194, 0.05)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <div style={{ fontWeight: "bold", fontSize: "18px", color: darkMode ? "#e0e0e0" : "#333" }}>{commentCount}</div>
              <div style={{ fontSize: "14px", color: darkMode ? "#aaa" : "#666" }}>댓글</div>
            </div>
            <div 
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: "8px",
                transition: "background-color 0.2s ease"
              }}
              onClick={() => navigate("/my-likes")}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? "rgba(126, 87, 194, 0.1)" : "rgba(126, 87, 194, 0.05)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <div style={{ fontWeight: "bold", fontSize: "18px", color: darkMode ? "#e0e0e0" : "#333" }}>{likesReceived}</div>
              <div style={{ fontSize: "14px", color: darkMode ? "#aaa" : "#666" }}>받은 좋아요</div>
            </div>
            <div 
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: "8px",
                transition: "background-color 0.2s ease"
              }}
              onClick={() => setSelectedTab(4)}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? "rgba(126, 87, 194, 0.1)" : "rgba(126, 87, 194, 0.05)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <div style={{ fontWeight: "bold", fontSize: "18px", color: darkMode ? "#e0e0e0" : "#333" }}>{visitorCount}</div>
              <div style={{ fontSize: "14px", color: darkMode ? "#aaa" : "#666" }}>방문자</div>
            </div>
          </div>
          
          {/* 빠른 액션 버튼 */}
          <div style={{
            display: "flex",
            gap: "10px",
            marginTop: "20px",
            flexWrap: "wrap",
            justifyContent: "center"
          }}>
            <button 
              onClick={() => navigate("/edit-profilepic")} 
              style={{
                padding: "8px 16px",
                backgroundColor: darkMode ? "#444" : "#f0f0f0",
                color: darkMode ? "#e0e0e0" : "#333",
                border: "none",
                borderRadius: "20px",
                cursor: "pointer",
                fontSize: "14px",
                transition: "background-color 0.2s"
              }}
            >
              📷 프로필 변경
            </button>
            <button 
              onClick={() => setSelectedTab(4)}
              style={{
                padding: "8px 16px",
                backgroundColor: darkMode ? "#444" : "#f0f0f0",
                color: darkMode ? "#e0e0e0" : "#333",
                border: "none",
                borderRadius: "20px",
                cursor: "pointer",
                fontSize: "14px",
                transition: "background-color 0.2s"
              }}
            >
              📖 방명록
            </button>
            <button 
              onClick={() => navigate("/edit-introduction")} 
              style={{
                padding: "8px 16px",
                backgroundColor: darkMode ? "#444" : "#f0f0f0",
                color: darkMode ? "#e0e0e0" : "#333",
                border: "none",
                borderRadius: "20px",
                cursor: "pointer",
                fontSize: "14px",
                transition: "background-color 0.2s"
              }}
            >
              ✏️ 소개 수정
            </button>
            <button 
              onClick={() => navigate("/upload-recording", { state: { from: "mypage" } })} 
              style={{
                padding: "8px 16px",
                backgroundColor: darkMode ? "#7e57c2" : "#9c68e6",
                color: "white",
                border: "none",
                borderRadius: "20px",
                cursor: "pointer",
                fontSize: "14px",
                transition: "background-color 0.2s"
              }}
            >
              🎤 녹음 올리기
            </button>
          </div>
        </div>
        
        {/* 탭 네비게이션 */}
        <div style={{
          display: "flex",
          marginBottom: "20px",
          borderRadius: "8px",
          overflow: "hidden",
          backgroundColor: darkMode ? "#333" : "#f0f0f0"
        }}>
          {tabs.map((tab, index) => (
            <button
              key={index}
              onClick={() => setSelectedTab(index)}
              style={{
                flex: 1,
                padding: "12px",
                border: "none",
                backgroundColor: selectedTab === index 
                  ? (darkMode ? tab.color : tab.color) 
                  : (darkMode ? "#333" : "#f0f0f0"),
                color: selectedTab === index ? "#fff" : (darkMode ? "#ccc" : "#666"),
                cursor: "pointer",
                transition: "all 0.3s ease",
                fontSize: "15px",
                fontWeight: selectedTab === index ? "bold" : "normal"
              }}
            >
              <span style={{ marginRight: "8px" }}>{tab.icon}</span>
              {tab.label}
              {index === 3 && ` (${recordings.length})`}
              {index === 4 && ` (${guestbookEntries.length})`}
            </button>
          ))}
        </div>
        
        {/* 탭 콘텐츠 */}
        <div style={{ minHeight: "300px" }}>
          {/* 프로필 관리 탭 */}
          {selectedTab === 0 && (
            <div style={{ animation: "fadeIn 0.5s" }}>
              <div style={cardStyle}>
                <h2 style={{ 
                  color: darkMode ? "#d4c2ff" : "#7e57c2",
                  margin: "0 0 20px 0",
                  fontSize: "20px"
                }}>
                  프로필 정보 관리
                </h2>
                <div style={buttonGroupStyle}>
                  <button onClick={() => navigate("/edit-profilepic")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      📷
                    </span>
                    프로필사진 변경
                  </button>
                  <button onClick={() => navigate("/edit-introduction")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      ✏️
                    </span>
                    자기소개 수정
                  </button>
                  <button onClick={() => navigate("/edit-grade")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      🏆
                    </span>
                    등급 수정
                  </button>
                  <button onClick={() => setSelectedTab(4)} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      📖
                    </span>
                    내 방명록
                  </button>
                  <button onClick={() => navigate("/upload-recording", { state: { from: "mypage" } })} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      🎤
                    </span>
                    녹음 올리기
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* 계정 설정 탭 */}
          {selectedTab === 1 && (
            <div style={{ animation: "fadeIn 0.5s" }}>
              <div style={cardStyle}>
                <h2 style={{ 
                  color: darkMode ? "#d4c2ff" : "#7e57c2",
                  margin: "0 0 20px 0",
                  fontSize: "20px"
                }}>
                  계정 설정
                </h2>
                <div style={buttonGroupStyle}>
                  <button onClick={() => navigate("/edit-nickname")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      👤
                    </span>
                    닉네임 변경
                  </button>
                  <button onClick={() => navigate("/edit-password")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      🔒
                    </span>
                    비밀번호 변경
                  </button>
                  <button onClick={() => navigate("/notification")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      🔔
                    </span>
                    알림 설정
                  </button>
                  <button onClick={handleDeleteAccount} style={{
                    ...purpleBtn,
                    background: darkMode ? "#d32f2f" : "#f44336",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(244, 67, 54, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      ⚠️
                    </span>
                    회원 탈퇴
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* 활동 내역 탭 */}
          {selectedTab === 2 && (
            <div style={{ animation: "fadeIn 0.5s" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "15px",
                marginBottom: "25px"
              }}>
                <div 
                  style={statCardStyle}
                  onClick={() => navigate("/my-posts")}
                  onKeyDown={(e) => e.key === 'Enter' && navigate("/my-posts")}
                  tabIndex="0"
                  role="button"
                  aria-label="내가 작성한 게시물 보기"
                >
                  <div style={{ fontSize: "28px", marginBottom: "5px" }}>📝</div>
                  <div style={{ 
                    fontSize: "24px", 
                    fontWeight: "bold", 
                    color: darkMode ? "#e0e0e0" : "#333"
                  }}>
                    {postCount}
                  </div>
                  <div style={{ 
                    fontSize: "14px", 
                    color: darkMode ? "#aaa" : "#666"
                  }}>
                    작성한 게시물
                  </div>
                </div>
                
                <div 
                  style={statCardStyle}
                  onClick={() => navigate("/my-comments")}
                  onKeyDown={(e) => e.key === 'Enter' && navigate("/my-comments")}
                  tabIndex="0"
                  role="button"
                  aria-label="내가 작성한 댓글 보기"
                >
                  <div style={{ fontSize: "28px", marginBottom: "5px" }}>💬</div>
                  <div style={{ 
                    fontSize: "24px", 
                    fontWeight: "bold", 
                    color: darkMode ? "#e0e0e0" : "#333"
                  }}>
                    {commentCount}
                  </div>
                  <div style={{ 
                    fontSize: "14px", 
                    color: darkMode ? "#aaa" : "#666"
                  }}>
                    작성한 댓글
                  </div>
                </div>
                
                <div 
                  style={statCardStyle}
                >
                  <div style={{ fontSize: "28px", marginBottom: "5px" }}>❤️</div>
                  <div style={{ 
                    fontSize: "24px", 
                    fontWeight: "bold", 
                    color: darkMode ? "#e0e0e0" : "#333"
                  }}>
                    {likesReceived}
                  </div>
                  <div style={{ 
                    fontSize: "14px", 
                    color: darkMode ? "#aaa" : "#666"
                  }}>
                    받은 좋아요
                  </div>
                </div>
                
                <div 
                  style={statCardStyle}
                  onClick={() => setSelectedTab(4)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedTab(4)}
                  tabIndex="0"
                  role="button"
                  aria-label="내 방명록 보기"
                >
                  <div style={{ fontSize: "28px", marginBottom: "5px" }}>👥</div>
                  <div style={{ 
                    fontSize: "24px", 
                    fontWeight: "bold", 
                    color: darkMode ? "#e0e0e0" : "#333"
                  }}>
                    {visitorCount}
                  </div>
                  <div style={{ 
                    fontSize: "14px", 
                    color: darkMode ? "#aaa" : "#666"
                  }}>
                    방명록 방문자
                  </div>
                </div>
              </div>
              
              <div style={cardStyle}>
                <h2 style={{ 
                  color: darkMode ? "#d4c2ff" : "#7e57c2",
                  margin: "0 0 20px 0",
                  fontSize: "20px"
                }}>
                  내 활동
                </h2>
                <div style={buttonGroupStyle}>
                  <button onClick={() => navigate("/my-posts")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      📝
                    </span>
                    내가 쓴 글
                  </button>
                  <button onClick={() => navigate("/my-comments")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      💬
                    </span>
                    내가 쓴 댓글
                  </button>
                  <button onClick={() => navigate("/my-likes")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      ❤️
                    </span>
                    좋아요한 글
                  </button>
                  <button onClick={() => navigate("/popular")} style={{
                    ...purpleBtn,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    padding: "12px 15px"
                  }}>
                    <span style={{ 
                      backgroundColor: "rgba(126, 87, 194, 0.2)", 
                      width: "36px", 
                      height: "36px", 
                      borderRadius: "50%", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      marginRight: "12px"
                    }}>
                      🔥
                    </span>
                    인기글
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 내 녹음 탭 */}
          {selectedTab === 3 && (
            <div style={{ animation: "fadeIn 0.5s" }}>
              <div style={cardStyle}>
                <h2 style={{ 
                  color: darkMode ? "#d4c2ff" : "#7e57c2",
                  margin: "0 0 20px 0",
                  fontSize: "20px"
                }}>
                  🎤 내 녹음 ({recordings.length})
                </h2>
                
                <div style={{
                  backgroundColor: darkMode ? "#3a2a5a" : "#f8f4ff",
                  padding: "15px",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  textAlign: "center"
                }}>
                  <p style={{ 
                    margin: 0, 
                    color: darkMode ? "#bb86fc" : "#7e57c2",
                    fontSize: "14px"
                  }}>
                    🎵 내가 업로드한 녹음 파일들을 관리하고 다른 사용자들과 공유할 수 있습니다.
                  </p>
                </div>

                <div style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: "20px"
                }}>
                  <button 
                    onClick={() => navigate("/upload-recording", { state: { from: "mypage" } })} 
                    style={{
                      ...purpleBtn,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    🎤 새 녹음 올리기
                  </button>
                </div>

                {recordings.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {recordings.map((recording) => (
                      <div 
                        key={recording.id}
                        style={{
                          backgroundColor: darkMode ? "#333" : "#f9f9f9",
                          borderRadius: "12px",
                          padding: "20px",
                          border: `1px solid ${darkMode ? "#555" : "#e0e0e0"}`,
                          boxShadow: `0 2px 8px ${darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"}`
                        }}
                      >
                        <div style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "15px",
                          marginBottom: "15px"
                        }}>
                          <div style={{
                            width: "60px",
                            height: "60px",
                            borderRadius: "50%",
                            backgroundColor: darkMode ? "#7e57c2" : "#bb86fc",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "24px",
                            flexShrink: 0
                          }}>
                            🎵
                          </div>
                          
                          <div style={{ flex: 1 }}>
                            <h3 style={{
                              margin: "0 0 8px 0",
                              color: darkMode ? "#e0e0e0" : "#333",
                              fontSize: "18px",
                              fontWeight: "bold"
                            }}>
                              {recording.title}
                            </h3>
                            
                            {recording.description && (
                              <p style={{
                                margin: "0 0 12px 0",
                                color: darkMode ? "#ccc" : "#666",
                                fontSize: "14px",
                                lineHeight: "1.5"
                              }}>
                                {recording.description}
                              </p>
                            )}
                            
                            <div style={{
                              display: "flex",
                              gap: "15px",
                              fontSize: "12px",
                              color: darkMode ? "#aaa" : "#888"
                            }}>
                              <span>📁 {recording.fileName}</span>
                              <span>📏 {(recording.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                              <span>📅 {formatDate(recording.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* 오디오 플레이어 추가 */}
                        <div style={{
                          backgroundColor: darkMode ? "#2a2a2a" : "#f5f5f5",
                          padding: "15px",
                          borderRadius: "8px",
                          marginBottom: "15px"
                        }}>
                          <audio 
                            controls 
                            style={{ 
                              width: "100%",
                              outline: "none"
                            }}
                            preload="metadata"
                          >
                            <source src={recording.recordingURL || recording.downloadURL} type="audio/mpeg" />
                            <source src={recording.recordingURL || recording.downloadURL} type="audio/wav" />
                            <source src={recording.recordingURL || recording.downloadURL} type="audio/ogg" />
                            브라우저가 오디오 재생을 지원하지 않습니다.
                          </audio>
                        </div>
                        
                        <div style={{
                          display: "flex",
                          gap: "10px",
                          flexWrap: "wrap",
                          marginBottom: "15px"
                        }}>
                          <a
                            href={recording.recordingURL || recording.downloadURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: "8px 16px",
                              backgroundColor: darkMode ? "#7e57c2" : "#7e57c2",
                              color: "white",
                              textDecoration: "none",
                              borderRadius: "6px",
                              fontSize: "14px",
                              display: "flex",
                              alignItems: "center",
                              gap: "5px"
                            }}
                          >
                            ▶️ 재생하기
                          </a>
                          
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(recording.recordingURL || recording.downloadURL);
                              alert("링크가 복사되었습니다!");
                            }}
                            style={{
                              padding: "8px 16px",
                              backgroundColor: darkMode ? "#555" : "#e0e0e0",
                              color: darkMode ? "#e0e0e0" : "#333",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "14px"
                            }}
                          >
                            🔗 링크 복사
                          </button>
                          
                          <button
                            onClick={() => navigate(`/recording-comments/${recording.id}`)}
                            style={{
                              padding: "8px 16px",
                              backgroundColor: darkMode ? "#4a90e2" : "#2196f3",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "14px",
                              display: "flex",
                              alignItems: "center",
                              gap: "5px"
                            }}
                          >
                            💬 댓글 ({recording.commentCount || 0})
                          </button>
                          
                          <button
                            onClick={() => deleteRecording(recording.id, recording.fileName)}
                            style={{
                              padding: "8px 16px",
                              backgroundColor: "#f44336",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "14px",
                              display: "flex",
                              alignItems: "center",
                              gap: "5px"
                            }}
                          >
                            🗑️ 삭제
                          </button>

                          <div style={{
                            marginLeft: "auto",
                            display: "flex",
                            gap: "10px",
                            alignItems: "center",
                            fontSize: "12px",
                            color: darkMode ? "#aaa" : "#666"
                          }}>
                            <span>❤️ {recording.likes || 0}</span>
                            <span>📥 {recording.downloads || 0}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: "center", 
                    padding: "60px 20px",
                    color: darkMode ? "#aaa" : "#666"
                  }}>
                    <div style={{ fontSize: "64px", marginBottom: "20px" }}>🎤</div>
                    <h3 style={{ 
                      margin: "0 0 10px 0",
                      color: darkMode ? "#ccc" : "#555"
                    }}>
                      아직 녹음 파일이 없습니다
                    </h3>
                    <p style={{ fontSize: "14px", marginBottom: "20px" }}>
                      첫 번째 녹음을 업로드해서 다른 사용자들과 공유해보세요!
                    </p>
                    <button 
                      onClick={() => navigate("/upload-recording", { state: { from: "mypage" } })} 
                      style={{
                        ...purpleBtn,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px"
                      }}
                    >
                      🎤 첫 녹음 올리기
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 방명록 탭 */}
          {selectedTab === 4 && (
            <div style={{ animation: "fadeIn 0.5s" }}>
              <div style={cardStyle}>
                <h2 style={{ 
                  color: darkMode ? "#d4c2ff" : "#7e57c2",
                  margin: "0 0 20px 0",
                  fontSize: "20px"
                }}>
                  📖 내 방명록 ({guestbookEntries.length})
                </h2>
                
                <div style={{
                  backgroundColor: darkMode ? "#3a2a5a" : "#f8f4ff",
                  padding: "15px",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  textAlign: "center"
                }}>
                  <p style={{ 
                    margin: 0, 
                    color: darkMode ? "#bb86fc" : "#7e57c2",
                    fontSize: "14px"
                  }}>
                    💡 방명록 주인은 자신의 방명록에 글을 작성할 수 없지만, 모든 글을 관리할 수 있습니다.
                  </p>
                </div>

                {guestbookEntries.length > 0 ? (
                  <div>
                    {guestbookEntries.map((entry, index) => (
                      <div 
                        key={entry.id} 
                        style={{ 
                          padding: "15px 0", 
                          borderBottom: index < guestbookEntries.length - 1 ? `1px solid ${darkMode ? "#444" : "#eee"}` : "none"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ 
                              display: "flex", 
                              alignItems: "center", 
                              marginBottom: "8px",
                              gap: "8px"
                            }}>
                              <img
                                src={globalProfilePics[entry.writer] || DEFAULT_AVATAR}
                                alt={entry.writer}
                                style={{
                                  width: "30px",
                                  height: "30px",
                                  borderRadius: "50%",
                                  objectFit: "cover"
                                }}
                              />
                              <div>
                                <span style={{ 
                                  fontWeight: "bold",
                                  color: darkMode ? "#e0e0e0" : "#333"
                                }}>
                                  {entry.writer}
                                </span>
                              </div>
                            </div>
                            
                            <div style={{ 
                              marginBottom: "8px",
                              color: darkMode ? "#e0e0e0" : "#333",
                              lineHeight: "1.5"
                            }}>
                              {entry.text}
                            </div>
                            
                            <div style={{ 
                              fontSize: "12px", 
                              color: darkMode ? "#aaa" : "#666" 
                            }}>
                              {formatDate(entry.createdAt)}
                            </div>
                          </div>
                          
                          <button
                            onClick={() => deleteGuestbookEntry(entry.id)}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#f44336",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "12px"
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: "center", 
                    padding: "40px",
                    color: darkMode ? "#aaa" : "#666"
                  }}>
                    <div style={{ fontSize: "48px", marginBottom: "15px" }}>📝</div>
                    <p>아직 방명록이 없습니다.</p>
                    <p style={{ fontSize: "14px" }}>다른 사용자들이 방명록을 작성해주기를 기다려보세요!</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* 회원 탈퇴 확인 모달 */}
        {showDeleteConfirm && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000
          }}>
            <div style={{
              width: "90%",
              maxWidth: "400px",
              backgroundColor: darkMode ? "#333" : "#fff",
              borderRadius: "8px",
              padding: "20px",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)"
            }}>
              <h3 style={{ 
                color: "#f44336", 
                margin: "0 0 15px 0" 
              }}>
                ⚠️ 회원 탈퇴 확인
              </h3>
              <p style={{ 
                marginBottom: "20px",
                lineHeight: "1.5",
                color: darkMode ? "#e0e0e0" : "#333"
              }}>
                정말로 회원 탈퇴를 진행하시겠습니까? 탈퇴하시면 모든 개인정보와 작성한 게시물, 댓글 등이 삭제될 수 있으며 이 작업은 되돌릴 수 없습니다.
              </p>
              <div style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px"
              }}>
                <button 
                  onClick={handleCancelDelete}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: darkMode ? "#555" : "#e0e0e0",
                    color: darkMode ? "#fff" : "#333",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  취소
                </button>
                <button 
                  onClick={handleConfirmDelete}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#f44336",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  탈퇴하기
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* 애니메이션 스타일 */}
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}

MyPage.propTypes = {
  darkMode: PropTypes.bool,
  userStats: PropTypes.object
};

MyPage.defaultProps = {
  darkMode: false,
  userStats: {}
};

export default MyPage;
