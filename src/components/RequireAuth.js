// components/RequireAuth.js
import React, { useState, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "../firebase";

function RequireAuth({ 
  children, 
  allowedRoles = [], 
  redirectTo = "/login",
  loadingComponent = null,
  fallbackComponent = null,
  verifyUser = false
}) {
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(verifyUser);
  const [isVerified, setIsVerified] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [authError, setAuthError] = useState(null);
  
  // 로컬 스토리지에서 사용자 정보 확인
  const nickname = localStorage.getItem("nickname");
  const storedRole = localStorage.getItem("role");
  const isAuthenticated = nickname !== null;

  // 사용자 권한 검증 (필요한 경우)
  useEffect(() => {
    const verifyUserFromDatabase = async () => {
      if (!verifyUser || !isAuthenticated) {
        setIsLoading(false);
        return;
      }
      
      try {
        // Firebase에서 사용자 정보 조회
        const userQuery = query(
          collection(db, "users"),
          where("nickname", "==", nickname),
          limit(1)
        );
        
        const userSnapshot = await getDocs(userQuery);
        
        if (userSnapshot.empty) {
          // 사용자가 데이터베이스에 없는 경우
          setIsVerified(false);
          setAuthError("사용자 정보를 찾을 수 없습니다.");
          localStorage.removeItem("nickname"); // 로컬 스토리지에서 인증 정보 제거
        } else {
          // 사용자 정보 확인 및 권한 설정
          const userData = userSnapshot.docs[0].data();
          const userDbRole = userData.role || "일반회원";
          
          // 로컬 스토리지에 역할 정보 업데이트
          localStorage.setItem("role", userDbRole);
          setUserRole(userDbRole);
          setIsVerified(true);
        }
      } catch (error) {
        console.error("사용자 검증 중 오류 발생:", error);
        setAuthError("사용자 검증에 실패했습니다.");
        setIsVerified(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    verifyUserFromDatabase();
  }, [nickname, verifyUser, isAuthenticated]);

  // 로딩 중일 때 표시할 컴포넌트
  if (isLoading) {
    return loadingComponent || (
      <div style={{ 
        display: "flex", 
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        padding: "20px",
        textAlign: "center"
      }}>
        <div>
          <h2>사용자 정보를 확인하는 중입니다...</h2>
          <p>잠시만 기다려 주세요.</p>
        </div>
      </div>
    );
  }

  // 인증되지 않은 경우 리다이렉트
  if (!isAuthenticated) {
    // 원래 접근하려던 페이지 정보를 state로 전달
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // 사용자 검증 실패한 경우
  if (verifyUser && !isVerified) {
    return (
      <Navigate 
        to="/logout" 
        state={{ 
          error: authError || "인증에 실패했습니다. 다시 로그인해 주세요.", 
          redirectTo 
        }} 
        replace 
      />
    );
  }

  // 권한 체크가 필요하고 권한이 부족한 경우
  const effectiveRole = userRole || storedRole || "일반회원";
  
  if (allowedRoles.length > 0 && !allowedRoles.includes(effectiveRole)) {
    // 권한 부족 시 사용자 정의 컴포넌트가 있으면 표시, 없으면 접근 거부 페이지로 이동
    if (fallbackComponent) {
      return fallbackComponent;
    }
    
    return (
      <Navigate 
        to="/access-denied" 
        state={{ 
          requiredRoles: allowedRoles,
          currentRole: effectiveRole,
          from: location 
        }} 
        replace 
      />
    );
  }

  // 모든 검사 통과: 자식 컴포넌트 렌더링
  return children;
}

RequireAuth.propTypes = {
  children: PropTypes.node.isRequired,
  allowedRoles: PropTypes.arrayOf(PropTypes.string),
  redirectTo: PropTypes.string,
  loadingComponent: PropTypes.node,
  fallbackComponent: PropTypes.node,
  verifyUser: PropTypes.bool
};

export default RequireAuth;
