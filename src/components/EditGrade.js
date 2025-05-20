import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, where, getDocs, doc, updateDoc
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, purpleBtn
} from "../components/style";

// gradeEmojis 객체 - 은하 추가
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
  "은하": "🌌"
};

// 등급 설명
const gradeDescriptions = {
  "체리": "초보 단계, 음악의 세계에 첫 발을 내딛는 신규 사용자",
  "블루베리": "기초 단계, 서비스에 적응하고 활동을 시작한 사용자",
  "키위": "활동 단계, 꾸준히 참여하며 음악 활동을 이어가는 사용자",
  "사과": "성장 단계, 다양한 음악 활동에 참여하는 활발한 사용자",
  "멜론": "발전 단계, 커뮤니티에서 인정받기 시작한 실력있는 사용자",
  "수박": "숙련 단계, 음악적 재능과 활동량이 풍부한 경험 많은 사용자",
  "지구": "전문 단계, 높은 수준의 음악 실력과 커뮤니티 기여도를 가진 사용자",
  "토성": "마스터 단계, 탁월한 음악 실력과 활동으로 주목받는 핵심 사용자",
  "태양": "최고 단계, 최상위 음악 실력과 영향력을 가진 사이트의 선도적 사용자",
  "은하": "전설 단계, 장기간 최고의 활동과 기여를 해온 전설적인 사용자"
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
        updatedAt: new Date()
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
            marginBottom: "20px"
          }}>
            <p style={{ margin: "0 0 10px 0", fontWeight: "bold" }}>등급 시스템 안내</p>
            <p style={{ margin: "0 0 10px 0" }}>
              등급은 사이트에서의 활동과 참여도를 나타내는 지표입니다.
              각 등급은 다른 사용자들에게 표시되며, 자신에게 맞는 등급을 선택해보세요.
            </p>
            <p style={{ margin: 0 }}>
              등급은 사용자가 직접 설정할 수 있으며, 사이트 활동에 따라 변경될 수 있습니다.
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
