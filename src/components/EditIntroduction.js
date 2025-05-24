import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, where, getDocs, doc, updateDoc, getDoc
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, darkInputStyle, textareaStyle, purpleBtn
} from "../components/style";

function EditIntroduction({ darkMode }) {
  const [introduction, setIntroduction] = useState("");
  const [originalIntroduction, setOriginalIntroduction] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);
  const [charCount, setCharCount] = useState(0);
  
  const navigate = useNavigate();
  const nick = localStorage.getItem("nickname");
  const MAX_CHAR_COUNT = 500; // 최대 글자 수 제한
  
  // 현재 자기소개 로드
  useEffect(() => {
    const fetchUserData = async () => {
      if (!nick) {
        navigate("/login", { state: { from: "/edit-introduction" } });
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
        
        // 현재 자기소개 설정
        const currentIntro = userData.introduction || "";
        setIntroduction(currentIntro);
        setOriginalIntroduction(currentIntro);
        setCharCount(currentIntro.length);
        
        setLoading(false);
      } catch (err) {
        console.error("사용자 정보 로드 오류:", err);
        setError("사용자 정보를 불러오는 중 오류가 발생했습니다.");
        setLoading(false);
      }
    };
    
    fetchUserData();
  }, [nick, navigate]);
  
  // 자기소개 입력 변경 핸들러
  const handleIntroductionChange = (e) => {
    const value = e.target.value;
    
    // 최대 글자 수 제한
    if (value.length <= MAX_CHAR_COUNT) {
      setIntroduction(value);
      setCharCount(value.length);
    }
  };
  
  // 자기소개 저장
  const saveIntroduction = async () => {
    if (!userId) {
      setError("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
      return;
    }
    
    // 변경 사항이 없는 경우
    if (introduction === originalIntroduction) {
      if (window.confirm("변경된 내용이 없습니다. 돌아가시겠습니까?")) {
        navigate("/mypage");
      }
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      
      // 자기소개 업데이트
      await updateDoc(doc(db, "users", userId), {
        introduction: introduction,
        updatedAt: new Date()
      });
      
      alert("자기소개가 성공적으로 저장되었습니다.");
      navigate("/mypage");
    } catch (err) {
      console.error("자기소개 저장 오류:", err);
      setError("자기소개 저장 중 오류가 발생했습니다. 다시 시도해주세요.");
      setSaving(false);
    }
  };
  
  // 취소 버튼 핸들러
  const handleCancel = () => {
    // 변경 사항이 있는 경우 확인
    if (introduction !== originalIntroduction) {
      if (!window.confirm("변경 사항이 저장되지 않습니다. 정말 취소하시겠습니까?")) {
        return;
      }
    }
    
    navigate("/mypage");
  };
  
  // 자기소개 예시 추가
  const addExample = (example) => {
    // 최대 글자 수 체크
    if ((introduction + example).length <= MAX_CHAR_COUNT) {
      const newIntroduction = introduction + example;
      setIntroduction(newIntroduction);
      setCharCount(newIntroduction.length);
    } else {
      alert(`최대 ${MAX_CHAR_COUNT}자까지 입력 가능합니다.`);
    }
  };
  
  // 카드 스타일
  const cardStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "8px",
    padding: "25px",
    maxWidth: "600px",
    width: "100%",
    margin: "0 auto",
    boxShadow: `0 2px 8px rgba(0, 0, 0, ${darkMode ? 0.3 : 0.1})`,
    border: `1px solid ${darkMode ? "#444" : "#eee"}`,
    boxSizing: "border-box",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    // 모바일 반응형
    "@media (max-width: 768px)": {
      padding: "15px",
      margin: "0 10px"
    }
  };
  
  // 글자 수 스타일
  const getCharCountStyle = () => ({
    textAlign: "right",
    fontSize: "14px",
    marginTop: "8px",
    color: charCount > MAX_CHAR_COUNT * 0.8 
      ? (charCount > MAX_CHAR_COUNT * 0.95 ? "#f44336" : "#ff9800") 
      : (darkMode ? "#bbb" : "#666")
  });
  
  // 버튼 그룹 스타일
  const buttonGroupStyle = {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "20px",
    gap: "10px",
    // 모바일 반응형
    "@media (max-width: 768px)": {
      flexDirection: "column",
      gap: "15px"
    }
  };
  
  // 예시 버튼 스타일
  const exampleButtonStyle = {
    padding: "8px 12px",
    backgroundColor: darkMode ? "#333" : "#f5f5f5",
    color: darkMode ? "#e0e0e0" : "#333",
    border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    margin: "0 8px 8px 0",
    transition: "background-color 0.2s",
    boxSizing: "border-box",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    // 모바일 반응형
    "@media (max-width: 768px)": {
      fontSize: "12px",
      padding: "6px 10px",
      margin: "0 4px 6px 0"
    }
  };
  
  // 예시 자기소개 템플릿
  const introductionExamples = [
    " 안녕하세요! 음악을 사랑하는 ",
    " 취미로 노래 부르는 것을 좋아해요.",
    " 좋아하는 가수는 ",
    " 좋아하는 장르는 ",
    " 음악 외에도 ",
    " 에 관심이 많습니다.",
    " 잘 부르는 노래는 ",
    " 함께 음악을 나눌 수 있어 기쁩니다.",
    " 앞으로 잘 부탁드립니다!"
  ];

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      
      <h1 style={titleStyle}>✏️ 자기소개 수정</h1>
      
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
          {/* 자기소개 입력 */}
          <div style={{ marginBottom: "15px" }}>
            <label style={{ 
              display: "block", 
              marginBottom: "10px",
              color: darkMode ? "#e0e0e0" : "#333",
              fontWeight: "bold",
              fontSize: "16px"
            }}>
              나를 소개하는 글
            </label>
            <textarea
              value={introduction}
              onChange={handleIntroductionChange}
              placeholder="자신을 소개하는 글을 작성해보세요. (최대 500자)"
              style={{
                ...(darkMode ? darkInputStyle : textareaStyle),
                width: "100%",
                minHeight: "150px",
                resize: "vertical",
                padding: "15px",
                fontSize: "16px",
                lineHeight: 1.5,
                boxSizing: "border-box",
                wordWrap: "break-word",
                overflowWrap: "break-word",
                // 모바일 반응형
                "@media (max-width: 768px)": {
                  minHeight: "120px",
                  padding: "12px",
                  fontSize: "16px"
                }
              }}
              disabled={saving}
              maxLength={MAX_CHAR_COUNT}
            />
            <div style={getCharCountStyle()}>
              {charCount}/{MAX_CHAR_COUNT}
            </div>
          </div>
          
          {/* 예시 문구 */}
          <div style={{ marginBottom: "20px" }}>
            <p style={{ 
              fontSize: "14px", 
              color: darkMode ? "#bbb" : "#666",
              marginBottom: "10px" 
            }}>
              👇 자기소개에 추가할 문구 (클릭하여 추가)
            </p>
            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {introductionExamples.map((example, index) => (
                <button
                  key={index}
                  onClick={() => addExample(example)}
                  style={exampleButtonStyle}
                  type="button"
                  disabled={saving}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
          
          {/* 자기소개 팁 */}
          <div style={{ 
            fontSize: "14px", 
            color: darkMode ? "#aaa" : "#777",
            padding: "15px",
            backgroundColor: darkMode ? "#333" : "#f5f5f5",
            borderRadius: "4px",
            marginBottom: "20px"
          }}>
            <p style={{ margin: "0 0 10px 0", fontWeight: "bold" }}>자기소개 작성 팁</p>
            <ul style={{ margin: "0", paddingLeft: "20px" }}>
              <li>음악적 취향이나 관심사를 공유해보세요.</li>
              <li>자신이 잘 부르는 노래나 좋아하는 가수를 소개해보세요.</li>
              <li>함께 하고 싶은 음악 활동이 있다면 언급해보세요.</li>
              <li>자신의 음악 경험이나 실력을 간략히 소개하면 좋습니다.</li>
            </ul>
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
                fontSize: "16px",
                boxSizing: "border-box",
                minHeight: "44px", // 모바일 터치 영역
                flex: 1,
                // 모바일 반응형
                "@media (max-width: 768px)": {
                  fontSize: "14px",
                  padding: "12px 20px"
                }
              }}
              disabled={saving}
              type="button"
            >
              취소
            </button>
            
            <button 
              onClick={saveIntroduction}
              style={{
                ...purpleBtn,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "120px",
                opacity: saving ? 0.7 : 1,
                flex: 1,
                minHeight: "44px", // 모바일 터치 영역
                // 모바일 반응형
                "@media (max-width: 768px)": {
                  fontSize: "14px",
                  padding: "12px 20px"
                }
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

EditIntroduction.propTypes = {
  darkMode: PropTypes.bool
};

EditIntroduction.defaultProps = {
  darkMode: false
};

export default EditIntroduction;
