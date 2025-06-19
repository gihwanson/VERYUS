import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, orderBy, limit, getDocs, onSnapshot, where, doc, getDoc, setDoc, updateDoc, addDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { 
  Users, 
  MessageSquare, 
  Mic, 
  Star, 
  UserPlus,
  Calendar,
  MapPin,
  Clock,
  Bell,
  Music,
  FileText,
  Edit,
  ChevronDown,
  Settings,
  LogOut,
  User,
  Plus,
  Trophy,
  Coffee,
  Gift,
  Search
} from 'lucide-react';
import './Home.css';
import SpecialMomentsCard from './SpecialMomentsCard';
import { collection as fbCollection, getDocs as fbGetDocs, query as fbQuery, where as fbWhere, limit as fbLimit } from 'firebase/firestore';
import { useAudioPlayer } from '../App';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import type { PlaylistSong } from '../App';

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

interface Post {
  id: string;
  title: string;
  author: string;
  createdAt: Date;
  score?: number;
  type: 'recording' | 'evaluation' | 'notice';
}

interface BuskingSchedule {
  date: string;
  location: string;
  dDay: number;
}

interface TeamInfo {
  foundDate: string;
  location: string;
  purpose: string;
}

interface Activity {
  id: string;
  date: string;
  title: string;
  description: string;
  participants: number;
  createdAt?: Date;
  createdBy?: string;
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
}

interface Contest {
  id: string;
  title: string;
  type: string;
  deadline: any;
  ended?: boolean;
}

// Constants
const POSTS_PER_PAGE = 10;
const DEFAULT_BUSKING_SCHEDULE: BuskingSchedule = {
  date: '2024.12.25',
  location: '홍대 걷고싶은거리',
  dDay: 30
};

const DEFAULT_TEAM_INFO: TeamInfo = {
  foundDate: '2023.03.15',
  location: '서울 홍대, 강남',
  purpose: '거리 음악을 통한 소통과 성장'
};

const BOARDS: BoardItem[] = [
  { name: '자유게시판', icon: MessageSquare, path: '/free' },
  { name: '녹음게시판', icon: Mic, path: '/recording' },
  { name: '평가게시판', icon: Star, path: '/evaluation' },
  { name: '파트너모집', icon: UserPlus, path: '/boards/partner' }
];

const GRADE_ORDER = [
  '🌙', '⭐', '⚡', '🍺', '🌌', '☀️', '🪐', '🌍', '🍉', '🍈', '🍎', '🥝', '🫐', '🍒'
];

interface HomeProps {
  onSearchOpen?: () => void;
}

