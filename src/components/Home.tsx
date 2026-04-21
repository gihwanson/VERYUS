import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { User, LogOut, Search } from 'lucide-react';
import './Home.css';
import AnonymousNoteBubble from './AnonymousNoteBubble';
import { auth, db } from '../firebase';
import { useUserProfile } from '../contexts/UserProfileContext';
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

type MemberSearchHit = { uid: string; nickname: string; profileImageUrl?: string };

async function searchMembersByNickname(raw: string): Promise<MemberSearchHit[]> {
  const q = raw.trim();
  if (!q) return [];

  const exactSnap = await getDocs(
    query(collection(db, 'users'), where('nickname', '==', q), limit(8))
  );
  if (!exactSnap.empty) {
    return exactSnap.docs.map((d) => ({
      uid: d.id,
      nickname: d.data().nickname as string,
      profileImageUrl: d.data().profileImageUrl as string | undefined
    }));
  }

  const prefixSnap = await getDocs(
    query(
      collection(db, 'users'),
      where('nickname', '>=', q),
      where('nickname', '<=', `${q}\uf8ff`),
      limit(20)
    )
  );
  return prefixSnap.docs.map((d) => ({
    uid: d.id,
    nickname: d.data().nickname as string,
    profileImageUrl: d.data().profileImageUrl as string | undefined
  }));
}

// Constants
const BOARDS: BoardItem[] = [
  { name: '자유게시판', icon: () => <span style={{fontSize: 36}}>💬</span>, path: '/free', color: '#667eea' },
  { name: '녹음게시판', icon: () => <span style={{fontSize: 36}}>🎙️</span>, path: '/recording', color: '#f093fb' },
  { name: '밸런스게시판', icon: () => <span style={{fontSize: 28, fontWeight: 800}}>VS</span>, path: '/balance', color: '#ff9ff3' },
  { name: '평가게시판', icon: () => <span style={{fontSize: 36}}>📝</span>, path: '/evaluation', color: '#ffeaa7' },
  { name: '파트너모집', icon: () => <span style={{fontSize: 36}}>🤝</span>, path: '/boards/partner', color: '#55efc4' }
];

interface HomeProps {
  onSearchOpen?: () => void;
}

