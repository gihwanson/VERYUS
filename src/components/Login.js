import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import PropTypes from "prop-types";
import { 
  collection, query, where, getDocs, limit 
} from "firebase/firestore";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import sha256 from "crypto-js/sha256";
import { db, auth } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, inputStyle, darkInputStyle, purpleBtn
} from "./style";

function Login({ darkMode }) {
  const [formData, setFormData] = useState({
    nickname: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveId, setSaveId] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  
  // URL에서 리디렉션 정보와 메시지 확인
  const from = location.state?.from || "/";
  const message = location.state?.message || "";
  
  // 컴포넌트 마운트 시 저장된 닉네임 불러오기
  useEffect(() => {
    const savedNickname = localStorage.getItem("savedNickname");
    if (savedNickname) {
      setFormData(prev => ({ ...prev, nickname: savedNickname }));
      setSaveId(true);
    }
    
    // 자동 로그인 체크
    const autoLogin = localStorage.getItem("autoLogin");
    if (autoLogin === "true") {
      setRememberMe(true);
      
      // 이미 로그인된 상태인지 확인
      const loggedInUser = localStorage.getItem("nickname");
      if (loggedInUser) {
        navigate(from);
      }
    }
  }, [navigate, from]);
  
  // 입력값 변경 핸들러
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // 입력을 시작하면 이전 에러 메시지 초기화
    if (error) setError("");
  };
  
  // 로그인 처리 함수
  const handleLogin = async () => {
    // 기본 유효성 검사
    if (!formData.nickname.trim()) {
      setError("닉네임을 입력해주세요.");
      return;
    }
    if (!formData.password) {
      setError("비밀번호를 입력해주세요.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      // 닉네임으로 사용자 검색 - 모든 사용자를 가져오는 대신 해당 닉네임만 조회
      const userQuery = query(
        collection(db, "users"),
        where("nickname", "==", formData.nickname),
        limit(1)
      );
      
      const userSnapshot = await getDocs(userQuery);
      
      if (userSnapshot.empty) {
        setError("존재하지 않는 사용자입니다.");
        setLoading(false);
        return;
      }
      
      // 비밀번호 확인
      const userData = userSnapshot.docs[0].data();
      const hashedPassword = sha256(formData.password).toString();
      
      if (userData.password !== hashedPassword) {
        setError("비밀번호가 일치하지 않습니다.");
        setLoading(false);
        return;
      }
      
      // Firebase Auth에도 로그인 (이메일이 있는 경우)
      try {
        if (userData.email) {
          // 기존 사용자면 로그인 시도
          try {
            await signInWithEmailAndPassword(auth, userData.email, formData.password);
            console.log("Firebase Auth 로그인 성공");
          } catch (authError) {
            // 로그인 실패시 계정 생성 시도 (비밀번호가 다를 수 있음)
            console.log("Firebase Auth 로그인 실패, 계정 생성 시도:", authError.code);
            if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password') {
              try {
                await createUserWithEmailAndPassword(auth, userData.email, formData.password);
                console.log("Firebase Auth 계정 생성 성공");
              } catch (createError) {
                console.log("Firebase Auth 계정 생성도 실패:", createError.message);
                // Auth 로그인 실패해도 로컬 로그인은 계속 진행
              }
            }
          }
        } else {
          console.log("이메일 정보가 없어 Firebase Auth 로그인을 건너뜁니다.");
        }
      } catch (authError) {
        console.log("Firebase Auth 처리 중 오류:", authError);
        // Auth 실패해도 로컬 로그인은 계속 진행
      }
      
      // 로그인 성공 처리
      if (saveId) {
        localStorage.setItem("savedNickname", formData.nickname);
      } else {
        localStorage.removeItem("savedNickname");
      }
      
      if (rememberMe) {
        localStorage.setItem("autoLogin", "true");
      } else {
        localStorage.removeItem("autoLogin");
      }
      
      // 사용자 정보 저장
      localStorage.setItem("nickname", formData.nickname);
      
      // 원래 코드에서의 리다이렉션 방식 사용
      window.location.href = "/";
      
      // React Router의 navigate는 아래 코드로 대체할 수 있지만, 
      // 현재 앱에서 문제가 있다면 위의 window.location.href를 사용합니다.
      // navigate("/");
    } catch (err) {
      console.error("로그인 오류:", err);
      setError("로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
    
    setLoading(false);
  };
  
  // Enter 키 이벤트 핸들러
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLogin();
    }
  };
  
  // 체크박스 상태 변경 핸들러
  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    if (name === "saveId") {
      setSaveId(checked);
    } else if (name === "rememberMe") {
      setRememberMe(checked);
    }
  };
  
  // 회원가입 페이지로 이동
  const handleSignupClick = () => {
    navigate("/signup");
  };
  
  // 카드 스타일
  const cardStyle = {
    backgroundColor: darkMode ? "#333" : "#fff",
    borderRadius: "10px",
    boxShadow: `0 4px 15px rgba(0, 0, 0, ${darkMode ? 0.3 : 0.1})`,
    padding: "30px",
    maxWidth: "400px",
    width: "100%",
    margin: "0 auto"
  };
  
  // 버튼 그룹 스타일
  const buttonGroupStyle = {
    display: "flex",
    gap: "10px",
    marginTop: "20px"
  };
  
  // 체크박스 컨테이너 스타일
  const checkboxContainerStyle = {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "15px",
    marginBottom: "20px",
    fontSize: "14px",
    color: darkMode ? "#bbb" : "#666"
  };
  
  // 체크박스 라벨 스타일
  const checkboxLabelStyle = {
    display: "flex",
    alignItems: "center",
    cursor: "pointer"
  };
  
  // 입력 라벨 스타일
  const labelStyle = {
    display: "block",
    marginBottom: "5px",
    fontSize: "14px",
    fontWeight: "bold",
    color: darkMode ? "#e0e0e0" : "#333"
  };
  
  // 입력 그룹 스타일
  const inputGroupStyle = {
    marginBottom: "15px"
  };
  
  // 에러 메시지 스타일
  const errorStyle = {
    color: "#f44336",
    fontSize: "14px",
    marginTop: "10px",
    marginBottom: "10px",
    padding: "10px",
    backgroundColor: darkMode ? "rgba(244, 67, 54, 0.1)" : "rgba(244, 67, 54, 0.05)",
    borderRadius: "4px",
    display: error ? "block" : "none"
  };
  
  // 알림 메시지 스타일
  const alertStyle = {
    color: "#2196f3",
    fontSize: "14px",
    marginTop: "10px",
    marginBottom: "15px",
    padding: "10px",
    backgroundColor: darkMode ? "rgba(33, 150, 243, 0.1)" : "rgba(33, 150, 243, 0.05)",
    borderRadius: "4px",
    display: message ? "block" : "none"
  };
  
  return (
    <div style={{
      ...darkMode ? darkContainerStyle : containerStyle,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "calc(100vh - 100px)"
    }}>
      <div style={cardStyle}>
        <h1 style={{ ...titleStyle, textAlign: "center", marginBottom: "25px" }}>
          로그인
        </h1>
        
        {/* 알림 메시지 */}
        <div style={alertStyle}>
          {message}
        </div>
        
        {/* 로그인 폼 */}
        <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
          <div style={inputGroupStyle}>
            <label style={labelStyle} htmlFor="nickname">
              닉네임
            </label>
            <input
              id="nickname"
              name="nickname"
              value={formData.nickname}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="닉네임을 입력하세요"
              style={{
                ...darkMode ? darkInputStyle : inputStyle,
                width: "100%",
                padding: "12px 15px",
                fontSize: "16px"
              }}
              disabled={loading}
            />
          </div>
          
          <div style={inputGroupStyle}>
            <label style={labelStyle} htmlFor="password">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="비밀번호를 입력하세요"
              style={{
                ...darkMode ? darkInputStyle : inputStyle,
                width: "100%",
                padding: "12px 15px",
                fontSize: "16px"
              }}
              disabled={loading}
            />
          </div>
          
          {/* 에러 메시지 */}
          <div style={errorStyle}>
            {error}
          </div>
          
          {/* 체크박스 옵션 */}
          <div style={checkboxContainerStyle}>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                name="saveId"
                checked={saveId}
                onChange={handleCheckboxChange}
                style={{ marginRight: "5px" }}
              />
              아이디 저장
            </label>
            
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                name="rememberMe"
                checked={rememberMe}
                onChange={handleCheckboxChange}
                style={{ marginRight: "5px" }}
              />
              자동 로그인
            </label>
          </div>
          
          {/* 로그인 버튼 */}
          <button 
            type="submit" 
            style={{
              ...purpleBtn,
              width: "100%",
              padding: "12px",
              fontSize: "16px",
              position: "relative",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              opacity: loading ? 0.8 : 1
            }}
            disabled={loading}
          >
            {loading ? (
              <>
                <span style={{ 
                  display: "inline-block", 
                  width: "20px", 
                  height: "20px", 
                  border: "3px solid rgba(255, 255, 255, 0.3)", 
                  borderTop: "3px solid #fff", 
                  borderRadius: "50%", 
                  animation: "spin 1s linear infinite",
                  marginRight: "10px"
                }}></span>
                로그인 중...
              </>
            ) : "로그인"}
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </button>
          
          {/* 회원가입 버튼 */}
          <div style={buttonGroupStyle}>
            <button 
              type="button" 
              onClick={handleSignupClick} 
              style={{
                ...purpleBtn,
                backgroundColor: darkMode ? "#555" : "#e0e0e0",
                color: darkMode ? "#fff" : "#333",
                flex: 1
              }}
              disabled={loading}
            >
              회원가입
            </button>
            
            <Link 
              to="/forgot-password" 
              style={{
                ...purpleBtn,
                backgroundColor: "transparent",
                border: `1px solid ${darkMode ? "#666" : "#ddd"}`,
                color: darkMode ? "#bbb" : "#666",
                textDecoration: "none",
                textAlign: "center",
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              비밀번호 찾기
            </Link>
          </div>
        </form>
        
        {/* 소셜 로그인 옵션 */}
        <div style={{ marginTop: "30px", textAlign: "center" }}>
          <p style={{ 
            color: darkMode ? "#aaa" : "#777", 
            marginBottom: "15px",
            fontSize: "14px"
          }}>
            또는 소셜 계정으로 로그인
          </p>
          
          <div style={{ 
            display: "flex", 
            justifyContent: "center", 
            gap: "15px" 
          }}>
            <button 
              type="button"
              style={{
                width: "50px",
                height: "50px",
                borderRadius: "50%",
                border: "none",
                backgroundColor: "#3b5998", // Facebook 색상
                color: "#fff",
                fontSize: "20px",
                cursor: "pointer"
              }}
            >
              f
            </button>
            
            <button 
              type="button"
              style={{
                width: "50px",
                height: "50px",
                borderRadius: "50%",
                border: "none",
                backgroundColor: "#db4437", // Google 색상
                color: "#fff",
                fontSize: "20px",
                cursor: "pointer"
              }}
            >
              G
            </button>
            
            <button 
              type="button"
              style={{
                width: "50px",
                height: "50px",
                borderRadius: "50%",
                border: "none",
                backgroundColor: "#55acee", // Twitter 색상
                color: "#fff",
                fontSize: "20px",
                cursor: "pointer"
              }}
            >
              t
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

Login.propTypes = {
  darkMode: PropTypes.bool
};

Login.defaultProps = {
  darkMode: false
};

export default Login;
