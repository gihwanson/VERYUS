import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, setDoc, doc as firestoreDoc, updateDoc, onSnapshot, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { v4 as uuidv4 } from 'uuid';
import '../styles/variables.css';
import '../styles/components.css';
import '../styles/contest-ui-refresh.css';

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
  order?: number; // 팀 순서 (낮을수록 위에 표시)
}

interface User {
  uid: string;
  email: string;
  nickname?: string;
  isLoggedIn: boolean;
  role?: string;
}

type AdminTab = 'participants' | 'targets' | 'teams';

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
  const [adminTab, setAdminTab] = useState<AdminTab>('participants');
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
    // 기존 팀들의 최대 order 값 계산 (없으면 현재 시간 사용)
    const maxOrder = teams.length > 0 
      ? Math.max(...teams.map(t => t.order ?? (t.createdAt?.toDate ? t.createdAt.toDate().getTime() : Date.now())))
      : Date.now();
    await setDoc(firestoreDoc(db, 'contests', id, 'teams', teamId), {
      teamName,
      members,
      createdAt: new Date(),
      updatedAt: new Date(),
      order: maxOrder + 1, // 새 팀은 맨 아래에 추가
    });
    setSelectedSolo([]);
  }, [id, selectedSolo, teams]);

  const handleBreakDuet = useCallback(async (teamId: string) => {
    if (!id) return;
    await deleteDoc(firestoreDoc(db, 'contests', id, 'teams', teamId));
  }, [id]);

  // 팀 삭제 (팀과 팀 멤버들을 evaluationTargets에서도 삭제)
  const handleDeleteTeam = useCallback(async (teamId: string) => {
    if (!id) return;
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    
    const teamMembers = Array.isArray(team.members) ? team.members.map((uid: string) => {
      const target = evaluationTargets.find(tt => tt.uid === uid);
      if (target) return target.nickname;
      const p = participants.find(pp => pp.uid === uid);
      return p ? p.nickname : uid;
    }).join(' & ') : '';
    
    if (!window.confirm(`정말로 이 팀(${teamMembers})을 삭제하시겠습니까?\n평가지에서도 제거됩니다.`)) return;
    
    try {
      // 팀 삭제
      await deleteDoc(firestoreDoc(db, 'contests', id, 'teams', teamId));
      
      // 팀 멤버들을 evaluationTargets에서도 삭제
      if (Array.isArray(team.members)) {
        for (const memberUid of team.members) {
          const target = evaluationTargets.find(tt => tt.uid === memberUid);
          if (target) {
            await deleteDoc(firestoreDoc(db, 'contests', id, 'evaluationTargets', memberUid));
          }
        }
      }
    } catch (error) {
      console.error('팀 삭제 중 오류:', error);
      alert('팀 삭제 중 오류가 발생했습니다.');
    }
  }, [id, teams, evaluationTargets, participants]);


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
    // 기존 팀들의 최대 order 값 계산 (없으면 현재 시간 사용)
    const maxOrder = teams.length > 0 
      ? Math.max(...teams.map(t => t.order ?? (t.createdAt?.toDate ? t.createdAt.toDate().getTime() : Date.now())))
      : Date.now();
    await setDoc(firestoreDoc(db, 'contests', id, 'teams', teamId), {
      teamName,
      members,
      createdAt: new Date(),
      updatedAt: new Date(),
      order: maxOrder + 1, // 새 팀은 맨 아래에 추가
    });
    setSelectedEvaluationTargets([]);
  }, [id, selectedEvaluationTargets, teams]);

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
    // uid 기준으로 먼저 중복 제거
    const byUid = participants.filter((p, idx, arr) => 
      arr.findIndex(pp => pp.uid === p.uid) === idx
    );
    
    // nickname 기준으로 추가 중복 제거 (nickname이 있는 경우)
    const byNickname = byUid.filter((p, idx, arr) => {
      if (!p.nickname) return true; // nickname이 없으면 유지
      return arr.findIndex(pp => 
        pp.nickname && 
        pp.nickname.toLowerCase().trim() === p.nickname.toLowerCase().trim()
      ) === idx;
    });
    
    return byNickname;
  }, [participants]);

  // 팀 목록을 순서(order) 기준으로 정렬하는 유틸
  const sortedTeams = useMemo(() => {
    // order가 없는 팀들을 위해 초기화
    const teamsWithOrder = teams.map((team, index) => {
      if (team.order === undefined) {
        // order가 없으면 createdAt 기준으로 초기값 설정
        const time = team.createdAt?.toDate ? team.createdAt.toDate().getTime() : (team.createdAt?.seconds ? team.createdAt.seconds * 1000 : 0);
        return { ...team, order: time };
      }
      return team;
    });
    
    // order 기준으로 정렬 (낮은 순서가 위에)
    return [...teamsWithOrder].sort((a, b) => {
      const aOrder = a.order ?? 0;
      const bOrder = b.order ?? 0;
      return aOrder - bOrder;
    });
  }, [teams]);

  const hasTeamItems = useMemo(
    () =>
      teams.length > 0 ||
      evaluationTargets.filter((t) => !teams.some((team) => Array.isArray(team.members) && team.members.includes(t.uid))).length > 0,
    [teams, evaluationTargets]
  );

  // 팀 순서 변경 함수
  const handleMoveTeam = useCallback(async (teamId: string, direction: 'up' | 'down') => {
    if (!id) return;
    
    const currentIndex = sortedTeams.findIndex(t => t.id === teamId);
    if (currentIndex === -1) return;
    
    if (direction === 'up' && currentIndex === 0) return; // 이미 맨 위
    if (direction === 'down' && currentIndex === sortedTeams.length - 1) return; // 이미 맨 아래
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const currentTeam = sortedTeams[currentIndex];
    const targetTeam = sortedTeams[targetIndex];
    
    // 두 팀의 order를 교환
    const currentOrder = currentTeam.order ?? 0;
    const targetOrder = targetTeam.order ?? 0;
    
    try {
      // 두 팀의 order를 업데이트
      await updateDoc(firestoreDoc(db, 'contests', id, 'teams', currentTeam.id), {
        order: targetOrder,
        updatedAt: new Date()
      });
      await updateDoc(firestoreDoc(db, 'contests', id, 'teams', targetTeam.id), {
        order: currentOrder,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('팀 순서 변경 중 오류:', error);
      alert('팀 순서 변경에 실패했습니다.');
    }
  }, [id, sortedTeams]);

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
      const participantsData = snap.docs.map(doc => {
        const data = doc.data();
        return {
          uid: data.uid || doc.id,
          nickname: data.nickname || '',
          joinedAt: data.joinedAt || null
        } as Participant;
      });
      setParticipants(participantsData);
      console.log('참가자 목록 업데이트:', participantsData.length, '명');
    });
    
    // 평가받는 대상 목록 실시간 구독
    const unsubEvaluationTargets = onSnapshot(collection(db, 'contests', id, 'evaluationTargets'), snap => {
      setEvaluationTargets(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as EvaluationTarget[]);
    });
    
    // 팀 목록 실시간 구독
    const unsubTeams = onSnapshot(collection(db, 'contests', id, 'teams'), snap => {
      setTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Team[]);
    });
    
    // 참가자별 제출완료 여부 실시간 구독 (grades 컬렉션에서 evaluator == 참가자 닉네임)
    const unsubGrades = onSnapshot(collection(db, 'contests', id, 'grades'), (snap) => {
      try {
        // evaluator(닉네임) 기준으로 제출완료자 목록 추출
        const evaluators = snap.docs.map(doc => doc.data().evaluator);
        setSubmittedUids(Array.from(new Set(evaluators)));
      } catch (error) {
        console.error('제출 상태 확인 중 오류:', error);
      }
    });
    
    return () => { 
      unsubContest();
      unsub(); 
      unsubEvaluationTargets();
      unsubTeams();
      unsubGrades();
    };
  }, [id]);

  useEffect(() => {
    if (soloListRef.current) {
      soloListRef.current.scrollTop = soloListRef.current.scrollHeight;
    }
  }, [participants.length]);

  useEffect(() => {
    if (!isAdmin) return;
    if (contest?.type !== '경연' && adminTab !== 'participants') {
      setAdminTab('participants');
    }
  }, [contest?.type, adminTab, isAdmin]);

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
    <div className="contest-detail-container contest-ui-refresh">
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
                className="btn btn-success contest-start-btn" 
                onClick={handleStartContest}
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
          <section className="contest-detail-section contest-info-section">
            <div className="contest-info-card">
              <h3 className="contest-info-title">
                🎭 경연 유형 안내
              </h3>
              <ul className="contest-info-list">
                <li>경연은 참가자들이 서로 평가하는 콘테스트입니다</li>
                <li>솔로 참가 또는 듀엣 팀 구성이 가능합니다</li>
                <li>각 참가자는 다른 참가자/팀을 평가합니다 (본인/본인 팀 제외)</li>
                <li>0~100점 사이로 점수를 부여할 수 있습니다</li>
              </ul>
            </div>
          </section>
        )}

        {isAdmin && (
          <section className="contest-detail-section">
            <div className="contest-admin-tabs">
              <button
                type="button"
                className={`contest-admin-tab-btn ${adminTab === 'participants' ? 'active' : ''}`}
                onClick={() => setAdminTab('participants')}
              >
                참가자현황
              </button>
              {contest.type === '경연' && (
                <>
                  <button
                    type="button"
                    className={`contest-admin-tab-btn ${adminTab === 'targets' ? 'active' : ''}`}
                    onClick={() => setAdminTab('targets')}
                  >
                    참가자 관리
                  </button>
                  <button
                    type="button"
                    className={`contest-admin-tab-btn ${adminTab === 'teams' ? 'active' : ''}`}
                    onClick={() => setAdminTab('teams')}
                  >
                    팀 목록
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {/* 참가자현황 섹션 (평가하는 인원) */}
        {isAdmin && adminTab === 'participants' && (
          <section className="contest-detail-section">
            <h3 className="contest-detail-section-title">👥 참가자현황</h3>
            <hr className="contest-detail-section-divider" />
            
            {/* 경연 유형: 입장 제한/허용 토글 버튼 */}
            {contest.type === '경연' && (
              <>
                <div className="contest-entry-toggle-row">
                  <button
                    onClick={async () => {
                      if (!id) return;
                      const newStatus = !entryRestricted;
                      await updateDoc(doc(db, 'contests', id), { entryRestricted: newStatus });
                      setEntryRestricted(newStatus);
                      alert(newStatus ? '입장이 제한되었습니다.' : '입장이 가능해졌습니다.');
                    }}
                    className={`contest-entry-toggle-btn ${entryRestricted ? 'restricted' : 'opened'}`}
                  >
                    {entryRestricted ? '🔒 입장제한' : '✅ 입장가능'}
                  </button>
                  <div className={`contest-entry-toggle-status ${entryRestricted ? 'restricted' : 'opened'}`}>
                    {entryRestricted ? '현재 입장이 제한된 상태입니다.' : '현재 입장이 가능한 상태입니다.'}
                  </div>
                </div>
                <div className="contest-helper-box">
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
            <div className="contest-list-header-box">
              <div className="contest-list-header-title">
                📋 실시간 참가자 명단 ({uniqueParticipants.length}명)
              </div>
            </div>
            <div className="contest-detail-participant-list" ref={soloListRef}>
              {uniqueParticipants
                .map(p => {
                  const isSubmitted = isParticipantSubmitted(p.nickname);
                  const isInTeam = teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid));
                  const teamInfo = teams.find(t => Array.isArray(t.members) && t.members.includes(p.uid));
                  return (
                    <div 
                      key={p.uid} 
                      className={`contest-detail-participant-item ${selectedSolo.includes(p.uid) ? 'selected' : ''} ${isInTeam ? 'in-team' : ''}`}
                      onClick={() => handleParticipantClick(p.uid)}
                    >
                      <span className="contest-detail-participant-name">
                        {p.nickname}
                        {isInTeam && teamInfo && (
                          <span className="contest-team-member-badge">
                            (팀 소속)
                          </span>
                        )}
                      </span>
                      <span className={`contest-detail-participant-status ${isSubmitted ? 'submitted' : 'pending'}`}>
                        {isSubmitted ? '✅ 제출완료' : '⏳ 대기중'}
                      </span>
                      <button 
                        className={`contest-detail-team-button break ${contest.type === '경연' ? 'danger' : ''}`}
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
                      >
                        {contest.type === '경연' ? '강퇴' : '삭제'}
                      </button>
                    </div>
                  );
                })}
              {uniqueParticipants.length === 0 && (
                <div className="contest-empty-message">
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
        {isAdmin && contest.type === '경연' && adminTab === 'targets' && (
          <section className="contest-detail-section">
            <h3 className="contest-detail-section-title">🎯 참가자 관리</h3>
            <hr className="contest-detail-section-divider" />
            <div className="contest-helper-box">
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
            <div className="contest-list-header-box">
              <div className="contest-list-header-title">
                📋 평가받는 대상 목록 ({evaluationTargets.length}명)
              </div>
              {selectedEvaluationTargets.length > 0 && (
                <div className="contest-selection-hint selected">
                  ✅ {selectedEvaluationTargets.length}명 선택됨 {selectedEvaluationTargets.length >= 2 && '(팀 만들기 가능)'}
                </div>
              )}
              {selectedEvaluationTargets.length === 0 && (
                <div className="contest-selection-hint">
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
                    className={`contest-detail-participant-item ${selectedEvaluationTargets.includes(t.uid) ? 'selected' : ''} ${editingEvaluationTargetId === t.uid ? 'editing' : ''}`}
                    onClick={() => handleEvaluationTargetClick(t.uid)}
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
                      <div className="contest-inline-actions">
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
                      <div className="contest-inline-actions">
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
                <div className="contest-empty-message">
                  아직 평가받는 대상이 없습니다.
                </div>
              )}
            </div>
            {selectedEvaluationTargets.length >= 2 && (
              <div className="contest-targets-action-panel">
                <div className="contest-targets-action-title">
                  {selectedEvaluationTargets.length}명이 선택되었습니다
                </div>
                <button 
                  className="btn btn-primary contest-targets-create-btn"
                  onClick={handleMakeTeamFromTargets}
                >
                  🎭 팀 만들기
                </button>
                <button
                  onClick={() => setSelectedEvaluationTargets([])}
                  className="contest-targets-cancel-btn"
                >
                  선택 취소
                </button>
              </div>
            )}
          </section>
        )}

        {/* 팀 목록 섹션 - 관리자만 표시 (팀 + evaluationTargets의 솔로참가자만 포함) */}
        {isAdmin && contest.type === '경연' && adminTab === 'teams' && hasTeamItems && (
          <section className="contest-detail-section">
            <h3 className="contest-detail-section-title">🎭 팀 목록</h3>
            <hr className="contest-detail-section-divider" />
            <div className="contest-detail-team-list">
              {/* 팀 목록 */}
              {sortedTeams.map((team, index) => {
                const teamSubmitted = Array.isArray(team.members) && team.members.some((uid: string) => {
                  const target = evaluationTargets.find(tt => tt.uid === uid);
                  if (target) {
                    const p = participants.find(pp => pp.nickname === target.nickname);
                    return p && isParticipantSubmitted(p.nickname);
                  }
                  return false;
                });
                const canMoveUp = index > 0;
                const canMoveDown = index < sortedTeams.length - 1;
                return (
                  <div key={team.id} className="contest-detail-team-item">
                    <div className="contest-team-head">
                      <div className="contest-detail-team-members contest-team-members-strong">
                        {Array.isArray(team.members) ? team.members.map((uid: string) => {
                          // 평가받는 대상에서만 찾기 (participants는 사용하지 않음)
                          const target = evaluationTargets.find(tt => tt.uid === uid);
                          return target ? target.nickname : uid;
                        }).join(' & ') : ''}
                      </div>
                      {isAdmin && (
                        <div className="contest-team-move-controls">
                          <button
                            onClick={() => handleMoveTeam(team.id, 'up')}
                            disabled={!canMoveUp}
                            className={`contest-team-move-btn ${canMoveUp ? 'enabled' : 'disabled'}`}
                            title="위로 이동"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => handleMoveTeam(team.id, 'down')}
                            disabled={!canMoveDown}
                            className={`contest-team-move-btn ${canMoveDown ? 'enabled' : 'disabled'}`}
                            title="아래로 이동"
                          >
                            ↓
                          </button>
                        </div>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="contest-detail-team-actions contest-inline-actions">
                        <button 
                          className="contest-detail-team-button break"
                          onClick={() => handleBreakDuet(team.id)}
                        >
                          팀 해제
                        </button>
                        <button 
                          className="contest-detail-team-button break danger"
                          onClick={() => handleDeleteTeam(team.id)}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                    <div className="contest-team-status-wrap">
                      <span className={`contest-detail-participant-status ${teamSubmitted ? 'submitted' : 'pending'}`}>
                        {teamSubmitted ? '✅ 제출완료' : '⏳ 대기중'}
                      </span>
                    </div>
                  </div>
                );
              })}
              {/* 솔로 참가자 목록 (evaluationTargets만 표시) */}
              {evaluationTargets
                .filter(t => !teams.some(team => Array.isArray(team.members) && team.members.includes(t.uid)))
                .map(t => {
                  // evaluationTargets의 닉네임으로 participants에서 찾아서 제출 상태 확인
                  const p = participants.find(pp => pp.nickname === t.nickname);
                  const isSubmitted = p ? isParticipantSubmitted(p.nickname) : false;
                  return (
                    <div key={t.uid} className="contest-detail-team-item">
                      <div className="contest-detail-team-members contest-team-members-strong contest-team-members-solo">
                        {t.nickname}
                      </div>
                      {isAdmin && (
                        <div className="contest-detail-team-actions contest-inline-actions">
                          <button 
                            className="contest-detail-team-button break danger"
                            onClick={() => handleDeleteEvaluationTarget(t.uid)}
                          >
                            삭제
                          </button>
                        </div>
                      )}
                      <div className="contest-team-status-wrap">
                        <span className={`contest-detail-participant-status ${isSubmitted ? 'submitted' : 'pending'}`}>
                          {isSubmitted ? '✅ 제출완료' : '⏳ 대기중'}
                        </span>
                      </div>
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