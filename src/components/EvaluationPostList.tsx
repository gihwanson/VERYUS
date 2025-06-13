import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { 
  ArrowLeft, 
  Plus, 
  Heart, 
  MessageCircle,
  Search,
  Loader,
  User,
  Clock,
  Bookmark,
  Star,
  Eye
} from 'lucide-react';
import './Board.css';

interface EvaluationPost {
  id: string;
  title: string;
  description: string;
  writerNickname: string;
  writerUid: string;
  createdAt: any;
  likesCount: number;
  commentCount: number;
  views: number;
  likes: string[];
  writerGrade?: string;
  writerRole?: string;
  writerPosition?: string;
  category: string;
  status?: string;
}

interface User {
  uid: string;
  email: string;
  nickname?: string;
  role?: string;
  isLoggedIn: boolean;
}

const POSTS_PER_PAGE = 10;

const EvaluationPostList: React.FC = () => {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<EvaluationPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const lastPostElementRef = useRef<HTMLDivElement | null>(null);

  // 등급 이모지 매핑 함수 (자유게시판과 동일)
  const gradeEmojis = ['🍒', '🫐', '🥝', '🍎', '🍈', '🍉', '🌍', '🪐', '☀️', '🌌', '🍺', '⚡', '⭐', '🌙'];
  const gradeToEmoji: { [key: string]: string } = {
    '체리': '🍒', '블루베리': '🫐', '키위': '🥝', '사과': '🍎', '멜론': '🍈', '수박': '🍉', '지구': '🌍', '토성': '🪐', '태양': '☀️', '은하': '🌌', '맥주': '🍺', '번개': '⚡', '별': '⭐', '달': '🌙'
  };
  const emojiToGrade: { [key: string]: string } = {
    '🍒': '체리', '🫐': '블루베리', '🥝': '키위', '🍎': '사과', '🍈': '멜론', '🍉': '수박', '🌍': '지구', '🪐': '토성', '☀️': '태양', '🌌': '은하', '🍺': '맥주', '⚡': '번개', '⭐': '별', '🌙': '달'
  };
  const getGradeEmoji = (grade: string) => gradeEmojis.includes(grade) ? grade : gradeToEmoji[grade] || '🍒';
  const getGradeName = (emoji: string) => emojiToGrade[emoji] || '체리';

  const fetchPosts = useCallback(async (isInitial: boolean = false) => {
    try {
      if (isLoadingMore) return;
      
      setIsLoadingMore(!isInitial);
      setError(null);
      
      let baseQuery;
      
      if (!isInitial && lastVisible) {
        baseQuery = query(
          collection(db, 'posts'),
          where('type', '==', 'evaluation'),
          orderBy('createdAt', 'desc'),
          startAfter(lastVisible),
          limit(POSTS_PER_PAGE)
        );
      } else {
        baseQuery = query(
          collection(db, 'posts'),
          where('type', '==', 'evaluation'),
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

      let newPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      })) as EvaluationPost[];

      // 검색어로 필터링 (클라이언트 사이드)
      if (searchTerm) {
        newPosts = newPosts.filter(post => 
          post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          post.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
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
      console.error('평가 게시글 로딩 에러:', error);
      setError('게시글을 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, lastVisible, searchTerm]);

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
  }, [searchTerm]);

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
    navigate(`/evaluation/${postId}`);
  };

  const handleWritePost = () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    navigate('/evaluation/write');
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      return '방금 전';
    } else if (diffHours < 24) {
      return `${diffHours}시간 전`;
    } else if (diffDays < 7) {
      return `${diffDays}일 전`;
    } else {
      return date.toLocaleDateString('ko-KR');
    }
  };

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
            <Star size={28} />
            평가게시판
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
      <div style={{
        width: '100%',
        textAlign: 'center',
        margin: '0 0 18px 0',
        fontWeight: 600,
        color: '#8A55CC',
        fontSize: '1.08rem',
        letterSpacing: '0.01em',
        background: '#f6f2ff',
        border: '2px solid #e3d0ff',
        borderRadius: '14px',
        padding: '14px 0',
        boxSizing: 'border-box'
      }}>
        해당게시판은 심사곡 업로드와 피드백요청을 위한 게시판 입니다
      </div>
      <div className="post-list">
        {loading ? (
          <div className="loading-container">
            <Loader size={24} className="loading-spinner" />
            <span>게시글을 불러오는 중...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-posts">
            <Star size={48} />
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
              className="post-card"
              onClick={() => handlePostClick(post.id)}
              ref={index === posts.length - 1 ? lastPostElementRef : null}
              style={{ cursor: 'pointer', marginBottom: 16 }}
            >
              <div className="post-category-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="post-category category-badge" style={{ background: post.category === 'busking' ? '#8A55CC' : '#e3d0ff', color: post.category === 'busking' ? 'white' : '#8A55CC' }}>
                  {post.category === 'busking' ? '버스킹심사곡' : post.category === 'feedback' ? '피드백요청' : '평가'}
                </span>
                <h2 className="post-title" style={{ fontSize: '1.13rem', fontWeight: 700, color: '#1F2937', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{post.title}</h2>
              </div>
              <div className="post-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.7rem', fontSize: '0.97rem', color: '#6B7280', marginBottom: 4 }}>
                <div className="post-author" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                  <User size={16} />
                  <span className="author-info" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 500, color: '#1F2937' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                  <span className="post-date" style={{ display: 'flex', alignItems: 'center', gap: '0.2em' }}>
                    <Clock size={16} />
                    {formatDate(post.createdAt)}
                  </span>
                  <span className="post-views" style={{ display: 'flex', alignItems: 'center', gap: '0.2em' }}>
                    <Eye size={16} />
                    조회 {post.views || 0}
                  </span>
                </div>
              </div>
              <div className="post-content-preview" style={{ fontSize: '1.05rem', color: '#6B7280', margin: '0.7rem 0 1.2rem 0', lineHeight: 1.7, minHeight: '2.5em', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                {post.description}
              </div>
              <div className="post-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1.2rem', marginTop: 'auto' }}>
                <div className="post-stats" style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', fontSize: '0.98rem', color: '#8A55CC' }}>
                  <span className="stat-item" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Heart size={16} />
                    {post.likesCount || 0}
                  </span>
                  <span className="stat-item" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MessageCircle size={16} />
                    {post.commentCount || 0}
                  </span>
                </div>
                <span className="post-status-badge" style={{
                  marginRight: 8,
                  fontWeight: 700,
                  fontSize: 12.5,
                  borderRadius: 8,
                  padding: '2px 8px',
                  background: post.status === '합격' ? '#8A55CC' : post.status === '불합격' ? '#F43F5E' : '#E5E7EB',
                  color: post.status === '합격' ? '#fff' : post.status === '불합격' ? '#fff' : '#888',
                  display: 'inline-block',
                  minWidth: 32,
                  maxWidth: 60,
                  textAlign: 'center',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}>
                  {post.category === 'feedback' ? '피드백' : (post.status || '대기')}
                </span>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};

export default EvaluationPostList; 