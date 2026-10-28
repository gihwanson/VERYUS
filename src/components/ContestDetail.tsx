import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, setDoc, doc as firestoreDoc, updateDoc, onSnapshot, deleteDoc, query, where, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { v4 as uuidv4 } from 'uuid';
import '../styles/variables.css';
import '../styles/contest-ui-refresh.css';
import type { ContestType, RoundVote } from '../types/contest';
import { contestTypeLabel } from '../types/contest';
import {
  canAutoJoinBeforeStart,
  dedupeContestParticipants,
  parseRoundVoteFromDoc,
  parseParticipantFromDoc,
  participantMatchesRoundVote,
  CONTEST_SUBMISSION_DONE_MESSAGE,
  hasFinalContestSubmission,
  registerOnParticipateClick,
  coerceFirestoreString,
} from '../utils/contestParticipant';
import RoundMatchLeaderPanel from './roundMatch/RoundMatchLeaderPanel';
import {
  assignContestStageUid,
  CONTEST_SUB_ROLES,
  formatContestStageInline,
  formatContestStageLines,
  contestStageRoleToggleStep,
  type ContestSubRole,
} from '../utils/contestStage';

interface Contest {
  id: string;
  title: string;
  type: ContestType;
  deadline: any;
  createdBy: string;
  ended?: boolean;
  isStarted: boolean;
  currentRoundId?: string | null;
  currentRoundNumber?: number;
  defaultTeamAName?: string;
  defaultTeamBName?: string;
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
  mainUid?: string;
  subUid?: string;
  coMainUid?: string;
  partnerRole?: 'main' | 'sub';
  subRole?: string;
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
  const [participantMainUid, setParticipantMainUid] = useState('');
  const [participantSubUid, setParticipantSubUid] = useState('');
  const [participantSubRole, setParticipantSubRole] = useState<ContestSubRole | ''>('');
  const [targetMainUid, setTargetMainUid] = useState('');
  const [targetSubUid, setTargetSubUid] = useState('');
  const [waitingMainName, setWaitingMainName] = useState('');
  const targetStagePickRef = useRef({ mainUid: '', subUid: '' });
  const pendingMainUidRef = useRef('');
  const makingTargetStageRef = useRef(false);
  const createTargetStageRef = useRef<
    (mainUid: string, partnerUid: string, bothMains: boolean) => Promise<boolean>
  >(async () => false);
  const [newParticipantNickname, setNewParticipantNickname] = useState('');
  const [newEvaluationTargetNickname, setNewEvaluationTargetNickname] = useState('');
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [addingEvaluationTarget, setAddingEvaluationTarget] = useState(false);
  const [editingEvaluationTargetId, setEditingEvaluationTargetId] = useState<string | null>(null);
  const [editingEvaluationTargetNickname, setEditingEvaluationTargetNickname] = useState<string>('');
  const [isStarted, setIsStarted] = useState(false);
  const [submittedUids, setSubmittedUids] = useState<string[]>([]);
  const [roundVotes, setRoundVotes] = useState<RoundVote[]>([]);
  const [entryRestricted, setEntryRestricted] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>('participants');
  const [startingContest, setStartingContest] = useState(false);
  const [finalSubmitted, setFinalSubmitted] = useState(false);
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

  useEffect(() => {
    if (!id || !user?.uid) {
      setFinalSubmitted(false);
      return;
    }
    const unsub = onSnapshot(doc(db, 'contests', id, 'submissionLocks', user.uid), (snap) => {
      setFinalSubmitted(snap.exists());
    });
    return () => unsub();
  }, [id, user?.uid]);

  const nicknameOf = useCallback((uid: string) => {
    const target = evaluationTargets.find((item) => item.uid === uid);
    if (target?.nickname) return target.nickname;
    const participant = participants.find((item) => item.uid === uid);
    if (participant?.nickname) return participant.nickname;
    return uid;
  }, [evaluationTargets, participants]);

  const nextTeamOrder = useCallback(() => {
    if (teams.length === 0) return Date.now();
    return Math.max(...teams.map((team) => {
      if (team.order !== undefined) return team.order;
      if (team.createdAt?.toDate) return team.createdAt.toDate().getTime();
      return Date.now();
    })) + 1;
  }, [teams]);

