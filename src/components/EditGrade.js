import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, where, getDocs, doc, updateDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, purpleBtn
} from "../components/style";

// gradeEmojis 객체 - 새로운 등급 추가
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

// 등급 설명 - 개선된 설명
const gradeDescriptions = {
  "체리": "베리어스 세계에 첫 발을 내딛는 신입! 🌟 음악의 여정을 시작하는 따뜻한 단계입니다.",
  "블루베리": "기본기를 익히고 있는 단계! 💪 꾸준한 연습을 통해 실력을 쌓아가는 과정입니다.",
  "키위": "기본기가 안정화되기 시작한 단계! 🎵 음정과 박자 감각이 향상되고 있습니다.",
  "사과": "안정적인 실력을 갖춘 단계! 🎯 기본적인 곡들을 무리 없이 소화할 수 있는 수준입니다.",
  "멜론": "음악적 표현력이 늘어난 단계! 🎶 감정 전달과 기교적인 부분에서 성장이 보이는 수준입니다.",
  "수박": "뛰어난 실력의 소유자! 🏆 다양한 장르를 소화하며 커뮤니티에서 인정받는 실력파입니다.",
  "지구": "전문적인 수준의 실력! 🌍 높은 완성도와 안정감을 바탕으로 타인에게 도움을 줄 수 있는 수준입니다.",
  "토성": "마스터급 실력! 🪐 탁월한 음악 실력과 무대 경험으로 많은 이들에게 영감을 주는 수준입니다.",
  "태양": "최고 수준의 실력! ☀️ 모든 면에서 완성도가 높아 프로 수준에 근접한 최상위 등급입니다.",
  "은하": "부운영진 등급! 🌌 정당한 권한으로 피드백 제공이 가능하며, 커뮤니티 운영에 기여합니다.",
  "맥주": "친목 등급! 🍺 공연보다는 친목 중심으로 활동하는 인원들을 위한 특별한 등급입니다.",
  "번개": "래퍼 전용 등급! ⚡ 힙합과 랩에 특화된 실력을 가진 아티스트들을 위한 등급입니다.",
  "달": "버스킹 관람 후 팬으로 들어온 인원! 🌙 베리어스의 매력에 빠져 합류한 특별한 멤버들입니다.",
  "별": "세션 전용 등급! ⭐ 악기 연주와 세션 활동에 특화된 멤버들을 위한 전문 등급입니다."
};

