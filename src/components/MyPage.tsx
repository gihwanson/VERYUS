import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Send,
  Mic,
  Play,
  Pause,
  Settings,
  Download,
  Bell,
  BellOff
} from 'lucide-react';
import './MyPage.css';
import { auth } from '../firebase';
import { NotificationService } from '../utils/notificationService';
import { enablePushNotifications, removeAllPushTokens } from '../utils/pushNotificationService';
import { GRADE_NAMES, GRADE_SYSTEM } from './AdminTypes';

interface User {
  uid: string;
  email: string;
  nickname: string;
  role: string;
  grade: string;
  profileImageUrl?: string;
  intro?: string;
  notificationsEnabled?: boolean;
  createdAt: any;
}

interface Post {
  id: string;
  title: string;
  type: string;
  createdAt: any;
  likesCount: number;
  commentCount: number;
  audioUrl?: string;
  fileName?: string;
  duration?: number;
  members?: string[];
  writerNickname?: string;
  status?: string;
  category?: string;
}

interface ActivityStats {
  postsCount: number;
  commentsCount: number;
  totalLikes: number;
  averageScore: number;
  lastEvaluationDate: string;
}

/** 활동 통계 모달: 내 댓글 + 원글 메타 */
interface ProfileCommentEntry {
  id: string;
  postId: string;
  postType: string;
  postTitle: string;
  contentPreview: string;
  createdAt: any;
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
  audioUrl?: string;
  approvedPostId?: string;
  postId?: string;
  fileName?: string;
  duration?: number;
}

type GradeOption = {
  value: string;
  emoji: string;
  category: '일반' | '예외';
};

const GRADE_OPTIONS: GradeOption[] = [
  { value: GRADE_SYSTEM.CHERRY, emoji: GRADE_SYSTEM.CHERRY, category: '일반' },
  { value: GRADE_SYSTEM.BLUEBERRY, emoji: GRADE_SYSTEM.BLUEBERRY, category: '일반' },
  { value: GRADE_SYSTEM.KIWI, emoji: GRADE_SYSTEM.KIWI, category: '일반' },
  { value: GRADE_SYSTEM.APPLE, emoji: GRADE_SYSTEM.APPLE, category: '일반' },
  { value: GRADE_SYSTEM.MELON, emoji: GRADE_SYSTEM.MELON, category: '일반' },
  { value: GRADE_SYSTEM.WATERMELON, emoji: GRADE_SYSTEM.WATERMELON, category: '일반' },
  { value: GRADE_SYSTEM.EARTH, emoji: GRADE_SYSTEM.EARTH, category: '일반' },
  { value: GRADE_SYSTEM.SATURN, emoji: GRADE_SYSTEM.SATURN, category: '일반' },
  { value: GRADE_SYSTEM.SUN, emoji: GRADE_SYSTEM.SUN, category: '일반' },
  { value: GRADE_SYSTEM.CRESCENT, emoji: GRADE_SYSTEM.CRESCENT, category: '예외' },
  { value: GRADE_SYSTEM.GALAXY, emoji: GRADE_SYSTEM.GALAXY, category: '예외' }
];

const GRADE_NAME_TO_EMOJI: Record<string, string> = GRADE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.emoji;
  return acc;
}, {} as Record<string, string>);

const GRADE_EMOJI_TO_NAME: Record<string, string> = GRADE_OPTIONS.reduce((acc, option) => {
  acc[option.emoji] = option.value;
  return acc;
}, {} as Record<string, string>);

const GRADE_ORDER = GRADE_OPTIONS.map((option) => option.emoji);

