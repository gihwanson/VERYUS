import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, getDocs, query, where, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const ContestParticipate: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contest, setContest] = useState<any>(null);
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const [score, setScore] = useState<number | ''>('');
  const [suggestedGrade, setSuggestedGrade] = useState('');
  const [nickname, setNickname] = useState('');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [ended, setEnded] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [gradedTargets, setGradedTargets] = useState<string[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [gradeInputs, setGradeInputs] = useState<Record<string, { score: string; comment: string }>>({});
  const [grading, setGrading] = useState<Record<string, boolean>>({});
  const [successMsgMap, setSuccessMsgMap] = useState<Record<string, string>>({});
  const [allSubmitted, setAllSubmitted] = useState(false);
  const [showSubmitMsg, setShowSubmitMsg] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'contests', id)).then(snap => {
      if (snap.exists()) {
        setContest({ id: snap.id, ...snap.data() });
        setEnded(!!snap.data().ended);
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

  useEffect(() => {
    if (!id || !user) return;
    // "너래"는 예외로 모두 평가 가능
    if (user.nickname === '너래') return;
    // 실시간 구독으로 변경
    const unsub = onSnapshot(
      query(collection(db, 'contests', id, 'grades'), where('evaluator', '==', user.nickname)),
      (snap) => {
        const targets = snap.docs.map(doc => doc.data().target);
        setGradedTargets(prev => Array.from(new Set([...prev, ...targets])));
      }
    );
    return () => unsub();
  }, [id, user]);

  // 점수에 따른 등급 계산 함수
  const getGradeFromScore = (score: number) => {
    if (score >= 1 && score <= 30) return '🫐 블루베리';
    else if (score <= 40) return '🥝 키위';
    else if (score <= 50) return '🍎 사과';
    else if (score <= 60) return '🍈 멜론';
    else if (score <= 70) return '🍉 수박';
    else if (score <= 80) return '🌍 지구';
    else if (score <= 90) return '🪐 토성';
    else if (score <= 100) return '☀️ 태양';
    else return '';
  };

  const handleScoreChange = (val: string) => {
    const num = Number(val);
    if (val === '') {
      setScore('');
      setSuggestedGrade('');
      return;
    }
    if (num < 0 || num > 100) {
      setScore(num);
      setSuggestedGrade('');
      setError('점수는 0~100점 사이만 입력 가능합니다.');
      return;
    }
    setScore(num);
    setError('');
    // 등급표에 따라 추천등급 계산
    setSuggestedGrade(getGradeFromScore(num));
  };

  // 참가자 목록 중복 제거 유틸
  const uniqueParticipants = participants.filter((p, idx, arr) => arr.findIndex(pp => pp.nickname === p.nickname) === idx);

  // 평가하지 않은 대상 목록 계산 (이미 평가된 참가자, 본인, 이미 평가받은 참가자 제외)
  const ungradedTargets = uniqueParticipants
    .filter((p: any) =>
      p.nickname !== user?.nickname &&
      // 닉네임 기반으로도 본인 제외
      !(p.nickname && user?.nickname && p.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim()) &&
      (user?.nickname === '너래' || !gradedTargets.includes(p.nickname)) &&
      // 이미 평가받은 참가자 제외 (grades에 target으로 이미 존재하는 경우)
      !uniqueParticipants.some((other: any) => other.nickname === p.nickname && gradedTargets.includes(p.nickname))
    );
  const allGraded = ungradedTargets.length === 0;
  const hasEvaluatableTargets = ungradedTargets.length > 0;
  
  // 본인이 참가자 목록에 있는지 확인
  const isParticipant = user && uniqueParticipants.some((p: any) => 
    p.nickname && user.nickname && p.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim()
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!nickname || score === '' || score < 0 || score > 100) return setError('닉네임과 0~100점 사이의 점수를 입력하세요.');
    if (nickname === user.nickname) return setError('본인 평가는 불가합니다.');
    if (!id) return setError('잘못된 콘테스트 접근입니다.');
    // '너래'는 중복 평가 허용
    if (user.nickname !== '너래') {
      const q = query(collection(db, 'contests', id, 'grades'), where('evaluator', '==', user.nickname), where('target', '==', nickname));
      const snap = await getDocs(q);
      if (!snap.empty) return setError('이미 이 참가자를 평가하셨습니다.');
    }
    await addDoc(collection(db, 'contests', id, 'grades'), {
      evaluator: user.nickname,
      evaluatorRole: user.role,
      target: nickname,
      score,
      comment: comment ?? '',
      createdAt: new Date()
    });
    setSuccessMsg('제출이 완료되었습니다. 계속 다른 참가자를 평가할 수 있습니다.');
    setNickname('');
    setScore('');
    setComment('');
    setSuggestedGrade('');
    // setSubmitted(true); // 정규등급전에서는 사용하지 않음
  };

  const handleComplete = () => {
    if (window.confirm('평가를 모두 완료하시겠습니까?')) {
      setSubmitted(true);
    }
  };

  // 경연 평가 제출
  const handleSubmitGrade = async (targetId: string) => {
    if (!id || !user) return;
    const { score, comment } = gradeInputs[targetId] || {};
    const numScore = Number(score);
    if (!score || isNaN(numScore) || numScore < 0 || numScore > 100) {
      alert('0~100점 사이의 점수를 입력하세요.');
      return;
    }
    setGrading(g => ({ ...g, [targetId]: true }));
    // 중복 평가 방지: 이미 평가한 경우 DB에 추가하지 않음
    const q = query(collection(db, 'contests', id, 'grades'), where('evaluator', '==', user.nickname), where('target', '==', targetId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      setGrading(g => ({ ...g, [targetId]: false }));
      setSuccessMsgMap(msgs => ({ ...msgs, [targetId]: '이미 제출하셨습니다.' }));
      return;
    }
    await addDoc(collection(db, 'contests', id, 'grades'), {
      evaluator: user.nickname,
      evaluatorRole: user.role,
      target: targetId,
      score: numScore,
      comment: comment ?? '',
      createdAt: new Date()
    });
    setGrading(g => ({ ...g, [targetId]: false }));
    setSuccessMsgMap(msgs => ({ ...msgs, [targetId]: '제출완료' }));
    setGradedTargets(prev => Array.from(new Set([...prev, targetId])));
  };

  // 평가 완료(전체) 버튼 핸들러
  const handleAllSubmit = async () => {
    if (!window.confirm('정말 제출완료 하시겠습니까? 제출 후 수정할 수 없습니다.')) {
      return;
    }

    if (!id || !user) return;

    // 현재 입력된 모든 평가 데이터 수집
    const submissionsToProcess = [];
    
    // 팀 평가 데이터 수집
    for (const team of teams) {
      const input = gradeInputs[team.id];
      if (input && input.score && !gradedTargets.includes(team.id)) {
        const numScore = Number(input.score);
        if (!isNaN(numScore) && numScore >= 0 && numScore <= 100) {
          // 본인 팀인지 확인
          const isMyTeam = user && Array.isArray(team.members) && team.members.includes(user.uid);
          const isMyTeamByNickname = user && Array.isArray(team.members) && team.members.some((uid: string) => {
            const p = uniqueParticipants.find(pp => pp.uid === uid);
            return p && p.nickname && user.nickname && p.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim();
          });
          
          if (!isMyTeam && !isMyTeamByNickname) {
            submissionsToProcess.push({
              target: team.id,
              score: numScore,
              comment: input.comment || ''
            });
          }
        }
      }
    }

    // 솔로 참가자 평가 데이터 수집
    const soloParticipants = uniqueParticipants.filter(p => !teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid)));
    for (const participant of soloParticipants) {
      const input = gradeInputs[participant.uid];
      if (input && input.score && !gradedTargets.includes(participant.uid)) {
        const numScore = Number(input.score);
        if (!isNaN(numScore) && numScore >= 0 && numScore <= 100) {
          // 본인인지 확인
          const isMe = user && participant.uid === user.uid;
          const isMeByNickname = user && participant.nickname && user.nickname && participant.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim();
          
          if (!isMe && !isMeByNickname) {
            submissionsToProcess.push({
              target: participant.uid,
              score: numScore,
              comment: input.comment || ''
            });
          }
        }
      }
    }

    if (submissionsToProcess.length === 0) {
      alert('제출할 평가가 없습니다. 점수를 입력해주세요.');
      return;
    }

    try {
      // 모든 평가를 데이터베이스에 제출
      for (const submission of submissionsToProcess) {
        // 중복 평가 확인
        const q = query(collection(db, 'contests', id, 'grades'), where('evaluator', '==', user.nickname), where('target', '==', submission.target));
        const snap = await getDocs(q);
        
        if (snap.empty) {
          await addDoc(collection(db, 'contests', id, 'grades'), {
            evaluator: user.nickname,
            evaluatorRole: user.role,
            target: submission.target,
            score: submission.score,
            comment: submission.comment,
            createdAt: new Date()
          });
        }
      }

      setShowSubmitMsg(true);
      setTimeout(() => {
        navigate(`/contests/${id}`);
      }, 1500);
    } catch (error) {
      console.error('평가 제출 중 오류:', error);
      alert('평가 제출 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  if (ended) {
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
          background: 'rgba(239, 68, 68, 0.8)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '40px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
          <div style={{ color: 'white', fontSize: '18px', fontWeight: 700 }}>이 콘테스트는 종료되어 더 이상 참여할 수 없습니다.</div>
        </div>
      </div>
    );
  }

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

  // 콘테스트가 개최되지 않은 경우
  if (!contest.isStarted) {
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
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏸️</div>
          <div style={{ color: 'white', fontSize: '20px', fontWeight: 600, marginBottom: '12px' }}>콘테스트가 아직 개최되지 않았습니다</div>
          <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '16px', marginBottom: '24px' }}>
            리더가 개최할 때까지 기다려주세요.
          </div>
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
            onClick={() => navigate(`/contests/${id}`)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            ← 콘테스트 상세로
          </button>
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
        maxWidth: '800px',
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
            onClick={() => navigate(`/contests/${id}`)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            ← 콘테스트 메인으로
          </button>
        </div>

        {/* 메인 콘텐츠 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '30px',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <h2 style={{ 
            color: 'white', 
            fontWeight: 700, 
            fontSize: 28, 
            marginBottom: 8, 
            textAlign: 'center',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
          }}>
            {contest.title}
          </h2>
          <div style={{ 
            color: 'rgba(255, 255, 255, 0.9)', 
            fontWeight: 500, 
            marginBottom: 8, 
            textAlign: 'center',
            fontSize: '16px'
          }}>
            {contest.type}
          </div>
          <div style={{ 
            color: 'rgba(255, 255, 255, 0.8)', 
            fontSize: 15, 
            marginBottom: 24, 
            textAlign: 'center' 
          }}>
                         📅 마감: {contest.deadline && (contest.deadline.seconds ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : '')}
           </div>
           
           {submitted ? (
             <div style={{ 
               color: '#10B981', 
               fontWeight: 700, 
               fontSize: 20, 
               margin: '32px 0', 
               textAlign: 'center',
               background: 'rgba(16, 185, 129, 0.1)',
               backdropFilter: 'blur(5px)',
               padding: '16px',
               borderRadius: '12px',
               border: '1px solid rgba(16, 185, 129, 0.3)'
             }}>
               ✅ 제출이 완료되었습니다.
             </div>
        ) : (
          (contest.type === '정규등급전' || contest.type === '세미등급전') ? (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', width: '100%' }}>
              <div style={{ width: '100%' }}>
                <label style={{ fontWeight: 600 }}>피평가자 닉네임{contest.type === '정규등급전' ? '' : ' (직접 입력)'}</label>
                {contest.type === '정규등급전' ? (
                  <select
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    style={{ width: '100%', padding: 14, fontSize: 18, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6 }}
                    disabled={!hasEvaluatableTargets}
                  >
                    <option value="">선택</option>
                    {ungradedTargets.map((p: any) => (
                      <option key={p.nickname} value={p.nickname}>{p.nickname}</option>
                    ))}
                    {!hasEvaluatableTargets && (
                      <option value="" disabled>평가할 대상이 없습니다</option>
                    )}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    placeholder="피평가자 닉네임을 입력하세요"
                    style={{ width: '100%', padding: 14, fontSize: 18, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6 }}
                  />
                )}
              </div>
              <div style={{ width: '100%' }}>
                <label style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>점수 (0~100점 입력)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={score}
                  onChange={e => handleScoreChange(e.target.value)}
                  style={{ width: '100%', padding: 14, fontSize: 18, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 2, marginBottom: 2, boxSizing: 'border-box' }}
                  placeholder="0~100 사이의 점수를 입력하세요"
                  disabled={!hasEvaluatableTargets}
                />
                {suggestedGrade && (
                  <div style={{ marginTop: 8, color: '#8A55CC', fontWeight: 700, fontSize: 18 }}>추천등급: {suggestedGrade}</div>
                )}
              </div>
              <div style={{ width: '100%' }}>
                <label style={{ fontWeight: 600 }}>심사내용(선택)</label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="심사 코멘트를 입력하세요 (선택, Shift+Enter로 줄바꿈)"
                  style={{ 
                    width: '100%', 
                    padding: 14, 
                    fontSize: 18, 
                    borderRadius: 8, 
                    border: '1px solid #E5DAF5', 
                    marginTop: 6, 
                    minHeight: 120,
                    maxHeight: 300,
                    resize: 'none',
                    overflow: 'hidden',
                    lineHeight: '1.4',
                    fontFamily: 'inherit'
                  }}
                  disabled={!hasEvaluatableTargets}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(Math.max(target.scrollHeight, 120), 300) + 'px';
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', width: '100%', flexDirection: 'row' }}>
                <button type="submit" style={{ background: '#8A55CC', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' }} disabled={!hasEvaluatableTargets}>제출</button>
                <button type="button" style={{ background: '#F43F5E', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' }} onClick={handleComplete}>완료</button>
              </div>
              <div style={{ color: '#F43F5E', fontWeight: 600, marginTop: 8, textAlign: 'center' }}>본인 평가 불가, 제출 후 수정 불가</div>
              {isParticipant && (
                <div style={{ marginTop: 16, padding: 16, background: '#FEF2F2', borderRadius: 8, border: '1px solid #FECACA' }}>
                  <div style={{ color: '#DC2626', fontWeight: 600, marginBottom: 4, textAlign: 'center' }}>📢 참가자 안내</div>
                  <div style={{ color: '#7F1D1D', fontSize: 14, textAlign: 'center' }}>
                    본인({user?.nickname})은 이 콘테스트의 참가자로 등록되어 있어 자기 평가는 불가능합니다.
                  </div>
                </div>
              )}
              {gradedTargets.length > 0 && (
                <div style={{ marginTop: 16, padding: 16, background: '#F0F9FF', borderRadius: 8, border: '1px solid #BAE6FD' }}>
                  <div style={{ color: '#0369A1', fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>이미 평가를 완료한 대상</div>
                  <div style={{ color: '#0F172A', fontSize: 14, textAlign: 'center' }}>
                    {gradedTargets.join(', ')}
                  </div>
                </div>
              )}
              <div style={{ color: '#B497D6', fontSize: 13, marginTop: 8, textAlign: 'center' }}>* 실제 평가/참가/제출 로직은 추후 구현</div>
            </form>
          ) : contest.type === '경연' ? (
            <>
              <div style={{ color: '#8A55CC', fontWeight: 700, fontSize: 20, marginBottom: 24, textAlign: 'center' }}>경연 참가자/팀 평가</div>
              {/* 듀엣 팀 */}
              {teams.length > 0 && (
                <div style={{ marginBottom: 32, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, color: '#7C4DBC', marginBottom: 8, textAlign: 'center' }}>듀엣 팀</div>
                  {teams.map(team => {
                    const isMyTeam = user && Array.isArray(team.members) && team.members.includes(user.uid);
                    // 본인 닉네임이 팀원에 포함되어 있는지도 확인
                    const isMyTeamByNickname = user && Array.isArray(team.members) && team.members.some((uid: string) => {
                      const p = uniqueParticipants.find(pp => pp.uid === uid);
                      return p && p.nickname && user.nickname && p.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim();
                    });
                    const isMine = isMyTeam || isMyTeamByNickname;
                    const alreadyGraded = gradedTargets.includes(team.id);
                    return (
                      <div key={team.id} style={{ 
                        background: 'linear-gradient(135deg, #F6F2FF 0%, #F0F4FF 100%)', 
                        borderRadius: 16, 
                        padding: '20px', 
                        marginBottom: 16, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: 12, 
                        width: '100%',
                        boxShadow: '0 4px 16px rgba(138, 85, 204, 0.1)',
                        border: '1px solid rgba(138, 85, 204, 0.1)'
                      }}>
                        <div style={{ fontWeight: 700, color: '#8A55CC', textAlign: 'center', fontSize: 18 }}>팀명: {team.teamName}</div>
                        <div style={{ color: '#6B7280', fontSize: 15, textAlign: 'center', fontWeight: 500 }}>팀원: {Array.isArray(team.members) ? team.members.map((uid: string) => {
                          // 먼저 uniqueParticipants에서 찾기
                          const p = uniqueParticipants.find(pp => pp.uid === uid);
                          if (p && p.nickname) {
                            return p.nickname;
                          }
                          
                          // uniqueParticipants에서 찾지 못하면 전체 participants에서 찾기
                          const allP = participants.find(pp => pp.uid === uid);
                          if (allP && allP.nickname) {
                            return allP.nickname;
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
                        }).join(', ') : ''}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                          {isMine ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#F43F5E', fontWeight: 600, fontSize: 16 }}>본인이 속한 팀은 평가할 수 없습니다.</span>
                              <span style={{ color: '#9CA3AF', fontSize: 14 }}>자기 평가는 금지되어 있습니다.</span>
                            </div>
                          ) : alreadyGraded ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                              <button
                                style={{
                                  background: '#BDBDBD',
                                  color: '#fff',
                                  borderRadius: 8,
                                  padding: '10px 24px',
                                  fontWeight: 600,
                                  fontSize: 16,
                                  border: 'none',
                                  cursor: 'not-allowed',
                                  transition: 'background 0.2s',
                                }}
                                disabled
                              >
                                제출완료
                              </button>
                              <div style={{ color: '#10B981', fontWeight: 600, fontSize: 14, textAlign: 'center' }}>
                                이미 평가를 완료하셨습니다.
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                              <div>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  placeholder="0~100 사이의 점수 입력"
                                  value={gradeInputs[team.id]?.score || ''}
                                  onChange={e => setGradeInputs(inputs => ({ ...inputs, [team.id]: { ...inputs[team.id], score: e.target.value } }))}
                                  disabled={grading[team.id]}
                                  style={{ 
                                    width: '100%', 
                                    padding: '12px 16px', 
                                    borderRadius: 8, 
                                    border: '1px solid #E5DAF5', 
                                    fontSize: 16,
                                    boxSizing: 'border-box',
                                    background: '#FAFAFA'
                                  }}
                                />
                                {gradeInputs[team.id]?.score && !isNaN(Number(gradeInputs[team.id]?.score)) && Number(gradeInputs[team.id]?.score) >= 1 && Number(gradeInputs[team.id]?.score) <= 100 && (
                                  <div style={{ marginTop: 6, color: '#8A55CC', fontWeight: 600, fontSize: 14, textAlign: 'center' }}>
                                    추천등급: {getGradeFromScore(Number(gradeInputs[team.id]?.score))}
                                  </div>
                                )}
                              </div>
                              <input
                                type="text"
                                placeholder="코멘트(선택)"
                                value={gradeInputs[team.id]?.comment || ''}
                                onChange={e => setGradeInputs(inputs => ({ ...inputs, [team.id]: { ...inputs[team.id], comment: e.target.value } }))}
                                disabled={grading[team.id]}
                                style={{ 
                                  width: '100%', 
                                  padding: '12px 16px', 
                                  borderRadius: 8, 
                                  border: '1px solid #E5DAF5',
                                  fontSize: 16,
                                  boxSizing: 'border-box',
                                  background: '#FAFAFA'
                                }}
                              />
                              <button
                                style={{
                                  background: '#8A55CC',
                                  color: '#fff',
                                  borderRadius: 12,
                                  padding: '14px 24px',
                                  fontWeight: 600,
                                  fontSize: 16,
                                  border: 'none',
                                  cursor: grading[team.id] ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s',
                                  boxShadow: '0 4px 12px rgba(138, 85, 204, 0.3)',
                                  width: '100%'
                                }}
                                onClick={() => handleSubmitGrade(team.id)}
                                disabled={grading[team.id]}
                              >
                                제출
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* 솔로 참가자 */}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontWeight: 600, color: '#7C4DBC', marginBottom: 8, textAlign: 'center' }}>솔로 참가자</div>
                {uniqueParticipants.filter(p => !teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid))).map(p => {
                  const isMe = user && p.uid === user.uid;
                  // 닉네임 기반으로도 본인인지 확인
                  const isMeByNickname = user && p.nickname && user.nickname && p.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim();
                  const isMine = isMe || isMeByNickname;
                  const alreadyGraded = gradedTargets.includes(p.uid);
                  return (
                    <div
                      key={p.uid}
                      style={{
                        background: alreadyGraded 
                          ? 'linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%)' 
                          : 'linear-gradient(135deg, #F6F2FF 0%, #F0F4FF 100%)',
                        borderRadius: 16,
                        padding: '20px',
                        marginBottom: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        width: '100%',
                        filter: alreadyGraded ? 'grayscale(1) opacity(0.7)' : 'none',
                        border: alreadyGraded ? '2px dashed #B497D6' : '1px solid rgba(138, 85, 204, 0.1)',
                        boxShadow: '0 4px 16px rgba(138, 85, 204, 0.1)',
                        position: 'relative',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: '#8A55CC', textAlign: 'center', fontSize: 18, textDecoration: alreadyGraded ? 'line-through' : 'none' }}>{p.nickname}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                        {isMine ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: '#F43F5E', fontWeight: 600, fontSize: 16 }}>본인은 평가할 수 없습니다.</span>
                            <span style={{ color: '#9CA3AF', fontSize: 14 }}>자기 평가는 금지되어 있습니다.</span>
                          </div>
                        ) : alreadyGraded ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                            <button
                              style={{
                                background: '#BDBDBD',
                                color: '#fff',
                                borderRadius: 8,
                                padding: '10px 24px',
                                fontWeight: 600,
                                fontSize: 16,
                                border: 'none',
                                cursor: 'not-allowed',
                                transition: 'background 0.2s',
                              }}
                              disabled
                            >
                              제출완료
                            </button>
                            <div style={{ color: '#10B981', fontWeight: 600, fontSize: 14, textAlign: 'center' }}>
                              이미 평가를 완료하셨습니다.
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                            <div>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                placeholder="0~100 사이의 점수 입력"
                                value={gradeInputs[p.uid]?.score || ''}
                                onChange={e => setGradeInputs(inputs => ({ ...inputs, [p.uid]: { ...inputs[p.uid], score: e.target.value } }))}
                                disabled={grading[p.uid]}
                                style={{ 
                                  width: '100%', 
                                  padding: '12px 16px', 
                                  borderRadius: 8, 
                                  border: '1px solid #E5DAF5', 
                                  fontSize: 16,
                                  boxSizing: 'border-box',
                                  background: '#FAFAFA'
                                }}
                              />
                              {gradeInputs[p.uid]?.score && !isNaN(Number(gradeInputs[p.uid]?.score)) && Number(gradeInputs[p.uid]?.score) >= 1 && Number(gradeInputs[p.uid]?.score) <= 100 && (
                                <div style={{ marginTop: 6, color: '#8A55CC', fontWeight: 600, fontSize: 14, textAlign: 'center' }}>
                                  추천등급: {getGradeFromScore(Number(gradeInputs[p.uid]?.score))}
                                </div>
                              )}
                            </div>
                            <input
                              type="text"
                              placeholder="코멘트(선택)"
                              value={gradeInputs[p.uid]?.comment || ''}
                              onChange={e => setGradeInputs(inputs => ({ ...inputs, [p.uid]: { ...inputs[p.uid], comment: e.target.value } }))}
                              disabled={grading[p.uid]}
                              style={{ 
                                width: '100%', 
                                padding: '12px 16px', 
                                borderRadius: 8, 
                                border: '1px solid #E5DAF5',
                                fontSize: 16,
                                boxSizing: 'border-box',
                                background: '#FAFAFA'
                              }}
                            />
                            <button
                              style={{
                                background: '#8A55CC',
                                color: '#fff',
                                borderRadius: 12,
                                padding: '14px 24px',
                                fontWeight: 600,
                                fontSize: 16,
                                border: 'none',
                                cursor: grading[p.uid] ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 4px 12px rgba(138, 85, 204, 0.3)',
                                width: '100%'
                              }}
                              onClick={() => handleSubmitGrade(p.uid)}
                              disabled={grading[p.uid]}
                            >
                              제출
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* 평가 전체 제출완료 버튼 */}
              <button
                style={{
                  marginTop: 32,
                  background: 'linear-gradient(135deg, #8A55CC 0%, #7C4DBC 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 16,
                  padding: '18px 24px',
                  fontWeight: 700,
                  fontSize: 18,
                  cursor: 'pointer',
                  width: '100%',
                  boxShadow: '0 8px 24px rgba(138, 85, 204, 0.3)',
                  transition: 'all 0.3s ease',
                }}
                onClick={handleAllSubmit}
                disabled={showSubmitMsg}
              >
                🎯 제출완료
              </button>
              {showSubmitMsg && (
                <div style={{ color: '#10B981', fontWeight: 700, fontSize: 20, margin: '32px 0', textAlign: 'center' }}>
                  제출이 완료되었습니다.
                </div>
              )}
            </>
          ) : null
          )}
        </div>
      </div>
    </div>
  );
};

export default ContestParticipate; 