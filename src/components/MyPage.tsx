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
  Heart, 
  MessageCircle,
  User,
  FileText,
  Star,
  Users,
  Trash2,
  Send,
  Reply,
  Mic,
  Settings,
  Download,
  Bell,
  BellOff,
  Music,
  BarChart3
} from 'lucide-react';
import './MyPage.css';
import { auth } from '../firebase';
import { NotificationService } from '../utils/notificationService';
import { enablePushNotifications, removeAllPushTokens } from '../utils/pushNotificationService';
import { GRADE_NAMES, GRADE_SYSTEM } from './AdminTypes';
import { getGradeEmoji, getGradeName } from '../utils/gradeDisplay';
import { approvedSongCountsByNicknameFromDocs } from '../utils/approvedSongMilestone';

interface User {
  uid: string;
  email: string;
  nickname: string;
  role: string;
  grade: string;
  pendingGrade?: string;
  pendingGradeRequestedAt?: unknown;
  pendingCreatedAt?: any;
  pendingCreatedAtRequestedAt?: unknown;
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
}

interface ApprovedSongRankRow {
  rank: number;
  nickname: string;
  count: number;
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
  parentMessageId?: string;
}

interface GuestbookTreeProps {
  message: GuestbookMessage;
  depth: number;
  childrenMap: Map<string, GuestbookMessage[]>;
  formatDate: (timestamp: any) => string;
  currentUser: User | null;
  isOwner: boolean;
  onDelete: (messageId: string, fromNickname: string) => void;
  onReply: (messageId: string, fromNickname: string) => void;
  gradeLabel: (nickname: string) => string;
  gradeTitle: (nickname: string) => string;
}

const GuestbookTree: React.FC<GuestbookTreeProps> = ({
  message,
  depth,
  childrenMap,
  formatDate,
  currentUser,
  isOwner,
  onDelete,
  onReply,
  gradeLabel,
  gradeTitle
}) => {
  const children = childrenMap.get(message.id) ?? [];
  const canDelete =
    Boolean(currentUser) && (message.fromNickname === currentUser!.nickname || isOwner);
  const indent = depth > 0 ? Math.min(depth * 14, 70) : 0;

  return (
    <>
      <div
        className="guestbook-item"
        style={
          depth > 0
            ? {
                marginLeft: indent,
                borderLeft: '2px solid rgba(255, 255, 255, 0.28)',
                paddingLeft: 12
              }
            : undefined
        }
      >
        <div className="message-header">
          <div className="message-header-main">
            <span className="message-author">{message.fromNickname}</span>
            <span className="message-author-grade" title={gradeTitle(message.fromNickname)}>
              {gradeLabel(message.fromNickname)}
            </span>
          </div>
          <div className="message-header-aside">
            <span className="message-date">{formatDate(message.createdAt)}</span>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(message.id, message.fromNickname)}
                className="delete-btn"
                aria-label="방명록 삭제"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
        <p className="message-content">{message.message}</p>
        {currentUser && (
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => onReply(message.id, message.fromNickname)}
              className="guestbook-reply-btn"
            >
              <Reply size={14} aria-hidden />
              답장
            </button>
          </div>
        )}
      </div>
      {children.map((c) => (
        <GuestbookTree
          key={c.id}
          message={c}
          depth={depth + 1}
          childrenMap={childrenMap}
          formatDate={formatDate}
          currentUser={currentUser}
          isOwner={isOwner}
          onDelete={onDelete}
          onReply={onReply}
          gradeLabel={gradeLabel}
          gradeTitle={gradeTitle}
        />
      ))}
    </>
  );
};

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

const GRADE_ORDER = GRADE_OPTIONS.map((option) => option.emoji);