const MyPage: React.FC = () => {
  const navigate = useNavigate();
  const { uid } = useParams();
  const [user, setUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'evaluations' | 'recordings' | 'guestbook'>('posts');
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
  const [myRecordings, setMyRecordings] = useState<Post[]>([]);
  const [approvedSongs, setApprovedSongs] = useState<ApprovedSong[]>([]);

  // Cleanup subscriptions
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // 가입일 관련 상태
  const [editingJoinDate, setEditingJoinDate] = useState(false);
  const [editJoinDate, setEditJoinDate] = useState('');

  // 유저 등급 정보 fetch
  const [userMap, setUserMap] = useState<Record<string, {grade?: string}>>({});
  const [showAllSongs, setShowAllSongs] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationUpdating, setNotificationUpdating] = useState(false);
  const [statsModal, setStatsModal] = useState<'posts' | 'comments' | 'likes' | null>(null);
  const [profileCommentsWithPosts, setProfileCommentsWithPosts] = useState<ProfileCommentEntry[]>([]);

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
    setNotificationsEnabled(loginUser.notificationsEnabled ?? true);
    setEditingProfile(false);
    setEditingGrade(false);
    setEditingJoinDate(false);
    setEditingIntro(false);

    async function fetchUserData(targetUid: string) {
      try {
        const userDoc = await getDoc(doc(db, 'users', targetUid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          setUser({ ...userData, uid: targetUid });
          setEditNickname(userData.nickname || '');
          setEditIntro(userData.intro || '');
          setSelectedGrade(userData.grade || GRADE_SYSTEM.CHERRY);
          setNotificationsEnabled(userData.notificationsEnabled ?? true);
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
          loadMyRecordings(userData.nickname);
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
        setSelectedGrade(loginUser.grade || GRADE_SYSTEM.CHERRY);
        setNotificationsEnabled(loginUser.notificationsEnabled ?? true);
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
        loadMyRecordings(loginUser.nickname);
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
      setSelectedGrade(userData.grade || GRADE_SYSTEM.CHERRY);
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

      const totalLikes = postsSnapshot.docs.reduce((sum, d) => sum + (d.data().likesCount || 0), 0);

      setActivityStats({
        postsCount: postsSnapshot.size,
        commentsCount: commentsSnapshot.size,
        totalLikes,
        averageScore: 0,
        lastEvaluationDate: ''
      });

      const rawComments = commentsSnapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Record<string, unknown>)
      })) as Array<{ id: string; postId?: string; content?: string; createdAt?: { seconds?: number } }>;

      const postIds = [...new Set(rawComments.map((c) => c.postId).filter(Boolean))] as string[];
      const postMetas = await Promise.all(
        postIds.map(async (pid) => {
          const snap = await getDoc(doc(db, 'posts', pid));
          if (!snap.exists()) return null;
          const data = snap.data() as { title?: string; type?: string };
          return { postId: pid, title: data.title || '제목 없음', type: data.type || 'free' };
        })
      );
      const metaMap = new Map(
        postMetas.filter((m): m is NonNullable<typeof m> => m !== null).map((m) => [m.postId, m])
      );

      const enriched: ProfileCommentEntry[] = rawComments
        .filter(
          (c) =>
            c.postId &&
            metaMap.has(c.postId) &&
            c.content &&
            c.content !== '[삭제된 댓글입니다.]'
        )
        .map((c) => {
          const m = metaMap.get(c.postId!)!;
          return {
            id: c.id,
            postId: c.postId!,
            postType: m.type,
            postTitle: m.title,
            contentPreview: (c.content || '').trim().slice(0, 100),
            createdAt: c.createdAt
          };
        })
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

      setProfileCommentsWithPosts(enriched);
    } catch (error) {
      console.error('Error loading activity stats:', error);
      setProfileCommentsWithPosts([]);
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
      const nextNickname = editNickname.trim();

      if (!nextNickname) {
        setError('닉네임을 입력해주세요.');
        return;
      }
      
      await updateDoc(doc(db, 'users', user.uid), {
        nickname: nextNickname,
        intro: editIntro
      });

      if (oldNickname !== nextNickname) {
        await updateNicknameInAllDocuments(oldNickname, nextNickname);
      }

      const updatedUser = { ...user, nickname: nextNickname, intro: editIntro };
      setUser(updatedUser);
      setCurrentUser(prev => prev ? { ...prev, nickname: nextNickname, intro: editIntro } : prev);
      localStorage.setItem('veryus_user', JSON.stringify(updatedUser));

      setEditingProfile(false);
      
      if (oldNickname !== nextNickname) {
        loadMyPosts(nextNickname);
        loadActivityStats(nextNickname);
        setupGuestMessagesListener(nextNickname);
        // 평가 게시글과 녹음 다시 로드
        const loadEvalPosts = async () => {
          try {
            const writerQuery = query(
              collection(db, 'posts'),
              where('type', '==', 'evaluation'),
              where('writerNickname', '==', nextNickname)
            );
            const writerSnap = await getDocs(writerQuery);
            const memberQuery = query(
              collection(db, 'posts'),
              where('type', '==', 'evaluation'),
              where('members', 'array-contains', nextNickname)
            );
            const memberSnap = await getDocs(memberQuery);
            const allDocs = [...writerSnap.docs, ...memberSnap.docs];
            const uniqueMap = new Map();
            allDocs.forEach(doc => uniqueMap.set(doc.id, { id: doc.id, ...doc.data() }));
            const posts = Array.from(uniqueMap.values()) as Post[];
            posts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setMyEvaluationPosts(posts);
          } catch (error) {
            console.error('Error loading evaluation posts:', error);
          }
        };
        
        const loadRecordings = async () => {
          try {
            const recordingQuery = query(
              collection(db, 'posts'),
              where('type', '==', 'recording'),
              where('writerNickname', '==', nextNickname)
            );
            const recordingSnap = await getDocs(recordingQuery);
            const evaluationQuery = query(
              collection(db, 'posts'),
              where('type', '==', 'evaluation'),
              where('members', 'array-contains', nextNickname)
            );
            const evaluationSnap = await getDocs(evaluationQuery);
            const evaluationWithAudio = evaluationSnap.docs.filter(doc => doc.data().audioUrl);
            const allDocs = [...recordingSnap.docs, ...evaluationWithAudio];
            const uniqueMap = new Map();
            allDocs.forEach(doc => uniqueMap.set(doc.id, { id: doc.id, ...doc.data() }));
            const recordings = Array.from(uniqueMap.values()) as Post[];
            recordings.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setMyRecordings(recordings);
          } catch (error) {
            console.error('Error loading recordings:', error);
          }
        };
        
        loadEvalPosts();
        loadRecordings();
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      setError('프로필 저장 중 오류가 발생했습니다.');
    }
  }, [user, editNickname, editIntro, loadMyPosts, loadActivityStats, setupGuestMessagesListener, isOwner]);

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

  const syncUserGradeInAllDocuments = useCallback(async (targetUid: string, newGrade: string) => {
    const batch = writeBatch(db);

    const postsQuery = query(collection(db, 'posts'), where('writerUid', '==', targetUid));
    const postsSnapshot = await getDocs(postsQuery);
    postsSnapshot.forEach((snapshotDoc) => {
      batch.update(snapshotDoc.ref, { writerGrade: newGrade });
    });

    const commentsQuery = query(collection(db, 'comments'), where('writerUid', '==', targetUid));
    const commentsSnapshot = await getDocs(commentsQuery);
    commentsSnapshot.forEach((snapshotDoc) => {
      batch.update(snapshotDoc.ref, { writerGrade: newGrade });
    });

    await batch.commit();
  }, []);

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
      // 방명록 알림 추가
      if (user.uid) {
        try {
          await NotificationService.createGuestbookNotification(
            user.uid,
            currentUser.uid,
            currentUser.nickname,
            newGuestMessage.trim()
          );
        } catch (err) {
          console.error('방명록 알림 생성 실패:', err);
        }
      }
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
    if (!user || !isOwner) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        grade: newGrade
      });
      await syncUserGradeInAllDocuments(user.uid, newGrade);

      const updatedUser = { ...user, grade: newGrade };
      setUser(updatedUser);
      setCurrentUser((prev) => (prev ? { ...prev, grade: newGrade } : prev));
      setSelectedGrade(newGrade);

      const localUser = localStorage.getItem('veryus_user');
      if (localUser) {
        const parsed = JSON.parse(localUser);
        localStorage.setItem('veryus_user', JSON.stringify({ ...parsed, grade: newGrade }));
      }
    } catch (error) {
      console.error('Error changing grade:', error);
      setError('등급 변경 중 오류가 발생했습니다.');
    }
  }, [user, isOwner, syncUserGradeInAllDocuments]);

  const handleNotificationToggle = useCallback(async () => {
    if (!user || !isOwner || notificationUpdating) return;

    const nextEnabled = !notificationsEnabled;
    setNotificationUpdating(true);
    setNotificationsEnabled(nextEnabled);

    try {
      if (nextEnabled) {
        const granted = await enablePushNotifications(user.uid);
        if (!granted) {
          setNotificationsEnabled(false);
          alert('푸시 권한이 허용되지 않았거나 설정이 완료되지 않았습니다.');
          return;
        }
      } else {
        await removeAllPushTokens(user.uid);
      }

      await updateDoc(doc(db, 'users', user.uid), {
        notificationsEnabled: nextEnabled
      });

      setNotificationsEnabled(nextEnabled);
      setUser((prev) => (prev ? { ...prev, notificationsEnabled: nextEnabled } : prev));
      setCurrentUser((prev) => (prev ? { ...prev, notificationsEnabled: nextEnabled } : prev));

      const localUser = localStorage.getItem('veryus_user');
      if (localUser) {
        const parsed = JSON.parse(localUser);
        localStorage.setItem(
          'veryus_user',
          JSON.stringify({
            ...parsed,
            notificationsEnabled: nextEnabled
          })
        );
      }
    } catch (error) {
      console.error('마이페이지 알림 설정 변경 실패:', error);
      setNotificationsEnabled(!nextEnabled);
      alert('알림 설정 변경 중 오류가 발생했습니다.');
    } finally {
      setNotificationUpdating(false);
    }
  }, [user, isOwner, notificationUpdating, notificationsEnabled]);

  const postsWithLikesList = useMemo(
    () =>
      [...myPosts]
        .filter((p) => (p.likesCount || 0) > 0)
        .sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0)),
    [myPosts]
  );

  const navigateToPost = useCallback((post: Pick<Post, 'id' | 'type'>) => {
    const t = post.type || 'free';
    navigate(NotificationService.getRouteByPostType(t, post.id));
  }, [navigate]);

  const postTypeLabel = (type: string) => {
    if (type === 'free') return '자유게시판';
    if (type === 'recording') return '녹음게시판';
    if (type === 'evaluation') return '평가게시판';
    if (type === 'partner') return '파트너모집';
    if (type === 'balance') return '밸런스';
    return type || '게시판';
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleDateString('ko-KR');
  };

  const getGradeEmoji = (grade: string) => {
    if (!grade) return GRADE_SYSTEM.CHERRY;
    if (GRADE_EMOJI_TO_NAME[grade]) return grade;
    return GRADE_NAME_TO_EMOJI[grade] || GRADE_SYSTEM.CHERRY;
  };

  const handleProfileImageClick = () => {
    fileInputRef.current?.click();
  };

  const getGradeDisplay = (grade: string) => {
    return getGradeEmoji(grade);
  };

  const getGradeName = (emoji: string) => {
    if (!emoji) return GRADE_NAMES[GRADE_SYSTEM.CHERRY];
    if (GRADE_NAME_TO_EMOJI[emoji]) return emoji;
    return GRADE_NAMES[emoji] || GRADE_EMOJI_TO_NAME[emoji] || GRADE_NAMES[GRADE_SYSTEM.CHERRY];
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

  const loadMyRecordings = useCallback(async (nickname: string) => {
    try {
      // 1. 녹음게시판에서 본인이 작성한 녹음들
      const recordingQuery = query(
        collection(db, 'posts'),
        where('type', '==', 'recording'),
        where('writerNickname', '==', nickname)
      );
      const recordingSnap = await getDocs(recordingQuery);
      
      // 2. 평가게시판에서 members에 본인 닉네임이 포함된 녹음들 (audioUrl이 있는 것만)
      const evaluationQuery = query(
        collection(db, 'posts'),
        where('type', '==', 'evaluation'),
        where('members', 'array-contains', nickname)
      );
      const evaluationSnap = await getDocs(evaluationQuery);
      
      // 평가게시판에서 audioUrl이 있는 것만 필터링
      const evaluationWithAudio = evaluationSnap.docs.filter(doc => doc.data().audioUrl);
      
      // 모든 녹음 데이터 합치기 (중복 제거)
      const allDocs = [...recordingSnap.docs, ...evaluationWithAudio];
      const uniqueMap = new Map();
      allDocs.forEach(doc => uniqueMap.set(doc.id, { id: doc.id, ...doc.data() }));
      const recordings = Array.from(uniqueMap.values()) as Post[];
      
      // 최신순 정렬
      recordings.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMyRecordings(recordings);
    } catch (error) {
      console.error('내 녹음 불러오기 오류:', error);
      setMyRecordings([]);
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
      
      // 합격곡에 저장된 postId/audioUrl 기준으로 오디오 연결
      const songsWithAudio = await Promise.all(songs.map(async (song) => {
        try {
          if (song.audioUrl) return song;
          if (!song.approvedPostId) return song;

          const postRef = doc(db, 'posts', song.approvedPostId);
          const postSnap = await getDoc(postRef);
          if (!postSnap.exists()) return song;

          const postData = postSnap.data();
          if (postData?.audioUrl) {
            return {
              ...song,
              audioUrl: postData.audioUrl,
              postId: postSnap.id,
              fileName: postData.fileName || ''
            };
          }

          return song;
        } catch (error) {
          console.error(`합격곡 ${song.title}의 오디오 파일 찾기 오류:`, error);
          return song;
        }
      }));
      
      // 최신순 정렬(합격일 createdAt 기준)
      songsWithAudio.sort((a, b) => ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setApprovedSongs(songsWithAudio);
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
    const idxs = (song.members || []).map((m: string) =>
      GRADE_ORDER.indexOf(getGradeEmoji(userMap[m]?.grade || GRADE_SYSTEM.CHERRY))
    );
    const minIdx = Math.min(...(idxs.length?idxs:[GRADE_ORDER.length-1]));
    return GRADE_ORDER[minIdx] || '🍒';
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        backgroundAttachment: 'fixed',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* 배경 패턴 */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `
            radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 40% 80%, rgba(120, 119, 198, 0.2) 0%, transparent 50%)
          `,
          pointerEvents: 'none'
        }} />
        
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(15px)',
          borderRadius: '24px',
          padding: '40px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          color: 'white',
          textAlign: 'center',
          fontSize: '20px',
          fontWeight: 600
        }}>
          🔄 마이페이지 로딩 중...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        backgroundAttachment: 'fixed',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* 배경 패턴 */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `
            radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 40% 80%, rgba(120, 119, 198, 0.2) 0%, transparent 50%)
          `,
          pointerEvents: 'none'
        }} />
        
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(15px)',
          borderRadius: '24px',
          padding: '40px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          color: 'white',
          textAlign: 'center'
        }}>
          <h2 style={{ color: 'white', marginBottom: '16px' }}>⚠️ 오류가 발생했습니다</h2>
          <p style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: '20px' }}>{error}</p>
          <button 
            onClick={() => setError(null)}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '12px',
              padding: '10px 20px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 16,
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            🔄 다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      backgroundAttachment: 'fixed',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 배경 패턴 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `
          radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 40% 80%, rgba(120, 119, 198, 0.2) 0%, transparent 50%)
        `,
        pointerEvents: 'none'
      }} />
      
      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: '20px',
        minHeight: '100vh'
      }}>
      {/* 헤더 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <button 
            onClick={() => navigate(-1)}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '12px',
              padding: '10px 16px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <ArrowLeft size={16} />
            뒤로가기
          </button>
          {isOwner && (
            <button 
              onClick={() => navigate('/settings')}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '12px',
                padding: '10px 16px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <Settings size={16} />
              설정
          </button>
          )}
        </div>

      {isOwner && (
        <div style={{ marginBottom: 16 }}>
          <div
            className={`mypage-notification-card ${notificationUpdating ? 'disabled' : ''}`}
            onClick={() => {
              if (!notificationUpdating) {
                void handleNotificationToggle();
              }
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              if (!notificationUpdating) {
                void handleNotificationToggle();
              }
            }}
          >
            <div className="mypage-notification-info">
              {notificationsEnabled ? <Bell size={18} color="white" /> : <BellOff size={18} color="white" />}
              <div className="mypage-notification-texts">
                <div className="mypage-notification-title">알림 받기</div>
                <div className="mypage-notification-desc">새 댓글/답글 알림을 휴대폰으로 받을 수 있어요.</div>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleNotificationToggle();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void handleNotificationToggle();
              }}
              disabled={notificationUpdating}
              className={`toggle-switch mypage-toggle ${notificationsEnabled ? 'active' : ''}`}
              aria-label="알림 받기 토글"
            >
              <div className="toggle-slider"></div>
            </button>
          </div>
          {notificationUpdating && <div className="mypage-notification-loading">알림 설정 적용 중...</div>}
        </div>
      )}

      {/* 프로필 히어로 섹션 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(15px)',
        borderRadius: '24px',
          padding: '40px 32px',
        marginBottom: '32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ 
            minWidth: 120, 
            minHeight: 120, 
            marginBottom: 16, 
            display: 'flex', 
            justifyContent: 'center' 
          }} onClick={isOwner ? handleProfileImageClick : undefined}>
            <div style={{ 
              width: 120, 
              height: 120, 
              border: '4px solid rgba(255, 255, 255, 0.3)', 
              borderRadius: '50%',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)', 
              cursor: isOwner ? 'pointer' : 'default', 
              position: 'relative',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
            {user?.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="프로필" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
                <User size={64} color="rgba(255, 255, 255, 0.8)" />
            )}
            {isOwner && (
              <>
                  <div style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    width: '100%', 
                    height: '100%', 
                    background: 'rgba(0,0,0,0.3)', 
                    color: '#fff', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    opacity: 0, 
                    transition: 'opacity 0.3s',
                    borderRadius: '50%'
                  }}>
                  <Camera size={28} />
                </div>
                <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleProfileImageUpload} />
              </>
            )}
          </div>
        </div>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
              <span style={{ 
                fontSize: 24, 
                fontWeight: 700, 
                color: 'white', 
                textAlign: 'center',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
              }}>{user?.nickname}</span>
            {user?.role && user.role !== '일반' && user.role !== '평가자' && (
                <span style={{
                fontSize: 16,
                color: '#fff',
                  background: 'rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: 12,
                  padding: '4px 16px',
                fontWeight: 700,
                marginLeft: 8,
                letterSpacing: '0.02em',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                display: 'inline-block',
                verticalAlign: 'middle'
              }}>{user.role}</span>
            )}
          </div>
          {isOwner && editingProfile ? (
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                value={editNickname}
                onChange={e => setEditNickname(e.target.value)}
                className="edit-input"
                placeholder="닉네임을 입력해주세요..."
                maxLength={20}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <textarea
                value={editIntro}
                onChange={e => setEditIntro(e.target.value)}
                className="edit-textarea"
                placeholder="자기소개를 입력해주세요..."
                rows={3}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <div className="edit-buttons">
                <button onClick={handleSaveProfile} className="save-btn"><Save size={16} />저장</button>
                <button onClick={() => { setEditingProfile(false); setEditNickname(user?.nickname || ''); setEditIntro(user?.intro || ''); }} className="cancel-btn"><X size={16} />취소</button>
              </div>
            </div>
          ) : (
            <div style={{ 
              marginTop: 8, 
              fontSize: 16, 
              color: 'rgba(255, 255, 255, 0.8)', 
              textAlign: 'center',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
            }}>{user?.intro || (isOwner ? '한 줄 소개를 입력해보세요!' : '등록된 소개가 없습니다.')}</div>
          )}
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <div style={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600, fontSize: 15 }}>
              등급: {getGradeEmoji(user?.grade || GRADE_SYSTEM.CHERRY)} {getGradeName(user?.grade || GRADE_SYSTEM.CHERRY)}
            </div>
            {isOwner && (
              <>
                {editingGrade ? (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <select
                      className="grade-select"
                      value={selectedGrade || GRADE_SYSTEM.CHERRY}
                      onChange={(e) => setSelectedGrade(e.target.value)}
                    >
                      {GRADE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.emoji} {getGradeName(option.value)} ({option.category})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        void handleGradeChange(selectedGrade || GRADE_SYSTEM.CHERRY);
                        setEditingGrade(false);
                      }}
                      className="save-btn"
                    >
                      <Save size={14} />
                      저장
                    </button>
                    <button
                      onClick={() => {
                        setEditingGrade(false);
                        setSelectedGrade(user?.grade || GRADE_SYSTEM.CHERRY);
                      }}
                      className="cancel-btn"
                    >
                      <X size={14} />
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedGrade(user?.grade || GRADE_SYSTEM.CHERRY);
                      setEditingGrade(true);
                    }}
                    style={{
                      marginTop: 8,
                      padding: '6px 14px',
                      borderRadius: 10,
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      background: 'rgba(255, 255, 255, 0.15)',
                      color: 'white',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    등급 변경
                  </button>
                )}
              </>
            )}
          </div>
          <div style={{ 
            marginTop: 8, 
            fontSize: 14, 
            color: 'rgba(255, 255, 255, 0.7)', 
            textAlign: 'center',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
          }}>
            가입일: {isOwner && editingJoinDate ? (
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
            <button 
              onClick={() => { setEditingProfile(true); setEditIntro(user?.intro || ''); }}
              style={{ 
                marginTop: 16, 
                padding: '10px 24px', 
                borderRadius: 12, 
                background: 'rgba(255, 255, 255, 0.2)', 
                backdropFilter: 'blur(10px)',
                color: 'white', 
                fontWeight: 600, 
                border: '1px solid rgba(255, 255, 255, 0.3)', 
                cursor: 'pointer', 
                fontSize: 16,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <Edit3 size={18} /> 프로필 수정
            </button>
          )}
        </div>
      </div>

      {/* 활동/통계 카드 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '24px',
          marginBottom: '24px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
          <h3 style={{ 
            color: 'white', 
            fontSize: '20px', 
            fontWeight: 700, 
            marginBottom: '20px', 
            textAlign: 'center',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
          }}>📊 활동 통계</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: '16px',
            marginBottom: '16px'
          }}>
            <div
              role="button"
              tabIndex={0}
              title="내가 쓴 글 목록 보기"
              onClick={() => setStatsModal('posts')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatsModal('posts');
                }
              }}
              style={{
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease'
            }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{ fontSize: '24px' }}>📝</span>
              <div>
                <div style={{ 
                  fontSize: '24px', 
                  fontWeight: 700, 
                  color: 'white',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                }}>{activityStats.postsCount}</div>
                <div style={{ 
                  fontSize: '14px', 
                  color: 'rgba(255, 255, 255, 0.8)',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                }}>내가 쓴 글</div>
            </div>
          </div>
            <div
              role="button"
              tabIndex={0}
              title="내가 쓴 댓글이 달린 글 목록 보기"
              onClick={() => setStatsModal('comments')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatsModal('comments');
                }
              }}
              style={{
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease'
            }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{ fontSize: '24px' }}>💬</span>
              <div>
                <div style={{ 
                  fontSize: '24px', 
                  fontWeight: 700, 
                  color: 'white',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                }}>{activityStats.commentsCount}</div>
                <div style={{ 
                  fontSize: '14px', 
                  color: 'rgba(255, 255, 255, 0.8)',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                }}>내가 쓴 댓글</div>
            </div>
          </div>
            <div
              role="button"
              tabIndex={0}
              title="받은 좋아요가 있는 글 목록 보기"
              onClick={() => setStatsModal('likes')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatsModal('likes');
                }
              }}
              style={{
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease'
            }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{ fontSize: '24px' }}>❤️</span>
              <div>
                <div style={{ 
                  fontSize: '24px', 
                  fontWeight: 700, 
                  color: 'white',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                }}>{activityStats.totalLikes}</div>
                <div style={{ 
                  fontSize: '14px', 
                  color: 'rgba(255, 255, 255, 0.8)',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                }}>받은 좋아요</div>
            </div>
          </div>
            <div style={{
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ fontSize: '24px' }}>⭐</span>
              <div>
                <div style={{ 
                  fontSize: '24px', 
                  fontWeight: 700, 
                  color: 'white',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                }}>{activityStats.averageScore || '-'}</div>
                <div style={{ 
                  fontSize: '14px', 
                  color: 'rgba(255, 255, 255, 0.8)',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                }}>평균 평가점수</div>
            </div>
          </div>
        </div>
      </div>

      {/* 최근 활동 섹션 */}
        <div style={{ 
          marginBottom: 32, 
          background: 'rgba(255, 255, 255, 0.1)', 
          backdropFilter: 'blur(15px)',
          borderRadius: 20, 
          padding: 24, 
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
          <h3 style={{ 
            fontSize: 20, 
            fontWeight: 700, 
            color: 'white', 
            marginBottom: 16,
            textAlign: 'center',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
          }}>📋 최근 활동</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {myPosts.slice(0, 5).map(post => (
              <div
                key={post.id}
                role="button"
                tabIndex={0}
                onClick={() => navigateToPost(post)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigateToPost(post);
                  }
                }}
                style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12, 
                padding: '12px 16px', 
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                marginBottom: '8px',
                cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                }}
              >
                <span style={{ 
                  color: 'rgba(255, 255, 255, 0.9)', 
                  fontWeight: 700,
                  background: 'rgba(255, 255, 255, 0.2)',
                  padding: '4px 8px',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}>[{postTypeLabel(post.type)}]</span>
                <span style={{ 
                  fontWeight: 600, 
                  color: 'white',
                  flex: 1,
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                }}>{post.title}</span>
                <span style={{ 
                  color: 'rgba(255, 255, 255, 0.6)', 
                  fontSize: 12,
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                }}>{formatDate(post.createdAt)}</span>
            </div>
          ))}
            {myPosts.length === 0 && (
              <span style={{ 
                color: 'rgba(255, 255, 255, 0.7)', 
                textAlign: 'center',
                fontStyle: 'italic',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
              }}>📝 최근 작성한 글이 없습니다.</span>
            )}
        </div>
      </div>

      {/* 합격곡 카드 */}
        <div style={{ 
          marginBottom: 32, 
          background: 'rgba(255, 255, 255, 0.1)', 
          backdropFilter: 'blur(15px)',
          borderRadius: 20, 
          padding: 24, 
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
          <h3 style={{ 
            fontSize: 20, 
            fontWeight: 700, 
            color: 'white', 
            marginBottom: 16,
            textAlign: 'center',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
          }}>🎵 합격곡</h3>
        {approvedSongs.length === 0 ? (
            <div style={{ 
              color: 'rgba(255, 255, 255, 0.7)', 
              textAlign: 'center', 
              fontWeight: 500,
              fontStyle: 'italic',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
            }}>🎼 아직 합격곡이 없습니다.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(showAllSongs ? approvedSongs : approvedSongs.slice(0,5)).map(song => (
                  <div key={song.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 12, 
                    padding: '12px 16px', 
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    marginBottom: '8px'
                  }}>
                  <span style={{ fontSize: 22 }}>{getSongGrade(song)}</span>
                    <span style={{ 
                      fontWeight: 700, 
                      color: 'white', 
                      flex: 1,
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                    }}>{song.title}</span>
                    {/* 👥 파트너 닉네임 표시 부분 제거 */}
                    {/* <span style={{ 
                      color: 'rgba(255, 255, 255, 0.8)', 
                      fontWeight: 500, 
                      fontSize: 14,
                      background: 'rgba(255, 255, 255, 0.1)',
                      padding: '4px 8px',
                      borderRadius: '8px'
                    }}>👥 {Array.isArray(song.members) ? song.members.join(', ') : ''}</span> */}
                    {song.audioUrl && (
                      <a
                        href={song.audioUrl}
                        download={song.fileName || `${song.title}.mp3`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '6px 10px',
                          background: 'rgba(138, 85, 204, 0.3)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          textDecoration: 'none',
                          color: 'white',
                          border: '1px solid rgba(138, 85, 204, 0.5)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(138, 85, 204, 0.5)';
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(138, 85, 204, 0.3)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title="녹음 파일 다운로드"
                      >
                        <Download size={16} />
                      </a>
                    )}
                    <span style={{ 
                      color: 'rgba(255, 255, 255, 0.6)', 
                      fontSize: 12,
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                      minWidth: '80px',
                      textAlign: 'right'
                    }}>{song.createdAt && song.createdAt.seconds ? (new Date(song.createdAt.seconds * 1000)).toLocaleDateString('ko-KR') : ''}</span>
                </div>
              ))}
            </div>
            {approvedSongs.length > 5 && (
                <button 
                  style={{ 
                    marginTop: 12, 
                    background: 'rgba(255, 255, 255, 0.2)', 
                    backdropFilter: 'blur(10px)',
                    color: 'white', 
                    border: '1px solid rgba(255, 255, 255, 0.3)', 
                    borderRadius: 12, 
                    padding: '8px 20px', 
                    fontWeight: 600, 
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    display: 'block',
                    margin: '16px auto 0'
                  }} 
                  onClick={() => setShowAllSongs(v => !v)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {showAllSongs ? '📁 접기' : `📂 더보기 (${approvedSongs.length - 5}곡)`}
              </button>
            )}
          </>
        )}
      </div>

      {/* 설정/계정 카드 */}
      {isOwner && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', gap: 16 }}>
            <button 
              style={{ 
                flex: 1, 
                background: 'rgba(255, 255, 255, 0.1)', 
                backdropFilter: 'blur(15px)',
                borderRadius: 16, 
                padding: 20, 
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)', 
                fontWeight: 600, 
                color: 'white', 
                fontSize: 16, 
                cursor: 'pointer',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                transition: 'all 0.3s ease'
              }} 
              onClick={() => navigate('/settings')}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >⚙️ 프로필/계정 설정</button>
            <button 
              style={{ 
                flex: 1, 
                background: 'rgba(255, 255, 255, 0.1)', 
                backdropFilter: 'blur(15px)',
                borderRadius: 16, 
                padding: 20, 
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)', 
                fontWeight: 600, 
                color: 'white', 
                fontSize: 16, 
                cursor: 'pointer',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                transition: 'all 0.3s ease'
              }} 
              onClick={() => auth.signOut()}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >🚪 로그아웃</button>
            </div>
        </div>
      )}

      {/* 탭 네비게이션 */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(15px)',
          borderRadius: '16px',
          padding: '8px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
        <button 
          onClick={() => setActiveTab('posts')}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '12px',
              border: 'none',
              background: activeTab === 'posts' 
                ? 'rgba(255, 255, 255, 0.3)' 
                : 'transparent',
              color: 'white',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.3s ease',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'posts') {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'posts') {
                e.currentTarget.style.background = 'transparent';
              }
            }}
        >
          <FileText size={16} />
          <span>내 글</span>
        </button>
        <button 
          onClick={() => setActiveTab('evaluations')}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '12px',
              border: 'none',
              background: activeTab === 'evaluations' 
                ? 'rgba(255, 255, 255, 0.3)' 
                : 'transparent',
              color: 'white',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.3s ease',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'evaluations') {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'evaluations') {
                e.currentTarget.style.background = 'transparent';
              }
            }}
        >
          <Star size={16} />
          <span>평가 이력</span>
        </button>
        <button 
          onClick={() => setActiveTab('recordings')}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '12px',
              border: 'none',
              background: activeTab === 'recordings' 
                ? 'rgba(255, 255, 255, 0.3)' 
                : 'transparent',
              color: 'white',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.3s ease',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'recordings') {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'recordings') {
                e.currentTarget.style.background = 'transparent';
              }
            }}
        >
          <Mic size={16} />
          <span>내 녹음</span>
        </button>
        <button 
          onClick={() => setActiveTab('guestbook')}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '12px',
              border: 'none',
              background: activeTab === 'guestbook' 
                ? 'rgba(255, 255, 255, 0.3)' 
                : 'transparent',
              color: 'white',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.3s ease',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'guestbook') {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'guestbook') {
                e.currentTarget.style.background = 'transparent';
              }
            }}
        >
          <Users size={16} />
          <span>방명록</span>
        </button>
      </div>

      {/* 탭 컨텐츠 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '24px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          marginBottom: '24px'
        }}>
        {activeTab === 'posts' && (
            <div>
            {myPosts.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: 'rgba(255, 255, 255, 0.7)'
                }}>
                  <FileText size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                  <h3 style={{ 
                    fontSize: '20px', 
                    fontWeight: 600, 
                    marginBottom: '8px',
                    color: 'white',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                  }}>📝 작성한 글이 없습니다</h3>
                  <p style={{ 
                    fontSize: '14px',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                  }}>첫 번째 글을 작성해보세요!</p>
              </div>
            ) : (
              myPosts.map((post) => (
                  <div key={post.id} style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '16px',
                    padding: '16px',
                    marginBottom: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  >
                    <h4 style={{ 
                      fontSize: '16px', 
                      fontWeight: 600, 
                      marginBottom: '8px',
                      color: 'white',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                    }}>{post.title}</h4>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px',
                      fontSize: '12px'
                    }}>
                      <span style={{ 
                        background: 'rgba(255, 255, 255, 0.2)',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        color: 'white',
                        fontWeight: 600
                      }}>{post.type}</span>
                      <span style={{ 
                        color: 'rgba(255, 255, 255, 0.7)',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                      }}>{formatDate(post.createdAt)}</span>
                      <div style={{ 
                        display: 'flex', 
                        gap: '8px',
                        marginLeft: 'auto'
                      }}>
                        <span style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '4px',
                          color: 'rgba(255, 255, 255, 0.8)'
                        }}>
                          <Heart size={12} /> {post.likesCount}
                        </span>
                        <span style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '4px',
                          color: 'rgba(255, 255, 255, 0.8)'
                        }}>
                          <MessageCircle size={12} /> {post.commentCount}
                        </span>
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

        {activeTab === 'recordings' && (
          <div className="recordings-list">
            {myRecordings.length === 0 ? (
              <div className="empty-state">
                <Mic size={48} />
                <h3>녹음이 없습니다</h3>
                <p>녹음게시판에 업로드하거나 평가게시판에 참여해보세요!</p>
              </div>
            ) : (
              myRecordings.map((post) => (
                <div 
                  key={post.id} 
                  className="recording-item"
                  style={{
                    border: '1px solid #E5DAF5',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '12px',
                    background: '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => {
                    if (post.type === 'recording') {
                      navigate(`/recording/${post.id}`);
                    } else if (post.type === 'evaluation') {
                      navigate(`/evaluation/${post.id}`);
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <Mic size={20} style={{ color: '#8A55CC' }} />
                    <h4 style={{ 
                      margin: 0, 
                      fontSize: '16px', 
                      fontWeight: '600', 
                      color: '#374151',
                      flex: 1
                    }}>
                      {post.title}
                    </h4>
                    <span style={{
                      background: post.type === 'recording' ? '#E5DAF5' : '#FEF3C7',
                      color: post.type === 'recording' ? '#8A55CC' : '#D97706',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {post.type === 'recording' ? '녹음게시판' : '평가게시판'}
                    </span>
                  </div>
                  
                  {post.fileName && (
                    <div style={{ 
                      fontSize: '14px', 
                      color: '#6B7280', 
                      marginBottom: '8px',
                      background: '#F9FAFB',
                      padding: '6px 12px',
                      borderRadius: '8px'
                    }}>
                      📁 {post.fileName}
                    </div>
                  )}
                  
                  {post.members && post.members.length > 0 && (
                    <div style={{ 
                      fontSize: '14px', 
                      color: '#8A55CC', 
                      marginBottom: '8px',
                      fontWeight: '500'
                    }}>
                      👥 함께한 멤버: {post.members.join(', ')}
                    </div>
                  )}
                  
                  {post.status && (
                    <div style={{ 
                      fontSize: '14px', 
                      marginBottom: '8px',
                      fontWeight: '600',
                      color: post.status === '합격' ? '#059669' : post.status === '불합격' ? '#DC2626' : '#6B7280'
                    }}>
                      📋 상태: {post.status}
                    </div>
                  )}
                  
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginTop: '12px',
                    paddingTop: '8px',
                    borderTop: '1px solid #F3F4F6'
                  }}>
                    <span style={{ fontSize: '14px', color: '#9CA3AF' }}>
                      {formatDate(post.createdAt)}
                    </span>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '14px', color: '#6B7280' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Heart size={14} /> {post.likesCount || 0}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MessageCircle size={14} /> {post.commentCount || 0}
                      </span>
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

      {statsModal && (
        <div
          className="mypage-stats-modal-overlay"
          role="presentation"
          onClick={() => setStatsModal(null)}
        >
          <div
            className="mypage-stats-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mypage-stats-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mypage-stats-modal-header">
              <h2 id="mypage-stats-modal-title" className="mypage-stats-modal-title">
                {statsModal === 'posts' && '내가 쓴 글'}
                {statsModal === 'comments' && '내가 쓴 댓글이 달린 글'}
                {statsModal === 'likes' && '받은 좋아요가 있는 글'}
              </h2>
              <button
                type="button"
                className="mypage-stats-modal-close"
                onClick={() => setStatsModal(null)}
                aria-label="닫기"
              >
                <X size={22} />
              </button>
            </div>
            <div className="mypage-stats-modal-body">
              {statsModal === 'posts' &&
                (myPosts.length === 0 ? (
                  <p className="mypage-stats-modal-empty">작성한 글이 없습니다.</p>
                ) : (
                  <ul className="mypage-stats-modal-list">
                    {myPosts.map((post) => (
                      <li key={post.id}>
                        <button
                          type="button"
                          className="mypage-stats-modal-row"
                          onClick={() => {
                            navigateToPost(post);
                            setStatsModal(null);
                          }}
                        >
                          <span className="mypage-stats-modal-badge">{postTypeLabel(post.type)}</span>
                          <span className="mypage-stats-modal-row-title">{post.title || '제목 없음'}</span>
                          <span className="mypage-stats-modal-meta">{formatDate(post.createdAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}

              {statsModal === 'comments' &&
                (profileCommentsWithPosts.length === 0 ? (
                  <p className="mypage-stats-modal-empty">표시할 댓글이 없습니다.</p>
                ) : (
                  <ul className="mypage-stats-modal-list">
                    {profileCommentsWithPosts.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className="mypage-stats-modal-row mypage-stats-modal-row-multiline"
                          onClick={() => {
                            navigate(NotificationService.getRouteByPostType(row.postType, row.postId));
                            setStatsModal(null);
                          }}
                        >
                          <div className="mypage-stats-modal-row-top">
                            <span className="mypage-stats-modal-badge">{postTypeLabel(row.postType)}</span>
                            <span className="mypage-stats-modal-row-title">{row.postTitle}</span>
                            <span className="mypage-stats-modal-meta">{formatDate(row.createdAt)}</span>
                          </div>
                          <p className="mypage-stats-modal-preview">{row.contentPreview}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}

              {statsModal === 'likes' &&
                (postsWithLikesList.length === 0 ? (
                  <p className="mypage-stats-modal-empty">좋아요를 받은 게시글이 아직 없습니다.</p>
                ) : (
                  <ul className="mypage-stats-modal-list">
                    {postsWithLikesList.map((post) => (
                      <li key={post.id}>
                        <button
                          type="button"
                          className="mypage-stats-modal-row"
                          onClick={() => {
                            navigateToPost(post);
                            setStatsModal(null);
                          }}
                        >
                          <span className="mypage-stats-modal-badge">{postTypeLabel(post.type)}</span>
                          <span className="mypage-stats-modal-row-title">{post.title || '제목 없음'}</span>
                          <span className="mypage-stats-modal-meta">❤️ {post.likesCount || 0}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyPage; 