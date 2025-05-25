import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import logo from "../assets/logo.png";
import defaultAvatar from "../assets/default-avatar.png";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../firebase";

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
  const [scrolled, setScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const profileRef = useRef(null);
  const menuRef = useRef(null);
  
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
      setIsMobile(window.innerWidth <= 768);
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
  
  // 알림 개수 실시간 업데이트
  useEffect(() => {
    if (!nick) return;

    // 읽지 않은 알림 쿼리
    const q = query(
      collection(db, "notifications"),
      where("receiverNickname", "==", nick),
      where("isRead", "==", false),
      orderBy("createdAt", "desc")
    );

    // 실시간 구독
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadNotifications(snapshot.size);
    });

    return () => unsubscribe();
  }, [nick]);
  
  // 메뉴 아이템 클릭 시 네비게이션 처리
  const handleNavigate = (path) => {
    navigate(path);
    setShowMenu(false);
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
    { path: "/inbox", label: "쪽지함", icon: "📬", hasNotif: unread > 0, notifCount: unread },
    { path: `/guestbook/${nick}`, label: "내 방명록", icon: "📖" },
    { path: "/notification", label: "알림", icon: "🔔", hasNotif: notiCount > 0, notifCount: notiCount },
    { path: "/scores", label: "콘테스트", icon: "🏆" },
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
  
const adminMenuItems = [];

// "너래" 닉네임이면 모든 관리자 메뉴 표시
if (nick === "너래") {
  adminMenuItems.push({ path: "/new-admin-panel", label: "관리자패널", icon: "🛠️" });
  adminMenuItems.push({ path: "/admin-eval", label: "평가 결과", icon: "👑" });
  adminMenuItems.push({ path: "/notices", label: "공지사항 관리", icon: "📢" });
}
// 그 외 관리자 권한을 가진 사용자에게는 관리자패널만 표시
else if (role === "운영진" || role === "리더" || role === "부운영진") {
  adminMenuItems.push({ path: "/new-admin-panel", label: "관리자패널", icon: "🛠️" });
}

  
  // 총 알림 수 계산
  const totalNotifications = (unread || 0) + (notiCount || 0);
  
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

  // 메뉴 토글 함수
  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };
  
  // 로그아웃 처리
  const handleLogout = () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      logout();
      setShowMenu(false);
      navigate("/");
    }
  };

  return (
    <header style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: isMobile ? "8px 12px" : "10px 20px",
      backgroundColor: dark 
        ? (scrolled ? "rgba(89, 61, 135, 0.98)" : "rgba(89, 61, 135, 0.95)") 
        : (scrolled ? "rgba(126, 87, 194, 0.98)" : "rgba(126, 87, 194, 0.95)"),
      boxShadow: scrolled ? "0 2px 8px rgba(0, 0, 0, 0.2)" : "none",
      backdropFilter: scrolled ? "none" : "blur(8px)",
      position: "sticky",
      top: 0,
      zIndex: 100,
      transition: "all 0.3s ease",
      color: "#fff",
      minHeight: isMobile ? "56px" : "64px"
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
          background-color: ${dark ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.2)"};
        }
        
        .header-shadow {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        
        .logo-pulse:hover {
          animation: pulse 0.5s ease-in-out;
        }
        
        .notification-badge {
          animation: pulse 1s infinite;
        }
        
        /* 드롭다운 메뉴 스크롤바 스타일 */
        div[role="menu"]::-webkit-scrollbar {
          width: 6px;
        }
        
        div[role="menu"]::-webkit-scrollbar-track {
          background: ${dark ? "#333" : "#f1f1f1"};
          border-radius: 3px;
        }
        
        div[role="menu"]::-webkit-scrollbar-thumb {
          background: ${dark ? "#666" : "#ccc"};
          border-radius: 3px;
        }
        
        div[role="menu"]::-webkit-scrollbar-thumb:hover {
          background: ${dark ? "#777" : "#999"};
        }
        
        /* 모바일 터치 최적화 */
        @media (max-width: 768px) {
          .menu-item {
            min-height: 44px;
            display: flex;
            align-items: center;
          }
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
            textDecoration: "none"
          }}
        >
          <img 
            src={logo} 
            alt="Veryus 로고" 
            style={{ 
              height: isMobile ? 48 : 70,
              transition: "all 0.3s ease"
            }} 
          />
        </Link>
      </div>
      
{/* 중앙: 메인 네비게이션 (데스크톱) */}
{!isMobile && (
  <nav style={{
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: "0 auto",
    padding: "0 20px",
    maxWidth: "60%",
    overflowX: "auto",
    whiteSpace: "nowrap",
    msOverflowStyle: "none",
    scrollbarWidth: "none",
    WebkitOverflowScrolling: "touch"
  }}>
    {mainMenuItems.map((item) => (
      <Link 
        key={item.path}
        to={item.path}
        style={{
          padding: "8px 12px",
          borderRadius: "6px",
          textDecoration: "none",
          color: isActive(item.path) ? "#ffffff" : "rgba(255, 255, 255, 0.85)",
          fontWeight: isActive(item.path) ? "bold" : "normal",
          backgroundColor: isActive(item.path) 
            ? "rgba(255, 255, 255, 0.2)" 
            : "transparent",
          transition: "all 0.2s ease",
          display: "flex",
          alignItems: "center",
          gap: "5px",
          flexShrink: 0,
          position: "relative",
          fontSize: "14px"
        }}
        aria-current={isActive(item.path) ? "page" : undefined}
        onMouseEnter={(e) => {
          if (!isActive(item.path)) {
            e.target.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
            e.target.style.color = "#ffffff";
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive(item.path)) {
            e.target.style.backgroundColor = "transparent";
            e.target.style.color = "rgba(255, 255, 255, 0.85)";
          }
        }}
      >
        <span>{item.icon}</span>
        <span>{item.label}</span>
        {item.path === "/notification" && unreadNotifications > 0 && (
          <span style={{
            position: "absolute",
            top: "-5px",
            right: "-5px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "18px",
            height: "18px",
            borderRadius: "9px",
            backgroundColor: "#ff4444",
            color: "white",
            fontSize: "10px",
            fontWeight: "bold",
            padding: "0 4px",
            border: "2px solid rgba(126, 87, 194, 1)"
          }}>
            {unreadNotifications}
          </span>
        )}
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
              onClick={toggleMenu}
              onKeyDown={(e) => handleKeyDown(e, toggleMenu)}
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
                  maxHeight: isMobile ? "60vh" : "80vh",
                  overflowY: "auto",
                  animation: "slideDown 0.2s ease-out",
                  transformOrigin: "top right",
                  WebkitOverflowScrolling: "touch",
                  scrollbarWidth: "thin",
                  scrollbarColor: `${dark ? "#666 #333" : "#ccc #f5f5f5"}`
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
                  onClick={handleLogout}
                  onKeyDown={(e) => handleKeyDown(e, handleLogout)}
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
