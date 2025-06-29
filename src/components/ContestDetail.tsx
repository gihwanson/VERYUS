import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, setDoc, doc as firestoreDoc, updateDoc, onSnapshot, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { v4 as uuidv4 } from 'uuid';
import '../styles/variables.css';
import '../styles/components.css';

type ContestType = '정규등급전' | '세미등급전' | '경연';

interface Contest {
  id: string;
  title: string;
  type: ContestType;
  deadline: any;
  createdBy: string;
  ended?: boolean;
  isStarted: boolean;
  top3?: Array<{
    rank: number;
    name: string;
    score: number;
  }>;
}

interface Participant {
  uid: string;
  nickname: string;
  joinedAt: any;
}

interface Team {
  id: string;
  teamName: string;
  members: string[];
  createdAt: any;
  updatedAt: any;
}

interface User {
  uid: string;
  email: string;
  nickname?: string;
  isLoggedIn: boolean;
  role?: string;
}

const ContestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [contest, setContest] = useState<Contest | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [ended, setEnded] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [selectedSolo, setSelectedSolo] = useState<string[]>([]);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState<string>('');
  const [newParticipantNickname, setNewParticipantNickname] = useState('');
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [submittedUids, setSubmittedUids] = useState<string[]>([]);
  const soloListRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // User data
  const user = useMemo(() => {
    const userString = localStorage.getItem('veryus_user');
    return userString ? JSON.parse(userString) as User : null;
  }, []);

  const isAdmin = useMemo(() => {
    return user && ['리더', '운영진', '부운영진'].includes(user.role || '');
  }, [user]);

  const isLeader = useMemo(() => {
    return user && user.role === '리더';
  }, [user]);

  // Callbacks
  const handleParticipate = useCallback(() => {
    if (!contest) return;
    navigate(`/contests/${contest.id}/participate`);
  }, [contest, navigate]);

  const handleEndContest = useCallback(async () => {
    if (!id) return;
    if (window.confirm('정말로 이 콘테스트를 종료하시겠습니까? 종료 후에는 누구도 참여할 수 없습니다.')) {
      await updateDoc(doc(db, 'contests', id), { ended: true });
      setEnded(true);
    }
  }, [id]);

  const handleDeleteContest = useCallback(async () => {
    if (!id) return;
    if (window.confirm('정말로 이 콘테스트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      await deleteDoc(doc(db, 'contests', id));
      alert('콘테스트가 삭제되었습니다.');
      navigate('/contests');
    }
  }, [id, navigate]);

  const handleStartContest = useCallback(async () => {
    if (!id) return;
    if (window.confirm('콘테스트를 개최하시겠습니까? 개최 후에는 참가자들이 참여할 수 있습니다.')) {
      await updateDoc(doc(db, 'contests', id), { isStarted: true });
      setIsStarted(true);
      alert('콘테스트가 개최되었습니다!');
    }
  }, [id]);

  const handleMakeDuet = useCallback(async () => {
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
  }, [id, selectedSolo, teams.length]);

  const handleBreakDuet = useCallback(async (teamId: string) => {
    if (!id) return;
    await deleteDoc(firestoreDoc(db, 'contests', id, 'teams', teamId));
  }, [id]);

  const handleEditTeamName = useCallback((team: Team) => {
    setEditingTeamId(team.id);
    setEditingTeamName(team.teamName);
  }, []);

  const handleSaveTeamName = useCallback(async (team: Team) => {
    if (!id || !editingTeamName.trim()) return;
    await updateDoc(firestoreDoc(db, 'contests', id, 'teams', team.id), {
      teamName: editingTeamName.trim(),
      updatedAt: new Date(),
    });
    setEditingTeamId(null);
    setEditingTeamName('');
  }, [id, editingTeamName]);

  const handleAddParticipant = useCallback(async () => {
    if (!id || !newParticipantNickname.trim()) return;
    setAddingParticipant(true);
    
    try {
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
    } catch (error) {
      console.error('참가자 추가 중 오류:', error);
      alert('참가자 추가 중 오류가 발생했습니다.');
    } finally {
      setAddingParticipant(false);
    }
  }, [id, newParticipantNickname]);

  const handleDeleteParticipant = useCallback(async (uid: string) => {
    if (!id) return;
    if (!window.confirm('정말로 이 참가자를 삭제하시겠습니까?')) return;
    
    try {
      await deleteDoc(firestoreDoc(db, 'contests', id, 'participants', uid));
      // 해당 참가자가 듀엣 팀에 속해 있다면 팀도 해제
      const team = teams.find(t => Array.isArray(t.members) && t.members.includes(uid));
      if (team) await deleteDoc(firestoreDoc(db, 'contests', id, 'teams', team.id));
    } catch (error) {
      console.error('참가자 삭제 중 오류:', error);
      alert('참가자 삭제 중 오류가 발생했습니다.');
    }
  }, [id, teams]);

  const handleParticipantClick = useCallback((uid: string) => {
    setSelectedSolo(prev => 
      prev.includes(uid) 
        ? prev.filter(id => id !== uid)
        : [...prev, uid]
    );
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedSolo([]);
  }, []);

  const formatDeadline = useCallback((deadline: any): string => {
    if (!deadline) return '';
    return deadline.seconds ? new Date(deadline.seconds * 1000).toLocaleDateString('ko-KR') : '';
  }, []);

  const isParticipantSubmitted = useCallback((nickname: string): boolean => {
    return submittedUids.includes(nickname);
  }, [submittedUids]);

  // 참가자 목록 중복 제거 유틸
  const uniqueParticipants = useMemo(() => {
    return participants.filter((p, idx, arr) => 
      arr.findIndex(pp => 
        pp.nickname && p.nickname && 
        pp.nickname.toLowerCase().trim() === p.nickname.toLowerCase().trim()
      ) === idx
    );
  }, [participants]);

  // Effects
  useEffect(() => {
    if (!id) return;
    
    const fetchContest = async () => {
      try {
        const contestDoc = await getDoc(doc(db, 'contests', id));
        if (contestDoc.exists()) {
          const data = contestDoc.data();
          const contestData = { id: contestDoc.id, ...data } as Contest;
          setContest(contestData);
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
              await updateDoc(doc(db, 'contests', id), { ended: true });
              setEnded(true);
              setContest({ ...contestData, ended: true });
            }
          }
        } else {
          setContest(null);
        }
      } catch (error) {
        console.error('콘테스트 정보 로딩 중 오류:', error);
        setContest(null);
      }
    };

    fetchContest();
    
    // 참가자 목록 실시간 구독
    const unsub = onSnapshot(collection(db, 'contests', id, 'participants'), snap => {
      setParticipants(snap.docs.map(doc => doc.data()) as Participant[]);
    });
    
    // 팀 목록 실시간 구독
    const unsubTeams = onSnapshot(collection(db, 'contests', id, 'teams'), snap => {
      setTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Team[]);
    });
    
    // 참가자별 제출완료 여부 확인 (grades 컬렉션에서 evaluator == 참가자 닉네임)
    const fetchSubmittedUids = async () => {
      try {
        const gradesSnap = await getDocs(collection(db, 'contests', id, 'grades'));
        // evaluator(닉네임) 기준으로 제출완료자 목록 추출
        const evaluators = gradesSnap.docs.map(doc => doc.data().evaluator);
        setSubmittedUids(Array.from(new Set(evaluators)));
      } catch (error) {
        console.error('제출 상태 확인 중 오류:', error);
      }
    };
    
    fetchSubmittedUids();
    
    return () => { 
      unsub(); 
      unsubTeams(); 
    };
  }, [id]);

  useEffect(() => {
    if (soloListRef.current) {
      soloListRef.current.scrollTop = soloListRef.current.scrollHeight;
    }
  }, [participants.length]);

  if (!contest) {
    return (
      <div className="contest-loading">
        <div className="contest-loading-content">
          콘테스트 정보를 불러오는 중...
        </div>
      </div>
    );
  }

  return (
    <div className="contest-detail-container">
      <div className="contest-detail-pattern" />
      <div className="contest-detail-content">
        {/* 상단 요약 카드 */}
        <div className="contest-detail-summary-card">
          <div className="contest-detail-summary-header">
            <h2 className="contest-detail-title">{contest.title}</h2>
            <div className="contest-detail-status-badges">
              <span className="contest-detail-info-item">{contest.type}</span>
              <span className="contest-detail-info-item">📅 마감: {formatDeadline(contest.deadline)}</span>
              {ended ? (
                <span className="contest-detail-badge ended">종료됨</span>
              ) : contest.isStarted ? (
                <span className="contest-detail-badge started">진행중</span>
              ) : (
                <span className="contest-detail-badge waiting">대기중</span>
              )}
            </div>
          </div>
          <div className="contest-detail-summary-actions">
            {!ended && (
              <button className="btn btn-primary" onClick={handleParticipate}>참여</button>
            )}
            <button className="btn btn-secondary" onClick={() => navigate(`/contests/${contest.id}/results`)}>결과 보기</button>
            {isAdmin && (
              <button className="btn btn-danger" onClick={handleDeleteContest}>삭제</button>
            )}
          </div>
        </div>

        {/* 참가자 관리 섹션 */}
        {isAdmin && (
          <section className="contest-detail-section">
            <h3 className="contest-detail-section-title">👥 참가자 관리</h3>
            <hr className="contest-detail-section-divider" />
            <div className="contest-detail-add-form">
              <input
                type="text"
                className="contest-detail-add-input"
                placeholder="참가자 닉네임을 입력하세요"
                value={newParticipantNickname}
                onChange={(e) => setNewParticipantNickname(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddParticipant()}
              />
              <button 
                className="contest-detail-add-button"
                onClick={handleAddParticipant}
                disabled={addingParticipant || !newParticipantNickname.trim()}
              >
                {addingParticipant ? '추가 중...' : '추가'}
              </button>
            </div>
            <div className="contest-detail-participant-list" ref={soloListRef}>
              {uniqueParticipants
                .filter(p => !teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid)))
                .map(p => {
                  const isSubmitted = isParticipantSubmitted(p.nickname);
                  return (
                    <div 
                      key={p.uid} 
                      className={`contest-detail-participant-item ${selectedSolo.includes(p.uid) ? 'selected' : ''}`}
                      onClick={() => handleParticipantClick(p.uid)}
                    >
                      <span className="contest-detail-participant-name">
                        {p.nickname}
                      </span>
                      <span className={`contest-detail-participant-status ${isSubmitted ? 'submitted' : 'pending'}`}>
                        {isSubmitted ? '✅ 제출완료' : '⏳ 대기중'}
                      </span>
                      <button 
                        className="contest-detail-team-button break"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteParticipant(p.uid);
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  );
                })}
            </div>
            {selectedSolo.length === 2 && (
              <div className="contest-detail-duet-actions">
                <button 
                  className="btn btn-primary"
                  onClick={handleMakeDuet}
                >
                  듀엣 만들기
                </button>
              </div>
            )}
          </section>
        )}

        {/* 팀 목록 섹션 */}
        {teams.length > 0 && (
          <section className="contest-detail-section">
            <h3 className="contest-detail-section-title">🎭 팀 목록</h3>
            <hr className="contest-detail-section-divider" />
            <div className="contest-detail-team-list">
              {teams.map(team => {
                const teamSubmitted = Array.isArray(team.members) && team.members.some((uid: string) => {
                  const p = participants.find(pp => pp.uid === uid);
                  return p && isParticipantSubmitted(p.nickname);
                });
                return (
                  <div key={team.id} className="contest-detail-team-item">
                    <div className="contest-detail-team-name">
                      {editingTeamId === team.id ? (
                        <input
                          type="text"
                          className="contest-detail-add-input"
                          value={editingTeamName}
                          onChange={(e) => setEditingTeamName(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSaveTeamName(team)}
                          autoFocus
                        />
                      ) : (
                        team.teamName
                      )}
                    </div>
                    <div className="contest-detail-team-members">
                      팀원: {Array.isArray(team.members) ? team.members.map((uid: string) => {
                        const p = participants.find(pp => pp.uid === uid);
                        return p ? p.nickname : uid;
                      }).join(', ') : ''}
                    </div>
                    <div className="contest-detail-team-actions">
                      {editingTeamId === team.id ? (
                        <>
                          <button 
                            className="contest-detail-team-button edit"
                            onClick={() => handleSaveTeamName(team)}
                          >
                            저장
                          </button>
                          <button 
                            className="contest-detail-team-button break"
                            onClick={() => {
                              setEditingTeamId(null);
                              setEditingTeamName('');
                            }}
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            className="contest-detail-team-button edit"
                            onClick={() => handleEditTeamName(team)}
                          >
                            팀명 수정
                          </button>
                          <button 
                            className="contest-detail-team-button break"
                            onClick={() => handleBreakDuet(team.id)}
                          >
                            팀 해제
                          </button>
                        </>
                      )}
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <span className={`contest-detail-participant-status ${teamSubmitted ? 'submitted' : 'pending'}`}>
                        {teamSubmitted ? '✅ 제출완료' : '⏳ 대기중'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 솔로 참가자 섹션 */}
        {uniqueParticipants.filter(p => !teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid))).length > 0 && (
          <section className="contest-detail-section">
            <h3 className="contest-detail-section-title">🎤 솔로 참가자</h3>
            <hr className="contest-detail-section-divider" />
            <div className="contest-detail-participant-list">
              {uniqueParticipants
                .filter(p => !teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid)))
                .map(p => {
                  const isSubmitted = isParticipantSubmitted(p.nickname);
                  return (
                    <div key={p.uid} className="contest-detail-participant-item">
                      <span className="contest-detail-participant-name">
                        {p.nickname}
                      </span>
                      <span className={`contest-detail-participant-status ${isSubmitted ? 'submitted' : 'pending'}`}>
                        {isSubmitted ? '✅ 제출완료' : '⏳ 대기중'}
                      </span>
                    </div>
                  );
                })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default ContestDetail; 