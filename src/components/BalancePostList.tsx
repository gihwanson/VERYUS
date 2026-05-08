import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, doc as firestoreDoc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Loader, Plus, Scale } from 'lucide-react';
import { db } from '../firebase';
import { getGradeEmoji } from '../utils/gradeDisplay';
import '../styles/PostList.css';
import '../styles/BoardLayout.css';

interface Post {
  id: string;
  title: string;
  content?: string;
  writerNickname: string;
  writerUid?: string;
  writerGrade?: string;
  createdAt: any;
  commentCount: number;
  views: number;
  balanceOptionA: string;
  balanceOptionB: string;
  votesA?: number;
  votesB?: number;
}

const BalancePostList: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const shouldRestoreOnMountRef = useRef(Boolean((location.state as { preserveScroll?: boolean } | null)?.preserveScroll));
  const BALANCE_LIST_STATE_KEY = 'veryus_balance_list_state_v1';
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [lastViewedPostId, setLastViewedPostId] = useState('');
  const anchorRestoredRef = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BALANCE_LIST_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { lastViewedPostId?: string; scrollY?: number };
        if (parsed.lastViewedPostId) setLastViewedPostId(parsed.lastViewedPostId);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    setUser(userString ? JSON.parse(userString) : null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const q = query(
          collection(db, 'posts'),
          where('type', '==', 'balance'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const snapshot = await getDocs(q);
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as Post[];
        const withGrades = await Promise.all(
          items.map(async (post) => {
            if (!post.writerUid) return { ...post, writerGrade: post.writerGrade || '🍒' };
            try {
              const userDoc = await getDoc(firestoreDoc(db, 'users', post.writerUid));
              if (!userDoc.exists()) return { ...post, writerGrade: post.writerGrade || '🍒' };
              return { ...post, writerGrade: userDoc.data().grade || post.writerGrade || '🍒' };
            } catch {
              return { ...post, writerGrade: post.writerGrade || '🍒' };
            }
          })
        );
        setPosts(withGrades);
      } catch (error) {
        console.error('밸런스 게시글 조회 실패:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        BALANCE_LIST_STATE_KEY,
        JSON.stringify({
          lastViewedPostId,
          scrollY: window.scrollY
        })
      );
    } catch {
      // ignore
    }
  }, [lastViewedPostId]);

  useEffect(() => {
    if (loading || anchorRestoredRef.current) return;
    if (shouldRestoreOnMountRef.current && lastViewedPostId) {
      const target = document.querySelector(`[data-post-id="${lastViewedPostId}"]`) as HTMLElement | null;
      if (target) {
        requestAnimationFrame(() => {
          target.scrollIntoView({ block: 'center', behavior: 'auto' });
          anchorRestoredRef.current = true;
        });
        return;
      }
    }
    try {
      const raw = sessionStorage.getItem(BALANCE_LIST_STATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { scrollY?: number };
      if (typeof parsed.scrollY === 'number' && parsed.scrollY > 0) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: parsed.scrollY || 0, behavior: 'auto' });
          anchorRestoredRef.current = true;
        });
      }
    } catch {
      // ignore
    }
  }, [loading, posts.length, lastViewedPostId]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ko-KR');
  };

  const handleWrite = () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    navigate('/balance/write');
  };

  const handlePostClick = (postId: string) => {
    try {
      setLastViewedPostId(postId);
      sessionStorage.setItem(
        BALANCE_LIST_STATE_KEY,
        JSON.stringify({
          lastViewedPostId: postId,
          scrollY: window.scrollY
        })
      );
    } catch {
      // ignore
    }
    navigate(`/balance/${postId}`);
  };

  return (
    <div className="board-container">
      <div className="board-controls">
        <div className="search-container">
          <h1 className="board-title">
            <Scale size={28} />
            밸런스게시판
          </h1>
        </div>
        <div className="action-buttons">
          <button className="write-button" onClick={handleWrite}>
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
            <Scale size={48} />
            <p>아직 밸런스 질문이 없습니다.</p>
          </div>
        ) : (
          posts.map((post) => {
            const totalVotes = (post.votesA || 0) + (post.votesB || 0);
            const ratioA = totalVotes > 0 ? Math.round(((post.votesA || 0) / totalVotes) * 100) : 0;
            const ratioB = totalVotes > 0 ? 100 - ratioA : 0;
            return (
              <article
                key={post.id}
                className="post-item"
                data-post-id={post.id}
                onClick={() => handlePostClick(post.id)}
              >
                <div className="post-header">
                  <div className="post-main-info balance-post-main-info">
                    <div className="post-category-title">
                      <span className="post-category category-badge">밸런스</span>
                      <h2 className="post-title" style={{ fontSize: '1.2rem' }}>{post.title}</h2>
                    </div>
                    {post.content && post.content.trim() && (
                      <div className="post-content-preview">{post.content}</div>
                    )}
                    <div className="balance-question-line">
                      {post.balanceOptionA} <span className="balance-question-vs">VS</span> {post.balanceOptionB}
                    </div>
                    <section className="balance-live-vote">
                      <p className="balance-live-vote-title">실시간 투표 현황</p>
                      <div className="balance-vote-row">
                        <div className="balance-vote-labels">
                          <span>{post.balanceOptionA}</span>
                          <span>{post.votesA || 0}표 ({ratioA}%)</span>
                        </div>
                        <div className="balance-vote-bar">
                          <div className="balance-vote-fill balance-vote-fill-a" style={{ width: `${ratioA}%` }} />
                        </div>
                      </div>
                      <div className="balance-vote-row">
                        <div className="balance-vote-labels">
                          <span>{post.balanceOptionB}</span>
                          <span>{post.votesB || 0}표 ({ratioB}%)</span>
                        </div>
                        <div className="balance-vote-bar">
                          <div className="balance-vote-fill balance-vote-fill-b" style={{ width: `${ratioB}%` }} />
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
                <div className="post-footer balance-post-footer">
                  <span className="balance-post-author">
                    <span className="balance-post-author-grade">{getGradeEmoji(post.writerGrade)}</span>
                    <span className="balance-post-author-name">{post.writerNickname || '익명'}</span>
                  </span>
                  <span className="balance-meta-item">투표 {totalVotes}</span>
                  <span className="balance-meta-item">댓글 {post.commentCount || 0}</span>
                  <span className="balance-views-date">
                    조회 {post.views || 0}
                    <span className="balance-views-date-divider">•</span>
                    {formatDate(post.createdAt)}
                  </span>
                </div>
              </article>
            );
          })
        )}
      </div>

      <button className="fab-button" onClick={handleWrite}>
        <Plus size={24} />
      </button>
    </div>
  );
};

export default BalancePostList;
