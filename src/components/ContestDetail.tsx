import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, setDoc, doc as firestoreDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

const ContestDetail: React.FC = () => {
  const { id } = useParams();
  const [contest, setContest] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && ['리더', '운영진', '부운영진'].includes(user.role);
  const isLeader = user && user.role === '리더';
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'contests', id)).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        setContest({ id: snap.id, ...data });
        setEnded(!!data.ended);
        // 마감일이 지났고 아직 종료되지 않았다면 자동 종료
        if (data.deadline && data.deadline.toDate) {
          const deadlineDate = data.deadline.toDate();
          const now = new Date();
          if (deadlineDate < now && !data.ended) {
            updateDoc(doc(db, 'contests', id), { ended: true });
            setEnded(true);
            setContest({ id: snap.id, ...data, ended: true });
          }
        }
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

  const handleParticipate = async () => {
    if (!user || !id) return;
    if (!window.confirm('참여하시겠습니까?')) return;
    // 참가자 중복 방지
    await setDoc(firestoreDoc(db, 'contests', id, 'participants', user.uid), {
      nickname: user.nickname,
      uid: user.uid,
      joinedAt: new Date()
    });
    // 참가자 목록 갱신은 onSnapshot으로 자동 반영됨
    navigate(`/contests/${contest.id}/participate`);
  };

  const handleEndContest = async () => {
    if (!id) return;
    if (window.confirm('정말로 이 콘테스트를 종료하시겠습니까? 종료 후에는 누구도 참여할 수 없습니다.')) {
      await updateDoc(doc(db, 'contests', id), { ended: true });
      setEnded(true);
    }
  };

  const handleDeleteContest = async () => {
    if (!id) return;
    if (window.confirm('정말로 이 콘테스트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      await deleteDoc(doc(db, 'contests', id));
      alert('콘테스트가 삭제되었습니다.');
      navigate('/contests');
    }
  };

  if (!contest) return <div style={{ padding: 40, textAlign: 'center', color: '#B497D6' }}>콘테스트 정보를 불러오는 중...</div>;

  return (
    <div className="contest-card">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <button
          style={{ background: '#F6F2FF', color: '#8A55CC', borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer', marginRight: 16 }}
          onClick={() => navigate('/contests')}
        >
          ← 이전
        </button>
        <h2 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 24, margin: 0 }}>{contest.title}</h2>
      </div>
      <div style={{ color: '#6B7280', fontWeight: 500, marginBottom: 12 }}>{contest.type}</div>
      <div style={{ color: '#B497D6', fontSize: 14, marginBottom: 24 }}>마감: {contest.deadline && (contest.deadline.seconds ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : '')}</div>
      {/* <button style={{ background: '#E5DAF5', color: '#7C4DBC', borderRadius: 8, padding: '10px 24px', fontWeight: 600, border: 'none', cursor: 'pointer', marginRight: 12 }} onClick={handleParticipate} disabled={ended}>참가/평가</button> */}
      <button style={{ background: '#fff', color: '#8A55CC', borderRadius: 8, padding: '10px 24px', fontWeight: 600, border: '1px solid #E5DAF5', cursor: 'pointer', marginRight: 12 }} onClick={() => navigate(`/contests/${contest.id}/results`)}>결과</button>
      {/* 종료/삭제 버튼 영역 */}
      {isLeader && (
        <>
          <button style={{ background: '#F43F5E', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, border: 'none', cursor: 'pointer', marginRight: 12 }} onClick={handleEndContest}>종료</button>
          <button style={{ background: '#B91C1C', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, border: 'none', cursor: 'pointer' }} onClick={handleDeleteContest}>삭제</button>
        </>
      )}
      {isAdmin && <div style={{ marginTop: 24, color: '#8A55CC', fontWeight: 600 }}>관리자: 참가자/평가자 관리 및 전체 평가내역 확인 기능 예정</div>}
      {ended && <div style={{ color: '#F43F5E', fontWeight: 700, marginTop: 24 }}>이 콘테스트는 종료되어 더 이상 참여할 수 없습니다.</div>}
      {participants.length > 0 && (
        <div style={{ margin: '32px 0 0 0' }}>
          <h3 style={{ color: '#7C4DBC', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>참가자 목록</h3>
          <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 16, listStyle: 'none', padding: 0 }}>
            {participants.map((p, i) => (
              <li key={i} style={{ background: '#F6F2FF', color: '#8A55CC', borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>{p.nickname}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ContestDetail; 