import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useGrades } from '../contexts/GradeContext';
import DEFAULT_AVATAR from '../assets/default-avatar.png';

function MemberList({ darkMode }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null);
  const navigate = useNavigate();
  
  // Context에서 등급 정보 가져오기
  const { grades: globalGrades, profilePics: globalProfilePics, introductions: globalIntroductions } = useGrades();

  // 등급명 → 이모지 매핑
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

  useEffect(() => {
    setLoading(true);
    
    // 실시간 리스너 설정
    const q = query(
      collection(db, "users"),
      orderBy("nickname", "asc"),
      limit(50) // 최대 50명까지
    );
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const memberList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).filter(member => member.nickname); // 닉네임이 있는 사용자만

        setMembers(memberList);
        setLoading(false);
        console.log("회원 목록 실시간 업데이트:", memberList.length, "명");
      },
      (error) => {
        console.error("회원 목록 로드 오류:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const displayedMembers = showAll ? members : members.slice(0, 12);

  const containerStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "20px",
    boxShadow: `0 4px 12px ${darkMode ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"}`,
    border: `1px solid ${darkMode ? "#444" : "#e0e0e0"}`
  };

  const headerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "15px",
    paddingBottom: "10px",
    borderBottom: `2px solid ${darkMode ? "#444" : "#f0f0f0"}`
  };

  const titleStyle = {
    color: darkMode ? "#bb86fc" : "#7e57c2",
    fontSize: "18px",
    fontWeight: "bold",
    margin: 0
  };

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "15px",
    marginBottom: "15px"
  };

  const memberCardStyle = {
    display: "flex",
    flexDirection: "column",
    padding: "16px",
    backgroundColor: darkMode ? "#333" : "#f9f9f9",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "all 0.3s ease",
    border: `1px solid ${darkMode ? "#555" : "#e8e8e8"}`,
    boxShadow: `0 2px 8px ${darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"}`,
    position: "relative"
  };

  const avatarStyle = {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    objectFit: "cover",
    marginRight: "12px",
    border: `2px solid ${darkMode ? "#555" : "#ddd"}`
  };

  const infoStyle = {
    flex: 1
  };

  const nicknameStyle = {
    fontWeight: "bold",
    color: darkMode ? "#e0e0e0" : "#333",
    marginBottom: "4px",
    fontSize: "14px"
  };

  const gradeStyle = {
    color: darkMode ? "#bb86fc" : "#7e57c2",
    fontSize: "12px",
    fontWeight: "500"
  };

  const buttonStyle = {
    padding: "8px 16px",
    backgroundColor: darkMode ? "#bb86fc" : "#7e57c2",
    color: darkMode ? "#000" : "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "bold",
    transition: "background-color 0.2s"
  };

  const handleMemberClick = (member, event) => {
    event.preventDefault();
    event.stopPropagation();
    
    // 바로 유저페이지로 이동
    navigate(`/userpage/${member.nickname}`);
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center", padding: "20px" }}>
          <div style={{ 
            width: "30px", 
            height: "30px", 
            border: `3px solid ${darkMode ? "#444" : "#f3f3f3"}`, 
            borderTop: `3px solid ${darkMode ? "#bb86fc" : "#7e57c2"}`, 
            borderRadius: "50%", 
            animation: "spin 1s linear infinite", 
            margin: "0 auto 10px" 
          }}></div>
          <p style={{ color: darkMode ? "#ccc" : "#666" }}>회원 목록을 불러오는 중...</p>
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
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>
          👥 베리어스 회원 목록 ({members.length}명)
        </h3>
        <button 
          onClick={() => setShowAll(!showAll)}
          style={buttonStyle}
        >
          {showAll ? "접기" : "전체보기"}
        </button>
      </div>

      <div style={gridStyle}>
        {displayedMembers.map((member) => {
          const userGrade = (globalGrades && member.nickname) ? (globalGrades[member.nickname] || member.grade) : member.grade;
          const gradeEmoji = userGrade ? gradeEmojis[userGrade] : null;
          
          return (
            <div
              key={member.id}
              style={{
                ...memberCardStyle,
                transform: hoveredCard === member.id ? "translateY(-4px)" : "translateY(0px)",
                boxShadow: hoveredCard === member.id 
                  ? "0 8px 20px rgba(126, 87, 194, 0.15)" 
                  : `0 2px 8px ${darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"}`,
                borderColor: hoveredCard === member.id 
                  ? (darkMode ? "#7e57c2" : "#9c68e6") 
                  : (darkMode ? "#555" : "#e8e8e8")
              }}
              onClick={(e) => handleMemberClick(member, e)}
              onMouseEnter={() => setHoveredCard(member.id)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
                <img
                  src={(globalProfilePics && member.nickname) ? (globalProfilePics[member.nickname] || DEFAULT_AVATAR) : DEFAULT_AVATAR}
                  alt={member.nickname || "사용자"}
                  style={{
                    width: "50px",
                    height: "50px",
                    borderRadius: "50%",
                    objectFit: "cover",
                    marginRight: "12px",
                    border: `2px solid ${darkMode ? "#555" : "#ddd"}`
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div 
                    className="member-nickname"
                    style={{
                      fontWeight: "bold",
                      color: darkMode ? "#e0e0e0" : "#333",
                      fontSize: "16px",
                      marginBottom: "4px"
                    }}
                  >
                    {member.nickname || "이름 없음"}
                  </div>
                  <div style={{
                    color: darkMode ? "#bb86fc" : "#7e57c2",
                    fontSize: "13px",
                    fontWeight: "500"
                  }}>
                    {gradeEmoji ? `${userGrade} ${gradeEmoji}` : "등급 미설정"}
                  </div>
                </div>
              </div>
              
              {/* 자기소개 */}
              <div style={{
                backgroundColor: darkMode ? "#2a2a2a" : "#f5f5f5",
                borderRadius: "8px",
                padding: "12px",
                fontSize: "13px",
                lineHeight: "1.4",
                color: darkMode ? "#ccc" : "#666",
                minHeight: "60px",
                display: "flex",
                alignItems: "center"
              }}>
                {(globalIntroductions && member.nickname) 
                  ? (globalIntroductions[member.nickname] || "작성된 소개가 없습니다.")
                  : "작성된 소개가 없습니다."
                }
              </div>
            </div>
          );
        })}
      </div>

      {members.length === 0 && (
        <div style={{ 
          textAlign: "center", 
          padding: "20px",
          color: darkMode ? "#888" : "#666"
        }}>
          등록된 회원이 없습니다.
        </div>
      )}
    </div>
  );
}

export default MemberList; 