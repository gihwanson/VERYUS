import React, { useState, useEffect, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Bell, User, ChevronUp, Search, Grid3x3, ChevronDown, Menu, Settings } from 'lucide-react';
import './BottomNavigation.css';

interface BottomNavigationProps {
  unreadNotificationCount: number;
  unreadChatCount?: number;
  onSearchOpen?: () => void;
}

// 관리자 권한 체크 함수
const checkAdminAccess = (user: any): boolean => {
  if (!user) return false;
  return user.nickname === '너래' || user.role === '리더' || user.role === '운영진';
};

const BottomNavigation: React.FC<BottomNavigationProps> = memo(({ unreadNotificationCount, unreadChatCount = 0, onSearchOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showBoardsMenu, setShowBoardsMenu] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('bottomNavCollapsed');
    return saved ? JSON.parse(saved) : false;
  });
  const [currentUser, setCurrentUser] = useState<any>(null);

  // 현재 사용자 정보 가져오기
  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        const user = JSON.parse(userString);
        setCurrentUser(user);
      } catch (error) {
        console.error('사용자 정보 파싱 에러:', error);
      }
    }
  }, []);

  // 스크롤 기반 자동 숨김/표시 상태
  const [isHiddenByScroll, setIsHiddenByScroll] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  
  // 초기 스크롤 위치 설정
  useEffect(() => {
    setLastScrollY(window.scrollY);
  }, []);

  // 드래그 관련 상태
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('bottomNavTogglePosition');
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 84, y: window.innerHeight - 84 };
  });

  const boardItems = [
    { name: '통합 검색', path: 'search', icon: Search, isSearch: true },
    { name: '연습장', path: '/practice-room', icon: () => <span style={{fontSize:16}}>🎹</span>, emoji: '🎹' },
    { name: '합격곡', path: '/approved-songs', icon: () => <span style={{fontSize:16}}>🏆</span>, emoji: '🏆' },
    { name: '셋리스트', path: '/setlist', icon: () => <span style={{fontSize:16}}>🎵</span>, emoji: '🎵' },
    { name: '콘테스트', path: '/contests', icon: () => <span style={{fontSize:16}}>🎤</span>, emoji: '🎤' },
    { name: '채팅방', path: '/messages', icon: () => <span style={{fontSize:16}}>💬</span>, emoji: '💬' },
    // 관리자 패널 추가 (권한이 있는 사용자만)
    ...(checkAdminAccess(currentUser) ? [
      { name: '관리자 패널', path: '/admin', icon: Settings, emoji: '⚙️', isAdmin: true }
    ] : [])
  ];

  const navItems = [
    {
      id: 'home',
      icon: Home,
      label: '홈',
      path: '/',
      isActive: location.pathname === '/'
    },
    {
      id: 'boards',
      icon: Grid3x3,
      label: '기능',
      path: '/practice-room',
      isActive: location.pathname.includes('/practice-room') || location.pathname.includes('/approved-songs') || location.pathname.includes('/setlist') || location.pathname.includes('/contests') || location.pathname.includes('/messages'),
      hasSubmenu: true
    },
    {
      id: 'notifications',
      icon: Bell,
      label: '알림',
      path: '/notifications',
      isActive: location.pathname === '/notifications',
      badge: unreadNotificationCount > 0 ? unreadNotificationCount : undefined
    },
    {
      id: 'mypage',
      icon: User,
      label: '마이페이지',
      path: '/mypage',
      isActive: location.pathname === '/mypage' || location.pathname.includes('/mypage/')
    }
  ];

  const handleNavClick = (path: string, hasSubmenu?: boolean) => {
    if (hasSubmenu) {
      setShowBoardsMenu(!showBoardsMenu);
    } else {
      navigate(path);
      setShowBoardsMenu(false);
    }
  };

  const handleBoardClick = (path: string, isSearch?: boolean) => {
    if (isSearch && onSearchOpen) {
      onSearchOpen();
    } else {
      navigate(path);
    }
    setShowBoardsMenu(false);
  };

  const toggleCollapse = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    localStorage.setItem('bottomNavCollapsed', JSON.stringify(newCollapsed));
    setShowBoardsMenu(false); // 접을 때 서브메뉴도 닫기
  };

  // 드래그 핸들러들
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const newX = Math.max(0, Math.min(window.innerWidth - 48, e.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 48, e.clientY - dragOffset.y));
    
    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      localStorage.setItem('bottomNavTogglePosition', JSON.stringify(position));
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    });
    setIsDragging(true);
    e.preventDefault();
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging || e.touches.length === 0) return;
    
    const touch = e.touches[0];
    const newX = Math.max(0, Math.min(window.innerWidth - 48, touch.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 48, touch.clientY - dragOffset.y));
    
    setPosition({ x: newX, y: newY });
    e.preventDefault();
  };

  const handleTouchEnd = () => {
    if (isDragging) {
      setIsDragging(false);
      localStorage.setItem('bottomNavTogglePosition', JSON.stringify(position));
    }
  };

  // 외부 클릭 시 서브메뉴 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.boards-submenu') && !target.closest('.bottom-nav-item[data-boards]')) {
        setShowBoardsMenu(false);
      }
    };

    if (showBoardsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showBoardsMenu]);

  // 드래그 이벤트 등록
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, dragOffset, position]);

  // 스크롤 기반 네비게이션바 자동 숨김/표시
  useEffect(() => {
    let lastTouchY = 0;
    let touchScrolling = false;
    let touchStartTime = 0;
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollThreshold = 50;
      
      if (!isCollapsed && !isDragging) {
        if (Math.abs(currentScrollY - lastScrollY) > 3) {
          if (currentScrollY > lastScrollY && currentScrollY > scrollThreshold) {
            // 아래로 스크롤 & 임계값 넘음 - 숨기기
            if (scrollDirection !== 'down') {
              setScrollDirection('down');
              setIsHiddenByScroll(true);
              setShowBoardsMenu(false);
            }
          } else if (currentScrollY < lastScrollY) {
            // 위로 스크롤 - 보이기
            if (scrollDirection !== 'up') {
              setScrollDirection('up');
              setIsHiddenByScroll(false);
            }
          }
          if (currentScrollY < 50) {
            setIsHiddenByScroll(false);
          }
          setLastScrollY(currentScrollY);
        }
      }
    };

    // wheel 이벤트로 스크롤 방향 감지 (touchmove, 마우스휠 포함)
    const handleWheel = (e: WheelEvent) => {
      if (!isCollapsed && !isDragging) {
        if (e.deltaY > 0) {
          setIsHiddenByScroll(true);
          setShowBoardsMenu(false);
        } else if (e.deltaY < 0) {
          setIsHiddenByScroll(false);
        }
      }
    };

    // 모바일 터치 스크롤 방향 감지 (스크롤 시작/끝만 감지)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        lastTouchY = e.touches[0].clientY;
        touchStartTime = Date.now();
        touchScrolling = true;
      }
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      // 터치 스크롤 중에는 네비게이션바 상태 변경을 하지 않음
      // 실제 스크롤이 방해받지 않도록 함
    };
    
    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchScrolling) return;
      
      const touchEndTime = Date.now();
      const touchDuration = touchEndTime - touchStartTime;
      
      // 짧은 터치 제스처만 감지 (스와이프)
      if (touchDuration < 300 && e.changedTouches.length === 1) {
        const currentY = e.changedTouches[0].clientY;
        const deltaY = currentY - lastTouchY;
        
        if (!isCollapsed && !isDragging && Math.abs(deltaY) > 50) {
          if (deltaY < 0) {
            // 위로 스와이프 - 숨기기
            setIsHiddenByScroll(true);
            setShowBoardsMenu(false);
          } else {
            // 아래로 스와이프 - 보이기
            setIsHiddenByScroll(false);
          }
        }
      }
      
      touchScrolling = false;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [lastScrollY, scrollDirection, isCollapsed, isDragging]);

  // 화면 크기 변경 시 위치 조정
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev: { x: number; y: number }) => ({
        x: Math.max(0, Math.min(window.innerWidth - 48, prev.x)),
        y: Math.max(0, Math.min(window.innerHeight - 48, prev.y))
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      {/* 기능 서브메뉴 */}
      {showBoardsMenu && !isCollapsed && !isHiddenByScroll && (
        <div className="boards-submenu">
          <div className="boards-submenu-content">
            {boardItems.map((board) => (
              <button
                key={board.path}
                className={`board-submenu-item ${(board as any).isSearch ? 'search-item' : ''} ${(board as any).isAdmin ? 'admin-item' : ''}`}
                onClick={() => handleBoardClick(board.path, (board as any).isSearch)}
                style={{ position: 'relative' }}
              >
                {(board as any).emoji ? (
                  <span style={{fontSize: 18}}>{(board as any).emoji}</span>
                ) : (
                  <board.icon size={16} />
                )}
                <span>{board.name}</span>
                {/* 쪽지함 알림 뱃지 */}
                {board.path === '/messages' && unreadChatCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '0px',
                    right: '6px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    borderRadius: '10px',
                    minWidth: '18px',
                    height: '18px',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700',
                    border: '2px solid white',
                    zIndex: 2,
                    boxSizing: 'border-box',
                    lineHeight: '1',
                    padding: unreadChatCount > 9 ? '2px 4px' : '2px'
                  }}>
                    {unreadChatCount > 99 ? '99+' : unreadChatCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 접힌 상태일 때 보이는 작은 토글 버튼 */}
      {isCollapsed && (
        <button 
          className="bottom-nav-toggle-collapsed"
          onClick={!isDragging ? toggleCollapse : undefined}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          title="네비게이션 펼치기"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            transform: isDragging ? 'scale(1.1)' : 'scale(1)',
            boxShadow: isDragging ? '0 8px 24px rgba(138, 85, 204, 0.4)' : '0 4px 16px rgba(138, 85, 204, 0.3)',
            cursor: isDragging ? 'grabbing' : 'grab',
            transition: isDragging ? 'none' : 'all 0.3s ease'
          }}
        >
          <ChevronUp size={20} />
        </button>
      )}
      
      <nav className={`bottom-navigation ${isCollapsed ? 'collapsed' : ''} ${isHiddenByScroll ? 'hidden-by-scroll' : ''}`}>
        {!isCollapsed && (
          <div className="bottom-nav-container">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`bottom-nav-item ${item.isActive ? 'active' : ''}`}
                onClick={() => handleNavClick(item.path, (item as any).hasSubmenu)}
                {...((item as any).hasSubmenu && { 'data-boards': 'true' })}
              >
                <div className="bottom-nav-icon-container">
                  <item.icon 
                    size={20} 
                    className="bottom-nav-icon"
                  />
                  {item.badge && typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="bottom-nav-badge-dot"></span>
                  )}
                  {/* 기능 버튼에 채팅 알림 표시 */}
                  {item.id === 'boards' && unreadChatCount > 0 && (
                    <span className="bottom-nav-badge-dot" style={{ backgroundColor: '#ef4444' }}></span>
                  )}
                  {(item as any).hasSubmenu && showBoardsMenu && (
                    <ChevronUp size={12} className="submenu-indicator" />
                  )}
                </div>
                <span className="bottom-nav-label">{item.label}</span>
              </button>
            ))}
            
            {/* 접기 버튼 */}
            <button 
              className="bottom-nav-item collapse-button"
              onClick={toggleCollapse}
              title="네비게이션 접기"
            >
              <div className="bottom-nav-icon-container">
                <ChevronDown size={20} className="bottom-nav-icon" />
              </div>
              <span className="bottom-nav-label">접기</span>
            </button>
          </div>
        )}
      </nav>
    </>
  );
});

BottomNavigation.displayName = 'BottomNavigation';

export default BottomNavigation; 