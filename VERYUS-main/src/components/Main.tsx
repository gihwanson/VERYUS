import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { 
  Coffee, 
  MapPin, 
  Gift, 
  Star, 
  LogOut,
  Bell,
  Calendar,
  Users
} from 'lucide-react';
import './Main.css';

interface User {
  uid: string;
  email: string;
  nickname?: string;
  role?: string;
  grade?: string;
  profileImageUrl?: string;
  isLoggedIn: boolean;
}

interface FeatureCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    id: 'menu',
    title: '메뉴 보기',
    description: '다양한 음료와 디저트를 확인하세요',
    icon: Coffee,
    path: '/menu'
  },
  {
    id: 'locations',
    title: '매장 찾기',
    description: '가까운 베리어스 카페를 찾아보세요',
    icon: MapPin,
    path: '/locations'
  },
  {
    id: 'events',
    title: '이벤트',
    description: '진행 중인 이벤트와 혜택을 확인하세요',
    icon: Gift,
    path: '/events'
  },
  {
    id: 'reviews',
    title: '리뷰',
    description: '다른 고객들의 후기를 살펴보세요',
    icon: Star,
    path: '/reviews'
  },
  {
    id: 'notice',
    title: '공지사항',
    description: '베리어스의 새로운 소식을 확인하세요',
    icon: Bell,
    path: '/notice'
  },
  {
    id: 'schedule',
    title: '스케줄',
    description: '버스킹 일정을 확인하세요',
    icon: Calendar,
    path: '/schedule'
  },
  {
    id: 'members',
    title: '멤버소개',
    description: '베리어스 멤버들을 만나보세요',
    icon: Users,
    path: '/members'
  }
];

const Main: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 사용자 정보 로드
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userString = localStorage.getItem('veryus_user');
        if (!userString) {
          navigate('/login');
          return;
        }

        const userData: User = JSON.parse(userString);
        if (!userData.isLoggedIn) {
          navigate('/login');
          return;
        }

        // Firestore에서 최신 사용자 정보 가져오기
        const userDoc = await getDoc(doc(db, 'users', userData.uid));
        if (userDoc.exists()) {
          const latestUserData = userDoc.data();
          const updatedUser = {
            ...userData,
            ...latestUserData
          };
          localStorage.setItem('veryus_user', JSON.stringify(updatedUser));
          setUser(updatedUser);
        } else {
          setUser(userData);
        }
      } catch (error) {
        console.error('사용자 데이터 로드 에러:', error);
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [navigate]);

  // 로그아웃 처리
  const handleLogout = useCallback(async (): Promise<void> => {
    try {
      await signOut(auth);
      localStorage.removeItem('veryus_user');
      navigate('/login');
    } catch (error) {
      console.error('로그아웃 에러:', error);
      alert('로그아웃 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  }, [navigate]);

  // 카드 클릭 핸들러
  const handleCardClick = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="main-container">
      <div className="main-header">
        <h1>VERYUS CAFE</h1>
        <div className="header-right">
          <span className="user-info">
            {user?.grade && <span className="user-grade">{user.grade}</span>}
            <span className="user-name">{user?.nickname || user?.email}</span>
          </span>
          <button 
            onClick={handleLogout} 
            className="logout-button"
            aria-label="로그아웃"
          >
            <LogOut size={16} />
            <span>로그아웃</span>
          </button>
        </div>
      </div>
      
      <div className="main-content">
        <div className="welcome-section">
          <h2>환영합니다! 🎉</h2>
          <p>안녕하세요, <strong>{user?.nickname || user?.email}</strong>님!</p>
          <p>베리어스 카페 앱에 성공적으로 로그인하셨습니다.</p>
          {user?.role && (
            <p className="user-role">
              현재 권한: <strong>{user.role}</strong>
            </p>
          )}
        </div>
        
        <div className="feature-grid">
          {FEATURE_CARDS.map((card) => (
            <div
              key={card.id}
              className="feature-card"
              onClick={() => handleCardClick(card.path)}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleCardClick(card.path);
                }
              }}
            >
              <card.icon size={24} />
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Main; 