const Home: React.FC<HomeProps> = ({ onSearchOpen }) => {
  const { profile } = useUserProfile();
  // State
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardNotifications, setBoardNotifications] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState('');
  const [memberHits, setMemberHits] = useState<MemberSearchHit[]>([]);
  const [memberSuggestLoading, setMemberSuggestLoading] = useState(false);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [memberSuggestOpen, setMemberSuggestOpen] = useState(true);
  const memberSearchWrapRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();

  // 프로필 클릭 → 마이페이지
  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate('/mypage');
  };

  const goToMemberMypage = useCallback(
    (hit: MemberSearchHit) => {
      setMemberSuggestOpen(false);
      setMemberHits([]);
      setMemberSearch('');
      setDebouncedMemberSearch('');
      if (user?.uid && hit.uid === user.uid) {
        navigate('/mypage');
        return;
      }
      navigate(`/mypage/${hit.uid}`);
    },
    [navigate, user?.uid]
  );

  // 입력 디바운스 (실시간 제안용)
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedMemberSearch(memberSearch), 280);
    return () => window.clearTimeout(t);
  }, [memberSearch]);

  // 디바운스된 닉네임으로 멤버 목록 조회
  useEffect(() => {
    const q = debouncedMemberSearch.trim();
    if (!q) {
      setMemberHits([]);
      setMemberSuggestLoading(false);
      return;
    }
    let cancelled = false;
    setMemberSuggestLoading(true);
    void searchMembersByNickname(q)
      .then((hits) => {
        if (cancelled) return;
        setMemberHits(hits);
      })
      .catch((err) => {
        console.error('멤버 자동완성 실패:', err);
        if (!cancelled) setMemberHits([]);
      })
      .finally(() => {
        if (!cancelled) setMemberSuggestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedMemberSearch]);

  const runMemberSearch = useCallback(async () => {
    const q = memberSearch.trim();
    if (!q) {
      toast.info('닉네임을 입력해 주세요.');
      return;
    }
    const suggestionsMatchCurrent =
      debouncedMemberSearch.trim() === q && memberHits.length >= 1;
    if (suggestionsMatchCurrent) {
      goToMemberMypage(memberHits[0]);
      return;
    }
    setMemberSearchLoading(true);
    try {
      const hits = await searchMembersByNickname(q);
      if (hits.length === 0) {
        toast.error('일치하는 멤버를 찾을 수 없습니다.');
        return;
      }
      goToMemberMypage(hits[0]);
    } catch (err) {
      console.error('멤버 검색 실패:', err);
      toast.error('검색 중 오류가 발생했습니다.');
    } finally {
      setMemberSearchLoading(false);
    }
  }, [memberSearch, debouncedMemberSearch, memberHits, goToMemberMypage]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = memberSearchWrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setMemberSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  // 로그아웃 핸들러
  const handleLogout = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('로그아웃 하시겠습니까?')) {
      try {
        await signOut(auth);
        localStorage.removeItem('veryus_user');
        navigate('/login');
      } catch (error) {
        console.error('로그아웃 에러:', error);
        toast.error('로그아웃 중 오류가 발생했습니다.');
      }
    }
  };

  // 게시판 네비게이션 - 방문 기록 저장
  const navigateToBoard = (path: string) => {
    if (user?.uid) {
      // 경로에 따라 게시판 타입 결정
      let boardType: string | null = null;
      
      if (path === '/free') boardType = 'free';
      else if (path === '/recording') boardType = 'recording';
      else if (path === '/evaluation') boardType = 'evaluation';
      else if (path === '/balance') boardType = 'balance';
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

  // Effects — 전역 UserProfileContext가 Firestore와 localStorage를 동기화함
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

  const showMemberSuggestPanel =
    memberSuggestOpen && memberSearch.trim().length > 0;

  return (
    <div className="home-container">
      {/* 좌측 상단 — 멤버 닉네임 검색 (넓은 입력 + 실시간 목록) */}
      <div className="home-search-fixed-left" ref={memberSearchWrapRef}>
        <div className="home-member-search-inner">
          <Search className="home-member-search-icon" size={18} aria-hidden />
          <input
            type="search"
            className="home-member-search-input"
            value={memberSearch}
            onChange={(e) => {
              setMemberSearch(e.target.value);
              setMemberSuggestOpen(true);
            }}
            onFocus={() => setMemberSuggestOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runMemberSearch();
              }
            }}
            placeholder="닉네임을 검색하세요"
            enterKeyHint="search"
            aria-label="멤버 닉네임 검색"
            aria-autocomplete="list"
            aria-expanded={showMemberSuggestPanel}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="home-member-search-submit"
            onClick={() => void runMemberSearch()}
            disabled={memberSearchLoading}
            aria-label="멤버 검색 실행"
          >
            {memberSearchLoading ? '…' : '이동'}
          </button>
        </div>
        {showMemberSuggestPanel && (
          <div className="home-member-search-dropdown" role="listbox" aria-label="검색된 멤버">
            {memberSuggestLoading ? (
              <div className="home-member-search-suggest-status">검색 중…</div>
            ) : memberHits.length === 0 ? (
              <div className="home-member-search-suggest-status">일치하는 멤버가 없습니다.</div>
            ) : (
              <ul className="home-member-search-suggest-list">
                {memberHits.map((hit) => (
                  <li key={hit.uid}>
                    <button
                      type="button"
                      className="home-member-search-hit"
                      onClick={() => goToMemberMypage(hit)}
                    >
                      {hit.profileImageUrl ? (
                        <img src={hit.profileImageUrl} alt="" className="home-member-search-avatar" />
                      ) : (
                        <span className="home-member-search-avatar-fallback">{hit.nickname?.charAt(0) || '?'}</span>
                      )}
                      <span className="home-member-search-nick">{hit.nickname}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 우측 상단 — 프로필 · 로그아웃 */}
      <div className="fixed-header">
        <div className="profile-section" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="profile-button"
            type="button"
            onClick={handleProfileClick}
            title="마이페이지"
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
          <button
            className="logout-button"
            onClick={handleLogout}
            title="로그아웃"
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1.5px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '20px',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              color: 'white',
              fontSize: '12px',
              fontWeight: 600,
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.35)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.6)';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <LogOut size={14} />
            <span>로그아웃</span>
          </button>
        </div>
      </div>

      {/* 메인 컨텐트 */}
      <div className="home-content">
        {/* 로고 섹션 */}
        <div className="logo-section">
          <div className="logo-with-bubble">
            <img 
              src="/veryus_logo.png" 
              alt="VERYUS Logo" 
              className="logo-image"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = "/veryus-logo.svg";
              }}
            />
            <AnonymousNoteBubble />
          </div>
          <div className="brand-text">
            <h1 className="home-title">VERYUS</h1>
            <p className="home-slogan">다양한 음악을 우리답게</p>
          </div>
        </div>

        {/* 게시판 바로가기 */}
        <div className="boards-section">
          <div className="boards-cross-layout">
            {BOARDS.map((board, index) => {
              let boardType: 'free' | 'recording' | 'evaluation' | 'balance' | 'partner' | null = null;
              if (board.path === '/free') boardType = 'free';
              else if (board.path === '/recording') boardType = 'recording';
              else if (board.path === '/evaluation') boardType = 'evaluation';
              else if (board.path === '/balance') boardType = 'balance';
              else if (board.path === '/boards/partner') boardType = 'partner';

              const hasNewPosts = boardType ? getBoardNotification(boardType) : false;
              const boardClass = board.path === '/balance'
                ? 'bubble-center'
                : board.path === '/free'
                  ? 'bubble-top-left'
                  : board.path === '/recording'
                    ? 'bubble-top-right'
                    : board.path === '/evaluation'
                      ? 'bubble-bottom-left'
                      : 'bubble-bottom-right';

              return (
                <div
                  key={index}
                  className={`bubble-button ${boardClass} bubble-${board.path.replace('/', '').replace('boards/', '')}`}
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
    </div>
  );
};

export default Home; 