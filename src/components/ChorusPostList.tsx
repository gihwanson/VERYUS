import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { scheduleScrollRestore } from '../utils/boardListScroll';
import { stopBoardAudio, toggleBoardAudio } from '../utils/boardAudioPlayer';
import { toast } from 'react-toastify';
import { 
  collection, 
  query, 
  orderBy, 
  getDocs, 
  where,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  getDoc,
  doc as firestoreDoc
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import { getPostListGradeSpanProps } from '../utils/gradeDisplay';
import { getPublicRoleBadge, shouldShowPublicPosition } from '../utils/publicRoleBadge';
import { 
  Plus, 
  Heart, 
  MessageCircle,
  Search,
  Loader,
  Users,
  Music,
  PlayCircle,
  PauseCircle,
  Eye,
  User,
  Clock,
  Bookmark
} from 'lucide-react';

interface ChorusPost {
  id: string;
  title: string;
  description: string;
  writerNickname: string;
  writerUid: string;
  createdAt: any;
  likesCount: number;
  commentCount: number;
  views: number;
  audioUrl: string;
  duration: number;
  likes: string[];
  writerGrade?: string;
  writerRole?: string;
  writerPosition?: string;
}

interface User {
  uid: string;
  email: string;
  nickname?: string;
  role?: string;
  isLoggedIn: boolean;
}

const POSTS_PER_PAGE = 10;
const CHORUS_LIST_STATE_KEY = 'veryus_chorus_list_state_v1';
type SortOrder = 'newest' | 'oldest' | 'likes' | 'comments';

const ChorusPostList: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const persistedStateRef = useRef<{ searchTerm?: string; sortOrder?: SortOrder; scrollY?: number; lastViewedPostId?: string } | null>(null);
  const restoredScrollYRef = useRef<number | null>(null);
  const pendingRestoreScrollYRef = useRef<number | null>(null);
  const anchorRestoredRef = useRef(false);
  const allowPersistRef = useRef(false);
  if (persistedStateRef.current === null) {
    try {
      const raw = sessionStorage.getItem(CHORUS_LIST_STATE_KEY);
      persistedStateRef.current = raw ? JSON.parse(raw) : {};
    } catch {
      persistedStateRef.current = {};
    }
  }
  const shouldRestoreOnMountRef = useRef(
    Boolean((location.state as { preserveScroll?: boolean } | null)?.preserveScroll) ||
      Boolean(persistedStateRef.current?.lastViewedPostId)
  );
  const [posts, setPosts] = useState<ChorusPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState(() => persistedStateRef.current?.searchTerm || '');
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => persistedStateRef.current?.sortOrder || 'newest');
  const [lastViewedPostId, setLastViewedPostId] = useState(() => persistedStateRef.current?.lastViewedPostId || '');
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const lastPostElementRef = useRef<HTMLDivElement | null>(null);

  const fetchPosts = useCallback(async (isInitial: boolean = false) => {
    try {
      if (isLoadingMore) return;
      
      setIsLoadingMore(!isInitial);
      setError(null);
      
      let baseQuery;
      const isClientSort = sortOrder === 'likes' || sortOrder === 'comments';
      const sortDirection = sortOrder === 'oldest' ? 'asc' : 'desc';
      
      if (isClientSort) {
        baseQuery = query(
          collection(db, 'posts'),
          where('type', '==', 'chorus'),
          orderBy('createdAt', 'desc')
        );
      } else if (!isInitial && lastVisible) {
        baseQuery = query(
          collection(db, 'posts'),
          where('type', '==', 'chorus'),
          orderBy('createdAt', sortDirection),
          startAfter(lastVisible),
          limit(POSTS_PER_PAGE)
        );
      } else {
        baseQuery = query(
          collection(db, 'posts'),
          where('type', '==', 'chorus'),
          orderBy('createdAt', sortDirection),
          limit(POSTS_PER_PAGE)
        );
      }

      const snapshot = await getDocs(baseQuery);
      
      if (snapshot.empty && isInitial) {
        setPosts([]);
        setHasMore(false);
        setLoading(false);
        setIsLoadingMore(false);
        return;
      }

      const lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
      if (!isClientSort) {
        setLastVisible(lastVisibleDoc);
      } else {
        setHasMore(false);
      }

      let newPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      })) as ChorusPost[];

      if (searchTerm) {
        newPosts = newPosts.filter(post => 
          post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          post.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      if (isClientSort) {
        if (sortOrder === 'likes') {
          newPosts.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
        } else if (sortOrder === 'comments') {
          newPosts.sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0));
        }
      }

      // 작성자 등급/역할/포지션 최신화
      const userCache = new Map<string, {grade?: string, role?: string, position?: string}>();
      await Promise.all(newPosts.map(async (post) => {
        if (!userCache.has(post.writerUid)) {
          const userDoc = await getDoc(firestoreDoc(db, 'users', post.writerUid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userCache.set(post.writerUid, {
              grade: userData.grade || '🍒',
              role: userData.role || '일반',
              position: userData.position || ''
            });
          } else {
            userCache.set(post.writerUid, {
              grade: '🍒',
              role: '일반',
              position: ''
            });
          }
        }
        const userInfo = userCache.get(post.writerUid);
        post.writerGrade = userInfo?.grade || '🍒';
        post.writerRole = userInfo?.role || '일반';
        post.writerPosition = userInfo?.position || '';
      }));

      setHasMore(snapshot.docs.length === POSTS_PER_PAGE);

      if (isInitial) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }

      setLoading(false);
      setIsLoadingMore(false);
    } catch (error) {
      console.error('녹음 게시글 로딩 에러:', error);
      setError('게시글을 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, lastVisible, searchTerm, sortOrder]);

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        const userData = JSON.parse(userString);
        setUser(userData);
        
      } catch (error) {
        console.error('사용자 정보 파싱 에러:', error);
      }
    }
  }, []);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(() => {
      setPosts([]);
      setLastVisible(null);
      setHasMore(true);
      setLoading(true);
      setError(null);
      fetchPosts(true);
    }, searchTerm ? 400 : 0);

    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchTerm, sortOrder]);

  useEffect(() => {
    if (!allowPersistRef.current) return;
    try {
      sessionStorage.setItem(
        CHORUS_LIST_STATE_KEY,
        JSON.stringify({
          searchTerm,
          sortOrder,
          scrollY: window.scrollY,
          lastViewedPostId
        })
      );
    } catch {
      // ignore
    }
  }, [searchTerm, sortOrder, lastViewedPostId]);

  useEffect(() => {
    if (!shouldRestoreOnMountRef.current || loading || anchorRestoredRef.current || !lastViewedPostId) return;
    const target = document.querySelector(`[data-post-id="${lastViewedPostId}"]`) as HTMLElement | null;
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'center', behavior: 'auto' });
        anchorRestoredRef.current = true;
        restoredScrollYRef.current = window.scrollY;
        pendingRestoreScrollYRef.current = null;
        allowPersistRef.current = true;
      });
      return;
    }
    if (!hasMore) {
      anchorRestoredRef.current = true;
      allowPersistRef.current = true;
    }
  }, [loading, posts.length, hasMore, lastViewedPostId]);

  useEffect(() => {
    if (loading) return;

    if (pendingRestoreScrollYRef.current === null) {
      const savedY = persistedStateRef.current?.scrollY;
      if (typeof savedY !== 'number' || savedY <= 0) {
        allowPersistRef.current = true;
        return;
      }
      pendingRestoreScrollYRef.current = savedY;
    }

    if (restoredScrollYRef.current !== null) return;

    const targetY = pendingRestoreScrollYRef.current;
    if (typeof targetY !== 'number') {
      allowPersistRef.current = true;
      return;
    }

    scheduleScrollRestore(targetY, () => {
      restoredScrollYRef.current = targetY;
      pendingRestoreScrollYRef.current = null;
      allowPersistRef.current = true;
    });
  }, [loading, posts.length, hasMore]);

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '20px',
      threshold: 1.0
    };

    const handleObserver = (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target.isIntersecting && hasMore && !isLoadingMore && !loading && !error) {
        fetchPosts(false);
      }
    };

    const currentObserver = new IntersectionObserver(handleObserver, options);
    observer.current = currentObserver;

    const lastElement = lastPostElementRef.current;
    if (lastElement) {
      currentObserver.observe(lastElement);
    }

    return () => {
      if (lastElement) {
        currentObserver.unobserve(lastElement);
      }
      currentObserver.disconnect();
    };
  }, [hasMore, isLoadingMore, loading, error, fetchPosts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPosts([]);
    setLastVisible(null);
    setHasMore(true);
    fetchPosts(true);
  };

  const handlePostClick = (postId: string) => {
    try {
      setLastViewedPostId(postId);
      sessionStorage.setItem(
        CHORUS_LIST_STATE_KEY,
        JSON.stringify({
          searchTerm,
          sortOrder,
          scrollY: window.scrollY,
          lastViewedPostId: postId
        })
      );
    } catch {
      // ignore
    }
    navigate(`/chorus/${postId}`);
  };

  const handleWritePost = () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    navigate('/chorus/write');
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffMinutes < 1) {
      return '방금 전';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}분 전`;
    } else if (diffHours < 24) {
      return `${diffHours}시간 전`;
    } else if (diffDays < 30) {
      return `${diffDays}일 전`;
    } else if (diffMonths < 12) {
      return `${diffMonths}달 전`;
    } else {
      return `${diffYears}년 전`;
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = (postId: string, audioUrl: string) => {
    const ownerId = `chorus-list:${postId}`;
    void toggleBoardAudio(
      audioUrl,
      ownerId,
      () => setCurrentlyPlaying(null),
      (message) => toast.error(message)
    ).then((state) => {
      setCurrentlyPlaying(state === 'playing' ? postId : null);
    });
  };

  useEffect(() => {
    if (location.pathname !== '/chorus') {
      stopBoardAudio();
      setCurrentlyPlaying(null);
    }
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      stopBoardAudio();
      setCurrentlyPlaying(null);
    };
  }, []);

  if (error) {
    return (
      <div className="error-container">
        <p>{error}</p>
        <button onClick={() => fetchPosts(true)}>다시 시도</button>
      </div>
    );
  }

  return (
    <div className="board-container">
      <div className="board-header">
        {/* '메인으로' 버튼 완전히 삭제 */}
      </div>
      <div className="board-controls">
        <div className="search-container">
          <h1 className="board-title">
            <Users size={28} />
            이어 부르기
          </h1>
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="검색어를 입력하세요"
              className="search-input"
            />
            <button type="submit" className="search-button">
              <Search size={20} />
            </button>
          </form>
        </div>
        <div className="action-buttons">
          <select
            className="post-sort-select"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          >
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="likes">좋아요순</option>
            <option value="comments">소절순</option>
          </select>
          <button 
            className="write-button" 
            onClick={handleWritePost}
            disabled={!user}
            title={!user ? "로그인이 필요합니다" : "첫 소절 올리기"}
          >
            <Plus size={16} />
            첫 소절 올리기
          </button>
        </div>
      </div>

      <div className="post-list">
        {loading ? (
          <div className="loading-container">
            <Loader size={24} className="loading-spinner" />
            <span>게시글을 불러오는 중...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-posts">
            <Users size={48} />
            <p>게시글이 없습니다.</p>
            {searchTerm && (
              <button onClick={() => {
                setSearchTerm('');
                fetchPosts(true);
              }} className="reset-search">
                검색 초기화
              </button>
            )}
          </div>
        ) : (
          posts.map((post, index) => (
            <article 
              key={post.id}
              className="post-item"
              data-post-id={post.id}
              onClick={() => handlePostClick(post.id)}
              ref={index === posts.length - 1 ? lastPostElementRef : null}
            >
              <div className="post-header">
                <div className="post-main-info">
                  <div className="post-category-title">
                    <span className="post-category category-badge">이어부르기</span>
                    <h2 className="post-title" style={{ fontSize: '1.3rem' }}>{post.title}</h2>
                  </div>
                </div>
                <div className="post-meta">
                  <div className="post-author">
                    <span {...getPostListGradeSpanProps(post.writerGrade)} />
                    <span className="author-name post-author-name--list">
                      {post.writerNickname}
                    </span>
                    <span className={`role-badge ${getPublicRoleBadge(post.writerRole, post.writerPosition)}`}>
                      {getPublicRoleBadge(post.writerRole, post.writerPosition)}
                    </span>
                    {shouldShowPublicPosition(post.writerPosition) && (
                      <span className="author-position">{post.writerPosition}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="post-content-preview">
                {post.description}
                <div className="audio-preview">
                  <button onClick={e => { e.stopPropagation(); handlePlayPause(post.id, post.audioUrl); }}>
                    {currentlyPlaying === post.id ? <PauseCircle size={32} /> : <PlayCircle size={32} />}
                  </button>
                  <span className="audio-duration">{formatDuration(post.duration)}</span>
                </div>
              </div>
              <div className="post-footer post-stats-row">
                <span className="post-stat post-stat-item">
                  <Heart size={16} />
                  {post.likesCount || 0}
                </span>
                <span className="post-stat post-stat-item" title="이어진 소절 수">
                  <Users size={16} />
                  {1 + (post.commentCount || 0)}소절
                </span>
                <span className="post-date post-stat-item">
                  <Clock size={16} />
                  {formatDate(post.createdAt)}
                </span>
                <span className="post-views post-stat-item">
                  <Eye size={16} />
                  조회 {post.views || 0}
                </span>
              </div>
            </article>
          ))
        )}
        {isLoadingMore && (
          <div className="loading-more">
            <Loader className="loading-spinner" size={24} />
            <span>더 불러오는 중...</span>
          </div>
        )}
      </div>
      <button 
        className="fab-button" 
        onClick={handleWritePost}
        disabled={!user}
        title={!user ? "로그인이 필요합니다" : "첫 소절 올리기"}
      >
        <Plus size={24} />
      </button>
    </div>
  );
};

export default ChorusPostList; 