import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  doc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  writeBatch,
  onSnapshot,
  getDoc,
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import { 
  ArrowLeft, 
  Camera, 
  Edit3, 
  Save, 
  X, 
  MessageSquare, 
  Heart, 
  MessageCircle,
  User,
  FileText,
  Star,
  Users,
  Calendar,
  Trash2,
  Send
} from 'lucide-react';
import './MyPage.css';
import { auth } from '../firebase';

interface User {
  uid: string;
  email: string;
  nickname: string;
  role: string;
  grade: string;
  profileImageUrl?: string;
  intro?: string;
  createdAt: any;
}

interface Post {
  id: string;
  title: string;
  type: string;
  createdAt: any;
  likesCount: number;
  commentCount: number;
}

interface ActivityStats {
  postsCount: number;
  commentsCount: number;
  totalLikes: number;
  averageScore: number;
  lastEvaluationDate: string;
}

interface GuestbookMessage {
  id: string;
  fromNickname: string;
  message: string;
  createdAt: any;
  toNickname: string;
}

interface ApprovedSong {
  id: string;
  title: string;
  members: string[];
  createdAt?: any;
  grade?: string;
}

// 등급 관련 상수
const GRADE_OPTIONS = [
  '🍒', // 체리
  '🫐', // 블루베리
  '🥝', // 키위
  '🍎', // 사과
  '🍈', // 멜론
  '🍉', // 수박
  '🌍', // 지구
  '🪐', // 토성
  '☀️', // 태양
  // '🌌', // 은하(선택 불가)
  '🌙', // 달
];

const GRADE_ORDER = [
  '🌙', '⭐', '⚡', '🍺', '🌌', '☀️', '🪐', '🌍', '🍉', '🍈', '🍎', '🥝', '🫐', '🍒'
];

const GRADE_NAMES: Record<string, string> = {
  '🍒': '체리', '🫐': '블루베리', '🥝': '키위', '🍎': '사과', '🍈': '멜론', '🍉': '수박',
  '🌍': '지구', '🪐': '토성', '☀️': '태양', '🌌': '은하', '🍺': '맥주', '⚡': '번개', '⭐': '별', '🌙': '달'
};