  // Callbacks
  const handleParticipate = useCallback(async () => {
    if (!contest || !user) return;

    const isLeaderUser = user.role === '리더';

    try {
      if (user.uid && await hasFinalContestSubmission(contest.id, user.uid)) {
        alert(CONTEST_SUBMISSION_DONE_MESSAGE);
        return;
      }

      await registerOnParticipateClick(contest.id, contest, user);

      if (!contest.isStarted && !isLeaderUser) {
        alert('콘테스트가 아직 개최되지 않았습니다. 리더가 개최할 때까지 기다려주세요.');
        return;
      }

      navigate(`/contests/${contest.id}/participate`);
    } catch (error) {
      console.error('참가 처리 중 오류:', error);
      alert('참가 처리 중 오류가 발생했습니다.');
    }
  }, [contest, user, navigate, participants]);

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
    if (!id || !contest || startingContest) return;
    if (!window.confirm('콘테스트를 개최하시겠습니까? 개최 후에는 앱에 로그인한 사용자 누구나 참여할 수 있습니다.')) {
      return;
    }

    setStartingContest(true);
    try {
      if (contest.type === '라운드매치') {
        const roundId = uuidv4();
        const teamA = contest.defaultTeamAName?.trim() || 'A팀';
        const teamB = contest.defaultTeamBName?.trim() || 'B팀';
        await setDoc(firestoreDoc(db, 'contests', id, 'rounds', roundId), {
          roundNumber: 1,
          teamAName: teamA,
          teamBName: teamB,
          status: 'voting',
          createdAt: new Date(),
        });
        await updateDoc(doc(db, 'contests', id), {
          isStarted: true,
          currentRoundId: roundId,
          currentRoundNumber: 1,
        });
      } else {
        await updateDoc(doc(db, 'contests', id), { isStarted: true });
      }

      setIsStarted(true);
      alert('콘테스트가 개최되었습니다!');
    } catch (error) {
      console.error('콘테스트 개최 중 오류:', error);
      alert('콘테스트 개최에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setStartingContest(false);
    }
  }, [id, contest, startingContest]);

  const handleMakeDuet = useCallback(async () => {
    if (!id || selectedSolo.length !== 2) return;
    const teamId = uuidv4();
    await setDoc(firestoreDoc(db, 'contests', id, 'teams', teamId), {
      teamName: `듀엣${teams.length + 1}`,
      members: selectedSolo,
      createdAt: new Date(),
      updatedAt: new Date(),
      order: nextTeamOrder(),
    });
    setSelectedSolo([]);
  }, [id, selectedSolo, teams.length, nextTeamOrder]);

  const handleMakeParticipantStage = useCallback(async () => {
    if (!id || !participantMainUid || !participantSubUid || !participantSubRole) return;
    if (participantMainUid === participantSubUid) return;
    const teamId = uuidv4();
    await setDoc(firestoreDoc(db, 'contests', id, 'teams', teamId), {
      teamName: `듀엣${teams.length + 1}`,
      members: [participantMainUid, participantSubUid],
      mainUid: participantMainUid,
      subUid: participantSubUid,
      subRole: participantSubRole,
      createdAt: new Date(),
      updatedAt: new Date(),
      order: nextTeamOrder(),
    });
    setParticipantMainUid('');
    setParticipantSubUid('');
    setParticipantSubRole('');
  }, [id, participantMainUid, participantSubUid, participantSubRole, teams.length, nextTeamOrder]);

  // 팀 삭제 (팀과 팀 멤버들을 evaluationTargets에서도 삭제)
  const handleDeleteTeam = useCallback(async (teamId: string) => {
    if (!id) return;
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    
    const teamMembers = formatContestStageInline(team, nicknameOf)
      || (Array.isArray(team.members) ? team.members.map((uid) => nicknameOf(uid)).join(' & ') : '');
    
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
  }, [id, teams, nicknameOf, evaluationTargets]);


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

  // 평가받는 대상 추가. 대기 중인 메인이 없으면 메인, 있으면 그 메인의 서브로 팀을 만든다.
  const handleAddEvaluationTarget = useCallback(async () => {
    if (!id || !newEvaluationTargetNickname.trim()) return;
    setAddingEvaluationTarget(true);

    const normalizedNickname = newEvaluationTargetNickname.trim();
    const docId = 'target_' + normalizedNickname.toLowerCase().replace(/\s/g, '_') + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const waitingMainUid = pendingMainUidRef.current;
    const pairAsSub = Boolean(
      waitingMainUid &&
      waitingMainUid !== docId &&
      !teams.some((team) => Array.isArray(team.members) && team.members.includes(waitingMainUid))
    );
    if (pairAsSub) pendingMainUidRef.current = '';
    else pendingMainUidRef.current = docId;

    try {
      const targetRef = firestoreDoc(db, 'contests', id, 'evaluationTargets', docId);
      await setDoc(targetRef, {
        nickname: normalizedNickname,
        uid: docId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setNewEvaluationTargetNickname('');

      if (pairAsSub) {
        const paired = await createTargetStageRef.current(waitingMainUid, docId, false);
        if (!paired) {
          pendingMainUidRef.current = waitingMainUid;
          targetStagePickRef.current = { mainUid: waitingMainUid, subUid: '' };
          setTargetMainUid(waitingMainUid);
          setTargetSubUid('');
        } else {
          setWaitingMainName('');
        }
      } else {
        targetStagePickRef.current = { mainUid: docId, subUid: '' };
        setTargetMainUid(docId);
        setTargetSubUid('');
        setWaitingMainName(normalizedNickname);
      }
    } catch (error) {
      if (pairAsSub) pendingMainUidRef.current = waitingMainUid;
      else if (pendingMainUidRef.current === docId) pendingMainUidRef.current = '';
      console.error('평가 대상 추가 중 오류:', error);
      alert('평가 대상 추가 중 오류가 발생했습니다.');
    } finally {
      setAddingEvaluationTarget(false);
    }
  }, [id, newEvaluationTargetNickname, teams]);

  // 평가받는 대상 삭제
  const handleDeleteEvaluationTarget = useCallback(async (uid: string) => {
    if (!id) return;
    if (!window.confirm('정말로 이 평가 대상을 삭제하시겠습니까?')) return;
    
    try {
      await deleteDoc(firestoreDoc(db, 'contests', id, 'evaluationTargets', uid));
      if (pendingMainUidRef.current === uid) {
        pendingMainUidRef.current = '';
        targetStagePickRef.current = { mainUid: '', subUid: '' };
        setTargetMainUid('');
        setTargetSubUid('');
        setWaitingMainName('');
      }
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

  const createTargetStage = useCallback(async (mainUid: string, partnerUid: string, bothMains: boolean) => {
    if (!id || makingTargetStageRef.current) return false;
    if (!mainUid || !partnerUid || mainUid === partnerUid) return false;
    makingTargetStageRef.current = true;
    try {
      const teamId = uuidv4();
      await setDoc(firestoreDoc(db, 'contests', id, 'teams', teamId), {
        teamName: `듀엣${teams.length + 1}`,
        members: [mainUid, partnerUid],
        mainUid,
        partnerRole: bothMains ? 'main' : 'sub',
        ...(bothMains ? { coMainUid: partnerUid } : { subUid: partnerUid }),
        createdAt: new Date(),
        updatedAt: new Date(),
        order: nextTeamOrder(),
      });
      if (pendingMainUidRef.current === mainUid || pendingMainUidRef.current === partnerUid) {
        pendingMainUidRef.current = '';
      }
      targetStagePickRef.current = { mainUid: '', subUid: '' };
      setTargetMainUid('');
      setTargetSubUid('');
      setWaitingMainName('');
      return true;
    } catch (error) {
      console.error('무대 만들기 중 오류:', error);
      targetStagePickRef.current = { mainUid, subUid: '' };
      pendingMainUidRef.current = mainUid;
      setTargetMainUid(mainUid);
      setTargetSubUid('');
      alert('팀을 만드는 중 오류가 발생했습니다.');
      return false;
    } finally {
      makingTargetStageRef.current = false;
    }
  }, [id, teams.length, nextTeamOrder]);

  createTargetStageRef.current = createTargetStage;

  const handleEvaluationTargetClick = useCallback((uid: string) => {
    if (makingTargetStageRef.current) return;
    if (uid === targetStagePickRef.current.mainUid) {
      targetStagePickRef.current = { mainUid: '', subUid: '' };
      pendingMainUidRef.current = '';
      setTargetMainUid('');
      setTargetSubUid('');
      setWaitingMainName('');
      return;
    }
    const mainUid = targetStagePickRef.current.mainUid;
    if (mainUid) {
      void createTargetStage(mainUid, uid, false);
      return;
    }
    targetStagePickRef.current = { mainUid: uid, subUid: '' };
    pendingMainUidRef.current = uid;
    setTargetMainUid(uid);
    setTargetSubUid('');
    setWaitingMainName(nicknameOf(uid));
  }, [createTargetStage, nicknameOf]);

  const handleToggleContestRole = useCallback(async (team: Team) => {
    if (!id) return;
    const members = Array.isArray(team.members) ? team.members.filter(Boolean) : [];
    if (members.length < 2) return;
    const [firstUid, secondUid] = members;
    const step = contestStageRoleToggleStep(team);
    if (!step) return;
    const mainUid = (team.mainUid || firstUid).trim();
    const partnerUid = (team.coMainUid || team.subUid || members.find((uid) => uid !== mainUid) || secondUid).trim();

    try {
      if (step === 'to-default-sub') {
        await updateDoc(firestoreDoc(db, 'contests', id, 'teams', team.id), {
          mainUid,
          subUid: partnerUid,
          partnerRole: 'sub',
          coMainUid: deleteField(),
          updatedAt: new Date(),
        });
      } else if (step === 'swap-sub') {
        await updateDoc(firestoreDoc(db, 'contests', id, 'teams', team.id), {
          mainUid: secondUid,
          subUid: firstUid,
          partnerRole: 'sub',
          coMainUid: deleteField(),
          updatedAt: new Date(),
        });
      } else {
        await updateDoc(firestoreDoc(db, 'contests', id, 'teams', team.id), {
          mainUid: firstUid,
          coMainUid: secondUid,
          partnerRole: 'main',
          subUid: deleteField(),
          subRole: deleteField(),
          updatedAt: new Date(),
        });
      }
    } catch (error) {
      console.error('메인 구성 변경 중 오류:', error);
      alert('메인 구성을 바꾸는 중 오류가 발생했습니다.');
    }
  }, [id]);

  const handleSplitTeamToSolos = useCallback(async (teamId: string) => {
    if (!id) return;
    try {
      await deleteDoc(firestoreDoc(db, 'contests', id, 'teams', teamId));
      pendingMainUidRef.current = '';
      targetStagePickRef.current = { mainUid: '', subUid: '' };
      setTargetMainUid('');
      setTargetSubUid('');
      setWaitingMainName('');
    } catch (error) {
      console.error('솔로 전환 중 오류:', error);
      alert('솔로로 바꾸는 중 오류가 발생했습니다.');
    }
  }, [id]);

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

  // 참가자 목록 중복 제거 (동일 닉네임 시 Auth UID 참가자 우선)
  const uniqueParticipants = useMemo(
    () => dedupeContestParticipants(participants),
    [participants]
  );

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
      const participantsData = snap.docs.map((docSnap) => {
        const parsed = parseParticipantFromDoc(docSnap.id, docSnap.data() as Record<string, unknown>);
        return {
          ...parsed,
          joinedAt: parsed.joinedAt ?? null,
        } as Participant;
      });
      setParticipants(participantsData);
      console.log('참가자 목록 업데이트:', participantsData.length, '명');
    });
    
    // 평가받는 대상 목록 실시간 구독
    const unsubEvaluationTargets = onSnapshot(collection(db, 'contests', id, 'evaluationTargets'), snap => {
      setEvaluationTargets(
        snap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            uid: docSnap.id,
            nickname: coerceFirestoreString(data.nickname),
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          } as EvaluationTarget;
        })
      );
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
    if (!id || contest?.type !== '라운드매치' || !contest.currentRoundId) {
      setRoundVotes([]);
      return;
    }
    const unsubVotes = onSnapshot(
      collection(db, 'contests', id, 'rounds', contest.currentRoundId, 'votes'),
      (snap) => {
        setRoundVotes(snap.docs.map((d) => parseRoundVoteFromDoc(d.id, d.data())));
      }
    );
    return () => unsubVotes();
  }, [id, contest?.type, contest?.currentRoundId]);

  const hasRoundVote = useCallback(
    (p: Participant) => roundVotes.some((v) => participantMatchesRoundVote(p, v)),
    [roundVotes]
  );

  useEffect(() => {
    if (soloListRef.current) {
      soloListRef.current.scrollTop = soloListRef.current.scrollHeight;
    }
  }, [participants.length]);

  useEffect(() => {
    if (!isAdmin) return;
    if (contest?.type !== '경연' && contest?.type !== '라운드매치' && adminTab !== 'participants') {
      setAdminTab('participants');
    }
  }, [contest?.type, adminTab, isAdmin]);

  if (!contest) {
    return (
      <div className="contest-detail-container contest-ui-refresh">
        <div className="contest-detail-content">
          <div className="contest-loading-state" aria-busy="true">
            <div className="contest-loading-spinner" />
            <span>콘테스트 정보를 불러오는 중...</span>
          </div>
        </div>
      </div>
    );
  }

  const detailStatusClass = ended
    ? 'contest-list-card__status--ended'
    : contest.isStarted
      ? 'contest-list-card__status--live'
      : 'contest-list-card__status--waiting';
  const detailStatusLabel = ended ? '종료됨' : contest.isStarted ? '개최됨' : '대기 중';
  const deadlineText = formatDeadline(contest.deadline);

  return (
    <div className="contest-detail-container contest-ui-refresh">
      <div className="contest-detail-pattern" />
      <div className="contest-detail-content">
        <button
          type="button"
          className="contest-back-button"
          onClick={() => navigate('/contests')}
        >
          ← 콘테스트 목록으로
        </button>

        <div className="contest-detail-summary-card">
          <div className="contest-detail-summary-head">
            <h2 className="contest-detail-title">{contest.title}</h2>
            <span className={`contest-list-card__status ${detailStatusClass}`}>{detailStatusLabel}</span>
          </div>
          <div className="contest-detail-summary-meta">
            <span className="contest-tag type">{contestTypeLabel(contest.type)}</span>
            {deadlineText ? (
              <span className="contest-detail-summary-deadline">마감 {deadlineText}</span>
            ) : null}
          </div>
          <div className="contest-detail-summary-actions contest-buttons">
            {!ended && (
              finalSubmitted ? (
                <span className="contest-submit-done-note">{CONTEST_SUBMISSION_DONE_MESSAGE}</span>
              ) : (
                <button type="button" className="contest-button participate" onClick={handleParticipate}>
                  참여
                </button>
              )
            )}
            {(contest.type !== '라운드매치' || isLeader) && (
              <button
                type="button"
                className="contest-button detail"
                onClick={() => navigate(`/contests/${contest.id}/results`)}
              >
                결과 보기
              </button>
            )}
            {isLeader && !contest.isStarted && !ended && (
              <button
                type="button"
                className="contest-button participate contest-start-btn"
                onClick={handleStartContest}
                disabled={startingContest}
              >
                {startingContest ? '개최 중...' : '콘테스트 개최'}
              </button>
            )}
            {isAdmin && (
              <button type="button" className="contest-button end" onClick={handleDeleteContest}>
                삭제
              </button>
            )}
          </div>
        </div>

        {/* 경연 유형 안내 */}
        {contest.type === '경연' && (
          <section className="contest-detail-section contest-info-section">
            <div className="contest-info-card">
              <h3 className="contest-info-title">등급전 안내</h3>
              <ul className="contest-info-list">
                <li>현장에서 라이브를 듣고 점수를 줍니다</li>
                <li>솔로, 메인과 서브, 또는 서로 메인이 한 무대를 이룹니다</li>
                <li>메인과 서브는 점수 하나, 서로 메인은 사람마다 점수 하나입니다</li>
                <li>0~100점 사이로 점수를 부여할 수 있습니다</li>
              </ul>
            </div>
          </section>
        )}

        {contest.type === '라운드매치' && (
          <section className="contest-detail-section contest-info-section">
            <div className="contest-info-card">
              <h3 className="contest-info-title">라운드매치 안내</h3>
              <ul className="contest-info-list">
                <li>참여 버튼을 누른 멤버가 참가자 목록에 표시됩니다</li>
                <li>등록된 참가자가 A팀/B팀 중 하나에 투표합니다</li>
                <li>리더가 라운드 종료 → 결과 공개 → 다음 라운드를 진행합니다</li>
                <li>라운드마다 다른 팀 이름으로 새 대결을 진행할 수 있습니다</li>
              </ul>
            </div>
          </section>
        )}

        {isLeader && contest.type === '라운드매치' && !ended && (
          <RoundMatchLeaderPanel
            contestId={contest.id}
            currentRoundId={contest.currentRoundId}
            participants={uniqueParticipants}
            ended={ended}
            onEndContest={handleEndContest}
          />
        )}

        {isAdmin && (
          <section className="contest-detail-section contest-detail-admin-bar">
            {contest.type === '경연' && (
              <div className="contest-admin-tabs contest-admin-tabs--segmented">
                <button
                  type="button"
                  className={`contest-admin-tab-btn ${adminTab === 'participants' ? 'active' : ''}`}
                  onClick={() => setAdminTab('participants')}
                >
                  평가자
                </button>
                <button
                  type="button"
                  className={`contest-admin-tab-btn ${adminTab === 'targets' ? 'active' : ''}`}
                  onClick={() => setAdminTab('targets')}
                >
                  평가 대상
                </button>
                <button
                  type="button"
                  className={`contest-admin-tab-btn ${adminTab === 'teams' ? 'active' : ''}`}
                  onClick={() => setAdminTab('teams')}
                >
                  팀 목록
                </button>
              </div>
            )}
          </section>
        )}

        {/* 참가자현황 섹션 (평가하는 인원) */}
        {isAdmin && adminTab === 'participants' && (
          <section className="contest-detail-section">
            <h3 className="contest-section-label">{contest.type === '경연' ? '평가자' : '참가자'}</h3>
            
            <div className="contest-helper-box">
              {contest.type === '경연' && (
                <>
                  💡 점수를 주는 사람입니다. 노래를 평가받는 사람은 평가 대상 탭에서 등록합니다.
                  <br />
                </>
              )}
              {canAutoJoinBeforeStart(contest.type) ? (
                <>💡 개최 후 참여한 멤버는 이 명단에 자동으로 들어옵니다. 미리 등록하지 않아도 됩니다.</>
              ) : (
                <>💡 참가자는 관리자가 닉네임을 추가해 등록합니다. 개최 후 늦게 참여할 멤버도 여기서 추가할 수 있습니다.</>
              )}
            </div>

            <div className="contest-detail-add-form">
              <input
                type="text"
                className="contest-detail-add-input"
                placeholder={contest.type === '경연' ? '평가자 닉네임을 입력하세요' : '참가자 닉네임을 입력하세요'}
                value={newParticipantNickname}
                onChange={(e) => setNewParticipantNickname(e.target.value)}
                onKeyDown={(e) => !e.nativeEvent.isComposing && e.key === 'Enter' && handleAddParticipant()}
              />
              <button
                className="contest-detail-add-button"
                onClick={handleAddParticipant}
                disabled={addingParticipant || !newParticipantNickname.trim()}
              >
                {addingParticipant ? '추가 중...' : '추가'}
              </button>
            </div>

            {/* 실시간 참가자 명단 */}
            <div className="contest-list-header-box">
              <div className="contest-list-header-title">
                {contest.type === '경연' ? '평가자' : '참가자'} 명단 ({uniqueParticipants.length}명)
              </div>
            </div>
            <div className="contest-detail-participant-list" ref={soloListRef}>
              {uniqueParticipants
                .map(p => {
                  const isSubmitted =
                    contest.type === '라운드매치'
                      ? hasRoundVote(p)
                      : isParticipantSubmitted(p.nickname);
                  const isInTeam = teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid));
                  const teamInfo = teams.find(t => Array.isArray(t.members) && t.members.includes(p.uid));
                  const isStagePick = contest.type === '경연'
                    && (p.uid === participantMainUid || p.uid === participantSubUid);
                  return (
                    <div 
                      key={p.uid} 
                      className={`contest-detail-participant-item ${contest.type === '경연' ? (isStagePick ? 'selected' : '') : (selectedSolo.includes(p.uid) ? 'selected' : '')} ${isInTeam ? 'in-team' : ''}`}
                      onClick={() => {
                        if (contest.type === '경연') {
                          const next = assignContestStageUid(participantMainUid, participantSubUid, p.uid);
                          setParticipantMainUid(next.mainUid);
                          setParticipantSubUid(next.subUid);
                          return;
                        }
                        handleParticipantClick(p.uid);
                      }}
                    >
                      <span className="contest-detail-participant-name">
                        {p.nickname}
                        {contest.type === '경연' && p.uid === participantMainUid && (
                          <span className="contest-stage-role-badge">메인</span>
                        )}
                        {contest.type === '경연' && p.uid === participantSubUid && (
                          <span className="contest-stage-role-badge contest-stage-role-badge--sub">서브</span>
                        )}
                        {isInTeam && teamInfo && (
                          <span className="contest-team-member-badge">
                            (팀 소속)
                          </span>
                        )}
                      </span>
                      <div className="contest-detail-participant-trailing">
                        <span
                          className={`contest-status-pill ${isSubmitted ? 'contest-status-pill--done' : 'contest-status-pill--pending'}`}
                        >
                          {contest.type === '라운드매치'
                            ? isSubmitted
                              ? '투표 완료'
                              : '미투표'
                            : isSubmitted
                              ? '제출 완료'
                              : '대기 중'}
                        </span>
                        <button
                          type="button"
                          className="contest-participant-kick-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`${p.nickname}님을 참가자 목록에서 제거하시겠습니까?`)) {
                              handleDeleteParticipant(p.uid);
                            }
                          }}
                        >
                          {contest.type === '경연' || contest.type === '라운드매치' ? '강퇴' : '삭제'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              {uniqueParticipants.length === 0 && (
                <div className="contest-empty-message">참가자가 없습니다. 닉네임을 추가해주세요.</div>
              )}
            </div>
            {contest.type === '경연' && participantMainUid && participantSubUid && (
              <ContestStageBuildPanel
                mainName={nicknameOf(participantMainUid)}
                subName={nicknameOf(participantSubUid)}
                subRole={participantSubRole}
                onSelectRole={setParticipantSubRole}
                onCreate={handleMakeParticipantStage}
                onClear={() => {
                  setParticipantMainUid('');
                  setParticipantSubUid('');
                  setParticipantSubRole('');
                }}
              />
            )}
            {contest.type !== '경연' && selectedSolo.length === 2 && (
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
            <h3 className="contest-section-label">평가 대상</h3>
            <div className="contest-helper-box">
              이름을 순서대로 입력하면 첫 사람은 메인, 다음 사람은 서브가 됩니다.
            </div>
            
            {/* 평가받는 대상 추가 폼 */}
            <div className="contest-detail-add-form">
              <input
                type="text"
                className="contest-detail-add-input"
                placeholder="평가받는 대상 닉네임을 입력하세요"
                value={newEvaluationTargetNickname}
                onChange={(e) => setNewEvaluationTargetNickname(e.target.value)}
                onKeyDown={(e) => !e.nativeEvent.isComposing && e.key === 'Enter' && handleAddEvaluationTarget()}
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
              {targetMainUid ? (
                <div className="contest-selection-hint selected">
                  메인 {nicknameOf(targetMainUid).startsWith('target_') ? waitingMainName : nicknameOf(targetMainUid)}. 다른 이름을 누르면 서브가 되어 팀이 만들어집니다.
                </div>
              ) : (
                <div className="contest-selection-hint">
                  처음 입력하는 사람은 메인이 됩니다.
                </div>
              )}
            </div>
            <div className="contest-detail-participant-list">
              {evaluationTargets
                .filter(t => !teams.some(team => Array.isArray(team.members) && team.members.includes(t.uid)))
                .map(t => (
                  <div 
                    key={t.uid} 
                    className={`contest-detail-participant-item ${(t.uid === targetMainUid || t.uid === targetSubUid) ? 'selected' : ''} ${editingEvaluationTargetId === t.uid ? 'editing' : ''}`}
                    onClick={() => {
                      if (editingEvaluationTargetId === t.uid) return;
                      handleEvaluationTargetClick(t.uid);
                    }}
                  >
                    {editingEvaluationTargetId === t.uid ? (
                      <input
                        type="text"
                        className="contest-detail-add-input"
                        value={editingEvaluationTargetNickname}
                        onChange={(e) => setEditingEvaluationTargetNickname(e.target.value)}
                        onKeyDown={(e) => !e.nativeEvent.isComposing && e.key === 'Enter' && handleSaveEvaluationTarget(t)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span className="contest-detail-participant-name">
                        {t.nickname}
                        {t.uid === targetMainUid && (
                          <span className="contest-stage-role-badge">메인</span>
                        )}
                        {t.uid === targetSubUid && (
                          <span className="contest-stage-role-badge contest-stage-role-badge--sub">서브</span>
                        )}
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
              {evaluationTargets.filter(t => !teams.some(team => Array.isArray(team.members) && team.members.includes(t.uid))).length === 0 && sortedTeams.length === 0 && (
                <div className="contest-empty-message">
                  아직 평가받는 대상이 없습니다.
                </div>
              )}
            </div>

            {sortedTeams.length > 0 && (
              <>
                <div className="contest-list-header-box">
                  <div className="contest-list-header-title">
                    만든 팀 ({sortedTeams.length})
                  </div>
                  <div className="contest-selection-hint">
                    왼쪽 버튼으로 구성을 바꾸고, 오른쪽 버튼으로 둘 다 솔로가 됩니다.
                  </div>
                </div>
                <div className="contest-detail-team-list">
                  {sortedTeams.map((team, index) => {
                    const canMoveUp = index > 0;
                    const canMoveDown = index < sortedTeams.length - 1;
                    return (
                      <div key={team.id} className="contest-detail-team-item contest-team-card">
                        <div className="contest-team-card__header">
                          <span className="contest-team-card__index" aria-hidden>
                            {index + 1}
                          </span>
                          <div className="contest-team-card__info">
                            <ContestStageSummary team={team} nicknameOf={nicknameOf} />
                          </div>
                        </div>
                        <div className="contest-team-card__footer">
                          {Array.isArray(team.members) && team.members.filter(Boolean).length >= 2 && (
                            <div className="contest-stage-icon-row">
                              <button
                                type="button"
                                className="contest-stage-icon-btn"
                                title="구성 전환"
                                aria-label="구성 전환"
                                onClick={() => handleToggleContestRole(team)}
                              >
                                <span className="contest-stage-icon-btn__mark" aria-hidden>🔀</span>
                              </button>
                              <button
                                type="button"
                                className="contest-stage-icon-btn"
                                title="둘 다 솔로로"
                                aria-label="둘 다 솔로로"
                                onClick={() => handleSplitTeamToSolos(team.id)}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <circle cx="12" cy="8" r="3" />
                                  <path d="M6 19c1.3-3 3.5-4.5 6-4.5s4.7 1.5 6 4.5" />
                                </svg>
                              </button>
                            </div>
                          )}
                          <div className="contest-team-move-controls" aria-label="출연 순서">
                            <button
                              type="button"
                              onClick={() => handleMoveTeam(team.id, 'up')}
                              disabled={!canMoveUp}
                              className={`contest-team-move-btn ${canMoveUp ? 'enabled' : 'disabled'}`}
                              title="위로 이동"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveTeam(team.id, 'down')}
                              disabled={!canMoveDown}
                              className={`contest-team-move-btn ${canMoveDown ? 'enabled' : 'disabled'}`}
                              title="아래로 이동"
                            >
                              ↓
                            </button>
                          </div>
                          <div className="contest-team-card__actions">
                            <button
                              type="button"
                              className="contest-detail-team-button break danger"
                              onClick={() => handleDeleteTeam(team.id)}
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}

        {isAdmin && contest.type === '경연' && adminTab === 'teams' && (
          <section className="contest-detail-section">
            <h3 className="contest-section-label">팀 목록</h3>
            <div className="contest-helper-box">
              평가 대상에서 만든 팀입니다.
            </div>
            {sortedTeams.length === 0 ? (
              <div className="contest-empty-message">
                아직 만든 팀이 없습니다.
              </div>
            ) : (
              <div className="contest-detail-team-list">
                {sortedTeams.map((team, index) => {
                  const teamSubmitted = Array.isArray(team.members) && team.members.some((uid: string) => {
                    const target = evaluationTargets.find(tt => tt.uid === uid);
                    if (target) {
                      const p = participants.find(pp => pp.nickname === target.nickname);
                      return p && isParticipantSubmitted(p.nickname);
                    }
                    return false;
                  });
                  return (
                    <div key={team.id} className="contest-detail-team-item contest-team-card">
                      <div className="contest-team-card__header">
                        <span className="contest-team-card__index" aria-hidden>
                          {index + 1}
                        </span>
                        <div className="contest-team-card__info">
                          <ContestStageSummary team={team} nicknameOf={nicknameOf} />
                        </div>
                        <span
                          className={`contest-status-pill ${teamSubmitted ? 'contest-status-pill--done' : 'contest-status-pill--pending'}`}
                        >
                          {teamSubmitted ? '제출 완료' : '대기 중'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

function ContestStageSummary({
  team,
  nicknameOf,
}: {
  team: Team;
  nicknameOf: (uid: string) => string;
}) {
  const lines = formatContestStageLines(team, nicknameOf);
  if (!lines) {
    return (
      <div className="contest-stage-main-line">
        {Array.isArray(team.members) ? team.members.map((uid) => nicknameOf(uid)).join(' · ') : ''}
      </div>
    );
  }
  return (
    <>
      <div className="contest-stage-main-line">{lines.title}</div>
      <div
        className={
          lines.bothMains
            ? 'contest-stage-main-line contest-stage-main-line--partner'
            : 'contest-stage-support'
        }
      >
        {lines.support}
      </div>
    </>
  );
}

function ContestStageBuildPanel({
  mainName,
  subName,
  subRole,
  onSelectRole,
  onCreate,
  onClear,
}: {
  mainName: string;
  subName: string;
  subRole: ContestSubRole | '';
  onSelectRole: (role: ContestSubRole) => void;
  onCreate: () => void;
  onClear: () => void;
}) {
  return (
    <div className="contest-targets-action-panel">
      <div className="contest-targets-action-title">
        메인 {mainName} · 서브 {subName}
      </div>
      <div className="contest-stage-role-label">서브 역할</div>
      <div className="contest-stage-role-row">
        {CONTEST_SUB_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            className={`contest-stage-role-btn${subRole === role ? ' active' : ''}`}
            onClick={() => onSelectRole(role)}
          >
            {role}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary contest-targets-create-btn"
        onClick={onCreate}
        disabled={!subRole}
      >
        무대 만들기
      </button>
      <button type="button" className="contest-targets-cancel-btn" onClick={onClear}>
        선택 취소
      </button>
    </div>
  );
}

export default ContestDetail; 