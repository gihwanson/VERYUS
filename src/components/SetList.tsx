import React, { useEffect, useState } from 'react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  Timestamp, 
  query, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';

interface Song {
  id: string;
  title: string;
  members: string[];
  createdAt?: any;
  updatedAt?: any;
}

interface SetListItem {
  songId: string;
  title: string;
  members: string[];
  order: number;
}

interface SetListData {
  id?: string;
  name: string;
  participants: string[];
  songs: SetListItem[];
  createdBy: string;
  createdAt: any;
  updatedAt: any;
  isActive: boolean;
  currentSongIndex?: number; // 현재 재생 중인 곡의 인덱스
}

const SetList: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [setLists, setSetLists] = useState<SetListData[]>([]);
  const [activeSetList, setActiveSetList] = useState<SetListData | null>(null);
  const [participants, setParticipants] = useState<string[]>(['']);
  const [availableSongs, setAvailableSongs] = useState<Song[]>([]);
  const [setListName, setSetListName] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isLeader = user && user.role === '리더';
  
  const [viewMode, setViewMode] = useState<'manage' | 'cards'>(isLeader ? 'manage' : 'cards');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [availableCardDrag, setAvailableCardDrag] = useState<{songId: string, x: number, y: number} | null>(null);
  const [dragStartTimer, setDragStartTimer] = useState<number | null>(null);
  const navigate = useNavigate();

  // 합격곡 데이터 로드
  useEffect(() => {
    const fetchSongs = async () => {
      try {
        const q = query(collection(db, 'approvedSongs'), orderBy('title'));
        const snap = await getDocs(q);
        const songsData = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          members: Array.isArray(doc.data().members) ? doc.data().members : [],
        })) as Song[];
        setSongs(songsData);
      } catch (error) {
        console.error('합격곡 로드 실패:', error);
      }
    };
    fetchSongs();
  }, []);

  // 셋리스트 실시간 업데이트
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'setlists'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const setListsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as SetListData[];
        setSetLists(setListsData);
        
        // 활성화된 셋리스트가 있으면 업데이트
        const activeList = setListsData.find(list => list.isActive);
        setActiveSetList(activeList || null);
        
        // 현재 곡 인덱스 동기화 (Firebase의 currentSongIndex와 로컬 currentCardIndex 동기화)
        if (activeList && typeof activeList.currentSongIndex === 'number') {
          setCurrentCardIndex(activeList.currentSongIndex);
        } else if (activeList && activeList.currentSongIndex === undefined) {
          // 처음 생성된 셋리스트의 경우 currentSongIndex가 없으면 0으로 초기화
          setCurrentCardIndex(0);
        }
        
        // 활성화된 셋리스트의 참가자들을 폼에 자동 반영 (리더만)
        if (isLeader && activeList && activeList.participants.length > 0) {
          // setParticipants는 함수형 업데이트로 현재 상태 확인
          setParticipants(currentParticipants => {
            // 현재 participants가 비어있거나 기본값([''])일 때만 업데이트
            if (currentParticipants.length <= 1 && currentParticipants[0] === '') {
              return [...activeList.participants, ''];
            }
            return currentParticipants;
          });
        }
        
        setLoading(false);
      },
      (error) => {
        console.error('셋리스트 실시간 업데이트 실패:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isLeader]);

  // 참가자 변경 시 사용 가능한 곡 필터링
  useEffect(() => {
        const attendees = participants.map(p => p.trim()).filter(Boolean);
    
    if (attendees.length === 0) {
      setAvailableSongs([]);
      return;
    }

    // 곡의 모든 멤버가 참가자에 포함되어야만 표시 (합격곡 메뉴와 동일한 로직)
    const filtered = songs.filter(song => {
      if (!Array.isArray(song.members) || song.members.length === 0) return false;
      
      // 곡의 모든 멤버가 참가자 목록에 포함되어야 함
      return song.members.every(member => attendees.includes(member.trim()));
    });
     setAvailableSongs(filtered);
   }, [participants, songs]);

  // 리더 여부에 따른 초기 뷰 모드 설정
  useEffect(() => {
    if (!isLeader) {
      setViewMode('cards');
    }
  }, [isLeader]);

  // 현재 카드 인덱스 보정 (곡 개수가 변경될 때)
  useEffect(() => {
    if (activeSetList && currentCardIndex >= activeSetList.songs.length && activeSetList.songs.length > 0) {
      setCurrentCardIndex(activeSetList.songs.length - 1);
    } else if (!activeSetList || activeSetList.songs.length === 0) {
      setCurrentCardIndex(0);
    }
  }, [activeSetList, currentCardIndex]);

  // 전역 마우스 이벤트 리스너 (드래그 중일 때)
  useEffect(() => {
    if (!availableCardDrag) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      setAvailableCardDrag(prev => prev ? {
        ...prev,
        x: e.clientX,
        y: e.clientY
      } : null);
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (!availableCardDrag || !activeSetList) {
        setAvailableCardDrag(null);
        return;
      }

      // 드래그된 위치가 현재 카드 영역 위인지 확인
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      const isOverMainCard = elements.some(el => el.classList.contains('main-card-area'));

      if (isOverMainCard) {
        // 셋리스트에 곡 추가
        const draggedSong = filteredAvailableSongs.find(s => s.id === availableCardDrag.songId);
        if (draggedSong) {
          addSongToSetList(draggedSong);
        }
      }

      setAvailableCardDrag(null);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [availableCardDrag, activeSetList, availableSongs]);

  // 드래그 중일 때 전체 페이지 스크롤 방지
  useEffect(() => {
    if (availableCardDrag) {
      // 드래그 시작 시 body 스크롤 방지
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      
      return () => {
        // 드래그 종료 시 원래 스타일 복원
        document.body.style.overflow = originalStyle;
        document.body.style.touchAction = '';
      };
    }
  }, [availableCardDrag]);

  // 참가자 추가/제거
  const addParticipant = () => {
    setParticipants([...participants, '']);
  };

  const removeParticipant = (index: number) => {
    if (participants.length > 1) {
      setParticipants(participants.filter((_, i) => i !== index));
    }
  };

  const updateParticipant = (index: number, value: string) => {
    const updated = [...participants];
    updated[index] = value;
    setParticipants(updated);
  };

  // 새 셋리스트 생성
  const createSetList = async () => {
    if (!setListName.trim()) {
      alert('셋리스트 이름을 입력해주세요.');
      return;
    }

    const attendees = participants.map(p => p.trim()).filter(Boolean);
    if (attendees.length === 0) {
      alert('참가자를 한 명 이상 추가해주세요.');
      return;
    }

    try {
      // 기존 활성 셋리스트 비활성화
      if (activeSetList) {
        await updateDoc(doc(db, 'setlists', activeSetList.id!), {
          isActive: false,
          updatedAt: Timestamp.now()
        });
      }

      // 참가자에 맞는 사용 가능한 곡들을 자동으로 추가 (모든 멤버가 참가자에 포함되어야 함)
      const availableSongsForParticipants = songs.filter(song => {
        if (!Array.isArray(song.members) || song.members.length === 0) return false;
        return song.members.every(member => attendees.includes(member.trim()));
      });

      const songsToAdd = availableSongsForParticipants.map((song, index) => ({
        songId: song.id,
        title: song.title,
        members: song.members,
        order: index
      }));

      // 새 셋리스트 생성 (사용 가능한 곡들과 함께)
      const newSetList: Omit<SetListData, 'id'> = {
        name: setListName.trim(),
        participants: attendees,
        songs: songsToAdd,
        createdBy: user?.nickname || user?.email || '',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isActive: true,
        currentSongIndex: 0 // 첫 번째 곡부터 시작
      };

      await addDoc(collection(db, 'setlists'), newSetList);
      
      // 폼 초기화
      setSetListName('');
      setParticipants(['']);
      
      alert(`셋리스트가 생성되었습니다! (${songsToAdd.length}곡 자동 추가)`);
    } catch (error) {
      console.error('셋리스트 생성 실패:', error);
      alert('셋리스트 생성에 실패했습니다.');
    }
  };

  // 곡을 셋리스트에 추가
  const addSongToSetList = async (song: Song) => {
    console.log('addSongToSetList called for:', song.title);
    
    if (!activeSetList || !isLeader) {
      console.log('Cannot add song - activeSetList:', !!activeSetList, 'isLeader:', isLeader);
      return;
    }

    // 이미 추가된 곡인지 확인
    const isAlreadyAdded = activeSetList.songs.some(s => s.songId === song.id);
    if (isAlreadyAdded) {
      console.log('Song already added:', song.title);
      alert('이미 셋리스트에 추가된 곡입니다.');
      return;
    }

    const newOrder = activeSetList.songs.length;
    const newSong: SetListItem = {
      songId: song.id,
      title: song.title,
      members: song.members,
      order: newOrder
    };

    const updatedSongs = [...activeSetList.songs, newSong];

    try {
      console.log('Attempting to add song to Firebase...', song.title);
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });
      
      console.log('Song successfully added to Firebase:', song.title);
      
      // 성공 피드백 - 드래그 앤 드롭이 아닌 일반 클릭일 때만 알림
      if (!availableCardDrag) {
        alert(`"${song.title}" 곡이 셋리스트에 추가되었습니다! 🎵`);
      }
    } catch (error) {
      console.error('곡 추가 실패:', error);
      alert('곡 추가에 실패했습니다.');
    }
  };

  // 셋리스트에서 곡 제거
  const removeSongFromSetList = async (songId: string) => {
    if (!activeSetList || !isLeader) return;

    const updatedSongs = activeSetList.songs
      .filter(song => song.songId !== songId)
      .map((song, index) => ({ ...song, order: index }));

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('곡 제거 실패:', error);
      alert('곡 제거에 실패했습니다.');
    }
  };



  // 카드 네비게이션 함수들
  const goToNextCard = () => {
    if (activeSetList && currentCardIndex < activeSetList.songs.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
    }
  };

  const goToPrevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
    }
  };

  const goToCard = (index: number) => {
    if (activeSetList && index >= 0 && index < activeSetList.songs.length) {
      setCurrentCardIndex(index);
    }
  };

  // 현재 곡 완료 처리 (리더만 가능)
  const completeCurrentSong = async () => {
    if (!activeSetList || !isLeader) return;
    
    const nextIndex = (activeSetList.currentSongIndex || 0) + 1;
    const maxIndex = activeSetList.songs.length - 1;
    
    // 마지막 곡이면 완료 메시지 표시
    if ((activeSetList.currentSongIndex || 0) >= maxIndex) {
      alert('🎉 모든 곡이 완료되었습니다! 수고하셨습니다!');
      return;
    }
    
    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        currentSongIndex: nextIndex,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('곡 완료 처리 실패:', error);
      alert('곡 완료 처리에 실패했습니다.');
    }
  };

  // 터치/스와이프 이벤트 처리
  const [touchStart, setTouchStart] = useState<{x: number, y: number} | null>(null);
  const [touchEnd, setTouchEnd] = useState<{x: number, y: number} | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    
    const isLeftSwipe = distanceX > minSwipeDistance;
    const isRightSwipe = distanceX < -minSwipeDistance;
    const isUpSwipe = distanceY > minSwipeDistance;

    // 리더만 위로 스와이프로 다음 곡 진행 가능
    if (isUpSwipe && isLeader && Math.abs(distanceX) < minSwipeDistance) {
      completeCurrentSong();
    } else if (isLeftSwipe && Math.abs(distanceY) < minSwipeDistance) {
      goToNextCard();
    } else if (isRightSwipe && Math.abs(distanceY) < minSwipeDistance) {
      goToPrevCard();
         }
   };

  // 사용 가능한 곡 카드 드래그 핸들러들
  const handleAvailableCardTouchStart = (e: React.TouchEvent, song: Song) => {
    if (!isLeader) return;
    
    console.log('Touch start:', song.title);
    const touch = e.touches[0];
    
    // currentTarget을 미리 저장 (setTimeout에서 사용하기 위해)
    const currentTarget = e.currentTarget;
    
    // 기존 타이머 클리어
    if (dragStartTimer) {
      clearTimeout(dragStartTimer);
    }
    
    // 짧은 지연 후 드래그 시작 (150ms)
    const timer = window.setTimeout(() => {
      console.log('Drag started after delay:', song.title);
      setAvailableCardDrag({
        songId: song.id,
        x: touch.clientX,
        y: touch.clientY
      });
      
      // 클릭 이벤트 방지를 위한 플래그 설정
      if (currentTarget) {
        currentTarget.setAttribute('data-dragging', 'true');
      }
      setDragStartTimer(null);
    }, 150);
    
    setDragStartTimer(timer);
  };

  const handleAvailableCardTouchMove = (e: React.TouchEvent) => {
    if (!availableCardDrag) return;
    
    const touch = e.touches[0];
    setAvailableCardDrag(prev => prev ? {
      ...prev,
      x: touch.clientX,
      y: touch.clientY
    } : null);
  };

  const handleAvailableCardTouchEnd = (e: React.TouchEvent) => {
    console.log('Touch end - availableCardDrag:', availableCardDrag, 'dragStartTimer:', dragStartTimer);
    
    // currentTarget을 미리 저장
    const currentTarget = e.currentTarget;
    
    // 드래그가 시작되기 전에 터치가 끝난 경우 (일반 터치)
    if (dragStartTimer) {
      clearTimeout(dragStartTimer);
      setDragStartTimer(null);
      console.log('Touch ended before drag started - treating as click');
      return; // 클릭 이벤트가 처리됨
    }
    
    if (!availableCardDrag || !activeSetList) {
      setAvailableCardDrag(null);
      // 드래그 플래그 제거
      if (currentTarget) {
        currentTarget.removeAttribute('data-dragging');
      }
      return;
    }

    // 드래그된 위치가 현재 카드 영역 위인지 확인
    const touch = e.changedTouches[0];
    console.log('Touch end coordinates:', touch.clientX, touch.clientY);
    
    const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
    console.log('Elements at touch point:', elements.map(el => el.className));
    
    const isOverMainCard = elements.some(el => el.classList.contains('main-card-area'));
    console.log('Is over main card:', isOverMainCard);

    if (isOverMainCard) {
      // 셋리스트에 곡 추가
      const draggedSong = filteredAvailableSongs.find(s => s.id === availableCardDrag.songId);
      console.log('Dragged song found:', draggedSong?.title);
      if (draggedSong) {
        addSongToSetList(draggedSong);
      }
    }

    setAvailableCardDrag(null);
    
    // 드래그 완료 후 잠시 후 클릭 이벤트 방지 플래그 제거
    setTimeout(() => {
      if (currentTarget) {
        currentTarget.removeAttribute('data-dragging');
      }
    }, 100);
  };

  // 마우스 드래그 핸들러들 (데스크톱용)
  const handleAvailableCardMouseDown = (e: React.MouseEvent, song: Song) => {
    if (!isLeader) return;
    
    setAvailableCardDrag({
      songId: song.id,
      x: e.clientX,
      y: e.clientY
    });
    e.preventDefault();
  };

  const handleAvailableCardMouseMove = (e: React.MouseEvent) => {
    if (!availableCardDrag) return;
    
    setAvailableCardDrag(prev => prev ? {
      ...prev,
      x: e.clientX,
      y: e.clientY
    } : null);
    e.preventDefault();
  };

  const handleAvailableCardMouseUp = (e: React.MouseEvent) => {
    if (!availableCardDrag || !activeSetList) {
      setAvailableCardDrag(null);
      return;
    }

    // 드래그된 위치가 현재 카드 영역 위인지 확인
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    const isOverMainCard = elements.some(el => el.classList.contains('main-card-area'));

    if (isOverMainCard) {
      // 셋리스트에 곡 추가
      const draggedSong = filteredAvailableSongs.find(s => s.id === availableCardDrag.songId);
      if (draggedSong) {
        addSongToSetList(draggedSong);
      }
    }

    setAvailableCardDrag(null);
    e.preventDefault();
  };

  // 셋리스트 삭제
  const deleteSetList = async (setListId: string) => {
    if (!isLeader) return;
    
    if (!window.confirm('정말 이 셋리스트를 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, 'setlists', setListId));
      alert('셋리스트가 삭제되었습니다.');
    } catch (error) {
      console.error('셋리스트 삭제 실패:', error);
      alert('셋리스트 삭제에 실패했습니다.');
    }
  };

  // 셋리스트 활성화
  const activateSetList = async (setList: SetListData) => {
    if (!isLeader) return;

    try {
      // 모든 셋리스트 비활성화
      const batch = setLists.map(list => 
        updateDoc(doc(db, 'setlists', list.id!), {
          isActive: list.id === setList.id,
          updatedAt: Timestamp.now()
        })
      );
      
      await Promise.all(batch);
      
      // 활성화된 셋리스트의 참가자들을 새 셋리스트 만들기 폼에 자동 반영
      setParticipants([...setList.participants, '']); // 마지막에 빈 칸 하나 추가
      
      alert(`"${setList.name}" 셋리스트가 활성화되었습니다.`);
    } catch (error) {
      console.error('셋리스트 활성화 실패:', error);
      alert('셋리스트 활성화에 실패했습니다.');
    }
  };

  // 검색된 사용 가능한 곡들
  const filteredAvailableSongs = availableSongs.filter(song =>
    song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    song.members.some(member => member.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div>로딩 중...</div>
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          @keyframes shimmer {
            0% { box-shadow: 0 20px 40px rgba(138, 85, 204, 0.3); }
            50% { box-shadow: 0 25px 50px rgba(138, 85, 204, 0.5); }
            100% { box-shadow: 0 20px 40px rgba(138, 85, 204, 0.3); }
          }
          
          @keyframes shine {
            0% { transform: translateX(-200%) rotate(45deg); }
            100% { transform: translateX(200%) rotate(45deg); }
          }
          
          @keyframes pulse {
            0% { transform: translateX(-50%) scale(1); }
            50% { transform: translateX(-50%) scale(1.05); }
            100% { transform: translateX(-50%) scale(1); }
          }
        `}
      </style>
      
      {/* 드래그 중인 카드 플로팅 */}
      {availableCardDrag && (
        <div
          style={{
            position: 'fixed',
            left: availableCardDrag.x - 100,
            top: availableCardDrag.y - 60,
            width: '200px',
            height: '120px',
            background: 'linear-gradient(135deg, #E5DAF5 0%, #F3E8FF 100%)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
            pointerEvents: 'none',
            transform: 'scale(1.1) rotate(5deg)',
            boxShadow: '0 20px 40px rgba(138, 85, 204, 0.6)',
            opacity: 0.9
          }}
        >
          {(() => {
            const draggedSong = availableSongs.find(s => s.id === availableCardDrag.songId);
            return draggedSong ? (
              <>
                <div style={{ fontSize: '20px', marginBottom: '8px', color: '#8A55CC' }}>♪</div>
                <h4 style={{ 
                  fontSize: '14px', 
                  fontWeight: 600, 
                  marginBottom: '6px',
                  textAlign: 'center',
                  color: '#7C4DBC',
                  margin: '0 0 6px 0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%'
                }}>
                  {draggedSong.title}
                </h4>
                <p style={{ 
                  fontSize: '12px', 
                  textAlign: 'center',
                  color: '#666',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%'
                }}>
                  {draggedSong.members.join(', ')}
                </p>
              </>
            ) : null;
          })()}
        </div>
      )}
      
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#8A55CC', fontWeight: 700, fontSize: '28px', margin: 0 }}>
          🎵 {isLeader ? (viewMode === 'manage' ? '셋리스트 관리' : '셋리스트 카드') : '셋리스트 카드'}
        </h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isLeader && activeSetList && (
            <button 
              onClick={() => setViewMode(viewMode === 'manage' ? 'cards' : 'manage')}
              style={{ 
                background: viewMode === 'cards' ? '#8A55CC' : '#E5DAF5', 
                color: viewMode === 'cards' ? '#fff' : '#7C4DBC', 
                border: 'none', 
                borderRadius: '8px', 
                padding: '8px 16px', 
                fontWeight: 600, 
                cursor: 'pointer' 
              }}
            >
              {viewMode === 'manage' ? '🎴 카드 보기' : '⚙️ 관리'}
            </button>
          )}
          <button 
            onClick={() => navigate('/')}
            style={{ 
              background: '#E5DAF5', 
              color: '#7C4DBC', 
              border: 'none', 
              borderRadius: '8px', 
              padding: '8px 16px', 
              fontWeight: 600, 
              cursor: 'pointer' 
            }}
          >
            홈으로
          </button>
        </div>
      </div>

      {/* 카드 뷰 모드 */}
      {viewMode === 'cards' && (
        activeSetList ? (
        <div style={{ 
          background: '#fff', 
          borderRadius: '12px', 
          padding: '20px', 
          marginBottom: '30px',
          boxShadow: '0 4px 16px rgba(138, 85, 204, 0.1)',
          minHeight: '400px'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h2 style={{ color: '#8A55CC', fontSize: '22px', marginBottom: '8px' }}>
              🎭 {activeSetList.name}
            </h2>
            <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
              {(activeSetList.currentSongIndex ?? currentCardIndex) + 1} / {activeSetList.songs.length} 곡
            </p>
          </div>

          {activeSetList.songs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#666', fontSize: '18px', padding: '60px 0' }}>
              아직 곡이 추가되지 않았습니다.
            </div>
          ) : (
            <div 
              style={{ 
                position: 'relative', 
                height: '350px', 
                overflow: 'hidden',
                border: availableCardDrag ? '3px dashed #8A55CC' : 'none',
                borderRadius: availableCardDrag ? '16px' : '0',
                background: availableCardDrag ? 'rgba(138, 85, 204, 0.05)' : 'transparent',
                transition: 'all 0.2s ease',
                touchAction: 'pan-y'
              }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              className="main-card-area"
            >
              {/* 드래그 중일 때 드롭 안내 */}
              {availableCardDrag && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'rgba(138, 85, 204, 0.9)',
                  color: '#fff',
                  padding: '20px 30px',
                  borderRadius: '16px',
                  fontSize: '18px',
                  fontWeight: 600,
                  zIndex: 100,
                  textAlign: 'center',
                  boxShadow: '0 10px 30px rgba(138, 85, 204, 0.3)',
                  animation: 'pulse 1.5s infinite'
                }}>
                  📀 여기로 드래그하여 셋리스트에 추가
                </div>
              )}
              
              {/* 현재 카드 */}
              {activeSetList.songs
                .sort((a, b) => a.order - b.order)
                .map((song, index) => {
                  const currentIndex = activeSetList.currentSongIndex ?? currentCardIndex;
                  const isCurrentCard = index === currentIndex;
                  const isNextCard = index === currentIndex + 1;
                  const isPrevCard = index === currentIndex - 1;
                  const isVisible = isCurrentCard || isNextCard || isPrevCard;

                  if (!isVisible) return null;

                  const offset = (index - currentCardIndex) * 100;

                  return (
                    <div
                      key={song.songId}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: `${offset}%`,
                        width: '100%',
                        height: '100%',
                        transition: 'all 0.3s ease',
                        transform: isCurrentCard ? 'scale(1)' : 'scale(0.9)',
                        opacity: isCurrentCard ? 1 : 0.5,
                      }}
                    >
                      <div
                        style={{
                          background: isCurrentCard ? 
                            'linear-gradient(135deg, #8A55CC 0%, #A855F7 100%)' : 
                            'linear-gradient(135deg, #E5DAF5 0%, #F3E8FF 100%)',
                          borderRadius: '16px',
                          padding: '40px',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          position: 'relative',
                          overflow: 'hidden',
                          boxShadow: isCurrentCard ? 
                            '0 20px 40px rgba(138, 85, 204, 0.3)' : 
                            '0 10px 20px rgba(138, 85, 204, 0.1)',
                          animation: isCurrentCard ? 'shimmer 2s infinite' : 'none',
                        }}
                      >
                        {/* 빛나는 효과 */}
                        {isCurrentCard && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '-50%',
                              left: '-50%',
                              width: '200%',
                              height: '200%',
                              background: 'linear-gradient(45deg, transparent, rgba(255,255,255,0.3), transparent)',
                              transform: 'rotate(45deg)',
                              animation: 'shine 2s infinite',
                            }}
                          />
                        )}

                        <div style={{ 
                          fontSize: '48px', 
                          marginBottom: '20px',
                          color: isCurrentCard ? '#fff' : '#8A55CC'
                        }}>
                          {index + 1}
                        </div>
                        
                        <h3 style={{ 
                          fontSize: '24px', 
                          fontWeight: 700, 
                          marginBottom: '16px',
                          textAlign: 'center',
                          color: isCurrentCard ? '#fff' : '#8A55CC'
                        }}>
                          {song.title}
                        </h3>
                        
                        <p style={{ 
                          fontSize: '16px', 
                          marginBottom: isCurrentCard ? '40px' : '20px',
                          textAlign: 'center',
                          color: isCurrentCard ? 'rgba(255,255,255,0.9)' : '#666'
                        }}>
                          {song.members.join(', ')}
                        </p>

                        {/* 현재 곡에서 다음 곡 안내 메시지 */}
                        {isCurrentCard && currentIndex < activeSetList.songs.length - 1 && (
                          <div style={{
                            position: 'absolute',
                            bottom: isLeader ? '60px' : '20px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: '#10B981',
                            color: '#fff',
                            padding: '12px 20px',
                            borderRadius: '20px',
                            fontSize: '14px',
                            fontWeight: 600,
                            animation: 'pulse 1.5s infinite',
                            whiteSpace: 'nowrap',
                            zIndex: 100,
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
                          }}>
                            🎤 다음: {activeSetList.songs.sort((a, b) => a.order - b.order)[currentIndex + 1]?.title} - 무대준비해주세요
                          </div>
                        )}

                        {/* 리더에게만 위로 스와이프 안내 */}
                        {isCurrentCard && isLeader && currentIndex < activeSetList.songs.length - 1 && (
                          <div style={{
                            position: 'absolute',
                            bottom: '20px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: '#8A55CC',
                            color: '#fff',
                            padding: '8px 16px',
                            borderRadius: '16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            zIndex: 100,
                            boxShadow: '0 4px 12px rgba(138, 85, 204, 0.4)',
                            opacity: 0.9
                          }}>
                            ↑ 위로 스와이프하여 다음 곡 진행
                          </div>
                        )}

                        {/* 마지막 곡일 때 완료 메시지 */}
                        {isCurrentCard && currentIndex === activeSetList.songs.length - 1 && (
                          <div style={{
                            position: 'absolute',
                            bottom: isLeader ? '60px' : '20px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: '#F59E0B',
                            color: '#fff',
                            padding: '12px 20px',
                            borderRadius: '20px',
                            fontSize: '14px',
                            fontWeight: 600,
                            animation: 'pulse 1.5s infinite',
                            whiteSpace: 'nowrap',
                            zIndex: 100,
                            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
                          }}>
                            🎉 마지막 곡입니다. 수고하셨습니다!
                          </div>
                        )}

                        {/* 마지막 곡에서 리더에게만 완료 안내 */}
                        {isCurrentCard && isLeader && currentIndex === activeSetList.songs.length - 1 && (
                          <div style={{
                            position: 'absolute',
                            bottom: '20px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: '#8A55CC',
                            color: '#fff',
                            padding: '8px 16px',
                            borderRadius: '16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            zIndex: 100,
                            boxShadow: '0 4px 12px rgba(138, 85, 204, 0.4)',
                            opacity: 0.9
                          }}>
                            ↑ 위로 스와이프하여 공연 완료
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

              {/* 네비게이션 버튼 */}
              {/* 네비게이션 버튼들은 리더가 아닐 때만 표시 (리더는 스와이프로 제어) */}
              {!isLeader && (
                <>
                  <button
                    onClick={goToPrevCard}
                    disabled={(activeSetList.currentSongIndex ?? currentCardIndex) === 0}
                    style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: (activeSetList.currentSongIndex ?? currentCardIndex) === 0 ? '#ccc' : '#8A55CC',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '50px',
                      height: '50px',
                      fontSize: '24px',
                      cursor: (activeSetList.currentSongIndex ?? currentCardIndex) === 0 ? 'not-allowed' : 'pointer',
                      zIndex: 10,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    }}
                  >
                    ‹
                  </button>

                  <button
                    onClick={goToNextCard}
                    disabled={(activeSetList.currentSongIndex ?? currentCardIndex) === activeSetList.songs.length - 1}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: (activeSetList.currentSongIndex ?? currentCardIndex) === activeSetList.songs.length - 1 ? '#ccc' : '#8A55CC',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '50px',
                      height: '50px',
                      fontSize: '24px',
                      cursor: (activeSetList.currentSongIndex ?? currentCardIndex) === activeSetList.songs.length - 1 ? 'not-allowed' : 'pointer',
                      zIndex: 10,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    }}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
          )}

          {/* 하단 도트 인디케이터 */}
          {activeSetList.songs.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
              {activeSetList.songs.map((_, index) => {
                const currentIndex = activeSetList.currentSongIndex ?? currentCardIndex;
                return (
                  <button
                    key={index}
                    onClick={() => goToCard(index)}
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      border: 'none',
                      background: index === currentIndex ? '#8A55CC' : '#E5DAF5',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* 리더만 사용 가능한 곡 카드들 */}
          {isLeader && (
            <div style={{ marginTop: '30px' }}>
              <h3 style={{ color: '#8A55CC', fontSize: '18px', marginBottom: '12px', textAlign: 'center' }}>
                사용 가능한 곡
              </h3>
              <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px', textAlign: 'center', margin: '0 0 16px 0' }}>
                💡 카드를 위쪽 메인 카드로 드래그하여 셋리스트에 추가하세요
              </p>
              
              <div style={{ 
                display: 'flex', 
                overflowX: 'auto', 
                gap: '12px', 
                padding: '10px 0',
                scrollbarWidth: 'thin',
                scrollbarColor: '#E5DAF5 transparent',
                touchAction: availableCardDrag ? 'none' : 'pan-x'
              }}>
                {filteredAvailableSongs.length === 0 ? (
                  <div style={{ 
                    width: '100%', 
                    padding: '40px 20px', 
                    textAlign: 'center', 
                    color: '#666',
                    background: '#F8F9FA',
                    borderRadius: '12px'
                  }}>
                    사용 가능한 곡이 없습니다.
                  </div>
                ) : (
                  filteredAvailableSongs.map((song) => {
                    const isAlreadyAdded = activeSetList.songs.some(s => s.songId === song.id);
                    const isDragging = availableCardDrag?.songId === song.id;
                    
                    return (
                      <div
                        key={song.id}
                        onTouchStart={(e) => handleAvailableCardTouchStart(e, song)}
                        onTouchMove={handleAvailableCardTouchMove}
                        onTouchEnd={handleAvailableCardTouchEnd}
                        onMouseDown={(e) => handleAvailableCardMouseDown(e, song)}
                        onClick={(e) => {
                          // 드래그 중이었다면 클릭 이벤트 무시
                          if (e.currentTarget.getAttribute('data-dragging') === 'true') {
                            console.log('Click ignored - was dragging');
                            return;
                          }
                          
                          console.log('Card clicked:', song.title);
                          if (!isAlreadyAdded) {
                            addSongToSetList(song);
                          }
                        }}
                        style={{
                          minWidth: '200px',
                          height: '120px',
                          background: isAlreadyAdded ? 
                            'linear-gradient(135deg, #E5E7EB 0%, #F3F4F6 100%)' :
                            'linear-gradient(135deg, #E5DAF5 0%, #F3E8FF 100%)',
                          borderRadius: '12px',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          position: 'relative',
                          cursor: isAlreadyAdded ? 'not-allowed' : 'pointer',
                          transition: isDragging ? 'none' : 'all 0.2s ease',
                          transform: isDragging ? 'scale(1.1) rotate(5deg)' : 'scale(1)',
                          boxShadow: isDragging ? 
                            '0 20px 40px rgba(138, 85, 204, 0.4)' :
                            isAlreadyAdded ? 
                              '0 4px 12px rgba(0,0,0,0.1)' : 
                              '0 4px 12px rgba(138, 85, 204, 0.2)',
                          opacity: isAlreadyAdded ? 0.6 : isDragging ? 0.3 : 1,
                          zIndex: isDragging ? 1000 : 1,
                          pointerEvents: isDragging ? 'none' : 'auto',
                          touchAction: 'none',
                          userSelect: 'none'
                        }}
                      >
                        {/* 곡 번호 또는 상태 아이콘 */}
                        <div style={{ 
                          fontSize: '20px', 
                          marginBottom: '8px',
                          color: isAlreadyAdded ? '#9CA3AF' : '#8A55CC'
                        }}>
                          {isAlreadyAdded ? '✓' : '♪'}
                        </div>
                        
                        {/* 곡 제목 */}
                        <h4 style={{ 
                          fontSize: '14px', 
                          fontWeight: 600, 
                          marginBottom: '6px',
                          textAlign: 'center',
                          color: isAlreadyAdded ? '#9CA3AF' : '#7C4DBC',
                          margin: '0 0 6px 0',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '100%'
                        }}>
                          {song.title}
                        </h4>
                        
                        {/* 참가자 */}
                        <p style={{ 
                          fontSize: '12px', 
                          textAlign: 'center',
                          color: isAlreadyAdded ? '#9CA3AF' : '#666',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '100%'
                        }}>
                          {song.members.join(', ')}
                        </p>

                        {/* 추가됨 표시 */}
                        {isAlreadyAdded && (
                          <div style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            background: '#9CA3AF',
                            color: '#fff',
                            padding: '2px 6px',
                            borderRadius: '8px',
                            fontSize: '10px',
                            fontWeight: 600
                          }}>
                            추가됨
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
        ) : (
          <div style={{ 
            background: '#fff', 
            borderRadius: '12px', 
            padding: '40px', 
            marginBottom: '30px',
            boxShadow: '0 4px 16px rgba(138, 85, 204, 0.1)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎵</div>
            <h2 style={{ color: '#8A55CC', fontSize: '22px', marginBottom: '12px' }}>
              활성 셋리스트가 없습니다
            </h2>
            <p style={{ color: '#666', fontSize: '16px', marginBottom: '20px' }}>
              리더가 셋리스트를 활성화하면 카드를 확인할 수 있습니다.
            </p>
            {isLeader && (
              <p style={{ color: '#8A55CC', fontSize: '14px' }}>
                💡 관리 모드에서 셋리스트를 생성하고 활성화해보세요!
              </p>
            )}
          </div>
        )
      )}

      {/* 리더만 셋리스트 생성 가능 */}
      {viewMode === 'manage' && isLeader && (
        <div style={{ 
          background: '#F6F2FF', 
          borderRadius: '12px', 
          padding: '20px', 
          marginBottom: '30px' 
        }}>
          <h2 style={{ color: '#8A55CC', fontSize: '20px', marginBottom: '16px' }}>새 셋리스트 만들기</h2>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>셋리스트 이름</label>
            <input
              type="text"
              value={setListName}
              onChange={(e) => setSetListName(e.target.value)}
              placeholder="예: 2024년 12월 버스킹"
              style={{ 
                width: '100%', 
                padding: '8px', 
                borderRadius: '8px', 
                border: '1px solid #E5DAF5',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>참가자</label>
            {participants.map((participant, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  value={participant}
                  onChange={(e) => updateParticipant(index, e.target.value)}
                  placeholder={`참가자 ${index + 1}`}
                  style={{ 
                    flex: 1, 
                    padding: '8px', 
                    borderRadius: '8px', 
                    border: '1px solid #E5DAF5' 
                  }}
                />
                {participants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeParticipant(index)}
                    style={{ 
                      background: '#F43F5E', 
                      color: '#fff', 
                      border: 'none', 
                      borderRadius: '8px', 
                      padding: '8px 12px', 
                      fontWeight: 600, 
                      cursor: 'pointer' 
                    }}
                  >
                    삭제
                  </button>
                )}
                {index === participants.length - 1 && (
                  <button
                    type="button"
                    onClick={addParticipant}
                    style={{ 
                      background: '#8A55CC', 
                      color: '#fff', 
                      border: 'none', 
                      borderRadius: '8px', 
                      padding: '8px 12px', 
                      fontWeight: 600, 
                      cursor: 'pointer' 
                    }}
                  >
                    추가
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={createSetList}
            style={{ 
              background: '#8A55CC', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '8px', 
              padding: '12px 24px', 
              fontWeight: 600, 
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            셋리스트 생성
          </button>
        </div>
      )}

      {/* 활성 셋리스트 표시 */}
      {viewMode === 'manage' && activeSetList && (
        <div style={{ 
          background: '#fff', 
          borderRadius: '12px', 
          padding: '20px', 
          marginBottom: '30px',
          boxShadow: '0 4px 16px rgba(138, 85, 204, 0.1)'
        }}>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ color: '#8A55CC', fontSize: '22px', marginBottom: '12px' }}>
              🎭 현재 활성 셋리스트: {activeSetList.name}
            </h2>
            <div style={{ marginBottom: '8px' }}>
              <strong>참가자:</strong> {activeSetList.participants.join(', ')}
            </div>
            <div>
              <strong>생성자:</strong> {activeSetList.createdBy}
            </div>
          </div>



                      {/* 셋리스트 곡 순서 */}
          <div>
            <h3 style={{ color: '#8A55CC', fontSize: '18px', marginBottom: '8px' }}>
              셋리스트 ({activeSetList.songs.length}곡)
            </h3>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px', margin: 0 }}>
              💡 카드보기 탭에서 순서 변경 및 곡 추가가 가능합니다
            </p>
            
            {activeSetList.songs.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                {isLeader ? '위에서 곡을 추가해보세요!' : '아직 곡이 추가되지 않았습니다.'}
              </div>
            ) : (
              <div style={{ border: '1px solid #E5DAF5', borderRadius: '8px' }}>
                {activeSetList.songs
                  .sort((a, b) => a.order - b.order)
                  .map((song, index) => (
                    <div 
                      key={song.songId} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        padding: '12px',
                        borderBottom: index < activeSetList.songs.length - 1 ? '1px solid #F0F0F0' : 'none',
                        backgroundColor: '#FFFFFF',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ 
                        width: '30px', 
                        height: '30px', 
                        background: '#8A55CC', 
                        color: '#fff', 
                        borderRadius: '50%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontWeight: 600,
                        marginRight: '12px'
                      }}>
                        {index + 1}
                      </div>
                      
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: '#7C4DBC' }}>{song.title}</div>
                        <div style={{ color: '#666', fontSize: '14px' }}>{song.members.join(', ')}</div>
                      </div>
                      
                      {isLeader && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => removeSongFromSetList(song.songId)}
                            style={{ 
                              background: '#EF4444', 
                              color: '#fff', 
                              border: 'none', 
                              borderRadius: '6px', 
                              padding: '6px 10px', 
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: 600
                            }}
                          >
                            제거
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 모든 셋리스트 목록 */}
      {viewMode === 'manage' && (
      <div>
        <h2 style={{ color: '#8A55CC', fontSize: '22px', marginBottom: '16px' }}>전체 셋리스트</h2>
        {setLists.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            생성된 셋리스트가 없습니다.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {setLists.map((setList) => (
              <div
                key={setList.id}
                style={{ 
                  background: '#fff', 
                  borderRadius: '12px', 
                  padding: '16px',
                  boxShadow: '0 4px 16px rgba(138, 85, 204, 0.1)',
                  border: setList.isActive ? '2px solid #8A55CC' : '1px solid #E5DAF5'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ color: '#8A55CC', fontSize: '18px', margin: 0 }}>{setList.name}</h3>
                  {setList.isActive && (
                    <span style={{ 
                      background: '#10B981', 
                      color: '#fff', 
                      padding: '4px 8px', 
                      borderRadius: '12px', 
                      fontSize: '12px',
                      fontWeight: 600
                    }}>
                      활성
                    </span>
                  )}
                </div>
                
                <div style={{ marginBottom: '8px' }}>
                  <strong>참가자:</strong> {setList.participants.join(', ')}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>곡 수:</strong> {setList.songs.length}곡
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <strong>생성자:</strong> {setList.createdBy}
                </div>
                
                {isLeader && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!setList.isActive && (
                      <button
                        onClick={() => activateSetList(setList)}
                        style={{ 
                          background: '#10B981', 
                          color: '#fff', 
                          border: 'none', 
                          borderRadius: '8px', 
                          padding: '6px 12px', 
                          fontWeight: 600, 
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        활성화
                      </button>
                    )}
                    <button
                      onClick={() => deleteSetList(setList.id!)}
                      style={{ 
                        background: '#EF4444', 
                        color: '#fff', 
                        border: 'none', 
                        borderRadius: '8px', 
                        padding: '6px 12px', 
                        fontWeight: 600, 
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
    </>
  );
};

export default SetList; 