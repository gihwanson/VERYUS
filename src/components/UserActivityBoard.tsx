import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Activity, TrendingUp, Users, MessageSquare, Heart, Award } from 'lucide-react';

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

const UserActivityBoard: React.FC = React.memo(() => {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'score' | 'posts' | 'comments' | 'likes'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  // 정렬된 데이터 메모이제이션
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let aValue: number, bValue: number;
      
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

  // 통계 계산 메모이제이션
  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    
    const totalPosts = rows.reduce((sum, row) => sum + row.postCount, 0);
    const totalComments = rows.reduce((sum, row) => sum + row.commentCount, 0);
    const totalLikes = rows.reduce((sum, row) => sum + row.likeGiven, 0);
    const avgScore = Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length);
    
    return { totalPosts, totalComments, totalLikes, avgScore };
  }, [rows]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 1. 모든 유저
      const usersSnap = await getDocs(collection(db, 'users'));
      const users: User[] = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as User[];
      
      // 2. 모든 게시글
      const postsSnap = await getDocs(collection(db, 'posts'));
      const postCounts: Record<string, number> = {};
      const likeGivenCounts: Record<string, number> = {};
      
      postsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.writerUid) {
          postCounts[data.writerUid] = (postCounts[data.writerUid] || 0) + 1;
        }
        // 좋아요: 본인 게시글 제외, likes 배열에 있는 uid별로 카운트
        if (Array.isArray(data.likes) && data.writerUid) {
          data.likes.forEach((uid: string) => {
            if (uid !== data.writerUid) {
              likeGivenCounts[uid] = (likeGivenCounts[uid] || 0) + 1;
            }
          });
        }
      });
      
      // 3. 모든 댓글
      const commentsSnap = await getDocs(collection(db, 'comments'));
      const commentCounts: Record<string, number> = {};
      const commentLikeGivenCounts: Record<string, number> = {};
      
      commentsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.writerUid) {
          commentCounts[data.writerUid] = (commentCounts[data.writerUid] || 0) + 1;
        }
        // 댓글 좋아요: 본인 댓글 제외, likedBy 배열에 있는 uid별로 카운트
        if (Array.isArray(data.likedBy) && data.writerUid) {
          data.likedBy.forEach((uid: string) => {
            if (uid !== data.writerUid) {
              commentLikeGivenCounts[uid] = (commentLikeGivenCounts[uid] || 0) + 1;
            }
          });
        }
      });
      
      // 4. 합산
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
    } catch (error) {
      console.error('활동 데이터 가져오기 실패:', error);
      setError('활동 데이터를 가져오는데 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRetry = useCallback(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        borderRadius: 'var(--border-radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: isMobile ? 'var(--spacing-4)' : 'var(--spacing-8)',
        margin: 0,
        overflow: 'hidden',
        border: '1px solid var(--gray-200)'
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--primary-600)',
          fontWeight: 600,
          fontSize: isMobile ? 'var(--font-size-sm)' : 'var(--font-size-base)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)'
          }}>
            <div style={{
              width: 20,
              height: 20,
              border: '2px solid var(--gray-200)',
              borderTop: '2px solid var(--primary-600)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            데이터를 불러오는 중...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        borderRadius: 'var(--border-radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: isMobile ? 'var(--spacing-4)' : 'var(--spacing-8)',
        margin: 0,
        overflow: 'hidden',
        border: '1px solid var(--gray-200)'
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--spacing-4)'
        }}>
          <div style={{ color: '#EF4444', fontSize: 48 }}>⚠️</div>
          <p style={{ color: 'var(--gray-600)', textAlign: 'center', margin: 0 }}>{error}</p>
          <button 
            onClick={handleRetry}
            style={{
              background: 'var(--primary-600)',
              color: 'white',
              border: 'none',
              padding: 'var(--spacing-2) var(--spacing-4)',
              borderRadius: 'var(--border-radius)',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface)',
      borderRadius: 'var(--border-radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      padding: isMobile ? 'var(--spacing-4)' : 'var(--spacing-8)',
      margin: 0,
      overflow: 'hidden',
      border: '1px solid var(--gray-200)'
    }}>
      <div style={{
        marginBottom: isMobile ? 'var(--spacing-4)' : 'var(--spacing-6)',
        flexShrink: 0
      }}>
        <h2 style={{
          color: 'var(--primary-600)',
          fontWeight: 700,
          fontSize: isMobile ? 'var(--font-size-lg)' : 'var(--font-size-2xl)',
          margin: 0,
          textAlign: 'center'
        }}>
          유저 활동 점수판
        </h2>
        <p style={{
          color: 'var(--gray-600)',
          fontSize: isMobile ? 'var(--font-size-sm)' : 'var(--font-size-base)',
          margin: isMobile ? 'var(--spacing-1) 0 0 0' : 'var(--spacing-2) 0 0 0',
          textAlign: 'center'
        }}>
          게시글 2점, 댓글 1점, 좋아요 1점으로 계산된 활동 점수입니다
        </p>
      </div>

      {loading ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--primary-600)',
          fontWeight: 600,
          fontSize: isMobile ? 'var(--font-size-sm)' : 'var(--font-size-base)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)'
          }}>
            <div style={{
              width: 20,
              height: 20,
              border: '2px solid var(--gray-200)',
              borderTop: '2px solid var(--primary-600)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            데이터를 불러오는 중...
          </div>
        </div>
      ) : (
        isMobile ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-3)',
            width: '100%'
          }}>
            {sortedRows.map((row, index) => (
              <div key={row.uid} style={{
                background: 'var(--gray-50)',
                border: '1px solid var(--gray-200)',
                borderRadius: 'var(--border-radius-md)',
                padding: 'var(--spacing-4)',
                marginBottom: 'var(--spacing-2)',
                boxShadow: index < 3 ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-2)',
                transition: 'all var(--transition-normal)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                  <div style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: index < 3 
                      ? (index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32')
                      : 'var(--gray-300)',
                    color: index < 3 ? 'white' : 'var(--gray-600)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 'var(--spacing-1)'
                  }}>{index + 1}</div>
                  <span style={{ fontWeight: 600, color: 'var(--gray-900)', fontSize: 'var(--font-size-sm)' }}>{row.nickname}</span>
                  <span style={{ fontSize: 'var(--font-size-base)' }}>{row.grade || '-'}</span>
                  <span style={{
                    padding: 'var(--spacing-1) var(--spacing-2)',
                    borderRadius: 'var(--border-radius)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 500,
                    background: row.role === '리더' ? 'var(--warning-100)' : row.role === '운영진' ? 'var(--primary-100)' : row.role === '부운영진' ? 'var(--success-100)' : 'var(--gray-100)',
                    color: row.role === '리더' ? 'var(--warning-700)' : row.role === '운영진' ? 'var(--primary-700)' : row.role === '부운영진' ? 'var(--success-700)' : 'var(--gray-600)',
                    marginLeft: 'var(--spacing-1)'
                  }}>{row.role || '일반'}</span>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)', color: 'var(--gray-700)', marginTop: 'var(--spacing-1)' }}>
                  <span>게시글 <b>{row.postCount}</b></span>
                  <span>댓글 <b>{row.commentCount}</b></span>
                  <span>좋아요 <b>{row.likeGiven}</b></span>
                  <span style={{ marginLeft: 'auto', color: 'var(--primary-600)', fontWeight: 700 }}>점수 {row.score}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div style={{
          flex: 1,
          overflow: 'hidden',
          border: '1px solid var(--gray-200)',
          borderRadius: 'var(--border-radius-md)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* 테이블 헤더 - 고정 */}
          <div style={{
            background: 'var(--gray-50)',
            borderBottom: '2px solid var(--gray-200)',
            flexShrink: 0
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--font-size-sm)'
            }}>
              <thead>
                <tr>
                  <th style={{
                    padding: 'var(--spacing-4) var(--spacing-3)',
                    textAlign: 'left',
                    fontWeight: 700,
                    color: 'var(--gray-700)',
                    width: '20%'
                  }}>닉네임</th>
                  <th style={{
                    padding: 'var(--spacing-4) var(--spacing-3)',
                    textAlign: 'center',
                    fontWeight: 700,
                    color: 'var(--gray-700)',
                    width: '10%'
                  }}>등급</th>
                  <th style={{
                    padding: 'var(--spacing-4) var(--spacing-3)',
                    textAlign: 'center',
                    fontWeight: 700,
                    color: 'var(--gray-700)',
                    width: '15%'
                  }}>역할</th>
                  <th style={{
                    padding: 'var(--spacing-4) var(--spacing-3)',
                    textAlign: 'center',
                    fontWeight: 700,
                    color: 'var(--gray-700)',
                    width: '10%'
                  }}>게시글</th>
                  <th style={{
                    padding: 'var(--spacing-4) var(--spacing-3)',
                    textAlign: 'center',
                    fontWeight: 700,
                    color: 'var(--gray-700)',
                    width: '10%'
                  }}>댓글</th>
                  <th style={{
                    padding: 'var(--spacing-4) var(--spacing-3)',
                    textAlign: 'center',
                    fontWeight: 700,
                    color: 'var(--gray-700)',
                    width: '10%'
                  }}>좋아요</th>
                  <th style={{
                    padding: 'var(--spacing-4) var(--spacing-3)',
                    textAlign: 'center',
                    fontWeight: 700,
                    color: 'var(--gray-700)',
                    width: '15%'
                  }}>활동점수</th>
                </tr>
              </thead>
            </table>
          </div>

          {/* 테이블 바디 - 스크롤 가능 */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--primary-600) transparent'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--font-size-sm)'
            }}>
              <tbody>
                {sortedRows.map((row, index) => (
                  <tr key={row.uid} style={{
                    background: index % 2 === 0 ? 'var(--surface)' : 'var(--gray-50)',
                    transition: 'background-color var(--transition-fast)',
                    borderBottom: '1px solid var(--gray-200)',
                    height: 56
                  }}>
                    <td style={{
                      padding: 'var(--spacing-4) var(--spacing-3)',
                      borderBottom: '1px solid var(--gray-200)',
                      width: '20%',
                      fontWeight: 600,
                      color: 'var(--gray-900)'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-2)'
                      }}>
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: index < 3 
                            ? (index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32')
                            : 'var(--gray-300)',
                          color: index < 3 ? 'white' : 'var(--gray-600)',
                          fontSize: 'var(--font-size-xs)',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>{index + 1}</div>
                        {row.nickname}
                      </div>
                    </td>
                    <td style={{
                      padding: 'var(--spacing-4) var(--spacing-3)',
                      borderBottom: '1px solid var(--gray-200)',
                      textAlign: 'center',
                      width: '10%',
                      fontSize: 'var(--font-size-lg)'
                    }}>{row.grade || '-'}</td>
                    <td style={{
                      padding: 'var(--spacing-4) var(--spacing-3)',
                      borderBottom: '1px solid var(--gray-200)',
                      textAlign: 'center',
                      width: '15%'
                    }}>
                      <span style={{
                        padding: 'var(--spacing-1) var(--spacing-2)',
                        borderRadius: 'var(--border-radius)',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 600,
                        background: row.role === '리더' ? 'var(--warning-100)' : row.role === '운영진' ? 'var(--primary-100)' : row.role === '부운영진' ? 'var(--success-100)' : 'var(--gray-100)',
                        color: row.role === '리더' ? 'var(--warning-700)' : row.role === '운영진' ? 'var(--primary-700)' : row.role === '부운영진' ? 'var(--success-700)' : 'var(--gray-600)'
                      }}>{row.role || '일반'}</span>
                    </td>
                    <td style={{
                      padding: 'var(--spacing-4) var(--spacing-3)',
                      borderBottom: '1px solid var(--gray-200)',
                      textAlign: 'center',
                      width: '10%',
                      fontWeight: 600,
                      color: 'var(--gray-700)'
                    }}>{row.postCount}</td>
                    <td style={{
                      padding: 'var(--spacing-4) var(--spacing-3)',
                      borderBottom: '1px solid var(--gray-200)',
                      textAlign: 'center',
                      width: '10%',
                      fontWeight: 600,
                      color: 'var(--gray-700)'
                    }}>{row.commentCount}</td>
                    <td style={{
                      padding: 'var(--spacing-4) var(--spacing-3)',
                      borderBottom: '1px solid var(--gray-200)',
                      textAlign: 'center',
                      width: '10%',
                      fontWeight: 600,
                      color: 'var(--gray-700)'
                    }}>{row.likeGiven}</td>
                    <td style={{
                      padding: 'var(--spacing-4) var(--spacing-3)',
                      borderBottom: '1px solid var(--gray-200)',
                      textAlign: 'center',
                      width: '15%',
                      fontWeight: 800,
                      color: 'var(--primary-600)',
                      fontSize: 'var(--font-size-lg)'
                    }}>
                      {row.score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 스크롤바 스타일 */}
          <style>
            {`
              div::-webkit-scrollbar {
                width: 6px;
              }
              div::-webkit-scrollbar-track {
                background: transparent;
              }
              div::-webkit-scrollbar-thumb {
                background: var(--primary-600);
                border-radius: 3px;
              }
              div::-webkit-scrollbar-thumb:hover {
                background: var(--primary-700);
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}
          </style>
        </div>
        )
      )}

      {!loading && sortedRows.length === 0 && (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--gray-500)',
          fontSize: isMobile ? 'var(--font-size-sm)' : 'var(--font-size-base)'
        }}>
          활동 데이터가 없습니다.
        </div>
      )}
    </div>
  );
});

export default UserActivityBoard; 