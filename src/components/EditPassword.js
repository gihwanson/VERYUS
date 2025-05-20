import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import {
  collection, query, where, getDocs, doc, updateDoc, getDoc
} from "firebase/firestore";
import sha256 from "crypto-js/sha256";
import zxcvbn from 'zxcvbn';  // 비밀번호 강도 체크 라이브러리 (선택적)
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, purpleBtn
} from "../components/style";

function EditPassword({ darkMode }) {
  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: ""
  });
  
  const navigate = useNavigate();
  const nick = localStorage.getItem("nickname");
  
  // 사용자 ID 로드
  useEffect(() => {
    const fetchUserId = async () => {
      if (!nick) {
        navigate("/login", { state: { from: "/edit-password" } });
        return;
      }
      
      try {
        const q = query(collection(db, "users"), where("nickname", "==", nick));
        const ss = await getDocs(q);
        
        if (ss.empty) {
          setErrors({ general: "사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요." });
          return;
        }
        
        setUserId(ss.docs[0].id);
      } catch (err) {
        console.error("사용자 정보 조회 오류:", err);
        setErrors({ general: "사용자 정보를 불러오는 중 오류가 발생했습니다." });
      }
    };
    
    fetchUserId();
  }, [nick, navigate]);
  
  // 입력값 변경 핸들러
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // 실시간 오류 체크
    if (name === "confirmPassword" && formData.newPassword !== value) {
      setErrors(prev => ({ ...prev, confirmPassword: "비밀번호가 일치하지 않습니다." }));
    } else if (name === "confirmPassword" && formData.newPassword === value) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.confirmPassword;
        return newErrors;
      });
    }
    
    // 비밀번호 강도 체크 (zxcvbn 라이브러리 사용 시)
    if (name === "newPassword" && value) {
      try {
        const result = zxcvbn(value);
        
        setPasswordStrength({
          score: result.score,
          feedback: getPasswordFeedback(result)
        });
        
        if (result.score < 2) {
          setErrors(prev => ({ 
            ...prev, 
            newPassword: "비밀번호가 너무 약합니다. 더 강력한 비밀번호를 사용하세요." 
          }));
        } else {
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.newPassword;
            return newErrors;
          });
        }
      } catch (err) {
        // zxcvbn 라이브러리가 없는 경우 기본 체크
        if (value.length < 6) {
          setErrors(prev => ({ ...prev, newPassword: "비밀번호는 6자 이상이어야 합니다." }));
        } else {
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.newPassword;
            return newErrors;
          });
        }
      }
    }
  };
  
  // 비밀번호 변경 처리
  const changePassword = async () => {
    // 기본 입력값 검증
    let validationErrors = {};
    
    if (!formData.currentPassword) {
      validationErrors.currentPassword = "현재 비밀번호를 입력해주세요.";
    }
    
    if (!formData.newPassword) {
      validationErrors.newPassword = "새 비밀번호를 입력해주세요.";
    } else if (formData.newPassword.length < 6) {
      validationErrors.newPassword = "비밀번호는 6자 이상이어야 합니다.";
    }
    
    if (!formData.confirmPassword) {
      validationErrors.confirmPassword = "새 비밀번호를 다시 입력해주세요.";
    } else if (formData.newPassword !== formData.confirmPassword) {
      validationErrors.confirmPassword = "비밀번호가 일치하지 않습니다.";
    }
    
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    if (!userId) {
      setErrors({ general: "사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요." });
      return;
    }
    
    try {
      setLoading(true);
      setErrors({});
      
      // 현재 비밀번호 확인
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) {
        setErrors({ general: "사용자 정보를 찾을 수 없습니다." });
        setLoading(false);
        return;
      }
      
      const userData = userDoc.data();
      const currentPasswordHash = sha256(formData.currentPassword).toString();
      
      if (userData.password !== currentPasswordHash) {
        setErrors({ currentPassword: "현재 비밀번호가 일치하지 않습니다." });
        setLoading(false);
        return;
      }
      
      // 새 비밀번호가 현재 비밀번호와 같은지 확인
      if (formData.currentPassword === formData.newPassword) {
        setErrors({ newPassword: "새 비밀번호가 현재 비밀번호와 같습니다." });
        setLoading(false);
        return;
      }
      
      // 비밀번호 업데이트
      const newPasswordHash = sha256(formData.newPassword).toString();
      await updateDoc(doc(db, "users", userId), { 
        password: newPasswordHash,
        updatedAt: new Date()
      });
      
      alert("비밀번호가 성공적으로 변경되었습니다.");
      navigate("/mypage");
    } catch (err) {
      console.error("비밀번호 변경 오류:", err);
      setErrors({ general: "비밀번호 변경 중 오류가 발생했습니다. 다시 시도해주세요." });
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };
  
  // 비밀번호 강도에 따른 피드백 (zxcvbn 라이브러리 사용 시)
  const getPasswordFeedback = (result) => {
    if (!result) return "";
    
    const score = result.score;
    const feedback = result.feedback;
    
    if (score === 0) return "매우 약한 비밀번호입니다.";
    if (score === 1) return "약한 비밀번호입니다.";
    if (score === 2) return "보통 수준의 비밀번호입니다.";
    if (score === 3) return "강력한 비밀번호입니다.";
    if (score === 4) return "매우 강력한 비밀번호입니다!";
    
    return feedback.warning || "";
  };
  
  // 취소 버튼 핸들러
  const handleCancel = () => {
    navigate("/mypage");
  };
  
  // 비밀번호 강도에 따른 색상 (zxcvbn 라이브러리 사용 시)
  const getPasswordStrengthColor = (score) => {
    const colors = ["#f44336", "#ff9800", "#ffeb3b", "#4caf50", "#4caf50"];
    return colors[score] || "#f44336";
  };
  
  // 입력 필드 스타일
  const getInputStyle = (fieldName) => ({
    ...(darkMode ? darkInputStyle : inputStyle),
    width: "100%",
    borderColor: errors[fieldName] ? "#f44336" : undefined,
    marginBottom: "5px"
  });
  
  // 에러 메시지 스타일
  const errorMessageStyle = {
    color: "#f44336",
    fontSize: "12px",
    marginBottom: "15px",
    minHeight: "18px"
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
  
  // 버튼 그룹 스타일
  const buttonGroupStyle = {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "20px"
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>🔒 비밀번호 변경</h1>
      
      {/* 일반 오류 메시지 */}
      {errors.general && (
        <div style={{ 
          padding: "12px", 
          backgroundColor: darkMode ? "rgba(244, 67, 54, 0.1)" : "#ffebee",
          color: "#f44336", 
          borderRadius: "4px", 
          marginBottom: "20px",
          textAlign: "center"
        }}>
          {errors.general}
        </div>
      )}
      
      <div style={cardStyle}>
        {/* 현재 비밀번호 */}
        <div style={{ marginBottom: "15px" }}>
          <label style={{ 
            display: "block", 
            marginBottom: "8px",
            color: darkMode ? "#e0e0e0" : "#333",
            fontWeight: "bold"
          }}>
            현재 비밀번호
          </label>
          <input 
            type="password" 
            name="currentPassword"
            value={formData.currentPassword} 
            onChange={handleChange} 
            placeholder="현재 비밀번호를 입력하세요" 
            style={getInputStyle("currentPassword")}
            disabled={loading}
          />
          <div style={errorMessageStyle}>
            {errors.currentPassword || ""}
          </div>
        </div>
        
        {/* 새 비밀번호 */}
        <div style={{ marginBottom: "15px" }}>
          <label style={{ 
            display: "block", 
            marginBottom: "8px",
            color: darkMode ? "#e0e0e0" : "#333",
            fontWeight: "bold" 
          }}>
            새 비밀번호
          </label>
          <input 
            type="password" 
            name="newPassword"
            value={formData.newPassword} 
            onChange={handleChange} 
            placeholder="새 비밀번호 (6자 이상)" 
            style={getInputStyle("newPassword")}
            disabled={loading}
          />
          <div style={errorMessageStyle}>
            {errors.newPassword || ""}
          </div>
          
          {/* 비밀번호 강도 표시 (zxcvbn 라이브러리 사용 시) */}
          {formData.newPassword && (
            <div style={{ marginBottom: "15px" }}>
              <div style={{ 
                height: "5px", 
                backgroundColor: darkMode ? "#444" : "#eee",
                borderRadius: "3px",
                marginBottom: "5px"
              }}>
                <div style={{ 
                  height: "100%", 
                  width: `${(passwordStrength.score + 1) * 20}%`,
                  backgroundColor: getPasswordStrengthColor(passwordStrength.score),
                  borderRadius: "3px",
                  transition: "width 0.3s, background-color 0.3s"
                }}></div>
              </div>
              <div style={{ 
                fontSize: "12px", 
                color: darkMode ? "#bbb" : "#777" 
              }}>
                {passwordStrength.feedback}
              </div>
            </div>
          )}
        </div>
        
        {/* 새 비밀번호 확인 */}
        <div style={{ marginBottom: "15px" }}>
          <label style={{ 
            display: "block", 
            marginBottom: "8px",
            color: darkMode ? "#e0e0e0" : "#333",
            fontWeight: "bold" 
          }}>
            새 비밀번호 확인
          </label>
          <input 
            type="password" 
            name="confirmPassword"
            value={formData.confirmPassword} 
            onChange={handleChange} 
            placeholder="새 비밀번호 다시 입력" 
            style={getInputStyle("confirmPassword")}
            disabled={loading}
          />
          <div style={errorMessageStyle}>
            {errors.confirmPassword || ""}
          </div>
        </div>
        
        {/* 안내 메시지 */}
        <div style={{ 
          fontSize: "13px", 
          color: darkMode ? "#aaa" : "#777",
          marginBottom: "10px",
          padding: "10px",
          backgroundColor: darkMode ? "#333" : "#f5f5f5",
          borderRadius: "4px"
        }}>
          <div style={{ marginBottom: "5px" }}>강력한 비밀번호 만들기 팁:</div>
          <ul style={{ margin: "0", paddingLeft: "20px" }}>
            <li>최소 8자 이상 사용</li>
            <li>대문자, 소문자, 숫자, 특수문자 조합</li>
            <li>개인정보가 포함되지 않도록 주의</li>
            <li>다른 사이트와 동일한 비밀번호 사용 지양</li>
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
            onClick={changePassword}
            style={{
              ...purpleBtn,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "120px",
              opacity: loading ? 0.7 : 1
            }}
            disabled={loading}
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
                <style>{`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
              </>
            ) : "비밀번호 변경"}
          </button>
        </div>
      </div>
    </div>
  );
}

EditPassword.propTypes = {
  darkMode: PropTypes.bool
};

EditPassword.defaultProps = {
  darkMode: false
};

export default EditPassword;