const MyPage: React.FC = () => {
  const navigate = useNavigate();
  const { uid } = useParams();
  const [user, setUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'stats' | 'posts' | 'evaluations' | 'recordings' | 'approved' | 'guestbook'
  >('guestbook');
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingIntro, setEditingIntro] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  
  // 편집 상태
  const [editNickname, setEditNickname] = useState('');
  const [editIntro, setEditIntro] = useState('');
  const [newGuestMessage, setNewGuestMessage] = useState('');
  const [guestReplyTarget, setGuestReplyTarget] = useState<{ id: string; fromNickname: string } | null>(
    null
  );
  
  // 파일 입력 참조
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 데이터 상태
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [activityStats, setActivityStats] = useState<ActivityStats>({
    postsCount: 0,
    commentsCount: 0,
    totalLikes: 0
  });
  const [approvedSongLeaderboard, setApprovedSongLeaderboard] = useState<ApprovedSongRankRow[]>([]);
  const [approvedSongLeaderboardLoading, setApprovedSongLeaderboardLoading] = useState(true);
  const [hasLoadedApprovedSongLeaderboard, setHasLoadedApprovedSongLeaderboard] = useState(false);
  const [guestMessages, setGuestMessages] = useState<GuestbookMessage[]>([]);
  const [myEvaluationPosts, setMyEvaluationPosts] = useState<Post[]>([]);
  const [myRecordings, setMyRecordings] = useState<Post[]>([]);
  const [approvedSongs, setApprovedSongs] = useState<ApprovedSong[]>([]);
  const [hasLoadedEvaluationPosts, setHasLoadedEvaluationPosts] = useState(false);
  const [hasLoadedRecordings, setHasLoadedRecordings] = useState(false);
  const [hasLoadedApprovedSongs, setHasLoadedApprovedSongs] = useState(false);

  // Cleanup subscriptions
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // 가입일 관련 상태
  const [editingJoinDate, setEditingJoinDate] = useState(false);
  const [editJoinDate, setEditJoinDate] = useState('');

  // 유저 등급 정보 fetch
  const [userMap, setUserMap] = useState<Record<string, {grade?: string}>>({});
  const [hasLoadedUserMap, setHasLoadedUserMap] = useState(false);
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
          setNotificationsEnabled(userData.notificationsEnabled ?? true);
          // 본인 여부 판별
          let isMe = loginUser.uid === targetUid;
          setIsOwner(isMe);
          // load data for this user
          loadUserData(targetUid, isMe);
          loadMyPosts(userData.nickname);
          loadActivityStats(userData.nickname);
          setupGuestMessagesListener(userData.nickname);
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

  useEffect(() => {
    setActiveTab('guestbook');
    setHasLoadedEvaluationPosts(false);
    setHasLoadedRecordings(false);
    setHasLoadedApprovedSongs(false);
  }, [uid]);

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
        totalLikes
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
        setHasLoadedEvaluationPosts(false);
        setHasLoadedRecordings(false);
        setHasLoadedApprovedSongs(false);
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

  const findUserUidByNickname = useCallback(async (nickname: string): Promise<string | null> => {
    const n = nickname.trim();
    if (!n) return null;
    try {
      const q = query(collection(db, 'users'), where('nickname', '==', n), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return snap.docs[0].id;
    } catch (e) {
      console.error('닉네임으로 uid 조회 실패:', e);
      return null;
    }
  }, []);

  const handleSendGuestMessage = useCallback(async () => {
    if (!newGuestMessage.trim() || !user || !currentUser) return;
    const text = newGuestMessage.trim();
    const wallOwnerUid = user.uid;
    try {
      const payload: Record<string, unknown> = {
        toNickname: user.nickname,
        fromNickname: currentUser.nickname,
        message: text,
        createdAt: serverTimestamp()
      };
      if (guestReplyTarget?.id) {
        payload.parentMessageId = guestReplyTarget.id;
      }
      await addDoc(collection(db, 'guestbook'), payload);

      if (guestReplyTarget?.id) {
        const parentAuthorUid = await findUserUidByNickname(guestReplyTarget.fromNickname);
        if (
          parentAuthorUid &&
          parentAuthorUid !== currentUser.uid &&
          wallOwnerUid
        ) {
          try {
            await NotificationService.createGuestbookReplyNotification(
              parentAuthorUid,
              currentUser.uid,
              currentUser.nickname,
              text,
              wallOwnerUid
            );
          } catch (err) {
            console.error('방명록 답글 알림 생성 실패:', err);
          }
        }
      } else if (wallOwnerUid && currentUser.uid !== wallOwnerUid) {
        try {
          await NotificationService.createGuestbookNotification(
            wallOwnerUid,
            currentUser.uid,
            currentUser.nickname,
            text,
            wallOwnerUid
          );
        } catch (err) {
          console.error('방명록 알림 생성 실패:', err);
        }
      }

      setNewGuestMessage('');
      setGuestReplyTarget(null);
    } catch (error) {
      console.error('Error sending guest message:', error);
      setError('방명록 작성 중 오류가 발생했습니다.');
    }
  }, [newGuestMessage, user, currentUser, guestReplyTarget, findUserUidByNickname]);

  const handleDeleteGuestMessage = useCallback(
    async (messageId: string, fromNickname: string) => {
      if (!user || !currentUser) return;
      const isMessageAuthor = fromNickname === currentUser.nickname;
      if (!isMessageAuthor && !isOwner) {
        setError('삭제 권한이 없습니다.');
        return;
      }
      if (
        !window.confirm(
          '정말로 이 방명록 메시지를 삭제하시겠습니까? 이 글에 달린 답글도 함께 삭제됩니다.'
        )
      ) {
        return;
      }

      const collectIds = (id: string): string[] => {
        const children = guestMessages.filter((m) => m.parentMessageId === id);
        return [id, ...children.flatMap((c) => collectIds(c.id))];
      };

      try {
        const ids = [...new Set(collectIds(messageId))];
        const batch = writeBatch(db);
        ids.forEach((id) => batch.delete(doc(db, 'guestbook', id)));
        await batch.commit();
        setGuestReplyTarget((prev) =>
          prev && ids.includes(prev.id) ? null : prev
        );
      } catch (error) {
        console.error('Error deleting guest message:', error);
        setError('메시지 삭제 중 오류가 발생했습니다.');
      }
    },
    [user, currentUser, isOwner, guestMessages]
  );

  const notificationToggleBusyRef = useRef(false);
  const handleNotificationToggle = useCallback(async () => {
    if (!user || !isOwner || notificationUpdating) return;
    if (notificationToggleBusyRef.current) return;
    notificationToggleBusyRef.current = true;

    const nextEnabled = !notificationsEnabled;
    setNotificationUpdating(true);
    setNotificationsEnabled(nextEnabled);

    const updateLocalStorage = (value: boolean) => {
      try {
        const localUser = localStorage.getItem('veryus_user');
        if (localUser) {
          const parsed = JSON.parse(localUser);
          localStorage.setItem('veryus_user', JSON.stringify({ ...parsed, notificationsEnabled: value }));
        }
      } catch { /* ignore */ }
    };

    try {
      if (nextEnabled) {
        const granted = await enablePushNotifications(user.uid);
        if (!granted) {
          setNotificationsEnabled(false);
          updateLocalStorage(false);
          const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
          const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || (navigator as any).standalone === true;
          if (isIOS && !isStandalone) {
            alert('아이폰에서 푸시 알림을 받으려면 Safari에서 "홈 화면에 추가"로 앱을 설치한 뒤 다시 시도해주세요.');
          } else if (isIOS) {
            alert('설정 > Safari > 알림에서 VERYUS 알림을 허용해주세요.\n\n이미 허용했는데 안 되면:\n설정 > 알림 > VERYUS에서 알림을 허용해주세요.');
          } else {
            alert('브라우저에서 알림 권한을 허용해주세요.\n\n이미 차단한 경우:\n브라우저 주소창 왼쪽 자물쇠 아이콘 > 알림 > 허용으로 변경');
          }
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
      updateLocalStorage(nextEnabled);
    } catch (error) {
      console.error('마이페이지 알림 설정 변경 실패:', error);
      setNotificationsEnabled(!nextEnabled);
      updateLocalStorage(!nextEnabled);
      alert('알림 설정 변경 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setNotificationUpdating(false);
      notificationToggleBusyRef.current = false;
    }
  }, [user, isOwner, notificationUpdating, notificationsEnabled]);

  const postsWithLikesList = useMemo(
    () =>
      [...myPosts]
        .filter((p) => (p.likesCount || 0) > 0)
        .sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0)),
    [myPosts]
  );

  /** 현재 보고 있는 프로필 닉네임의 합격곡 순위(듀엣·합창은 members 전원에게 각 1곡씩 반영) */
  const viewedProfileApprovedRank = useMemo(() => {
    const nick = user?.nickname?.trim();
    if (!nick || approvedSongLeaderboard.length === 0) return null;
    return approvedSongLeaderboard.find((r) => r.nickname.trim() === nick) ?? null;
  }, [user?.nickname, approvedSongLeaderboard]);

  const guestbookThreadModel = useMemo(() => {
    const byId = new Map(guestMessages.map((m) => [m.id, m]));
    const roots: GuestbookMessage[] = [];
    const childrenMap = new Map<string, GuestbookMessage[]>();
    for (const m of guestMessages) {
      const p = m.parentMessageId?.trim();
      if (p && byId.has(p)) {
        if (!childrenMap.has(p)) childrenMap.set(p, []);
        childrenMap.get(p)!.push(m);
      } else {
        roots.push(m);
      }
    }
    roots.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    childrenMap.forEach((arr) =>
      arr.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
    );
    return { roots, childrenMap };
  }, [guestMessages]);

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

  const getCreatedDate = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (timestamp?.seconds) return new Date(timestamp.seconds * 1000);
    const d = new Date(timestamp);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  type MypageTabId = 'stats' | 'posts' | 'evaluations' | 'recordings' | 'approved' | 'guestbook';

  const mypageTabBaseStyle = (tab: MypageTabId): React.CSSProperties => ({
    flex: '1 1 28%',
    minWidth: '76px',
    padding: '12px 6px',
    borderRadius: '12px',
    border: 'none',
    background: activeTab === tab ? 'rgba(255, 255, 255, 0.3)' : 'transparent',
    color: 'white',
    fontWeight: 600,
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    transition: 'all 0.3s ease',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
  });

  const onMypageTabEnter = (tab: MypageTabId) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (activeTab !== tab) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
  };
  const onMypageTabLeave = (tab: MypageTabId) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (activeTab !== tab) e.currentTarget.style.background = 'transparent';
  };

  const handleProfileImageClick = () => {
    fileInputRef.current?.click();
  };

  const getGuestbookGradeLabel = useCallback(
    (nickname: string) => {
      const grade = userMap[nickname.trim()]?.grade;
      const g = grade || GRADE_SYSTEM.CHERRY;
      return getGradeEmoji(g);
    },
    [userMap]
  );

  const getGuestbookGradeTitle = useCallback(
    (nickname: string) => {
      const grade = userMap[nickname.trim()]?.grade;
      const g = grade || GRADE_SYSTEM.CHERRY;
      return `등급: ${getGradeName(g)}`;
    },
    [userMap]
  );

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

  const loadApprovedSongLeaderboard = useCallback(async () => {
    setApprovedSongLeaderboardLoading(true);
    try {
      const snap = await getDocs(collection(db, 'approvedSongs'));
      const counts = approvedSongCountsByNicknameFromDocs(snap.docs);
      const sorted = [...counts.entries()]
        .map(([nickname, count]) => ({ nickname, count }))
        .sort((a, b) => b.count - a.count || a.nickname.localeCompare(b.nickname, 'ko'));
      const ranked: ApprovedSongRankRow[] = [];
      let lastCount: number | null = null;
      let rank = 0;
      for (let i = 0; i < sorted.length; i++) {
        const { nickname, count } = sorted[i];
        if (lastCount !== count) {
          rank = i + 1;
          lastCount = count;
        }
        ranked.push({ rank, nickname, count });
      }
      setApprovedSongLeaderboard(ranked);
    } catch (e) {
      console.error('합격곡 순위 집계 오류:', e);
      setApprovedSongLeaderboard([]);
    } finally {
      setApprovedSongLeaderboardLoading(false);
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

  useEffect(() => {
    const nickname = user?.nickname?.trim();
    if (!nickname) return;

    if (activeTab === 'evaluations' && !hasLoadedEvaluationPosts) {
      void loadMyEvaluationPosts(nickname).then(() => {
        setHasLoadedEvaluationPosts(true);
      });
    }

    if (activeTab === 'recordings' && !hasLoadedRecordings) {
      void loadMyRecordings(nickname).then(() => {
        setHasLoadedRecordings(true);
      });
    }

    if (activeTab === 'approved' && !hasLoadedApprovedSongs) {
      void loadApprovedSongs(nickname).then(() => {
        setHasLoadedApprovedSongs(true);
      });
    }
  }, [
    activeTab,
    hasLoadedApprovedSongs,
    hasLoadedEvaluationPosts,
    hasLoadedRecordings,
    loadApprovedSongs,
    loadMyEvaluationPosts,
    loadMyRecordings,
    user?.nickname
  ]);

  useEffect(() => {
    if (hasLoadedApprovedSongLeaderboard) return;
    if (activeTab !== 'stats' && activeTab !== 'approved' && activeTab !== 'guestbook') return;
    void loadApprovedSongLeaderboard().then(() => {
      setHasLoadedApprovedSongLeaderboard(true);
    });
  }, [activeTab, hasLoadedApprovedSongLeaderboard, loadApprovedSongLeaderboard]);

  // 유저 등급 정보 fetch
  useEffect(() => {
    if (hasLoadedUserMap) return;
    if (activeTab !== 'guestbook' && activeTab !== 'approved') return;

    let cancelled = false;
    const loadUserMap = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        if (cancelled) return;
        const map: Record<string, {grade?: string}> = {};
        snap.docs.forEach(doc => {
          const d = doc.data();
          if (d.nickname) map[d.nickname] = { grade: d.grade };
        });
        setUserMap(map);
        setHasLoadedUserMap(true);
      } catch (error) {
        console.error('유저 등급 정보 로딩 실패:', error);
      }
    };

    void loadUserMap();
    return () => {
      cancelled = true;
    };
  }, [activeTab, hasLoadedUserMap]);

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
        background: 'var(--app-page-gradient)',
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
        background: 'var(--app-page-gradient)',
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
      background: 'var(--app-page-gradient)',
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
          }}>
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
          <div style={{ 
            marginTop: 8, 
            fontSize: 16, 
            color: 'rgba(255, 255, 255, 0.8)', 
            textAlign: 'center',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
          }}>{user?.intro || '등록된 소개가 없습니다.'}</div>
          <div style={{ marginTop: 12, color: 'rgba(255, 255, 255, 0.9)', fontWeight: 600, fontSize: 15 }}>
            등급: {getGradeEmoji(user?.grade || GRADE_SYSTEM.CHERRY)} {getGradeName(user?.grade || GRADE_SYSTEM.CHERRY)}
          </div>
          {user?.pendingGrade && user.pendingGrade !== user.grade && (
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.95)',
                background: 'rgba(127, 95, 255, 0.25)',
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: 10,
                padding: '8px 12px',
                maxWidth: 360,
                textAlign: 'center'
              }}
            >
              승인 대기: {getGradeEmoji(user.pendingGrade)} {getGradeName(user.pendingGrade)} — 설정에서 요청한 등급입니다.
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 14, color: 'rgba(255, 255, 255, 0.75)' }}>
            가입일: {getCreatedDate(user?.createdAt)?.toLocaleDateString('ko-KR') || '-'}
          </div>
          <div style={{ marginTop: 4, fontSize: 14, color: 'rgba(255, 255, 255, 0.75)' }}>
            활동기간: {Math.max(0, Math.floor(((Date.now()) - (getCreatedDate(user?.createdAt)?.getTime() || Date.now())) / (1000 * 60 * 60 * 24)))}일
          </div>
          {isOwner && user?.pendingCreatedAt && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
              가입일 변경 승인 대기: {getCreatedDate(user.pendingCreatedAt)?.toLocaleDateString('ko-KR')}
            </div>
          )}
          {isOwner && (
            <button
              onClick={() => navigate('/settings')}
              style={{
                marginTop: 14,
                padding: '9px 18px',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.3)',
                background: 'rgba(255, 255, 255, 0.15)',
                color: 'white',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              설정에서 프로필 수정
            </button>
          )}
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div
        className="mypage-tabs-bar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '24px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(15px)',
          borderRadius: '16px',
          padding: '8px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('stats')}
          style={mypageTabBaseStyle('stats')}
          onMouseEnter={onMypageTabEnter('stats')}
          onMouseLeave={onMypageTabLeave('stats')}
        >
          <BarChart3 size={15} />
          <span>활동통계</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          style={mypageTabBaseStyle('posts')}
          onMouseEnter={onMypageTabEnter('posts')}
          onMouseLeave={onMypageTabLeave('posts')}
        >
          <FileText size={15} />
          <span>내 글</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('evaluations')}
          style={mypageTabBaseStyle('evaluations')}
          onMouseEnter={onMypageTabEnter('evaluations')}
          onMouseLeave={onMypageTabLeave('evaluations')}
        >
          <Star size={15} />
          <span>평가</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('recordings')}
          style={mypageTabBaseStyle('recordings')}
          onMouseEnter={onMypageTabEnter('recordings')}
          onMouseLeave={onMypageTabLeave('recordings')}
        >
          <Mic size={15} />
          <span>녹음</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('approved')}
          style={mypageTabBaseStyle('approved')}
          onMouseEnter={onMypageTabEnter('approved')}
          onMouseLeave={onMypageTabLeave('approved')}
        >
          <Music size={15} />
          <span>합격곡</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('guestbook')}
          style={mypageTabBaseStyle('guestbook')}
          onMouseEnter={onMypageTabEnter('guestbook')}
          onMouseLeave={onMypageTabLeave('guestbook')}
        >
          <Users size={15} />
          <span>방명록</span>
        </button>
      </div>

      {/* 탭 컨텐츠 */}
      {activeTab && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '24px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          marginBottom: '24px'
        }}>
        {activeTab === 'stats' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '8px' }}>
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
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'white', textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}>
                    {activityStats.postsCount}
                  </div>
                  <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)', textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}>
                    내가 쓴 글
                  </div>
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
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'white', textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}>
                    {activityStats.commentsCount}
                  </div>
                  <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)', textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}>
                    내가 쓴 댓글
                  </div>
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
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'white', textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}>
                    {activityStats.totalLikes}
                  </div>
                  <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)', textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}>
                    받은 좋아요
                  </div>
                </div>
              </div>
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: '16px',
                  padding: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  minHeight: '88px'
                }}
              >
                <span style={{ fontSize: '24px', lineHeight: 1 }} aria-hidden>🏆</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'rgba(255, 255, 255, 0.95)',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                      marginBottom: '8px'
                    }}
                  >
                    합격곡 순위
                  </div>
                  {approvedSongLeaderboardLoading ? (
                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.75)' }}>불러오는 중…</div>
                  ) : approvedSongLeaderboard.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.75)' }}>
                      집계할 합격곡이 없습니다
                    </div>
                  ) : (approvedSongs.length === 0 && !viewedProfileApprovedRank) ? (
                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.75)' }}>
                      합격곡 0곡 · 순위 없음
                    </div>
                  ) : viewedProfileApprovedRank ? (
                    <div
                      style={{
                        fontSize: '16px',
                        fontWeight: 800,
                        color: 'white',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                      }}
                    >
                      {viewedProfileApprovedRank.rank}위 · 합격곡 {viewedProfileApprovedRank.count}곡
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.75)' }}>
                      합격곡 {approvedSongs.length}곡 · 순위 정보를 불러오지 못했습니다
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
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
                    transition: 'all 0.3s ease',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    const typeRouteMap: Record<string, string> = {
                      '자유': '/free',
                      '녹음': '/recording',
                      '평가': '/evaluation',
                      '파트너': '/boards/partner',
                    };
                    const base = typeRouteMap[post.type] || '/free';
                    navigate(`${base}/${post.id}`);
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
          <div>
            {myEvaluationPosts.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: 'rgba(255, 255, 255, 0.7)'
                }}
              >
                <Star size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <h3
                  style={{
                    fontSize: '20px',
                    fontWeight: 600,
                    marginBottom: '8px',
                    color: 'white',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  평가 이력이 없습니다
                </h3>
                <p style={{ fontSize: '14px', textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}>
                  평가 게시글이 여기에 표시됩니다.
                </p>
              </div>
            ) : (
              myEvaluationPosts.map((post) => (
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
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '16px',
                    padding: '16px',
                    marginBottom: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer'
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
                  <h4
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      marginBottom: '8px',
                      color: 'white',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                    }}
                  >
                    {post.title}
                  </h4>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontSize: '12px'
                    }}
                  >
                    <span
                      style={{
                        background: 'rgba(255, 255, 255, 0.2)',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        color: 'white',
                        fontWeight: 600
                      }}
                    >
                      {postTypeLabel(post.type)}
                    </span>
                    <span
                      style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                      }}
                    >
                      {formatDate(post.createdAt)}
                    </span>
                    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: 'rgba(255, 255, 255, 0.8)'
                        }}
                      >
                        <Heart size={12} /> {post.likesCount}
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: 'rgba(255, 255, 255, 0.8)'
                        }}
                      >
                        <MessageCircle size={12} /> {post.commentCount}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'recordings' && (
          <div>
            {myRecordings.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: 'rgba(255, 255, 255, 0.7)'
                }}
              >
                <Mic size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <h3
                  style={{
                    fontSize: '20px',
                    fontWeight: 600,
                    marginBottom: '8px',
                    color: 'white',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  녹음이 없습니다
                </h3>
                <p style={{ fontSize: '14px', textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}>
                  녹음 게시판에 업로드하거나 평가 게시판에 참여해 보세요.
                </p>
              </div>
            ) : (
              myRecordings.map((post) => (
                <div
                  key={post.id}
                  role="button"
                  tabIndex={0}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '16px',
                    padding: '16px',
                    marginBottom: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (post.type === 'recording') {
                        navigate(`/recording/${post.id}`);
                      } else if (post.type === 'evaluation') {
                        navigate(`/evaluation/${post.id}`);
                      }
                    }
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <Mic size={20} color="rgba(255,255,255,0.95)" />
                    <h4
                      style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: 600,
                        color: 'white',
                        flex: 1,
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                      }}
                    >
                      {post.title}
                    </h4>
                    <span
                      style={{
                        background: 'rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600
                      }}
                    >
                      {post.type === 'recording' ? '녹음게시판' : '평가게시판'}
                    </span>
                  </div>

                  {post.fileName && (
                    <div
                      style={{
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '8px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        padding: '6px 12px',
                        borderRadius: '8px'
                      }}
                    >
                      {post.fileName}
                    </div>
                  )}

                  {post.members && post.members.length > 0 && (
                    <div
                      style={{
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.9)',
                        marginBottom: '8px',
                        fontWeight: 500
                      }}
                    >
                      함께한 멤버: {post.members.join(', ')}
                    </div>
                  )}

                  {post.status && (
                    <div
                      style={{
                        fontSize: '14px',
                        marginBottom: '8px',
                        fontWeight: 600,
                        color:
                          post.status === '합격'
                            ? '#86EFAC'
                            : post.status === '불합격'
                              ? '#FCA5A5'
                              : 'rgba(255, 255, 255, 0.8)'
                      }}
                    >
                      상태: {post.status}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '12px',
                      paddingTop: '8px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.15)'
                    }}
                  >
                    <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.65)' }}>
                      {formatDate(post.createdAt)}
                    </span>
                    <div
                      style={{
                        display: 'flex',
                        gap: '12px',
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.85)'
                      }}
                    >
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

        {activeTab === 'approved' && (
          <div>
            {approvedSongs.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: 'rgba(255, 255, 255, 0.7)'
                }}
              >
                <Music size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <h3
                  style={{
                    fontSize: '20px',
                    fontWeight: 600,
                    marginBottom: '8px',
                    color: 'white',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  합격곡이 없습니다
                </h3>
                <p style={{ fontSize: '14px', textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}>
                  합격 처리된 곡이 여기에 모입니다.
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(showAllSongs ? approvedSongs : approvedSongs.slice(0, 5)).map((song) => (
                    <div
                      key={song.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                        marginBottom: '4px',
                        border: '1px solid rgba(255, 255, 255, 0.15)'
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{getSongGrade(song)}</span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: 'white',
                          flex: 1,
                          textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                        }}
                      >
                        {song.title}
                      </span>
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
                            background: 'rgba(138, 85, 204, 0.35)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            textDecoration: 'none',
                            color: 'white',
                            border: '1px solid rgba(138, 85, 204, 0.55)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(138, 85, 204, 0.55)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(138, 85, 204, 0.35)';
                          }}
                          title="녹음 파일 다운로드"
                        >
                          <Download size={16} />
                        </a>
                      )}
                      <span
                        style={{
                          color: 'rgba(255, 255, 255, 0.6)',
                          fontSize: 12,
                          textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                          minWidth: '72px',
                          textAlign: 'right'
                        }}
                      >
                        {song.createdAt && song.createdAt.seconds
                          ? new Date(song.createdAt.seconds * 1000).toLocaleDateString('ko-KR')
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
                {approvedSongs.length > 5 && (
                  <button
                    type="button"
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
                    onClick={() => setShowAllSongs((v) => !v)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {showAllSongs ? '접기' : `더보기 (${approvedSongs.length - 5}곡)`}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'guestbook' && (
          <div className="guestbook-section mypage-guestbook-glass">
            <div className="guestbook-list">
              {guestMessages.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: 'rgba(255, 255, 255, 0.7)'
                  }}
                >
                  <Users size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                  <h3
                    style={{
                      fontSize: '20px',
                      fontWeight: 600,
                      marginBottom: '8px',
                      color: 'white',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                    }}
                  >
                    방명록이 비어 있습니다
                  </h3>
                  <p style={{ fontSize: '14px', textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}>
                    첫 메시지를 남겨 보세요.
                  </p>
                </div>
              ) : (
                guestbookThreadModel.roots.map((message) => (
                  <GuestbookTree
                    key={message.id}
                    message={message}
                    depth={0}
                    childrenMap={guestbookThreadModel.childrenMap}
                    formatDate={formatDate}
                    currentUser={currentUser}
                    isOwner={isOwner}
                    onDelete={handleDeleteGuestMessage}
                    onReply={(id, fromNickname) => setGuestReplyTarget({ id, fromNickname })}
                    gradeLabel={getGuestbookGradeLabel}
                    gradeTitle={getGuestbookGradeTitle}
                  />
                ))
              )}
            </div>
            {guestReplyTarget && (
              <div className="guestbook-reply-banner">
                <span className="guestbook-reply-banner-text">
                  <Reply size={14} aria-hidden />
                  {guestReplyTarget.fromNickname}님에게 답장
                </span>
                <button
                  type="button"
                  className="guestbook-reply-cancel"
                  onClick={() => setGuestReplyTarget(null)}
                >
                  취소
                </button>
              </div>
            )}
            <div className="guestbook-write">
              <textarea
                value={newGuestMessage}
                onChange={(e) => setNewGuestMessage(e.target.value)}
                placeholder={
                  guestReplyTarget
                    ? `${guestReplyTarget.fromNickname}님에게 답장을 입력하세요...`
                    : '방명록에 메시지를 남겨보세요...'
                }
                className="guestbook-textarea"
              />
              <button type="button" onClick={() => void handleSendGuestMessage()} className="send-btn">
                <Send size={16} />
                {guestReplyTarget ? '답장 보내기' : '보내기'}
              </button>
            </div>
          </div>
        )}
        </div>
      )}

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
    </div>
  );
};

export default MyPage; 