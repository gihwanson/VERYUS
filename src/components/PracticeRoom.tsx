import React, { useEffect, useState, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
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
  const [isMobile, setIsMobile] = useState(false);

  const navigate = useNavigate();

  // 디바운스용 ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // 모바일 화면 크기 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

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
    
    // 주당 2곡 제한 체크
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 0 }); // 일요일 시작
    const weekEnd = endOfWeek(now, { weekStartsOn: 0 }); // 토요일 끝
    
    // 이번 주에 등록한 곡 개수 확인
    const q = query(
      collection(db, 'practiceSongs'),
      where('uid', '==', user.uid)
    );
    const snapshot = await getDocs(q);
    
    const thisWeekSongs = snapshot.docs.filter(doc => {
      const data = doc.data();
      if (!data.createdAt) return false;
      
      // Firestore Timestamp를 Date로 변환
      const createdDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      
      return createdDate >= weekStart && createdDate <= weekEnd;
    });
    
    console.log('📊 이번 주 등록 곡:', thisWeekSongs.length, '/ 2곡');
    console.log('📅 주 기간:', format(weekStart, 'yyyy-MM-dd'), '~', format(weekEnd, 'yyyy-MM-dd'));
    
    if (thisWeekSongs.length >= 2) {
      alert('주당 최대 2곡까지만 등록 가능합니다.\n\n이번 주 등록: ' + thisWeekSongs.length + '/2곡');
      return;
    }
    
    const docRef = await addDoc(collection(db, 'practiceSongs'), { uid: user.uid, title: newSong.trim(), done: false, createdAt: new Date() });
    setSongs([...songs, { id: docRef.id, title: newSong.trim(), done: false, createdAt: new Date() }]);
    setNewSong('');
    
    alert(`곡이 등록되었습니다!\n\n이번 주 등록: ${thisWeekSongs.length + 1}/2곡`);
  };

  // 곡 완료 체크 (practiceSongs에서: done만 변경)
  const handleToggleDoneOnlyMine = async (id: string, done: boolean) => {
    await updateDoc(doc(db, 'practiceSongs', id), { done: !done });
    alert('연습완료곡 카테고리로 이동되었습니다');
  };

  // 제안곡 탭에서만 사용: fromDone/toDone 변경
  const handleToggleSuggestionDone = async (id: string, done: boolean, song?: PracticeSong) => {
    if (song?.isSuggestion && song.suggestionId) {
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
    }
  };

  // 기존 handleToggleDone은 일반곡만 처리
  const handleToggleDone = async (id: string, done: boolean, song?: PracticeSong) => {
    if (song?.isSuggestion) {
      // do nothing (분리)
      return;
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
    // 내 연습곡에 추가 (중복 방지)
    const q = query(collection(db, 'practiceSongs'), where('uid', '==', user.uid), where('suggestionId', '==', id));
    const snap = await getDocs(q);
    if (snap.empty) {
      const suggestion = suggestions.find(s => s.id === id);
      if (suggestion) {
        await addDoc(collection(db, 'practiceSongs'), {
          uid: user.uid,
          title: suggestion.songTitle,
          isSuggestion: true,
          fromNickname: suggestion.fromNickname,
          suggestionId: id,
          fromDone: false,
          toDone: false,
          createdAt: new Date()
        });
      }
    }
    fetchSuggestions();
  };

  const handleRejectSuggestion = async (id: string) => {
    await updateDoc(doc(db, 'practiceSuggestions', id), { status: 'rejected' });
    fetchSuggestions();
  };

  const handleDeleteSentSuggestion = async (id: string) => {
    await updateDoc(doc(db, 'practiceSuggestions', id), { deleted: true });
    fetchSuggestions();
  };

  const handleProposeSchedule = (suggestion: any) => {
    setScheduleForm({ suggestionId: suggestion.id, songTitle: suggestion.songTitle, toUid: suggestion.toUid, date: '', time: '', place: '' });
  };

  const handleSubmitSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm) return;
    await addDoc(collection(db, 'practiceSchedules'), {
      fromUid: user.uid,
      fromNickname: user.nickname,
      toUid: scheduleForm.toUid,
      suggestionId: scheduleForm.suggestionId,
      songTitle: scheduleForm.songTitle,
      date: scheduleForm.date,
      time: scheduleForm.time,
      place: scheduleForm.place,
      status: 'pending',
      createdAt: new Date()
    });
    alert('일정이 제안되었습니다.');
    setScheduleForm(null);
    // 스케쥴 목록 새로고침
    const q = query(collection(db, 'practiceSchedules'), where('fromUid', '==', user.uid));
    const snap = await getDocs(q);
    const q2 = query(collection(db, 'practiceSchedules'), where('toUid', '==', user.uid));
    const snap2 = await getDocs(q2);
    const allSchedules = [...snap.docs.map(doc => ({ id: doc.id, ...doc.data() })), ...snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
    setSchedules(allSchedules);
  };

  const handleAcceptSchedule = async (id: string) => {
    await updateDoc(doc(db, 'practiceSchedules', id), { status: 'accepted' });
    const q = query(collection(db, 'practiceSchedules'), where('fromUid', '==', user.uid));
    const snap = await getDocs(q);
    const q2 = query(collection(db, 'practiceSchedules'), where('toUid', '==', user.uid));
    const snap2 = await getDocs(q2);
    const allSchedules = [...snap.docs.map(doc => ({ id: doc.id, ...doc.data() })), ...snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
    setSchedules(allSchedules);
  };

  const handleRejectSchedule = async (id: string) => {
    await updateDoc(doc(db, 'practiceSchedules', id), { status: 'rejected' });
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
    setEditingSchedule(null);
    alert('일정이 수정되었습니다.');
  };

  const handleCancelSchedule = async (id: string) => {
    await updateDoc(doc(db, 'practiceSchedules', id), { status: 'cancelled' });
  };

  const handleSaveScheduleNote = async (id: string) => {
    await updateDoc(doc(db, 'practiceSchedules', id), { note: scheduleNotes[id] });
  };

  const handleSearchUser = async () => {
    if (!userSearchInput.trim()) return;
    const userCollection = collection(db, 'users');
    const q = query(userCollection, where('nickname', '==', userSearchInput.trim()));
    const snap = await getDocs(q);
    if (snap.empty) {
      alert('해당 닉네임의 유저를 찾을 수 없습니다.');
      return;
    }
    const foundUser = snap.docs[0].data();
    setOtherUser(foundUser);
    // 해당 유저의 연습곡 가져오기
    const practiceQuery = query(collection(db, 'practiceSongs'), where('uid', '==', foundUser.uid));
    const practiceSnap = await getDocs(practiceQuery);
    setOtherPractice(practiceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PracticeSong)));
  };

  const handleUserSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUserSearchInput(value);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    if (value.trim() === '') {
      setShowUserSearch(false);
      setUserSearchResults([]);
      return;
    }
    
    debounceRef.current = setTimeout(async () => {
      const userCollection = collection(db, 'users');
      const q = query(userCollection, limit(5));
      const snap = await getDocs(q);
      const filtered = snap.docs.map(doc => doc.data()).filter(u => u.nickname.toLowerCase().includes(value.toLowerCase()));
      setUserSearchResults(filtered);
      setShowUserSearch(filtered.length > 0);
    }, 300);
  };

  const handleUserSearchSelect = async (userObj: any) => {
    setUserSearchInput(userObj.nickname);
    setShowUserSearch(false);
    setOtherUser(userObj);
    
    // 해당 유저의 연습곡 가져오기
    const practiceQuery = query(collection(db, 'practiceSongs'), where('uid', '==', userObj.uid));
    const practiceSnap = await getDocs(practiceQuery);
    setOtherPractice(practiceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PracticeSong)));
  };

  // 스케쥴 불러오기
  useEffect(() => {
    if (!user) return;
    const fetchSchedules = async () => {
      const q = query(collection(db, 'practiceSchedules'), where('fromUid', '==', user.uid));
      const snap = await getDocs(q);
      const q2 = query(collection(db, 'practiceSchedules'), where('toUid', '==', user.uid));
      const snap2 = await getDocs(q2);
      const allSchedules = [...snap.docs.map(doc => ({ id: doc.id, ...doc.data() })), ...snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
      setSchedules(allSchedules);
    };
    fetchSchedules();
  }, [user]);

  // 전체 유저 목록 불러오기
  useEffect(() => {
    const fetchUsers = async () => {
      const q = query(collection(db, 'users'));
      const snap = await getDocs(q);
      setAllUsers(snap.docs.map(doc => doc.data()));
    };
    fetchUsers();
  }, []);

  const sendNotification = async (toUid: string, message: string) => {
    await addDoc(collection(db, 'notifications'), { toUid, message, createdAt: new Date() });
  };

  if (!user) return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '18px',
      fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    }}>
      로그인이 필요합니다.
    </div>
  );

  if (loading) return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '18px',
      fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    }}>
      불러오는 중...
    </div>
  );

  return (
    <div style={{ 
      minHeight: '100vh',
      width: '100%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      margin: 0, 
      padding: isMobile ? 16 : 24,
      fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      position: 'relative'
    }}>
      {/* 배경 패턴 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `
          radial-gradient(circle at 20% 80%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%)
        `,
        pointerEvents: 'none',
        zIndex: 0
      }} />

      {/* 헤더 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        marginBottom: 24, 
        position: 'relative',
        zIndex: 1
      }}>
        <span style={{ 
          fontWeight: 800, 
          fontSize: isMobile ? 24 : 28, 
          color: 'white',
          textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
          textAlign: 'center'
        }}>
          🎹 연습장
        </span>
      </div>

      {/* 탭 네비게이션 */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: isMobile ? 8 : 12, 
        marginBottom: 32,
        position: 'relative',
        zIndex: 1
      }}>
        {[
          { key: 'practice', label: '내 연습곡', icon: '🎵' },
          { key: 'suggestion', label: '제안', icon: '💡' },
          { key: 'done', label: '연습완료곡', icon: '✅' },
          { key: 'other', label: '연습장 훔쳐보기', icon: '👀' }
        ].map(({ key, label, icon }) => (
          <div 
            key={key}
            onClick={() => setTab(key as any)} 
            style={{ 
              background: 'none',
              color: 'white', 
          border: 'none', 
              padding: 0,
              margin: 0,
              fontWeight: tab === key ? 700 : 600,
              fontSize: isMobile ? 13 : 15,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
          fontFamily: 'inherit',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              opacity: tab === key ? 1 : 0.7,
              transform: tab === key ? 'scale(1.1)' : 'scale(1)',
              outline: 'none',
              boxShadow: 'none'
            }}
            onMouseEnter={(e) => {
              if (tab !== key) {
                (e.target as HTMLElement).style.opacity = '0.9';
                (e.target as HTMLElement).style.transform = 'scale(1.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (tab !== key) {
                (e.target as HTMLElement).style.opacity = '0.7';
                (e.target as HTMLElement).style.transform = 'scale(1)';
              }
            }}
          >
            <span style={{ fontSize: isMobile ? 24 : 32 }}>{icon}</span>
            <span style={{ fontSize: isMobile ? 12 : 14, textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)' }}>{label}</span>
      </div>
        ))}
      </div>

      {/* 메인 콘텐츠 */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {tab === 'practice' && (
          <>
            {/* 곡 추가 폼 */}
            <form onSubmit={handleAddSong} style={{ 
              display: 'flex', 
              gap: 12, 
              marginBottom: 32 
            }}>
            <input
              type="text"
              value={newSong}
              onChange={e => setNewSong(e.target.value)}
              placeholder="곡제목(곡제목만 써주세요!)"
                style={{ 
                  flex: 1, 
                  padding: '12px 16px', 
                  borderRadius: 12, 
                  border: '1px solid rgba(255, 255, 255, 0.3)', 
                  fontSize: 16,
                  background: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(15px)',
                  WebkitBackdropFilter: 'blur(15px)',
                  color: 'white',
                  fontFamily: 'inherit'
                }}
              />
              <button 
                type="submit" 
                style={{ 
                  background: 'rgba(255, 255, 255, 0.25)', 
                  backdropFilter: 'blur(15px)',
                  WebkitBackdropFilter: 'blur(15px)',
                  color: 'white', 
                  border: '1px solid rgba(255, 255, 255, 0.3)', 
                  borderRadius: 12, 
                  padding: '12px 24px', 
                  fontWeight: 600, 
                  fontSize: 16,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  fontFamily: 'inherit'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.35)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.25)';
                }}
              >
                추가
              </button>
          </form>

            {/* 개인연습곡 카드 */}
            <div style={{ 
              background: 'rgba(255, 255, 255, 0.15)', 
              backdropFilter: 'blur(15px)',
              WebkitBackdropFilter: 'blur(15px)',
              borderRadius: 16, 
              padding: 24, 
              marginBottom: 24,
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <h4 style={{ 
                color: 'white', 
                fontWeight: 700, 
                fontSize: 18, 
                marginBottom: 16,
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
              }}>
                개인연습곡
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {songs.filter(song => !song.isSuggestion && !song.done).map(song => (
                  <li key={song.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 12, 
                    marginBottom: 12, 
                    background: 'rgba(255, 255, 255, 0.1)', 
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderRadius: 12, 
                    padding: 16,
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    transition: 'all 0.3s ease'
                  }}>
                  <input
                    type="checkbox"
                    checked={song.done}
                    onChange={() => handleToggleDoneOnlyMine(song.id, song.done ?? false)}
                      style={{ 
                        width: 16, 
                        height: 16,
                        accentColor: 'rgba(255, 255, 255, 0.8)'
                      }}
                    />
                    <span style={{ 
                      textDecoration: 'none', 
                      color: 'white', 
                      flex: 1,
                      fontSize: 15,
                      fontWeight: 500
                    }}>
                    {song.title}
                  </span>
                                          <button 
                        onClick={() => handleDeleteSong(song.id)} 
                        style={{ 
                          background: 'rgba(220, 38, 38, 0.6)', 
                          backdropFilter: 'blur(10px)',
                          WebkitBackdropFilter: 'blur(10px)',
                          color: 'white', 
                          border: '1px solid rgba(220, 38, 38, 0.8)', 
                          borderRadius: 8, 
                          padding: '6px 12px', 
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          fontFamily: 'inherit'
                        }}
                        onMouseEnter={(e) => {
                          (e.target as HTMLElement).style.background = 'rgba(220, 38, 38, 0.8)';
                        }}
                        onMouseLeave={(e) => {
                          (e.target as HTMLElement).style.background = 'rgba(220, 38, 38, 0.6)';
                        }}
                      >
                      삭제
                    </button>
                </li>
              ))}
                {songs.filter(song => !song.isSuggestion && !song.done).length === 0 && 
                  <li style={{ 
                    color: 'rgba(255, 255, 255, 0.7)', 
                    textAlign: 'center', 
                    padding: 20,
                    fontSize: 15
                  }}>
                    아직 개인연습곡이 없습니다.
                  </li>
                }
            </ul>
          </div>

            {/* 제안곡 카드 */}
          {songs.filter(song => song.isSuggestion && !(song.fromDone || song.toDone)).length > 0 && (
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.15)', 
                backdropFilter: 'blur(15px)',
                WebkitBackdropFilter: 'blur(15px)',
                borderRadius: 16, 
                padding: 24, 
                marginBottom: 24,
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}>
                <h4 style={{ 
                  color: 'white', 
                  fontWeight: 700, 
                  fontSize: 18, 
                  marginBottom: 16,
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
                }}>
                  제안곡
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {songs.filter(song => song.isSuggestion && !(song.fromDone || song.toDone)).map(song => {
                  const isFrom = user.nickname === song.fromNickname;
                  const myDone = isFrom ? song.fromDone : song.toDone;
                  const suggestion = suggestions.find(s => s.id === song.suggestionId);
                  const deletedByOther = suggestion && suggestion.deleted;
                    
                  return (
                      <li key={song.id} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 12, 
                        marginBottom: 12, 
                        background: 'rgba(255, 255, 255, 0.1)', 
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        borderRadius: 12, 
                        padding: 16,
                        border: '1px solid rgba(255, 255, 255, 0.15)'
                      }}>
                      <input
                        type="checkbox"
                        checked={!!myDone}
                        onChange={async () => {
                          if (!window.confirm('연습완료 하시겠습니까?')) return;
                          await handleToggleSuggestionDone(song.id, !!myDone, song);
                        }}
                          style={{ 
                            width: 16, 
                            height: 16,
                            accentColor: 'rgba(255, 255, 255, 0.8)'
                          }}
                        />
                        <span style={{ 
                          flex: 1, 
                          textDecoration: 'none', 
                          color: 'white',
                          fontSize: 15,
                          fontWeight: 500
                        }}>
                          {song.title} 
                          <span style={{ 
                            color: 'rgba(255, 255, 255, 0.6)', 
                            fontSize: 13, 
                            marginLeft: 8 
                          }}>
                            (from {song.fromNickname})
                      </span>
                          {deletedByOther && 
                            <span style={{ 
                              color: '#ff6b6b', 
                              fontSize: 13, 
                              marginLeft: 8 
                            }}>
                              상대방이 삭제함
                            </span>
                          }
                        </span>
                                                  <button 
                            onClick={async () => {
                        if (!window.confirm('정말 삭제하시겠습니까?')) return;
                        if (song.suggestionId) {
                          await updateDoc(doc(db, 'practiceSuggestions', song.suggestionId), { deleted: true });
                        }
                        await handleDeleteSong(song.id);
                            }} 
                            style={{ 
                              background: 'rgba(220, 38, 38, 0.6)', 
                              backdropFilter: 'blur(10px)',
                              WebkitBackdropFilter: 'blur(10px)',
                              color: 'white', 
                              border: '1px solid rgba(220, 38, 38, 0.8)', 
                              borderRadius: 8, 
                              padding: '6px 12px', 
                              fontWeight: 600,
                              fontSize: 13,
                              cursor: 'pointer',
                              transition: 'all 0.3s ease',
                              fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                              (e.target as HTMLElement).style.background = 'rgba(220, 38, 38, 0.8)';
                            }}
                            onMouseLeave={(e) => {
                              (e.target as HTMLElement).style.background = 'rgba(220, 38, 38, 0.6)';
                            }}
                          >
                          삭제
                        </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}

        {tab === 'suggestion' && (
        <div style={{ marginBottom: 24 }}>
            <button 
              onClick={()=>setShowSuggestForm(v=>!v)} 
              style={{ 
                background: 'rgba(255, 255, 255, 0.25)', 
                backdropFilter: 'blur(15px)',
                WebkitBackdropFilter: 'blur(15px)',
                color: 'white', 
                border: '1px solid rgba(255, 255, 255, 0.3)', 
                borderRadius: 12, 
                padding: '12px 24px', 
                fontWeight: 600, 
                fontSize: 16, 
                marginRight: 12,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                fontFamily: 'inherit'
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.35)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.25)';
              }}
            >
              {showSuggestForm ? '닫기' : '곡 제안하기'}
            </button>
            
          {showSuggestForm && (
              <form 
                onSubmit={e=>{e.preventDefault();handleSendSuggest();setShowSuggestForm(false);}} 
                style={{ 
                  background: 'rgba(255, 255, 255, 0.15)', 
                  backdropFilter: 'blur(15px)',
                  WebkitBackdropFilter: 'blur(15px)',
                  borderRadius: 16, 
                  padding: 24, 
                  marginTop: 20,
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <h4 style={{ 
                  color: 'white', 
                  fontWeight: 700, 
                  fontSize: 18, 
                  marginBottom: 16,
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
                }}>
                  곡 제안
                </h4>
              {suggestForm.nicknames.map((nickname, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                    <input 
                      type="text" 
                      value={nickname} 
                      onChange={e=>setSuggestForm(f=>({...f, nicknames: f.nicknames.map((n,i)=>i===idx?e.target.value:n)}))} 
                      placeholder="상대 닉네임" 
                      style={{ 
                        flex: 1, 
                        marginRight: 12, 
                        padding: '10px 14px', 
                        borderRadius: 10, 
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        background: 'rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        color: 'white',
                        fontSize: 14,
                        fontFamily: 'inherit'
                      }} 
                      required 
                    />
                    {suggestForm.nicknames.length > 1 && 
                                              <button 
                          type="button" 
                          onClick={()=>setSuggestForm(f=>({...f, nicknames: f.nicknames.filter((_,i)=>i!==idx)}))} 
                          style={{ 
                            background: 'rgba(220, 38, 38, 0.6)', 
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)',
                            color: 'white', 
                            border: '1px solid rgba(220, 38, 38, 0.8)', 
                            borderRadius: 8, 
                            padding: '6px 12px', 
                            fontWeight: 600, 
                            fontSize: 14,
                            cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}
                        >
                        -
                      </button>
                    }
                    {idx === suggestForm.nicknames.length-1 && 
                      <button 
                        type="button" 
                        onClick={()=>setSuggestForm(f=>({...f, nicknames: [...f.nicknames,'']}))} 
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.2)', 
                          backdropFilter: 'blur(10px)',
                          WebkitBackdropFilter: 'blur(10px)',
                          color: 'white', 
                          border: '1px solid rgba(255, 255, 255, 0.3)', 
                          borderRadius: 8, 
                          padding: '6px 12px', 
                          fontWeight: 600, 
                          fontSize: 14, 
                          marginLeft: 6,
                          cursor: 'pointer',
                          fontFamily: 'inherit'
                        }}
                      >
                        +
                      </button>
                    }
                </div>
              ))}
                <input 
                  type="text" 
                  value={suggestForm.songTitle} 
                  onChange={e=>setSuggestForm(f=>({...f, songTitle:e.target.value}))} 
                  placeholder="제안 곡명" 
                  style={{ 
                    width: '100%', 
                    marginBottom: 16, 
                    padding: '10px 14px', 
                    borderRadius: 10, 
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    color: 'white',
                    fontSize: 15,
                    fontFamily: 'inherit'
                  }} 
                  required 
                />
                <div style={{ display: 'flex', gap: 12 }}>
                  <button 
                    type="submit" 
                    style={{ 
                      background: 'rgba(34, 197, 94, 0.25)', 
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      color: 'white', 
                      border: '1px solid rgba(34, 197, 94, 0.3)', 
                      borderRadius: 10, 
                      padding: '10px 20px', 
                      fontWeight: 600, 
                      fontSize: 15,
                      cursor: 'pointer',
                      fontFamily: 'inherit'
                    }}
                  >
                    제안 보내기
                  </button>
                                      <button 
                      type="button" 
                      onClick={()=>setShowSuggestForm(false)} 
                      style={{ 
                        background: 'rgba(220, 38, 38, 0.6)', 
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        color: 'white', 
                        border: '1px solid rgba(220, 38, 38, 0.8)', 
                        borderRadius: 10, 
                        padding: '10px 20px', 
                        fontWeight: 600, 
                        fontSize: 15,
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}
                    >
                    취소
                  </button>
                </div>
            </form>
          )}

            {/* 받은 제안 */}
            <div style={{ 
              marginTop: 32, 
              marginBottom: 24, 
              background: 'rgba(255, 255, 255, 0.15)', 
              backdropFilter: 'blur(15px)',
              WebkitBackdropFilter: 'blur(15px)',
              borderRadius: 16, 
              padding: 24,
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <h4 style={{ 
                color: 'white', 
                fontWeight: 700, 
                fontSize: 18, 
                marginBottom: 16,
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
              }}>
                받은제안곡
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {suggestions.filter(s => s.toUid === user.uid).length === 0 && (
                  <li style={{ 
                    color: 'rgba(255, 255, 255, 0.7)', 
                    textAlign: 'center', 
                    padding: 20,
                    fontSize: 15
                  }}>
                    받은 제안이 없습니다.
                  </li>
              )}
              {suggestions.filter(s => s.toUid === user.uid).map(s => (
                  <li key={s.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 12, 
                    marginBottom: 12, 
                    background: 'rgba(255, 255, 255, 0.1)', 
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderRadius: 12, 
                    padding: 16,
                    border: '1px solid rgba(255, 255, 255, 0.15)'
                  }}>
                    <span style={{ flex: 1, color: 'white', fontSize: 15, fontWeight: 500 }}>
                      {s.songTitle} 
                      <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 13, marginLeft: 8 }}>
                        (from {s.fromNickname})
                      </span>
                    </span>
                    <span style={{ 
                      color: s.status==='pending'?'rgba(255, 255, 255, 0.7)':s.status==='accepted'?'#22C55E':'#ff6b6b', 
                      fontWeight: 600, 
                      marginRight: 8,
                      fontSize: 13
                    }}>
                    {s.status==='pending'?'대기중':s.status==='accepted'?'수락됨':'거절됨'}
                  </span>
                  {s.status==='pending' && (
                    <>
                        <button 
                          onClick={()=>handleAcceptSuggestion(s.id)} 
                          style={{ 
                            background: 'rgba(34, 197, 94, 0.25)', 
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)',
                            color: 'white', 
                            border: '1px solid rgba(34, 197, 94, 0.3)', 
                            borderRadius: 8, 
                            padding: '6px 12px', 
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}
                        >
                          수락
                        </button>
                        <button 
                          onClick={()=>handleRejectSuggestion(s.id)} 
                          style={{ 
                            background: 'rgba(220, 38, 38, 0.6)', 
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)',
                            color: 'white', 
                            border: '1px solid rgba(220, 38, 38, 0.8)', 
                            borderRadius: 8, 
                            padding: '6px 12px', 
                            fontWeight: 600, 
                            marginLeft: 8,
                            fontSize: 13,
                            cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}
                        >
                          거절
                        </button>
                    </>
                  )}
                  {s.status!=='pending' && (
                      <button 
                        onClick={()=>handleDeleteSentSuggestion(s.id)} 
                        style={{ 
                          background: 'rgba(107, 114, 128, 0.2)', 
                          backdropFilter: 'blur(10px)',
                          WebkitBackdropFilter: 'blur(10px)',
                          color: 'white', 
                          border: '1px solid rgba(107, 114, 128, 0.3)', 
                          borderRadius: 8, 
                          padding: '6px 12px', 
                          fontWeight: 600, 
                          marginLeft: 8,
                          fontSize: 13,
                          cursor: 'pointer',
                          fontFamily: 'inherit'
                        }}
                      >
                        삭제
                      </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

            {/* 보낸 제안 */}
            <div style={{ 
              marginBottom: 24, 
              background: 'rgba(255, 255, 255, 0.15)', 
              backdropFilter: 'blur(15px)',
              WebkitBackdropFilter: 'blur(15px)',
              borderRadius: 16, 
              padding: 24,
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <h4 style={{ 
                color: 'white', 
                fontWeight: 700, 
                fontSize: 18, 
                marginBottom: 16,
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
              }}>
                보낸제안곡
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {suggestions.filter(s => s.fromUid === user.uid).length === 0 && (
                  <li style={{ 
                    color: 'rgba(255, 255, 255, 0.7)', 
                    textAlign: 'center', 
                    padding: 20,
                    fontSize: 15
                  }}>
                    보낸 제안이 없습니다.
                  </li>
              )}
              {suggestions.filter(s => s.fromUid === user.uid).map(s => (
                  <li key={s.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 12, 
                    marginBottom: 12, 
                    background: 'rgba(255, 255, 255, 0.1)', 
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderRadius: 12, 
                    padding: 16,
                    border: '1px solid rgba(255, 255, 255, 0.15)'
                  }}>
                    <span style={{ flex: 1, color: 'white', fontSize: 15, fontWeight: 500 }}>
                      {s.songTitle} 
                      <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 13, marginLeft: 8 }}>
                        (to {s.toNickname})
                      </span>
                    </span>
                    <span style={{ 
                      color: s.status==='pending'?'rgba(255, 255, 255, 0.7)':s.status==='accepted'?'#22C55E':'#ff6b6b', 
                      fontWeight: 600, 
                      marginRight: 8,
                      fontSize: 13
                    }}>
                    {s.status==='pending'?'대기중':s.status==='accepted'?'수락됨':'거절됨'}
                  </span>
                    <button 
                      onClick={()=>handleDeleteSentSuggestion(s.id)} 
                      style={{ 
                        background: 'rgba(220, 38, 38, 0.6)', 
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        color: 'white', 
                        border: '1px solid rgba(220, 38, 38, 0.8)', 
                        borderRadius: 8, 
                        padding: '6px 12px', 
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}
                    >
                      삭제
                    </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

        {tab === 'done' && (
        <div style={{ marginBottom: 32 }}>
            <div style={{ 
              background: 'rgba(255, 255, 255, 0.15)', 
              backdropFilter: 'blur(15px)',
              WebkitBackdropFilter: 'blur(15px)',
              borderRadius: 16, 
              padding: 24,
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <h3 style={{ 
                color: 'white', 
                fontWeight: 700, 
                fontSize: 20, 
                marginBottom: 16,
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
              }}>
                연습완료곡
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {songs.filter(song => (song.done || song.fromDone || song.toDone)).length === 0 && (
                  <li style={{ 
                    color: 'rgba(255, 255, 255, 0.7)', 
                    textAlign: 'center', 
                    padding: 20,
                    fontSize: 15
                  }}>
                    아직 연습완료곡이 없습니다.
                  </li>
            )}
            {songs.filter(song => (song.done || song.fromDone || song.toDone)).map(song => {
              let display = song.title;
              return (
                    <li key={song.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 12, 
                      marginBottom: 12, 
                      background: 'rgba(255, 255, 255, 0.1)', 
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      borderRadius: 12, 
                      padding: 16,
                      border: '1px solid rgba(255, 255, 255, 0.15)'
                    }}>
                      <span style={{ color: 'white', flex: 1, fontSize: 15, fontWeight: 500 }}>
                    {display}
                  </span>
                                              <button 
                          onClick={() => handleDeleteSong(song.id)} 
                          style={{ 
                            background: 'rgba(220, 38, 38, 0.6)', 
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)',
                            color: 'white', 
                            border: '1px solid rgba(220, 38, 38, 0.8)', 
                            borderRadius: 8, 
                            padding: '6px 12px', 
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}
                          onMouseEnter={(e) => {
                            (e.target as HTMLElement).style.background = 'rgba(220, 38, 38, 0.8)';
                          }}
                          onMouseLeave={(e) => {
                            (e.target as HTMLElement).style.background = 'rgba(220, 38, 38, 0.6)';
                          }}
                        >
                        삭제
                      </button>
                </li>
              );
            })}
          </ul>
            </div>
        </div>
      )}

        {tab === 'other' && (
          <>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              alignItems: 'center', 
              marginBottom: 24,
              gap: 12,
              flexWrap: isMobile ? 'wrap' : 'nowrap'
            }}>
              <div style={{ position: 'relative', width: isMobile ? '100%' : 300 }}>
                <input 
                  type="text" 
                  value={userSearchInput} 
                  onChange={e => {
                handleUserSearchInput(e);
                if (e.target.value.trim() === '') {
                  setOtherUser(null);
                  setOtherPractice([]);
                }
                  }} 
                  placeholder="타인 닉네임으로 연습장 조회" 
                  style={{ 
                    width: '100%', 
                    padding: '10px 14px', 
                    borderRadius: 12, 
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    background: 'rgba(255, 255, 255, 0.15)',
                    backdropFilter: 'blur(15px)',
                    WebkitBackdropFilter: 'blur(15px)',
                    color: 'white',
                    fontSize: 15,
                    fontFamily: 'inherit'
                  }} 
                />
              {showUserSearch && userSearchResults.length > 0 && (
                  <div style={{ 
                    position: 'absolute', 
                    background: 'rgba(255, 255, 255, 0.95)', 
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)', 
                    borderRadius: 12, 
                    zIndex: 10, 
                    width: '100%', 
                    left: 0, 
                    top: 48, 
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)' 
                  }}>
                  {userSearchResults.map(u => (
                      <div 
                        key={u.uid} 
                        style={{ 
                          padding: 12, 
                          cursor: 'pointer', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 8,
                          color: '#1f2937',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                          transition: 'all 0.2s ease'
                        }} 
                        onClick={()=>handleUserSearchSelect(u)}
                        onMouseEnter={(e) => {
                          (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.5)';
                        }}
                        onMouseLeave={(e) => {
                          (e.target as HTMLElement).style.background = 'transparent';
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{u.nickname}</span>
                        {u.grade && 
                          <span style={{ color: '#667eea', fontSize: 13, fontWeight: 600 }}>
                            {u.grade}
                          </span>
                        }
                    </div>
                  ))}
                </div>
              )}
            </div>
              <button 
                onClick={handleSearchUser} 
                style={{ 
                  background: 'rgba(255, 255, 255, 0.25)', 
                  backdropFilter: 'blur(15px)',
                  WebkitBackdropFilter: 'blur(15px)',
                  color: 'white', 
                  border: '1px solid rgba(255, 255, 255, 0.3)', 
                  borderRadius: 12, 
                  padding: '10px 20px', 
                  fontWeight: 600, 
                  fontSize: 15,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  width: isMobile ? '100%' : 'auto'
                }}
              >
                조회
              </button>
          </div>
            
          {otherUser && (
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.15)', 
                backdropFilter: 'blur(15px)',
                WebkitBackdropFilter: 'blur(15px)',
                borderRadius: 16, 
                padding: 24, 
                marginBottom: 24,
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}>
                <h4 style={{ 
                  color: 'white', 
                  fontWeight: 700, 
                  fontSize: 20, 
                  marginBottom: 20,
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
                }}>
                  {otherUser.nickname}님의 연습장
                </h4>
                
              {/* 개인연습곡 */}
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ 
                    color: 'white', 
                    fontWeight: 600, 
                    fontSize: 16, 
                    marginBottom: 12,
                    opacity: 0.9
                  }}>
                    개인연습곡
                  </h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {otherPractice.filter(song => !song.isSuggestion && !song.done).length === 0 && 
                      <li style={{ 
                        color: 'rgba(255, 255, 255, 0.6)', 
                        textAlign: 'center', 
                        padding: 16,
                        fontSize: 14
                      }}>
                        아직 개인연습곡이 없습니다.
                      </li>
                    }
                  {otherPractice.filter(song => !song.isSuggestion && !song.done).map(song => (
                      <li key={song.id} style={{ 
                        marginBottom: 8,
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: 14,
                        padding: '6px 0'
                      }}>
                        • {song.title}
                    </li>
                  ))}
                </ul>
              </div>
                
              {/* 연습완료곡 */}
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ 
                    color: 'white', 
                    fontWeight: 600, 
                    fontSize: 16, 
                    marginBottom: 12,
                    opacity: 0.9
                  }}>
                    연습완료곡
                  </h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {otherPractice.filter(song => (!song.isSuggestion && song.done) || (song.isSuggestion && (song.fromDone || song.toDone))).length === 0 && 
                      <li style={{ 
                        color: 'rgba(255, 255, 255, 0.6)', 
                        textAlign: 'center', 
                        padding: 16,
                        fontSize: 14
                      }}>
                        아직 연습완료곡이 없습니다.
                      </li>
                    }
                  {otherPractice.filter(song => (!song.isSuggestion && song.done) || (song.isSuggestion && (song.fromDone || song.toDone))).map(song => {
                    let display = song.title;
                    return (
                        <li key={song.id} style={{ 
                          marginBottom: 8,
                          color: 'rgba(255, 255, 255, 0.8)',
                          fontSize: 14,
                          padding: '6px 0'
                        }}>
                          ✅ {display}
                      </li>
                    );
                  })}
                </ul>
              </div>
                
              {/* 제안곡 */}
              <div>
                  <h4 style={{ 
                    color: 'white', 
                    fontWeight: 600, 
                    fontSize: 16, 
                    marginBottom: 12,
                    opacity: 0.9
                  }}>
                    제안곡
                  </h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {otherPractice.filter(song => song.isSuggestion && !(song.fromDone || song.toDone)).length === 0 && 
                      <li style={{ 
                        color: 'rgba(255, 255, 255, 0.6)', 
                        textAlign: 'center', 
                        padding: 16,
                        fontSize: 14
                      }}>
                        아직 제안곡이 없습니다.
                      </li>
                    }
                  {otherPractice.filter(song => song.isSuggestion && !(song.fromDone || song.toDone)).map(song => {
                    let display = song.title;
                    return (
                        <li key={song.id} style={{ 
                          marginBottom: 8,
                          color: 'rgba(255, 255, 255, 0.8)',
                          fontSize: 14,
                          padding: '6px 0'
                        }}>
                          💡 {display}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
                </div>
    </div>
  );
};

export default PracticeRoom; 