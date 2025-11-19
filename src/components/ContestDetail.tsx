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

interface EvaluationTarget {
  uid: string;
  nickname: string;
  createdAt: any;
  updatedAt: any;
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
  const [participants, setParticipants] = useState<Participant[]>([]); // 평가하는 인원 (참가 버튼을 누른 사람들)
  const [evaluationTargets, setEvaluationTargets] = useState<EvaluationTarget[]>([]); // 평가받는 대상 (관리자가 입력)
  const [teams, setTeams] = useState<Team[]>([]);
  const [ended, setEnded] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [selectedSolo, setSelectedSolo] = useState<string[]>([]);
  const [selectedEvaluationTargets, setSelectedEvaluationTargets] = useState<string[]>([]); // 평가받는 대상 선택용
  const [newParticipantNickname, setNewParticipantNickname] = useState('');
  const [newEvaluationTargetNickname, setNewEvaluationTargetNickname] = useState('');
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [addingEvaluationTarget, setAddingEvaluationTarget] = useState(false);
  const [editingEvaluationTargetId, setEditingEvaluationTargetId] = useState<string | null>(null);
  const [editingEvaluationTargetNickname, setEditingEvaluationTargetNickname] = useState<string>('');
  const [isStarted, setIsStarted] = useState(false);
  const [submittedUids, setSubmittedUids] = useState<string[]>([]);
  const [entryRestricted, setEntryRestricted] = useState(false);
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
  const handleParticipate = useCallback(async () => {
    if (!contest || !user) return;
    
    // 리더는 개최 전에도 입장 허용
    const isLeader = user.role === '리더';
    
    // 경연 유형인 경우 자동 참가 처리
    if (contest.type === '경연') {
      try {
        const participantsSnap = await getDocs(collection(db, 'contests', contest.id, 'participants'));
        const participants = participantsSnap.docs.map(doc => doc.data());
        
        // 이미 참가했는지 확인 (uid 또는 nickname으로)
        const isParticipant = participants.some(p =>
          (p.uid === user.uid) ||
          (p.nickname && user.nickname && p.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim())
        );
        
        // 입장 제한 상태 확인
        const contestDoc = await getDoc(doc(db, 'contests', contest.id));
        const contestData = contestDoc.data();
        const entryRestricted = contestData?.entryRestricted || false;
        
        if (!isParticipant) {
          // 입장 제한 상태면 참가 불가
          if (entryRestricted) {
            alert('현재 입장이 제한된 상태입니다. 관리자에게 문의해주세요.');
            return;
          }
          
          // 참가자 자동 추가
          const participantRef = doc(db, 'contests', contest.id, 'participants', user.uid);
          await setDoc(participantRef, {
            nickname: user.nickname,
            uid: user.uid,
            joinedAt: new Date(),
          });
        }
        
        // 개최 전이라도 리더는 입장 허용
        if (contest.isStarted || isLeader) {
          navigate(`/contests/${contest.id}/participate`);
        } else {
          alert('콘테스트가 아직 개최되지 않았습니다. 리더가 개최할 때까지 기다려주세요.');
        }
      } catch (error) {
        console.error('참가 처리 중 오류:', error);
        alert('참가 처리 중 오류가 발생했습니다.');
      }
    } else {
      // 정규등급전, 세미등급전은 기존 로직 유지
      navigate(`/contests/${contest.id}/participate`);
    }
  }, [contest, user, navigate]);

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

