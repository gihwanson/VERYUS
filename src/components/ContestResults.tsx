import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const ContestResults: React.FC = () => {
  const { id } = useParams();
  const [contest, setContest] = useState<any>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [selectedEvaluator, setSelectedEvaluator] = useState<string>('');
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && ['리더', '운영진', '부운영진'].includes(user.role);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'contests', id)).then(snap => setContest(snap.exists() ? { id: snap.id, ...snap.data() } : null));
    // 전체 심사결과 불러오기
    getDocs(collection(db, 'contests', id, 'grades')).then(snap => setGrades(snap.docs.map(doc => doc.data())));
    // 팀/참가자 정보도 불러오기
    getDocs(collection(db, 'contests', id, 'teams')).then(snap => setTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    getDocs(collection(db, 'contests', id, 'participants')).then(snap => setParticipants(snap.docs.map(doc => doc.data())));
  }, [id]);

  if (!contest) return <div style={{ padding: 40, textAlign: 'center', color: '#B497D6' }}>콘테스트 정보를 불러오는 중...</div>;

  if (!user || user.role !== '리더') {
    return <div style={{ padding: 40, textAlign: 'center', color: '#B497D6' }}>
      콘테스트 결과는 리더만 확인할 수 있습니다.
    </div>;
  }

  // 참가자별 평균점수/등급/코멘트 계산
  const participantMap: Record<string, { scores: number[], comments: string[] }> = {};
  grades.forEach(g => {
    if (!participantMap[g.target]) participantMap[g.target] = { scores: [], comments: [] };
    participantMap[g.target].scores.push(Number(g.score));
    if (g.comment) participantMap[g.target].comments.push(g.comment);
  });
  const getGrade = (avg: number) => {
    if (avg >= 1 && avg <= 30) return '🫐 블루베리';
    if (avg <= 40) return '🥝 키위';
    if (avg <= 50) return '🍎 사과';
    if (avg <= 60) return '🍈 멜론';
    if (avg <= 70) return '🍉 수박';
    if (avg <= 80) return '🌍 지구';
    if (avg <= 90) return '🪐 토성';
    if (avg <= 100) return '☀️ 태양';
    return '';
  };

  // 부운영진 평가만 모으기
  const subAdmins = grades.filter((g: any) => g.evaluatorRole === '부운영진');

  // 부운영진 평가 기준 참가자별 평균점수/등급/코멘트 계산
  const subAdminParticipantMap: Record<string, { scores: number[], comments: string[] }> = {};
  subAdmins.forEach((g: any) => {
    if (!subAdminParticipantMap[g.target]) subAdminParticipantMap[g.target] = { scores: [], comments: [] };
    subAdminParticipantMap[g.target].scores.push(Number(g.score));
    if (g.comment) subAdminParticipantMap[g.target].comments.push(g.comment);
  });

  // 피평가자 표시 함수
  const getTargetDisplay = (target: string) => {
    const team = teams.find(t => t.id === target);
    if (team) {
      // 듀엣: 팀명 (팀원1, 팀원2)
      const memberNames = Array.isArray(team.members) ? team.members.map((uid: string) => {
        // 먼저 participants에서 찾기
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
      }).join(', ') : '';
      return `${team.teamName} (${memberNames})`;
    }
    // 솔로: 닉네임
    const solo = participants.find(p => p.uid === target);
    if (solo && solo.nickname) {
      return solo.nickname;
    }
    
    // 솔로 참가자도 찾지 못하면 uid에서 닉네임 추출 시도
    if (target.startsWith('custom_')) {
      const parts = target.split('_');
      if (parts.length >= 2) {
        return parts[1];
      }
    }
    
    return `참가자_${target.slice(-4)}`;
  };

  // 고유 평가자 목록 생성
  const uniqueEvaluators = Array.from(new Set(grades.map(g => g.evaluator))).sort();
  
  // 고유 피평가자 목록 생성
  const uniqueTargets = Array.from(new Set(grades.map(g => g.target)))
    .map(target => ({ id: target, display: getTargetDisplay(target) }))
    .sort((a, b) => a.display.localeCompare(b.display));

  // 필터링된 평가 데이터
  const filteredGrades = grades.filter(g => {
    const matchEvaluator = !selectedEvaluator || g.evaluator === selectedEvaluator;
    const matchTarget = !selectedTarget || g.target === selectedTarget;
    return matchEvaluator && matchTarget;
  });

  // 필터 초기화 함수
  const resetFilters = () => {
    setSelectedEvaluator('');
    setSelectedTarget('');
  };

  return (
    <div className="contest-card">
      <button
        style={{ marginBottom: 24, background: '#F6F2FF', color: '#8A55CC', borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' }}
        onClick={() => id && window.history.back()}
      >
        ← 이전
      </button>
      <h2 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 28, marginBottom: 16, textAlign: 'center', letterSpacing: 1 }}>최종 결과</h2>
      <div style={{ color: '#8A55CC', fontWeight: 700, fontSize: 22, marginBottom: 8, textAlign: 'center' }}>{contest.title} 결과</div>
      <div style={{ color: '#6B7280', fontWeight: 500, marginBottom: 12, textAlign: 'center' }}>{contest.type}</div>
      <div style={{ color: '#B497D6', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>마감: {contest.deadline && (contest.deadline.seconds ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : '')}</div>
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 20, marginBottom: 12, textAlign: 'center' }}>최종 등급 결과</h3>
        <table className="contest-table">
          <thead>
            <tr style={{ background: '#F6F2FF', color: '#8A55CC' }}>
              <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>닉네임</th>
              <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>평균점수</th>
              <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>등급</th>
              <th style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>심사코멘트</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(participantMap).map(([target, { scores, comments }]) => {
              const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
              return (
                <tr key={target}>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{getTargetDisplay(target)}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{avg ? avg.toFixed(1) : '-'}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{avg ? getGrade(avg) : '-'}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{comments.join(', ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {contest.type === '경연' && <div style={{ color: '#7C4DBC', fontWeight: 600 }}>※ 경연 모드: 점수순 랭킹/등급 부여 안내</div>}
      </div>
      {grades.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ color: '#7C4DBC', fontWeight: 700, fontSize: 18, marginBottom: 12, textAlign: 'center', borderTop: '2px solid #E5DAF5', paddingTop: 16 }}>전체 심사결과</h3>
          
          {/* 필터링 UI */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontWeight: 600, color: '#7C4DBC', minWidth: 60 }}>평가자:</label>
              <select
                value={selectedEvaluator}
                onChange={e => setSelectedEvaluator(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #E5DAF5', fontSize: 14, minWidth: 120 }}
              >
                <option value="">전체</option>
                {uniqueEvaluators.map(evaluator => (
                  <option key={evaluator} value={evaluator}>{evaluator}</option>
                ))}
              </select>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontWeight: 600, color: '#7C4DBC', minWidth: 70 }}>피평가자:</label>
              <select
                value={selectedTarget}
                onChange={e => setSelectedTarget(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #E5DAF5', fontSize: 14, minWidth: 150 }}
              >
                <option value="">전체</option>
                {uniqueTargets.map(target => (
                  <option key={target.id} value={target.id}>{target.display}</option>
                ))}
              </select>
            </div>
            
            <button
              onClick={resetFilters}
              style={{ 
                background: '#F43F5E', 
                color: '#fff', 
                border: 'none', 
                borderRadius: 6, 
                padding: '6px 16px', 
                fontWeight: 600, 
                fontSize: 14, 
                cursor: 'pointer' 
              }}
            >
              필터 초기화
            </button>
          </div>

          {/* 필터 상태 표시 */}
          {(selectedEvaluator || selectedTarget) && (
            <div style={{ marginBottom: 12, padding: 8, background: '#F0F9FF', borderRadius: 6, border: '1px solid #BAE6FD', textAlign: 'center' }}>
              <span style={{ color: '#0369A1', fontWeight: 600, fontSize: 14 }}>
                필터 적용 중: 
                {selectedEvaluator && ` 평가자(${selectedEvaluator})`}
                {selectedEvaluator && selectedTarget && ' + '}
                {selectedTarget && ` 피평가자(${getTargetDisplay(selectedTarget)})`}
                {' '}| 총 {filteredGrades.length}개 결과
              </span>
            </div>
          )}

          <table className="contest-table">
            <thead>
              <tr style={{ background: '#F6F2FF', color: '#8A55CC' }}>
                <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>평가자</th>
                <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>피평가자</th>
                <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>점수</th>
                <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>등급</th>
                <th style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>심사코멘트</th>
              </tr>
            </thead>
            <tbody>
              {filteredGrades.map((g, i) => (
                <tr key={i}>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{g.evaluator}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{getTargetDisplay(g.target)}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{g.score}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{getGrade(Number(g.score))}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{g.comment}</td>
                </tr>
              ))}
              {filteredGrades.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic' }}>
                    선택한 조건에 맞는 평가 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {/* 부운영진 평가 결과 별도 표 */}
          {subAdmins.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <h3 style={{ color: '#F43F5E', fontWeight: 700, fontSize: 18, marginBottom: 12, textAlign: 'center', borderTop: '2px solid #F43F5E', paddingTop: 16 }}>부운영진 평가 결과</h3>
              <table className="contest-table">
                <thead>
                  <tr style={{ background: '#F6F2FF', color: '#F43F5E' }}>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>부운영진</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>피평가자</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>점수</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>등급</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>심사코멘트</th>
                  </tr>
                </thead>
                <tbody>
                  {subAdmins.map((g, i) => (
                    <tr key={i}>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{g.evaluator}</td>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{getTargetDisplay(g.target)}</td>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{g.score}</td>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{getGrade(Number(g.score))}</td>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{g.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* 부운영진 기준 최종 등급 결과 표 */}
              <h3 style={{ color: '#F43F5E', fontWeight: 700, fontSize: 18, marginBottom: 12, textAlign: 'center', borderTop: '2px solid #F43F5E', paddingTop: 16 }}>부운영진 기준 최종 등급 결과</h3>
              <table className="contest-table">
                <thead>
                  <tr style={{ background: '#F6F2FF', color: '#F43F5E' }}>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>닉네임</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>평균점수</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>등급</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>심사코멘트</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(subAdminParticipantMap).map(([nickname, { scores, comments }]) => {
                    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
                    return (
                      <tr key={nickname}>
                        <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{nickname}</td>
                        <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{avg ? avg.toFixed(1) : '-'}</td>
                        <td style={{ padding: 8, border: '1px solid #E5DAF5' }}>{avg ? getGrade(avg) : '-'}</td>
                        <td style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>{comments.join(', ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {isAdmin && <div style={{ marginTop: 24, color: '#8A55CC', fontWeight: 600, textAlign: 'center' }}>관리자: 전체 평가내역 확인 기능 예정</div>}
    </div>
  );
};

export default ContestResults; 