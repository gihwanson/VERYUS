import React, { useState, useEffect, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, MessageSquare, Mic, Star, UserPlus, Bell, User, ChevronUp, Search, Grid3x3, ChevronDown, Menu } from 'lucide-react';
import './BottomNavigation.css';

interface BottomNavigationProps {
  unreadNotificationCount: number;
  unreadChatCount?: number;
  onSearchOpen?: () => void;
}

const BottomNavigation: React.FC<BottomNavigationProps> = memo(({ unreadNotificationCount, unreadChatCount = 0, onSearchOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showBoardsMenu, setShowBoardsMenu] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('bottomNavCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // 드래그 관련 상태
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('bottomNavTogglePosition');
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 84, y: window.innerHeight - 84 };
  });

  const boardItems = [
    { name: '통합 검색', path: 'search', icon: Search, isSearch: true },
    { name: '자유게시판', path: '/free', icon: MessageSquare },
    { name: '녹음게시판', path: '/recording', icon: Mic },
    { name: '평가게시판', path: '/evaluation', icon: Star },
    { name: '파트너모집', path: '/boards/partner', icon: UserPlus },
    { name: '연습장', path: '/practice-room', icon: () => <span style={{fontSize:16}}>🎹</span>, emoji: '🎹' },
    { name: '합격곡', path: '/approved-songs', icon: () => <span style={{fontSize:16}}>🏆</span>, emoji: '🏆' },
    { name: '콘테스트', path: '/contests', icon: () => <span style={{fontSize:16}}>🎤</span>, emoji: '🎤' },
    { name: '채팅방', path: '/messages', icon: () => <span style={{fontSize:16}}>💬</span>, emoji: '💬' }
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
      path: '/free',
      isActive: location.pathname.includes('/free') || location.pathname.includes('/recording') || location.pathname.includes('/evaluation') || location.pathname.includes('/boards'),
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
      {showBoardsMenu && !isCollapsed && (
        <div className="boards-submenu">
          <div className="boards-submenu-content">
            {boardItems.map((board) => (
              <button
                key={board.path}
                className={`board-submenu-item ${(board as any).isSearch ? 'search-item' : ''}`}
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
      
      <nav className={`bottom-navigation ${isCollapsed ? 'collapsed' : ''}`}>
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