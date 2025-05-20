import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { useLocation, useNavigate } from "react-router-dom";
import CustomLink from "./CustomLink";
import {
  containerStyle, darkContainerStyle, titleStyle
} from "../components/style";

function NotFound({ darkMode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(10);
  
  // 자동 홈 리다이렉트 카운트다운 (옵션)
  useEffect(() => {
    // 자동 리다이렉트를 원하지 않으면 이 useEffect를 제거하거나 주석 처리
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [navigate]);
  
  // 뒤로 가기 핸들러
  const handleGoBack = () => {
    navigate(-1);
  };
  
  // 일반적인 문제 해결 팁
  const troubleshootingTips = [
    { title: "URL 확인", content: "주소가 올바르게 입력되었는지 확인해 보세요." },
    { title: "새로고침", content: "페이지를 새로고침하거나 다시 접속해 보세요." },
    { title: "캐시 삭제", content: "브라우저 캐시를 삭제하고 다시 시도해 보세요." },
    { title: "로그인 상태", content: "필요한 경우 로그인이 되어 있는지 확인해 보세요." }
  ];
  
  // 버튼 스타일
  const buttonStyle = {
    padding: "10px 20px",
    backgroundColor: "#7e57c2",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "16px",
    margin: "5px 10px 5px 0",
    transition: "background-color 0.3s, transform 0.2s",
    "&:hover": {
      backgroundColor: "#6a3cb5",
      transform: "translateY(-2px)"
    }
  };
  
  // 카드 스타일
  const cardStyle = {
    padding: "15px",
    backgroundColor: darkMode ? "#333" : "#f5f5f5",
    borderRadius: "8px",
    marginBottom: "20px",
    border: `1px solid ${darkMode ? "#444" : "#ddd"}`
  };

  return (
    <div style={{
      ...darkMode ? darkContainerStyle : containerStyle,
      textAlign: "center",
      padding: "40px 20px"
    }}>
      {/* 404 애니메이션 */}
      <div style={{ 
        fontSize: "120px", 
        fontWeight: "bold", 
        color: darkMode ? "#7e57c2" : "#7e57c2",
        opacity: 0.5,
        margin: "0 0 20px",
        animation: "pulse 2s infinite"
      }}>
        404
        <style>{`
          @keyframes pulse {
            0% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.05); }
            100% { opacity: 0.5; transform: scale(1); }
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
            20%, 40%, 60%, 80% { transform: translateX(5px); }
          }
        `}</style>
      </div>
      
      <h1 style={{
        ...titleStyle,
        animation: "shake 0.5s",
        animationIterationCount: "1",
        marginBottom: "30px"
      }}>
        ⚠️ 페이지를 찾을 수 없습니다
      </h1>
      
      {/* 에러 메시지 */}
      <div style={cardStyle}>
        <p style={{ 
          fontSize: "18px", 
          marginBottom: "15px", 
          color: darkMode ? "#e0e0e0" : "#333" 
        }}>
          요청하신 페이지 <code style={{ 
            backgroundColor: darkMode ? "#222" : "#f0f0f0", 
            padding: "3px 6px", 
            borderRadius: "4px" 
          }}>{location.pathname}</code>를 찾을 수 없습니다.
        </p>
        <p style={{ color: darkMode ? "#bbb" : "#666" }}>
          페이지가 삭제되었거나, 이름이 변경되었거나, 일시적으로 사용할 수 없는 상태일 수 있습니다.
        </p>
      </div>
      
      {/* 자동 리다이렉트 알림 */}
      <div style={{ 
        padding: "10px 15px", 
        backgroundColor: darkMode ? "#2c3e50" : "#e3f2fd",
        color: darkMode ? "#e0e0e0" : "#0d47a1",
        borderRadius: "4px",
        marginBottom: "25px",
        fontSize: "14px"
      }}>
        <p>{countdown}초 후 자동으로 홈페이지로 이동합니다...</p>
      </div>
      
      {/* 네비게이션 버튼 */}
      <div style={{ margin: "30px 0" }}>
        <button 
          onClick={handleGoBack} 
          style={buttonStyle}
        >
          ← 이전 페이지로
        </button>
        <CustomLink 
          to="/" 
          style={{
            ...buttonStyle,
            textDecoration: "none",
            display: "inline-block"
          }}
        >
          🏠 홈으로 돌아가기
        </CustomLink>
      </div>
      
      {/* 문제 해결 팁 */}
      <div style={{ 
        textAlign: "left", 
        maxWidth: "600px", 
        margin: "40px auto 0",
        padding: "20px",
        backgroundColor: darkMode ? "#3a2a5a" : "#f3e7ff",
        borderRadius: "8px",
        border: `1px solid ${darkMode ? "#513989" : "#b49ddb"}`
      }}>
        <h3 style={{ 
          color: darkMode ? "#d4c2ff" : "#7e57c2",
          marginTop: 0
        }}>
          💡 문제 해결 방법
        </h3>
        <ul style={{ 
          padding: "0 0 0 20px", 
          color: darkMode ? "#e0e0e0" : "#333"
        }}>
          {troubleshootingTips.map((tip, index) => (
            <li key={index} style={{ marginBottom: "10px" }}>
              <strong>{tip.title}:</strong> {tip.content}
            </li>
          ))}
        </ul>
        <p style={{ marginTop: "15px", fontSize: "14px", color: darkMode ? "#bbb" : "#666" }}>
          계속해서 문제가 발생하면 <CustomLink to="/contact" style={{ color: "#7e57c2" }}>고객센터</CustomLink>에 문의해 주세요.
        </p>
      </div>
      
      {/* 검색 바로가기 (옵션) */}
      <div style={{ marginTop: "30px" }}>
        <CustomLink 
          to="/search" 
          style={{
            color: darkMode ? "#9575cd" : "#7e57c2",
            textDecoration: "none",
            fontSize: "16px"
          }}
        >
          🔍 검색 페이지로 이동하기
        </CustomLink>
      </div>
    </div>
  );
}

NotFound.propTypes = {
  darkMode: PropTypes.bool
};

NotFound.defaultProps = {
  darkMode: false
};

export default NotFound;
