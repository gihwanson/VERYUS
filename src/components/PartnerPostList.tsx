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
import '../styles/PostList.css';
import '../styles/BoardLayout.css';
import { markBoardAsVisited } from '../utils/simpleBoardNotification';

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

const categoryNameMap: { [key: string]: string } = {
  'vocal': '보컬',
  'etc': '세션',
  'etc2': '기타',
};

const PartnerPostList: React.FC = () => {
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
  const observer = useRef<IntersectionObserver | null>(null);
  const lastPostElementRef = useRef<HTMLDivElement | null>(null);
  const [searchType, setSearchType] = useState('title');

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
          where('type', '==', 'partner'),
          orderBy('createdAt', 'desc'),
          startAfter(lastVisible),
          limit(POSTS_PER_PAGE)
        );
      } else {
        baseQuery = query(
          collection(db, 'posts'),
          where('type', '==', 'partner'),
          orderBy('createdAt', 'desc'),
          limit(POSTS_PER_PAGE)
        );
      }
      const snapshot = await getDocs(baseQuery);
      const newPosts: Post[] = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Post));
      if (isInitial) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }
      setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === POSTS_PER_PAGE);
      // 작성자 정보 실시간 구독
      newPosts.forEach(setupUserInfoListener);
    } catch (err) {
      setError('게시글을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, lastVisible]);

  useEffect(() => {
    fetchPosts(true);
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      try {
        const userData = JSON.parse(userString);
        setUser(userData);
        
        // 게시판 방문 기록 저장
        if (userData.uid) {
          markBoardAsVisited(userData.uid, 'partner');
        }
      } catch (error) {
        console.error('사용자 정보 파싱 에러:', error);
      }
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // 검색 로직 (제목/내용 등)
    // 필요시 구현
  };

  const handlePostClick = (postId: string) => {
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
                    <span className="author-grade-emoji" style={{ fontSize: '1.1rem', marginRight: '0.3rem' }}>
                      {post.writerGrade}
                    </span>
                    <span className="author-info" style={{ fontSize: '1.1rem', color: '#FFFFFF', fontWeight: 600, textDecoration: 'none' }}>
                      {post.writerNickname}
                    </span>
                    <span className={`role-badge ${post.writerRole || '일반'}`}>
                      {post.writerRole || '일반'}
                    </span>
                    {post.writerPosition && (
                      <span className="author-position">{post.writerPosition}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="post-content-preview">
                {post.content && post.content.length > 100 ? post.content.substring(0, 100) + '...' : post.content}
              </div>
              <div className="post-stats" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(139, 92, 246, 0.1)', color: '#FFFFFF', fontSize: '0.85rem', fontWeight: 500 }}>
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
                {post.isClosed ? (
                  <span className="closed-badge">모집완료</span>
                ) : (
                  <span className="open-badge">모집중</span>
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
      {hasMore && !loading && (
        <button className="load-more-button" onClick={() => fetchPosts(false)} disabled={isLoadingMore}>
          {isLoadingMore ? <Loader className="loading-spinner" /> : '더 보기'}
        </button>
      )}
    </div>
  );
};

export default PartnerPostList; 