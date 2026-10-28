import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, getDocs, onSnapshot, doc as firestoreDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import '../styles/variables.css';
import '../styles/contest-ui-refresh.css';

import type { ContestType } from '../types/contest';
import { CONTEST_SUBMISSION_DONE_MESSAGE, hasFinalContestSubmission, registerOnParticipateClick } from '../utils/contestParticipant';
import { computeContestTop3Targets, type ContestGradeRecord } from '../utils/contestGradesAggregation';
import ContestListItem from './ContestListItem';
import { useContestSubmissionLocks } from '../hooks/useContestSubmissionLocks';

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

interface User {
  uid: string;
  email: string;
  nickname?: string;
  isLoggedIn: boolean;
  role?: string;
}

interface Top3Item {
  rank: number;
  name: string;
  score: number;
}

const ContestListClassic: React.FC = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const navigate = useNavigate();
  
  // User data
  const user = useMemo(() => {
    const userString = localStorage.getItem('veryus_user');
    return userString ? JSON.parse(userString) as User : null;
  }, []);

  const isAdmin = useMemo(() => {
    return user && ['리더', '운영진', '부운영진'].includes(user.role || '');
  }, [user]);

  // Callbacks
  const isContestEnded = useCallback((contest: Contest): boolean => {
    // 이미 수동으로 종료된 경우
    if (contest.ended) return true;
    
    // 마감일이 지났는지 확인
    if (contest.deadline && contest.deadline.seconds) {
      const deadlineDate = new Date(contest.deadline.seconds * 1000);
      const now = new Date();
      
      // 날짜만 비교 (시간 제거)
      const deadlineDateOnly = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
      const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // 마감일 다음날부터 종료 (마감일 당일까지는 참가 가능)
      return nowDateOnly > deadlineDateOnly;
    }
    
    return false;
  }, []);

  const handleParticipate = useCallback(async (contest: Contest) => {
    if (!user) return navigate('/login');

    // 리더는 개최 전에도 입장 허용
    const isLeader = user.role === '리더';

    // 콘테스트가 종료되었는지 확인
    if (isContestEnded(contest)) {
      alert('이미 종료된 콘테스트입니다.');
      return;
    }

    try {
      if (user.uid && await hasFinalContestSubmission(contest.id, user.uid)) {
        alert(CONTEST_SUBMISSION_DONE_MESSAGE);
        return;
      }

      await registerOnParticipateClick(contest.id, contest, user);

      if (!contest.isStarted && !isLeader) {
        alert('콘테스트가 아직 개최되지 않았습니다. 리더가 개최할 때까지 기다려주세요.');
        return;
      }

      navigate(`/contests/${contest.id}/participate`);
    } catch (error) {
      console.error('참가자 목록 확인 중 오류:', error);
      alert('참가자 목록을 확인하는 중 오류가 발생했습니다.');
    }
  }, [user, navigate, isContestEnded]);

  const handleEndContest = useCallback(async (contest: Contest) => {
    if (!window.confirm('정말로 이 콘테스트를 종료하시겠습니까? 종료 후에는 누구도 참여할 수 없습니다.')) return;
    
    try {
      // 1. grades 컬렉션에서 점수순 top3 계산
      const gradesSnap = await getDocs(collection(db, 'contests', contest.id, 'grades'));
      const grades = gradesSnap.docs.map(doc => doc.data()) as ContestGradeRecord[];
      const usersSnap = await getDocs(collection(db, 'users'));
      const evaluatorGradeByNickname: Record<string, string> = {};
      usersSnap.forEach((d) => {
        const data = d.data();
        if (data.nickname) evaluatorGradeByNickname[data.nickname] = data.grade ?? '';
      });

      const sorted = computeContestTop3Targets(grades, evaluatorGradeByNickname);
      
      // 참가자/팀명 가져오기
      let top3: Top3Item[] = [];
      if (sorted.length > 0) {
        // 참가자/팀 정보 가져오기
        const participantsSnap = await getDocs(collection(db, 'contests', contest.id, 'participants'));
        const participants = participantsSnap.docs.map(doc => doc.data()) as any[];
        const teamsSnap = await getDocs(collection(db, 'contests', contest.id, 'teams'));
        const teams = teamsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        
        top3 = sorted.map((item, idx) => {
          // 팀이면 팀명+팀원, 아니면 닉네임
          const team = teams.find((t: any) => t.id === item.target);
          if (team) {
            const memberNames = Array.isArray(team.members) ? team.members.map((uid: string) => {
              const p = participants.find((pp: any) => pp.uid === uid);
              return p && p.nickname ? p.nickname : uid;
            }).join(', ') : '';
            return { rank: idx + 1, name: `${team.teamName} (${memberNames})`, score: item.avg };
          }
          const solo = participants.find((p: any) => p.uid === item.target);
          return { rank: idx + 1, name: solo && solo.nickname ? solo.nickname : item.target, score: item.avg };
        });
      }
      
      // 2. top3를 contests/{id}에 저장
      await updateDoc(firestoreDoc(db, 'contests', contest.id), { ended: true, top3 });
      alert('콘테스트가 종료되었습니다.');
    } catch (error) {
      console.error('콘테스트 종료 중 오류:', error);
      alert('콘테스트 종료 중 오류가 발생했습니다.');
    }
  }, []);

  const formatDeadline = useCallback((deadline: any): string => {
    if (!deadline) return '';
    return deadline.seconds ? new Date(deadline.seconds * 1000).toLocaleDateString('ko-KR') : '';
  }, []);

  const getRankEmoji = useCallback((rank: number): string => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return '';
    }
  }, []);

  const activeContestIds = useMemo(
    () => contests.filter((c) => !isContestEnded(c)).map((c) => c.id),
    [contests, isContestEnded]
  );
  const submissionLockedIds = useContestSubmissionLocks(activeContestIds, user?.uid);

  // Effects — Auth 준비 후 실시간 구독 (로딩 중 빈 목록·일시적 조회 실패로 오표시 방지)
  useEffect(() => {
    let cancelled = false;
    let unsubFirestore: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (authUser) => {
      unsubFirestore?.();
      unsubFirestore = undefined;

      if (cancelled) return;

      if (!authUser) {
        setContests([]);
        setLoading(false);
        setLoadError(null);
        return;
      }

      setLoading(true);
      setLoadError(null);

      const q = query(collection(db, 'contests'), orderBy('deadline', 'desc'));
      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          if (cancelled) return;
          setContests(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Contest[]);
          setLoading(false);
          setLoadError(null);
        },
        (error) => {
          if (cancelled) return;
          console.error('콘테스트 목록 로딩 실패:', error);
          setLoading(false);
          setLoadError('콘테스트 목록을 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.');
        }
      );
    });

    return () => {
      cancelled = true;
      unsubFirestore?.();
      unsubAuth();
    };
  }, [retryCount]);

  return (
    <div className="contest-list-container contest-ui-refresh">
      <div className="contest-list-pattern" />
      <div className="contest-list-content">
        <div className="contest-header-row">
          <h2 className="contest-title">
            🏆 콘테스트
          </h2>
          {isAdmin && (
            <button
              className="btn btn-primary"
              onClick={() => navigate('/contests/create')}
            >
              + 콘테스트 생성
            </button>
          )}
        </div>

        {loading ? (
          <div className="contest-loading-state" aria-busy="true">
            <div className="contest-loading-spinner" />
            <span>콘테스트 목록을 불러오는 중...</span>
          </div>
        ) : loadError ? (
          <div className="contest-empty-state">
            <div className="contest-empty-icon">⚠️</div>
            <p>{loadError}</p>
            <button
              type="button"
              className="btn btn-primary contest-retry-button"
              onClick={() => setRetryCount(c => c + 1)}
            >
              다시 시도
            </button>
          </div>
        ) : contests.length === 0 ? (
          <div className="contest-empty-state">
            <div className="contest-empty-icon">🏆</div>
            등록된 콘테스트가 없습니다.
          </div>
        ) : (
          <>
            {/* 진행중 콘테스트 */}
            {contests.filter(c => !isContestEnded(c)).length > 0 && (
              <div className="contest-section">
                <h3 className="contest-section-label">🔥 진행중</h3>
                {contests.filter(c => !isContestEnded(c)).map(contest => (
                  <ContestListItem
                    key={contest.id}
                    contest={contest}
                    inEndedSection={false}
                    deadlineText={formatDeadline(contest.deadline)}
                    onDetail={() => navigate(`/contests/${contest.id}`)}
                    onParticipate={() => void handleParticipate(contest)}
                    finalSubmitted={submissionLockedIds.has(contest.id)}
                    showQuickEnd={Boolean(user && user.role === '리더' && user.nickname === '너래')}
                    onQuickEnd={() => void updateDoc(firestoreDoc(db, 'contests', contest.id), { ended: true })}
                    rankLabel={getRankEmoji}
                  />
                ))}
              </div>
            )}

            {/* 종료된 콘테스트 */}
            {contests.filter(c => isContestEnded(c)).length > 0 && (
              <div className="contest-section">
                <h3 className="contest-section-label">📁 종료됨</h3>
                {contests.filter(c => isContestEnded(c)).map(contest => (
                  <ContestListItem
                    key={contest.id}
                    contest={contest}
                    inEndedSection
                    deadlineText=""
                    onDetail={() => navigate(`/contests/${contest.id}`)}
                    rankLabel={getRankEmoji}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ContestListClassic;