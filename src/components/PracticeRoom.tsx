import React, { useEffect, useState, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface PracticeSong {
  id: string;
  title: string;
  done?: boolean;
  isSuggestion?: boolean;
  fromDone?: boolean;
  toDone?: boolean;
  suggestionId?: string;
  fromNickname?: string;
  toNickname?: string;
  createdAt?: any;
}

const PracticeRoom: React.FC = () => {
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const [songs, setSongs] = useState<PracticeSong[]>([]);
  const [newSong, setNewSong] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'practice'|'suggestion'|'done'|'other'>('practice');
  const [receivedSuggestions, setReceivedSuggestions] = useState<any[]>([]);
  const [sentSuggestions, setSentSuggestions] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [scheduleForm, setScheduleForm] = useState<{suggestionId?: string, songTitle?: string, toUid?: string, date: string, time: string, place: string} | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<any|null>(null);
  const [scheduleNotes, setScheduleNotes] = useState<{[id:string]:string}>({});
  const [searchUser, setSearchUser] = useState('');
  const [otherPractice, setOtherPractice] = useState<PracticeSong[]>([]);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [suggestForm, setSuggestForm] = useState<{nicknames: string[], songTitle: string}>({nicknames: [''], songTitle: ''});
  const [calendarView, setCalendarView] = useState(false);
  const [userSearchInput, setUserSearchInput] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [showSuggestForm, setShowSuggestForm] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const navigate = useNavigate();

  // 디바운스용 ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // 연습곡 불러오기
  useEffect(() => {
    if (!user) return;
    const fetchSongs = async () => {
      const q = query(collection(db, 'practiceSongs'), where('uid', '==', user.uid));
      const snap = await getDocs(q);
      setSongs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PracticeSong)));
      setLoading(false);
    };
    fetchSongs();
  }, [user]);

  // 제안(practiceSuggestions) 목록 fetch 함수
  const fetchSuggestions = async () => {
    if (!user) return;
    // 받은 제안
    const q = query(collection(db, 'practiceSuggestions'), where('toUid', '==', user.uid));
    const snap = await getDocs(q);
    setReceivedSuggestions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    // 보낸 제안
    const q2 = query(collection(db, 'practiceSuggestions'), where('fromUid', '==', user.uid));
    const snap2 = await getDocs(q2);
    setSentSuggestions(snap2.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  // 컴포넌트 마운트/유저 변경 시 1회 fetch
  useEffect(() => { fetchSuggestions(); }, [user]);

  // suggestions는 항상 received+sent 합집합(중복 제거)으로 계산
  const suggestions = useMemo(() => {
    const map = new Map();
    [...receivedSuggestions, ...sentSuggestions].forEach(s => { map.set(s.id, s); });
    return Array.from(map.values());
  }, [receivedSuggestions, sentSuggestions]);

  // 곡 수락시 내 연습곡에 중복 없이 추가 (실시간 리스너 없이, fetchSuggestions 후 songs 상태로만 체크)
  useEffect(() => {
    if (!user) return;
    const registered = new Set(songs.filter(s => s.suggestionId).map(s => s.suggestionId));
    sentSuggestions.forEach(async s => {
      if (s.status === 'accepted' && s.deleted !== true && !registered.has(s.id)) {
        await addDoc(collection(db, 'practiceSongs'), {
          uid: user.uid,
          title: s.songTitle,
          isSuggestion: true,
          fromNickname: s.fromNickname,
          suggestionId: s.id,
          fromDone: s.fromDone ?? false,
          toDone: s.toDone ?? false,
          createdAt: new Date()
        });
      }
    });
  }, [sentSuggestions, user, songs]);

  // 곡 추가
  const handleAddSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSong.trim() || !user) return;
    const docRef = await addDoc(collection(db, 'practiceSongs'), { uid: user.uid, title: newSong.trim(), done: false, createdAt: new Date() });
    setSongs([...songs, { id: docRef.id, title: newSong.trim(), done: false, createdAt: new Date() }]);
    setNewSong('');
  };

  // 곡 완료 체크 (일반곡)
  const handleToggleDone = async (id: string, done: boolean, song?: PracticeSong) => {
    if (song?.isSuggestion && song.suggestionId) {
      // 제안곡 체크: 내 역할에 따라 fromDone/toDone만 변경
      const isFrom = user.nickname === song.fromNickname;
      const field = isFrom ? 'fromDone' : 'toDone';
      // 문서 존재 여부 확인
      const suggestionRef = doc(db, 'practiceSuggestions', song.suggestionId);
      const suggestionSnap = await getDocs(query(collection(db, 'practiceSuggestions'), where('__name__', '==', song.suggestionId)));
      if (suggestionSnap.empty) {
        alert('이미 삭제된 제안곡입니다.');
        return;
      }
      await updateDoc(suggestionRef, { [field]: !(song[field] ?? false) });
      // practiceSongs에도 fromDone/toDone 필드 업데이트
      await updateDoc(doc(db, 'practiceSongs', id), { [field]: !(song[field] ?? false) });
      alert('연습완료곡 카테고리로 이동되었습니다');
    } else {
      // 일반곡
      await updateDoc(doc(db, 'practiceSongs', id), { done: !done });
      alert('연습완료곡 카테고리로 이동되었습니다');
    }
  };

  // 곡 삭제
  const handleDeleteSong = async (id: string) => {
    await deleteDoc(doc(db, 'practiceSongs', id));
    setSongs(songs.filter(s => s.id !== id));
  };

  // 곡 제안: addDoc 후 fetchSuggestions
  const handleSendSuggest = async () => {
    if (!suggestForm.songTitle.trim() || suggestForm.nicknames.some(n => !n.trim())) return;
    for (const nickname of suggestForm.nicknames) {
      const toUser = allUsers.find(u => u.nickname === nickname.trim());
      if (!toUser) {
        alert(`닉네임 ${nickname}의 유저를 찾을 수 없습니다.`);
        continue;
      }
      await addDoc(collection(db, 'practiceSuggestions'), {
        fromUid: user.uid,
        fromNickname: user.nickname,
        toUid: toUser.uid,
        toNickname: toUser.nickname,
        songTitle: suggestForm.songTitle.trim(),
        status: 'pending',
        createdAt: new Date()
      });
    }
    alert('곡 제안이 전송되었습니다.');
    setSuggestForm({ nicknames: [''], songTitle: '' });
    fetchSuggestions();
  };

  // 곡 제안 수락/거절: updateDoc 후 fetchSuggestions
  const handleAcceptSuggestion = async (id: string) => {
    await updateDoc(doc(db, 'practiceSuggestions', id), { status: 'accepted' });
    fetchSuggestions();
  };
  const handleRejectSuggestion = async (id: string) => {
    await updateDoc(doc(db, 'practiceSuggestions', id), { status: 'rejected' });
    fetchSuggestions();
  };
  // 내가 보낸 제안 삭제: deleteDoc 후 fetchSuggestions
  const handleDeleteSentSuggestion = async (id: string) => {
    await deleteDoc(doc(db, 'practiceSuggestions', id));
    fetchSuggestions();
  };

  // 일정 제안 핸들러
  const handleProposeSchedule = (suggestion: any) => {
    setScheduleForm({ suggestionId: suggestion.id, songTitle: suggestion.songTitle, toUid: suggestion.fromUid === user.uid ? suggestion.toUid : suggestion.fromUid, date: '', time: '', place: '' });
  };
  const handleSubmitSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm) return;
    if (!scheduleForm.date || !scheduleForm.time || !scheduleForm.place) {
      alert('날짜, 시간, 장소를 모두 입력해주세요.');
      return;
    }
    // Firestore에 일정 제안 저장
    const docRef = await addDoc(collection(db, 'practiceSchedules'), {
      suggestionId: scheduleForm.suggestionId,
      songTitle: scheduleForm.songTitle,
      fromUid: user.uid,
      toUid: scheduleForm.toUid,
      date: scheduleForm.date,
      time: scheduleForm.time,
      place: scheduleForm.place,
      status: 'pending',
      createdAt: new Date()
    });
    setSchedules([...schedules, { id: docRef.id, ...scheduleForm, status: 'pending' }]);
    setScheduleForm(null);
  };
  // 일정 수락/거절 핸들러
  const handleAcceptSchedule = async (id: string) => {
    await updateDoc(doc(db, 'practiceSchedules', id), { status: 'accepted' });
    setSchedules(schedules.map(s => s.id === id ? { ...s, status: 'accepted' } : s));
    const sch = schedules.find(s=>s.id===id);
    if (sch) await sendNotification(sch.fromUid, `${user.nickname}님이 연습 일정(${sch.songTitle})을 수락했습니다.`);
  };
  const handleRejectSchedule = async (id: string) => {
    await updateDoc(doc(db, 'practiceSchedules', id), { status: 'rejected' });
    setSchedules(schedules.map(s => s.id === id ? { ...s, status: 'rejected' } : s));
  };
  const handleEditSchedule = (sch: any) => setEditingSchedule(sch);
  const handleUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule) return;
    await updateDoc(doc(db, 'practiceSchedules', editingSchedule.id), {
      date: editingSchedule.date,
      time: editingSchedule.time,
      place: editingSchedule.place
    });
    setSchedules(schedules.map(s => s.id === editingSchedule.id ? { ...s, ...editingSchedule } : s));
    setEditingSchedule(null);
  };
  const handleCancelSchedule = async (id: string) => {
    await updateDoc(doc(db, 'practiceSchedules', id), { status: 'cancelled' });
    setSchedules(schedules.map(s => s.id === id ? { ...s, status: 'cancelled' } : s));
  };
  const handleSaveScheduleNote = async (id: string) => {
    await updateDoc(doc(db, 'practiceSchedules', id), { notes: scheduleNotes[id] || '' });
    alert('메모/준비물이 저장되었습니다.');
  };
  const handleSearchUser = async () => {
    if (!userSearchInput || typeof userSearchInput !== 'string' || !userSearchInput.trim()) {
      alert('닉네임을 입력하세요.');
      return;
    }
    const other = allUsers.find(u => u.nickname === userSearchInput.trim());
    if (!other) {
      setOtherUser(null);
      setOtherPractice([]);
      alert('해당 닉네임의 유저를 찾을 수 없습니다.');
      return;
    }
    setOtherUser(other);
    // 2. 해당 유저의 연습곡 불러오기 (createdAt 필드가 있는 곡만 최신 30개, 없으면 기존 방식)
    let songsSnap;
    try {
      songsSnap = await getDocs(query(collection(db, 'practiceSongs'), where('uid', '==', other.uid), orderBy('createdAt', 'desc'), limit(30)));
      setOtherPractice(songsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PracticeSong)));
    } catch (e) {
      songsSnap = await getDocs(query(collection(db, 'practiceSongs'), where('uid', '==', other.uid)));
      setOtherPractice(songsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PracticeSong)));
    }
  };
  const handleUserSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserSearchInput(e.target.value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (e.target.value.trim().length === 0) {
      setUserSearchResults([]);
      setShowUserSearch(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const results = allUsers.filter(u => u.nickname && u.nickname.startsWith(e.target.value)).slice(0, 10);
      setUserSearchResults(results);
      setShowUserSearch(true);
    }, 400);
  };
  const handleUserSearchSelect = async (userObj: any) => {
    setOtherUser(userObj);
    let songsSnap;
    try {
      songsSnap = await getDocs(query(collection(db, 'practiceSongs'), where('uid', '==', userObj.uid), orderBy('createdAt', 'desc'), limit(30)));
      setOtherPractice(songsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PracticeSong)));
    } catch (e) {
      songsSnap = await getDocs(query(collection(db, 'practiceSongs'), where('uid', '==', userObj.uid)));
      setOtherPractice(songsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PracticeSong)));
    }
    setUserSearchInput(userObj.nickname);
    setShowUserSearch(false);
  };

  // 연습스케쥴 탭에서 user가 없으면 practice로 강제 전환
  useEffect(() => {
    if (!user && tab === 'done') setTab('practice');
  }, [user, tab]);

  // 탭 변경 시 연습 일정 제안 폼 닫기
  useEffect(() => {
    setScheduleForm(null);
  }, [tab]);

  // 컴포넌트 마운트 시 users 컬렉션 전체 fetch
  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, 'users'));
      setAllUsers(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
    };
    fetchUsers();
  }, []);

  // 쪽지/알림 발송용 함수 (더미)
  const sendNotification = async (toUid: string, message: string) => {
    await addDoc(collection(db, 'notifications'), { toUid, message, createdAt: new Date() });
  };

  if (!user) return <div style={{ padding: 40, textAlign: 'center', color: '#8A55CC' }}>로그인이 필요합니다.</div>;
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#B497D6' }}>불러오는 중...</div>;

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px #E5DAF5', padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={()=>{window.location.href = '/'}} style={{ background: '#E5DAF5', color: '#8A55CC', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, fontSize: 16, marginRight: 16, cursor: 'pointer' }}>← 메인보드로</button>
        <span style={{ fontWeight: 700, fontSize: 22, color: '#8A55CC' }}>🎹 연습장</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={() => setTab('practice')} style={{ flex: 1, background: tab==='practice'?'#8A55CC':'#F6F2FF', color: tab==='practice'?'#fff':'#8A55CC', border: 'none', borderRadius: 8, padding: 10, fontWeight: 600 }}>내 연습곡</button>
        <button onClick={() => setTab('suggestion')} style={{ flex: 1, background: tab==='suggestion'?'#8A55CC':'#F6F2FF', color: tab==='suggestion'?'#fff':'#8A55CC', border: 'none', borderRadius: 8, padding: 10, fontWeight: 600 }}>제안</button>
        <button onClick={() => setTab('done')} style={{ flex: 1, background: tab==='done'?'#8A55CC':'#F6F2FF', color: tab==='done'?'#fff':'#8A55CC', border: 'none', borderRadius: 8, padding: 10, fontWeight: 600 }}>연습완료곡</button>
        <button onClick={() => setTab('other')} style={{ flex: 1, background: tab==='other'?'#8A55CC':'#F6F2FF', color: tab==='other'?'#fff':'#8A55CC', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700, fontFamily: 'inherit' }}>
          <div style={{ fontWeight: 700, fontFamily: 'inherit' }}>연습장</div>
          <div style={{ fontWeight: 700, fontFamily: 'inherit', fontSize: 13, color: '#B497D6', marginTop: 2 }}>훔쳐보기</div>
        </button>
      </div>
      {tab==='practice' && (
        <>
          <form onSubmit={handleAddSong} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <input
              type="text"
              value={newSong}
              onChange={e => setNewSong(e.target.value)}
              placeholder="연습할 곡을 입력하세요"
              style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #E5DAF5', fontSize: 16 }}
            />
            <button type="submit" style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '0 18px', fontWeight: 600, fontSize: 16 }}>추가</button>
          </form>
          <div style={{ background: '#F6F2FF', borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <h4 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 17, marginBottom: 8 }}>개인연습곡</h4>
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: 0 }}>
              {songs.filter(song => !song.isSuggestion && !song.done).map(song => (
                <li key={song.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, background: '#fff', borderRadius: 8, padding: 8 }}>
                  <input
                    type="checkbox"
                    checked={song.done}
                    onChange={() => handleToggleDone(song.id, song.done ?? false, song)}
                  />
                  <span style={{ textDecoration: 'none', color: '#222', flex: 1 }}>
                    {song.title}
                  </span>
                  <button onClick={() => handleDeleteSong(song.id)} style={{ background: '#B497D6', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600 }}>삭제</button>
                </li>
              ))}
              {songs.filter(song => !song.isSuggestion && !song.done).length === 0 && <li style={{ color: '#B497D6', textAlign: 'center', padding: 16 }}>아직 개인연습곡이 없습니다.</li>}
            </ul>
          </div>
          {songs.filter(song => song.isSuggestion && !(song.fromDone || song.toDone)).length > 0 && (
            <div style={{ background: '#F6F2FF', borderRadius: 12, padding: 16, marginBottom: 24 }}>
              <h4 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 17, marginBottom: 8 }}>제안곡</h4>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {songs.filter(song => song.isSuggestion && !(song.fromDone || song.toDone)).map(song => {
                  const isFrom = user.nickname === song.fromNickname;
                  const myDone = isFrom ? song.fromDone : song.toDone;
                  // 상대방이 삭제한 경우 표시
                  const suggestion = suggestions.find(s => s.id === song.suggestionId);
                  const deletedByOther = suggestion && suggestion.deleted;
                  return (
                    <li key={song.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, background: '#fff', borderRadius: 8, padding: 8 }}>
                      <input
                        type="checkbox"
                        checked={!!myDone}
                        onChange={async () => {
                          if (!window.confirm('연습완료 하시겠습니까?')) return;
                          await handleToggleDone(song.id, !!myDone, song);
                        }}
                      />
                      <span style={{ flex: 1, textDecoration: 'none', color: '#222' }}>
                        {song.title} <span style={{ color: '#B497D6', fontSize: 13 }}>(from {song.fromNickname})</span>
                        {deletedByOther && <span style={{ color: '#F43F5E', fontSize: 13, marginLeft: 8 }}>상대방이 삭제함</span>}
                      </span>
                      <button onClick={async () => {
                        if (!window.confirm('정말 삭제하시겠습니까?')) return;
                        if (song.suggestionId) {
                          await updateDoc(doc(db, 'practiceSuggestions', song.suggestionId), { deleted: true });
                        }
                        await handleDeleteSong(song.id);
                      }} style={{ background: '#B497D6', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600 }}>삭제</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
      {tab==='suggestion' && (
        <div style={{ marginBottom: 24 }}>
          <button onClick={()=>setShowSuggestForm(v=>!v)} style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 24px', fontWeight: 600, fontSize: 16, marginRight: 8 }}>{showSuggestForm ? '닫기' : '곡 제안하기'}</button>
          {showSuggestForm && (
            <form onSubmit={e=>{e.preventDefault();handleSendSuggest();setShowSuggestForm(false);}} style={{ background: '#F6F2FF', borderRadius: 12, padding: 20, marginTop: 16 }}>
              <h4 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>곡 제안</h4>
              {suggestForm.nicknames.map((nickname, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <input type="text" value={nickname} onChange={e=>setSuggestForm(f=>({...f, nicknames: f.nicknames.map((n,i)=>i===idx?e.target.value:n)}))} placeholder="상대 닉네임" style={{ flex: 1, marginRight: 8, padding: 8, borderRadius: 8, border: '1px solid #E5DAF5' }} required />
                  {suggestForm.nicknames.length > 1 && <button type="button" onClick={()=>setSuggestForm(f=>({...f, nicknames: f.nicknames.filter((_,i)=>i!==idx)}))} style={{ background: '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600, fontSize: 16 }}>-</button>}
                  {idx === suggestForm.nicknames.length-1 && <button type="button" onClick={()=>setSuggestForm(f=>({...f, nicknames: [...f.nicknames,'']}))} style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600, fontSize: 16, marginLeft: 4 }}>+</button>}
                </div>
              ))}
              <input type="text" value={suggestForm.songTitle} onChange={e=>setSuggestForm(f=>({...f, songTitle:e.target.value}))} placeholder="제안 곡명" style={{ width: '100%', marginBottom: 8, padding: 8, borderRadius: 8, border: '1px solid #E5DAF5' }} required />
              <button type="submit" style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 24px', fontWeight: 600, fontSize: 16 }}>제안 보내기</button>
              <button type="button" onClick={()=>setShowSuggestForm(false)} style={{ marginLeft: 12, background: '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 24px', fontWeight: 600, fontSize: 16 }}>취소</button>
            </form>
          )}

          {/* 내가 받은 제안 */}
          <div style={{ marginTop: 32, marginBottom: 24, background: '#F6F2FF', borderRadius: 12, padding: 16 }}>
            <h4 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 17, marginBottom: 8 }}>받은제안곡</h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {suggestions.filter(s => s.toUid === user.uid).length === 0 && (
                <li style={{ color: '#B497D6', textAlign: 'center', padding: 12 }}>받은 제안이 없습니다.</li>
              )}
              {suggestions.filter(s => s.toUid === user.uid).map(s => (
                <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, background: '#fff', borderRadius: 8, padding: 8 }}>
                  <span style={{ flex: 1 }}>{s.songTitle} <span style={{ color: '#B497D6', fontSize: 13 }}>(from {s.fromNickname})</span></span>
                  <span style={{ color: s.status==='pending'?'#B497D6':s.status==='accepted'?'#22C55E':'#F43F5E', fontWeight: 600, marginRight: 8 }}>
                    {s.status==='pending'?'대기중':s.status==='accepted'?'수락됨':'거절됨'}
                  </span>
                  {s.status==='pending' && (
                    <>
                      <button onClick={()=>handleAcceptSuggestion(s.id)} style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600 }}>수락</button>
                      <button onClick={()=>handleRejectSuggestion(s.id)} style={{ background: '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600, marginLeft: 6 }}>거절</button>
                    </>
                  )}
                  {/* 삭제 버튼: pending이 아닐 때만 노출 */}
                  {s.status!=='pending' && (
                    <button onClick={()=>handleDeleteSentSuggestion(s.id)} style={{ background: '#B497D6', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600, marginLeft: 6 }}>삭제</button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* 내가 보낸 제안 */}
          <div style={{ marginBottom: 24, background: '#F6F2FF', borderRadius: 12, padding: 16 }}>
            <h4 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 17, marginBottom: 8 }}>보낸제안곡</h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {suggestions.filter(s => s.fromUid === user.uid).length === 0 && (
                <li style={{ color: '#B497D6', textAlign: 'center', padding: 12 }}>보낸 제안이 없습니다.</li>
              )}
              {suggestions.filter(s => s.fromUid === user.uid).map(s => (
                <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, background: '#fff', borderRadius: 8, padding: 8 }}>
                  <span style={{ flex: 1 }}>{s.songTitle} <span style={{ color: '#B497D6', fontSize: 13 }}>(to {s.toNickname})</span></span>
                  <span style={{ color: s.status==='pending'?'#B497D6':s.status==='accepted'?'#22C55E':'#F43F5E', fontWeight: 600, marginRight: 8 }}>
                    {s.status==='pending'?'대기중':s.status==='accepted'?'수락됨':'거절됨'}
                  </span>
                  <button onClick={()=>handleDeleteSentSuggestion(s.id)} style={{ background: '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600 }}>삭제</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {tab==='done' && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>연습완료곡</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {songs.filter(song => (song.done || song.fromDone || song.toDone)).length === 0 && (
              <li style={{ color: '#B497D6', textAlign: 'center', padding: 16 }}>아직 연습완료곡이 없습니다.</li>
            )}
            {songs.filter(song => (song.done || song.fromDone || song.toDone)).map(song => (
              <li key={song.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, background: '#F6F2FF', borderRadius: 8, padding: 8 }}>
                <span style={{ textDecoration: 'line-through', color: '#8A55CC', flex: 1 }}>
                  {song.title} <span style={{ color: '#B497D6', fontSize: 13 }}>{song.isSuggestion ? `(from ${song.fromNickname})` : ''}</span> <span style={{ fontSize: 14, color: '#8A55CC' }}>(완료)</span>
                </span>
                <button onClick={() => handleDeleteSong(song.id)} style={{ background: '#B497D6', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600 }}>삭제</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tab==='other' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ position: 'relative', width: 200 }}>
              <input type="text" value={userSearchInput} onChange={e => {
                handleUserSearchInput(e);
                if (e.target.value.trim() === '') {
                  setOtherUser(null);
                  setOtherPractice([]);
                }
              }} placeholder="타인 닉네임으로 연습장 조회" style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #E5DAF5' }} />
              {showUserSearch && userSearchResults.length > 0 && (
                <div style={{ position: 'absolute', background: '#fff', border: '1px solid #E5DAF5', borderRadius: 8, zIndex: 10, width: '100%', left: 0, top: 40, boxShadow: '0 2px 8px #E5DAF5' }}>
                  {userSearchResults.map(u => (
                    <div key={u.uid} style={{ padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} onClick={()=>handleUserSearchSelect(u)}>
                      <span>{u.nickname}</span>
                      {u.grade && <span style={{ color: '#8A55CC', fontSize: 13, marginLeft: 4 }}>{u.grade}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={handleSearchUser} style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 16, marginLeft: 8 }}>조회</button>
          </div>
          {otherUser && (
            <div style={{ background: '#F6F2FF', borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <h4 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>{otherUser.nickname}님의 연습장</h4>
              {/* 개인연습곡 */}
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>개인연습곡</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {otherPractice.filter(song => !song.isSuggestion && !song.done).length === 0 && <li style={{ color: '#B497D6', textAlign: 'center', padding: 12 }}>아직 개인연습곡이 없습니다.</li>}
                  {otherPractice.filter(song => !song.isSuggestion && !song.done).map(song => (
                    <li key={song.id} style={{ marginBottom: 8 }}>
                      {song.title}
                    </li>
                  ))}
                </ul>
              </div>
              {/* 제안곡 */}
              <div>
                <h4 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>제안곡</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {otherPractice.filter(song => song.isSuggestion && !(song.fromDone || song.toDone)).length === 0 && <li style={{ color: '#B497D6', textAlign: 'center', padding: 12 }}>아직 제안곡이 없습니다.</li>}
                  {otherPractice.filter(song => song.isSuggestion && !(song.fromDone || song.toDone)).map(song => (
                    <li key={song.id} style={{ marginBottom: 8 }}>
                      {song.title} <span style={{ color: '#B497D6', fontSize: 13 }}>(from {song.fromNickname})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
      {calendarView && (
        <div style={{ background: '#F6F2FF', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h4 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>연습 스케쥴 캘린더</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(() => {
              const today = new Date();
              const days = eachDayOfInterval({ start: startOfMonth(today), end: endOfMonth(today) });
              return days.map((day: Date) => (
                <div key={format(day, 'yyyy-MM-dd')} style={{ width: 60, height: 60, background: '#fff', borderRadius: 8, border: '1px solid #E5DAF5', margin: 2, padding: 4, fontSize: 13, position: 'relative' }}>
                  <div style={{ color: '#8A55CC', fontWeight: 600 }}>{format(day, 'd')}</div>
                  {schedules.filter(s => s.date === format(day, 'yyyy-MM-dd')).map(s => (
                    <div key={s.id} style={{ fontSize: 11, color: '#B497D6', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.songTitle}</div>
                  ))}
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticeRoom; 