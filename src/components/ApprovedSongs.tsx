import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';

const ApprovedSongs: React.FC = () => {
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'title' | 'latest'>('title');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', members: [''] });
  const [editId, setEditId] = useState<string | null>(null);
  const [buskingMembers, setBuskingMembers] = useState<string[]>(['']);
  const [filteredSongs, setFilteredSongs] = useState<any[]>([]);
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && (user.role === '리더' || user.role === '운영진');
  const isLeader = user && user.role === '리더';
  const [showList, setShowList] = useState(false);
  const navigate = useNavigate();
  const [songType, setSongType] = useState<'all' | 'solo' | 'duet'>('all');
<<<<<<< HEAD
=======
  const [resultSongType, setResultSongType] = useState<'all' | 'solo' | 'duet'>('all');
  const [searchTerm, setSearchTerm] = useState('');
>>>>>>> 6599406 (처음 커밋)

  useEffect(() => {
    const fetchSongs = async () => {
      const q = query(collection(db, 'approvedSongs'), sort === 'title' ? orderBy('title') : orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setSongs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    };
    fetchSongs();
  }, [sort]);

  const handleSave = async () => {
    if (!form.title.trim() || form.members.some(m => !m.trim())) {
      alert('곡 제목과 모든 닉네임을 입력해주세요.');
      return;
    }
    try {
      if (editId) {
        await updateDoc(doc(db, 'approvedSongs', editId), {
          title: form.title,
          titleNoSpace: form.title.replace(/\s/g, ''),
          members: form.members.map(m => m.trim()),
          updatedAt: Timestamp.now(),
          updatedBy: user?.nickname || user?.email || '',
        });
      } else {
        await addDoc(collection(db, 'approvedSongs'), {
          title: form.title,
          titleNoSpace: form.title.replace(/\s/g, ''),
          members: form.members.map(m => m.trim()),
          createdAt: Timestamp.now(),
          createdBy: user?.nickname || user?.email || '',
          createdByRole: user?.role || '',
        });
      }
      setShowForm(false);
      setForm({ title: '', members: [''] });
      setEditId(null);
      // 목록 새로고침
      const q = query(collection(db, 'approvedSongs'), orderBy('title'));
      const snap = await getDocs(q);
      setSongs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleBuskingSearch = () => {
    const attendees = buskingMembers.map(m => m.trim()).filter(Boolean);
    if (attendees.length === 0) {
      setFilteredSongs([]);
      return;
    }
    const result = songs.filter(song =>
      Array.isArray(song.members) && song.members.every((member: string) => attendees.includes(member))
    );
    setFilteredSongs(result);
  };

  // 필터링된 곡 리스트
  const displayedSongs = songs.filter(song => {
    if (songType === 'solo') return Array.isArray(song.members) && song.members.length === 1;
    if (songType === 'duet') return Array.isArray(song.members) && song.members.length >= 2;
    return true;
  });

  // TODO: 등록/수정/삭제/조회/버스킹 필터 기능 구현

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', background: '#fff', borderRadius: 20, boxShadow: '0 8px 32px #E5DAF5', padding: 32 }}>
      <h2 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 24, marginBottom: 24 }}>합격곡 관리 및 조회</h2>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
        {isAdmin && <button onClick={() => { setShowForm(true); setShowList(false); setEditId(null); setForm({ title: '', members: [''] }); }} style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, cursor: 'pointer' }}>합격곡 등록</button>}
        <button onClick={() => { setShowList(l => { setShowForm(false); return !l; }); }} style={{ background: '#7C4DBC', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, cursor: 'pointer' }}>{showList ? '합격곡 리스트 닫기' : '합격곡 리스트 보기'}</button>
      </div>
      {/* 합격곡 등록/수정 폼 */}
      {showForm && isAdmin && (
        <div style={{ marginBottom: 24, background: '#F6F2FF', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <button onClick={() => { setShowForm(false); setEditId(null); }} style={{ background: '#E5DAF5', color: '#7C4DBC', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, cursor: 'pointer' }}>이전</button>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>곡 제목</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 4 }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>참여 닉네임</label>
            {form.members.map((member, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <input
                  value={member}
                  onChange={e => setForm(f => ({ ...f, members: f.members.map((m, i) => i === idx ? e.target.value : m) }))}
                  style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #E5DAF5' }}
                  placeholder={`닉네임 ${idx + 1}`}
                />
                {form.members.length > 1 && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, members: f.members.filter((_, i) => i !== idx) }))} style={{ background: '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer' }}>삭제</button>
                )}
                {idx === form.members.length - 1 && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, members: [...f.members, ''] }))} style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer' }}>추가</button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, cursor: 'pointer' }} onClick={handleSave}>저장</button>
            <button style={{ background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      {/* 합격곡 리스트 */}
<<<<<<< HEAD
      {!showForm && showList && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <button onClick={() => setShowList(false)} style={{ background: '#E5DAF5', color: '#7C4DBC', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, cursor: 'pointer' }}>이전</button>
=======
      {showList && (
        <div>
          {/* 검색창 */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="곡 제목 또는 닉네임 검색"
              style={{ width: 260, padding: '8px 14px', borderRadius: 8, border: '1px solid #E5DAF5', fontSize: 15 }}
            />
>>>>>>> 6599406 (처음 커밋)
          </div>
          {/* 필터 탭 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
            <button onClick={() => setSongType('all')} style={{ background: songType === 'all' ? '#8A55CC' : '#F6F2FF', color: songType === 'all' ? '#fff' : '#8A55CC', border: 'none', borderRadius: 8, padding: '6px 18px', fontWeight: 700, cursor: 'pointer' }}>전체</button>
            <button onClick={() => setSongType('solo')} style={{ background: songType === 'solo' ? '#8A55CC' : '#F6F2FF', color: songType === 'solo' ? '#fff' : '#8A55CC', border: 'none', borderRadius: 8, padding: '6px 18px', fontWeight: 700, cursor: 'pointer' }}>솔로곡</button>
            <button onClick={() => setSongType('duet')} style={{ background: songType === 'duet' ? '#8A55CC' : '#F6F2FF', color: songType === 'duet' ? '#fff' : '#8A55CC', border: 'none', borderRadius: 8, padding: '6px 18px', fontWeight: 700, cursor: 'pointer' }}>듀엣/합창곡</button>
          </div>
<<<<<<< HEAD
          {loading ? <div style={{ color: '#B497D6', textAlign: 'center', marginTop: 40 }}>로딩 중...</div> : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {displayedSongs.map(song => (
                <li key={song.id} style={{ padding: '12px 0', borderBottom: '1px solid #E5DAF5', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontWeight: 700, color: '#7C4DBC', fontSize: 18 }}>{song.title}</span>
                  <span style={{ color: '#6B7280', fontWeight: 500 }}>{song.members?.join(', ')}</span>
                  {isAdmin && <button style={{ marginLeft: 'auto', background: '#E5DAF5', color: '#7C4DBC', borderRadius: 8, padding: '6px 16px', fontWeight: 600, border: 'none', cursor: 'pointer' }} onClick={() => {
                    setEditId(song.id);
                    setForm({ title: song.title, members: Array.isArray(song.members) ? song.members : [''] });
                    setShowForm(true);
                    setShowList(false);
                  }}>수정</button>}
                  {isLeader && <button style={{ background: '#F43F5E', color: '#fff', borderRadius: 8, padding: '6px 16px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>삭제</button>}
                </li>
              ))}
            </ul>
          )}
=======
          {/* 리스트 필터링 */}
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {displayedSongs
              .filter(song => {
                const term = searchTerm.trim().toLowerCase();
                if (!term) return true;
                const titleMatch = song.title?.toLowerCase().includes(term);
                const memberMatch = Array.isArray(song.members) && song.members.some((m: string) => m.toLowerCase().includes(term));
                return titleMatch || memberMatch;
              })
              .map(song => (
                <li key={song.id} style={{ padding: '8px 0', borderBottom: '1px solid #E5DAF5', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 700, color: '#7C4DBC' }}>{song.title}</span>
                  <span style={{ color: '#6B7280', fontWeight: 500 }}>{song.members?.join(', ')}</span>
                </li>
              ))}
          </ul>
>>>>>>> 6599406 (처음 커밋)
        </div>
      )}
      {/* 버스킹용 합격곡 조회 폼 */}
      {!showForm && !showList && (
        <div style={{ marginTop: 32, background: '#F9FAFB', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => navigate('/')} style={{ background: '#E5DAF5', color: '#7C4DBC', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, cursor: 'pointer' }}>메인보드로</button>
          </div>
          <h3 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>버스킹용 합격곡 조회</h3>
          <div style={{ marginBottom: 8 }}>
            <label>참석자 닉네임</label>
            {buskingMembers.map((member, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <input
                  value={member}
                  onChange={e => setBuskingMembers(members => members.map((m, i) => i === idx ? e.target.value : m))}
                  style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #E5DAF5' }}
                  placeholder={`참석자 ${idx + 1}`}
                />
                {buskingMembers.length > 1 && (
                  <button type="button" onClick={() => setBuskingMembers(members => members.filter((_, i) => i !== idx))} style={{ background: '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer' }}>삭제</button>
                )}
                {idx === buskingMembers.length - 1 && (
                  <button type="button" onClick={() => setBuskingMembers(members => [...members, ''])} style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer' }}>추가</button>
                )}
              </div>
            ))}
          </div>
          {/* 합격곡 조회 버튼 별도 배치 */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <button
              style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, cursor: 'pointer' }}
              onClick={handleBuskingSearch}
            >합격곡 조회</button>
          </div>
          {/* 조회 결과 리스트 */}
          {filteredSongs.length > 0 && (
            <div style={{ marginTop: 16 }}>
<<<<<<< HEAD
              <h4 style={{ color: '#7C4DBC', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>가능한 합격곡</h4>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {filteredSongs.map(song => (
                  <li key={song.id} style={{ padding: '8px 0', borderBottom: '1px solid #E5DAF5', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 700, color: '#7C4DBC' }}>{song.title}</span>
                    <span style={{ color: '#6B7280', fontWeight: 500 }}>{song.members?.join(', ')}</span>
                  </li>
                ))}
=======
              {/* 결과 탭 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'center' }}>
                <button onClick={() => setResultSongType('all')} style={{ background: resultSongType === 'all' ? '#8A55CC' : '#F6F2FF', color: resultSongType === 'all' ? '#fff' : '#8A55CC', border: 'none', borderRadius: 8, padding: '5px 16px', fontWeight: 700, cursor: 'pointer' }}>전체</button>
                <button onClick={() => setResultSongType('solo')} style={{ background: resultSongType === 'solo' ? '#8A55CC' : '#F6F2FF', color: resultSongType === 'solo' ? '#fff' : '#8A55CC', border: 'none', borderRadius: 8, padding: '5px 16px', fontWeight: 700, cursor: 'pointer' }}>솔로곡</button>
                <button onClick={() => setResultSongType('duet')} style={{ background: resultSongType === 'duet' ? '#8A55CC' : '#F6F2FF', color: resultSongType === 'duet' ? '#fff' : '#8A55CC', border: 'none', borderRadius: 8, padding: '5px 16px', fontWeight: 700, cursor: 'pointer' }}>듀엣/합창곡</button>
              </div>
              <h4 style={{ color: '#7C4DBC', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>가능한 합격곡</h4>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {filteredSongs
                  .filter(song => {
                    if (resultSongType === 'solo') return Array.isArray(song.members) && song.members.length === 1;
                    if (resultSongType === 'duet') return Array.isArray(song.members) && song.members.length >= 2;
                    return true;
                  })
                  .map(song => (
                    <li key={song.id} style={{ padding: '8px 0', borderBottom: '1px solid #E5DAF5', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontWeight: 700, color: '#7C4DBC' }}>{song.title}</span>
                      <span style={{ color: '#6B7280', fontWeight: 500 }}>{song.members?.join(', ')}</span>
                    </li>
                  ))}
>>>>>>> 6599406 (처음 커밋)
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ApprovedSongs; 