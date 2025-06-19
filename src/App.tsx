import React, { useEffect, useState, createContext, useContext, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, where, orderBy, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { uploadBytes, getDownloadURL, ref as storageRef } from 'firebase/storage';
import type { User } from 'firebase/auth';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { initializeTheme, useTheme, updateCSSVariables } from './utils/themeService';
// @ts-ignore
import { auth, db, storage } from './firebase';
// @ts-ignore
import Login from './components/Login';
// @ts-ignore
import Home from './components/Home';
// @ts-ignore
import Signup from './components/Signup';
// @ts-ignore
import ForgotPassword from './components/ForgotPassword';
// @ts-ignore
import FreePostList from './components/FreePostList';
// @ts-ignore
import FreePostWrite from './components/FreePostWrite';
// @ts-ignore
import FreePostDetail from './components/FreePostDetail';
// @ts-ignore
import AdminUserPanel from './components/AdminUserPanel';
// @ts-ignore
import MyPage from './components/MyPage';
// @ts-ignore
import Settings from './components/Settings';
// @ts-ignore
import RecordingPostList from './components/RecordingPostList';
// @ts-ignore
import RecordingPostWrite from './components/RecordingPostWrite';
// @ts-ignore
import RecordingPostDetail from './components/RecordingPostDetail';
// @ts-ignore
import RecordingPostEdit from './components/RecordingPostEdit';
// @ts-ignore
import Messages from './components/Messages';
// @ts-ignore
import Notifications from './components/Notifications';
// @ts-ignore
import ContestList from './components/ContestList';
// @ts-ignore
import ContestCreate from './components/ContestCreate';
// @ts-ignore
import ContestDetail from './components/ContestDetail';
// @ts-ignore
import ContestParticipate from './components/ContestParticipate';
// @ts-ignore
import ContestResults from './components/ContestResults';
// @ts-ignore
import ApprovedSongs from './components/ApprovedSongs';
// @ts-ignore
import PartnerPostList from './components/PartnerPostList';
// @ts-ignore
import PartnerPostWrite from './components/PartnerPostWrite';
// @ts-ignore
import PartnerPostDetail from './components/PartnerPostDetail';
// @ts-ignore
import EvaluationPostList from './components/EvaluationPostList';
// @ts-ignore
import EvaluationPostWrite from './components/EvaluationPostWrite';
// @ts-ignore
import EvaluationPostDetail from './components/EvaluationPostDetail';
// @ts-ignore
import EvaluationPostEdit from './components/EvaluationPostEdit';
// @ts-ignore
import PracticeRoom from './components/PracticeRoom';
// @ts-ignore
import BottomNavigation from './components/BottomNavigation';
// @ts-ignore
import SearchSystem from './components/SearchSystem';
import './App.css';

const GRADE_ORDER = [
  '🌙', '⭐', '⚡', '🍺', '🌌', '☀️', '🪐', '🌍', '🍉', '🍈', '🍎', '🥝', '🫐', '🍒'
];

// 관리자 권한 체크 함수
const checkAdminAccess = (user: any): boolean => {
  if (!user) return false;
  return user.nickname === '너래' || user.role === '리더' || user.role === '운영진';
};

// 관리자 전용 라우트 컴포넌트
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!checkAdminAccess(user)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// 보호된 라우트 컴포넌트
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingEmojiIdx, setLoadingEmojiIdx] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingEmojiIdx(idx => (idx + 1) % GRADE_ORDER.length);
    }, 350);
    return () => clearInterval(interval);
  }, [loading]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #E5DAF5 0%, #D4C2F0 100%)',
        fontFamily: 'Pretendard, sans-serif'
      }}>
        <div style={{
          background: 'white',
          padding: '32px',
          borderRadius: '16px',
          boxShadow: '0 10px 30px rgba(138, 85, 204, 0.1)',
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#8A55CC', margin: '0 0 16px 0', fontWeight: 700, fontSize: 32 }}>VERYUS</h2>
          <div style={{ fontSize: 48, margin: '24px 0', transition: 'all 0.2s' }}>{GRADE_ORDER[loadingEmojiIdx]}</div>
        </div>
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" replace />;
};

// 오디오 플레이어 Context
export type PlaylistSong = {
  id: string;
  title: string;
  artist: string;
  url: string;
  uploadedBy: string;
  coverUrl?: string;
  createdAt: any;
};
interface AudioPlayerContextType {
  playlist: PlaylistSong[];
  currentIdx: number;
  isPlaying: boolean;
  play: (idx: number) => void;
  pause: () => void;
  playNext: () => void;
  playPrev: () => void;
  setPlaylist: (songs: PlaylistSong[]) => void;
}
const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);
export const useAudioPlayer = () => useContext(AudioPlayerContext)!;

const AudioPlayerProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [playlist, setPlaylist] = useState<PlaylistSong[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState<{ title: string; artist: string; file: File | null }>({ title: '', artist: '', file: null });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);

  // 리더/운영진 권한 체크
  const userString = typeof window !== 'undefined' ? localStorage.getItem('veryus_user') : null;
  const user = userString ? JSON.parse(userString) : null;
  const isLeaderOrAdmin = user && (user.role === '리더' || user.role === '운영진');

  // 플레이리스트가 로드되면 첫 번째 곡을 선택하지만 자동재생하지 않음
  useEffect(() => {
    if (playlist.length > 0 && currentIdx >= playlist.length) {
      // 현재 인덱스가 플레이리스트 범위를 벗어났을 때만 첫 번째 곡으로 설정
      setCurrentIdx(0);
    }
  }, [playlist, currentIdx]);

  // 실제 오디오 제어
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.play().catch(()=>{});
      else audioRef.current.pause();
    }
  }, [isPlaying, currentIdx]);

  // 오디오 시간/프로그레스 동기화
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => {
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration || 0);
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    };
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('loadedmetadata', update);
    return () => {
      audio.removeEventListener('timeupdate', update);
      audio.removeEventListener('loadedmetadata', update);
    };
  }, [audioRef, currentIdx]);

  const play = (idx: number) => {
    setCurrentIdx(idx);
    setIsPlaying(true);
    setUserPaused(false);
  };
  const pause = () => {
    setIsPlaying(false);
    setUserPaused(true);
  };
  const playNext = () => setCurrentIdx(idx => (idx + 1) % playlist.length);
  const playPrev = () => setCurrentIdx(idx => (idx - 1 + playlist.length) % playlist.length);

  // 곡 끝나면 자동 다음 곡
  const handleEnded = () => playNext();

  // 업로드 핸들러
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.title || !uploadForm.artist || !uploadForm.file) return;
    setUploading(true);
    try {
      const file = uploadForm.file;
      const fileRef = storageRef(storage, `playlist/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      let coverUrl = '';
      if (coverFile) {
        const coverRef = storageRef(storage, `playlist_covers/${Date.now()}_${coverFile.name}`);
        await uploadBytes(coverRef, coverFile);
        coverUrl = await getDownloadURL(coverRef);
      }
      await addDoc(collection(db, 'playlistSongs'), {
        title: uploadForm.title,
        artist: uploadForm.artist,
        url,
        uploadedBy: user?.nickname || '',
        createdAt: new Date(),
        coverUrl: coverUrl || '/default_cover.png',
      });
      setUploadForm({ title: '', artist: '', file: null });
      setCoverFile(null);
      setUploading(false);
      setShowUpload(false);
      // 새로고침
      const snap = await getDocs(query(collection(db, 'playlistSongs'), orderBy('createdAt', 'desc')));
      const songs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PlaylistSong[];
      setPlaylist(songs);
    } catch (err) {
      setUploading(false);
      alert('업로드 실패');
    }
  };

  const handleDeleteSong = async (idx: number) => {
    if (!window.confirm('정말 이 곡을 삭제하시겠습니까?')) return;
    const song = playlist[idx];
    if (!song?.id) return;
    await deleteDoc(doc(db, 'playlistSongs', song.id));
    const snap = await getDocs(query(collection(db, 'playlistSongs'), orderBy('createdAt', 'desc')));
    const songs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PlaylistSong[];
    setPlaylist(songs);
  };

  return (
    <AudioPlayerContext.Provider value={{ playlist, currentIdx, isPlaying, play, pause, playNext, playPrev, setPlaylist }}>
      {/* 오디오 태그는 항상 렌더링 */}
      <audio ref={audioRef} src={playlist[currentIdx]?.url} onEnded={handleEnded} style={{ display: 'none' }} />
      {/* 플레이어 UI는 collapsed에 따라 숨김 처리 */}
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: 'rgba(255,255,255,0.98)',
          borderRadius: 16,
          boxShadow: collapsed ? 'none' : '0 2px 8px #E5DAF5',
          padding: collapsed ? 0 : '12px 18px',
          minWidth: collapsed ? 0 : 320,
          maxWidth: collapsed ? 60 : 420,
          width: collapsed ? 60 : '95vw',
          height: collapsed ? 60 : 'auto',
          display: collapsed ? 'flex' : 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? 0 : 12,
          flexDirection: 'row',
          transition: 'all 0.2s',
          visibility: collapsed ? 'visible' : 'visible',
        }}
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          tabIndex={-1}
          style={{ ...buttonBase, width: 40, height: 40, marginRight: 0 }}
          aria-label={collapsed ? '펼치기' : '접기'}
          onMouseOver={e => e.currentTarget.style.background = '#ede9fe'}
          onMouseOut={e => e.currentTarget.style.background = 'none'}
        >
          {collapsed ? <ExpandIcon /> : <CollapseIcon />}
        </button>
        {!collapsed && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', background: 'none', flexShrink: 0, marginRight: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <img src={playlist[currentIdx]?.coverUrl || '/default_cover.png'} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => {
                const img = e.currentTarget as HTMLImageElement;
                if (!img.src.includes('/default_cover.png')) img.src = '/default_cover.png';
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, maxWidth: 220 }}>
              <div style={{ width: '100%', marginBottom: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginLeft: '-32px', maxWidth: 180 }}>
                <div style={{ fontWeight: 700, color: '#222', fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{playlist[currentIdx]?.title || '플레이리스트 없음'}</div>
                <div style={{ color: '#8A55CC', fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{playlist[currentIdx]?.artist || ''}</div>
              </div>
              {/* 타임라인+햄버거 버튼 한 줄 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 220, marginBottom: 8 }}>
                <span style={{ color: '#00C853', fontSize: 13, minWidth: 36 }}>{formatTime(currentTime)}</span>
                <div style={{ flex: 1, height: 4, background: '#eee', borderRadius: 2, overflow: 'hidden', position: 'relative', cursor: 'pointer', maxWidth: 120 }} onClick={e => {
                  const rect = (e.target as HTMLDivElement).getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  if (audioRef.current && duration) {
                    audioRef.current.currentTime = percent * duration;
                  }
                }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: '#8A55CC', borderRadius: 2, position: 'absolute', left: 0, top: 0 }} />
                </div>
                <span style={{ color: '#888', fontSize: 13, minWidth: 36, textAlign: 'right' }}>{formatTime(duration)}</span>
                <button onClick={() => setShowPlaylistModal(true)} tabIndex={-1} style={{ ...buttonBase, width: 40, height: 40, color: '#8A55CC' }} title="플레이리스트 전체 보기" onMouseOver={e => e.currentTarget.style.background = '#ede9fe'} onMouseOut={e => e.currentTarget.style.background = 'none'}><ListIcon /></button>
              </div>
              {/* 컨트롤 버튼 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', maxWidth: 220 }}>
                <button onClick={playPrev} tabIndex={-1} style={{ ...buttonBase, width: 44, height: 44 }} onMouseOver={e => e.currentTarget.style.background = '#ede9fe'} onMouseOut={e => e.currentTarget.style.background = 'none'} aria-label="이전 곡"><PrevIcon /></button>
                <button onClick={() => setIsPlaying((p) => !p)} tabIndex={-1} style={{ ...buttonBase, width: 54, height: 54 }} onMouseOver={e => e.currentTarget.style.background = '#ede9fe'} onMouseOut={e => e.currentTarget.style.background = 'none'} aria-label={isPlaying ? '일시정지' : '재생'}>{isPlaying ? <PauseIcon /> : <PlayIcon />}</button>
                <button onClick={playNext} tabIndex={-1} style={{ ...buttonBase, width: 44, height: 44 }} onMouseOver={e => e.currentTarget.style.background = '#ede9fe'} onMouseOut={e => e.currentTarget.style.background = 'none'} aria-label="다음 곡"><NextIcon /></button>
              </div>
            </div>
          </>
        )}
      </div>
      {/* 플레이리스트 모달 */}
      {showPlaylistModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.25)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPlaylistModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 16px #E5DAF5', padding: 24, minWidth: 320, maxWidth: 420, width: '90vw', maxHeight: '80vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 20, marginBottom: 16 }}>플레이리스트</h3>
            <button onClick={() => setShowPlaylistModal(false)} style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: '#8A55CC', cursor: 'pointer' }}>✕</button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {playlist.length === 0 && <div style={{ color: '#B497D6', textAlign: 'center', fontWeight: 500 }}>아직 곡이 없습니다.</div>}
              {playlist.map((song, idx) => (
                <div key={song.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #E5DAF5', background: idx === currentIdx ? '#ede9fe' : 'transparent', borderRadius: idx === currentIdx ? 8 : 0 }}>
                  <img src={song.coverUrl || '/default_cover.png'} alt="cover" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} onError={e => { const img = e.currentTarget as HTMLImageElement; if (!img.src.includes('/default_cover.png')) img.src = '/default_cover.png'; }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#222', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</div>
                    <div style={{ color: '#8A55CC', fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</div>
                  </div>
                  <button onClick={() => play(idx)} style={{ background: 'none', border: 'none', outline: 'none', boxShadow: 'none', cursor: 'pointer', fontSize: 20, color: '#8A55CC', padding: 0 }}>▶️</button>
                  {isLeaderOrAdmin && (
                    <button onClick={() => handleDeleteSong(idx)} style={{ background: 'none', border: 'none', outline: 'none', boxShadow: 'none', borderRadius: '50%', color: '#E53935', fontWeight: 700, fontSize: 20, marginLeft: 4, cursor: 'pointer', padding: 0 }}>🗑️</button>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              <input type="text" placeholder="곡 제목" value={uploadForm.title} onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))} style={{ padding: 7, borderRadius: 6, border: '1px solid #E5DAF5' }} />
              <input type="text" placeholder="아티스트" value={uploadForm.artist} onChange={e => setUploadForm(f => ({ ...f, artist: e.target.value }))} style={{ padding: 7, borderRadius: 6, border: '1px solid #E5DAF5' }} />
              <input type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.caf,.mp4,.mov,.3gp,.amr,.flac,.ogg,.wma" onChange={e => setUploadForm(f => ({ ...f, file: e.target.files && e.target.files[0] ? e.target.files[0] : null }))} />
              <input type="file" accept="image/*" onChange={e => setCoverFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
              <button type="submit" disabled={uploading} style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 0', fontWeight: 600, cursor: 'pointer', fontSize: 16 }}>{uploading ? '업로드중...' : '업로드'}</button>
            </form>
          </div>
        </div>
      )}
      {children}
    </AudioPlayerContext.Provider>
  );
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingEmojiIdx, setLoadingEmojiIdx] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [showSearchSystem, setShowSearchSystem] = useState(false);
  
  // 테마 시스템
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // Firebase Auth 상태 변화 감지
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      // localStorage에 로그인 상태 저장/제거
      if (currentUser) {
        try {
          // Firestore에서 사용자 추가 정보 가져오기
          const userDoc = await getDocs(query(collection(db, 'users'), where('uid', '==', currentUser.uid)));
          const userData = userDoc.docs[0]?.data();
          
          localStorage.setItem('veryus_user', JSON.stringify({
            uid: currentUser.uid,
            email: currentUser.email,
            nickname: userData?.nickname || '',
            role: userData?.role || '일반',
            grade: userData?.grade || '🍒체리',
            isLoggedIn: true
          }));
        } catch (error) {
          console.error('사용자 정보 가져오기 실패:', error);
          localStorage.setItem('veryus_user', JSON.stringify({
            uid: currentUser.uid,
            email: currentUser.email,
            isLoggedIn: true
          }));
        }
      } else {
        localStorage.removeItem('veryus_user');
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingEmojiIdx(idx => (idx + 1) % GRADE_ORDER.length);
    }, 350);
    return () => clearInterval(interval);
  }, [loading]);

  // 알림 개수 실시간 업데이트
  useEffect(() => {
    if (!user) {
      setUnreadNotificationCount(0);
      return;
    }

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('toUid', '==', user.uid),
      where('isRead', '==', false)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        setUnreadNotificationCount(snapshot.size);
      },
      (error) => {
        console.error('알림 개수 구독 에러:', error);
        setUnreadNotificationCount(0);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // 테마 변경 시 CSS 변수 업데이트
  useEffect(() => {
    updateCSSVariables(resolvedTheme);
  }, [resolvedTheme]);

  // 초기 테마 설정
  useEffect(() => {
    initializeTheme();
  }, []);

  // 로딩 중일 때 표시할 화면
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #E5DAF5 0%, #D4C2F0 100%)',
        fontFamily: 'Pretendard, sans-serif'
      }}>
        <div style={{
          background: 'white',
          padding: '32px',
          borderRadius: '16px',
          boxShadow: '0 10px 30px rgba(138, 85, 204, 0.1)',
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#8A55CC', margin: '0 0 16px 0', fontWeight: 700, fontSize: 32 }}>VERYUS</h2>
          <div style={{ fontSize: 48, margin: '24px 0', transition: 'all 0.2s' }}>{GRADE_ORDER[loadingEmojiIdx]}</div>
        </div>
      </div>
    );
  }

  return (
    <AudioPlayerProvider>
      <Router>
        <div className="App">
          <Routes>
            {/* 로그인 페이지 - 이미 로그인되어 있으면 메인으로 */}
            <Route 
              path="/login" 
              element={user ? <Navigate to="/" replace /> : <Login />} 
            />
            
            {/* 회원가입 페이지 - 이미 로그인되어 있으면 메인으로 */}
            <Route 
              path="/signup" 
              element={user ? <Navigate to="/" replace /> : <Signup />} 
            />
            
            {/* 보호된 라우트들 - 로그인 필요 */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <Home onSearchOpen={() => setShowSearchSystem(true)} />
                </ProtectedRoute>
              } 
            />
            
            {/* 자유게시판 라우트들 */}
            <Route 
              path="/free" 
              element={<FreePostList />}
            />
            
            <Route 
              path="/free/write" 
              element={
                <ProtectedRoute>
                  <FreePostWrite />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/free/:id" 
              element={<FreePostDetail />}
            />
            
            <Route 
              path="/free/edit/:id" 
              element={
                <ProtectedRoute>
                  <FreePostWrite />
                </ProtectedRoute>
              }
            />
            
            {/* 관리자 패널 - 리더/운영진만 접근 가능 */}
            <Route 
              path="/admin-user" 
              element={
                <AdminRoute>
                  <AdminUserPanel />
                </AdminRoute>
              } 
            />
            
            {/* 마이페이지 - 로그인한 사용자만 접근 가능 */}
            <Route 
              path="/mypage" 
              element={
                <ProtectedRoute>
                  <MyPage />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/mypage/:uid" 
              element={
                <ProtectedRoute>
                  <MyPage />
                </ProtectedRoute>
              } 
            />
            
            {/* 설정 페이지 - 로그인한 사용자만 접근 가능 */}
            <Route 
              path="/settings" 
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } 
            />
            
            {/* 추후 추가할 보호된 라우트들 */}
            <Route 
              path="/menu" 
              element={
                <ProtectedRoute>
                  <div style={{ padding: '20px', textAlign: 'center' }}>메뉴 페이지 (추후 구현)</div>
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/stores" 
              element={
                <ProtectedRoute>
                  <div style={{ padding: '20px', textAlign: 'center' }}>매장 찾기 페이지 (추후 구현)</div>
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/events" 
              element={
                <ProtectedRoute>
                  <div style={{ padding: '20px', textAlign: 'center' }}>이벤트 페이지 (추후 구현)</div>
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/reviews" 
              element={
                <ProtectedRoute>
                  <div style={{ padding: '20px', textAlign: 'center' }}>리뷰 페이지 (추후 구현)</div>
                </ProtectedRoute>
              } 
            />
            
            {/* 비밀번호 찾기는 로그인이 필요 없음 */}
            <Route 
              path="/forgot-password" 
              element={
                user ? <Navigate to="/" replace /> : <ForgotPassword />
              } 
            />
            
            {/* 녹음게시판 라우트들 */}
            <Route path="/recording" element={<RecordingPostList />} />
            <Route path="/recording/write" element={<RecordingPostWrite />} />
            <Route path="/recording/:id" element={<RecordingPostDetail />} />
            <Route path="/recording/edit/:id" element={<RecordingPostEdit />} />
            
            {/* 쪽지함 라우트 */}
            <Route 
              path="/messages" 
              element={
                <ProtectedRoute>
                  <Messages />
                </ProtectedRoute>
              }
            />
            
            {/* 알림 라우트 */}
            <Route 
              path="/notifications" 
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              }
            />
            
            {/* 대회 라우트들 */}
            <Route path="/contests" element={<ProtectedRoute><ContestList /></ProtectedRoute>} />
            <Route path="/contests/create" element={<ProtectedRoute><ContestCreate /></ProtectedRoute>} />
            <Route path="/contests/:id" element={<ProtectedRoute><ContestDetail /></ProtectedRoute>} />
            <Route path="/contests/:id/participate" element={<ProtectedRoute><ContestParticipate /></ProtectedRoute>} />
            <Route path="/contests/:id/results" element={<ProtectedRoute><ContestResults /></ProtectedRoute>} />
            
            {/* 합격곡 관리/조회 페이지 */}
            <Route path="/approved-songs" element={<ProtectedRoute><ApprovedSongs /></ProtectedRoute>} />
            
            {/* 파트너모집 게시판 라우트들 */}
            <Route path="/boards/partner" element={<PartnerPostList />} />
            <Route path="/boards/partner/write" element={<PartnerPostWrite />} />
            <Route path="/boards/partner/:id" element={<PartnerPostDetail />} />
            <Route path="/boards/partner/edit/:id" element={<PartnerPostWrite />} />
            
            {/* 평가게시판 라우트들 */}
            <Route path="/evaluation" element={<EvaluationPostList />} />
            <Route path="/evaluation/write" element={<EvaluationPostWrite />} />
            <Route path="/evaluation/:id" element={<EvaluationPostDetail />} />
            <Route path="/evaluation/edit/:id" element={<EvaluationPostEdit />} />
            
            {/* 연습장 라우트 */}
            <Route path="/practice-room" element={<PracticeRoom />} />
            
            {/* 기타 모든 경로 - 404 대신 로그인으로 리다이렉트 */}
            <Route 
              path="*" 
              element={<Navigate to={user ? "/" : "/login"} replace />} 
            />
          </Routes>
          {/* 모바일 하단 네비게이션 바 */}
          {user && (
            <BottomNavigation 
              unreadNotificationCount={unreadNotificationCount}
              onSearchOpen={() => setShowSearchSystem(true)}
            />
          )}
        </div>
        
        {/* 통합 검색 시스템 */}
        <SearchSystem 
          isOpen={showSearchSystem}
          onClose={() => setShowSearchSystem(false)}
          initialQuery=""
        />
        
        {/* 토스트 알림 컨테이너 */}
        <ToastContainer
          position="top-right"
          autoClose={4000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
          style={{
            fontSize: '14px',
            fontFamily: 'Pretendard, sans-serif'
          }}
          toastStyle={{
            borderRadius: '12px',
            boxShadow: resolvedTheme === 'dark' 
              ? '0 4px 12px rgba(0, 0, 0, 0.3)' 
              : '0 4px 12px rgba(138, 85, 204, 0.15)',
            background: resolvedTheme === 'dark' ? '#2A2A2A' : '#FFFFFF',
            color: resolvedTheme === 'dark' ? '#FFFFFF' : '#1F2937'
          }}
        />
      </Router>
    </AudioPlayerProvider>
  );
}

function formatTime(sec: number) {
  if (!sec || isNaN(sec)) return '00:00';
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const buttonBase = {
  background: 'none',
  border: 'none',
  outline: 'none',
  boxShadow: 'none',
  cursor: 'pointer',
  padding: 0,
  borderRadius: '50%',
  transition: 'background 0.15s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// SVG 아이콘 컴포넌트 정의
const PrevIcon = ({ color = '#8A55CC', size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="15" y="6" width="2" height="12" rx="1" fill={color}/>
    <path d="M14 12L6 18V6l8 6z" fill={color}/>
  </svg>
);
const PlayIcon = ({ color = '#8A55CC', size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 5v14l11-7z" fill={color}/>
  </svg>
);
const PauseIcon = ({ color = '#8A55CC', size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="5" width="4" height="14" rx="1" fill={color}/>
    <rect x="14" y="5" width="4" height="14" rx="1" fill={color}/>
  </svg>
);
const NextIcon = ({ color = '#8A55CC', size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="6" width="2" height="12" rx="1" fill={color}/>
    <path d="M10 12l8 6V6l-8 6z" fill={color}/>
  </svg>
);
const CollapseIcon = ({ color = '#8A55CC', size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 10l5 5 5-5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const ExpandIcon = ({ color = '#8A55CC', size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 14l5-5 5 5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const ListIcon = ({ color = '#8A55CC', size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="6" width="16" height="2" rx="1" fill={color}/>
    <rect x="4" y="11" width="16" height="2" rx="1" fill={color}/>
    <rect x="4" y="16" width="16" height="2" rx="1" fill={color}/>
  </svg>
);

export default App;
