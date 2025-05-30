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
import './Board.css';

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
  const [searchType, setSearchType] = useState('title');

  const categories = [
    { id: 'all', name: '전체' },
    { id: 'general', name: '일반' },
    { id: 'question', name: '질문' },
    { id: 'share', name: '정보공유' },
    { id: 'discussion', name: '토론' }
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

  const getGradeEmoji = (grade: string) => {
    const gradeEmojis = ['🍒', '🫐', '🥝', '🍎', '🍈', '🍉', '🌍', '🪐', '☀️', '🌌', '🍺', '⚡', '⭐', '🌙'];
    if (gradeEmojis.includes(grade)) {
      return grade;
    }
    const gradeToEmoji: { [key: string]: string } = {
      '체리': '🍒',
      '블루베리': '🫐',
      '키위': '🥝',
      '사과': '🍎',
      '멜론': '🍈',
      '수박': '🍉',
      '지구': '🌍',
      '토성': '🪐',
      '태양': '☀️',
      '은하': '🌌',
      '맥주': '🍺',
      '번개': '⚡',
      '별': '⭐',
      '달': '🌙'
    };
    return gradeToEmoji[grade] || '🍒';
  };

  const getGradeName = (emoji: string) => {
    const emojiToGrade: { [key: string]: string } = {
      '🍒': '체리',
      '🫐': '블루베리',
      '🥝': '키위',
      '🍎': '사과',
      '🍈': '멜론',
      '🍉': '수박',
      '🌍': '지구',
      '🪐': '토성',
      '☀️': '태양',
      '🌌': '은하',
      '🍺': '맥주',
      '⚡': '번개',
      '⭐': '별',
      '🌙': '달'
    };
    return emojiToGrade[emoji] || '체리';
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

      postsData.forEach(post => {
        setupUserInfoListener(post);
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
  }, [isLoadingMore, lastVisible, sortBy, searchTerm, selectedCategory]);

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
    fetchPosts(true);
  }, [sortBy, searchTerm, selectedCategory]);

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
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      return '방금 전';
    } else if (diffHours < 24) {
      return `${diffHours}시간 전`;
    } else if (diffDays < 7) {
      return `${diffDays}일 전`;
    } else {
      return actualDate.toLocaleDateString('ko-KR');
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
        <button 
          className="back-to-main-button"
          onClick={() => navigate('/')}
          title="메인으로 이동"
        >
          <ArrowLeft size={20} />
          메인으로
        </button>
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
                    <h2 className="post-title">{post.title}</h2>
                  </div>
                </div>
                <div className="post-meta">
                  <div className="post-author">
                    <User size={16} />
                    <span className="author-info">
                      {post.writerNickname}
                      <span className="author-grade-emoji" title={getGradeName(post.writerGrade || '🍒')}>
                        {getGradeEmoji(post.writerGrade || '🍒')}
                      </span>
                    </span>
                    {post.writerRole && post.writerRole !== '일반' && (
                      <span className="author-role">{post.writerRole}</span>
                    )}
                    {post.writerPosition && (
                      <span className="author-position">{post.writerPosition}</span>
                    )}
                  </div>
                  <span className="post-date">
                    <Clock size={16} />
                    {formatDate(post.createdAt)}
                  </span>
                  <span className="post-views">
                    <Eye size={16} />
                    조회 {post.views || 0}
                  </span>
                </div>
              </div>

              <div className="post-content-preview">
                {truncateContent(post.content)}
              </div>

              <div className="post-footer">
                <div className="post-stats">
                  <span className="post-stat">
                    <Heart size={16} />
                    {post.likesCount || 0}
                  </span>
                  <span className="post-stat">
                    <MessageCircle size={16} />
                    {post.commentCount || 0}
                  </span>
                  {post.bookmarks && post.bookmarks.length > 0 && (
                    <span className="post-stat">
                      <Bookmark size={16} />
                      {post.bookmarks.length}
                    </span>
                  )}
                </div>
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