const MyPage: React.FC = () => {
  const navigate = useNavigate();
  const { uid } = useParams();
  const [user, setUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'evaluations' | 'guestbook'>('posts');
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingIntro, setEditingIntro] = useState(false);
  const [editingGrade, setEditingGrade] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  
  // 편집 상태
  const [editNickname, setEditNickname] = useState('');
  const [editIntro, setEditIntro] = useState('');
  const [newGuestMessage, setNewGuestMessage] = useState('');
  
  // 파일 입력 참조
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 데이터 상태
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [activityStats, setActivityStats] = useState<ActivityStats>({
    postsCount: 0,
    commentsCount: 0,
    totalLikes: 0,
    averageScore: 0,
    lastEvaluationDate: ''
  });
  const [guestMessages, setGuestMessages] = useState<GuestbookMessage[]>([]);
  const [recentFree, setRecentFree] = useState<Post | null>(null);
  const [recentRecording, setRecentRecording] = useState<Post | null>(null);
  const [recentEvaluation, setRecentEvaluation] = useState<Post | null>(null);
  const [recentPartner, setRecentPartner] = useState<Post | null>(null);
  const [myEvaluationPosts, setMyEvaluationPosts] = useState<Post[]>([]);
  const [approvedSongs, setApprovedSongs] = useState<ApprovedSong[]>([]);

  // Cleanup subscriptions
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // 가입일 관련 상태
  const [editingJoinDate, setEditingJoinDate] = useState(false);
  const [editJoinDate, setEditJoinDate] = useState('');

  // 유저 등급 정보 fetch
  const [userMap, setUserMap] = useState<Record<string, {grade?: string}>>({});
  const [showAllSongs, setShowAllSongs] = useState(false);

  // Initialize user data
  useEffect(() => {
    // 항상 로그인 유저 정보 세팅
    const userString = localStorage.getItem('veryus_user');
    if (!userString) {
      navigate('/login');
      return;
    }
    const loginUser = JSON.parse(userString) as User;
    setCurrentUser(loginUser);

    async function fetchUserData(targetUid: string) {
      try {
        const userDoc = await getDoc(doc(db, 'users', targetUid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          setUser({ ...userData, uid: targetUid });
          setEditNickname(userData.nickname || '');
          setEditIntro(userData.intro || '');
          setSelectedGrade(userData.grade || '🍒');
          // 본인 여부 판별
          let isMe = loginUser.uid === targetUid;
          setIsOwner(isMe);
          // load data for this user
          loadUserData(targetUid, isMe);
          loadMyPosts(userData.nickname);
          loadActivityStats(userData.nickname);
          setupGuestMessagesListener(userData.nickname);
          fetchRecentPosts();
          loadMyEvaluationPosts(userData.nickname);
          loadApprovedSongs(userData.nickname);
        } else {
          setError('존재하지 않는 유저입니다.');
        }
      } catch (error) {
        setError('유저 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    }
    try {
      if (uid) {
        fetchUserData(uid);
      } else {
        setUser(loginUser);
        setEditNickname(loginUser.nickname || '');
        setEditIntro(loginUser.intro || '');
        setSelectedGrade(loginUser.grade || '🍒');
        setIsOwner(true);
        // Firestore에서 내 정보가 있으면 덮어씌우고, 없으면 fallback
        loadUserData(loginUser.uid, true).catch((err) => {
          setError('내 사용자 정보를 Firestore에서 찾을 수 없습니다. (localStorage 정보만 표시)');
          setLoading(false);
        });
        loadMyPosts(loginUser.nickname);
        loadActivityStats(loginUser.nickname);
        setupGuestMessagesListener(loginUser.nickname);
        fetchRecentPosts();
        loadMyEvaluationPosts(loginUser.nickname);
        loadApprovedSongs(loginUser.nickname);
        setLoading(false); // Firestore 실패해도 localStorage 정보로 렌더링
      }
    } catch (error) {
      console.error('Error initializing user data:', error);
      setError('사용자 데이터를 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
    }
    // Cleanup function
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [navigate, uid]);

  const loadUserData = useCallback(async (uid: string, isOwner: boolean) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (!userDoc.exists()) {
        if (isOwner) return; // 본인 마이페이지면 localStorage 정보만 사용
        throw new Error('사용자를 찾을 수 없습니다.');
      }
      const userData = { uid, ...userDoc.data() } as User;
      setUser(userData);
      setEditNickname(userData.nickname || '');
      setEditIntro(userData.intro || '');
      setSelectedGrade(userData.grade || '🍒');
      if (isOwner) {
        localStorage.setItem('veryus_user', JSON.stringify(userData));
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      if (!isOwner) setError('사용자 데이터를 불러오는 중 오류가 발생했습니다.');
    }
  }, []);

  const loadMyPosts = useCallback(async (nickname: string) => {
    try {
      const postsQuery = query(
        collection(db, 'posts'),
        where('writerNickname', '==', nickname),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(postsQuery);
      const posts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Post[];
      setMyPosts(posts);
    } catch (error) {
      console.error('Error loading posts:', error);
      setError('게시글을 불러오는 중 오류가 발생했습니다.');
    }
  }, []);

  const loadActivityStats = useCallback(async (nickname: string) => {
    try {
      const [postsSnapshot, commentsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'posts'), where('writerNickname', '==', nickname))),
        getDocs(query(collection(db, 'comments'), where('writerNickname', '==', nickname)))
      ]);
      
      const totalLikes = postsSnapshot.docs.reduce((sum, doc) => sum + (doc.data().likesCount || 0), 0);

      setActivityStats({
        postsCount: postsSnapshot.size,
        commentsCount: commentsSnapshot.size,
        totalLikes,
        averageScore: 0,
        lastEvaluationDate: ''
      });
    } catch (error) {
      console.error('Error loading activity stats:', error);
      setError('활동 통계를 불러오는 중 오류가 발생했습니다.');
    }
  }, []);

  const setupGuestMessagesListener = useCallback((nickname: string) => {
    try {
      const messagesQuery = query(
        collection(db, 'guestbook'),
        where('toNickname', '==', nickname),
        orderBy('createdAt', 'desc')
      );
      
      const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        const messages = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as GuestbookMessage[];
        setGuestMessages(messages);
      }, (error) => {
        console.error('Error in guestbook listener:', error);
        setError('방명록을 불러오는 중 오류가 발생했습니다.');
      });

      unsubscribeRef.current = unsubscribe;
    } catch (error) {
      console.error('Error setting up guestbook listener:', error);
      setError('방명록 설정 중 오류가 발생했습니다.');
    }
  }, []);

  const fetchRecentPosts = useCallback(async () => {
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
  }, []);

  const handleProfileImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOwner) return;
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file
    if (file.size > 5 * 1024 * 1024) {
      setError('프로필 이미지는 5MB 이하로 선택해주세요.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    try {
      const oldImageUrl = user.profileImageUrl;
      const timestamp = Date.now();
      const imageRef = ref(storage, `profile-images/${user.uid}/${timestamp}`);
      
      // 현재 로그인된 사용자의 인증 토큰 확인
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError('로그인이 필요합니다.');
        return;
      }

      await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(imageRef);

      await updateDoc(doc(db, 'users', user.uid), {
        profileImageUrl: downloadURL
      });

      const updatedUser = { ...user, profileImageUrl: downloadURL };
      setUser(updatedUser);

      if (oldImageUrl) {
        try {
          await deleteObject(ref(storage, oldImageUrl));
        } catch (error) {
          console.error('Error deleting old profile image:', error);
        }
      }
    } catch (error) {
      console.error('Error uploading profile image:', error);
      
      // 더 자세한 오류 메시지 설정
      if (error instanceof Error) {
        if (error.message.includes('unauthorized')) {
          setError('프로필 이미지 업로드 권한이 없습니다. 다시 로그인해주세요.');
        } else {
          setError(`프로필 사진 업로드 중 오류가 발생했습니다: ${error.message}`);
        }
      } else {
        setError('알 수 없는 오류가 발생했습니다.');
      }
    }
  }, [user, auth, isOwner]);

  const handleSaveProfile = useCallback(async () => {
    if (!user || !isOwner) return;

    try {
      const oldNickname = user.nickname;
      
      await updateDoc(doc(db, 'users', user.uid), {
        nickname: editNickname
      });

      if (oldNickname !== editNickname) {
        await updateNicknameInAllDocuments(oldNickname, editNickname);
      }

      const updatedUser = { ...user, nickname: editNickname };
      setUser(updatedUser);

      setEditingProfile(false);
      
      if (oldNickname !== editNickname) {
        loadMyPosts(editNickname);
        loadActivityStats(editNickname);
        setupGuestMessagesListener(editNickname);
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      setError('프로필 저장 중 오류가 발생했습니다.');
    }
  }, [user, editNickname, loadMyPosts, loadActivityStats, setupGuestMessagesListener, isOwner]);

  const updateNicknameInAllDocuments = async (oldNickname: string, newNickname: string) => {
    try {
      const batch = writeBatch(db);

      // 게시글 업데이트
      const postsQuery = query(collection(db, 'posts'), where('writerNickname', '==', oldNickname));
      const postsSnapshot = await getDocs(postsQuery);
      postsSnapshot.forEach((doc) => {
        batch.update(doc.ref, { writerNickname: newNickname });
      });

      // 댓글 업데이트
      const commentsQuery = query(collection(db, 'comments'), where('writerNickname', '==', oldNickname));
      const commentsSnapshot = await getDocs(commentsQuery);
      commentsSnapshot.forEach((doc) => {
        batch.update(doc.ref, { writerNickname: newNickname });
      });

      // 방명록 업데이트
      const guestFromQuery = query(collection(db, 'guestbook'), where('fromNickname', '==', oldNickname));
      const guestFromSnapshot = await getDocs(guestFromQuery);
      guestFromSnapshot.forEach((doc) => {
        batch.update(doc.ref, { fromNickname: newNickname });
      });

      const guestToQuery = query(collection(db, 'guestbook'), where('toNickname', '==', oldNickname));
      const guestToSnapshot = await getDocs(guestToQuery);
      guestToSnapshot.forEach((doc) => {
        batch.update(doc.ref, { toNickname: newNickname });
      });

      await batch.commit();
    } catch (error) {
      console.error('Error updating nickname in documents:', error);
      throw error; // Re-throw to be caught by the caller
    }
  };

  const handleSaveIntro = useCallback(async () => {
    if (!user) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        intro: editIntro
      });

      const updatedUser = { ...user, intro: editIntro };
      setUser(updatedUser);
    } catch (error) {
      console.error('Error saving intro:', error);
      setError('자기소개 저장 중 오류가 발생했습니다.');
    }
  }, [user, editIntro]);

  const handleSendGuestMessage = useCallback(async () => {
    if (!newGuestMessage.trim() || !user || !currentUser) return;
    try {
      await addDoc(collection(db, 'guestbook'), {
        toNickname: user.nickname,
        fromNickname: currentUser.nickname,
        message: newGuestMessage,
        createdAt: serverTimestamp()
      });
      setNewGuestMessage('');
    } catch (error) {
      console.error('Error sending guest message:', error);
      setError('방명록 작성 중 오류가 발생했습니다.');
    }
  }, [newGuestMessage, user, currentUser]);

  const handleDeleteGuestMessage = useCallback(async (messageId: string, fromNickname: string) => {
    if (!user) return;
    if (fromNickname !== user.nickname && user.nickname !== user.nickname) {
      setError('삭제 권한이 없습니다.');
      return;
    }
    // 삭제 확인 안내
    if (!window.confirm('정말로 이 방명록 메시지를 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'guestbook', messageId));
    } catch (error) {
      console.error('Error deleting guest message:', error);
      setError('메시지 삭제 중 오류가 발생했습니다.');
    }
  }, [user]);

  const handleGradeChange = useCallback(async (newGrade: string) => {
    if (!user) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        grade: newGrade
      });

      setUser(prev => prev ? { ...prev, grade: newGrade } : null);
    } catch (error) {
      console.error('Error changing grade:', error);
      setError('등급 변경 중 오류가 발생했습니다.');
    }
  }, [user]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleDateString('ko-KR');
  };

  const getGradeEmoji = (grade: string) => {
    return grade?.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu)?.[0] || '🍒';
  };

  const handleProfileImageClick = () => {
    fileInputRef.current?.click();
  };

  const getGradeDisplay = (grade: string) => {
    // 이미 이모지인 경우 그대로 반환
    if (GRADE_OPTIONS.includes(grade)) return grade;
    // 텍스트인 경우 해당하는 이모지 찾기
    const emoji = Object.entries(GRADE_NAMES).find(([_, name]) => name === grade)?.[0];
    return emoji || '🍒'; // 기본값은 체리
  };

  const getGradeName = (emoji: string) => {
    return GRADE_NAMES[emoji] || '체리';
  };

  const handleSaveJoinDate = useCallback(async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        createdAt: new Date(editJoinDate + 'T00:00:00')
      });
      // Firestore Timestamp를 흉내내서 화면 즉시 갱신
      setUser({ ...user, createdAt: { seconds: Math.floor(new Date(editJoinDate + 'T00:00:00').getTime() / 1000) } });
      setEditingJoinDate(false);
    } catch (error) {
      setError('가입일 저장 중 오류가 발생했습니다.');
    }
  }, [user, editJoinDate]);

  const loadMyEvaluationPosts = useCallback(async (nickname: string) => {
    try {
      // 1. 내가 작성자
      const writerQuery = query(
        collection(db, 'posts'),
        where('type', '==', 'evaluation'),
        where('writerNickname', '==', nickname)
      );
      const writerSnap = await getDocs(writerQuery);
      // 2. 내가 멤버
      const memberQuery = query(
        collection(db, 'posts'),
        where('type', '==', 'evaluation'),
        where('members', 'array-contains', nickname)
      );
      const memberSnap = await getDocs(memberQuery);
      // 중복 제거
      const allDocs = [...writerSnap.docs, ...memberSnap.docs];
      const uniqueMap = new Map();
      allDocs.forEach(doc => uniqueMap.set(doc.id, { id: doc.id, ...doc.data() }));
      const posts = Array.from(uniqueMap.values()) as Post[];
      // 최신순 정렬
      posts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMyEvaluationPosts(posts);
    } catch (error) {
      console.error('Error loading evaluation posts:', error);
      setError('평가 이력 불러오기 오류');
    }
  }, []);

  const loadApprovedSongs = useCallback(async (nickname: string) => {
    try {
      const q = query(collection(db, 'approvedSongs'), where('members', 'array-contains', nickname));
      const snap = await getDocs(q);
      const songs = snap.docs.map(doc => {
        const data = doc.data() as ApprovedSong;
        return { ...data, id: doc.id };
      });
      // 최신순 정렬(합격일 createdAt 기준)
      songs.sort((a, b) => ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setApprovedSongs(songs);
    } catch (error) {
      console.error('합격곡 불러오기 오류:', error);
      setApprovedSongs([]);
    }
  }, []);

  // 유저 등급 정보 fetch
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, 'users'));
      const map: Record<string, {grade?: string}> = {};
      snap.docs.forEach(doc => {
        const d = doc.data();
        if (d.nickname) map[d.nickname] = { grade: d.grade };
      });
      setUserMap(map);
    })();
  }, []);

  // 합격곡 등급 계산 함수
  const getSongGrade = (song: ApprovedSong) => {
    const idxs = (song.members||[]).map((m:string) => GRADE_ORDER.indexOf(userMap[m]?.grade||'🍒'));
    const minIdx = Math.min(...(idxs.length?idxs:[GRADE_ORDER.length-1]));
    return GRADE_ORDER[minIdx] || '🍒';
  };

  if (loading) {
    return (
      <div className="mypage-container">
        <div className="loading-container">
          <h2>마이페이지 로딩 중...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mypage-container">
        <div className="error-container">
          <h2>오류가 발생했습니다</h2>
          <p>{error}</p>
          <button onClick={() => setError(null)}>다시 시도</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mypage-container">
      {/* 헤더 */}
      <div className="mypage-header">
        <button className="back-button" onClick={() => navigate('/')}>
          <ArrowLeft size={20} />
          홈으로
        </button>
      </div>

      {/* 프로필 히어로 섹션 */}
      <div className="profile-hero" style={{
        background: 'linear-gradient(135deg, #E5DAF5 0%, #D4C2F0 100%)',
        borderRadius: '24px',
        padding: '40px 32px 32px 32px',
        marginBottom: '32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
        boxShadow: '0 8px 30px rgba(138, 85, 204, 0.10)'
      }}>
        <div className="profile-image-section" style={{ minWidth: 120, minHeight: 120, marginBottom: 16, display: 'flex', justifyContent: 'center' }} onClick={isOwner ? handleProfileImageClick : undefined}>
          <div className="profile-image" style={{ width: 120, height: 120, border: '4px solid #B497D6', boxShadow: '0 4px 16px #E5DAF5', cursor: isOwner ? 'pointer' : 'default', position: 'relative' }}>
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="프로필" />
            ) : (
              <User size={64} color="#B497D6" />
            )}
            {isOwner && (
              <>
                <div className="upload-overlay" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.3)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.3s' }}>
                  <Camera size={28} />
                </div>
                <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleProfileImageUpload} />
              </>
            )}
          </div>
        </div>
        <div className="profile-hero-info" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
            <span className="profile-hero-nickname" style={{ fontSize: 24, fontWeight: 700, color: '#8A55CC', textAlign: 'center' }}>{user?.nickname}</span>
            <span className="profile-hero-grade-emoji" style={{ fontSize: 30 }}>{user?.grade}</span>
            {user?.role && user.role !== '일반' && (
              <span className="profile-hero-role-emph" style={{
                fontSize: 16,
                color: '#fff',
                background: 'linear-gradient(90deg, #8A55CC 60%, #B497D6 100%)',
                borderRadius: 8,
                padding: '2px 14px',
                fontWeight: 700,
                marginLeft: 8,
                letterSpacing: '0.02em',
                boxShadow: '0 2px 8px #E5DAF5',
                display: 'inline-block',
                verticalAlign: 'middle'
              }}>{user.role}</span>
            )}
          </div>
          {editingProfile ? (
            <div style={{ marginTop: 8 }}>
              <textarea
                value={editIntro}
                onChange={e => setEditIntro(e.target.value)}
                className="edit-textarea"
                placeholder="자기소개를 입력해주세요..."
                rows={3}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <div className="edit-buttons">
                <button onClick={async () => { await handleSaveIntro(); setEditingProfile(false); }} className="save-btn"><Save size={16} />저장</button>
                <button onClick={() => { setEditingProfile(false); setEditIntro(user?.intro || ''); }} className="cancel-btn"><X size={16} />취소</button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 16, color: '#6B7280', textAlign: 'center' }}>{user?.intro || '한 줄 소개를 입력해보세요!'}</div>
          )}
          <div style={{ marginTop: 8, fontSize: 14, color: '#B497D6', textAlign: 'center' }}>
            가입일: {editingJoinDate ? (
              <>
                <input
                  type="date"
                  value={editJoinDate}
                  onChange={e => setEditJoinDate(e.target.value)}
                  style={{ marginRight: 8 }}
                />
                <button onClick={handleSaveJoinDate} style={{ marginRight: 4, background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontWeight: 600, cursor: 'pointer' }}>저장</button>
                <button onClick={() => setEditingJoinDate(false)} style={{ background: '#eee', color: '#8A55CC', border: 'none', borderRadius: 6, padding: '4px 12px', fontWeight: 600, cursor: 'pointer' }}>취소</button>
              </>
            ) : (
              <>
                {user?.createdAt && (new Date(user.createdAt.seconds * 1000)).toLocaleDateString('ko-KR')}
                {isOwner && (
                  <button onClick={() => {
                    setEditingJoinDate(true);
                    setEditJoinDate(user?.createdAt
                      ? new Date(user.createdAt.seconds * 1000).toISOString().slice(0, 10)
                      : '');
                  }} style={{ marginLeft: 8, background: '#F6F2FF', color: '#8A55CC', border: 'none', borderRadius: 6, padding: '4px 12px', fontWeight: 600, cursor: 'pointer' }}>수정</button>
                )}
              </>
            )}
          </div>
          {isOwner && !editingProfile && (
            <button className="edit-profile-btn" style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, background: '#8A55CC', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 16 }} onClick={() => { setEditingProfile(true); setEditIntro(user?.intro || ''); }}>
              <Edit3 size={18} style={{ marginRight: 6 }} /> 프로필 수정
            </button>
          )}
        </div>
      </div>

      {/* 등급 카드 */}
      <div className="grade-section">
        <h3>현재 등급</h3>
        {editingGrade ? (
          <div className="grade-edit">
            <select
              value={selectedGrade || (user?.grade ? getGradeDisplay(user.grade) : '🍒')}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="grade-select"
            >
              {GRADE_OPTIONS.filter(g => g !== '🌌').map(grade => (
                <option key={grade} value={grade}>
                  {grade} {getGradeName(grade)}
                </option>
              ))}
            </select>
            <div className="grade-actions">
              <button
                className="save-btn"
                onClick={() => handleGradeChange(selectedGrade)}
              >
                <Save size={16} />
                저장
              </button>
              <button
                className="cancel-btn"
                onClick={() => {
                  setEditingGrade(false);
                  setSelectedGrade('');
                }}
              >
                <X size={16} />
                취소
              </button>
            </div>
          </div>
        ) : (
          <div className="grade-display">
            <span className="grade-emoji">
              {user?.grade ? getGradeDisplay(user.grade) : '🍒'}
            </span>
            <span className="grade-name">
              {user?.grade ? getGradeName(getGradeDisplay(user.grade)) : '체리'}
            </span>
            {isOwner && (
              <button
                className="edit-btn"
                onClick={() => {
                  setEditingGrade(true);
                  setSelectedGrade(user?.grade ? getGradeDisplay(user.grade) : '🍒');
                }}
              >
                <Edit3 size={16} />
                수정
              </button>
            )}
          </div>
        )}
      </div>

      {/* 활동/통계 카드 */}
      <div className="stats-card">
        <h3>활동 통계</h3>
        <div className="stats-grid" style={{ marginBottom: 32 }}>
          <div className="stat-item">
            <FileText className="stat-icon" />
            <div className="stat-info">
              <div className="stat-number">{activityStats.postsCount}</div>
              <div className="stat-label">내가 쓴 글</div>
            </div>
          </div>
          <div className="stat-item">
            <MessageCircle className="stat-icon" />
            <div className="stat-info">
              <div className="stat-number">{activityStats.commentsCount}</div>
              <div className="stat-label">내가 쓴 댓글</div>
            </div>
          </div>
          <div className="stat-item">
            <Heart className="stat-icon" />
            <div className="stat-info">
              <div className="stat-number">{activityStats.totalLikes}</div>
              <div className="stat-label">받은 좋아요</div>
            </div>
          </div>
          <div className="stat-item">
            <Star className="stat-icon" />
            <div className="stat-info">
              <div className="stat-number">{activityStats.averageScore || '-'} </div>
              <div className="stat-label">평균 평가점수</div>
            </div>
          </div>
        </div>
      </div>

      {/* 등급/뱃지 컬렉션 */}
      <div className="badge-collection" style={{ marginBottom: 32, background: '#F6F2FF', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px #E5DAF5', textAlign: 'center' }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#8A55CC', marginBottom: 16, textAlign: 'center' }}>내 등급/뱃지</h3>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 }}>
            {/* 1줄: 🍒, 🫐, 🥝, 🍎, 🍈, 🍉, 🌍, 🪐, ☀️, 🌌 */}
            {GRADE_OPTIONS.filter(e => !['🍺','⚡','⭐','🌙'].includes(e)).map((emoji) => (
              <div key={emoji} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 }}>
                <span style={{ fontSize: 32 }}>{emoji}</span>
                <span style={{ fontSize: 14, color: '#7C4DBC', fontWeight: 600 }}>{GRADE_NAMES[emoji]}</span>
                {user?.grade === emoji && <span style={{ color: '#fff', background: '#8A55CC', borderRadius: 8, padding: '2px 8px', fontSize: 12, marginTop: 4 }}>내 등급</span>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* 2줄: 🍺, ⚡, ⭐, 🌙 */}
            {GRADE_OPTIONS.filter(e => ['🍺','⚡','⭐','🌙'].includes(e)).map((emoji) => (
              <div key={emoji} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 }}>
                <span style={{ fontSize: 32 }}>{emoji}</span>
                <span style={{ fontSize: 14, color: '#7C4DBC', fontWeight: 600 }}>{GRADE_NAMES[emoji]}</span>
                {user?.grade === emoji && <span style={{ color: '#fff', background: '#8A55CC', borderRadius: 8, padding: '2px 8px', fontSize: 12, marginTop: 4 }}>내 등급</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 최근 활동 섹션 */}
      <div className="recent-activity" style={{ marginBottom: 32, background: '#F9FAFB', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px #E5DAF5' }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#8A55CC', marginBottom: 16 }}>최근 활동</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {myPosts.slice(0, 5).map(post => (
            <div key={post.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #E5DAF5' }}>
              <span style={{ color: '#8A55CC', fontWeight: 700 }}>[{post.type === 'free' ? '자유게시판' : post.type === 'recording' ? '녹음게시판' : post.type === 'evaluation' ? '평가게시판' : post.type === 'partner' ? '파트너모집' : post.type}]</span>
              <span style={{ fontWeight: 600 }}>{post.title}</span>
              <span style={{ color: '#9CA3AF', fontSize: 12 }}>{formatDate(post.createdAt)}</span>
            </div>
          ))}
          {myPosts.length === 0 && <span style={{ color: '#B497D6' }}>최근 작성한 글이 없습니다.</span>}
        </div>
      </div>

      {/* 합격곡 카드 */}
      <div className="approved-songs-card" style={{ marginBottom: 32, background: '#F6F2FF', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px #E5DAF5' }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#8A55CC', marginBottom: 16 }}>합격곡</h3>
        {approvedSongs.length === 0 ? (
          <div style={{ color: '#B497D6', textAlign: 'center', fontWeight: 500 }}>아직 합격곡이 없습니다.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(showAllSongs ? approvedSongs : approvedSongs.slice(0,5)).map(song => (
                <div key={song.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #E5DAF5' }}>
                  <span style={{ fontSize: 22 }}>{getSongGrade(song)}</span>
                  <span style={{ fontWeight: 700, color: '#8A55CC', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate('/approved-songs')}>{song.title}</span>
                  <span style={{ color: '#7C4DBC', fontWeight: 500, fontSize: 14 }}>멤버: {Array.isArray(song.members) ? song.members.join(', ') : ''}</span>
                  <span style={{ color: '#9CA3AF', fontSize: 12 }}>{song.createdAt && song.createdAt.seconds ? (new Date(song.createdAt.seconds * 1000)).toLocaleDateString('ko-KR') : ''}</span>
                </div>
              ))}
            </div>
            {approvedSongs.length > 5 && (
              <button style={{ marginTop: 12, background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 18px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setShowAllSongs(v => !v)}>
                {showAllSongs ? '접기' : `더보기 (${approvedSongs.length - 5}곡)`}
              </button>
            )}
          </>
        )}
      </div>

      {/* 설정/계정 카드 */}
      {isOwner && (
        <div className="settings-section" style={{ display: 'flex', gap: 24, marginBottom: 32 }}>
          <button className="settings-card" style={{ flex: 1, background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px #E5DAF5', border: 'none', fontWeight: 600, color: '#8A55CC', fontSize: 16, cursor: 'pointer' }} onClick={() => navigate('/settings')}>프로필/계정 설정</button>
          <button className="settings-card" style={{ flex: 1, background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px #E5DAF5', border: 'none', fontWeight: 600, color: '#8A55CC', fontSize: 16, cursor: 'pointer' }} onClick={() => auth.signOut()}>로그아웃</button>
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="tab-navigation">
        <button 
          className={`tab-button ${activeTab === 'posts' ? 'active' : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          <FileText size={16} />
          내 글
        </button>
        <button 
          className={`tab-button ${activeTab === 'evaluations' ? 'active' : ''}`}
          onClick={() => setActiveTab('evaluations')}
        >
          <Star size={16} />
          평가 이력
        </button>
        <button 
          className={`tab-button ${activeTab === 'guestbook' ? 'active' : ''}`}
          onClick={() => setActiveTab('guestbook')}
        >
          <Users size={16} />
          방명록
        </button>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="tab-content">
        {activeTab === 'posts' && (
          <div className="posts-list">
            {myPosts.length === 0 ? (
              <div className="empty-state">
                <FileText size={48} />
                <h3>작성한 글이 없습니다</h3>
                <p>첫 번째 글을 작성해보세요!</p>
              </div>
            ) : (
              myPosts.map((post) => (
                <div key={post.id} className="post-item">
                  <h4 className="post-title">{post.title}</h4>
                  <div className="post-meta">
                    <span className="post-type">{post.type}</span>
                    <span className="post-date">{formatDate(post.createdAt)}</span>
                    <div className="post-stats">
                      <span><Heart size={12} /> {post.likesCount}</span>
                      <span><MessageCircle size={12} /> {post.commentCount}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'evaluations' && (
          <div className="evaluations-list">
            {myEvaluationPosts.length === 0 ? (
              <div className="empty-state">
                <Star size={48} />
                <h3>평가 이력이 없습니다</h3>
                <p>평가받은 게시글이 여기에 표시됩니다.</p>
              </div>
            ) : (
              myEvaluationPosts.map((post) => (
                <div key={post.id} className="evaluation-item">
                  <h4 className="post-title">{post.title}</h4>
                  <div className="post-meta">
                    <span className="post-type">{post.type}</span>
                    <span className="post-date">{formatDate(post.createdAt)}</span>
                    <div className="post-stats">
                      <span><Heart size={12} /> {post.likesCount}</span>
                      <span><MessageCircle size={12} /> {post.commentCount}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'guestbook' && (
          <div className="guestbook-section">
            <div className="guestbook-write">
              <textarea
                value={newGuestMessage}
                onChange={(e) => setNewGuestMessage(e.target.value)}
                placeholder="방명록에 메시지를 남겨보세요..."
                className="guestbook-textarea"
              />
              <button onClick={handleSendGuestMessage} className="send-btn">
                <Send size={16} />
                보내기
              </button>
            </div>
            <div className="guestbook-list">
              {guestMessages.length === 0 ? (
                <div className="empty-state">
                  <Users size={48} />
                  <h3>방명록이 비어있습니다</h3>
                  <p>첫 번째 메시지를 남겨보세요!</p>
                </div>
              ) : (
                guestMessages.map((message) => (
                  <div key={message.id} className="guestbook-item">
                    <div className="message-header">
                      <span className="message-author">{message.fromNickname}</span>
                      <span className="message-date">{formatDate(message.createdAt)}</span>
                      {(currentUser && message.fromNickname === currentUser.nickname) && (
                        <button 
                          onClick={() => handleDeleteGuestMessage(message.id, message.fromNickname)}
                          className="delete-btn"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <p className="message-content">{message.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyPage; 