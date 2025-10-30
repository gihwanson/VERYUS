import React, { useState, useEffect, memo, useCallback } from 'react';
import type { ReactElement } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Bell, User, ChevronUp, Search, Grid3x3, ChevronDown, Menu, Settings } from 'lucide-react';
import './BottomNavigation.css';

// Types
interface User {
  nickname: string;
  role?: string;
}

interface BottomNavigationProps {
  unreadNotificationCount: number;
  unreadChatCount?: number;
  onSearchOpen?: () => void;
}

interface BoardItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ size?: number }> | (() => ReactElement);
  emoji?: string;
  isSearch?: boolean;
  isAdmin?: boolean;
}

interface NavItem {
  id: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  path: string;
  isActive: boolean;
  hasSubmenu?: boolean;
  badge?: number;
}

interface Position {
  x: number;
  y: number;
}

interface DragOffset {
  x: number;
  y: number;
}

// Constants
const ADMIN_USERS = ['너래'];
const ADMIN_ROLES = ['리더', '운영진'];

const BOARD_ITEMS: BoardItem[] = [
  { name: '통합 검색', path: 'search', icon: Search, isSearch: true },
  { name: '연습장', path: '/practice-room', icon: () => <span style={{fontSize:16}}>🎹</span>, emoji: '🎹' },
  { name: '연습실예약', path: '/practice-room-booking', icon: () => <span style={{fontSize:16}}>📅</span>, emoji: '📅' },
  { name: '합격곡', path: '/approved-songs', icon: () => <span style={{fontSize:16}}>🏆</span>, emoji: '🏆' },
  { name: '셋리스트', path: '/setlist', icon: () => <span style={{fontSize:16}}>🎵</span>, emoji: '🎵' },
  { name: '콘테스트', path: '/contests', icon: () => <span style={{fontSize:16}}>🎤</span>, emoji: '🎤' },
  { name: '채팅방', path: '/messages', icon: () => <span style={{fontSize:16}}>💬</span>, emoji: '💬' },
];

// Utility functions
const checkAdminAccess = (user: User | null): boolean => {
  if (!user) return false;
  return ADMIN_USERS.includes(user.nickname) || Boolean(user.role && ADMIN_ROLES.includes(user.role));
};

const getCurrentUser = (): User | null => {
  try {
    const userString = localStorage.getItem('veryus_user');
    return userString ? JSON.parse(userString) : null;
  } catch (error) {
    console.error('사용자 정보 파싱 에러:', error);
    return null;
  }
};

const getSavedCollapsedState = (): boolean => {
  try {
    const saved = localStorage.getItem('bottomNavCollapsed');
    return saved ? JSON.parse(saved) : false;
  } catch {
    return false;
  }
};

const getSavedTogglePosition = (): Position => {
  try {
    const saved = localStorage.getItem('bottomNavTogglePosition');
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 84, y: window.innerHeight - 84 };
  } catch {
    return { x: window.innerWidth - 84, y: window.innerHeight - 84 };
  }
};

