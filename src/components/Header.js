import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import logo from "../assets/logo.png";
import defaultAvatar from "../assets/default-avatar.png";

function Header({ 
  dark, 
  toggleDark, 
  nick, 
  grades, 
  unread, 
  logout, 
  purpleBtn, 
  globalProfilePics, 
  notiCount, 
  role 
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);
  const profileRef = useRef(null);
  const mobileMenuRef = useRef(null);
  
  // 현재 활성화된 메뉴 항목 확인
  const isActive = (path) => {
    return location.pathname === path;
  };
  
  // 외부 클릭 감지로 메뉴 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target) &&
          profileRef.current && !profileRef.current.contains(event.target)) {
        setShowMenu(false);
      }
      
      if (mobileMenuRef.current && 
          !mobileMenuRef.current.contains(event.target) && 
          event.target.id !== 'mobile-menu-toggle') {
        setShowMobileMenu(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  
  // ESC 키로 메뉴 닫기
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === "Escape") {
        setShowMenu(false);
        setShowMobileMenu(false);
      }
    };
    
    document.addEventListener("keydown", handleEscKey);
    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, []);
  
  // 화면 크기 변경 감지
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
      if (window.innerWidth > 768) {
        setShowMobileMenu(false);
      }
    };
    
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);
  
  // 스크롤 감지
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);
  
  // 메뉴 아이템 클릭 시 네비게이션 처리
  const handleNavigate = (path) => {
    navigate(path);
    setShowMenu(false);
    setShowMobileMenu(false);
  };
  
  // Enter 키 핸들러
  const handleKeyDown = (e, callback) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      callback();
    }
  };
  
  // 메인 메뉴 항목
  const mainMenuItems = [
    { path: "/", label: "홈", icon: "🏠" },
    { path: "/duet", label: "듀엣/합창", icon: "🎤" },
    { path: "/freeboard", label: "자유게시판", icon: "📝" },
    { path: "/songs", label: "노래추천", icon: "🎵" },
    { path: "/advice", label: "고민상담", icon: "💬" }
  ];
  
  // 사용자 메뉴 항목 (드롭다운)
  const userMenuItems = [
    { path: "/mypage", label: "마이페이지", icon: "👤" },
    { path: "/inbox", label: "받은쪽지함", icon: "📬", hasNotif: unread > 0, notifCount: unread },
    { path: "/outbox", label: "보낸쪽지함", icon: "📤" },
    { path: `/guestbook/${nick}`, label: "내 방명록", icon: "📖" },
    { path: "/notification", label: "알림", icon: "🔔", hasNotif: notiCount > 0, notifCount: notiCount },
    { path: "/evaluate", label: "등급 평가", icon: "📝" }
  ];
  
  // 설정 메뉴 항목
  const settingsItems = [
    { path: "/edit-profilepic", label: "프로필 사진 변경", icon: "📷" },
    { path: "/edit-nickname", label: "닉네임 변경", icon: "✏️" },
    { path: "/edit-introduction", label: "소개글 수정", icon: "📋" },
    { path: "/edit-grade", label: "등급 수정", icon: "🏆" },
    { path: "/edit-password", label: "비밀번호 변경", icon: "🔑" }
  ];
  
  // 관리자 메뉴 항목
  const adminMenuItems = [];
  
  if (nick === "너래") {
    adminMenuItems.push({ path: "/admin-eval", label: "평가 결과", icon: "👑" });
  }
  
  if (role === "운영진" || role === "리더" || nick === "너래") {
    adminMenuItems.push({ path: "/admin-user", label: "관리자메뉴", icon: "👥" });
    adminMenuItems.push({ path: "/notices", label: "공지사항 관리", icon: "📢" });
  }
  
  // 총 알림 수 계산
  const totalNotifications = (unread || 0) + (notiCount || 0);
  
  // 모바일뷰 여부
  const isMobile = screenWidth <= 768;
  
  // 메뉴 아이템 스타일
  const getMenuItemStyle = (isMenuActive = false) => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 14px",
    cursor: "pointer",
    borderRadius: "6px",
    transition: "all 0.2s ease",
    color: dark ? (isMenuActive ? "#fff" : "#e0e0e0") : (isMenuActive ? "#7e57c2" : "#333"),
    fontSize: "14px",
    backgroundColor: isMenuActive 
      ? (dark ? "rgba(126, 87, 194, 0.2)" : "rgba(126, 87, 194, 0.1)") 
      : "transparent",
    "&:hover": {
      backgroundColor: dark ? "rgba(126, 87, 194, 0.15)" : "rgba(126, 87, 194, 0.05)"
    }
  });

  return (
    <header style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: isMobile ? "10px 15px" : "10px 20px",
      backgroundColor: dark ? (scrolled ? "#1a1a1a" : "#1a1a1ae6") : (scrolled ? "#fff" : "#ffffffe6"),
      boxShadow: scrolled ? "0 2px 8px rgba(0, 0, 0, 0.15)" : "none",
      backdropFilter: scrolled ? "none" : "blur(8px)",
      position: "sticky",
      top: 0,
      zIndex: 100,
      transition: "all 0.3s ease"
    }}>
      {/* 애니메이션 키프레임 */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        
        .menu-item:hover {
          background-color: ${dark ? "rgba(126, 87, 194, 0.15)" : "rgba(126, 87, 194, 0.05)"};
        }
        
        .header-shadow {
          box-shadow: 0 2px 8px rgba(0, 0, 0, ${dark ? 0.25 : 0.1});
        }
        
        .logo-pulse:hover {
          animation: pulse 0.5s ease-in-out;
        }
        
        .notification-badge {
          animation: pulse 1s infinite;
        }
      `}</style>
      
      {/* 왼쪽: 로고 */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <Link 
          to="/" 
          className="logo-pulse"
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 10,
            textDecoration: "none"
          }}
        >
          <img 
            src={logo} 
            alt="Veryus 로고" 
            style={{ 
              height: isMobile ? 50 : 60,
              transition: "all 0.3s ease"
            }} 
          />
          <span style={{ 
            fontWeight: "bold", 
            fontSize: isMobile ? 18 : 20, 
            color: dark ? "#bb86fc" : "#7e57c2",
            transition: "all 0.3s ease"
          }}>
            Veryus
          </span>
        </Link>
        
        {/* 모바일 메뉴 토글 버튼 */}
        {isMobile && (
          <button 
            id="mobile-menu-toggle"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            aria-label={showMobileMenu ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={showMobileMenu}
            aria-controls="mobile-menu"
            style={{
              background: "none",
              border: "none",
              fontSize: "24px",
              cursor: "pointer",
              color: dark ? "#e0e0e0" : "#333",
              marginLeft: "10px",
              padding: "5px",
              position: "relative",
              zIndex: 101
            }}
          >
            {showMobileMenu ? "✕" : "☰"}
            
            {/* 알림 표시 */}
            {nick && totalNotifications > 0 && (
              <div className="notification-badge" style={{
                position: "absolute",
                top: -2,
                right: -2,
                background: "#f44336",
                color: "white",
                fontSize: "10px",
                borderRadius: "50%",
                minWidth: "16px",
                height: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2px",
                fontWeight: "bold",
                border: "2px solid",
                borderColor: dark ? "#1a1a1a" : "#fff"
              }}>
                {totalNotifications}
              </div>
            )}
          </button>
        )}
      </div>
      
      {/* 중앙: 메인 네비게이션 (데스크톱) */}
      {!isMobile && (
        <nav style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          margin: "0 auto",
          padding: "0 20px"
        }}>
          {mainMenuItems.map((item) => (
            <Link 
              key={item.path}
              to={item.path}
              style={{
                padding: "8px 12px",
                borderRadius: "4px",
                textDecoration: "none",
                color: dark 
                  ? (isActive(item.path) ? "#bb86fc" : "#e0e0e0") 
                  : (isActive(item.path) ? "#7e57c2" : "#333"),
                fontWeight: isActive(item.path) ? "bold" : "normal",
                backgroundColor: isActive(item.path) 
                  ? (dark ? "rgba(187, 134, 252, 0.1)" : "rgba(126, 87, 194, 0.1)") 
                  : "transparent",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
              aria-current={isActive(item.path) ? "page" : undefined}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      )}
      
      {/* 오른쪽: 프로필 & 메뉴 */}
      {nick ? (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "10px"
        }}>
          {/* 다크 모드 토글 버튼 (데스크톱) */}
          {!isMobile && (
            <button
              onClick={toggleDark}
              aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
              title={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
              style={{
                background: "none",
                border: "none",
                fontSize: "20px",
                cursor: "pointer",
                padding: "8px",
                borderRadius: "50%",
                transition: "all 0.2s ease",
                backgroundColor: dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"
              }}
            >
              {dark ? "🌙" : "☀️"}
            </button>
          )}
          
          {/* 프로필 이미지 & 드롭다운 트리거 */}
          <div style={{ position: "relative" }}>
            <div 
              ref={profileRef}
              onClick={() => setShowMenu(prev => !prev)}
              onKeyDown={(e) => handleKeyDown(e, () => setShowMenu(prev => !prev))}
              tabIndex="0"
              role="button"
              aria-haspopup="true"
              aria-expanded={showMenu}
              aria-label="사용자 메뉴"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                padding: "5px",
                borderRadius: "20px",
                backgroundColor: dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
                transition: "all 0.2s ease"
              }}
            >
              <img
                src={globalProfilePics[nick] || defaultAvatar}
                alt="프로필"
                style={{
                  width: isMobile ? 36 : 40,
                  height: isMobile ? 36 : 40,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: `2px solid ${dark ? "#bb86fc" : "#7e57c2"}`
                }}
              />
              
              {!isMobile && (
                <>
                  <span style={{ 
                    fontWeight: "bold", 
                    color: dark ? "#e0e0e0" : "#333"
                  }}>
                    {nick}
                  </span>
                  
                  <span style={{
                    fontSize: "12px",
                    transition: "transform 0.2s",
                    transform: showMenu ? "rotate(180deg)" : "rotate(0)"
                  }}>
                    ▼
                  </span>
                </>
              )}
              
              {/* 알림 표시 */}
              {totalNotifications > 0 && (
                <div className="notification-badge" style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  background: "#f44336",
                  color: "white",
                  fontSize: "10px",
                  borderRadius: "50%",
                  minWidth: "16px",
                  height: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "2px",
                  fontWeight: "bold",
                  border: "2px solid",
                  borderColor: dark ? "#1a1a1a" : "#fff"
                }}>
                  {totalNotifications}
                </div>
              )}
            </div>
            
            {/* 드롭다운 메뉴 */}
            {showMenu && (
              <div 
                ref={menuRef} 
                style={{
                  position: "absolute",
                  top: "calc(100% + 5px)",
                  right: 0,
                  background: dark ? "#2a2a2a" : "#fff",
                  border: `1px solid ${dark ? "#444" : "#eee"}`,
                  borderRadius: "10px",
                  boxShadow: `0 4px 15px rgba(0, 0, 0, ${dark ? 0.4 : 0.1})`,
                  padding: "8px",
                  zIndex: 999,
                  minWidth: "220px",
                  animation: "slideDown 0.2s ease-out",
                  transformOrigin: "top right"
                }}
                role="menu"
              >
                {/* 프로필 섹션 */}
                <div style={{
                  padding: "10px",
                  borderRadius: "8px",
                  backgroundColor: dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
                  marginBottom: "8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center"
                }}>
                  <img
                    src={globalProfilePics[nick] || defaultAvatar}
                    alt="프로필"
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: `2px solid ${dark ? "#bb86fc" : "#7e57c2"}`
                    }}
                  />
                  <div style={{ 
                    marginTop: "8px", 
                    fontWeight: "bold",
                    color: dark ? "#e0e0e0" : "#333"
                  }}>
                    {nick}
                  </div>
                  {grades[nick] && (
                    <div style={{
                      display: "inline-flex",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      backgroundColor: dark ? "rgba(126, 87, 194, 0.2)" : "rgba(126, 87, 194, 0.1)",
                      color: dark ? "#bb86fc" : "#7e57c2",
                      fontSize: "12px",
                      fontWeight: "bold",
                      marginTop: "5px"
                    }}>
                      {grades[nick]} 등급
                    </div>
                  )}
                  {role && (
                    <div style={{
                      display: "inline-flex",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      backgroundColor: dark ? "rgba(255, 152, 0, 0.2)" : "rgba(255, 152, 0, 0.1)",
                      color: dark ? "#ff9800" : "#e65100",
                      fontSize: "12px",
                      fontWeight: "bold",
                      marginTop: "5px"
                    }}>
                      {role}
                    </div>
                  )}
                </div>
                
                {/* 사용자 메뉴 항목 */}
                {userMenuItems.map((item) => (
                  <div 
                    key={item.path}
                    onClick={() => handleNavigate(item.path)}
                    onKeyDown={(e) => handleKeyDown(e, () => handleNavigate(item.path))}
                    tabIndex="0"
                    role="menuitem"
                    className="menu-item"
                    style={{
                      ...getMenuItemStyle(isActive(item.path)),
                      position: "relative"
                    }}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {item.hasNotif && item.notifCount > 0 && (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "18px",
                        height: "18px",
                        borderRadius: "9px",
                        backgroundColor: "#f44336",
                        color: "white",
                        fontSize: "10px",
                        fontWeight: "bold",
                        padding: "0 4px",
                        marginLeft: "auto"
                      }}>
                        {item.notifCount}
                      </span>
                    )}
                  </div>
                ))}
                
                {/* 설정 메뉴 제목 */}
                <div style={{
                  padding: "5px 10px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  color: dark ? "#bb86fc" : "#7e57c2",
                  marginTop: "8px"
                }}>
                  설정
                </div>
                
                {/* 설정 메뉴 항목 */}
                {settingsItems.map((item) => (
                  <div 
                    key={item.path}
                    onClick={() => handleNavigate(item.path)}
                    onKeyDown={(e) => handleKeyDown(e, () => handleNavigate(item.path))}
                    tabIndex="0"
                    role="menuitem"
                    className="menu-item"
                    style={getMenuItemStyle(isActive(item.path))}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
                
                {/* 다크모드 토글 */}
                <div 
                  onClick={() => { toggleDark(); setShowMenu(false); }}
                  onKeyDown={(e) => handleKeyDown(e, () => { toggleDark(); setShowMenu(false); })}
                  tabIndex="0"
                  role="menuitem"
                  className="menu-item"
                  style={getMenuItemStyle()}
                >
                  <span>{dark ? "🌞" : "🌓"}</span>
                  <span>{dark ? "라이트모드" : "다크모드"}</span>
                </div>
                
                {/* 관리자 메뉴 항목이 있는 경우 구분선 추가 */}
                {adminMenuItems.length > 0 && (
                  <>
                    <div style={{
                      height: "1px",
                      backgroundColor: dark ? "#444" : "#eee",
                      margin: "6px 0"
                    }}></div>
                    
                    <div style={{
                      padding: "5px 10px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      color: dark ? "#ff9800" : "#e65100"
                    }}>
                      관리자 도구
                    </div>
                  </>
                )}
                
                {/* 관리자 메뉴 항목 */}
                {adminMenuItems.map((item) => (
                  <div 
                    key={item.path}
                    onClick={() => handleNavigate(item.path)}
                    onKeyDown={(e) => handleKeyDown(e, () => handleNavigate(item.path))}
                    tabIndex="0"
                    role="menuitem"
                    className="menu-item"
                    style={{
                      ...getMenuItemStyle(isActive(item.path)),
                      color: dark ? "#ff9800" : "#ff6d00"
                    }}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
                
                {/* 구분선 */}
                <div style={{
                  height: "1px",
                  backgroundColor: dark ? "#444" : "#eee",
                  margin: "6px 0"
                }}></div>
                
                {/* 로그아웃 버튼 */}
                <div 
                  onClick={() => { logout(); setShowMenu(false); }}
                  onKeyDown={(e) => handleKeyDown(e, () => { logout(); setShowMenu(false); })}
                  tabIndex="0"
                  role="menuitem"
                  className="menu-item"
                  style={{
                    ...getMenuItemStyle(),
                    color: dark ? "#f44336" : "#d32f2f"
                  }}
                >
                  <span>🚪</span>
                  <span>로그아웃</span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 로그인 버튼 (미로그인 시) */
        <div>
          {!isMobile ? (
            <>
              <Link 
                to="/login" 
                style={{
                  ...purpleBtn,
                  textDecoration: "none",
                  display: "inline-block",
                  padding: "8px 16px"
                }}
              >
                로그인
              </Link>
              <Link 
                to="/signup" 
                style={{
                  textDecoration: "none",
                  display: "inline-block",
                  padding: "8px 16px",
                  marginLeft: "10px",
                  border: `1px solid ${dark ? "#bb86fc" : "#7e57c2"}`,
                  borderRadius: "4px",
                  color: dark ? "#bb86fc" : "#7e57c2",
                  backgroundColor: "transparent",
                  transition: "all 0.2s ease"
                }}
              >
                회원가입
              </Link>
            </>
          ) : (
            <Link 
              to="/login" 
              style={{
                ...purpleBtn,
                textDecoration: "none",
                display: "inline-block",
                padding: "6px 12px",
                fontSize: "14px"
              }}
            >
              로그인
            </Link>
          )}
        </div>
      )}
      
      {/* 모바일 메뉴 (슬라이드 인) */}
      {isMobile && showMobileMenu && (
        <div
          id="mobile-menu"
          ref={mobileMenuRef}
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: "75%",
            maxWidth: "300px",
            height: "100vh",
            backgroundColor: dark ? "#1a1a1a" : "#fff",
            boxShadow: `0 0 20px rgba(0, 0, 0, ${dark ? 0.5 : 0.2})`,
            zIndex: 100,
            padding: "20px",
            paddingTop: "70px",
            overflowY: "auto",
            animation: "slideInRight 0.3s ease-out"
          }}
        >
          {/* 모바일 프로필 섹션 */}
          {nick && (
            <div style={{
              padding: "15px",
              borderRadius: "12px",
              backgroundColor: dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
              marginBottom: "20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}>
              <img
                src={globalProfilePics[nick] || defaultAvatar}
                alt="프로필"
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: `3px solid ${dark ? "#bb86fc" : "#7e57c2"}`
                }}
              />
              <div style={{ 
                marginTop: "12px", 
                fontWeight: "bold",
                fontSize: "18px",
                color: dark ? "#e0e0e0" : "#333"
              }}>
                {nick}
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                {grades[nick] && (
                  <div style={{
                    display: "inline-flex",
                    padding: "3px 10px",
                    borderRadius: "12px",
                    backgroundColor: dark ? "rgba(126, 87, 194, 0.2)" : "rgba(126, 87, 194, 0.1)",
                    color: dark ? "#bb86fc" : "#7e57c2",
                    fontSize: "13px",
                    fontWeight: "bold"
                  }}>
                    {grades[nick]}
                  </div>
                )}
                                {role && (
                  <div style={{
                    display: "inline-flex",
                    padding: "3px 10px",
                    borderRadius: "12px",
                    backgroundColor: dark ? "rgba(255, 152, 0, 0.2)" : "rgba(255, 152, 0, 0.1)",
                    color: dark ? "#ff9800" : "#e65100",
                    fontSize: "13px",
                    fontWeight: "bold"
                  }}>
                    {role}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* 모바일 메인 메뉴 */}
          <div style={{ 
            marginBottom: "20px",
            borderRadius: "10px",
            overflow: "hidden",
            backgroundColor: dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)",
          }}>
            {mainMenuItems.map((item) => (
              <div 
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                onKeyDown={(e) => handleKeyDown(e, () => handleNavigate(item.path))}
                tabIndex="0"
                role="menuitem"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 15px",
                  cursor: "pointer",
                  borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"}`,
                  backgroundColor: isActive(item.path) 
                    ? (dark ? "rgba(126, 87, 194, 0.3)" : "rgba(126, 87, 194, 0.1)") 
                    : "transparent",
                  color: dark 
                    ? (isActive(item.path) ? "#bb86fc" : "#e0e0e0") 
                    : (isActive(item.path) ? "#7e57c2" : "#333"),
                  fontWeight: isActive(item.path) ? "bold" : "normal",
                  fontSize: "16px"
                }}
              >
                <span style={{ fontSize: "20px" }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          
          {/* 모바일 사용자 메뉴 */}
          {nick && (
            <>
              <div style={{ 
                marginBottom: "20px",
                borderRadius: "10px",
                overflow: "hidden",
                backgroundColor: dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)"
              }}>
                <div style={{
                  padding: "10px 15px",
                  fontWeight: "bold",
                  fontSize: "14px",
                  color: dark ? "#bb86fc" : "#7e57c2",
                  borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"}`
                }}>
                  내 활동
                </div>
                
                {userMenuItems.map((item) => (
                  <div 
                    key={item.path}
                    onClick={() => handleNavigate(item.path)}
                    onKeyDown={(e) => handleKeyDown(e, () => handleNavigate(item.path))}
                    tabIndex="0"
                    role="menuitem"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px 15px",
                      cursor: "pointer",
                      borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"}`,
                      backgroundColor: isActive(item.path) 
                        ? (dark ? "rgba(126, 87, 194, 0.3)" : "rgba(126, 87, 194, 0.1)") 
                        : "transparent",
                      color: dark 
                        ? (isActive(item.path) ? "#bb86fc" : "#e0e0e0") 
                        : (isActive(item.path) ? "#7e57c2" : "#333"),
                      fontWeight: isActive(item.path) ? "bold" : "normal",
                      fontSize: "16px",
                      position: "relative"
                    }}
                  >
                    <span style={{ fontSize: "20px" }}>{item.icon}</span>
                    <span>{item.label}</span>
                    {item.hasNotif && item.notifCount > 0 && (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "20px",
                        height: "20px",
                        borderRadius: "10px",
                        backgroundColor: "#f44336",
                        color: "white",
                        fontSize: "12px",
                        fontWeight: "bold",
                        padding: "0 6px",
                        marginLeft: "auto"
                      }}>
                        {item.notifCount}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              
              {/* 모바일 설정 메뉴 */}
              <div style={{ 
                marginBottom: "20px",
                borderRadius: "10px",
                overflow: "hidden",
                backgroundColor: dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.02)"
              }}>
                <div style={{
                  padding: "10px 15px",
                  fontWeight: "bold",
                  fontSize: "14px",
                  color: dark ? "#bb86fc" : "#7e57c2",
                  borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"}`
                }}>
                  설정
                </div>
                
                {settingsItems.map((item) => (
                  <div 
                    key={item.path}
                    onClick={() => handleNavigate(item.path)}
                    onKeyDown={(e) => handleKeyDown(e, () => handleNavigate(item.path))}
                    tabIndex="0"
                    role="menuitem"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px 15px",
                      cursor: "pointer",
                      borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"}`,
                      backgroundColor: isActive(item.path) 
                        ? (dark ? "rgba(126, 87, 194, 0.3)" : "rgba(126, 87, 194, 0.1)") 
                        : "transparent",
                      color: dark 
                        ? (isActive(item.path) ? "#bb86fc" : "#e0e0e0") 
                        : (isActive(item.path) ? "#7e57c2" : "#333"),
                      fontWeight: isActive(item.path) ? "bold" : "normal",
                      fontSize: "16px"
                    }}
                  >
                    <span style={{ fontSize: "20px" }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
                
                {/* 모바일 다크모드 토글 */}
                <div 
                  onClick={() => { toggleDark(); }}
                  onKeyDown={(e) => handleKeyDown(e, () => { toggleDark(); })}
                  tabIndex="0"
                  role="menuitem"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "12px 15px",
                    cursor: "pointer",
                    borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"}`,
                    color: dark ? "#e0e0e0" : "#333",
                    fontSize: "16px"
                  }}
                >
                  <span style={{ fontSize: "20px" }}>{dark ? "🌞" : "🌓"}</span>
                  <span>{dark ? "라이트모드" : "다크모드"}</span>
                </div>
              </div>
              
              {/* 모바일 관리자 메뉴 */}
              {adminMenuItems.length > 0 && (
                <div style={{ 
                  marginBottom: "20px",
                  borderRadius: "10px",
                  overflow: "hidden",
                  backgroundColor: dark ? "rgba(255, 152, 0, 0.1)" : "rgba(255, 152, 0, 0.05)"
                }}>
                  <div style={{
                    padding: "10px 15px",
                    fontWeight: "bold",
                    fontSize: "14px",
                    color: dark ? "#ff9800" : "#e65100",
                    borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"}`
                  }}>
                    관리자 도구
                  </div>
                  
                  {adminMenuItems.map((item) => (
                    <div 
                      key={item.path}
                      onClick={() => handleNavigate(item.path)}
                      onKeyDown={(e) => handleKeyDown(e, () => handleNavigate(item.path))}
                      tabIndex="0"
                      role="menuitem"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "12px 15px",
                        cursor: "pointer",
                        borderBottom: `1px solid ${dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"}`,
                        backgroundColor: isActive(item.path) 
                          ? (dark ? "rgba(255, 152, 0, 0.2)" : "rgba(255, 152, 0, 0.1)") 
                          : "transparent",
                        color: dark 
                          ? (isActive(item.path) ? "#ff9800" : "#ff9800") 
                          : (isActive(item.path) ? "#e65100" : "#e65100"),
                        fontWeight: isActive(item.path) ? "bold" : "normal",
                        fontSize: "16px"
                      }}
                    >
                      <span style={{ fontSize: "20px" }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* 모바일 로그아웃 버튼 */}
              <div 
                onClick={logout}
                onKeyDown={(e) => handleKeyDown(e, logout)}
                tabIndex="0"
                role="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  padding: "15px",
                  borderRadius: "10px",
                  backgroundColor: dark ? "rgba(244, 67, 54, 0.2)" : "rgba(244, 67, 54, 0.1)",
                  color: dark ? "#f44336" : "#d32f2f",
                  fontWeight: "bold",
                  cursor: "pointer",
                  marginTop: "20px"
                }}
              >
                <span style={{ fontSize: "20px" }}>🚪</span>
                <span>로그아웃</span>
              </div>
            </>
          )}
          
          {/* 미로그인 시 모바일 로그인/회원가입 버튼 */}
          {!nick && (
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "15px",
              marginTop: "20px"
            }}>
              <Link 
                to="/login" 
                style={{
                  ...purpleBtn,
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "15px",
                  fontSize: "16px",
                  textAlign: "center"
                }}
                onClick={() => setShowMobileMenu(false)}
              >
                로그인
              </Link>
              <Link 
                to="/signup" 
                style={{
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "15px",
                  fontSize: "16px",
                  textAlign: "center",
                  border: `1px solid ${dark ? "#bb86fc" : "#7e57c2"}`,
                  borderRadius: "4px",
                  color: dark ? "#bb86fc" : "#7e57c2",
                  backgroundColor: "transparent"
                }}
                onClick={() => setShowMobileMenu(false)}
              >
                회원가입
              </Link>
            </div>
          )}
        </div>
      )}
      
      {/* 모바일 메뉴가 열렸을 때 배경 오버레이 */}
      {isMobile && showMobileMenu && (
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 99,
            animation: "fadeIn 0.3s ease-out"
          }}
          onClick={() => setShowMobileMenu(false)}
          aria-hidden="true"
        />
      )}
    </header>
  );
}

Header.propTypes = {
  dark: PropTypes.bool,
  toggleDark: PropTypes.func.isRequired,
  nick: PropTypes.string,
  grades: PropTypes.object,
  unread: PropTypes.number,
  logout: PropTypes.func.isRequired,
  purpleBtn: PropTypes.object,
  globalProfilePics: PropTypes.object,
  notiCount: PropTypes.number,
  role: PropTypes.string
};

Header.defaultProps = {
  dark: false,
  nick: null,
  grades: {},
  unread: 0,
  globalProfilePics: {},
  notiCount: 0,
  role: ""
};

export default Header;
