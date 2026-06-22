import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { scheduleScrollRestore } from '../utils/boardListScroll';
import { 
  collection, 
  query, 
  orderBy, 
  getDocs, 
  onSnapshot, 
  where,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  getDoc,
  doc
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import { getPublicRoleBadge, shouldShowPublicPosition } from '../utils/publicRoleBadge';
import { 
  ArrowLeft, 
  UserPlus, 
  Plus, 
  Heart, 
  MessageCircle,
  FileText,
  Search,
  SortAsc,
  Loader,
  Filter,
  User,
  Clock,
  Eye,
  Bookmark
} from 'lucide-react';
import { getPostListGradeSpanProps } from '../utils/gradeDisplay';

interface Post {
  id: string;
  title: string;
  content: string;
  writerNickname: string;
  writerUid: string;
  writerRole?: string;
  writerPosition?: string;
  writerGrade?: string;
  createdAt: any;
  likesCount: number;
  commentCount: number;
  views: number;
  category?: string;
  likes: string[];
  bookmarks?: string[];
  isClosed: boolean;
  isHidden?: boolean;
}

interface User {
  uid: string;
  email: string;
  nickname?: string;
  role?: string;
  isLoggedIn: boolean;
}

interface UserData {
  role?: string;
  nickname?: string;
  email: string;
  position?: string;
  grade?: string;
}

type SortOption = 'latest' | 'oldest' | 'likes' | 'comments' | 'views';

const POSTS_PER_PAGE = 10;
const PARTNER_LIST_STATE_KEY = 'veryus_partner_list_state_v1';

const categoryNameMap: { [key: string]: string } = {
  'vocal': '보컬',
  'etc': '세션',
  'etc2': '기타',
};

const PartnerPostList: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const persistedStateRef = useRef<{ searchTerm?: string; sortBy?: SortOption; scrollY?: number; lastViewedPostId?: string } | null>(null);
  const restoredScrollYRef = useRef<number | null>(null);
  const pendingRestoreScrollYRef = useRef<number | null>(null);
  const anchorRestoredRef = useRef(false);
  const allowPersistRef = useRef(false);
  if (persistedStateRef.current === null) {
    try {
      const raw = sessionStorage.getItem(PARTNER_LIST_STATE_KEY);
      persistedStateRef.current = raw ? JSON.parse(raw) : {};
    } catch {
      persistedStateRef.current = {};
    }
  }
  const shouldRestoreOnMountRef = useRef(
    Boolean((location.state as { preserveScroll?: boolean } | null)?.preserveScroll) ||
      Boolean(persistedStateRef.current?.lastViewedPostId)
  );
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState(() => persistedStateRef.current?.searchTerm || '');
  const [sortBy, setSortBy] = useState<SortOption>(() => persistedStateRef.current?.sortBy || 'latest');
  const [lastViewedPostId, setLastViewedPostId] = useState(() => persistedStateRef.current?.lastViewedPostId || '');
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const lastPostElementRef = useRef<HTMLDivElement | null>(null);
  const userInfoUnsubscribersRef = useRef<Array<() => void>>([]);
  const [searchType, setSearchType] = useState('title');

  const clearUserInfoListeners = useCallback(() => {
    userInfoUnsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
    userInfoUnsubscribersRef.current = [];
  }, []);

  const getSortOptions = (option: SortOption) => {
    switch (option) {
      case 'likes':
        return [orderBy('likesCount', 'desc'), orderBy('createdAt', 'desc')];
      case 'comments':
        return [orderBy('commentCount', 'desc'), orderBy('createdAt', 'desc')];
      case 'views':
        return [orderBy('views', 'desc'), orderBy('createdAt', 'desc')];
      case 'oldest':
        return [orderBy('createdAt', 'asc')];
      default:
        return [orderBy('createdAt', 'desc')];
    }
  };

  const setupUserInfoListener = (post: Post) => {
    const userRef = doc(db, 'users', post.writerUid);
    return onSnapshot(userRef, (userDoc) => {
      if (userDoc.exists()) {
        const userData = userDoc.data() as UserData;
        setPosts(prevPosts => prevPosts.map(p => {
          if (p.id === post.id) {
            return {
              ...p,
              writerGrade: userData.grade || '🍒',
              writerRole: userData.role || '일반',
              writerPosition: userData.position || ''
            };
          }
          return p;
        }));
      }
    });
  };

  const fetchPosts = useCallback(async (isInitial: boolean = false) => {
    try {
      if (isLoadingMore) return;
      setIsLoadingMore(!isInitial);
      setError(null);
      let baseQuery;
      if (!isInitial && lastVisible) {
        baseQuery = query(
          collection(db, 'posts'),
          where('type', '==', 'partner'),
          ...getSortOptions(sortBy),
          startAfter(lastVisible),
          limit(POSTS_PER_PAGE)
        );
      } else {
        baseQuery = query(
          collection(db, 'posts'),
          where('type', '==', 'partner'),
          ...getSortOptions(sortBy),
          limit(POSTS_PER_PAGE)
        );
      }
      const snapshot = await getDocs(baseQuery);
      let newPosts: Post[] = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Post))
        .filter(post => !post.isHidden); // 숨김처리된 게시글 필터링
      if (searchTerm.trim()) {
        const keyword = searchTerm.trim().toLowerCase();
        newPosts = newPosts.filter((post) => {
          const title = String(post.title || '').toLowerCase();
          const content = String(post.content || '').toLowerCase();
          return title.includes(keyword) || content.includes(keyword);
        });
      }
      if (isInitial) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }
      setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === POSTS_PER_PAGE);
      if (isInitial) {
        clearUserInfoListeners();
      }
      newPosts.forEach((post) => {
        const unsubscribe = setupUserInfoListener(post);
        userInfoUnsubscribersRef.current.push(unsubscribe);
      });
    } catch (err) {
      setError('게시글을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, lastVisible, clearUserInfoListeners, sortBy, searchTerm]);

  useEffect(() => {
    fetchPosts(true);
    // eslint-disable-next-line
  }, [sortBy, searchTerm]);

  useEffect(() => {
    return () => {
      clearUserInfoListeners();
    };
  }, [clearUserInfoListeners]);

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

  useEffect(() => {
    if (!allowPersistRef.current) return;
    try {
      sessionStorage.setItem(
        PARTNER_LIST_STATE_KEY,
        JSON.stringify({
          searchTerm,
          sortBy,
          scrollY: window.scrollY,
          lastViewedPostId
        })
      );
    } catch {
      // ignore
    }
  }, [searchTerm, sortBy, lastViewedPostId]);

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
        PARTNER_LIST_STATE_KEY,
        JSON.stringify({
          searchTerm,
          sortBy,
          scrollY: window.scrollY,
          lastViewedPostId: postId
        })
      );
    } catch {
      // ignore
    }
    navigate(`/boards/partner/${postId}`);
  };

  const handleWritePost = () => {
    navigate('/boards/partner/write');
  };

  const formatDate = (date: Date | any) => {
    if (!date) return '';
    
    const actualDate = date.toDate ? date.toDate() : new Date(date);
    
    const now = new Date();
    const diffTime = now.getTime() - actualDate.getTime();
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

  // 무한스크롤 IntersectionObserver
  useEffect(() => {
    if (loading) return;
    if (!hasMore) return;
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
    const currentObserver = new window.IntersectionObserver(handleObserver, options);
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
            <UserPlus size={28} />
            파트너모집
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
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="likes">좋아요순</option>
            <option value="comments">댓글순</option>
            <option value="views">조회순</option>
          </select>
          <button 
            className="write-button" 
            onClick={handleWritePost}
            disabled={!user}
            title={!user ? "로그인이 필요합니다" : "새 글 작성"}
          >
            <Plus size={16} />
            글쓰기
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
            <MessageCircle size={48} />
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
                    <span className="post-category category-badge">{categoryNameMap[post.category || ''] || '파트너'}</span>
                    <h2 className="post-title" style={{ fontSize: '1.3rem' }}>{post.title}</h2>
                  </div>
                </div>
                <div className="post-meta">
                  <div className="post-author">
                    <span {...getPostListGradeSpanProps(post.writerGrade)} />
                    <span className="author-info post-author-name--list">
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
                {post.content && post.content.length > 100 ? post.content.substring(0, 100) + '...' : post.content}
              </div>
              <div className="post-stats post-stats-row">
                <span className="post-stat post-stat-item">
                  <Heart size={16} />
                  {post.likesCount || 0}
                </span>
                <span className="post-stat post-stat-item">
                  <MessageCircle size={16} />
                  {post.commentCount || 0}
                </span>
                <span className="post-date post-stat-item">
                  <Clock size={16} />
                  {formatDate(post.createdAt)}
                </span>
                <span className="post-views post-stat-item">
                  <Eye size={16} />
                  조회 {post.views || 0}
                </span>
                {post.bookmarks && post.bookmarks.length > 0 && (
                  <span className="post-stat post-stat-item">
                    <Bookmark size={16} />
                    {post.bookmarks.length}
                  </span>
                )}
                {post.isClosed ? (
                  <span className="closed-badge">모집완료</span>
                ) : (
                  <span className="open-badge">모집중</span>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};

export default PartnerPostList; 