const BottomNavigation: React.FC<BottomNavigationProps> = memo(({ 
  unreadNotificationCount, 
  unreadChatCount = 0, 
  onSearchOpen 
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // State
  const [showBoardsMenu, setShowBoardsMenu] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(getSavedCollapsedState);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isHiddenByScroll, setIsHiddenByScroll] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const [position, setPosition] = useState<Position>(getSavedTogglePosition);

  // Get current user on mount
  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  // Dynamic board items based on admin access
  const boardItems: BoardItem[] = [
    ...BOARD_ITEMS,
    ...(checkAdminAccess(currentUser) ? [
      { name: '관리자 패널', path: '/admin', icon: Settings, emoji: '⚙️', isAdmin: true }
    ] : [])
  ];

  // Navigation items
  const navItems: NavItem[] = [
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
      isActive: location.pathname.includes('/practice-room') || 
                location.pathname.includes('/approved-songs') || 
                location.pathname.includes('/setlist') || 
                location.pathname.includes('/contests') || 
                location.pathname.includes('/messages') ||
                location.pathname.includes('/practice-room-booking'),
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

  // Event handlers
  const handleNavClick = useCallback((path: string, hasSubmenu?: boolean) => {
    if (hasSubmenu) {
      setShowBoardsMenu(prev => !prev);
    } else {
      navigate(path);
      setShowBoardsMenu(false);
    }
  }, [navigate]);

  const handleBoardClick = useCallback((path: string, isSearch?: boolean) => {
    if (isSearch && onSearchOpen) {
      onSearchOpen();
    } else {
      navigate(path);
    }
    setShowBoardsMenu(false);
  }, [navigate, onSearchOpen]);

  const toggleCollapse = useCallback(() => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    localStorage.setItem('bottomNavCollapsed', JSON.stringify(newCollapsed));
    setShowBoardsMenu(false);
  }, [isCollapsed]);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const newX = Math.max(0, Math.min(window.innerWidth - 48, e.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 48, e.clientY - dragOffset.y));
    
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      localStorage.setItem('bottomNavTogglePosition', JSON.stringify(position));
    }
  }, [isDragging, position]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    });
    setIsDragging(true);
    e.preventDefault();
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || e.touches.length === 0) return;
    
    const touch = e.touches[0];
    const newX = Math.max(0, Math.min(window.innerWidth - 48, touch.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 48, touch.clientY - dragOffset.y));
    
    setPosition({ x: newX, y: newY });
    e.preventDefault();
  }, [isDragging, dragOffset]);

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      localStorage.setItem('bottomNavTogglePosition', JSON.stringify(position));
    }
  }, [isDragging, position]);

  // Outside click handler
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

  // Drag event listeners
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
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  // Scroll-based navigation visibility
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
            if (scrollDirection !== 'down') {
              setScrollDirection('down');
              setIsHiddenByScroll(true);
              setShowBoardsMenu(false);
            }
          } else if (currentScrollY < lastScrollY) {
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

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        lastTouchY = e.touches[0].clientY;
        touchStartTime = Date.now();
        touchScrolling = true;
      }
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      // 터치 스크롤 중에는 네비게이션바 상태 변경을 하지 않음
    };
    
    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchScrolling) return;
      
      const touchEndTime = Date.now();
      const touchDuration = touchEndTime - touchStartTime;
      
      if (touchDuration < 300 && e.changedTouches.length === 1) {
        const currentY = e.changedTouches[0].clientY;
        const deltaY = currentY - lastTouchY;
        
        if (!isCollapsed && !isDragging && Math.abs(deltaY) > 50) {
          if (deltaY < 0) {
            setIsHiddenByScroll(true);
            setShowBoardsMenu(false);
          } else {
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

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev: Position) => ({
        x: Math.max(0, Math.min(window.innerWidth - 48, prev.x)),
        y: Math.max(0, Math.min(window.innerHeight - 48, prev.y))
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Render functions
  const renderBoardItem = (board: BoardItem) => (
    <button
      key={board.path}
      className={`board-submenu-item ${board.isSearch ? 'search-item' : ''} ${board.isAdmin ? 'admin-item' : ''}`}
      onClick={() => handleBoardClick(board.path, board.isSearch)}
      style={{ position: 'relative' }}
    >
      {board.emoji ? (
        <span style={{fontSize: 18}}>{board.emoji}</span>
      ) : (
        <board.icon size={16} />
      )}
      <span>{board.name}</span>
      {board.path === '/messages' && unreadChatCount > 0 && (
        <span className="chat-badge">
          {unreadChatCount > 99 ? '99+' : unreadChatCount}
        </span>
      )}
    </button>
  );

  const renderNavItem = (item: NavItem) => (
    <button
      key={item.id}
      className={`bottom-nav-item ${item.isActive ? 'active' : ''}`}
      onClick={() => handleNavClick(item.path, Boolean(item.hasSubmenu))}
      {...(Boolean(item.hasSubmenu) && { 'data-boards': 'true' })}
    >
      <div className="bottom-nav-icon-container">
        <item.icon 
          size={20} 
          className="bottom-nav-icon"
        />
        {item.badge && typeof item.badge === 'number' && item.badge > 0 && (
          <span className="bottom-nav-badge-dot"></span>
        )}
        {item.id === 'boards' && unreadChatCount > 0 && (
          <span className="bottom-nav-badge-dot" style={{ backgroundColor: '#ef4444' }}></span>
        )}
        {Boolean(item.hasSubmenu) && showBoardsMenu && (
          <ChevronUp size={12} className="submenu-indicator" />
        )}
      </div>
      <span className="bottom-nav-label">{item.label}</span>
    </button>
  );

  return (
    <>
      {/* 기능 서브메뉴 */}
      {showBoardsMenu && !isCollapsed && !isHiddenByScroll && (
        <div className="boards-submenu">
          <div className="boards-submenu-content">
            {boardItems.map(renderBoardItem)}
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
            {navItems.map(renderNavItem)}
            
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