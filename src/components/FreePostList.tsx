import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { getGradeEmoji, getGradeName } from '../utils/gradeDisplay';
import { getPublicRoleBadge, shouldShowPublicPosition } from '../utils/publicRoleBadge';
import { 
  ArrowLeft, 
  MessageSquare, 
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
import '../styles/PostList.css';
import '../styles/BoardLayout.css';
import { addLurkingScore } from '../utils/simpleBoardNotification';

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

type SortOption = 'latest' | 'likes' | 'comments' | 'views';

const POSTS_PER_PAGE = 10;

const FreePostList: React.FC = () => {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('latest');
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const observer = useRef<IntersectionObserver | null>(null);
  const lastPostElementRef = useRef<HTMLDivElement | null>(null);
  const userInfoUnsubscribersRef = useRef<Array<() => void>>([]);
  const [searchType, setSearchType] = useState('title');

  const clearUserInfoListeners = useCallback(() => {
    userInfoUnsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
    userInfoUnsubscribersRef.current = [];
  }, []);

  const categories = [
    { id: 'all', name: '전체' },
    { id: 'general', name: '일반' },
    { id: 'question', name: '질문' },
    { id: 'share', name: '정보공유' },
    { id: 'discussion', name: '토론' },
    { id: 'request', name: '신청곡' },
  ];

  const getSortOptions = (option: SortOption) => {
    switch (option) {
      case 'likes':
        return [orderBy('likesCount', 'desc'), orderBy('createdAt', 'desc')];
      case 'comments':
        return [orderBy('commentCount', 'desc'), orderBy('createdAt', 'desc')];
      case 'views':
        return [orderBy('views', 'desc'), orderBy('createdAt', 'desc')];
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
          where('type', '==', 'free'),
          orderBy('createdAt', 'desc'),
          startAfter(lastVisible),
          limit(POSTS_PER_PAGE)
        );
      } else {
        baseQuery = query(
          collection(db, 'posts'),
          where('type', '==', 'free'),
          orderBy('createdAt', 'desc'),
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
      setLastVisible(lastVisibleDoc);

      const postsData = await Promise.all(snapshot.docs.map(async docSnapshot => {
        const postData = docSnapshot.data();
        let writerGrade = '🍒';
        let writerRole = '일반';
        let writerPosition = '';

        try {
          const userDocRef = doc(db, 'users', postData.writerUid);
          const userDocSnapshot = await getDoc(userDocRef);
          if (userDocSnapshot.exists()) {
            const userData = userDocSnapshot.data() as UserData;
            writerGrade = userData.grade || '🍒';
            writerRole = userData.role || '일반';
            writerPosition = userData.position || '';
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        }

        return {
          id: docSnapshot.id,
          ...postData,
          writerGrade,
          writerRole,
          writerPosition,
          createdAt: postData.createdAt?.toDate() || new Date()
        };
      })) as Post[];

      if (isInitial) {
        clearUserInfoListeners();
      }
      postsData.forEach(post => {
        const unsubscribe = setupUserInfoListener(post);
        userInfoUnsubscribersRef.current.push(unsubscribe);
      });

      if (sortBy !== 'latest') {
        postsData.sort((a, b) => {
          switch (sortBy) {
            case 'likes':
              return (b.likesCount || 0) - (a.likesCount || 0);
            case 'comments':
              return (b.commentCount || 0) - (a.commentCount || 0);
            case 'views':
              return (b.views || 0) - (a.views || 0);
            default:
              return 0;
          }
        });
      }

      let filteredPosts = postsData;
      if (searchTerm) {
        filteredPosts = postsData.filter(post => 
          post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          post.content.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      if (selectedCategory !== 'all') {
        filteredPosts = filteredPosts.filter(post => post.category === selectedCategory);
      }

      setHasMore(snapshot.docs.length === POSTS_PER_PAGE);

      if (isInitial) {
        setPosts(filteredPosts);
      } else {
        setPosts(prev => [...prev, ...filteredPosts]);
      }

      setLoading(false);
      setIsLoadingMore(false);
    } catch (error) {
      console.error('게시글 로딩 에러:', error);
      setError('게시글을 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, lastVisible, sortBy, searchTerm, selectedCategory, clearUserInfoListeners]);

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        setUser(JSON.parse(userString));
      } catch (error) {
        console.error('사용자 정보 파싱 에러:', error);
      }
    }
  }, []);

  useEffect(() => {
    setPosts([]);
    setLastVisible(null);
    setHasMore(true);
    setLoading(true);
    setError(null);
    clearUserInfoListeners();
    fetchPosts(true);
  }, [sortBy, searchTerm, selectedCategory, clearUserInfoListeners]);

  useEffect(() => {
    return () => {
      clearUserInfoListeners();
    };
  }, [clearUserInfoListeners]);

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
    if (user?.uid) addLurkingScore(user.uid, 'post_enter.free');
    navigate(`/free/${postId}`);
  };

  const handleWritePost = () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    navigate('/free/write');
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

  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  const getCategoryName = (category?: string) => {
    const categoryObj = categories.find(c => c.id === category);
    return categoryObj ? categoryObj.name : '전체';
  };

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
            <MessageSquare size={28} />
            자유게시판
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
            <MessageSquare size={48} />
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
              onClick={() => handlePostClick(post.id)}
              ref={index === posts.length - 1 ? lastPostElementRef : null}
            >
              <div className="post-header">
                <div className="post-main-info">
                  <div className="post-category-title">
                    <span className="post-category category-badge">{getCategoryName(post.category)}</span>
                    <h2 className="post-title" style={{ fontSize: '1.3rem' }}>
                      {post.title}
                    </h2>
                  </div>
                </div>
                <div className="post-meta">
                  <div className="post-author">
                    <span className="author-grade-emoji" title={getGradeName(post.writerGrade || '🍒')} style={{ fontSize: '1.1rem', marginRight: '0.3rem' }}>
                      {getGradeEmoji(post.writerGrade || '🍒')}
                    </span>
                    <span className="author-info" style={{ fontSize: '1.1rem', color: '#FFFFFF', fontWeight: 600, textDecoration: 'none' }}>
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
                {post.category === 'request' && post.content.startsWith('신청 대상:') && (
                  <div className="request-song-banner">
                    {(() => {
                      const match = post.content.match(/^신청 대상: (.+)/);
                      return match ? `"${match[1].split('\n')[0]}"에게 신청곡이 들어왔어요!` : '신청곡이 들어왔어요!';
                    })()}
                  </div>
                )}
                <div>
                  {post.category === 'request' && post.content.startsWith('신청 대상:')
                    ? truncateContent(post.content.split('\n').slice(1).join('\n'))
                    : truncateContent(post.content)}
                </div>
              </div>

              <div className="post-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(139, 92, 246, 0.1)', color: '#FFFFFF', fontSize: '0.85rem', fontWeight: 500 }}>
                <span className="post-stat" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#FFFFFF' }}>
                  <Heart size={16} style={{ color: '#FFFFFF' }} />
                  {post.likesCount || 0}
                </span>
                <span className="post-stat" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#FFFFFF' }}>
                  <MessageCircle size={16} style={{ color: '#FFFFFF' }} />
                  {post.commentCount || 0}
                </span>
                <span className="post-date" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#FFFFFF' }}>
                  <Clock size={16} style={{ color: '#FFFFFF' }} />
                  {formatDate(post.createdAt)}
                </span>
                <span className="post-views" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#FFFFFF' }}>
                  <Eye size={16} style={{ color: '#FFFFFF' }} />
                  조회 {post.views || 0}
                </span>
                {post.bookmarks && post.bookmarks.length > 0 && (
                  <span className="post-stat" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#FFFFFF' }}>
                    <Bookmark size={16} style={{ color: '#FFFFFF' }} />
                    {post.bookmarks.length}
                  </span>
                )}
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
        title={!user ? "로그인이 필요합니다" : "새 글 작성"}
      >
        <Plus size={24} />
      </button>
    </div>
  );
};

export default FreePostList; 