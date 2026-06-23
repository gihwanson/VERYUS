import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { toast } from 'react-toastify';
import { User, LogOut } from 'lucide-react';
import AnonymousNoteBubble from './AnonymousNoteBubble';
import GlobalLoadingScreen from './GlobalLoadingScreen';
import { auth } from '../firebase';
import { useUserProfile } from '../contexts/UserProfileContext';
import {
  markBoardAsVisited,
  getAllBoardNotificationStatus
} from '../utils/simpleBoardNotification';

interface User {
  uid: string;
  email: string;
  nickname?: string;
  role?: string;
  grade?: string;
  profileImageUrl?: string;
  isLoggedIn: boolean;
}

interface BoardItem {
  name: string;
  icon: React.FC<{ size?: number }>;
  path: string;
  color: string;
  boardType: 'free' | 'recording' | 'evaluation' | 'hallOfFame' | 'partner' | 'chorus';
  layoutClass: string;
  slug: string;
}

const BOARDS: BoardItem[] = [
  {
    name: '자유게시판',
    icon: () => <span className="board-emoji">💬</span>,
    path: '/free',
    color: '#667eea',
    boardType: 'free',
    layoutClass: 'bubble-top-left',
    slug: 'free'
  },
  {
    name: '녹음게시판',
    icon: () => <span className="board-emoji">🎙️</span>,
    path: '/recording',
    color: '#f093fb',
    boardType: 'recording',
    layoutClass: 'bubble-top-right',
    slug: 'recording'
  },
  {
    name: '명예의전당',
    icon: () => <span className="board-emoji board-emoji--sm">🏅</span>,
    path: '/hall-of-fame',
    color: '#ff9ff3',
    boardType: 'hallOfFame',
    layoutClass: 'bubble-center',
    slug: 'hall-of-fame'
  },
  {
    name: '평가게시판',
    icon: () => <span className="board-emoji">📝</span>,
    path: '/evaluation',
    color: '#ffeaa7',
    boardType: 'evaluation',
    layoutClass: 'bubble-bottom-left',
    slug: 'evaluation'
  },
  {
    name: '이어 부르기',
    icon: () => <span className="board-emoji">🎤</span>,
    path: '/chorus',
    color: '#fb7185',
    boardType: 'chorus',
    layoutClass: 'bubble-chorus',
    slug: 'chorus'
  },
  {
    name: '파트너모집',
    icon: () => <span className="board-emoji">🤝</span>,
    path: '/boards/partner',
    color: '#55efc4',
    boardType: 'partner',
    layoutClass: 'bubble-bottom-right',
    slug: 'partner'
  }
];

const HomeClassic: React.FC = () => {
  const { profile } = useUserProfile();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardNotifications, setBoardNotifications] = useState<any[]>([]);
  const navigate = useNavigate();

  const handleProfileClick = () => {
    navigate('/mypage');
  };

  const handleLogout = async () => {
    if (!window.confirm('로그아웃 하시겠습니까?')) return;
    try {
      await signOut(auth);
      localStorage.removeItem('veryus_user');
      navigate('/login');
    } catch (error) {
      console.error('로그아웃 에러:', error);
      toast.error('로그아웃 중 오류가 발생했습니다.');
    }
  };

  const navigateToBoard = (board: BoardItem) => {
    if (user?.uid) {
      markBoardAsVisited(user.uid, board.boardType);
      setBoardNotifications(getAllBoardNotificationStatus(user.uid));
    }
    navigate(board.path);
  };

  const getBoardNotification = (boardType: string): boolean => {
    const notification = boardNotifications.find((n) => n.boardType === boardType);
    return notification?.hasNewPosts || false;
  };

  useEffect(() => {
    if (profile) {
      setUser({
        uid: String(profile.uid),
        email: String(profile.email || ''),
        nickname: profile.nickname as string | undefined,
        role: profile.role as string | undefined,
        grade: profile.grade as string | undefined,
        profileImageUrl: profile.profileImageUrl as string | undefined,
        isLoggedIn: true
      });
      setLoading(false);
      return;
    }
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        setUser(JSON.parse(userString));
      } catch (error) {
        console.error('사용자 정보 파싱 에러:', error);
      }
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (!user?.uid) {
      setBoardNotifications([]);
      return;
    }
    setBoardNotifications(getAllBoardNotificationStatus(user.uid));
  }, [user?.uid]);

  useEffect(() => {
    const handleFocus = () => {
      if (user?.uid) {
        setBoardNotifications(getAllBoardNotificationStatus(user.uid));
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user?.uid]);

  if (loading) {
    return <GlobalLoadingScreen message="홈 화면을 불러오는 중..." />;
  }

  return (
    <div className="home-container">
      <header className="home-top-bar">
        <button
          type="button"
          className="home-top-bar__profile"
          onClick={handleProfileClick}
          title="마이페이지"
          aria-label="마이페이지"
        >
          <span className="home-header-profile-avatar">
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" decoding="async" />
            ) : (
              <User size={18} strokeWidth={2.2} aria-hidden />
            )}
          </span>
          {user?.nickname && <span className="home-top-bar__nickname">{user.nickname}</span>}
        </button>
        <button
          type="button"
          className="home-top-bar__logout"
          onClick={handleLogout}
          title="로그아웃"
          aria-label="로그아웃"
        >
          <LogOut size={16} aria-hidden />
          <span className="home-top-bar__logout-label">로그아웃</span>
        </button>
      </header>

      <main className="home-content">
        <section className="logo-section" aria-label="브랜드">
          <div className="logo-with-bubble">
            <img
              src="/veryus_logo.png"
              alt="VERYUS"
              className="logo-image"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '/veryus-logo.svg';
              }}
            />
            <AnonymousNoteBubble />
          </div>
          <div className="brand-text">
            <h1 className="home-title">VERYUS</h1>
            <p className="home-slogan">다양한 음악을 우리답게</p>
          </div>
        </section>

        <section className="boards-section" aria-label="게시판 바로가기">
          <h2 className="boards-section__title">게시판</h2>
          <div className="boards-cross-layout">
            {BOARDS.map((board) => {
              const hasNewPosts = getBoardNotification(board.boardType);
              return (
                <button
                  key={board.path}
                  type="button"
                  className={`bubble-button ${board.layoutClass} bubble-${board.slug}`}
                  onClick={() => navigateToBoard(board)}
                  style={{ '--board-color': board.color } as React.CSSProperties}
                >
                  <span className="bubble-icon">
                    <board.icon />
                    {hasNewPosts && <span className="board-notification-dot" aria-label="새 글" />}
                  </span>
                  <span className="bubble-name">{board.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default HomeClassic;
