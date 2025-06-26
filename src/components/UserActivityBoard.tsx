import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

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

const UserActivityBoard: React.FC = () => {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // 1. 모든 유저
      const usersSnap = await getDocs(collection(db, 'users'));
      const users: User[] = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as User[];
      // 2. 모든 게시글
      const postsSnap = await getDocs(collection(db, 'posts'));
      const postCounts: Record<string, number> = {};
      // 좋아요 집계용
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
      commentsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.writerUid) {
          commentCounts[data.writerUid] = (commentCounts[data.writerUid] || 0) + 1;
        }
      });
      // 4. 합산
      const activityRows: ActivityRow[] = users.map(user => {
        const postCount = postCounts[user.uid] || 0;
        const commentCount = commentCounts[user.uid] || 0;
        const likeGiven = likeGivenCounts[user.uid] || 0;
        return {
          uid: user.uid,
          nickname: user.nickname,
          email: user.email,
          postCount,
          commentCount,
          likeGiven,
          score: postCount * 2 + commentCount + likeGiven,
          grade: user.grade,
          role: user.role,
        };
      });
      // 5. 점수순 정렬
      activityRows.sort((a, b) => b.score - a.score);
      setRows(activityRows);
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#fff',
      borderRadius: 20,
      boxShadow: '0 8px 32px rgba(229, 218, 245, 0.3)',
      padding: 32,
      margin: 0,
      overflow: 'hidden'
    }}>
      <div style={{
        marginBottom: 24,
        flexShrink: 0
      }}>
        <h2 style={{
          color: '#8A55CC',
          fontWeight: 700,
          fontSize: 24,
          margin: 0,
          textAlign: 'center'
        }}>
          유저 활동 점수판
        </h2>
        <p style={{
          color: '#6B7280',
          fontSize: 14,
          margin: '8px 0 0 0',
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
          color: '#8A55CC',
          fontWeight: 600,
          fontSize: 16
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <div style={{
              width: 20,
              height: 20,
              border: '2px solid #E5DAF5',
              borderTop: '2px solid #8A55CC',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            데이터를 불러오는 중...
          </div>
        </div>
      ) : (
        <div style={{
          flex: 1,
          overflow: 'hidden',
          border: '1px solid #E5E7EB',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* 테이블 헤더 - 고정 */}
          <div style={{
            background: '#F8F6FC',
            borderBottom: '2px solid #E5DAF5',
            flexShrink: 0
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 14
            }}>
              <thead>
                <tr>
                  <th style={{
                    padding: '12px 8px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#374151',
                    width: '20%'
                  }}>닉네임</th>
                  <th style={{
                    padding: '12px 8px',
                    textAlign: 'center',
                    fontWeight: 600,
                    color: '#374151',
                    width: '10%'
                  }}>등급</th>
                  <th style={{
                    padding: '12px 8px',
                    textAlign: 'center',
                    fontWeight: 600,
                    color: '#374151',
                    width: '15%'
                  }}>역할</th>
                  <th style={{
                    padding: '12px 8px',
                    textAlign: 'center',
                    fontWeight: 600,
                    color: '#374151',
                    width: '10%'
                  }}>게시글</th>
                  <th style={{
                    padding: '12px 8px',
                    textAlign: 'center',
                    fontWeight: 600,
                    color: '#374151',
                    width: '10%'
                  }}>댓글</th>
                  <th style={{
                    padding: '12px 8px',
                    textAlign: 'center',
                    fontWeight: 600,
                    color: '#374151',
                    width: '10%'
                  }}>좋아요</th>
                  <th style={{
                    padding: '12px 8px',
                    textAlign: 'center',
                    fontWeight: 600,
                    color: '#374151',
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
            scrollbarColor: '#8A55CC transparent'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 14
            }}>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.uid} style={{
                    background: index % 2 === 0 ? '#FFFFFF' : '#FEFEFF',
                    transition: 'background-color 0.2s ease'
                  }}>
                    <td style={{
                      padding: '12px 8px',
                      borderBottom: '1px solid #F3F4F6',
                      width: '20%',
                      fontWeight: 500,
                      color: '#1F2937'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}>
                        <div style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: index < 3 
                            ? (index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32')
                            : '#E5E7EB',
                          color: index < 3 ? 'white' : '#6B7280',
                          fontSize: 11,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {index + 1}
                        </div>
                        {row.nickname}
                      </div>
                    </td>
                    <td style={{
                      padding: '12px 8px',
                      borderBottom: '1px solid #F3F4F6',
                      textAlign: 'center',
                      width: '10%',
                      fontSize: 16
                    }}>{row.grade || '-'}</td>
                    <td style={{
                      padding: '12px 8px',
                      borderBottom: '1px solid #F3F4F6',
                      textAlign: 'center',
                      width: '15%'
                    }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500,
                        background: 
                          row.role === '리더' ? '#FEF3C7' :
                          row.role === '운영진' ? '#EDE9FE' :
                          row.role === '부운영진' ? '#DBEAFE' :
                          '#F3F4F6',
                        color:
                          row.role === '리더' ? '#D97706' :
                          row.role === '운영진' ? '#8A55CC' :
                          row.role === '부운영진' ? '#2563EB' :
                          '#6B7280'
                      }}>
                        {row.role || '일반'}
                      </span>
                    </td>
                    <td style={{
                      padding: '12px 8px',
                      borderBottom: '1px solid #F3F4F6',
                      textAlign: 'center',
                      width: '10%',
                      fontWeight: 500,
                      color: '#374151'
                    }}>{row.postCount}</td>
                    <td style={{
                      padding: '12px 8px',
                      borderBottom: '1px solid #F3F4F6',
                      textAlign: 'center',
                      width: '10%',
                      fontWeight: 500,
                      color: '#374151'
                    }}>{row.commentCount}</td>
                    <td style={{
                      padding: '12px 8px',
                      borderBottom: '1px solid #F3F4F6',
                      textAlign: 'center',
                      width: '10%',
                      fontWeight: 500,
                      color: '#374151'
                    }}>{row.likeGiven}</td>
                    <td style={{
                      padding: '12px 8px',
                      borderBottom: '1px solid #F3F4F6',
                      textAlign: 'center',
                      width: '15%',
                      fontWeight: 700,
                      color: '#8A55CC',
                      fontSize: 16
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
                background: #8A55CC;
                border-radius: 3px;
              }
              div::-webkit-scrollbar-thumb:hover {
                background: #6B46A3;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}
          </style>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6B7280',
          fontSize: 16
        }}>
          활동 데이터가 없습니다.
        </div>
      )}
    </div>
  );
};

export default UserActivityBoard; 