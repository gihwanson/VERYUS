import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, setDoc, doc as firestoreDoc, updateDoc, onSnapshot, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { v4 as uuidv4 } from 'uuid';

const ContestDetail: React.FC = () => {
  const { id } = useParams();
  const [contest, setContest] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && ['리더', '운영진', '부운영진'].includes(user.role);
  const isLeader = user && user.role === '리더';
  const [ended, setEnded] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [selectedSolo, setSelectedSolo] = useState<string[]>([]);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState<string>('');
  const [newParticipantNickname, setNewParticipantNickname] = useState('');
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'contests', id)).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        setContest({ id: snap.id, ...data });
        setEnded(!!data.ended);
        setIsStarted(!!data.isStarted);
        // 마감일이 지났고 아직 종료되지 않았다면 자동 종료
        if (data.deadline && data.deadline.toDate) {
          const deadlineDate = data.deadline.toDate();
          const now = new Date();
          
          // 날짜만 비교 (시간 제거)
          const deadlineDateOnly = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
          const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          
          // 마감일 다음날부터 종료 (마감일 당일까지는 참가 가능)
          if (nowDateOnly > deadlineDateOnly && !data.ended) {
            updateDoc(doc(db, 'contests', id), { ended: true });
            setEnded(true);
            setContest({ id: snap.id, ...data, ended: true });
          }
        }
      } else {
        setContest(null);
      }
    });
    // 참가자 목록 실시간 구독
    const unsub = onSnapshot(collection(db, 'contests', id, 'participants'), snap => {
      setParticipants(snap.docs.map(doc => doc.data()));
    });
    // 팀 목록 실시간 구독
    const unsubTeams = onSnapshot(collection(db, 'contests', id, 'teams'), snap => {
      setTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsub(); unsubTeams(); };
  }, [id]);

  const handleParticipate = async () => {
    if (!contest) return;
    navigate(`/contests/${contest.id}/participate`);
    return;
    // Firestore 저장 코드는 비활성화
  };

  const handleEndContest = async () => {
    if (!id) return;
    if (window.confirm('정말로 이 콘테스트를 종료하시겠습니까? 종료 후에는 누구도 참여할 수 없습니다.')) {
      await updateDoc(doc(db, 'contests', id), { ended: true });
      setEnded(true);
    }
  };

  const handleDeleteContest = async () => {
    if (!id) return;
    if (window.confirm('정말로 이 콘테스트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      await deleteDoc(doc(db, 'contests', id));
      alert('콘테스트가 삭제되었습니다.');
      navigate('/contests');
    }
  };

  // 콘테스트 개최
  const handleStartContest = async () => {
    if (!id) return;
    if (window.confirm('콘테스트를 개최하시겠습니까? 개최 후에는 참가자들이 참여할 수 있습니다.')) {
      await updateDoc(doc(db, 'contests', id), { isStarted: true });
      setIsStarted(true);
      alert('콘테스트가 개최되었습니다!');
    }
  };

  // 듀엣으로 묶기
  const handleMakeDuet = async () => {
    if (!id || selectedSolo.length !== 2) return;
    const teamId = uuidv4();
    const members = selectedSolo;
    const teamName = `듀엣${teams.length + 1}`;
    await setDoc(firestoreDoc(db, 'contests', id, 'teams', teamId), {
      teamName,
      members,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    setSelectedSolo([]);
  };

  // 듀엣 해제(솔로로 전환)
  const handleBreakDuet = async (teamId: string) => {
    if (!id) return;
    await deleteDoc(firestoreDoc(db, 'contests', id, 'teams', teamId));
  };

  // 팀명 수정 시작
  const handleEditTeamName = (team: any) => {
    setEditingTeamId(team.id);
    setEditingTeamName(team.teamName);
  };

  // 팀명 저장
  const handleSaveTeamName = async (team: any) => {
    if (!id || !editingTeamName.trim()) return;
    await updateDoc(firestoreDoc(db, 'contests', id, 'teams', team.id), {
      teamName: editingTeamName.trim(),
      updatedAt: new Date(),
    });
    setEditingTeamId(null);
    setEditingTeamName('');
  };

  // 참가자 추가
  const handleAddParticipant = async () => {
    if (!id || !newParticipantNickname.trim()) return;
    setAddingParticipant(true);
    // 닉네임 정규화(소문자+trim)
    const normalizedNickname = newParticipantNickname.trim().toLowerCase();
    // 고유한 ID 생성 (timestamp + random을 사용하여 중복 방지)
    const docId = 'custom_' + normalizedNickname + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const participantRef = firestoreDoc(db, 'contests', id, 'participants', docId);
    
    await setDoc(participantRef, {
      nickname: normalizedNickname,
      uid: docId,
      joinedAt: new Date(),
    });
    setNewParticipantNickname('');
    setAddingParticipant(false);
  };

  // 참가자 삭제
  const handleDeleteParticipant = async (uid: string) => {
    if (!id) return;
    if (!window.confirm('정말로 이 참가자를 삭제하시겠습니까?')) return;
    await deleteDoc(firestoreDoc(db, 'contests', id, 'participants', uid));
    // 해당 참가자가 듀엣 팀에 속해 있다면 팀도 해제
    const team = teams.find(t => Array.isArray(t.members) && t.members.includes(uid));
    if (team) await deleteDoc(firestoreDoc(db, 'contests', id, 'teams', team.id));
  };

  // 참가자 목록 중복 제거 유틸
  const uniqueParticipants = participants.filter((p, idx, arr) => arr.findIndex(pp => (pp.nickname && p.nickname && pp.nickname.toLowerCase().trim() === p.nickname.toLowerCase().trim())) === idx);

  if (!contest) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        backgroundAttachment: 'fixed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '40px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <div style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>콘테스트 정보를 불러오는 중...</div>
        </div>
      </div>
    );
  }

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
        {/* 뒤로가기 버튼 */}
        <div style={{ marginBottom: '20px' }}>
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
              transition: 'all 0.3s ease'
            }}
            onClick={() => navigate('/contests')}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            ← 이전
          </button>
        </div>

        {/* 제목과 정보 */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <h2 style={{ 
            color: 'white', 
            fontWeight: 700, 
            fontSize: 32, 
            margin: '0 0 16px 0',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
          }}>
            {contest.title}
          </h2>
          
          <div style={{ marginBottom: 16 }}>
            <span style={{
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(5px)',
              color: 'white',
              padding: '8px 20px',
              borderRadius: '25px',
              fontSize: '18px',
              fontWeight: 600,
              border: '1px solid rgba(255, 255, 255, 0.3)',
              marginRight: '16px',
              display: 'inline-block'
            }}>
              {contest.type}
            </span>
            <span style={{ 
              color: 'rgba(255, 255, 255, 0.9)', 
              fontSize: 18,
              fontWeight: 500,
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
            }}>
              📅 마감: {contest.deadline && (contest.deadline.seconds ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : '')}
            </span>
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '24px',
          marginBottom: '20px',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
            gap: '12px',
            justifyItems: 'center',
            alignItems: 'center'
          }}>
            <button 
              style={{ 
                background: 'rgba(59, 130, 246, 0.8)',
                backdropFilter: 'blur(10px)',
                color: 'white', 
                borderRadius: '12px', 
                padding: '12px 20px', 
                fontWeight: 600, 
                border: '1px solid rgba(255, 255, 255, 0.3)', 
                cursor: 'pointer',
                fontSize: '15px',
                transition: 'all 0.3s ease',
                minWidth: '120px',
                textAlign: 'center'
              }} 
              onClick={() => navigate(`/contests/${contest.id}/results`)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.9)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.8)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              📊 결과
            </button>
            
            {contest.type === '경연' && isAdmin && (
              <button
                style={{ 
                  background: 'rgba(168, 85, 247, 0.8)',
                  backdropFilter: 'blur(10px)',
                  color: 'white', 
                  borderRadius: '12px', 
                  padding: '12px 20px', 
                  fontWeight: 600, 
                  border: '1px solid rgba(255, 255, 255, 0.3)', 
                  cursor: 'pointer',
                  fontSize: '15px',
                  transition: 'all 0.3s ease',
                  minWidth: '120px',
                  textAlign: 'center'
                }}
                onClick={() => setShowTeamModal(true)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(168, 85, 247, 0.9)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(168, 85, 247, 0.8)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                👥 팀 관리
              </button>
            )}
            
            {isLeader && !isStarted && !ended && (
              <button 
                style={{ 
                  background: 'rgba(34, 197, 94, 0.8)',
                  backdropFilter: 'blur(10px)',
                  color: 'white', 
                  borderRadius: '12px', 
                  padding: '12px 20px', 
                  fontWeight: 600, 
                  border: '1px solid rgba(255, 255, 255, 0.3)', 
                  cursor: 'pointer',
                  fontSize: '15px',
                  transition: 'all 0.3s ease',
                  minWidth: '120px',
                  textAlign: 'center'
                }} 
                onClick={handleStartContest}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.9)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.8)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                🎯 개최
              </button>
            )}
            
            {isStarted && !ended && (
              <div style={{
                background: 'rgba(34, 197, 94, 0.2)',
                backdropFilter: 'blur(10px)',
                color: 'white', 
                borderRadius: '12px', 
                padding: '12px 20px', 
                fontWeight: 600, 
                border: '1px solid rgba(34, 197, 94, 0.3)', 
                fontSize: '15px',
                minWidth: '120px',
                textAlign: 'center'
              }}>
                ✅ 개최됨
              </div>
            )}
            
            {isLeader && (
              <>
                <button 
                  style={{ 
                    background: 'rgba(239, 68, 68, 0.8)',
                    backdropFilter: 'blur(10px)',
                    color: 'white', 
                    borderRadius: '12px', 
                    padding: '12px 20px', 
                    fontWeight: 600, 
                    border: '1px solid rgba(255, 255, 255, 0.3)', 
                    cursor: 'pointer',
                    fontSize: '15px',
                    transition: 'all 0.3s ease',
                    minWidth: '120px',
                    textAlign: 'center'
                  }} 
                  onClick={handleEndContest}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  🛑 종료
                </button>
                <button 
                  style={{ 
                    background: 'rgba(185, 28, 28, 0.8)',
                    backdropFilter: 'blur(10px)',
                    color: 'white', 
                    borderRadius: '12px', 
                    padding: '12px 20px', 
                    fontWeight: 600, 
                    border: '1px solid rgba(255, 255, 255, 0.3)', 
                    cursor: 'pointer',
                    fontSize: '15px',
                    transition: 'all 0.3s ease',
                    minWidth: '120px',
                    textAlign: 'center'
                  }} 
                  onClick={handleDeleteContest}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(185, 28, 28, 0.9)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(185, 28, 28, 0.8)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  🗑️ 삭제
                </button>
              </>
            )}
          </div>
         </div>

        {/* 팀 관리 모달 */}
        {showTeamModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowTeamModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, minWidth: 340, minHeight: 200, position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowTeamModal(false)} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', fontSize: 22, color: '#8A55CC', cursor: 'pointer' }}>×</button>
            <h3 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 20, marginBottom: 16 }}>참가자/팀 관리 (경연)</h3>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 600, color: '#7C4DBC', marginBottom: 8 }}>듀엣 팀 목록</div>
              {teams.length === 0 && <div style={{ color: '#B497D6', marginBottom: 12 }}>아직 듀엣 팀이 없습니다.</div>}
              <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
                {teams.map(team => {
                  const canEditTeamName = user && (team.members.includes(user.uid) || isAdmin);
                  return (
                    <div key={team.id} style={{ background: '#F6F2FF', borderRadius: 8, padding: '8px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontWeight: 600, color: '#8A55CC', minWidth: 60 }}>
                        팀명: {editingTeamId === team.id ? (
                          <>
                            <input
                              value={editingTeamName}
                              onChange={e => setEditingTeamName(e.target.value)}
                              style={{ width: 90, padding: '2px 6px', borderRadius: 6, border: '1px solid #E5DAF5', marginRight: 4 }}
                            />
                            <button style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', fontWeight: 600, marginRight: 2, cursor: 'pointer' }} onClick={() => handleSaveTeamName(team)}>저장</button>
                            <button style={{ background: '#E5E7EB', color: '#8A55CC', border: 'none', borderRadius: 6, padding: '2px 8px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setEditingTeamId(null)}>취소</button>
                          </>
                        ) : (
                          <>
                            {team.teamName}
                            {canEditTeamName && (
                              <button style={{ background: 'none', color: '#8A55CC', border: 'none', marginLeft: 6, cursor: 'pointer', fontWeight: 600 }} onClick={() => handleEditTeamName(team)}>수정</button>
                            )}
                          </>
                        )}
                      </span>
                      <span style={{ color: '#6B7280' }}>팀원: {Array.isArray(team.members) ? team.members.map((uid: string) => {
                        // 먼저 전체 participants에서 찾기
                        const p = participants.find(pp => pp.uid === uid);
                        if (p && p.nickname) {
                          return p.nickname;
                        }
                        
                        // 그래도 찾지 못하면 uid에서 닉네임 추출 시도
                        if (uid.startsWith('custom_')) {
                          const parts = uid.split('_');
                          if (parts.length >= 2) {
                            return parts[1]; // custom_닉네임_timestamp_random에서 닉네임 부분
                          }
                        }
                        
                        // 최후의 수단으로 uid 표시 (하지만 더 읽기 쉽게)
                        return `참가자_${uid.slice(-4)}`;
                      }).join(', ') : ''}</span>
                      <button style={{ marginLeft: 8, background: '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleBreakDuet(team.id)}>솔로로 전환</button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#7C4DBC', marginBottom: 8 }}>솔로 참가자</div>
              {isAdmin && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <input
                    type="text"
                    value={newParticipantNickname}
                    onChange={e => setNewParticipantNickname(e.target.value)}
                    placeholder="닉네임 입력"
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E5DAF5', fontSize: 15 }}
                  />
                  <button
                    style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, fontSize: 15, cursor: addingParticipant ? 'not-allowed' : 'pointer' }}
                    onClick={handleAddParticipant}
                    disabled={addingParticipant || !newParticipantNickname.trim()}
                  >
                    추가
                  </button>
                </div>
              )}
              {participants.filter(p => !teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid))).length === 0 && <div style={{ color: '#B497D6' }}>솔로 참가자가 없습니다.</div>}
              <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 8 }}>
                {participants.filter(p => !teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid))).map(p => (
                  <div key={p.uid} style={{ background: '#F9FAFB', borderRadius: 8, padding: '8px 16px', marginBottom: 8, color: '#8A55CC', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedSolo.includes(p.uid)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedSolo(prev => prev.length < 2 ? [...prev, p.uid] : prev);
                        } else {
                          setSelectedSolo(prev => prev.filter(uid => uid !== p.uid));
                        }
                      }}
                      disabled={selectedSolo.length === 2 && !selectedSolo.includes(p.uid)}
                      style={{ marginRight: 8 }}
                    />
                    {p.nickname}
                    {isAdmin && (
                      <button style={{ marginLeft: 8, background: '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, padding: '2px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }} onClick={() => handleDeleteParticipant(p.uid)}>삭제</button>
                    )}
                  </div>
                ))}
              </div>
              <button
                style={{ marginTop: 8, background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 600, fontSize: 15, cursor: selectedSolo.length === 2 ? 'pointer' : 'not-allowed', width: '100%' }}
                onClick={handleMakeDuet}
                disabled={selectedSolo.length !== 2}
              >
                듀엣으로 묶기
              </button>
            </div>
          </div>
        </div>
        )}

        {/* 종료 알림 */}
        {ended && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.8)',
            backdropFilter: 'blur(15px)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '20px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            textAlign: 'center'
          }}>
            <div style={{ 
              color: 'white', 
              fontWeight: 700,
              fontSize: '18px',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
            }}>
              ❌ 이 콘테스트는 종료되어 더 이상 참여할 수 없습니다.
            </div>
          </div>
        )}

        {/* 참가자 목록 */}
        {uniqueParticipants.length > 0 && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(15px)',
            borderRadius: '20px',
            padding: '20px',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <h3 style={{ 
              color: 'white', 
              fontWeight: 700, 
              fontSize: 22, 
              marginBottom: 16,
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
            }}>
              👥 참가자 목록
            </h3>
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: 12
            }}>
              {uniqueParticipants.map((p, i) => (
                <div 
                  key={i} 
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(10px)',
                    color: 'white', 
                    borderRadius: '20px', 
                    padding: '8px 16px', 
                    fontWeight: 600,
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    fontSize: '14px'
                  }}
                >
                  {p.nickname}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContestDetail; 