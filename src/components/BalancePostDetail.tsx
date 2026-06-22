import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { arrayRemove, arrayUnion, deleteDoc, deleteField, doc, increment, onSnapshot, updateDoc } from 'firebase/firestore';
import { AlertTriangle, ArrowLeft, Clock, Eye, Loader, Scale, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { getPostListGradeSpanProps } from '../utils/gradeDisplay';
import { getPublicRoleBadge } from '../utils/publicRoleBadge';
import CommentSection from './CommentSection';

interface Post {
  id: string;
  title: string;
  content?: string;
  writerNickname: string;
  writerUid: string;
  writerGrade?: string;
  writerRole?: string;
  createdAt: any;
  views?: number;
  balanceOptionA: string;
  balanceOptionB: string;
  votesA?: number;
  votesB?: number;
  votedUsers?: string[];
  votedMap?: Record<string, 'A' | 'B'>;
  votedUserNicknames?: Record<string, string>;
  isAnonymousVote?: boolean;
}

const BalancePostDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [showAdminVoterReveal, setShowAdminVoterReveal] = useState(false);
  const user = useMemo(() => {
    const userStr = localStorage.getItem('veryus_user');
    return userStr ? JSON.parse(userStr) : null;
  }, []);

  useEffect(() => {
    if (!id) {
      navigate('/balance', { state: { preserveScroll: true } });
      return;
    }

    const incrementViews = async () => {
      try {
        await updateDoc(doc(db, 'posts', id), { views: increment(1) });
      } catch (error) {
        console.error('조회수 증가 실패:', error);
      }
    };
    incrementViews();

    const unsubscribe = onSnapshot(doc(db, 'posts', id), (snap) => {
      if (!snap.exists()) {
        setPost(null);
        setLoading(false);
        return;
      }
      const data = snap.data() as any;
      const { writerGrade, writerRole, writerPosition, ...rest } = data;
      setPost((prev) => {
        const p = (prev || {}) as any;
        return {
          ...p,
          ...rest,
          id: snap.id,
          writerGrade: p.writerGrade ?? writerGrade,
          writerRole: p.writerRole ?? writerRole,
          writerPosition: p.writerPosition ?? writerPosition,
        };
      });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id, navigate]);

  useEffect(() => {
    if (!post?.writerUid) return;

    const unsubscribe = onSnapshot(doc(db, 'users', post.writerUid), (userSnap) => {
      if (!userSnap.exists()) return;
      const userData = userSnap.data() as { grade?: string; role?: string };
      setPost((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          writerGrade: userData.grade || prev.writerGrade,
          writerRole: userData.role || prev.writerRole
        };
      });
    });

    return () => unsubscribe();
  }, [post?.writerUid]);

  useEffect(() => {
    setShowAdminVoterReveal(false);
  }, [post?.id]);

  const myVote = user?.uid && post?.votedMap ? post.votedMap[user.uid] : undefined;
  const totalVotes = (post?.votesA || 0) + (post?.votesB || 0);
  const ratioA = totalVotes > 0 ? Math.round(((post?.votesA || 0) / totalVotes) * 100) : 0;
  const ratioB = totalVotes > 0 ? 100 - ratioA : 0;
  const isAnonymousVote = post?.isAnonymousVote !== false;
  const canViewAnonymousVoters = user?.nickname === '너래';

  const voteEntries = Object.entries(post?.votedMap || {});
  const optionAVoters = voteEntries
    .filter(([, choice]) => choice === 'A')
    .map(([uid]) => post?.votedUserNicknames?.[uid] || '알 수 없음');
  const optionBVoters = voteEntries
    .filter(([, choice]) => choice === 'B')
    .map(([uid]) => post?.votedUserNicknames?.[uid] || '알 수 없음');

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ko-KR');
  };

  const formatRelativeDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 60) return `${Math.max(1, diffMinutes)}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 30) return `${diffDays}일 전`;
    return formatDate(timestamp);
  };

  const handleVote = async (choice: 'A' | 'B') => {
    if (!user || !post) {
      alert('로그인이 필요합니다.');
      return;
    }
    try {
      setVoting(true);

      if (!myVote) {
        await updateDoc(doc(db, 'posts', post.id), {
          votedUsers: arrayUnion(user.uid),
          [`votedMap.${user.uid}`]: choice,
          [`votedUserNicknames.${user.uid}`]: user.nickname || '익명',
          ...(choice === 'A' ? { votesA: increment(1) } : { votesB: increment(1) })
        });
        return;
      }

      if (myVote === choice) {
        await updateDoc(doc(db, 'posts', post.id), {
          votedUsers: arrayRemove(user.uid),
          [`votedMap.${user.uid}`]: deleteField(),
          [`votedUserNicknames.${user.uid}`]: deleteField(),
          ...(choice === 'A' ? { votesA: increment(-1) } : { votesB: increment(-1) })
        });
        return;
      }

      await updateDoc(doc(db, 'posts', post.id), {
        votedUsers: arrayUnion(user.uid),
        [`votedMap.${user.uid}`]: choice,
        [`votedUserNicknames.${user.uid}`]: user.nickname || '익명',
        ...(myVote === 'A' ? { votesA: increment(-1) } : { votesB: increment(-1) }),
        ...(choice === 'A' ? { votesA: increment(1) } : { votesB: increment(1) })
      });
    } catch (error) {
      console.error('투표 실패:', error);
      alert('투표 처리 중 오류가 발생했습니다.');
    } finally {
      setVoting(false);
    }
  };

  const handleDelete = async () => {
    if (!post || !user) return;
    const isOwner = user.uid === post.writerUid;
    const isAdmin = user.nickname === '너래' || user.role === '리더';
    if (!isOwner && !isAdmin) {
      alert('삭제 권한이 없습니다.');
      return;
    }
    if (!window.confirm('이 밸런스 글을 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.')) return;
    await deleteDoc(doc(db, 'posts', post.id));
    navigate('/balance', { state: { preserveScroll: true } });
  };

  if (loading) {
    return (
      <div className="board-container">
        <div className="loading-container"><Loader className="loading-spinner" />로딩 중...</div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="board-container">
        <div className="error-container">
          <AlertTriangle size={44} />
          <h3>게시글을 찾을 수 없습니다.</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="post-detail-container">
      <div className="post-navigation glassmorphism">
        <button className="back-button glassmorphism" onClick={() => navigate('/balance', { state: { preserveScroll: true } })}>
          <ArrowLeft size={20} />
          목록으로
        </button>
      </div>

      <article className="post-detail">
        <div className="post-detail-header">
          <h1 className="post-detail-title">{post.title}</h1>
          <div className="post-detail-meta">
            <div className="post-detail-author balance-post-detail-author">
              <div className="author-section">
                <span className="author-info balance-static-author">
                  <span {...getPostListGradeSpanProps(post.writerGrade)} />
                  {post.writerNickname}
                </span>
                <span className={`role-badge ${getPublicRoleBadge(post.writerRole)}`}>
                  {getPublicRoleBadge(post.writerRole)}
                </span>
              </div>
              <div className="post-detail-info balance-post-detail-info">
                <span className="post-detail-date">
                  <Clock size={16} />
                  {formatRelativeDate(post.createdAt)}
                </span>
                <span className="post-detail-views">
                  <Scale size={16} />
                  투표 {totalVotes}
                </span>
                <span className="post-detail-views">
                  <Eye size={16} />
                  조회 {post.views || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {post.content && post.content.trim() && (
          <div className="post-detail-content">
            {post.content.split('\n').map((line, idx) => <p key={idx}>{line}</p>)}
          </div>
        )}

        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <button
            className={`action-button ${myVote === 'A' ? 'liked' : ''}`}
            disabled={voting}
            onClick={() => handleVote('A')}
            style={{ justifyContent: 'space-between' }}
          >
            <span>{post.balanceOptionA}</span>
            <span>{post.votesA || 0}표 ({ratioA}%)</span>
          </button>
          <button
            className={`action-button ${myVote === 'B' ? 'liked' : ''}`}
            disabled={voting}
            onClick={() => handleVote('B')}
            style={{ justifyContent: 'space-between' }}
          >
            <span>{post.balanceOptionB}</span>
            <span>{post.votesB || 0}표 ({ratioB}%)</span>
          </button>
          {myVote ? (
            <div style={{ color: '#8A55CC', fontWeight: 700 }}>
              내 선택: {myVote === 'A' ? post.balanceOptionA : post.balanceOptionB} (다시 누르면 취소)
            </div>
          ) : (
            <div style={{ color: '#ffffff', fontWeight: 600, opacity: 0.9 }}>
              원하는 항목을 눌러 투표하세요.
            </div>
          )}
          {isAnonymousVote && !canViewAnonymousVoters ? (
            <div className="balance-voter-info-note">이 게시글은 익명 투표로 진행됩니다.</div>
          ) : isAnonymousVote && canViewAnonymousVoters && !showAdminVoterReveal ? (
            <button
              className="action-button"
              type="button"
              onClick={() => setShowAdminVoterReveal(true)}
              style={{ justifyContent: 'center' }}
            >
              관리자 보기
            </button>
          ) : (
            <div className="balance-voter-reveal">
              <h3 className="balance-voter-reveal-title">
                {isAnonymousVote ? '투표자 공개 (관리자 보기)' : '투표자 공개'}
              </h3>
              {isAnonymousVote && canViewAnonymousVoters && (
                <div style={{ marginBottom: 10 }}>
                  <button
                    className="action-button"
                    type="button"
                    onClick={() => setShowAdminVoterReveal(false)}
                    style={{ padding: '0.4rem 0.8rem' }}
                  >
                    숨기기
                  </button>
                </div>
              )}
              <div className="balance-voter-columns">
                <div className="balance-voter-column">
                  <div className="balance-voter-option-title">{post.balanceOptionA}</div>
                  {optionAVoters.length > 0 ? (
                    <ul className="balance-voter-list">
                      {optionAVoters.map((nickname, idx) => (
                        <li key={`a-voter-${idx}`}>{nickname}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="balance-voter-empty">아직 투표자가 없습니다.</p>
                  )}
                </div>
                <div className="balance-voter-column">
                  <div className="balance-voter-option-title">{post.balanceOptionB}</div>
                  {optionBVoters.length > 0 ? (
                    <ul className="balance-voter-list">
                      {optionBVoters.map((nickname, idx) => (
                        <li key={`b-voter-${idx}`}>{nickname}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="balance-voter-empty">아직 투표자가 없습니다.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="post-detail-footer">
          <div className="post-stats">
            <button className="message-btn">
              <Scale size={18} /> 밸런스 게임
            </button>
            {(user?.uid === post.writerUid || user?.nickname === '너래' || user?.role === '리더') && (
              <button className="action-button" onClick={handleDelete}>
                <Trash2 size={16} /> 삭제
              </button>
            )}
          </div>
        </div>
      </article>

      <div className="comment-section-container">
        <CommentSection postId={post.id} user={user} post={{ id: post.id, title: post.title, writerUid: post.writerUid, writerNickname: post.writerNickname }} />
      </div>
    </div>
  );
};

export default BalancePostDetail;
