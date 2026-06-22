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
  getAllBoardNotificationStatus,
  isPostNewSinceBoardVisit,
} from '../utils/simpleBoardNotification';
import { fetchHomeBoardPreviews, type HomeBoardPreviewMap } from '../utils/homeBoardPreviews';
import HomeNotebookBody from './HomeNotebookBody';

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
  path: string;
  boardType: 'free' | 'recording' | 'evaluation' | 'hallOfFame' | 'partner';
  slug: string;
  showLatestPreview?: boolean;
}

const BOARDS: BoardItem[] = [
  { name: '자유게시판', path: '/free', boardType: 'free', slug: 'free', showLatestPreview: true },
  { name: '녹음게시판', path: '/recording', boardType: 'recording', slug: 'recording', showLatestPreview: true },
  { name: '명예의전당', path: '/hall-of-fame', boardType: 'hallOfFame', slug: 'hall-of-fame' },
  { name: '평가게시판', path: '/evaluation', boardType: 'evaluation', slug: 'evaluation', showLatestPreview: true },
  { name: '파트너모집', path: '/boards/partner', boardType: 'partner', slug: 'partner', showLatestPreview: true },
];

const HomeNotebook: React.FC = () => {
  const { profile } = useUserProfile();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardNotifications, setBoardNotifications] = useState<any[]>([]);
  const [boardPreviews, setBoardPreviews] = useState<HomeBoardPreviewMap>({});
  const [previewsLoading, setPreviewsLoading] = useState(true);
  const [visitRevision, setVisitRevision] = useState(0);
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

  const bumpVisitRevision = () => setVisitRevision((v) => v + 1);

  const navigateToBoard = (board: BoardItem) => {
    if (user?.uid) {
      markBoardAsVisited(user.uid, board.boardType);
      setBoardNotifications(getAllBoardNotificationStatus(user.uid));
      bumpVisitRevision();
    }
    navigate(board.path);
  };

  const loadBoardPreviews = () => {
    setPreviewsLoading(true);
    void fetchHomeBoardPreviews()
      .then(setBoardPreviews)
      .finally(() => setPreviewsLoading(false));
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
    loadBoardPreviews();
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      if (user?.uid) {
        setBoardNotifications(getAllBoardNotificationStatus(user.uid));
        bumpVisitRevision();
      }
      loadBoardPreviews();
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

        <section className="boards-section notebook-section notebook-section--index" aria-label="게시판 바로가기">
          <h2 className="notebook-section__title">
            <span className="notebook-section__numeral">I.</span>
            <span>목차</span>
          </h2>
          <nav className="boards-notebook-list" aria-label="게시판 목록">
            {BOARDS.map((board) => {
              const hasNewPosts = getBoardNotification(board.boardType);
              const previews = boardPreviews[board.boardType] ?? [];
              const preview = previews[0];
              const isPreviewNew =
                preview &&
                visitRevision >= 0 &&
                isPostNewSinceBoardVisit(user?.uid, board.boardType, preview.createdAtMs);

              return (
                <div key={board.path} className="notebook-index-group">
                  <button
                    type="button"
                    className="notebook-index-row"
                    onClick={() => navigateToBoard(board)}
                  >
                    <span className="notebook-index-item">{board.name}</span>
                    {board.showLatestPreview && previewsLoading ? (
                      <span className="notebook-index-inline-preview notebook-index-inline-preview--loading" aria-hidden>
                        <span className="notebook-index-preview-skeleton" />
                      </span>
                    ) : preview ? (
                      <span className="notebook-index-inline-preview" aria-hidden>
                        <span className="notebook-index-inline-preview__text">
                          <span className="notebook-index-preview__author">{preview.writerNickname}</span>
                          <span className="notebook-index-preview__title">{preview.title}</span>
                        </span>
                        {isPreviewNew && (
                          <span className="notebook-index-preview__new">NEW</span>
                        )}
                      </span>
                    ) : hasNewPosts ? (
                      <span className="notebook-index-item__dot" aria-label="새 글" />
                    ) : null}
                  </button>
                </div>
              );
            })}
          </nav>
        </section>

        <HomeNotebookBody user={user} />
      </main>
    </div>
  );
};

export default HomeNotebook;
