import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, setDoc, doc as firestoreDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Trophy, Plus } from 'lucide-react';

interface Contest {
  id: string;
  title: string;
  type: '정규등급전' | '세미등급전' | '경연';
  deadline: any;
  createdBy: string;
  ended?: boolean;
}

const ContestList: React.FC = () => {
  const [contests, setContests] = useState<Contest[]>([]);
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && ['리더', '운영진', '부운영진'].includes(user.role);

  useEffect(() => {
    const q = query(collection(db, 'contests'), orderBy('deadline', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setContests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Contest[]);
    });
    return () => unsub();
  }, []);

  const handleParticipate = async (contest: any) => {
    if (!user) return navigate('/login');
    if (!window.confirm('참여하시겠습니까?')) return;
    await setDoc(firestoreDoc(db, 'contests', contest.id, 'participants', user.uid), {
      nickname: user.nickname,
      uid: user.uid,
      joinedAt: new Date()
    });
    navigate(`/contests/${contest.id}/participate`);
  };

  const handleEndContest = async (contest: any) => {
    if (!window.confirm('정말로 이 콘테스트를 종료하시겠습니까? 종료 후에는 누구도 참여할 수 없습니다.')) return;
    await updateDoc(firestoreDoc(db, 'contests', contest.id), { ended: true });
    alert('콘테스트가 종료되었습니다.');
  };

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', background: '#fff', borderRadius: 20, boxShadow: '0 8px 32px #E5DAF5', padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8A55CC', fontWeight: 700, fontSize: 24, margin: 0 }}><Trophy /> 콘테스트</h2>
        <button
          style={{ background: '#F6F2FF', color: '#8A55CC', borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer', marginLeft: 12 }}
          onClick={() => navigate('/')}
        >
          메인보드로
        </button>
      </div>
      {isAdmin && (
        <button style={{ margin: '16px 0', background: '#8A55CC', color: '#fff', borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' }} onClick={() => navigate('/contests/create')}><Plus size={18} style={{ marginRight: 6 }} /> 콘테스트 생성</button>
      )}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {contests.map(contest => (
          <li key={contest.id} style={{ padding: '16px 0', borderBottom: '1px solid #E5DAF5', display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontWeight: 700, color: '#7C4DBC', fontSize: 18 }}>{contest.title}</span>
            <span style={{ color: '#6B7280', fontWeight: 500 }}>{contest.type}</span>
            <span style={{ color: '#B497D6', fontSize: 14 }}>마감: {contest.deadline && (contest.deadline.seconds ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : '')}</span>
            <button style={{ background: '#F6F2FF', color: '#8A55CC', borderRadius: 8, padding: '6px 16px', fontWeight: 600, border: 'none', cursor: 'pointer' }} onClick={() => navigate(`/contests/${contest.id}`)}>상세</button>
            {!contest.ended && (
              <button style={{ marginLeft: 'auto', background: '#E5DAF5', color: '#7C4DBC', borderRadius: 8, padding: '6px 16px', fontWeight: 600, border: 'none', cursor: 'pointer' }} onClick={() => handleParticipate(contest)}>참여</button>
            )}
            {contest.ended ? (
              <span style={{ marginLeft: 8, background: '#F43F5E', color: '#fff', borderRadius: 8, padding: '6px 16px', fontWeight: 600, border: 'none', display: 'inline-block' }}>종료됨</span>
            ) : (
              user && user.role === '리더' && user.nickname === '너래' && (
                <button style={{ marginLeft: 8, background: '#F43F5E', color: '#fff', borderRadius: 8, padding: '6px 16px', fontWeight: 600, border: 'none', cursor: 'pointer' }} onClick={() => handleEndContest(contest)}>종료</button>
              )
            )}
          </li>
        ))}
      </ul>
      {contests.length === 0 && <div style={{ color: '#B497D6', textAlign: 'center', marginTop: 40 }}>진행 중인 콘테스트가 없습니다.</div>}
    </div>
  );
};

export default ContestList; 