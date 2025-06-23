import React, { useState, useEffect, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, MessageSquare, Mic, Star, UserPlus, Bell, User, ChevronUp, Search } from 'lucide-react';
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
      icon: MessageSquare,
      label: '게시판',
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

  return (
    <>
      {/* 게시판 서브메뉴 */}
      {showBoardsMenu && (
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
      
      <nav className="bottom-navigation">
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
              {/* 게시판 버튼에 채팅 알림 표시 */}
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
        </div>
      </nav>
    </>
  );
});

BottomNavigation.displayName = 'BottomNavigation';

export default BottomNavigation; 