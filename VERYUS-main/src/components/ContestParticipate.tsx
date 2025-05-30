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
    getDocs(query(collection(db, 'contests', id, 'grades'), where('evaluator', '==', user.nickname))).then(snap => {
      setGradedTargets(snap.docs.map(doc => doc.data().target));
    });
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

  const handleSubmit = async () => {
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
  };

  const handleFinish = () => {
    if (window.confirm('해당 콘테스트를 제출을 완료하시겠습니까?')) {
      navigate('/contests');
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
      <div style={{ color: '#F43F5E', fontWeight: 600, marginBottom: 16 }}>본인 평가 불가, 제출 후 수정 불가</div>
      {contest.type === '등급평가' ? (
        submitted ? (
          <div style={{ color: '#10B981', fontWeight: 700, fontSize: 20, margin: '32px 0' }}>제출이 완료되었습니다.</div>
        ) : (
          <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ width: '100%' }}>
              <label style={{ fontWeight: 600, fontSize: 16 }}>피평가자 닉네임</label>
              <select value={nickname} onChange={e => setNickname(e.target.value)} style={{ marginLeft: 8, width: '100%', padding: 14, fontSize: 18, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6 }}>
                <option value="">선택</option>
                {participants.filter(p => p.nickname !== user.nickname && (user.nickname === '너래' || !gradedTargets.includes(p.nickname))).map(p => (
                  <option key={p.nickname} value={p.nickname}>{p.nickname}</option>
                ))}
              </select>
            </div>
            <div style={{ width: '100%' }}>
              <label style={{ fontWeight: 600, fontSize: 16 }}>점수(0~100)</label>
              <input type="number" min={0} max={100} value={score} onChange={e => handleScoreChange(e.target.value)} style={{ marginLeft: 8, width: '100%', padding: 14, fontSize: 18, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6 }} />
              {suggestedGrade && <div style={{ marginTop: 8, color: '#8A55CC', fontWeight: 700, fontSize: 18 }}>추천등급: {suggestedGrade}</div>}
            </div>
            <div style={{ width: '100%' }}>
              <label style={{ fontWeight: 600, fontSize: 16 }}>심사내용(선택)</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} style={{ marginLeft: 8, width: '100%', minHeight: 160, padding: 18, fontSize: 16, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', alignSelf: 'center' }}>
              <button style={{ marginTop: 8, background: '#8A55CC', color: '#fff', borderRadius: 8, padding: '14px 32px', fontWeight: 600, fontSize: 18, border: 'none', cursor: 'pointer' }} onClick={handleSubmit}>제출</button>
              <button style={{ marginTop: 8, background: '#F43F5E', color: '#fff', borderRadius: 8, padding: '14px 32px', fontWeight: 600, fontSize: 18, border: 'none', cursor: 'pointer' }} onClick={handleFinish}>완료</button>
            </div>
            {successMsg && <div style={{ color: '#10B981', fontWeight: 600, marginTop: 12 }}>{successMsg}</div>}
            {error && <div style={{ color: '#F43F5E', fontWeight: 600 }}>{error}</div>}
          </div>
        )
      ) : (
        <div style={{ marginBottom: 24 }}>
          {/* 경연: 피평가자 닉네임 선택, 점수, 심사내용 입력 폼 */}
          <div>피평가자 닉네임: <select style={{ marginLeft: 8 }}><option>선택</option></select></div>
          <div>점수(1~100): <input type="number" min={1} max={100} style={{ marginLeft: 8 }} /></div>
          <div>심사내용(선택): <input style={{ marginLeft: 8, width: 300 }} /></div>
          <button style={{ marginTop: 16, background: '#8A55CC', color: '#fff', borderRadius: 8, padding: '8px 20px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>제출</button>
        </div>
      )}
      <div style={{ color: '#B497D6', fontSize: 14 }}>※ 실제 평가/참가/제출 로직은 추후 구현</div>
    </div>
  );
};

export default ContestParticipate; 