const Home: React.FC<HomeProps> = ({ onSearchOpen }) => {
  // State
  const [user, setUser] = useState<User | null>(null);
  const [recentPosts, setRecentPosts] = useState<Post[]>([]);
  const [buskingSchedule, setBuskingSchedule] = useState<BuskingSchedule>(DEFAULT_BUSKING_SCHEDULE);
  const [tempBuskingSchedule, setTempBuskingSchedule] = useState<BuskingSchedule>(DEFAULT_BUSKING_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState(false);
  const [editingTeamInfo, setEditingTeamInfo] = useState(false);
  const [editingBusking, setEditingBusking] = useState(false);
  const [noticeContent, setNoticeContent] = useState('🎤 12월 정기 버스킹이 홍대에서 진행됩니다! 많은 참여 부탁드려요.');
  const [teamInfo, setTeamInfo] = useState<TeamInfo>(DEFAULT_TEAM_INFO);
  const [editingActivity, setEditingActivity] = useState(false);
  const [activityHistory, setActivityHistory] = useState<Activity[]>([]);
  const [recentFree, setRecentFree] = useState<Post | null>(null);
  const [recentRecording, setRecentRecording] = useState<Post | null>(null);
  const [recentEvaluation, setRecentEvaluation] = useState<Post | null>(null);
  const [recentPartner, setRecentPartner] = useState<Post | null>(null);
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [latestContest, setLatestContest] = useState<Contest | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [searchNickname, setSearchNickname] = useState('');
  const [nicknameResults, setNicknameResults] = useState<any[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingEmojiIdx, setLoadingEmojiIdx] = useState(0);
  const { playlist, setPlaylist, play, currentIdx, isPlaying, pause } = useAudioPlayer();
  const [playlistSongs, setPlaylistSongs] = useState<PlaylistSong[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState<{ title: string; artist: string; file: File | null }>({ title: '', artist: '', file: null });
  const [showUploadForm, setShowUploadForm] = useState(false);

  const navigate = useNavigate();

  // home-header 레이아웃 개선: 모바일에서 로고는 항상 왼쪽, 검색창/프로필은 아래에 세로로 쌓임
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  // handleLogout 함수를 먼저 정의
  const handleLogout = useCallback(async (): Promise<void> => {
    try {
      await signOut(auth);
      localStorage.removeItem('veryus_user');
      navigate('/login');
    } catch (error) {
      console.error('로그아웃 에러:', error);
    }
  }, [navigate]);

  // Memoized values
  const isAdmin = useCallback((user: User | null): boolean => {
    if (user) {
      return user.nickname === '너래' || user.role === '리더' || user.role === '운영진';
    }
    
    // user가 null인 경우에만 localStorage 확인
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

  const dropdownItems: DropdownItem[] = useMemo(() => [
    { name: '연습장', icon: () => <span style={{fontSize:18}}>🎹</span>, action: () => navigate('/practice-room') },
    { name: '합격곡', icon: () => <span style={{fontSize:18}}>🏆</span>, action: () => navigate('/approved-songs') },
    { name: '마이페이지', icon: () => <span style={{fontSize:18}}>👤</span>, action: () => navigate('/mypage') },
    { name: '쪽지함', icon: () => <span style={{fontSize:18}}>💌</span>, action: () => navigate('/messages'), badge: hasNewMessage ? '●' : undefined },
    { name: '알림', icon: () => <span style={{fontSize:18}}>🔔</span>, action: () => navigate('/notifications'), badge: unreadNotificationCount > 0 ? String(unreadNotificationCount) : undefined },
    { name: '콘테스트', icon: () => <span style={{fontSize:18}}>🎤</span>, action: () => navigate('/contests') },
    { name: '설정', icon: () => <span style={{fontSize:18}}>⚙️</span>, action: () => navigate('/settings') },
    ...(isAdmin(user) ? [
      { name: '관리자 패널', icon: () => <span style={{fontSize:18}}>🛠️</span>, action: () => navigate('/admin-user') }
    ] : []),
    { name: '로그아웃', icon: () => <span style={{fontSize:18}}>🚪</span>, action: handleLogout }
  ], [user, navigate, isAdmin, handleLogout, hasNewMessage, unreadNotificationCount]);

  // Firestore data fetching
  const loadFirestoreData = useCallback(async () => {
    try {
      const [noticeDoc, teamInfoDoc, buskingDoc, activityDoc] = await Promise.all([
        getDoc(doc(db, 'settings', 'notice')),
        getDoc(doc(db, 'settings', 'teamInfo')),
        getDoc(doc(db, 'settings', 'buskingSchedule')),
        getDoc(doc(db, 'settings', 'activityHistory'))
      ]);

      if (noticeDoc.exists()) {
        setNoticeContent(noticeDoc.data().content);
      }

      if (teamInfoDoc.exists()) {
        const data = teamInfoDoc.data();
        setTeamInfo({
          foundDate: data.foundDate || DEFAULT_TEAM_INFO.foundDate,
          location: data.location || DEFAULT_TEAM_INFO.location,
          purpose: data.purpose || DEFAULT_TEAM_INFO.purpose
        });
      }

      if (buskingDoc.exists()) {
        const data = buskingDoc.data();
        const schedule: BuskingSchedule = {
          date: data.date || DEFAULT_BUSKING_SCHEDULE.date,
          location: data.location || DEFAULT_BUSKING_SCHEDULE.location,
          dDay: calculateDDay(data.date)
        };
        setBuskingSchedule(schedule);
        setTempBuskingSchedule(schedule);
      }

      if (activityDoc.exists()) {
        setActivityHistory(activityDoc.data().activities || []);
      }
    } catch (error) {
      console.error('데이터 로딩 오류:', error);
    }
  }, []);

  // Utility functions
  const calculateDDay = useCallback((targetDate: string): number => {
    const today = new Date();
    const target = new Date(targetDate.replace(/\./g, '-'));
    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, []);

  // Effects
  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        const basicUserData = JSON.parse(userString);
        // 즉시 기본 사용자 데이터로 상태 설정
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
    loadFirestoreData();
  }, [loadFirestoreData]);

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

  useEffect(() => {
    const fetchRecentPosts = async () => {
      // 자유게시판
      const freeSnap = await getDocs(query(collection(db, 'posts'), where('type', '==', 'free'), orderBy('createdAt', 'desc'), limit(1)));
      setRecentFree(freeSnap.docs[0] ? { id: freeSnap.docs[0].id, ...freeSnap.docs[0].data() } as Post : null);
      // 녹음게시판
      const recSnap = await getDocs(query(collection(db, 'posts'), where('type', '==', 'recording'), orderBy('createdAt', 'desc'), limit(1)));
      setRecentRecording(recSnap.docs[0] ? { id: recSnap.docs[0].id, ...recSnap.docs[0].data() } as Post : null);
      // 평가게시판
      const evalSnap = await getDocs(query(collection(db, 'posts'), where('type', '==', 'evaluation'), orderBy('createdAt', 'desc'), limit(1)));
      setRecentEvaluation(evalSnap.docs[0] ? { id: evalSnap.docs[0].id, ...evalSnap.docs[0].data() } as Post : null);
      // 파트너모집
      const partnerSnap = await getDocs(query(collection(db, 'posts'), where('type', '==', 'partner'), orderBy('createdAt', 'desc'), limit(1)));
      setRecentPartner(partnerSnap.docs[0] ? { id: partnerSnap.docs[0].id, ...partnerSnap.docs[0].data() } as Post : null);
    };
    fetchRecentPosts();
  }, []);

  // Save handlers
  const handleSaveNotice = async () => {
    try {
      await setDoc(doc(db, 'settings', 'notice'), {
        content: noticeContent,
        updatedAt: new Date(),
        updatedBy: user?.nickname || user?.email
      });
      setEditingNotice(false);
    } catch (error) {
      console.error('공지사항 저장 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleSaveTeamInfo = async () => {
    try {
      await setDoc(doc(db, 'settings', 'teamInfo'), {
        ...teamInfo,
        updatedAt: new Date(),
        updatedBy: user?.nickname || user?.email
      });
      setEditingTeamInfo(false);
    } catch (error) {
      console.error('팀 정보 저장 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleSaveBusking = async () => {
    try {
      await setDoc(doc(db, 'settings', 'buskingSchedule'), {
        ...tempBuskingSchedule,
        updatedAt: new Date(),
        updatedBy: user?.nickname || user?.email
      });
      setBuskingSchedule(tempBuskingSchedule);
      setEditingBusking(false);
    } catch (error) {
      console.error('버스킹 일정 저장 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  // Activity handlers
  const handleAddActivity = async () => {
    const newActivity: Activity = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
      title: '새로운 활동',
      description: '활동 설명을 입력하세요',
      participants: 0,
      createdAt: new Date(),
      createdBy: user?.nickname || user?.email
    };
    
    try {
      const newActivityHistory = [newActivity, ...activityHistory];
      await setDoc(doc(db, 'settings', 'activityHistory'), {
        activities: newActivityHistory,
        updatedAt: new Date(),
        updatedBy: user?.nickname || user?.email
      });
      setActivityHistory(newActivityHistory);
    } catch (error) {
      console.error('활동 추가 오류:', error);
      alert('활동 추가 중 오류가 발생했습니다.');
    }
  };

  const handleUpdateActivity = async (id: string, field: string, value: string | number) => {
    const newActivityHistory = activityHistory.map(activity => 
      activity.id === id ? { ...activity, [field]: value } : activity
    );
    setActivityHistory(newActivityHistory);
    
    try {
      await setDoc(doc(db, 'settings', 'activityHistory'), {
        activities: newActivityHistory,
        updatedAt: new Date(),
        updatedBy: user?.nickname || user?.email
      });
    } catch (error) {
      console.error('활동 수정 오류:', error);
    }
  };

  const handleDeleteActivity = async (id: string) => {
    try {
      const newActivityHistory = activityHistory.filter(activity => activity.id !== id);
      await setDoc(doc(db, 'settings', 'activityHistory'), {
        activities: newActivityHistory,
        updatedAt: new Date(),
        updatedBy: user?.nickname || user?.email
      });
      setActivityHistory(newActivityHistory);
    } catch (error) {
      console.error('활동 삭제 오류:', error);
      alert('활동 삭제 중 오류가 발생했습니다.');
    }
  };

  const navigateToBoard = (path: string) => {
    if (path === '/free' || path === '/recording' || path === '/boards/partner' || path === '/evaluation') {
      navigate(path);
    } else {
      alert(`${path} 페이지로 이동합니다. (추후 구현)`);
    }
  };

  // 쪽지함 새 쪽지 감지 useEffect
  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    const user = userString ? JSON.parse(userString) : null;
    if (!user) return;
    let unsubscribe: (() => void) | undefined;
    if (db && db instanceof Object && 'collection' in db) {
      unsubscribe = onSnapshot(
        query(collection(db, 'messages'), where('toUid', '==', user.uid), where('isRead', '==', false)),
        (snap) => {
          setHasNewMessage(!snap.empty);
        }
      );
    }
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // 최신 콘테스트 불러오기
  useEffect(() => {
    const q = query(collection(db, 'contests'), orderBy('deadline', 'desc'), limit(5));
    const unsub = onSnapshot(q, (snap) => {
      const filtered = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Contest))
        .filter((contest: Contest) => contest.type !== '세미등급전');
      if (filtered.length > 0) {
        setLatestContest(filtered[0]);
      } else {
        setLatestContest(null);
      }
    });
    return () => unsub();
  }, []);

  // 알림 새 알림 개수 감지 useEffect
  useEffect(() => {
    // user 상태나 localStorage에서 사용자 정보 가져오기
    const userData = user || (localStorage.getItem('veryus_user') ? JSON.parse(localStorage.getItem('veryus_user')!) : null);
    
    if (!userData || !userData.uid) {
      console.log('알림 구독 실패: 사용자 정보 없음', { user, userData });
      setUnreadNotificationCount(0);
      return;
    }

    console.log('알림 개수 구독 시작:', userData.uid, userData.nickname);
    
    const notificationsQuery = query(
      collection(db, 'notifications'), 
      where('toUid', '==', userData.uid), 
      where('isRead', '==', false)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const count = snapshot.size;
        console.log('읽지 않은 알림 개수:', count);
        console.log('알림 목록:', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setUnreadNotificationCount(count);
      },
      (error) => {
        console.error('알림 개수 구독 에러:', error);
        setUnreadNotificationCount(0);
      }
    );

    return () => {
      console.log('알림 구독 해제');
      unsubscribe();
    };
  }, [user]); // user 상태 변경 시 재구독

  // 닉네임이 없으면 강제 로그아웃 및 안내
  useEffect(() => {
    if (user && !user.nickname) {
      alert('닉네임 정보가 없습니다. 다시 로그인 해주세요.');
      localStorage.removeItem('veryus_user');
      navigate('/login');
    }
  }, [user, navigate]);

  // 자동완성 닉네임 검색
  useEffect(() => {
    if (!searchNickname.trim()) {
      setNicknameResults([]);
      setShowAutocomplete(false);
      return;
    }
    setSearchLoading(true);
    const fetch = async () => {
      const q = fbQuery(fbCollection(db, 'users'), fbWhere('nickname', '>=', searchNickname.trim()), fbWhere('nickname', '<=', searchNickname.trim() + '\uf8ff'), fbLimit(5));
      const snap = await fbGetDocs(q);
      const results = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      setNicknameResults(results);
      setShowAutocomplete(true);
      setSearchLoading(false);
    };
    fetch();
  }, [searchNickname]);

  // 닉네임 검색 및 이동
  const handleSearch = async (nickname?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const target = (nickname ?? searchNickname).trim();
    if (!target) return;
    setSearchLoading(true);
    const q = fbQuery(fbCollection(db, 'users'), fbWhere('nickname', '==', target));
    const snap = await fbGetDocs(q);
    setSearchLoading(false);
    if (!snap.empty) {
      setShowAutocomplete(false);
      setSearchError('');
      navigate(`/mypage/${snap.docs[0].id}`);
    } else {
      setSearchError('존재하지 않는 닉네임입니다.');
      setShowAutocomplete(false);
    }
  };

  // 엔터키로 검색
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch(undefined, e as any);
  };

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingEmojiIdx(idx => (idx + 1) % GRADE_ORDER.length);
    }, 350);
    return () => clearInterval(interval);
  }, [loading]);

  // 리더/운영진 권한
  const isLeaderOrAdmin = user && (user.role === '리더' || user.role === '운영진');

  // 플레이리스트 fetch
  useEffect(() => {
    const fetchSongs = async () => {
      const snap = await getDocs(query(collection(db, 'playlistSongs'), orderBy('createdAt', 'desc')));
      const songs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PlaylistSong[];
      setPlaylistSongs(songs);
      setPlaylist(songs);
    };
    fetchSongs();
  }, [setPlaylist]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <h2 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 32, marginBottom: 16 }}>VERYUS</h2>
          <div style={{ fontSize: 48, margin: '24px 0', transition: 'all 0.2s' }}>{GRADE_ORDER[loadingEmojiIdx]}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      {/* 헤더 섹션 */}
      <div className="home-header">
        <div className="header-brand">
          <img src="/veryus_logo-01.png" alt="VERYUS 로고" className="logo-image" />
          <p className="home-slogan" style={{ marginTop: 8, textAlign: 'center' }}>다양한 음악을 우리답게</p>
        </div>
        
        {/* 모바일 검색창 */}
        <div className="mobile-search-container">
          <button
            className="mobile-search-button"
            onClick={() => onSearchOpen?.()}
          >
            <Search size={16} color="#8A55CC" />
            <span>통합 검색</span>
          </button>
        </div>
        
        {/* 데스크톱 헤더 우측 아이콘들 */}
        <div className="header-actions desktop-only">
          {/* 통합 검색 아이콘 */}
          <button 
            className="search-icon-button"
            onClick={() => onSearchOpen?.()}
            title="통합 검색"
          >
            <Search size={20} color="#8A55CC" />
          </button>
          
          {/* 알림 아이콘 */}
          <button 
            className="notification-icon-button"
            onClick={() => navigate('/notifications')}
          >
            <Bell size={20} color="#8A55CC" />
            {unreadNotificationCount > 0 && (
              <span className="notification-badge">
                {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
              </span>
            )}
          </button>
          
          <div className="profile-dropdown">
            <button 
              className="profile-button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              <div className="profile-info">
                <div className="profile-avatar">
                  {user?.profileImageUrl ? (
                    <img src={user.profileImageUrl} alt="프로필" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  ) : (
                    user?.nickname ? user.nickname.charAt(0) : 'U'
                  )}
                </div>
                <span className="profile-name">
                  {user?.nickname ? user.nickname : '사용자'}
                  <span className="profile-grade">{user?.grade ? user.grade : '🍒'}</span>
                </span>
                <span className="profile-chevron">
                  <ChevronDown 
                    size={16} 
                    className={`dropdown-arrow ${dropdownOpen ? 'open' : ''}`}
                  />
                </span>
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
                    {item.badge && <span style={{ color: 'red', marginLeft: 4, fontSize: 18, fontWeight: 700 }}>{item.badge}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* 데스크톱 닉네임 검색창 */}
      <div className="nickname-search-bar desktop-only" style={{
        maxWidth: 340,
        margin: '24px auto 16px auto',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <form style={{ position: 'relative', width: '100%' }} onSubmit={e => handleSearch(undefined, e)}>
          <input
            type="text"
            value={searchNickname}
            onChange={e => { setSearchNickname(e.target.value); setSearchError(''); }}
            onFocus={() => setShowAutocomplete(!!nicknameResults.length)}
            onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
            onKeyDown={handleSearchKeyDown}
            placeholder="닉네임을 입력하세요"
            style={{ width: '100%', padding: '8px 14px', borderRadius: 8, border: '1px solid #E5DAF5', fontSize: 15, background: '#fff' }}
          />
          <button
            type="submit"
            style={{ position: 'absolute', right: 4, top: 4, background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
          >검색</button>
          {showAutocomplete && nicknameResults.length > 0 && (
            <div style={{ position: 'absolute', top: 38, left: 0, width: '100%', background: '#fff', border: '1px solid #E5DAF5', borderRadius: 8, boxShadow: '0 2px 8px #E5DAF5', zIndex: 1000 }}>
              {nicknameResults.map(u => (
                <div
                  key={u.uid}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #F6F2FF' }}
                  onMouseDown={() => handleSearch(u.nickname)}
                >
                  <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', background: '#F6F2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {u.profileImageUrl ? <img src={u.profileImageUrl} alt="프로필" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (u.nickname ? u.nickname.charAt(0) : 'U')}
                  </div>
                  <span style={{ fontWeight: 600, color: '#7C4DBC' }}>{u.nickname}</span>
                  {u.grade && <span style={{ color: '#8A55CC', fontWeight: 500 }}>{u.grade}</span>}
                  {u.role && u.role !== '일반' && <span style={{ color: '#FBBF24', fontWeight: 600, fontSize: 13, marginLeft: 4 }}>{u.role}</span>}
                </div>
              ))}
            </div>
          )}
          {searchError && <div style={{ color: '#F43F5E', fontWeight: 600, fontSize: 13, marginTop: 2 }}>{searchError}</div>}
        </form>
      </div>

      <div className="home-content">
        {/* 공지사항 카드 스타일 개선: 구분선 보라색 */}
        <div className="home-card notice-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card-header" style={{ width: '100%', borderBottom: 'none', marginBottom: 0, position: 'relative', display: 'flex', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', padding: '24px 0 0 0' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '0 auto' }}>
              <Bell className="card-icon" style={{ margin: 0, verticalAlign: 'middle' }} />
              <h3 className="card-title" style={{ fontSize: 28, fontWeight: 800, color: '#8A55CC', letterSpacing: 1, textAlign: 'center', flex: 'none', margin: 0, display: 'inline-block', verticalAlign: 'middle', marginLeft: 0 }}>공지사항</h3>
            </span>
            {isAdmin(user) && (
              <div className="edit-buttons" style={{ position: 'absolute', right: 24, top: 24 }}>
                {editingNotice ? (
                  <>
                    <button onClick={handleSaveNotice} className="save-btn">저장</button>
                    <button onClick={() => setEditingNotice(false)} className="cancel-btn">취소</button>
                  </>
                ) : (
                  <button onClick={() => setEditingNotice(true)} className="edit-btn">
                    <Edit size={14} />
                    수정
                  </button>
                )}
              </div>
            )}
          </div>
          <div style={{ width: '100%', borderTop: '2.5px solid #B497D6', margin: '16px 0 0 0' }} />
          <div className="notice-content" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, textAlign: 'center', fontSize: 20, fontWeight: 600, color: '#92400E', padding: '24px 0' }}>
            <span style={{ flex: 1 }}>{editingNotice ? (
              <textarea
                value={noticeContent}
                onChange={(e) => setNoticeContent(e.target.value)}
                className="edit-textarea"
                placeholder="공지사항을 입력하세요..."
              />
            ) : (
              noticeContent
            )}</span>
          </div>
        </div>

        {/* 콘테스트 카드 - 트로피 이모지 개최 문구 바로 왼쪽 */}
        <div
          className={`home-card notice-card contest-card${latestContest && latestContest.ended ? ' ended' : ''}`}
          onClick={() => navigate('/contests')}
          style={{
            cursor: latestContest ? 'pointer' : 'default',
            minHeight: 60,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
            opacity: latestContest ? 1 : 0.85,
          }}
        >
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 0, gap: 8 }}>
            <Trophy size={22} color={latestContest && latestContest.ended ? '#F43F5E' : '#8A55CC'} style={{ flexShrink: 0 }} />
            <span className="contest-alert-title">개최(예정)된 콘테스트 알림</span>
          </div>
          <div style={{ width: '100%', borderTop: '2px solid #B497D6', margin: '10px 0 10px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'center' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              {latestContest ? (
                <>
                  <div className="contest-title">{latestContest.title}</div>
                  <div className="contest-deadline">마감: {latestContest.deadline && latestContest.deadline.seconds ? new Date(latestContest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : ''}</div>
                </>
              ) : (
                <div style={{ fontWeight: 400, fontSize: 13, color: '#B497D6' }}>개최(예정)된 콘테스트가 없습니다.</div>
              )}
            </div>
            {latestContest && latestContest.ended && (
              <span style={{ background: '#F43F5E', color: '#fff', borderRadius: 8, padding: '5px 12px', fontWeight: 500, fontSize: 12, marginLeft: 10 }}>종료됨</span>
            )}
          </div>
        </div>

        {/* 팀 소개 카드 */}
        <SpecialMomentsCard />

        {/* 게시판 바로가기 */}
        <div className="home-card">
          <div className="card-header">
            <FileText className="card-icon" />
            <h3 className="card-title">게시판</h3>
          </div>
          <div className="boards-grid">
            {BOARDS.map((board, index) => (
              <div 
                key={index} 
                className="board-item"
                onClick={() => navigateToBoard(board.path)}
              >
                <board.icon size={16} />
                <span className="board-name">{board.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 다음 버스킹 일정 */}
        <div className="home-card">
          <div className="card-header">
            <Calendar className="card-icon" />
            <h3 className="card-title">다음 버스킹</h3>
            {isAdmin(user) && (
              <div className="edit-buttons">
                {editingBusking ? (
                  <>
                    <button onClick={handleSaveBusking} className="save-btn">저장</button>
                    <button onClick={() => setEditingBusking(false)} className="cancel-btn">취소</button>
                  </>
                ) : (
                  <button onClick={() => setEditingBusking(true)} className="edit-btn">
                    <Edit size={14} />
                    수정
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="busking-schedule">
            <div className="busking-date">
              {editingBusking ? (
                <input
                  type="text"
                  value={tempBuskingSchedule.date}
                  onChange={(e) => setTempBuskingSchedule({ ...tempBuskingSchedule, date: e.target.value })}
                  className="edit-input busking-date-input"
                  placeholder="YYYY.MM.DD"
                />
              ) : tempBuskingSchedule.date}
            </div>
            <div className="busking-location">
              📍 {editingBusking ? (
                <input
                  type="text"
                  value={tempBuskingSchedule.location}
                  onChange={(e) => setTempBuskingSchedule({ ...tempBuskingSchedule, location: e.target.value })}
                  className="edit-input busking-location-input"
                  placeholder="장소를 입력하세요"
                />
              ) : tempBuskingSchedule.location}
            </div>
            <div className="busking-countdown">
              D-{calculateDDay(tempBuskingSchedule.date.replace(/\./g, '-'))}
            </div>
          </div>
        </div>

        {/* 최근 활동 */}
        <div className="home-card recent-activities">
          <div className="card-header">
            <Clock className="card-icon" />
            <h3 className="card-title">최근 활동</h3>
          </div>
          <div className="activities-grid">
            {recentFree && (
              <div className="activity-section">
                <h4 style={{cursor:'pointer'}} onClick={() => navigate(`/free/${recentFree.id}`)}><MessageSquare size={16} />자유게시판</h4>
                <div className="post-item" onClick={() => navigate(`/free/${recentFree.id}`)}>
                  <div className="post-title">{recentFree.title}</div>
                  <div className="post-meta">
                    <span>{(recentFree as any).author || (recentFree as any).writerNickname || '-'}</span>
                    <span>{(recentFree as any).createdAt && ((recentFree as any).createdAt.seconds ? new Date((recentFree as any).createdAt.seconds * 1000).toLocaleDateString('ko-KR') : (new Date((recentFree as any).createdAt)).toLocaleDateString('ko-KR'))}</span>
                  </div>
                </div>
              </div>
            )}
            {recentRecording && (
              <div className="activity-section">
                <h4 style={{cursor:'pointer'}} onClick={() => navigate(`/recording/${recentRecording.id}`)}><Mic size={16} />녹음게시판</h4>
                <div className="post-item" onClick={() => navigate(`/recording/${recentRecording.id}`)}>
                  <div className="post-title">{recentRecording.title}</div>
                  <div className="post-meta">
                    <span>{(recentRecording as any).author || (recentRecording as any).writerNickname || '-'}</span>
                    <span>{(recentRecording as any).createdAt && ((recentRecording as any).createdAt.seconds ? new Date((recentRecording as any).createdAt.seconds * 1000).toLocaleDateString('ko-KR') : (new Date((recentRecording as any).createdAt)).toLocaleDateString('ko-KR'))}</span>
                  </div>
                </div>
              </div>
            )}
            {recentEvaluation && (
              <div className="activity-section">
                <h4 style={{cursor:'pointer'}} onClick={() => navigate(`/evaluation/${recentEvaluation.id}`)}><Star size={16} />평가게시판</h4>
                <div className="post-item" onClick={() => navigate(`/evaluation/${recentEvaluation.id}`)}>
                  <div className="post-title">{recentEvaluation.title}</div>
                  <div className="post-meta">
                    <span>{(recentEvaluation as any).author || (recentEvaluation as any).writerNickname || '-'}</span>
                    <span>{(recentEvaluation as any).createdAt && ((recentEvaluation as any).createdAt.seconds ? new Date((recentEvaluation as any).createdAt.seconds * 1000).toLocaleDateString('ko-KR') : (new Date((recentEvaluation as any).createdAt)).toLocaleDateString('ko-KR'))}</span>
                  </div>
                </div>
              </div>
            )}
            {recentPartner && (
              <div className="activity-section">
                <h4 style={{cursor:'pointer'}} onClick={() => navigate(`/boards/partner/${recentPartner.id}`)}><UserPlus size={16} />파트너모집</h4>
                <div className="post-item" onClick={() => navigate(`/boards/partner/${recentPartner.id}`)}>
                  <div className="post-title">{recentPartner.title}</div>
                  <div className="post-meta">
                    <span>{(recentPartner as any).author || (recentPartner as any).writerNickname || '-'}</span>
                    <span>{(recentPartner as any).createdAt && ((recentPartner as any).createdAt.seconds ? new Date((recentPartner as any).createdAt.seconds * 1000).toLocaleDateString('ko-KR') : (new Date((recentPartner as any).createdAt)).toLocaleDateString('ko-KR'))}</span>
                  </div>
                </div>
              </div>
            )}
            {!recentFree && !recentRecording && !recentEvaluation && !recentPartner && (
              <div style={{ color: '#B497D6', textAlign: 'center', width: '100%' }}>최근 게시글이 없습니다.</div>
            )}
          </div>
        </div>

        {/* VERYUS 활동이력 */}
        <div className="home-card activity-history">
          <div className="card-header">
            <Music className="card-icon" />
            <h3 className="card-title">VERYUS 활동이력</h3>
            {isAdmin(user) && (
              <div className="edit-buttons">
                <button onClick={handleAddActivity} className="add-btn">
                  <Plus size={14} />
                  추가
                </button>
                <button 
                  onClick={() => setEditingActivity(!editingActivity)} 
                  className={editingActivity ? "cancel-btn" : "edit-btn"}
                >
                  <Edit size={14} />
                  {editingActivity ? '완료' : '편집'}
                </button>
              </div>
            )}
          </div>
          <div className="activity-list">
            {activityHistory.map(activity => (
              <div key={activity.id} className="activity-item">
                <div className="activity-date">
                  {editingActivity ? (
                    <input
                      type="text"
                      value={activity.date}
                      onChange={(e) => handleUpdateActivity(activity.id, 'date', e.target.value)}
                      className="edit-input small"
                    />
                  ) : activity.date}
                </div>
                <div className="activity-content">
                  <div className="activity-title">
                    {editingActivity ? (
                      <input
                        type="text"
                        value={activity.title}
                        onChange={(e) => handleUpdateActivity(activity.id, 'title', e.target.value)}
                        className="edit-input"
                      />
                    ) : activity.title}
                  </div>
                  <div className="activity-description">
                    {editingActivity ? (
                      <textarea
                        value={activity.description}
                        onChange={(e) => handleUpdateActivity(activity.id, 'description', e.target.value)}
                        className="edit-textarea small"
                      />
                    ) : activity.description}
                  </div>
                  <div className="activity-meta">
                    <span>참여인원: {editingActivity ? (
                      <input
                        type="number"
                        value={activity.participants}
                        onChange={(e) => handleUpdateActivity(activity.id, 'participants', parseInt(e.target.value) || 0)}
                        className="edit-input tiny"
                      />
                    ) : activity.participants}명</span>
                    {editingActivity && (
                      <button 
                        onClick={() => handleDeleteActivity(activity.id)}
                        className="delete-btn small"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      

    </div>
  );
};

export default Home; 