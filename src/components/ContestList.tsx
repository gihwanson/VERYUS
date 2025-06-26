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
    
    // 해당 콘테스트의 참가자 목록을 확인
    try {
      const participantsSnap = await getDocs(collection(db, 'contests', contest.id, 'participants'));
      const participants = participantsSnap.docs.map(doc => doc.data());
      
      // 현재 로그인한 사용자의 닉네임이 참가자 목록에 있는지 확인
      const isParticipant = participants.some(p => 
        p.nickname && user.nickname && 
        p.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim()
      );
      
      if (isParticipant) {
        // 참가자 목록에 있으면 바로 참여 페이지로 이동
        navigate(`/contests/${contest.id}/participate`);
      } else {
        // 참가자 목록에 없으면 안내문구 표시
        alert('현재는 직접 참가가 불가능합니다. 운영진에게 문의해 주세요.');
      }
    } catch (error) {
      console.error('참가자 목록 확인 중 오류:', error);
      alert('참가자 목록을 확인하는 중 오류가 발생했습니다.');
    }
  };

  const handleEndContest = async (contest: any) => {
    if (!window.confirm('정말로 이 콘테스트를 종료하시겠습니까? 종료 후에는 누구도 참여할 수 없습니다.')) return;
    await updateDoc(firestoreDoc(db, 'contests', contest.id), { ended: true });
    alert('콘테스트가 종료되었습니다.');
  };

  return (
    <div className="contest-card">
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
          <li
            key={contest.id}
            className={!contest.ended ? 'contest-list-item' : ''}
            style={contest.ended ? { padding: '16px 0', borderBottom: '1px solid #E5DAF5', display: 'flex', alignItems: 'center', gap: 16 } : undefined}
          >
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