function EditGrade({ darkMode }) {
  const [grade, setGrade] = useState("");
  const [currentGrade, setCurrentGrade] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);
  const [selectedGradeInfo, setSelectedGradeInfo] = useState(null);
  
  const navigate = useNavigate();
  const nick = localStorage.getItem("nickname");
  
  // 현재 등급 로드
  useEffect(() => {
    const fetchUserData = async () => {
      if (!nick) {
        navigate("/login", { state: { from: "/edit-grade" } });
        return;
      }
      
      try {
        setLoading(true);
        const q = query(collection(db, "users"), where("nickname", "==", nick));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setError("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
          setLoading(false);
          return;
        }
        
        const userData = snapshot.docs[0].data();
        const userDocId = snapshot.docs[0].id;
        
        setUserId(userDocId);
        
        // 현재 등급 설정
        const userGrade = userData.grade || "";
        setGrade(userGrade);
        setCurrentGrade(userGrade);
        
        if (userGrade && gradeDescriptions[userGrade]) {
          setSelectedGradeInfo({
            name: userGrade,
            emoji: gradeEmojis[userGrade],
            description: gradeDescriptions[userGrade]
          });
        }
        
        setLoading(false);
      } catch (err) {
        console.error("사용자 정보 로드 오류:", err);
        setError("사용자 정보를 불러오는 중 오류가 발생했습니다.");
        setLoading(false);
      }
    };
    
    fetchUserData();
  }, [nick, navigate]);
  
  // 등급 변경 핸들러
  const handleGradeChange = (e) => {
    const selectedGrade = e.target.value;
    setGrade(selectedGrade);
    
    if (selectedGrade && gradeDescriptions[selectedGrade]) {
      setSelectedGradeInfo({
        name: selectedGrade,
        emoji: gradeEmojis[selectedGrade],
        description: gradeDescriptions[selectedGrade]
      });
    } else {
      setSelectedGradeInfo(null);
    }
  };
  
  // 등급 저장
  const saveGrade = async () => {
    if (!userId) {
      setError("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
      return;
    }
    
    // 변경 사항이 없는 경우
    if (grade === currentGrade) {
      if (window.confirm("변경된 내용이 없습니다. 돌아가시겠습니까?")) {
        navigate("/mypage");
      }
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      
      // 등급 업데이트
      await updateDoc(doc(db, "users", userId), {
        grade: grade,
        updatedAt: serverTimestamp()
      });
      
      alert("등급이 성공적으로 저장되었습니다.");
      navigate("/mypage");
    } catch (err) {
      console.error("등급 저장 오류:", err);
      setError("등급 저장 중 오류가 발생했습니다. 다시 시도해주세요.");
      setSaving(false);
    }
  };
  
  // 취소 버튼 핸들러
  const handleCancel = () => {
    // 변경 사항이 있는 경우 확인
    if (grade !== currentGrade) {
      if (!window.confirm("변경 사항이 저장되지 않습니다. 정말 취소하시겠습니까?")) {
        return;
      }
    }
    
    navigate("/mypage");
  };
  
  // 카드 스타일
  const cardStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "8px",
    padding: "25px",
    maxWidth: "500px",
    width: "100%",
    margin: "0 auto",
    boxShadow: `0 2px 8px rgba(0, 0, 0, ${darkMode ? 0.3 : 0.1})`,
    border: `1px solid ${darkMode ? "#444" : "#eee"}`
  };
  
  // 등급 선택 항목 스타일
  const gradeOptionStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: "10px",
    marginTop: "20px",
    marginBottom: "20px"
  };
  
  // 등급 카드 스타일
  const getGradeCardStyle = (gradeName) => ({
    padding: "15px",
    borderRadius: "8px",
    cursor: "pointer",
    backgroundColor: grade === gradeName 
      ? (darkMode ? "#3a2a5a" : "#f3e7ff") 
      : (darkMode ? "#333" : "#f5f5f5"),
    border: `2px solid ${grade === gradeName 
      ? (darkMode ? "#7e57c2" : "#7e57c2") 
      : "transparent"}`,
    textAlign: "center",
    transition: "all 0.2s ease"
  });
  
  // 버튼 그룹 스타일
  const buttonGroupStyle = {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "20px"
  };
  
  // 등급 정보 카드 스타일
  const gradeInfoCardStyle = {
    padding: "20px",
    marginTop: "20px",
    borderRadius: "8px",
    backgroundColor: darkMode ? "#333" : "#f9f4ff",
    border: `1px solid ${darkMode ? "#513989" : "#d4c2ff"}`,
    animation: "fadeIn 0.3s ease"
  };
  
  // 등급 아이콘 스타일
  const gradeIconStyle = {
    fontSize: "28px",
    display: "block",
    marginBottom: "5px"
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      
      <h1 style={titleStyle}>🏆 등급 수정</h1>
      
      {/* 일반 오류 메시지 */}
      {error && (
        <div style={{ 
          padding: "12px", 
          backgroundColor: darkMode ? "rgba(244, 67, 54, 0.1)" : "#ffebee",
          color: "#f44336", 
          borderRadius: "4px", 
          marginBottom: "20px",
          textAlign: "center"
        }}>
          {error}
        </div>
      )}
      
      {/* 로딩 상태 */}
      {loading ? (
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
          <p>사용자 정보를 불러오는 중...</p>
        </div>
      ) : (
        <div style={cardStyle}>
          {/* 현재 등급 표시 */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ 
              display: "block", 
              marginBottom: "8px",
              color: darkMode ? "#bbb" : "#666",
              fontSize: "14px" 
            }}>
              현재 등급
            </label>
            <div style={{ 
              padding: "12px 15px",
              borderRadius: "6px",
              backgroundColor: darkMode ? "#333" : "#f5f5f5",
              fontSize: "16px",
              color: darkMode ? "#e0e0e0" : "#333",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px"
            }}>
              {currentGrade && gradeEmojis[currentGrade] ? (
                <>
                  <span style={{ fontSize: "24px" }}>{gradeEmojis[currentGrade]}</span>
                  <span style={{ fontWeight: "bold" }}>{currentGrade}</span>
                </>
              ) : (
                <span style={{ color: darkMode ? "#999" : "#999" }}>등급이 설정되지 않았습니다</span>
              )}
            </div>
          </div>
          
          {/* 등급 선택 */}
          <div>
            <label style={{ 
              display: "block", 
              marginBottom: "15px",
              color: darkMode ? "#e0e0e0" : "#333",
              fontWeight: "bold",
              fontSize: "16px"
            }}>
              등급 선택
            </label>
            
            {/* 드롭다운 선택 (모바일 친화적) */}
            <select 
              value={grade} 
              onChange={handleGradeChange} 
              style={{
                ...(darkMode ? darkInputStyle : inputStyle),
                width: "100%",
                padding: "12px",
                fontSize: "16px",
                marginBottom: "20px"
              }}
              disabled={saving}
            >
              <option value="">선택하세요</option>
              {Object.keys(gradeEmojis).map(k =>
                <option key={k} value={k}>{gradeEmojis[k]} {k}</option>
              )}
            </select>
            
            {/* 그리드 기반 시각적 선택 */}
            <div style={gradeOptionStyle}>
              {Object.keys(gradeEmojis).map(gradeName => (
                <div 
                  key={gradeName}
                  onClick={() => {
                    if (!saving) {
                      setGrade(gradeName);
                      setSelectedGradeInfo({
                        name: gradeName,
                        emoji: gradeEmojis[gradeName],
                        description: gradeDescriptions[gradeName]
                      });
                    }
                  }}
                  style={getGradeCardStyle(gradeName)}
                >
                  <span style={gradeIconStyle}>{gradeEmojis[gradeName]}</span>
                  <span style={{ 
                    fontSize: "14px",
                    fontWeight: "bold",
                    color: darkMode ? "#e0e0e0" : "#333"
                  }}>
                    {gradeName}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          {/* 선택된 등급 정보 */}
          {selectedGradeInfo && (
            <div style={gradeInfoCardStyle}>
              <div style={{ 
                display: "flex", 
                alignItems: "center",
                marginBottom: "10px",
                gap: "15px"
              }}>
                <span style={{ fontSize: "36px" }}>{selectedGradeInfo.emoji}</span>
                <div>
                  <h3 style={{ 
                    margin: "0 0 5px 0",
                    color: darkMode ? "#d4c2ff" : "#7e57c2",
                    fontSize: "18px"
                  }}>
                    {selectedGradeInfo.name}
                  </h3>
                  <p style={{ 
                    margin: 0,
                    fontSize: "14px",
                    color: darkMode ? "#e0e0e0" : "#333",
                    lineHeight: 1.5
                  }}>
                    {selectedGradeInfo.description}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* 등급 시스템 설명 */}
          <div style={{ 
            fontSize: "14px", 
            color: darkMode ? "#aaa" : "#777",
            padding: "15px",
            backgroundColor: darkMode ? "#333" : "#f5f5f5",
            borderRadius: "4px",
            marginTop: "20px",
            marginBottom: "20px",
            lineHeight: "1.6"
          }}>
            <p style={{ margin: "0 0 10px 0", fontWeight: "bold" }}>등급 시스템 안내</p>
            <p style={{ margin: "0 0 8px 0" }}>
              본 등급은 전문 수준의 실력 분류가 아닌,
            </p>
            <p style={{ margin: "0 0 8px 0" }}>
              취미로 노래를 즐기는 분들을 위한 재미 요소로 만들어진 등급 시스템입니다.
            </p>
            <p style={{ margin: "0 0 8px 0" }}>
              하지만 이 등급은 팀 운영에 있어 중요한 하나의 문화와 구성으로 자리 잡고 있기에,
            </p>
            <p style={{ margin: 0 }}>
              가볍게 받아들이시되 진지한 자세로 함께 참여해주시면 감사하겠습니다.
            </p>
          </div>
          
          {/* 버튼 영역 */}
          <div style={buttonGroupStyle}>
            <button 
              onClick={handleCancel}
              style={{
                padding: "10px 20px",
                backgroundColor: darkMode ? "#444" : "#e0e0e0",
                color: darkMode ? "#fff" : "#333",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "16px"
              }}
              disabled={saving}
              type="button"
            >
              취소
            </button>
            
            <button 
              onClick={saveGrade}
              style={{
                ...purpleBtn,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "120px",
                opacity: saving ? 0.7 : 1
              }}
              disabled={saving}
              type="button"
            >
              {saving ? (
                <>
                  <span style={{ 
                    display: "inline-block", 
                    width: "16px", 
                    height: "16px", 
                    border: "2px solid rgba(255, 255, 255, 0.3)", 
                    borderTop: "2px solid #fff", 
                    borderRadius: "50%", 
                    animation: "spin 1s linear infinite",
                    marginRight: "10px"
                  }}></span>
                  저장 중...
                </>
              ) : "저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

EditGrade.propTypes = {
  darkMode: PropTypes.bool
};

EditGrade.defaultProps = {
  darkMode: false
};

export default EditGrade;
