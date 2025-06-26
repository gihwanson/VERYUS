import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onSnapshot, doc } from 'firebase/firestore';
import { User } from 'lucide-react';
import './Home.css';
import DailyFortune from './DailyFortune';
import { db } from '../firebase';
import { 
  markBoardAsVisited,
  getAllBoardNotificationStatus
} from '../utils/simpleBoardNotification';

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

// DropdownItem interface removed - no longer needed

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
  const [dailyFortuneOpen, setDailyFortuneOpen] = useState(false);
  const [boardNotifications, setBoardNotifications] = useState<any[]>([]);

  const navigate = useNavigate();

  // 프로필 클릭 핸들러
  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDailyFortuneOpen(!dailyFortuneOpen);
  };

  // 게시판 네비게이션 - 방문 기록 저장
  const navigateToBoard = (path: string) => {
    if (user?.uid) {
      // 경로에 따라 게시판 타입 결정
      let boardType: string | null = null;
      
      if (path === '/free') boardType = 'free';
      else if (path === '/recording') boardType = 'recording';
      else if (path === '/evaluation') boardType = 'evaluation';
      else if (path === '/boards/partner') boardType = 'partner';
      
      // 게시판 방문 기록 저장
      if (boardType) {
        markBoardAsVisited(user.uid, boardType);
        
        // 즉시 알림 상태 업데이트
        const notifications = getAllBoardNotificationStatus(user.uid);
        setBoardNotifications(notifications);
      }
    }
    
    navigate(path);
  };

  // 특정 게시판의 새 게시글 알림 상태 가져오기
  const getBoardNotification = (boardType: string): boolean => {
    const notification = boardNotifications.find(n => n.boardType === boardType);
    return notification?.hasNewPosts || false;
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

  // useEffect for dropdown click outside and notifications removed - no longer needed

  // 게시판 알림 상태 로드
  useEffect(() => {
    if (!user?.uid) {
      setBoardNotifications([]);
      return;
    }

    // 초기 알림 상태 로드
    const notifications = getAllBoardNotificationStatus(user.uid);
    setBoardNotifications(notifications);
  }, [user?.uid]);

  // 페이지 포커스 시 알림 상태 새로고침
  useEffect(() => {
    const handleFocus = () => {
      if (user?.uid) {
        const notifications = getAllBoardNotificationStatus(user.uid);
        setBoardNotifications(notifications);
      }
    };

    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
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
        {/* 프로필 버튼 - 오늘의 운세 */}
        <div className="profile-section">
          <button
            className="profile-button"
            onClick={handleProfileClick}
            title="오늘의 운세와 추천곡 보기"
          >
            <div className="profile-info">
              <div className="profile-avatar">
                {user?.profileImageUrl ? (
                  <img src={user.profileImageUrl} alt="프로필" />
                ) : (
                  <User size={16} />
                )}
              </div>
            </div>
          </button>
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
            {BOARDS.map((board, index) => {
              // 경로에 따라 게시판 타입 결정
              let boardType: 'free' | 'recording' | 'evaluation' | 'partner' | null = null;
              if (board.path === '/free') boardType = 'free';
              else if (board.path === '/recording') boardType = 'recording';
              else if (board.path === '/evaluation') boardType = 'evaluation';
              else if (board.path === '/boards/partner') boardType = 'partner';

              const hasNewPosts = boardType ? getBoardNotification(boardType) : false;

              return (
                <div 
                  key={index} 
                  className={`bubble-button bubble-${board.path.replace('/', '').replace('boards/', '')}`}
                  onClick={() => navigateToBoard(board.path)}
                  style={{ '--board-color': board.color } as React.CSSProperties}
                >
                  <div className="bubble-icon" style={{ position: 'relative' }}>
                    <board.icon />
                    {hasNewPosts && (
                      <span 
                        className="board-notification-dot"
                        style={{
                          position: 'absolute',
                          top: '-2px',
                          right: '-8px',
                          width: '10px',
                          height: '10px',
                          backgroundColor: '#ff4757',
                          borderRadius: '50%',
                          border: '2px solid white',
                          zIndex: 1,
                          animation: 'pulse 2s infinite'
                        }}
                      />
                    )}
                  </div>
                  <span className="bubble-name">{board.name}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 오늘의 운세 모달 */}
      {user && (
        <DailyFortune
          user={user}
          isOpen={dailyFortuneOpen}
          onClose={() => setDailyFortuneOpen(false)}
        />
      )}
    </div>
  );
};

export default Home; 