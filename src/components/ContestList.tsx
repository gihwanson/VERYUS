import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, setDoc, doc as firestoreDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Trophy, Plus } from 'lucide-react';

interface Contest {
  id: string;
  title: string;
  type: '정규등급전' | '세미등급전' | '경연';
  deadline: any;
  createdBy: string;
  ended?: boolean;
}

const ContestList: React.FC = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && ['리더', '운영진', '부운영진'].includes(user.role);

  useEffect(() => {
    const q = query(collection(db, 'contests'), orderBy('deadline', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setContests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Contest[]);
    });
    return () => unsub();
  }, []);

  const handleParticipate = async (contest: any) => {
    if (!user) return navigate('/login');
    
    // 해당 콘테스트의 참가자 목록을 확인
    try {
      const participantsSnap = await getDocs(collection(db, 'contests', contest.id, 'participants'));
      const participants = participantsSnap.docs.map(doc => doc.data());
      
      // 현재 로그인한 사용자의 닉네임이 참가자 목록에 있는지 확인
      const isParticipant = participants.some(p => 
        p.nickname && user.nickname && 
        p.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim()
      );
      
      if (isParticipant) {
        // 참가자 목록에 있으면 바로 참여 페이지로 이동
        navigate(`/contests/${contest.id}/participate`);
      } else {
        // 참가자 목록에 없으면 안내문구 표시
        alert('현재는 직접 참가가 불가능합니다. 운영진에게 문의해 주세요.');
      }
    } catch (error) {
      console.error('참가자 목록 확인 중 오류:', error);
      alert('참가자 목록을 확인하는 중 오류가 발생했습니다.');
    }
  };

  const handleEndContest = async (contest: any) => {
    if (!window.confirm('정말로 이 콘테스트를 종료하시겠습니까? 종료 후에는 누구도 참여할 수 없습니다.')) return;
    await updateDoc(firestoreDoc(db, 'contests', contest.id), { ended: true });
    alert('콘테스트가 종료되었습니다.');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      backgroundAttachment: 'fixed',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 배경 패턴 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `
          radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 40% 80%, rgba(120, 119, 198, 0.2) 0%, transparent 50%)
        `,
        pointerEvents: 'none'
      }} />
      
      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: '20px',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        {/* 헤더 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '20px',
          marginBottom: '20px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h2 style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12, 
            color: 'white', 
            fontWeight: 700, 
            fontSize: 28, 
            margin: 0,
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
          }}>
            🏆 콘테스트
          </h2>
          <button
            style={{ 
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              color: 'white', 
              borderRadius: '12px', 
              padding: '12px 24px', 
              fontWeight: 600, 
              fontSize: 16, 
              border: '1px solid rgba(255, 255, 255, 0.3)', 
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
            }}
            onClick={() => navigate('/')}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            🏠 메인보드로
          </button>
        </div>

        {/* 콘테스트 생성 버튼 */}
        {isAdmin && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(15px)',
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '20px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            textAlign: 'center'
          }}>
            <button 
              style={{ 
                background: 'rgba(34, 197, 94, 0.8)',
                backdropFilter: 'blur(10px)',
                color: 'white', 
                borderRadius: '12px', 
                padding: '12px 24px', 
                fontWeight: 600, 
                fontSize: 16, 
                border: '1px solid rgba(255, 255, 255, 0.3)', 
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
              }} 
              onClick={() => navigate('/contests/create')}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.9)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.8)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              ➕ 콘테스트 생성
            </button>
          </div>
        )}

        {/* 콘테스트 목록 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '20px',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          {contests.length === 0 ? (
            <div style={{ 
              color: 'rgba(255, 255, 255, 0.8)', 
              textAlign: 'center', 
              padding: '60px 20px',
              fontSize: '18px'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏆</div>
              진행 중인 콘테스트가 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {contests.map(contest => (
                <div
                  key={contest.id}
                  style={{
                    background: contest.ended ? 
                      'rgba(255, 255, 255, 0.08)' : 
                      'rgba(255, 255, 255, 0.15)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '16px',
                    padding: '20px',
                    border: contest.ended ? 
                      '1px solid rgba(255, 255, 255, 0.1)' : 
                      '1px solid rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    flexWrap: 'wrap',
                    transition: 'all 0.3s ease',
                    opacity: contest.ended ? 0.7 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!contest.ended) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!contest.ended) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ 
                      fontWeight: 700, 
                      color: 'white', 
                      fontSize: 20, 
                      marginBottom: '8px',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                    }}>
                      {contest.title}
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      gap: '12px', 
                      flexWrap: 'wrap',
                      alignItems: 'center'
                    }}>
                      <span style={{
                        background: 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(5px)',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '14px',
                        fontWeight: 600,
                        border: '1px solid rgba(255, 255, 255, 0.3)'
                      }}>
                        {contest.type}
                      </span>
                      <span style={{ 
                        color: 'rgba(255, 255, 255, 0.8)', 
                        fontSize: 14,
                        fontWeight: 500
                      }}>
                        📅 마감: {contest.deadline && (contest.deadline.seconds ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : '')}
                      </span>
                    </div>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    gap: '8px', 
                    flexWrap: 'wrap',
                    alignItems: 'center'
                  }}>
                    <button 
                      style={{ 
                        background: 'rgba(59, 130, 246, 0.8)',
                        backdropFilter: 'blur(10px)',
                        color: 'white', 
                        borderRadius: '10px', 
                        padding: '8px 16px', 
                        fontWeight: 600, 
                        border: '1px solid rgba(255, 255, 255, 0.3)', 
                        cursor: 'pointer',
                        fontSize: '14px',
                        transition: 'all 0.3s ease'
                      }} 
                      onClick={() => navigate(`/contests/${contest.id}`)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.9)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.8)';
                      }}
                    >
                      📋 상세
                    </button>
                    
                    {!contest.ended && (
                      <button 
                        style={{ 
                          background: 'rgba(34, 197, 94, 0.8)',
                          backdropFilter: 'blur(10px)',
                          color: 'white', 
                          borderRadius: '10px', 
                          padding: '8px 16px', 
                          fontWeight: 600, 
                          border: '1px solid rgba(255, 255, 255, 0.3)', 
                          cursor: 'pointer',
                          fontSize: '14px',
                          transition: 'all 0.3s ease'
                        }} 
                        onClick={() => handleParticipate(contest)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(34, 197, 94, 0.9)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(34, 197, 94, 0.8)';
                        }}
                      >
                        🎯 참여
                      </button>
                    )}
                    
                    {contest.ended ? (
                      <span style={{ 
                        background: 'rgba(239, 68, 68, 0.8)',
                        backdropFilter: 'blur(10px)',
                        color: 'white', 
                        borderRadius: '10px', 
                        padding: '8px 16px', 
                        fontWeight: 600, 
                        border: '1px solid rgba(255, 255, 255, 0.3)', 
                        display: 'inline-block',
                        fontSize: '14px'
                      }}>
                        ❌ 종료됨
                      </span>
                    ) : (
                      user && user.role === '리더' && user.nickname === '너래' && (
                        <button 
                          style={{ 
                            background: 'rgba(239, 68, 68, 0.8)',
                            backdropFilter: 'blur(10px)',
                            color: 'white', 
                            borderRadius: '10px', 
                            padding: '8px 16px', 
                            fontWeight: 600, 
                            border: '1px solid rgba(255, 255, 255, 0.3)', 
                            cursor: 'pointer',
                            fontSize: '14px',
                            transition: 'all 0.3s ease'
                          }} 
                          onClick={() => handleEndContest(contest)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)';
                          }}
                        >
                          🛑 종료
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContestList; 