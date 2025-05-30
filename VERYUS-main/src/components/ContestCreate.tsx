import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const ContestCreate: React.FC = () => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'등급평가' | '경연'>('등급평가');
  const [deadline, setDeadline] = useState('');
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && ['리더', '운영진', '부운영진'].includes(user.role);

  if (!isAdmin) return <div style={{ padding: 40, textAlign: 'center', color: '#B497D6' }}>권한이 없습니다.</div>;

  const handleCreate = async () => {
    if (!title || !deadline) return alert('모든 항목을 입력하세요.');
    await addDoc(collection(db, 'contests'), {
      title,
      type,
      deadline: new Date(deadline),
      createdBy: user.nickname,
      createdAt: serverTimestamp()
    });
    navigate('/contests');
  };

  return (
    <div style={{ maxWidth: 500, margin: '40px auto', background: '#fff', borderRadius: 20, boxShadow: '0 8px 32px #E5DAF5', padding: 32 }}>
      <h2 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 24, marginBottom: 24 }}>콘테스트 생성</h2>
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600 }}>콘테스트명</label>
        <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6 }} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600 }}>유형</label>
        <select value={type} onChange={e => setType(e.target.value as any)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6 }}>
          <option value="등급평가">등급평가</option>
          <option value="경연">경연</option>
        </select>
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600 }}>평가 마감일</label>
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6 }} />
      </div>
      <button style={{ background: '#8A55CC', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer', width: '100%' }} onClick={handleCreate}>생성</button>
    </div>
  );
};

export default ContestCreate; 