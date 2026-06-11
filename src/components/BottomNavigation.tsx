import React, { useState, useEffect, memo, useCallback, useRef } from 'react';
import type { ReactElement } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Bell, User, ChevronUp, Search, Grid3x3, ChevronDown, Menu, Settings } from 'lucide-react';
import './BottomNavigation.css';
import MemberNicknameSearch from './MemberNicknameSearch';
import { checkAdminAccess } from './AdminTypes';

// Types
interface User {
  nickname: string;
  role?: string;
}

interface BottomNavigationProps {
  unreadNotificationCount: number;
  anonymousChatUnreadCount?: number;
  onSearchOpen?: () => void;
}

interface BoardItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ size?: number }> | (() => ReactElement);
  emoji?: string;
  isSearch?: boolean;
  isAdmin?: boolean;
  badge?: number;
  isComingSoon?: boolean;
}

interface NavItem {
  id: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  path: string;
  isActive: boolean;
  hasSubmenu?: boolean;
  badge?: number;
  hasDot?: boolean;
}

const BOARD_ITEMS: BoardItem[] = [
  { name: '통합 검색', path: 'search', icon: Search, isSearch: true },
  { name: '연습실예약', path: '/practice-room-booking', icon: () => <span style={{fontSize:16}}>📅</span>, emoji: '📅' },
  { name: '합격곡', path: '/approved-songs', icon: () => <span style={{fontSize:16}}>🏆</span>, emoji: '🏆' },
  { name: '셋리스트', path: '/setlist', icon: () => <span style={{fontSize:16}}>🎵</span>, emoji: '🎵' },
  { name: '게임', path: '/games', icon: () => <span style={{fontSize:16}}>🎮</span>, emoji: '🎮' },
  { name: '콘테스트', path: '/contests', icon: () => <span style={{fontSize:16}}>🎤</span>, emoji: '🎤' },
];

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

const COLLAPSED_TOGGLE_STORAGE_KEY = 'bottomNavTogglePosition';
const COLLAPSED_TOGGLE_DRAG_THRESHOLD = 6;

const getCollapsedToggleSize = () => (window.innerWidth <= 768 ? 44 : 48);

const getDefaultCollapsedTogglePosition = (): { x: number; y: number } => {
  const size = getCollapsedToggleSize();
  const sideGap = window.innerWidth <= 768 ? 10 : 12;
  const bottomGap = window.innerWidth <= 768 ? 10 : 12;
  return {
    x: sideGap,
    y: window.innerHeight - size - bottomGap
  };
};

