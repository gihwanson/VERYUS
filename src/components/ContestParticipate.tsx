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
        setGradedTargets(snap.docs.map(doc => doc.data().target));
      }
    );
    return () => unsub();
  }, [id, user]);

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
    if (num >= 1 && num <= 30) setSuggestedGrade('🫐 블루베리');
    else if (num <= 40) setSuggestedGrade('🥝 키위');
    else if (num <= 50) setSuggestedGrade('🍎 사과');
    else if (num <= 60) setSuggestedGrade('🍈 멜론');
    else if (num <= 70) setSuggestedGrade('🍉 수박');
    else if (num <= 80) setSuggestedGrade('🌍 지구');
    else if (num <= 90) setSuggestedGrade('🪐 토성');
    else if (num <= 100) setSuggestedGrade('☀️ 태양');
    else setSuggestedGrade('');
  };

  // 참가자 목록 중복 제거 유틸
  const uniqueParticipants = participants.filter((p, idx, arr) => arr.findIndex(pp => pp.nickname === p.nickname) === idx);

  // 평가하지 않은 대상 목록 계산 (이미 평가된 참가자, 본인, 이미 평가받은 참가자 제외)
  const ungradedTargets = uniqueParticipants
    .filter((p: any) =>
      p.nickname !== user.nickname &&
      (user.nickname === '너래' || !gradedTargets.includes(p.nickname)) &&
      // 이미 평가받은 참가자 제외 (grades에 target으로 이미 존재하는 경우)
      !uniqueParticipants.some((other: any) => other.nickname === p.nickname && gradedTargets.includes(p.nickname))
    );
  const allGraded = ungradedTargets.length === 0;
  const hasEvaluatableTargets = ungradedTargets.length > 0;

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
      comment,
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
      comment,
      createdAt: new Date()
    });
    setGrading(g => ({ ...g, [targetId]: false }));
    setSuccessMsgMap(msgs => ({ ...msgs, [targetId]: '이미 제출하셨습니다.' }));
  };

  // 평가 완료(전체) 버튼 핸들러
  const handleAllSubmit = () => {
    setShowSubmitMsg(true);
    setTimeout(() => {
      navigate(`/contests/${id}`);
    }, 1500);
  };

  if (ended) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#F43F5E', fontWeight: 700 }}>이 콘테스트는 종료되어 더 이상 참여할 수 없습니다.</div>;
  }

  if (!contest) return <div style={{ padding: 40, textAlign: 'center', color: '#B497D6' }}>콘테스트 정보를 불러오는 중...</div>;

  return (
    <div
      style={{
        maxWidth: 600,
        margin: '0 auto',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <button
        style={{ background: '#F6F2FF', color: '#8A55CC', borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer', marginBottom: 24, alignSelf: 'flex-start' }}
        onClick={() => navigate(`/contests/${id}`)}
      >
        ← 콘테스트 메인으로
      </button>
      <div
        className="contest-card"
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: '#FFF7E6',
          borderRadius: 16,
          padding: 32,
          boxSizing: 'border-box',
          maxWidth: 500,
          minWidth: 0,
        }}
      >
        <h2 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 28, marginBottom: 8, textAlign: 'center' }}>{contest.title}</h2>
        <div style={{ color: '#6B7280', fontWeight: 500, marginBottom: 8, textAlign: 'center' }}>{contest.type}</div>
        <div style={{ color: '#B497D6', fontSize: 15, marginBottom: 24, textAlign: 'center' }}>마감: {contest.deadline && (contest.deadline.seconds ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : '')}</div>
        {submitted ? (
          <div style={{ color: '#10B981', fontWeight: 700, fontSize: 20, margin: '32px 0', textAlign: 'center' }}>제출이 완료되었습니다.</div>
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
                  placeholder="심사 코멘트를 입력하세요 (선택)"
                  style={{ width: '100%', padding: 14, fontSize: 18, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6, minHeight: 120, resize: 'vertical' }}
                  disabled={!hasEvaluatableTargets}
                />
              </div>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', width: '100%', flexDirection: 'row' }}>
                <button type="submit" style={{ background: '#8A55CC', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' }} disabled={!hasEvaluatableTargets}>제출</button>
                <button type="button" style={{ background: '#F43F5E', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' }} onClick={handleComplete}>완료</button>
              </div>
              <div style={{ color: '#F43F5E', fontWeight: 600, marginTop: 8, textAlign: 'center' }}>본인 평가 불가, 제출 후 수정 불가</div>
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
                    const alreadyGraded = gradedTargets.includes(team.id);
                    return (
                      <div key={team.id} style={{ background: '#F6F2FF', borderRadius: 8, padding: '12px 16px', marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
                        <div style={{ fontWeight: 600, color: '#8A55CC', textAlign: 'center' }}>팀명: {team.teamName}</div>
                        <div style={{ color: '#6B7280', fontSize: 15, textAlign: 'center' }}>팀원: {Array.isArray(team.members) ? team.members.map((uid: string) => {
                          const p = uniqueParticipants.find(pp => pp.uid === uid);
                          return p ? p.nickname : uid;
                        }).join(', ') : ''}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            placeholder="0~100 사이의 점수 입력"
                            value={gradeInputs[team.id]?.score || ''}
                            onChange={e => setGradeInputs(inputs => ({ ...inputs, [team.id]: { ...inputs[team.id], score: e.target.value } }))}
                            disabled={isMyTeam || alreadyGraded || grading[team.id]}
                            style={{ width: '100%', maxWidth: 120, padding: '8px 12px', borderRadius: 6, border: '1px solid #E5DAF5', marginBottom: 2, boxSizing: 'border-box' }}
                          />
                          <input
                            type="text"
                            placeholder="코멘트(선택)"
                            value={gradeInputs[team.id]?.comment || ''}
                            onChange={e => setGradeInputs(inputs => ({ ...inputs, [team.id]: { ...inputs[team.id], comment: e.target.value } }))}
                            disabled={isMyTeam || alreadyGraded || grading[team.id]}
                            style={{ width: 180, padding: '4px 8px', borderRadius: 6, border: '1px solid #E5DAF5' }}
                          />
                          <button
                            style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, fontSize: 15, cursor: isMyTeam || alreadyGraded ? 'not-allowed' : 'pointer' }}
                            onClick={() => handleSubmitGrade(team.id)}
                            disabled={isMyTeam || alreadyGraded || grading[team.id]}
                          >
                            {alreadyGraded ? '평가 완료' : '제출'}
                          </button>
                          {(successMsgMap[team.id] || alreadyGraded) && (
                            <span style={{ color: '#10B981', fontWeight: 600, marginLeft: 12 }}>
                              {alreadyGraded ? '이미 제출하셨습니다.' : successMsgMap[team.id]}
                            </span>
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
                  const alreadyGraded = gradedTargets.includes(p.uid);
                  return (
                    <div
                      key={p.uid}
                      style={{
                        background: '#F6F2FF',
                        borderRadius: 8,
                        padding: '12px 16px',
                        marginBottom: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        filter: alreadyGraded ? 'grayscale(1) opacity(0.7)' : 'none',
                        border: alreadyGraded ? '2px dashed #B497D6' : 'none',
                        position: 'relative',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#8A55CC', textAlign: 'center', textDecoration: alreadyGraded ? 'line-through' : 'none' }}>{p.nickname}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="0~100 사이의 점수 입력"
                          value={gradeInputs[p.uid]?.score || ''}
                          onChange={e => setGradeInputs(inputs => ({ ...inputs, [p.uid]: { ...inputs[p.uid], score: e.target.value } }))}
                          disabled={isMe || alreadyGraded || grading[p.uid]}
                          style={{ width: '100%', maxWidth: 120, padding: '8px 12px', borderRadius: 6, border: '1px solid #E5DAF5', marginBottom: 2, boxSizing: 'border-box' }}
                        />
                        <input
                          type="text"
                          placeholder="코멘트(선택)"
                          value={gradeInputs[p.uid]?.comment || ''}
                          onChange={e => setGradeInputs(inputs => ({ ...inputs, [p.uid]: { ...inputs[p.uid], comment: e.target.value } }))}
                          disabled={isMe || alreadyGraded || grading[p.uid]}
                          style={{ width: 180, padding: '8px 12px', borderRadius: 6, border: '1px solid #E5DAF5', minHeight: 40, boxSizing: 'border-box' }}
                        />
                        <button
                          style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, fontSize: 15, cursor: isMe || alreadyGraded ? 'not-allowed' : 'pointer' }}
                          onClick={() => handleSubmitGrade(p.uid)}
                          disabled={isMe || alreadyGraded || grading[p.uid]}
                        >
                          {alreadyGraded ? '평가 완료' : '제출'}
                        </button>
                        {(successMsgMap[p.uid] || alreadyGraded) && (
                          <span style={{ color: '#10B981', fontWeight: 600, marginLeft: 12 }}>
                            {alreadyGraded ? '이미 제출하셨습니다.' : successMsgMap[p.uid]}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* 평가 전체 제출완료 버튼 */}
              <button
                style={{
                  marginTop: 24,
                  background: '#8A55CC',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px 0',
                  fontWeight: 700,
                  fontSize: 18,
                  cursor: 'pointer',
                  width: '100%',
                  maxWidth: 320,
                }}
                onClick={handleAllSubmit}
                disabled={showSubmitMsg}
              >
                제출완료
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
  );
};

export default ContestParticipate; 