  // 평가받는 대상 추가
  const handleAddEvaluationTarget = useCallback(async () => {
    if (!id || !newEvaluationTargetNickname.trim()) return;
    setAddingEvaluationTarget(true);
    
    try {
      const normalizedNickname = newEvaluationTargetNickname.trim();
      const docId = 'target_' + normalizedNickname.toLowerCase().replace(/\s/g, '_') + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const targetRef = firestoreDoc(db, 'contests', id, 'evaluationTargets', docId);
      
      await setDoc(targetRef, {
        nickname: normalizedNickname,
        uid: docId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setNewEvaluationTargetNickname('');
    } catch (error) {
      console.error('평가 대상 추가 중 오류:', error);
      alert('평가 대상 추가 중 오류가 발생했습니다.');
    } finally {
      setAddingEvaluationTarget(false);
    }
  }, [id, newEvaluationTargetNickname]);

  // 평가받는 대상 삭제
  const handleDeleteEvaluationTarget = useCallback(async (uid: string) => {
    if (!id) return;
    if (!window.confirm('정말로 이 평가 대상을 삭제하시겠습니까?')) return;
    
    try {
      await deleteDoc(firestoreDoc(db, 'contests', id, 'evaluationTargets', uid));
      // 해당 대상이 팀에 속해 있다면 팀도 해제
      const team = teams.find(t => Array.isArray(t.members) && t.members.includes(uid));
      if (team) await deleteDoc(firestoreDoc(db, 'contests', id, 'teams', team.id));
    } catch (error) {
      console.error('평가 대상 삭제 중 오류:', error);
      alert('평가 대상 삭제 중 오류가 발생했습니다.');
    }
  }, [id, teams]);

  // 평가받는 대상 수정
  const handleEditEvaluationTarget = useCallback((target: EvaluationTarget) => {
    setEditingEvaluationTargetId(target.uid);
    setEditingEvaluationTargetNickname(target.nickname);
  }, []);

  const handleSaveEvaluationTarget = useCallback(async (target: EvaluationTarget) => {
    if (!id || !editingEvaluationTargetNickname.trim()) return;
    await updateDoc(firestoreDoc(db, 'contests', id, 'evaluationTargets', target.uid), {
      nickname: editingEvaluationTargetNickname.trim(),
      updatedAt: new Date(),
    });
    setEditingEvaluationTargetId(null);
    setEditingEvaluationTargetNickname('');
  }, [id, editingEvaluationTargetNickname]);

  // 평가받는 대상 선택 (팀 만들기용)
  const handleEvaluationTargetClick = useCallback((uid: string) => {
    setSelectedEvaluationTargets(prev => 
      prev.includes(uid) 
        ? prev.filter(id => id !== uid)
        : [...prev, uid]
    );
  }, []);

  // 평가받는 대상으로 팀 만들기
  const handleMakeTeamFromTargets = useCallback(async () => {
    if (!id || selectedEvaluationTargets.length < 2) return;
    const teamId = uuidv4();
    const members = selectedEvaluationTargets;
    const teamName = `팀${teams.length + 1}`;
    await setDoc(firestoreDoc(db, 'contests', id, 'teams', teamId), {
      teamName,
      members,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    setSelectedEvaluationTargets([]);
  }, [id, selectedEvaluationTargets, teams.length]);

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

  // 팀 목록을 생성 시간 순으로 정렬하는 유틸
  const sortedTeams = useMemo(() => {
    return teams.sort((a, b) => {
      // createdAt 기준으로 정렬
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return aTime - bTime;
    });
  }, [teams]);

  // Effects
  useEffect(() => {
    if (!id) return;
    
    // 콘테스트 정보 실시간 구독 (개최 상태, 종료 상태, 입장 제한 상태 모두 포함)
    const unsubContest = onSnapshot(doc(db, 'contests', id), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const contestData = { id: snap.id, ...data } as Contest;
        setContest(contestData);
        setEnded(!!data.ended);
        setIsStarted(!!data.isStarted);
        // entryRestricted는 명시적으로 설정된 경우에만 업데이트 (undefined면 false로 유지)
        if (data.entryRestricted !== undefined) {
          setEntryRestricted(!!data.entryRestricted);
        }
        
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
    });
    
    // 참가자 목록 실시간 구독 (평가하는 인원)
    const unsub = onSnapshot(collection(db, 'contests', id, 'participants'), snap => {
      setParticipants(snap.docs.map(doc => doc.data()) as Participant[]);
    });
    
    // 평가받는 대상 목록 실시간 구독
    const unsubEvaluationTargets = onSnapshot(collection(db, 'contests', id, 'evaluationTargets'), snap => {
      setEvaluationTargets(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as EvaluationTarget[]);
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
      unsubContest();
      unsub(); 
      unsubEvaluationTargets();
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
            {isLeader && !contest.isStarted && !ended && (
              <button 
                className="btn btn-success" 
                onClick={handleStartContest}
                style={{ background: '#10B981', color: '#fff' }}
              >
                🚀 콘테스트 개최
              </button>
            )}
            {isAdmin && (
              <button className="btn btn-danger" onClick={handleDeleteContest}>삭제</button>
            )}
          </div>
        </div>

        {/* 경연 유형 안내 */}
        {contest.type === '경연' && (
          <section className="contest-detail-section" style={{ marginBottom: '24px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #F6F2FF 0%, #F0F4FF 100%)',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid rgba(138, 85, 204, 0.2)',
              marginBottom: '16px'
            }}>
              <h3 style={{ color: '#8A55CC', fontWeight: 700, fontSize: '18px', marginBottom: '12px', textAlign: 'center' }}>
                🎭 경연 유형 안내
              </h3>
              <ul style={{ 
                color: '#6B21A8', 
                fontSize: '14px', 
                lineHeight: '1.8',
                margin: 0,
                paddingLeft: '20px'
              }}>
                <li>경연은 참가자들이 서로 평가하는 콘테스트입니다</li>
                <li>솔로 참가 또는 듀엣 팀 구성이 가능합니다</li>
                <li>각 참가자는 다른 참가자/팀을 평가합니다 (본인/본인 팀 제외)</li>
                <li>0~100점 사이로 점수를 부여할 수 있습니다</li>
              </ul>
            </div>
          </section>
        )}

        {/* 참가자현황 섹션 (평가하는 인원) */}
        {isAdmin && (
          <section className="contest-detail-section">
            <h3 className="contest-detail-section-title">👥 참가자현황</h3>
            <hr className="contest-detail-section-divider" />
            
            {/* 경연 유형: 입장 제한/허용 토글 버튼 */}
            {contest.type === '경연' && (
              <>
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  marginBottom: '16px',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <button
                    onClick={async () => {
                      if (!id) return;
                      const newStatus = !entryRestricted;
                      await updateDoc(doc(db, 'contests', id), { entryRestricted: newStatus });
                      setEntryRestricted(newStatus);
                      alert(newStatus ? '입장이 제한되었습니다.' : '입장이 가능해졌습니다.');
                    }}
                    style={{
                      background: entryRestricted ? '#F43F5E' : '#10B981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px 24px',
                      fontWeight: 600,
                      fontSize: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {entryRestricted ? '🔒 입장제한' : '✅ 입장가능'}
                  </button>
                  <div style={{
                    color: entryRestricted ? '#F43F5E' : '#10B981',
                    fontWeight: 600,
                    fontSize: '14px'
                  }}>
                    {entryRestricted ? '현재 입장이 제한된 상태입니다.' : '현재 입장이 가능한 상태입니다.'}
                  </div>
                </div>
                <div style={{
                  background: 'rgba(138, 85, 204, 0.1)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  color: '#6B21A8',
                  textAlign: 'center'
                }}>
                  💡 경연은 자유 참가 방식입니다. 참가 버튼을 누른 사용자들이 실시간으로 표시됩니다.
                </div>
              </>
            )}

            {/* 경연이 아닌 경우에만 참가자 추가 기능 표시 */}
            {contest.type !== '경연' && (
              <>
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
              </>
            )}

            {/* 실시간 참가자 명단 */}
            <div style={{
              background: 'rgba(138, 85, 204, 0.05)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '12px'
            }}>
              <div style={{
                fontWeight: 600,
                color: '#8A55CC',
                marginBottom: '8px',
                fontSize: '14px'
              }}>
                📋 실시간 참가자 명단 ({uniqueParticipants.length}명)
              </div>
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
                          if (contest.type === '경연') {
                            if (window.confirm(`${p.nickname}님을 강퇴하시겠습니까?`)) {
                              handleDeleteParticipant(p.uid);
                            }
                          } else {
                            handleDeleteParticipant(p.uid);
                          }
                        }}
                        style={{
                          background: contest.type === '경연' ? '#F43F5E' : undefined
                        }}
                      >
                        {contest.type === '경연' ? '강퇴' : '삭제'}
                      </button>
                    </div>
                  );
                })}
              {uniqueParticipants.filter(p => !teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid))).length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '20px',
                  color: '#9CA3AF',
                  fontSize: '14px'
                }}>
                  {contest.type === '경연' ? '아직 참가한 사람이 없습니다.' : '참가자가 없습니다.'}
                </div>
              )}
            </div>
            {selectedSolo.length === 2 && (
              <div className="contest-detail-duet-actions">
                <button 
                  className="btn btn-primary"
                  onClick={handleMakeDuet}
                >
                  팀 만들기
                </button>
              </div>
            )}
          </section>
        )}

        {/* 참가자 관리 섹션 (평가받는 대상) - 경연 유형만 */}
        {isAdmin && contest.type === '경연' && (
          <section className="contest-detail-section">
            <h3 className="contest-detail-section-title">🎯 참가자 관리</h3>
            <hr className="contest-detail-section-divider" />
            <div style={{
              background: 'rgba(138, 85, 204, 0.05)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '14px',
              color: '#6B21A8',
              textAlign: 'center'
            }}>
              💡 평가받는 대상들을 관리합니다. 이 인원들이 평가 페이지에 표시됩니다.
            </div>
            
            {/* 평가받는 대상 추가 폼 */}
            <div className="contest-detail-add-form">
              <input
                type="text"
                className="contest-detail-add-input"
                placeholder="평가받는 대상 닉네임을 입력하세요"
                value={newEvaluationTargetNickname}
                onChange={(e) => setNewEvaluationTargetNickname(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddEvaluationTarget()}
              />
              <button 
                className="contest-detail-add-button"
                onClick={handleAddEvaluationTarget}
                disabled={addingEvaluationTarget || !newEvaluationTargetNickname.trim()}
              >
                {addingEvaluationTarget ? '추가 중...' : '추가'}
              </button>
            </div>

            {/* 평가받는 대상 목록 */}
            <div style={{
              background: 'rgba(138, 85, 204, 0.05)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '12px'
            }}>
              <div style={{
                fontWeight: 600,
                color: '#8A55CC',
                marginBottom: '8px',
                fontSize: '14px'
              }}>
                📋 평가받는 대상 목록 ({evaluationTargets.length}명)
              </div>
              {selectedEvaluationTargets.length > 0 && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px',
                  background: 'rgba(138, 85, 204, 0.1)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: '#6B21A8'
                }}>
                  ✅ {selectedEvaluationTargets.length}명 선택됨 {selectedEvaluationTargets.length >= 2 && '(팀 만들기 가능)'}
                </div>
              )}
              {selectedEvaluationTargets.length === 0 && (
                <div style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  color: '#9CA3AF',
                  fontStyle: 'italic'
                }}>
                  💡 팀으로 묶을 인원을 클릭하여 선택하세요 (2명 이상 선택 시 팀 만들기 가능)
                </div>
              )}
            </div>
            <div className="contest-detail-participant-list">
              {evaluationTargets
                .filter(t => !teams.some(team => Array.isArray(team.members) && team.members.includes(t.uid)))
                .map(t => (
                  <div 
                    key={t.uid} 
                    className={`contest-detail-participant-item ${selectedEvaluationTargets.includes(t.uid) ? 'selected' : ''}`}
                    onClick={() => handleEvaluationTargetClick(t.uid)}
                    style={{
                      cursor: editingEvaluationTargetId === t.uid ? 'default' : 'pointer',
                      background: selectedEvaluationTargets.includes(t.uid) ? 'rgba(138, 85, 204, 0.15)' : undefined,
                      border: selectedEvaluationTargets.includes(t.uid) ? '2px solid #8A55CC' : undefined,
                      transform: selectedEvaluationTargets.includes(t.uid) ? 'scale(1.02)' : undefined,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {editingEvaluationTargetId === t.uid ? (
                      <input
                        type="text"
                        className="contest-detail-add-input"
                        value={editingEvaluationTargetNickname}
                        onChange={(e) => setEditingEvaluationTargetNickname(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSaveEvaluationTarget(t)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span className="contest-detail-participant-name">
                        {t.nickname}
                      </span>
                    )}
                    {editingEvaluationTargetId === t.uid ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="contest-detail-team-button edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveEvaluationTarget(t);
                          }}
                        >
                          저장
                        </button>
                        <button 
                          className="contest-detail-team-button break"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingEvaluationTargetId(null);
                            setEditingEvaluationTargetNickname('');
                          }}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="contest-detail-team-button edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditEvaluationTarget(t);
                          }}
                        >
                          수정
                        </button>
                        <button 
                          className="contest-detail-team-button break"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEvaluationTarget(t.uid);
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              {evaluationTargets.filter(t => !teams.some(team => Array.isArray(team.members) && team.members.includes(t.uid))).length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '20px',
                  color: '#9CA3AF',
                  fontSize: '14px'
                }}>
                  아직 평가받는 대상이 없습니다.
                </div>
              )}
            </div>
            {selectedEvaluationTargets.length >= 2 && (
              <div className="contest-detail-duet-actions" style={{
                marginTop: '16px',
                padding: '16px',
                background: 'linear-gradient(135deg, #F6F2FF 0%, #F0F4FF 100%)',
                borderRadius: '12px',
                border: '2px solid #8A55CC',
                textAlign: 'center'
              }}>
                <div style={{
                  marginBottom: '12px',
                  color: '#6B21A8',
                  fontWeight: 600,
                  fontSize: '14px'
                }}>
                  {selectedEvaluationTargets.length}명이 선택되었습니다
                </div>
                <button 
                  className="btn btn-primary"
                  onClick={handleMakeTeamFromTargets}
                  style={{
                    background: 'linear-gradient(135deg, #8A55CC 0%, #7C4DBC 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 32px',
                    fontWeight: 700,
                    fontSize: '16px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(138, 85, 204, 0.3)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(138, 85, 204, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(138, 85, 204, 0.3)';
                  }}
                >
                  🎭 팀 만들기
                </button>
                <button
                  onClick={() => setSelectedEvaluationTargets([])}
                  style={{
                    marginTop: '8px',
                    background: 'transparent',
                    color: '#9CA3AF',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    padding: '6px 16px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  선택 취소
                </button>
              </div>
            )}
          </section>
        )}

        {/* 팀 목록 섹션 - 관리자만 표시 */}
        {isAdmin && teams.length > 0 && (
          <section className="contest-detail-section">
            <h3 className="contest-detail-section-title">🎭 팀 목록</h3>
            <hr className="contest-detail-section-divider" />
            <div className="contest-detail-team-list">
              {sortedTeams.map(team => {
                const teamSubmitted = Array.isArray(team.members) && team.members.some((uid: string) => {
                  const p = participants.find(pp => pp.uid === uid);
                  return p && isParticipantSubmitted(p.nickname);
                });
                return (
                  <div key={team.id} className="contest-detail-team-item">
                    <div className="contest-detail-team-members" style={{
                      fontWeight: 700,
                      fontSize: '18px',
                      color: '#8A55CC',
                      marginBottom: '8px'
                    }}>
                      {Array.isArray(team.members) ? team.members.map((uid: string) => {
                        // 평가받는 대상에서 먼저 찾기
                        const target = evaluationTargets.find(tt => tt.uid === uid);
                        if (target) return target.nickname;
                        // 없으면 참가자에서 찾기
                        const p = participants.find(pp => pp.uid === uid);
                        return p ? p.nickname : uid;
                      }).join(' & ') : ''}
                    </div>
                    {isAdmin && (
                      <div className="contest-detail-team-actions">
                        <button 
                          className="contest-detail-team-button break"
                          onClick={() => handleBreakDuet(team.id)}
                        >
                          팀 해제
                        </button>
                      </div>
                    )}
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

        {/* 솔로 참가자 섹션 - 관리자만 표시 */}
        {isAdmin && uniqueParticipants.filter(p => !teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid))).length > 0 && (
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