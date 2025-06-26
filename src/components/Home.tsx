import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { onSnapshot, doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { 
  ChevronDown,
  User,
  Bell
} from 'lucide-react';
import './Home.css';
import { subscribeToAnnouncementUnreadCount } from '../utils/readStatusService';
import { subscribeToTotalUnreadCount } from '../utils/chatService';

// Types
interface User {
  uid: string;
  email: string;
  nickname?: string;
  role?: string;
  grade?: string;
  profileImageUrl?: string;
  isLoggedIn: boolean;
}

interface DropdownItem {
  name: string;
  icon: React.FC<{ size?: number }>;
  action: () => void;
  badge?: string;
}

interface BoardItem {
  name: string;
  icon: React.FC<{ size?: number }>;
  path: string;
  color: string;
}

// Constants
const BOARDS: BoardItem[] = [
  { name: '자유게시판', icon: () => <span style={{fontSize: 36}}>💬</span>, path: '/free', color: '#667eea' },
  { name: '녹음게시판', icon: () => <span style={{fontSize: 36}}>🎙️</span>, path: '/recording', color: '#f093fb' },
  { name: '평가게시판', icon: () => <span style={{fontSize: 36}}>📝</span>, path: '/evaluation', color: '#ffeaa7' },
  { name: '파트너모집', icon: () => <span style={{fontSize: 36}}>🤝</span>, path: '/boards/partner', color: '#55efc4' }
];

interface HomeProps {
  onSearchOpen?: () => void;
}

const Home: React.FC<HomeProps> = ({ onSearchOpen }) => {
  // State
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [totalChatUnreadCount, setTotalChatUnreadCount] = useState(0);

  const navigate = useNavigate();

  // handleLogout 함수
  const handleLogout = useCallback(async (): Promise<void> => {
    try {
      await signOut(auth);
      localStorage.removeItem('veryus_user');
      navigate('/login');
    } catch (error) {
      console.error('로그아웃 에러:', error);
    }
  }, [navigate]);

  // 관리자 확인
  const isAdmin = useCallback((user: User | null): boolean => {
    if (user) {
      return user.nickname === '너래' || user.role === '리더' || user.role === '운영진';
    }
    
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        const userData = JSON.parse(userString);
        return userData.nickname === '너래' || userData.role === '리더' || userData.role === '운영진';
      } catch (error) {
        console.error('localStorage 파싱 에러:', error);
        return false;
      }
    }
    return false;
  }, []);

  // 드롭다운 메뉴 아이템
  const dropdownItems: DropdownItem[] = useMemo(() => [
    { name: '연습장', icon: () => <span style={{fontSize:18}}>🎹</span>, action: () => navigate('/practice-room') },
    { name: '합격곡', icon: () => <span style={{fontSize:18}}>🏆</span>, action: () => navigate('/approved-songs') },
    { name: '셋리스트', icon: () => <span style={{fontSize:18}}>🎵</span>, action: () => navigate('/setlist') },
    { name: '마이페이지', icon: () => <span style={{fontSize:18}}>👤</span>, action: () => navigate('/mypage') },
    { name: '채팅방', icon: () => <span style={{fontSize:18}}>💬</span>, action: () => navigate('/messages'), badge: totalChatUnreadCount > 0 ? '●' : undefined },
    { name: '알림', icon: () => <span style={{fontSize:18}}>🔔</span>, action: () => navigate('/notifications'), badge: unreadNotificationCount > 0 ? '●' : undefined },
    { name: '콘테스트', icon: () => <span style={{fontSize:18}}>🎤</span>, action: () => navigate('/contests') },
    { name: '설정', icon: () => <span style={{fontSize:18}}>⚙️</span>, action: () => navigate('/settings') },
    ...(isAdmin(user) ? [
      { name: '관리자 패널', icon: () => <span style={{fontSize:18}}>🛠️</span>, action: () => navigate('/admin-user') }
    ] : []),
    { name: '로그아웃', icon: () => <span style={{fontSize:18}}>🚪</span>, action: handleLogout }
  ], [user, navigate, isAdmin, handleLogout, totalChatUnreadCount, unreadNotificationCount]);

  // 게시판 네비게이션
  const navigateToBoard = (path: string) => {
    navigate(path);
  };

  // Effects
  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        const basicUserData = JSON.parse(userString);
        setUser(basicUserData);
        setLoading(false);
        
        if (basicUserData.uid) {
          const userDocRef = doc(db, 'users', basicUserData.uid);
          const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {          
            if (docSnapshot.exists()) {
              const firestoreData = docSnapshot.data();
              const completeUserData: User = {
                ...basicUserData,
                ...firestoreData,
                isLoggedIn: true
              };
              setUser(completeUserData);
              localStorage.setItem('veryus_user', JSON.stringify(completeUserData));
            }
          });
          return () => unsubscribe();
        }
      } catch (error) {
        console.error('사용자 정보 파싱 에러:', error);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const dropdown = document.querySelector('.profile-dropdown');
      if (dropdown && !dropdown.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 알림 및 채팅 읽지 않음 수 구독
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribeAnnouncement = subscribeToAnnouncementUnreadCount(
      user.uid, 
      setUnreadNotificationCount
    );

    const unsubscribeChat = subscribeToTotalUnreadCount(
      user.uid, 
      setTotalChatUnreadCount
    );

    return () => {
      unsubscribeAnnouncement();
      unsubscribeChat();
    };
  }, [user?.uid]);

  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      {/* 우측 상단 고정 헤더 */}
      <div className="fixed-header">
        {/* 알림 버튼 */}
        <button 
          className="notification-icon-button"
          onClick={() => navigate('/notifications')}
          aria-label="알림"
        >
          <Bell size={20} />
          {unreadNotificationCount > 0 && (
            <span className="notification-badge-dot"></span>
          )}
        </button>

        {/* 프로필 드롭다운 */}
        <div className="profile-dropdown">
          <button
            className="profile-button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <div className="profile-info">
              <div className="profile-avatar">
                {user?.profileImageUrl ? (
                  <img src={user.profileImageUrl} alt="프로필" />
                ) : (
                  <User size={20} />
                )}
              </div>
              <span className="profile-name">
                {user?.nickname || user?.email?.split('@')[0] || '사용자'}
                <span className="profile-grade">{user?.grade || '🌙'}</span>
              </span>
              <div className="profile-chevron">
                <ChevronDown 
                  size={16} 
                  className={`dropdown-arrow ${dropdownOpen ? 'open' : ''}`}
                />
              </div>
            </div>
          </button>
          {dropdownOpen && (
            <div className="dropdown-menu">
              {dropdownItems.map((item, index) => (
                <button
                  key={index}
                  className="dropdown-item"
                  onClick={() => {
                    item.action();
                    setDropdownOpen(false);
                  }}
                >
                  <item.icon size={16} />
                  <span>{item.name}</span>
                  {item.badge && <span className="dropdown-notification-dot"></span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 메인 컨텐트 */}
      <div className="home-content">
        {/* 로고 섹션 */}
        <div className="logo-section">
          <img 
            src="/veryus_logo.png" 
            alt="VERYUS Logo" 
            className="logo-image"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = "/veryus-logo.svg";
            }}
          />
          <div className="brand-text">
            <h1 className="home-title">VERYUS</h1>
            <p className="home-slogan">다양한 음악을 우리답게</p>
          </div>
        </div>

        {/* 게시판 바로가기 */}
        <div className="boards-section">
          <div className="boards-grid">
            {BOARDS.map((board, index) => (
              <div 
                key={index} 
                className={`bubble-button bubble-${board.path.replace('/', '').replace('boards/', '')}`}
                onClick={() => navigateToBoard(board.path)}
                style={{ '--board-color': board.color } as React.CSSProperties}
              >
                <div className="bubble-icon">
                  <board.icon />
                </div>
                <span className="bubble-name">{board.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home; 