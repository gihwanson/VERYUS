import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { collection as fbCollection, getDocs as fbGetDocs } from 'firebase/firestore';

const GRADE_ORDER = [
  '🌙', '⭐', '⚡', '🍺', '🌌', '☀️', '🪐', '🌍', '🍉', '🍈', '🍎', '🥝', '🫐', '🍒'
]; // 높은 등급이 앞에 오도록(달~체리)
const gradeNames = {
  '🍒': '체리', '🫐': '블루베리', '🥝': '키위', '🍎': '사과', '🍈': '멜론', '🍉': '수박',
  '🌍': '지구', '🪐': '토성', '☀️': '태양', '🌌': '은하', '🍺': '맥주', '⚡': '번개', '⭐': '별', '🌙': '달'
};

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
  const [showList, setShowList] = useState(true);
  const navigate = useNavigate();
  const [songType, setSongType] = useState<'all' | 'solo' | 'duet'>('all');
  const [resultSongType, setResultSongType] = useState<'all' | 'solo' | 'duet'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [userMap, setUserMap] = useState<Record<string, {grade?: string}>>({});
  const [buskingTab, setBuskingTab] = useState<'all'|'solo'|'duet'|'grade'>('all');
  const [manageTab, setManageTab] = useState<'all'|'solo'|'duet'|'manage'>('all');

  useEffect(() => {
    const fetchSongs = async () => {
      const q = query(collection(db, 'approvedSongs'), sort === 'title' ? orderBy('title') : orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setSongs(snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          members: Array.isArray(data.members) ? [...data.members].sort() : [],
        };
      }));
      setLoading(false);
    };
    fetchSongs();
  }, [sort]);

  useEffect(() => {
    // 유저 등급 정보도 fetch
    (async () => {
      const snap = await fbGetDocs(fbCollection(db, 'users'));
      const map: Record<string, {grade?: string}> = {};
      snap.docs.forEach(doc => {
        const d = doc.data();
        if (d.nickname) map[d.nickname] = { grade: d.grade };
      });
      setUserMap(map);
    })();
  }, []);

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
    ).map(song => ({ ...song, members: [...(song.members||[])].sort() }));
    setFilteredSongs(result);
  };

  // 필터링된 곡 리스트
  const displayedSongs = songs.filter(song => {
    if (songType === 'solo') return Array.isArray(song.members) && song.members.length === 1;
    if (songType === 'duet') return Array.isArray(song.members) && song.members.length >= 2;
    return true;
  });

  // 중복 없는 닉네임 추출
  const allMembers = songs.flatMap(song => Array.isArray(song.members) ? song.members : []);
  const uniqueMembers = Array.from(new Set(allMembers));

  // 닉네임별 합격곡 일괄 삭제
  const handleDeleteMember = async (nickname: string) => {
    if (!window.confirm(`${nickname}의 모든 합격곡을 삭제할까요?`)) return;
    const toDelete = songs.filter(song => (song.members || []).includes(nickname));
    for (const song of toDelete) {
      await deleteDoc(doc(db, 'approvedSongs', song.id));
    }
    setSongs(songs => songs.filter(song => !toDelete.some(s => s.id === song.id)));
  };

  // TODO: 등록/수정/삭제/조회/버스킹 필터 기능 구현

  return (
    <div style={{ 
      maxWidth: '100%', 
      width: '100%', 
      minHeight: '100vh', 
      margin: 0, 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderRadius: 0, 
      boxShadow: 'none', 
      padding: '20px',
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
        background: 'radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255, 255, 255, 0.08) 0%, transparent 50%)',
        pointerEvents: 'none'
      }} />
      
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h2 style={{ 
          color: 'white', 
          fontWeight: 700, 
          fontSize: 28, 
          marginBottom: 32,
          textAlign: 'center',
          textShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}>🎵 합격곡 관리 및 조회</h2>
        
                {/* 메인 탭 네비게이션 */}
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: isAdmin ? 'repeat(2, 1fr)' : '1fr',
          gap: '16px',
          marginBottom: 32,
          maxWidth: isAdmin ? '400px' : '200px',
          margin: '0 auto 32px auto'
        }}>
          {isAdmin && (
            <button 
              onClick={() => { 
                setShowForm(true); 
                setShowList(false); 
                setEditId(null); 
                setForm({ title: '', members: [''] }); 
              }} 
              style={{ 
                background: showForm ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(15px)',
                color: 'white',
                border: 'none',
                borderRadius: 16,
                padding: '16px 12px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14,
                textAlign: 'center',
                transition: 'all 0.3s ease',
                minHeight: '70px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
              onMouseLeave={(e) => e.currentTarget.style.background = showForm ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)'}
            >
              <span style={{ fontSize: '24px' }}>➕</span>
              <span>합격곡 등록</span>
            </button>
          )}
          <button 
            onClick={() => { 
              setShowList(l => { 
                setShowForm(false); 
                return !l; 
              }); 
            }} 
            style={{ 
              background: showList ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(15px)',
              color: 'white',
              border: 'none',
              borderRadius: 16,
              padding: '16px 12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
              textAlign: 'center',
              transition: 'all 0.3s ease',
              minHeight: '70px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
            onMouseLeave={(e) => e.currentTarget.style.background = showList ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)'}
          >
            <span style={{ fontSize: '24px' }}>📋</span>
            <span>{showList ? '리스트 닫기' : '리스트 보기'}</span>
          </button>
        </div>

              {/* 합격곡 등록/수정 폼 */}
        {showForm && isAdmin && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
              <button 
                onClick={() => { setShowForm(false); setEditId(null); }} 
                style={{ 
                  background: 'rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(10px)',
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 12, 
                  padding: '8px 16px', 
                  fontWeight: 600, 
                  cursor: 'pointer' 
                }}
              >← 이전</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: 'white', fontWeight: 600, marginBottom: 8, display: 'block' }}>곡 제목</label>
              <input 
                value={form.title} 
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} 
                style={{ 
                  width: '100%', 
                  padding: 12, 
                  borderRadius: 12, 
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  color: 'white',
                  marginTop: 4
                }} 
                placeholder="곡 제목을 입력하세요"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: 'white', fontWeight: 600, marginBottom: 8, display: 'block' }}>참여 닉네임</label>
              {form.members.map((member, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input
                    value={member}
                    onChange={e => setForm(f => ({ ...f, members: f.members.map((m, i) => i === idx ? e.target.value : m) }))}
                    style={{ 
                      flex: 1, 
                      padding: 12, 
                      borderRadius: 12, 
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      background: 'rgba(255, 255, 255, 0.1)',
                      backdropFilter: 'blur(10px)',
                      color: 'white'
                    }}
                    placeholder={`닉네임 ${idx + 1}`}
                  />
                  {form.members.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => setForm(f => ({ ...f, members: f.members.filter((_, i) => i !== idx) }))} 
                      style={{ 
                        background: 'rgba(220, 38, 38, 0.8)',
                        backdropFilter: 'blur(10px)',
                        color: 'white', 
                        border: 'none', 
                        borderRadius: 12, 
                        padding: '8px 12px', 
                        fontWeight: 600, 
                        cursor: 'pointer' 
                      }}
                    >삭제</button>
                  )}
                  {idx === form.members.length - 1 && (
                    <button 
                      type="button" 
                      onClick={() => setForm(f => ({ ...f, members: [...f.members, ''] }))} 
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(10px)',
                        color: 'white', 
                        border: 'none', 
                        borderRadius: 12, 
                        padding: '8px 12px', 
                        fontWeight: 600, 
                        cursor: 'pointer' 
                      }}
                    >추가</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
              <button 
                style={{ 
                  background: 'rgba(34, 197, 94, 0.8)',
                  backdropFilter: 'blur(10px)',
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 12, 
                  padding: '12px 24px', 
                  fontWeight: 600, 
                  cursor: 'pointer' 
                }} 
                onClick={handleSave}
              >💾 저장</button>
              <button 
                style={{ 
                  background: 'rgba(239, 68, 68, 0.8)',
                  backdropFilter: 'blur(10px)',
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 12, 
                  padding: '12px 24px', 
                  fontWeight: 600, 
                  cursor: 'pointer' 
                }} 
                onClick={() => setShowForm(false)}
              >❌ 취소</button>
            </div>
          </>
        )}

              {/* 합격곡 리스트 */}
        {showList && (
          <>
            {/* 검색창 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="🔍 곡 제목 또는 닉네임 검색"
                style={{ 
                  width: '100%',
                  maxWidth: 400,
                  padding: '12px 16px', 
                  borderRadius: 12, 
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  color: 'white',
                  fontSize: 15,
                  textAlign: 'center'
                }}
              />
            </div>
            
          {/* 필터 탭 */}
            <div style={{ 
              display: 'flex', 
              gap: 12, 
              marginBottom: 24, 
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <button 
                onClick={() => { setSongType('all'); setManageTab('all'); }} 
                style={{ 
                  background: manageTab === 'all' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)',
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 12, 
                  padding: '8px 16px', 
                  fontWeight: 700, 
                  cursor: 'pointer' 
                }}
              >🎵 전체</button>
              <button 
                onClick={() => { setSongType('solo'); setManageTab('solo'); }} 
                style={{ 
                  background: manageTab === 'solo' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)',
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 12, 
                  padding: '8px 16px', 
                  fontWeight: 700, 
                  cursor: 'pointer' 
                }}
              >🎤 솔로곡</button>
              <button 
                onClick={() => { setSongType('duet'); setManageTab('duet'); }} 
                style={{ 
                  background: manageTab === 'duet' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)',
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 12, 
                  padding: '8px 16px', 
                  fontWeight: 700, 
                  cursor: 'pointer' 
                }}
              >👥 듀엣/합창곡</button>
            {isAdmin && (
                <button 
                  onClick={() => setManageTab('manage')} 
                  style={{ 
                    background: manageTab === 'manage' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)',
                    backdropFilter: 'blur(10px)',
                    color: 'white', 
                    border: 'none', 
                    borderRadius: 12, 
                    padding: '8px 16px', 
                    fontWeight: 700, 
                    cursor: 'pointer' 
                  }}
                >⚙️ 관리</button>
            )}
          </div>
            
                      {/* 관리 탭: 닉네임별 합격곡 관리 */}
            {manageTab === 'manage' && isAdmin && (
              <div style={{ margin: '24px 0' }}>
                <h4 style={{ color: 'white', fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
                  👥 합격곡에 등재된 닉네임 목록
                </h4>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: 16,
                  padding: 20,
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {uniqueMembers.map(nickname => (
                      <li key={nickname} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        gap: 12, 
                        marginBottom: 12,
                        padding: '8px 16px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: 12,
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}>
                        <span style={{ fontWeight: 600, color: 'white' }}>{nickname}</span>
                        {isLeader && (
                          <button
                            style={{ 
                              background: 'rgba(220, 38, 38, 0.8)',
                              backdropFilter: 'blur(10px)',
                              color: 'white', 
                              border: 'none', 
                              borderRadius: 8, 
                              padding: '6px 12px', 
                              fontWeight: 600, 
                              cursor: 'pointer',
                              fontSize: 12
                            }}
                            onClick={() => handleDeleteMember(nickname)}
                          >🗑️ 삭제</button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            
            {/* 기존 곡 리스트는 관리 탭이 아닐 때만 노출 */}
            {manageTab !== 'manage' && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                borderRadius: 16,
                padding: 20,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                maxHeight: '500px',
                overflowY: 'auto',
                marginBottom: 24
              }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {displayedSongs
                    .filter(song => {
                      const term = searchTerm.trim().toLowerCase();
                      if (!term) return true;
                      const titleMatch = song.title?.toLowerCase().includes(term);
                      const memberMatch = Array.isArray(song.members) && song.members.some((m: string) => m.toLowerCase().includes(term));
                      return titleMatch || memberMatch;
                    })
                    .map(song => (
                      <li key={song.id} style={{ 
                        padding: '12px 16px', 
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 12,
                        flexWrap: 'wrap'
                      }}>
                        <span style={{ fontWeight: 700, color: 'white', flex: '1 1 200px' }}>{song.title}</span>
                        <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontWeight: 500, flex: '1 1 150px' }}>
                          {song.members?.join(', ')}
                        </span>
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              style={{ 
                                background: 'rgba(251, 191, 36, 0.8)',
                                backdropFilter: 'blur(10px)',
                                color: 'white', 
                                border: 'none', 
                                borderRadius: 8, 
                                padding: '6px 12px', 
                                fontWeight: 600, 
                                cursor: 'pointer',
                                fontSize: 12
                              }}
                              onClick={() => {
                                setForm({ title: song.title, members: Array.isArray(song.members) ? song.members : [''] });
                                setEditId(song.id);
                                setShowForm(true);
                                setShowList(false);
                              }}
                            >✏️ 수정</button>
                            <button
                              style={{ 
                                background: 'rgba(220, 38, 38, 0.8)',
                                backdropFilter: 'blur(10px)',
                                color: 'white', 
                                border: 'none', 
                                borderRadius: 8, 
                                padding: '6px 12px', 
                                fontWeight: 600, 
                                cursor: 'pointer',
                                fontSize: 12
                              }}
                              onClick={async () => {
                                if (window.confirm('정말 삭제하시겠습니까?')) {
                                  await deleteDoc(doc(db, 'approvedSongs', song.id));
                                  setSongs(songs => songs.filter(s => s.id !== song.id));
                                }
                              }}
                            >🗑️ 삭제</button>
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </>
        )}

      {/* 버스킹용 합격곡 조회 폼 */}
      {!showForm && !showList && (
          <div style={{ 
            marginTop: 0,
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(15px)',
            borderRadius: 20, 
            padding: 24,
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <h3 style={{ 
              color: 'white', 
              fontWeight: 700, 
              fontSize: 20, 
              marginBottom: 20,
              textAlign: 'center'
            }}>🎤 버스킹용 합격곡 조회</h3>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: 'white', fontWeight: 600, marginBottom: 8, display: 'block' }}>참석자 닉네임</label>
            {buskingMembers.map((member, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input
                  value={member}
                  onChange={e => setBuskingMembers(members => members.map((m, i) => i === idx ? e.target.value : m))}
                    style={{ 
                      flex: 1, 
                      padding: 12, 
                      borderRadius: 12, 
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      background: 'rgba(255, 255, 255, 0.1)',
                      backdropFilter: 'blur(10px)',
                      color: 'white'
                    }}
                  placeholder={`참석자 ${idx + 1}`}
                />
                {buskingMembers.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => setBuskingMembers(members => members.filter((_, i) => i !== idx))} 
                      style={{ 
                        background: 'rgba(220, 38, 38, 0.8)',
                        backdropFilter: 'blur(10px)',
                        color: 'white', 
                        border: 'none', 
                        borderRadius: 12, 
                        padding: '8px 12px', 
                        fontWeight: 600, 
                        cursor: 'pointer' 
                      }}
                    >삭제</button>
                )}
                {idx === buskingMembers.length - 1 && (
                    <button 
                      type="button" 
                      onClick={() => setBuskingMembers(members => [...members, ''])} 
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(10px)',
                        color: 'white', 
                        border: 'none', 
                        borderRadius: 12, 
                        padding: '8px 12px', 
                        fontWeight: 600, 
                        cursor: 'pointer' 
                      }}
                    >추가</button>
                )}
              </div>
            ))}
          </div>
            
          {/* 합격곡 조회 버튼 별도 배치 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20, marginBottom: 20 }}>
            <button
                style={{ 
                  background: 'rgba(34, 197, 94, 0.8)',
                  backdropFilter: 'blur(10px)',
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 12, 
                  padding: '12px 24px', 
                  fontWeight: 600, 
                  cursor: 'pointer',
                  fontSize: 16
                }}
              onClick={handleBuskingSearch}
              >🔍 합격곡 조회</button>
          </div>
            
          {/* 조회 결과 리스트 */}
          {filteredSongs.length > 0 && (
              <div style={{ marginTop: 24 }}>
              {/* 결과 탭 */}
                <div style={{ 
                  display: 'flex', 
                  gap: 8, 
                  marginBottom: 16, 
                  justifyContent: 'center',
                  flexWrap: 'wrap'
                }}>
                  <button 
                    onClick={() => setBuskingTab('all')} 
                    style={{ 
                      background: buskingTab === 'all' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(10px)',
                      color: 'white', 
                      border: 'none', 
                      borderRadius: 12, 
                      padding: '8px 16px', 
                      fontWeight: 700, 
                      cursor: 'pointer' 
                    }}
                  >🎵 전체</button>
                  <button 
                    onClick={() => setBuskingTab('solo')} 
                    style={{ 
                      background: buskingTab === 'solo' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(10px)',
                      color: 'white', 
                      border: 'none', 
                      borderRadius: 12, 
                      padding: '8px 16px', 
                      fontWeight: 700, 
                      cursor: 'pointer' 
                    }}
                  >🎤 솔로곡</button>
                  <button 
                    onClick={() => setBuskingTab('duet')} 
                    style={{ 
                      background: buskingTab === 'duet' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(10px)',
                      color: 'white', 
                      border: 'none', 
                      borderRadius: 12, 
                      padding: '8px 16px', 
                      fontWeight: 700, 
                      cursor: 'pointer' 
                    }}
                  >👥 듀엣/합창곡</button>
                  <button 
                    onClick={() => setBuskingTab('grade')} 
                    style={{ 
                      background: buskingTab === 'grade' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(10px)',
                      color: 'white', 
                      border: 'none', 
                      borderRadius: 12, 
                      padding: '8px 16px', 
                      fontWeight: 700, 
                      cursor: 'pointer' 
                    }}
                  >🏆 등급순</button>
              </div>
                
              {/* 곡 리스트 */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: 16,
                  padding: 20,
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  maxHeight: '400px',
                  overflowY: 'auto'
                }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {filteredSongs
                  .filter(song => {
                    if (buskingTab === 'solo') return Array.isArray(song.members) && song.members.length === 1;
                    if (buskingTab === 'duet') return Array.isArray(song.members) && song.members.length >= 2;
                    return true;
                  })
                  .sort((a, b) => {
                    if (buskingTab !== 'grade') return 0;
                    // 등급순: 곡 멤버 중 최고 등급으로 내림차순
                    const getMaxGradeIdx = (song: any) => {
                      const idxs = (song.members||[]).map((m:string) => GRADE_ORDER.indexOf(userMap[m]?.grade||'🍒'));
                      return Math.min(...(idxs.length?idxs:[GRADE_ORDER.length-1]));
                    };
                    return getMaxGradeIdx(a) - getMaxGradeIdx(b);
                  })
                  .map((song) => {
                    if (!song) return null;
                    let maxGrade = '🍒';
                    if (buskingTab === 'grade') {
                      const idxs = (song.members||[]).map((m:string) => GRADE_ORDER.indexOf(userMap[m]?.grade||'🍒'));
                      const minIdx = Math.min(...(idxs.length?idxs:[GRADE_ORDER.length-1]));
                      maxGrade = GRADE_ORDER[minIdx] || '🍒';
                    }
                    return (
                          <li key={song.id} style={{ 
                            padding: '12px 16px', 
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 12,
                            flexWrap: 'wrap'
                          }}>
                            {buskingTab === 'grade' && (
                              <span style={{ fontWeight: 700, fontSize: 20 }}>{maxGrade}</span>
                            )}
                            <span style={{ fontWeight: 700, color: 'white', flex: '1 1 200px' }}>{song.title}</span>
                            <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontWeight: 500, flex: '1 1 150px' }}>
                              {song.members?.join(', ')}
                            </span>
                      </li>
                    );
                  })
                  .filter(Boolean)}
              </ul>
                </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
};

export default ApprovedSongs; 