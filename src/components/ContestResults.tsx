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
  const [evaluationTargets, setEvaluationTargets] = useState<any[]>([]); // 평가받는 대상 (참가자 관리에서 설정한 멤버들)
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
    // 평가받는 대상 불러오기 (참가자 관리에서 설정한 멤버들)
    getDocs(collection(db, 'contests', id, 'evaluationTargets')).then(snap => setEvaluationTargets(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }))));
  }, [id]);

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

  if (!user || user.role !== '리더') {
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
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
          <div style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>콘테스트 결과는 리더만 확인할 수 있습니다.</div>
        </div>
      </div>
    );
  }

  // 참가자별 평균점수/등급/코멘트 계산
  const participantMap: Record<string, { scores: number[], comments: string[] }> = {};
  grades.forEach(g => {
    if (!participantMap[g.target]) participantMap[g.target] = { scores: [], comments: [] };
    participantMap[g.target].scores.push(Number(g.score));
    if (g.comment) participantMap[g.target].comments.push(g.comment);
  });

  // 등급 계산 함수
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

  // 피평가자 표시 함수
  const getTargetDisplay = (target: string) => {
    const team = teams.find(t => t.id === target);
    if (team) {
      // 팀: 멤버들의 닉네임을 evaluationTargets에서 먼저 찾기
      const memberNames = Array.isArray(team.members) ? team.members.map((uid: string) => {
        // 1순위: evaluationTargets에서 찾기 (참가자 관리에서 설정한 닉네임)
        const evalTarget = evaluationTargets.find(et => et.uid === uid);
        if (evalTarget && evalTarget.nickname) {
          return evalTarget.nickname;
        }
        
        // 2순위: participants에서 찾기
        const p = participants.find(pp => pp.uid === uid);
        if (p && p.nickname) {
          return p.nickname;
        }
        
        // 3순위: uid에서 닉네임 추출 시도 (target_닉네임_... 또는 custom_닉네임_... 형태)
        if (uid.startsWith('target_')) {
          const parts = uid.split('_');
          if (parts.length >= 2) {
            return parts[1]; // target_닉네임_...에서 닉네임 부분
          }
        }
        if (uid.startsWith('custom_')) {
          const parts = uid.split('_');
          if (parts.length >= 2) {
            return parts[1]; // custom_닉네임_timestamp_random에서 닉네임 부분
          }
        }
        
        // 최후의 수단으로 uid 표시 (하지만 더 읽기 쉽게)
        return `참가자_${uid.slice(-4)}`;
      }).join(' & ') : '';
      return memberNames || `팀 (${team.members?.length || 0}명)`;
    }
    
    // 솔로: evaluationTargets에서 먼저 찾기
    const evalTarget = evaluationTargets.find(et => et.uid === target);
    if (evalTarget && evalTarget.nickname) {
      return evalTarget.nickname;
    }
    
    // participants에서 찾기
    const solo = participants.find(p => p.uid === target);
    if (solo && solo.nickname) {
      return solo.nickname;
    }
    
    // uid에서 닉네임 추출 시도
    if (target.startsWith('target_')) {
      const parts = target.split('_');
      if (parts.length >= 2) {
        return parts[1];
      }
    }
    if (target.startsWith('custom_')) {
      const parts = target.split('_');
      if (parts.length >= 2) {
        return parts[1];
      }
    }
    
    return `참가자_${target.slice(-4)}`;
  };

  // 점수순으로 정렬된 참가자 목록 생성
  const sortedParticipants = Object.entries(participantMap)
    .map(([target, { scores, comments }]) => {
      const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const count = scores.length; // 평가 인원 수
      return {
        target,
        display: getTargetDisplay(target),
        avg,
        count,
        grade: getGrade(avg),
        comments: comments.join(', ')
      };
    })
    .sort((a, b) => b.avg - a.avg); // 점수 높은 순으로 정렬

  // 부운영진 평가만 모으기
  const subAdmins = grades.filter((g: any) => g.evaluatorRole === '부운영진');

  // 부운영진 평가 기준 참가자별 평균점수/등급/코멘트 계산
  const subAdminParticipantMap: Record<string, { scores: number[], comments: string[] }> = {};
  subAdmins.forEach((g: any) => {
    if (!subAdminParticipantMap[g.target]) subAdminParticipantMap[g.target] = { scores: [], comments: [] };
    subAdminParticipantMap[g.target].scores.push(Number(g.score));
    if (g.comment) subAdminParticipantMap[g.target].comments.push(g.comment);
  });

  // 부운영진 기준 점수순으로 정렬된 참가자 목록 생성
  const sortedSubAdminParticipants = Object.entries(subAdminParticipantMap)
    .map(([target, { scores, comments }]) => {
      const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const count = scores.length; // 평가 인원 수
      return {
        target,
        display: getTargetDisplay(target),
        avg,
        count,
        grade: getGrade(avg),
        comments: comments.join(', ')
      };
    })
    .sort((a, b) => b.avg - a.avg); // 점수 높은 순으로 정렬

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

  // 불릿+줄바꿈+더보기 코멘트 컴포넌트
  const BulletedComments: React.FC<{ comments: string[] }> = ({ comments }) => {
    const [expanded, setExpanded] = useState(false);
    const MAX_LINES = 3;
    if (!comments || comments.length === 0) return null;
    const showExpand = comments.length > MAX_LINES;
    const shown = expanded ? comments : comments.slice(0, MAX_LINES);
    return (
      <div style={{ 
        whiteSpace: 'pre-line', 
        lineHeight: 1.6,
        userSelect: 'text',
        WebkitUserSelect: 'text',
        MozUserSelect: 'text',
        msUserSelect: 'text'
      }}>
        {shown.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <span style={{ color: '#8A55CC', fontWeight: 'bold', fontSize: 16 }}>•</span>
            <span style={{ 
              color: 'var(--text-primary, #333)',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              MozUserSelect: 'text',
              msUserSelect: 'text'
            }}>{c}</span>
          </div>
        ))}
        {showExpand && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              background: 'none',
              border: 'none',
              color: '#7C4DBC',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              marginTop: 4,
              fontSize: 13,
              textDecoration: 'underline',
            }}
          >
            {expanded ? '접기 ▲' : `더보기 ▼`}
          </button>
        )}
      </div>
    );
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
            onClick={() => id && window.history.back()}
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

        {/* 헤더 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '30px',
          marginBottom: '20px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          textAlign: 'center'
        }}>
          <h2 style={{ 
            color: 'white', 
            fontWeight: 700, 
            fontSize: 32, 
            marginBottom: 16,
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
          }}>
            🏆 최종 결과
          </h2>
          <div style={{ 
            color: 'white', 
            fontWeight: 700, 
            fontSize: 24, 
            marginBottom: 8
          }}>
            {contest.title} 결과
          </div>
          <div style={{ 
            color: 'rgba(255, 255, 255, 0.9)', 
            fontWeight: 500, 
            marginBottom: 12,
            fontSize: '18px'
          }}>
            {contest.type}
          </div>
          <div style={{ 
            color: 'rgba(255, 255, 255, 0.8)', 
            fontSize: 16
          }}>
            📅 마감: {contest.deadline && (contest.deadline.seconds ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : '')}
          </div>
        </div>
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 20, marginBottom: 12, textAlign: 'center' }}>🏆 최종 등급 결과 (점수순 순위)</h3>
        <table className="contest-table">
          <thead>
            <tr style={{ background: '#F6F2FF', color: '#8A55CC' }}>
              <th style={{ padding: 8, border: '1px solid #E5DAF5', textAlign: 'center' }}>순위</th>
              <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>닉네임</th>
              <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>평균점수</th>
              <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>등급</th>
              <th style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>심사코멘트</th>
            </tr>
          </thead>
          <tbody>
            {sortedParticipants.map(({ target, display, avg, count, grade, comments }, index) => {
              const rank = index + 1;
              const isTop3 = rank <= 3;
              const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
              
              return (
                <tr key={target} style={{
                  background: isTop3 ? 
                    rank === 1 ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)' :
                    rank === 2 ? 'linear-gradient(135deg, #C0C0C0 0%, #E5E5E5 100%)' :
                    'linear-gradient(135deg, #CD7F32 0%, #D2691E 100%)' : 'transparent',
                  fontWeight: isTop3 ? 'bold' : 'normal'
                }}>
                  <td style={{ 
                    padding: 8, 
                    border: '1px solid #E5DAF5', 
                    textAlign: 'center',
                    fontSize: isTop3 ? '18px' : '14px',
                    fontWeight: 'bold',
                    color: 'var(--text-primary, #333)'
                  }}>
                    {rankEmoji}
                  </td>
                  <td style={{ 
                    padding: 8, 
                    border: '1px solid #E5DAF5',
                    fontWeight: isTop3 ? 'bold' : 'normal',
                    color: 'var(--text-primary, #333)'
                  }}>
                    {display}
                  </td>
                  <td style={{ 
                    padding: 8, 
                    border: '1px solid #E5DAF5',
                    fontWeight: isTop3 ? 'bold' : 'normal',
                    color: isTop3 ? '#2E7D32' : 'var(--text-primary, #333)'
                  }}>
                    {avg ? `${avg.toFixed(1)} (${count})` : '-'}
                  </td>
                  <td style={{ 
                    padding: 8, 
                    border: '1px solid #E5DAF5',
                    fontWeight: isTop3 ? 'bold' : 'normal',
                    color: 'var(--text-primary, #333)'
                  }}>
                    {grade}
                  </td>
                  <td style={{ 
                    padding: 8, 
                    border: '1px solid #E5DAF5', 
                    maxWidth: 320, 
                    wordBreak: 'break-all', 
                    whiteSpace: 'pre-line',
                    fontWeight: isTop3 ? 'bold' : 'normal',
                    color: 'var(--text-primary, #333)',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                    MozUserSelect: 'text',
                    msUserSelect: 'text'
                  }}>
                    <BulletedComments comments={comments ? comments.split(',').map((s: string) => s.trim()).filter(Boolean) : []} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {contest.type === '경연' && (
          <div style={{
            background: 'rgba(138, 85, 204, 0.1)',
            border: '1px solid rgba(138, 85, 204, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            marginTop: '16px',
            textAlign: 'center'
          }}>
            <div style={{ color: '#7C4DBC', fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>
              🎭 경연 결과 안내
            </div>
            <div style={{ color: '#6B21A8', fontSize: '14px', lineHeight: '1.6' }}>
              경연은 참가자 상호 평가 방식으로 진행되었습니다.<br />
              위 순위는 모든 참가자들의 평가 점수를 평균내어 결정되었습니다.
            </div>
          </div>
        )}
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
                  <td style={{ padding: 8, border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }}>{g.evaluator}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }}>{getTargetDisplay(g.target)}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }}>{g.score}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }}>{getGrade(Number(g.score))}</td>
                  <td style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line', color: 'var(--text-primary, #333)', userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text' }}>
                    <BulletedComments comments={g.comment ? g.comment.split(',').map((s: string) => s.trim()).filter(Boolean) : []} />
                  </td>
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
                      <td style={{ padding: 8, border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }}>{g.evaluator}</td>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }}>{getTargetDisplay(g.target)}</td>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }}>{g.score}</td>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5', color: 'var(--text-primary, #333)' }}>{getGrade(Number(g.score))}</td>
                      <td style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line', color: 'var(--text-primary, #333)', userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text' }}>
                        <BulletedComments comments={g.comment ? g.comment.split(',').map((s: string) => s.trim()).filter(Boolean) : []} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* 부운영진 기준 최종 등급 결과 표 */}
              <h3 style={{ color: '#F43F5E', fontWeight: 700, fontSize: 18, marginBottom: 12, textAlign: 'center', borderTop: '2px solid #F43F5E', paddingTop: 16 }}>🏆 부운영진 기준 최종 등급 결과 (점수순 순위)</h3>
              <table className="contest-table">
                <thead>
                  <tr style={{ background: '#F6F2FF', color: '#F43F5E' }}>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5', textAlign: 'center' }}>순위</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>닉네임</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>평균점수</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5' }}>등급</th>
                    <th style={{ padding: 8, border: '1px solid #E5DAF5', maxWidth: 320, wordBreak: 'break-all', whiteSpace: 'pre-line' }}>심사코멘트</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSubAdminParticipants.map(({ target, display, avg, count, grade, comments }, index) => {
                    const rank = index + 1;
                    const isTop3 = rank <= 3;
                    const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
                    
                    return (
                      <tr key={target} style={{
                        background: isTop3 ? 
                          rank === 1 ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)' :
                          rank === 2 ? 'linear-gradient(135deg, #C0C0C0 0%, #E5E5E5 100%)' :
                          'linear-gradient(135deg, #CD7F32 0%, #D2691E 100%)' : 'transparent',
                        fontWeight: isTop3 ? 'bold' : 'normal'
                      }}>
                        <td style={{ 
                          padding: 8, 
                          border: '1px solid #E5DAF5', 
                          textAlign: 'center',
                          fontSize: isTop3 ? '18px' : '14px',
                          fontWeight: 'bold',
                          color: 'var(--text-primary, #333)'
                        }}>
                          {rankEmoji}
                        </td>
                        <td style={{ 
                          padding: 8, 
                          border: '1px solid #E5DAF5',
                          fontWeight: isTop3 ? 'bold' : 'normal',
                          color: 'var(--text-primary, #333)'
                        }}>
                          {display}
                        </td>
                        <td style={{ 
                          padding: 8, 
                          border: '1px solid #E5DAF5',
                          fontWeight: isTop3 ? 'bold' : 'normal',
                          color: isTop3 ? '#2E7D32' : 'var(--text-primary, #333)'
                        }}>
                          {avg ? `${avg.toFixed(1)} (${count})` : '-'}
                        </td>
                        <td style={{ 
                          padding: 8, 
                          border: '1px solid #E5DAF5',
                          fontWeight: isTop3 ? 'bold' : 'normal',
                          color: 'var(--text-primary, #333)'
                        }}>
                          {grade}
                        </td>
                        <td style={{ 
                          padding: 8, 
                          border: '1px solid #E5DAF5', 
                          maxWidth: 320, 
                          wordBreak: 'break-all', 
                          whiteSpace: 'pre-line',
                          fontWeight: isTop3 ? 'bold' : 'normal',
                          color: 'var(--text-primary, #333)',
                          userSelect: 'text',
                          WebkitUserSelect: 'text',
                          MozUserSelect: 'text',
                          msUserSelect: 'text'
                        }}>
                          <BulletedComments comments={comments ? comments.split(',').map((s: string) => s.trim()).filter(Boolean) : []} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
        {isAdmin && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(15px)',
            borderRadius: '16px',
            padding: '16px',
            marginTop: '20px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            textAlign: 'center'
          }}>
            <div style={{ 
              color: 'rgba(255, 255, 255, 0.9)', 
              fontWeight: 600,
              fontSize: '16px'
            }}>
              ⚙️ 관리자: 전체 평가내역 확인 기능 예정
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContestResults; 