import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, doc as firestoreDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import '../styles/variables.css';
import '../styles/components.css';
import '../styles/contest-ui-refresh.css';

import type { ContestType } from '../types/contest';
import { registerOnParticipateClick } from '../utils/contestParticipant';

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

const ContestList: React.FC = () => {
  const [contests, setContests] = useState<Contest[]>([]);
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
      const grades = gradesSnap.docs.map(doc => doc.data());
      
      // 참가자별 평균점수 계산
      const participantMap: Record<string, { scores: number[] }> = {};
      grades.forEach(g => {
        if (!participantMap[g.target]) participantMap[g.target] = { scores: [] };
        participantMap[g.target].scores.push(Number(g.score));
      });
      
      const sorted = Object.entries(participantMap)
        .map(([target, { scores }]) => ({
          target,
          avg: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0
        }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 3);
      
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

  // Effects
  useEffect(() => {
    let cancelled = false;
    const loadContests = async () => {
      try {
        const q = query(collection(db, 'contests'), orderBy('deadline', 'desc'));
        const snap = await getDocs(q);
        if (cancelled) return;
        setContests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Contest[]);
      } catch (error) {
        console.error('콘테스트 목록 로딩 실패:', error);
      }
    };

    void loadContests();
    return () => {
      cancelled = true;
    };
  }, []);

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

        {contests.length === 0 ? (
          <div className="contest-empty-state">
            <div className="contest-empty-icon">🏆</div>
            진행 중인 콘테스트가 없습니다.
          </div>
        ) : (
          <>
            {/* 진행중 콘테스트 */}
            {contests.filter(c => !isContestEnded(c)).length > 0 && (
              <div className="contest-section">
                <h3 className="contest-section-label">🔥 진행중</h3>
                {contests.filter(c => !isContestEnded(c)).map(contest => (
                  <div key={contest.id} className="contest-card">
                    <div className="contest-card-content">
                      <div className="contest-card-title">{contest.title}</div>
                      <div className="contest-tags">
                        <span className="contest-tag type">{contest.type}</span>
                        {contest.isStarted && (
                          <span className="contest-tag started">✅ 개최됨</span>
                        )}
                        {!contest.isStarted && (
                          <span className="contest-tag waiting">⏸️ 대기중</span>
                        )}
                        <span className="contest-date">📅 마감: {formatDeadline(contest.deadline)}</span>
                      </div>
                    </div>
                    <div className="contest-buttons">
                      <button className="contest-button detail" onClick={() => navigate(`/contests/${contest.id}`)}>
                        📋 상세
                      </button>
                      <button className="contest-button participate" onClick={() => handleParticipate(contest)}>
                        🎯 참여
                      </button>
                      {user && user.role === '리더' && user.nickname === '너래' && (
                        <button className="contest-button end" onClick={async () => await updateDoc(firestoreDoc(db, 'contests', contest.id), { ended: true })}>
                          🛑 종료
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 종료된 콘테스트 */}
            {contests.filter(c => isContestEnded(c)).length > 0 && (
              <div className="contest-section">
                <h3 className="contest-section-label">📁 종료됨</h3>
                {contests.filter(c => isContestEnded(c)).map(contest => (
                  <div key={contest.id} className="contest-card ended">
                    <div className="contest-card-content">
                      <div className="contest-card-title">{contest.title}</div>
                      {Array.isArray(contest.top3) && contest.top3.length > 0 && (
                        <div className="contest-top3">
                          {contest.top3.map((item) => (
                            <span key={item.rank} className={`contest-top3-badge rank-${item.rank}`}>
                              {getRankEmoji(item.rank)} {item.name} ({item.score ? item.score.toFixed(1) : '-'})
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="contest-tags">
                        <span className="contest-tag type">{contest.type}</span>
                        <span className="contest-tag ended">종료됨</span>
                      </div>
                    </div>
                    <div className="contest-buttons">
                      <button className="contest-button detail" onClick={() => navigate(`/contests/${contest.id}`)}>
                        📋 상세
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ContestList;