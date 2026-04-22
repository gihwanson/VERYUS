import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Activity,
  Users,
  MessageSquare,
  Heart,
  Award,
  RefreshCw,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
} from 'lucide-react';
import './UserActivityBoard.css';

interface User {
  uid: string;
  nickname: string;
  email: string;
  grade?: string;
  role?: string;
}

interface ActivityRow {
  uid: string;
  nickname: string;
  email: string;
  postCount: number;
  commentCount: number;
  likeGiven: number;
  score: number;
  grade?: string;
  role?: string;
}

type SortKey = 'score' | 'posts' | 'comments' | 'likes';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'score', label: '종합 점수' },
  { key: 'posts', label: '게시글' },
  { key: 'comments', label: '댓글' },
  { key: 'likes', label: '좋아요' },
];

function rolePillClass(role?: string): string {
  if (role === '리더') return 'uab-role-pill uab-role-pill--leader';
  if (role === '운영진') return 'uab-role-pill uab-role-pill--admin';
  if (role === '부운영진') return 'uab-role-pill uab-role-pill--sub';
  return 'uab-role-pill uab-role-pill--member';
}

function rankClass(index: number): string {
  if (index === 0) return 'uab-rank uab-rank--gold';
  if (index === 1) return 'uab-rank uab-rank--silver';
  if (index === 2) return 'uab-rank uab-rank--bronze';
  return 'uab-rank uab-rank--muted';
}

