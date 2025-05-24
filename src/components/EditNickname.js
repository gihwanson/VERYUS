import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, getDocs, query, where, doc, updateDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, purpleBtn
} from "../components/style";

function EditNickname({ darkMode }) {
  const [currentNickname, setCurrentNickname] = useState("");
  const [newNickname, setNewNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);
  const [nicknameValidation, setNicknameValidation] = useState({
    isValid: false,
    message: "",
    checking: false
  });
  
  const navigate = useNavigate();
  
  // 현재 닉네임 및 사용자 ID 로드
  useEffect(() => {
    const nick = localStorage.getItem("nickname");
    if (!nick) {
      navigate("/login", { state: { from: "/edit-nickname" } });
      return;
    }
    
    setCurrentNickname(nick);
    
    const fetchUserId = async () => {
      try {
        const q = query(collection(db, "users"), where("nickname", "==", nick));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setError("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
          return;
        }
        
        setUserId(snapshot.docs[0].id);
      } catch (err) {
        console.error("사용자 정보 조회 오류:", err);
        setError("사용자 정보를 불러오는 중 오류가 발생했습니다.");
      }
    };
    
    fetchUserId();
  }, [navigate]);
  
  // 닉네임 중복 확인 (자동 체크)
  const checkNicknameDuplicate = useCallback(async (nickname) => {
    if (!nickname.trim() || nickname === currentNickname) {
      return;
    }
    
    // 기본 유효성 검사 먼저 수행
    if (nickname.length < 2 || nickname.length > 20) {
      return;
    }
    
    const allowedChars = /^[가-힣a-zA-Z0-9_-]+$/;
    if (!allowedChars.test(nickname)) {
      return;
    }
    
    try {
      setNicknameValidation(prev => ({ ...prev, checking: true }));
      
      // 닉네임 중복 확인 쿼리
      const q = query(collection(db, "users"), where("nickname", "==", nickname));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        setNicknameValidation({
          isValid: false,
          message: "이미 사용 중인 닉네임입니다.",
          checking: false
        });
      } else {
        setNicknameValidation({
          isValid: true,
          message: "사용 가능한 닉네임입니다.",
          checking: false
        });
      }
    } catch (err) {
      console.error("닉네임 중복 확인 오류:", err);
      setNicknameValidation({
        isValid: false,
        message: "중복 확인 중 오류가 발생했습니다.",
        checking: false
      });
    }
  }, [currentNickname]);
  
  // 닉네임 입력 시 자동 중복 체크
  useEffect(() => {
    const timer = setTimeout(() => {
      if (newNickname.trim() && newNickname !== currentNickname) {
        checkNicknameDuplicate(newNickname);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [newNickname, currentNickname, checkNicknameDuplicate]);
  
  // 닉네임 입력 핸들러
  const handleNicknameChange = (e) => {
    const value = e.target.value;
    setNewNickname(value);
    validateNickname(value);
  };
  
  // 닉네임 유효성 검사
  const validateNickname = (nickname) => {
    // 빈 닉네임 체크
    if (!nickname.trim()) {
      setNicknameValidation({
        isValid: false,
        message: "",
        checking: false
      });
      return;
    }
    
    // 현재 닉네임과 동일한지 체크
    if (nickname === currentNickname) {
      setNicknameValidation({
        isValid: false,
        message: "현재 닉네임과 동일합니다.",
        checking: false
      });
      return;
    }
    
    // 길이 체크
    if (nickname.length < 2) {
      setNicknameValidation({
        isValid: false,
        message: "닉네임은 2자 이상이어야 합니다.",
        checking: false
      });
      return;
    }
    
    if (nickname.length > 20) {
      setNicknameValidation({
        isValid: false,
        message: "닉네임은 20자 이하여야 합니다.",
        checking: false
      });
      return;
    }
    
    // 특수문자 체크 (허용하는 특수문자 정의)
    const allowedChars = /^[가-힣a-zA-Z0-9_-]+$/;
    if (!allowedChars.test(nickname)) {
      setNicknameValidation({
        isValid: false,
        message: "한글, 영문, 숫자, 밑줄(_), 하이픈(-) 만 사용 가능합니다.",
        checking: false
      });
      return;
    }
    
    // 모든 검사 통과 - 중복 체크는 useEffect에서 처리
    setNicknameValidation({
      isValid: false,
      message: "중복 확인 중...",
      checking: true
    });
  };
  
  // 닉네임 변경 저장
  const saveNickname = async () => {
    if (!newNickname.trim()) {
      setNicknameValidation({
        isValid: false,
        message: "닉네임을 입력해주세요."
      });
      return;
    }
    
    if (!nicknameValidation.isValid) {
      return;
    }
    
    if (!userId) {
      setError("사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // 닉네임 중복 최종 확인
      const dupQuery = query(collection(db, "users"), where("nickname", "==", newNickname));
      const dupSnapshot = await getDocs(dupQuery);
      
      if (!dupSnapshot.empty) {
        setNicknameValidation({
          isValid: false,
          message: "이미 사용 중인 닉네임입니다."
        });
        setLoading(false);
        return;
      }
      
      // Firestore 사용자 정보 업데이트
      await updateDoc(doc(db, "users", userId), {
        nickname: newNickname,
        updatedAt: serverTimestamp()
      });
      
      // 로컬 스토리지 업데이트
      localStorage.setItem("nickname", newNickname);
      
      alert("닉네임이 성공적으로 변경되었습니다.");
      navigate("/mypage");
    } catch (err) {
      console.error("닉네임 변경 오류:", err);
      setError("닉네임 변경 중 오류가 발생했습니다. 다시 시도해주세요.");
      setLoading(false);
    }
  };
  
  // 취소 버튼 핸들러
  const handleCancel = () => {
    navigate("/mypage");
  };
  
  // 카드 스타일
  const cardStyle = {
    backgroundColor: darkMode ? "#2a2a2a" : "#fff",
    borderRadius: "8px",
    padding: "25px",
    maxWidth: "450px",
    width: "100%",
    margin: "0 auto",
    boxShadow: `0 2px 8px rgba(0, 0, 0, ${darkMode ? 0.3 : 0.1})`,
    border: `1px solid ${darkMode ? "#444" : "#eee"}`
  };
  
  // 닉네임 표시 스타일
  const nicknameDisplayStyle = {
    backgroundColor: darkMode ? "#333" : "#f5f5f5",
    padding: "10px 15px",
    borderRadius: "4px",
    marginBottom: "20px",
    fontSize: "16px",
    color: darkMode ? "#e0e0e0" : "#333",
    fontWeight: "bold",
    textAlign: "center"
  };
  
  // 버튼 그룹 스타일
  const buttonGroupStyle = {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "20px"
  };
  
  // 유효성 메시지 스타일
  const getValidationStyle = () => ({
    padding: "6px 0",
    fontSize: "14px",
    minHeight: "20px",
    color: nicknameValidation.isValid ? "#4caf50" : "#f44336"
  });

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      
      <h1 style={titleStyle}>👤 닉네임 변경</h1>
      
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
      
      <div style={cardStyle}>
        {/* 현재 닉네임 표시 */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ 
            display: "block", 
            marginBottom: "8px",
            color: darkMode ? "#bbb" : "#666",
            fontSize: "14px" 
          }}>
            현재 닉네임
          </label>
          <div style={nicknameDisplayStyle}>
            {currentNickname}
          </div>
        </div>
        
        {/* 새 닉네임 입력 */}
        <div style={{ marginBottom: "5px" }}>
          <label style={{ 
            display: "block", 
            marginBottom: "8px",
            color: darkMode ? "#e0e0e0" : "#333",
            fontWeight: "bold"
          }}>
            새 닉네임
          </label>
          <div style={{ position: "relative" }}>
            <input 
              value={newNickname} 
              onChange={handleNicknameChange} 
              placeholder="새 닉네임을 입력하세요" 
              style={{
                ...(darkMode ? darkInputStyle : inputStyle),
                width: "100%",
                marginBottom: "5px",
                borderColor: newNickname && (nicknameValidation.isValid ? "#4caf50" : "#f44336")
              }}
              disabled={loading}
            />
          </div>
          <div style={getValidationStyle()}>
            {newNickname && (
              <>
                {nicknameValidation.checking && (
                  <span style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ 
                      display: "inline-block", 
                      width: "12px", 
                      height: "12px", 
                      border: "2px solid #f3f3f3", 
                      borderTop: "2px solid #7e57c2", 
                      borderRadius: "50%", 
                      animation: "spin 1s linear infinite",
                      marginRight: "8px"
                    }}></span>
                    중복 확인 중...
                  </span>
                )}
                {!nicknameValidation.checking && nicknameValidation.message && (
                  <span style={{ display: "flex", alignItems: "center" }}>
                    {nicknameValidation.isValid ? "✓ " : "✗ "}
                    {nicknameValidation.message}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        
        {/* 안내 메시지 */}
        <div style={{ 
          fontSize: "13px", 
          color: darkMode ? "#aaa" : "#777",
          margin: "15px 0",
          padding: "10px",
          backgroundColor: darkMode ? "#333" : "#f5f5f5",
          borderRadius: "4px"
        }}>
          <ul style={{ margin: "0", paddingLeft: "20px" }}>
            <li>닉네임은 2~20자 사이여야 합니다.</li>
            <li>한글, 영문, 숫자, 밑줄(_), 하이픈(-)만 사용 가능합니다.</li>
            <li>닉네임이 변경되면 모든 게시물에 반영됩니다.</li>
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
              fontSize: "16px"
            }}
            disabled={loading}
          >
            취소
          </button>
          
          <button 
            onClick={saveNickname}
            style={{
              ...purpleBtn,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "120px",
              opacity: loading || !nicknameValidation.isValid ? 0.7 : 1
            }}
            disabled={loading || !nicknameValidation.isValid || !newNickname.trim()}
          >
            {loading ? (
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
                처리 중...
              </>
            ) : "닉네임 변경"}
          </button>
        </div>
      </div>
    </div>
  );
}

EditNickname.propTypes = {
  darkMode: PropTypes.bool
};

EditNickname.defaultProps = {
  darkMode: false
};

export default EditNickname;