const loadCollapsedTogglePosition = (): { x: number; y: number } | null => {
  try {
    const saved = localStorage.getItem(COLLAPSED_TOGGLE_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as { x?: number; y?: number };
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
};

const clampCollapsedTogglePosition = (pos: { x: number; y: number }) => {
  const size = getCollapsedToggleSize();
  return {
    x: Math.max(0, Math.min(pos.x, window.innerWidth - size)),
    y: Math.max(0, Math.min(pos.y, window.innerHeight - size))
  };
};

const BottomNavigation: React.FC<BottomNavigationProps> = memo(({ 
  unreadNotificationCount, 
  anonymousChatUnreadCount = 0,
  onSearchOpen 
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // State
  const [showBoardsMenu, setShowBoardsMenu] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(getSavedCollapsedState);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isHiddenByScroll, setIsHiddenByScroll] = useState(false);
  const [navSyncTick, setNavSyncTick] = useState(0);
  const isSetlistPerformMode =
    location.pathname.startsWith('/setlist') &&
    (() => {
      try {
        return sessionStorage.getItem('setlistPerformMode') === '1';
      } catch {
        return false;
      }
    })();
  const shouldAutoCollapse =
    location.pathname.startsWith('/anonymous-chat') ||
    location.pathname.startsWith('/customer-center') ||
    isSetlistPerformMode;
  const lastScrollYRef = React.useRef(0);
  const scrollDirectionRef = React.useRef<'up' | 'down' | null>(null);
  const isTickingRef = React.useRef(false);

  const [togglePosition, setTogglePosition] = useState<{ x: number; y: number }>(() => {
    const saved = loadCollapsedTogglePosition();
    if (saved) return clampCollapsedTogglePosition(saved);
    return getDefaultCollapsedTogglePosition();
  });
  const [isDraggingToggle, setIsDraggingToggle] = useState(false);
  const togglePositionRef = useRef(togglePosition);
  const toggleDragReadyRef = useRef(false);
  const toggleDragStartRef = useRef({ x: 0, y: 0 });
  const toggleDragOffsetRef = useRef({ x: 0, y: 0 });
  const toggleDidDragRef = useRef(false);

  togglePositionRef.current = togglePosition;

  // 채팅방·셋리스트 진행 탭 등 — 하단 네비 자동 접기
  useEffect(() => {
    const onNavSync = () => setNavSyncTick((n) => n + 1);
    window.addEventListener('veryus-bottom-nav-sync', onNavSync);
    return () => window.removeEventListener('veryus-bottom-nav-sync', onNavSync);
  }, []);

  useEffect(() => {
    if (!shouldAutoCollapse) return;

    setIsCollapsed(true);
    setShowBoardsMenu(false);
    setIsHiddenByScroll(false);
    localStorage.setItem('bottomNavCollapsed', JSON.stringify(true));
  }, [shouldAutoCollapse, navSyncTick]);

  // 페이지 이동 시 스크롤 숨김 상태 초기화 (접기 버튼이 사라지는 버그 방지)
  useEffect(() => {
    setIsHiddenByScroll(false);
    setShowBoardsMenu(false);
    scrollDirectionRef.current = null;
    lastScrollYRef.current = 0;

    if (location.pathname === '/') {
      setIsCollapsed(false);
      localStorage.setItem('bottomNavCollapsed', JSON.stringify(false));
    }
  }, [location.pathname, location.key]);

  const expandBottomNav = useCallback(() => {
    setIsCollapsed(false);
    setIsHiddenByScroll(false);
    setShowBoardsMenu(false);
    localStorage.setItem('bottomNavCollapsed', JSON.stringify(false));
  }, []);

  // Get current user on mount
  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  // Dynamic board items based on admin access + unread badges
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
      path: '/practice-room-booking',
      isActive: location.pathname.includes('/approved-songs') || 
                location.pathname.includes('/setlist') || 
                location.pathname.includes('/contests') ||
                location.pathname.includes('/practice-room-booking') ||
                location.pathname.includes('/games'),
      hasSubmenu: true,
      hasDot: false
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
      if (path === '/') {
        expandBottomNav();
      }
      navigate(path);
      setShowBoardsMenu(false);
    }
  }, [navigate, expandBottomNav]);

  const handleBoardClick = useCallback((path: string, isSearch?: boolean, isComingSoon?: boolean) => {
    if (isSearch && onSearchOpen) {
      onSearchOpen();
    } else if (isComingSoon) {
      alert('해당 메뉴는 아직 준비중입니다.');
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

  useEffect(() => {
    const handleResize = () => {
      setTogglePosition((prev) => clampCollapsedTogglePosition(prev));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const persistTogglePosition = useCallback((pos: { x: number; y: number }) => {
    const clamped = clampCollapsedTogglePosition(pos);
    localStorage.setItem(COLLAPSED_TOGGLE_STORAGE_KEY, JSON.stringify(clamped));
    return clamped;
  }, []);

  const handleCollapsedTogglePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    toggleDragReadyRef.current = true;
    toggleDidDragRef.current = false;
    toggleDragStartRef.current = { x: e.clientX, y: e.clientY };
    toggleDragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    button.setPointerCapture(e.pointerId);
  }, []);

  const handleCollapsedTogglePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!toggleDragReadyRef.current && !toggleDidDragRef.current) return;

    if (toggleDragReadyRef.current && !toggleDidDragRef.current) {
      const distance = Math.hypot(
        e.clientX - toggleDragStartRef.current.x,
        e.clientY - toggleDragStartRef.current.y
      );
      if (distance < COLLAPSED_TOGGLE_DRAG_THRESHOLD) return;
      toggleDragReadyRef.current = false;
      toggleDidDragRef.current = true;
      setIsDraggingToggle(true);
    }

    if (!toggleDidDragRef.current) return;

    const size = getCollapsedToggleSize();
    const next = {
      x: Math.max(0, Math.min(e.clientX - toggleDragOffsetRef.current.x, window.innerWidth - size)),
      y: Math.max(0, Math.min(e.clientY - toggleDragOffsetRef.current.y, window.innerHeight - size))
    };
    setTogglePosition(next);
    togglePositionRef.current = next;
  }, []);

  const handleCollapsedTogglePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    if (button.hasPointerCapture(e.pointerId)) {
      button.releasePointerCapture(e.pointerId);
    }

    const wasDrag = toggleDidDragRef.current;
    toggleDragReadyRef.current = false;
    toggleDidDragRef.current = false;
    setIsDraggingToggle(false);

    if (wasDrag) {
      const clamped = persistTogglePosition(togglePositionRef.current);
      setTogglePosition(clamped);
      togglePositionRef.current = clamped;
    } else {
      toggleCollapse();
    }
  }, [persistTogglePosition, toggleCollapse]);

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

  // Scroll-based navigation visibility
  useEffect(() => {
    lastScrollYRef.current = window.scrollY;
    let lastTouchY = 0;
    let touchScrolling = false;
    let touchStartTime = 0;

    const updateByScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollThreshold = 50;
      
      if (!isCollapsed) {
        if (Math.abs(currentScrollY - lastScrollYRef.current) > 3) {
          if (currentScrollY > lastScrollYRef.current && currentScrollY > scrollThreshold) {
            if (scrollDirectionRef.current !== 'down') {
              scrollDirectionRef.current = 'down';
              setIsHiddenByScroll(true);
              setShowBoardsMenu(false);
            }
          } else if (currentScrollY < lastScrollYRef.current) {
            if (scrollDirectionRef.current !== 'up') {
              scrollDirectionRef.current = 'up';
              setIsHiddenByScroll(false);
            }
          }
          if (currentScrollY < 50) {
            setIsHiddenByScroll(false);
          }
          lastScrollYRef.current = currentScrollY;
        }
      }
    };

    const handleScroll = () => {
      if (isTickingRef.current) return;
      isTickingRef.current = true;
      requestAnimationFrame(() => {
        updateByScroll();
        isTickingRef.current = false;
      });
    };

    const handleWheel = (e: WheelEvent) => {
      if (!isCollapsed) {
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
        
        if (!isCollapsed && Math.abs(deltaY) > 50) {
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
  }, [isCollapsed]);

  // Render functions
  const renderBoardItem = (board: BoardItem) => (
    <button
      key={board.path}
      className={`board-submenu-item ${board.isSearch ? 'search-item' : ''} ${board.isAdmin ? 'admin-item' : ''}`}
      onClick={() => handleBoardClick(board.path, board.isSearch, board.isComingSoon)}
      style={{ position: 'relative' }}
    >
      {board.emoji ? (
        <span style={{fontSize: 18}}>{board.emoji}</span>
      ) : (
        <board.icon size={16} />
      )}
      <span>{board.name}</span>
      {board.badge != null && board.badge > 0 && (
        <span className="board-submenu-badge">{board.badge > 99 ? '99+' : board.badge}</span>
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
        {item.hasDot && (
          <span className="bottom-nav-badge-dot"></span>
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
          <div className="boards-submenu-panel">
            <MemberNicknameSearch />
            <div className="boards-submenu-content">
              {boardItems.map(renderBoardItem)}
            </div>
          </div>
        </div>
      )}

      {/* 접힌 상태일 때 보이는 작은 토글 버튼 */}
      {isCollapsed && (
        <button
          type="button"
          className={`bottom-nav-toggle-collapsed${isDraggingToggle ? ' is-dragging' : ''}`}
          style={{ left: togglePosition.x, top: togglePosition.y }}
          onPointerDown={handleCollapsedTogglePointerDown}
          onPointerMove={handleCollapsedTogglePointerMove}
          onPointerUp={handleCollapsedTogglePointerUp}
          onPointerCancel={handleCollapsedTogglePointerUp}
          title="드래그하여 이동 · 탭하여 네비게이션 펼치기"
          aria-label="네비게이션 펼치기"
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