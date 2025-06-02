import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, getDocs, query, where, onSnapshot } from 'firebase/firestore';
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
    return () => unsub();
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

  // 평가하지 않은 대상 목록 계산 (이미 평가된 참가자, 본인, 이미 평가받은 참가자 제외)
  const ungradedTargets = participants
    .filter((p: any) =>
      p.nickname !== user.nickname &&
      (user.nickname === '너래' || !gradedTargets.includes(p.nickname)) &&
      // 이미 평가받은 참가자 제외 (grades에 target으로 이미 존재하는 경우)
      !participants.some((other: any) => other.nickname === p.nickname && gradedTargets.includes(p.nickname))
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

  if (ended) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#F43F5E', fontWeight: 700 }}>이 콘테스트는 종료되어 더 이상 참여할 수 없습니다.</div>;
  }

  if (!contest) return <div style={{ padding: 40, textAlign: 'center', color: '#B497D6' }}>콘테스트 정보를 불러오는 중...</div>;

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', background: '#fff', borderRadius: 20, boxShadow: '0 8px 32px #E5DAF5', padding: 32 }}>
      <h2 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 24 }}>{contest.title} 참여/평가</h2>
      <div style={{ color: '#6B7280', fontWeight: 500, marginBottom: 12 }}>{contest.type}</div>
      <div style={{ color: '#B497D6', fontSize: 14, marginBottom: 24 }}>마감: {contest.deadline && (contest.deadline.seconds ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : '')}</div>
      {submitted ? (
        <div style={{ color: '#10B981', fontWeight: 700, fontSize: 20, margin: '32px 0', textAlign: 'center' }}>제출이 완료되었습니다.</div>
      ) : (
        (contest.type === '정규등급전' || contest.type === '세미등급전') && (
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
              <label style={{ fontWeight: 600 }}>점수(0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={e => handleScoreChange(e.target.value)}
                style={{ width: '100%', padding: 14, fontSize: 18, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6 }}
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
                style={{ width: '100%', padding: 14, fontSize: 18, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6, minHeight: 80, resize: 'vertical' }}
                disabled={!hasEvaluatableTargets}
              />
            </div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', width: '100%' }}>
              <button type="submit" style={{ background: '#8A55CC', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' }} disabled={!hasEvaluatableTargets}>제출</button>
              <button type="button" style={{ background: '#F43F5E', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' }} onClick={handleComplete}>완료</button>
            </div>
            <div style={{ color: '#F43F5E', fontWeight: 600, marginTop: 8, textAlign: 'center' }}>본인 평가 불가, 제출 후 수정 불가</div>
            <div style={{ color: '#B497D6', fontSize: 13, marginTop: 8, textAlign: 'center' }}>* 실제 평가/참가/제출 로직은 추후 구현</div>
          </form>
        )
      )}
    </div>
  );
};

export default ContestParticipate; 