const UserActivityBoard: React.FC = React.memo(() => {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let aValue: number;
      let bValue: number;

      switch (sortBy) {
        case 'score':
          aValue = a.score;
          bValue = b.score;
          break;
        case 'posts':
          aValue = a.postCount;
          bValue = b.postCount;
          break;
        case 'comments':
          aValue = a.commentCount;
          bValue = b.commentCount;
          break;
        case 'likes':
          aValue = a.likeGiven;
          bValue = b.likeGiven;
          break;
        default:
          return 0;
      }

      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });
  }, [rows, sortBy, sortOrder]);

  const stats = useMemo(() => {
    if (rows.length === 0) return null;

    const totalPosts = rows.reduce((sum, row) => sum + row.postCount, 0);
    const totalComments = rows.reduce((sum, row) => sum + row.commentCount, 0);
    const totalLikes = rows.reduce((sum, row) => sum + row.likeGiven, 0);
    const avgScore = Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length);

    return { totalPosts, totalComments, totalLikes, avgScore, memberCount: rows.length };
  }, [rows]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [usersSnap, postsSnap, commentsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'posts')),
        getDocs(collection(db, 'comments'))
      ]);
      const users: User[] = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as User[];
      const postCounts: Record<string, number> = {};
      const likeGivenCounts: Record<string, number> = {};

      postsSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.writerUid) {
          postCounts[data.writerUid] = (postCounts[data.writerUid] || 0) + 1;
        }
        if (Array.isArray(data.likes) && data.writerUid) {
          data.likes.forEach((uid: string) => {
            if (uid !== data.writerUid) {
              likeGivenCounts[uid] = (likeGivenCounts[uid] || 0) + 1;
            }
          });
        }
      });

      const commentCounts: Record<string, number> = {};
      const commentLikeGivenCounts: Record<string, number> = {};

      commentsSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.writerUid) {
          commentCounts[data.writerUid] = (commentCounts[data.writerUid] || 0) + 1;
        }
        if (Array.isArray(data.likedBy) && data.writerUid) {
          data.likedBy.forEach((uid: string) => {
            if (uid !== data.writerUid) {
              commentLikeGivenCounts[uid] = (commentLikeGivenCounts[uid] || 0) + 1;
            }
          });
        }
      });

      const activityRows: ActivityRow[] = users.map(user => {
        const postCount = postCounts[user.uid] || 0;
        const commentCount = commentCounts[user.uid] || 0;
        const postLikeGiven = likeGivenCounts[user.uid] || 0;
        const commentLikeGiven = commentLikeGivenCounts[user.uid] || 0;
        const totalLikeGiven = postLikeGiven + commentLikeGiven;
        return {
          uid: user.uid,
          nickname: user.nickname,
          email: user.email,
          postCount,
          commentCount,
          likeGiven: totalLikeGiven,
          score: postCount * 2 + commentCount + totalLikeGiven,
          grade: user.grade,
          role: user.role,
        };
      });

      setRows(activityRows);
    } catch (e) {
      console.error('활동 데이터 가져오기 실패:', e);
      setError('활동 데이터를 가져오는데 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSortOrder = useCallback(() => {
    setSortOrder(o => (o === 'desc' ? 'asc' : 'desc'));
  }, []);

  if (loading) {
    return (
      <div className="uab-root">
        <div className="uab-loading">
          <div className="uab-loading-spinner" aria-hidden />
          <div className="uab-loading-text">활동 데이터를 불러오는 중…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="uab-root">
        <div className="uab-error">
          <div className="uab-error-icon" aria-hidden>
            ⚠️
          </div>
          <p className="uab-error-msg">{error}</p>
          <button type="button" className="uab-retry-btn" onClick={fetchData}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="uab-root">
      <header className="uab-header">
        <h2 className="uab-title">유저 활동 점수판</h2>
        <p className="uab-desc">
          게시글 2점 · 댓글 1점 · 타인 게시글·댓글에 준 좋아요 1점으로 합산합니다. 통합 게시글·댓글 문서 기준입니다.
        </p>
      </header>

      {stats && (
        <div className="uab-stats">
          <div className="uab-stat-card">
            <div className="uab-stat-icon" aria-hidden>
              <Users size={20} />
            </div>
            <div className="uab-stat-body">
              <div className="uab-stat-label">회원 수</div>
              <div className="uab-stat-value">{stats.memberCount}</div>
            </div>
          </div>
          <div className="uab-stat-card">
            <div className="uab-stat-icon" aria-hidden>
              <Award size={20} />
            </div>
            <div className="uab-stat-body">
              <div className="uab-stat-label">평균 점수</div>
              <div className="uab-stat-value">{stats.avgScore}</div>
            </div>
          </div>
          <div className="uab-stat-card">
            <div className="uab-stat-icon" aria-hidden>
              <Activity size={20} />
            </div>
            <div className="uab-stat-body">
              <div className="uab-stat-label">게시글 합계</div>
              <div className="uab-stat-value">{stats.totalPosts}</div>
            </div>
          </div>
          <div className="uab-stat-card">
            <div className="uab-stat-icon" aria-hidden>
              <MessageSquare size={20} />
            </div>
            <div className="uab-stat-body">
              <div className="uab-stat-label">댓글 합계</div>
              <div className="uab-stat-value">{stats.totalComments}</div>
            </div>
          </div>
          <div className="uab-stat-card">
            <div className="uab-stat-icon" aria-hidden>
              <Heart size={20} />
            </div>
            <div className="uab-stat-body">
              <div className="uab-stat-label">좋아요 합계</div>
              <div className="uab-stat-value">{stats.totalLikes}</div>
            </div>
          </div>
        </div>
      )}

      <div className="uab-toolbar">
        <span className="uab-toolbar-label">정렬</span>
        {SORT_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`uab-sort-pill ${sortBy === key ? 'active' : ''}`}
            onClick={() => setSortBy(key)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="uab-order-btn" onClick={toggleSortOrder}>
          {sortOrder === 'desc' ? (
            <>
              <ArrowDownWideNarrow size={16} aria-hidden />
              높은 순
            </>
          ) : (
            <>
              <ArrowUpWideNarrow size={16} aria-hidden />
              낮은 순
            </>
          )}
        </button>
        <button type="button" className="uab-refresh" onClick={fetchData} title="새로고침">
          <RefreshCw size={16} aria-hidden />
          새로고침
        </button>
      </div>

      {sortedRows.length === 0 ? (
        <div className="uab-empty">활동 데이터가 없습니다.</div>
      ) : isNarrow ? (
        <div className="uab-mobile-list">
          {sortedRows.map((row, index) => (
            <div
              key={row.uid}
              className={`uab-mobile-card ${index < 3 ? 'uab-mobile-card--top' : ''}`}
            >
              <div className="uab-mobile-row1">
                <span className={rankClass(index)}>{index + 1}</span>
                <span className="uab-nick-cell" style={{ gap: 0 }}>
                  {row.nickname}
                </span>
                {row.grade ? <span className="uab-grade-emoji">{row.grade}</span> : null}
                <span className={rolePillClass(row.role)}>{row.role || '일반'}</span>
                <span className="uab-mobile-score">{row.score}점</span>
              </div>
              <div className="uab-mobile-row2">
                <span>
                  게시글 <strong className="uab-num-mono">{row.postCount}</strong>
                </span>
                <span>
                  댓글 <strong className="uab-num-mono">{row.commentCount}</strong>
                </span>
                <span>
                  좋아요 <strong className="uab-num-mono">{row.likeGiven}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="uab-table-shell">
          <div className="uab-table-head">
            <table className="uab-table">
              <thead>
                <tr>
                  <th style={{ width: '26%' }}>닉네임</th>
                  <th className="uab-num" style={{ width: '10%' }}>
                    등급
                  </th>
                  <th className="uab-num" style={{ width: '14%' }}>
                    역할
                  </th>
                  <th className="uab-num" style={{ width: '10%' }}>
                    게시글
                  </th>
                  <th className="uab-num" style={{ width: '10%' }}>
                    댓글
                  </th>
                  <th className="uab-num" style={{ width: '10%' }}>
                    좋아요
                  </th>
                  <th className="uab-num" style={{ width: '12%' }}>
                    활동점수
                  </th>
                </tr>
              </thead>
            </table>
          </div>
          <div className="uab-table-scroll">
            <table className="uab-table">
              <tbody>
                {sortedRows.map((row, index) => (
                  <tr key={row.uid}>
                    <td>
                      <div className="uab-nick-cell">
                        <span className={rankClass(index)}>{index + 1}</span>
                        {row.nickname}
                      </div>
                    </td>
                    <td className="uab-td-center uab-grade-emoji">{row.grade || '—'}</td>
                    <td className="uab-td-center">
                      <span className={rolePillClass(row.role)}>{row.role || '일반'}</span>
                    </td>
                    <td className="uab-td-center uab-num-mono">{row.postCount}</td>
                    <td className="uab-td-center uab-num-mono">{row.commentCount}</td>
                    <td className="uab-td-center uab-num-mono">{row.likeGiven}</td>
                    <td className="uab-score">{row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});

export default UserActivityBoard;
