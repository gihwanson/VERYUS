import React, { useState, useEffect, useCallback } from 'react';
import { 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  Timestamp, 
  collection,
  getDocs 
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useSetListData } from './hooks/useSetListData';
import StatsModal from './components/StatsModal';
import type { SetListData, SetListItem, FlexibleCard, FlexibleSlot, SetListEntry } from './types';

interface UserInfo {
  uid: string;
  nickname: string;
  email: string;
  grade: string;
  role: string;
}

interface ParticipantStats {
  nickname: string;
  songCount: number;
  grade: string;
  role: string;
}

const SetListManager: React.FC = () => {
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isLeader = user && user.role === '리더';
  const currentUserNickname = user?.nickname || '';
  
  const { songs, setLists, activeSetList } = useSetListData();
  const [participants, setParticipants] = useState<string[]>(['']);
  const [setListName, setSetListName] = useState('');
  const [draggedItem, setDraggedItem] = useState<SetListEntry | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number>(-1);
  const [touchStart, setTouchStart] = useState<{ y: number; itemIndex: number } | null>(null);
  const [touchDragOffset, setTouchDragOffset] = useState<number>(0);
  const [userStats, setUserStats] = useState<ParticipantStats[]>([]);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [availableSongs, setAvailableSongs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [slotSearchTerm, setSlotSearchTerm] = useState(''); // 슬롯 편집용 검색어
  
  // 유연한 카드 생성 관련 상태
  const [showFlexibleCardForm, setShowFlexibleCardForm] = useState(false);
  const [flexibleCardNickname, setFlexibleCardNickname] = useState('');
  const [flexibleCardCount, setFlexibleCardCount] = useState(3);
  
  // 유연한 카드 편집 관련 상태
  const [editingFlexibleCard, setEditingFlexibleCard] = useState<FlexibleCard | null>(null);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number>(-1);
  const [currentEditingSlot, setCurrentEditingSlot] = useState<FlexibleSlot | null>(null);
  const [newParticipantName, setNewParticipantName] = useState('');

  // 등급 정보
  const gradeOptions = [
    '🍒', // 체리
    '🫐', // 블루베리
    '🥝', // 키위
    '🍎', // 사과
    '🍈', // 멜론
    '🍉', // 수박
    '🌍', // 지구
    '🪐', // 토성
    '☀️', // 태양
    '🌌', // 은하
    '🌙', // 달
  ];

  const gradeNames: { [key: string]: string } = {
    '🍒': '체리',
    '🫐': '블루베리',
    '🥝': '키위',
    '🍎': '사과',
    '🍈': '멜론',
    '🍉': '수박',
    '🌍': '지구',
    '🪐': '토성',
    '☀️': '태양',
    '🌌': '은하',
    '🌙': '달',
    '👤': '게스트'
  };

  // 타입 가드 함수들
  const isSetListItem = (entry: SetListEntry): entry is SetListItem => {
    return 'songId' in entry;
  };

  const isFlexibleCard = (entry: SetListEntry): entry is FlexibleCard => {
    return 'type' in entry && entry.type === 'flexible';
  };

  // 활성화된 셋리스트의 참가자들을 폼에 자동 반영 (리더만)
  useEffect(() => {
    if (isLeader && activeSetList && activeSetList.participants.length > 0) {
      setParticipants((currentParticipants: string[]) => {
        if (currentParticipants.length <= 1 && currentParticipants[0] === '') {
          return [...activeSetList.participants, ''];
        }
        return currentParticipants;
      });
    }
  }, [isLeader, activeSetList]);

  // 드래그 중일 때 페이지 스크롤 방지
  useEffect(() => {
    if (draggedItem) {
      const originalStyle = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      
      return () => {
        document.body.style.overflow = originalStyle;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [draggedItem]);

  // 사용자 정보 가져오기
  useEffect(() => {
    fetchUsers();
  }, []);

  // 활성 셋리스트 변경 시 통계 업데이트
  useEffect(() => {
    if (activeSetList && allUsers.length > 0) {
      calculateParticipantStats();
    }
  }, [activeSetList, allUsers]);

  // 활성 셋리스트의 참가자에 맞는 사용 가능한 곡 필터링
  useEffect(() => {
    if (activeSetList && songs.length > 0) {
      const attendees = activeSetList.participants;
      
      const filtered = songs.filter(song => {
        if (!Array.isArray(song.members) || song.members.length === 0) return false;
        return song.members.every(member => attendees.includes(member.trim()));
      });
      setAvailableSongs(filtered);
    } else {
      setAvailableSongs([]);
    }
  }, [activeSetList, songs]);

  // 유연한 카드 편집 권한 체크 함수
  const canEditFlexibleCard = useCallback((card: FlexibleCard) => {
    return isLeader || card.nickname === currentUserNickname;
  }, [isLeader, currentUserNickname]);

  // 전체 항목들 (곡 + 유연한 카드) 가져오기 및 정렬 (셋리스트에 추가된 것만)
  const getAllItems = useCallback(() => {
    if (!activeSetList) return [];
    
    const songs = activeSetList.songs.map(song => ({ ...song, type: 'song' as const }));
    const flexCards = (activeSetList.flexibleCards || [])
      .filter(card => card.order >= 0) // order가 0 이상인 카드만 셋리스트에 표시
      .map(card => ({ ...card, type: 'flexible' as const }));
    
    return [...songs, ...flexCards].sort((a, b) => a.order - b.order);
  }, [activeSetList]);

  // 셋리스트에 추가되지 않은 유연한 카드들 가져오기
  const getAvailableFlexibleCards = useCallback(() => {
    if (!activeSetList) return [];
    
    return (activeSetList.flexibleCards || []).filter(card => card.order < 0);
  }, [activeSetList]);

  // 유연한 카드 생성 함수
  const createFlexibleCard = useCallback(async () => {
    if (!activeSetList || !isLeader || !flexibleCardNickname.trim()) return;
    
    const newFlexibleCard: FlexibleCard = {
      id: `flexible_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'flexible',
      nickname: flexibleCardNickname.trim(),
      totalSlots: flexibleCardCount,
      slots: Array.from({ length: flexibleCardCount }, (_, index) => ({
        id: `slot_${Date.now()}_${index}`,
        type: 'empty',
        members: [],
        isCompleted: false
      })),
      order: -1, // 셋리스트에 표시되지 않도록 -1로 설정
    };

    const existingFlexibleCards = activeSetList.flexibleCards || [];
    const updatedFlexibleCards = [...existingFlexibleCards, newFlexibleCard];

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        flexibleCards: updatedFlexibleCards,
        updatedAt: Timestamp.now()
      });
      
      alert(`"${flexibleCardNickname} ${flexibleCardCount}곡" 카드가 생성되었습니다! 🎵`);
      setFlexibleCardNickname('');
      setFlexibleCardCount(3);
      setShowFlexibleCardForm(false);
    } catch (error) {
      console.error('유연한 카드 생성 실패:', error);
      alert('카드 생성에 실패했습니다.');
    }
  }, [activeSetList, isLeader, flexibleCardNickname, flexibleCardCount, getAllItems]);

  // 유연한 카드 삭제 함수
  const deleteFlexibleCard = useCallback(async (cardId: string) => {
    if (!activeSetList || !isLeader) return;

    const cardToDelete = activeSetList.flexibleCards?.find(card => card.id === cardId);
    if (!cardToDelete || !canEditFlexibleCard(cardToDelete)) return;

    if (!window.confirm(`"${cardToDelete.nickname} ${cardToDelete.totalSlots}곡" 카드를 삭제하시겠습니까?`)) return;

    const updatedFlexibleCards = (activeSetList.flexibleCards || []).filter(card => card.id !== cardId);

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        flexibleCards: updatedFlexibleCards,
        updatedAt: Timestamp.now()
      });
      
      alert('카드가 삭제되었습니다.');
    } catch (error) {
      console.error('유연한 카드 삭제 실패:', error);
      alert('카드 삭제에 실패했습니다.');
    }
  }, [activeSetList, isLeader, canEditFlexibleCard]);

  // 유연한 카드를 셋리스트에 추가하는 함수
  const addFlexibleCardToSetList = useCallback(async (cardId: string) => {
    if (!activeSetList || !isLeader) return;

    const cardToAdd = activeSetList.flexibleCards?.find(card => card.id === cardId);
    if (!cardToAdd || cardToAdd.order >= 0) return;

    // 새로운 order 값 설정 (셋리스트 마지막에 추가)
    const newOrder = getAllItems().length;

    const updatedFlexibleCards = (activeSetList.flexibleCards || []).map(card => 
      card.id === cardId ? { ...card, order: newOrder } : card
    );

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        flexibleCards: updatedFlexibleCards,
        updatedAt: Timestamp.now()
      });
      
      alert(`"${cardToAdd.nickname} ${cardToAdd.totalSlots}곡" 카드가 셋리스트에 추가되었습니다! 🎵`);
    } catch (error) {
      console.error('유연한 카드 셋리스트 추가 실패:', error);
      alert('카드 추가에 실패했습니다.');
    }
  }, [activeSetList, isLeader, getAllItems]);

  // 유연한 카드 완료 처리 함수
  const completeFlexibleCard = useCallback(async (cardId: string) => {
    if (!activeSetList || !isLeader) return;

    const cardToComplete = activeSetList.flexibleCards?.find(card => card.id === cardId);
    if (!cardToComplete) return;

    if (!window.confirm(`"${cardToComplete.nickname} ${cardToComplete.totalSlots}곡" 카드를 완료 처리하시겠습니까?`)) return;

    // 완료된 카드를 completedFlexibleCards에 추가 (완료 시간 포함)
    const completedCard = {
      ...cardToComplete,
      completedAt: Timestamp.now()
    };
    
    const existingCompletedCards = activeSetList.completedFlexibleCards || [];
    const updatedCompletedCards = [...existingCompletedCards, completedCard];

    // 셋리스트에서 해당 카드 제거 (order를 -1로 변경)
    const updatedFlexibleCards = (activeSetList.flexibleCards || []).map(card => 
      card.id === cardId ? { ...card, order: -1 } : card
    );

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        flexibleCards: updatedFlexibleCards,
        completedFlexibleCards: updatedCompletedCards,
        updatedAt: Timestamp.now()
      });
      
      alert(`🎤 "${cardToComplete.nickname} ${cardToComplete.totalSlots}곡" 카드가 완료되었습니다!`);
    } catch (error) {
      console.error('유연한 카드 완료 처리 실패:', error);
      alert('카드 완료 처리에 실패했습니다.');
    }
  }, [activeSetList, isLeader]);

  // 유연한 카드의 슬롯 업데이트 함수
  const updateFlexibleCardSlot = useCallback(async (cardId: string, slotIndex: number, updatedSlot: FlexibleSlot) => {
    if (!activeSetList) {
      console.error('activeSetList가 없습니다');
      return;
    }

    const cardToUpdate = activeSetList.flexibleCards?.find(card => card.id === cardId);
    if (!cardToUpdate) {
      console.error('업데이트할 카드를 찾을 수 없습니다:', cardId);
      return;
    }
    
    if (!canEditFlexibleCard(cardToUpdate)) {
      console.error('카드 편집 권한이 없습니다');
      return;
    }

    console.log('슬롯 업데이트 시작:', {
      cardId,
      slotIndex,
      updatedSlot,
      originalSlot: cardToUpdate.slots[slotIndex]
    });

    const updatedSlots = [...cardToUpdate.slots];
    updatedSlots[slotIndex] = { ...updatedSlot };

    const updatedCard = { ...cardToUpdate, slots: updatedSlots };
    const updatedFlexibleCards = (activeSetList.flexibleCards || []).map(card => 
      card.id === cardId ? updatedCard : card
    );

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        flexibleCards: updatedFlexibleCards,
        updatedAt: Timestamp.now()
      });
      console.log('슬롯 업데이트 성공');
    } catch (error) {
      console.error('슬롯 업데이트 실패:', error);
      alert('슬롯 업데이트에 실패했습니다.');
      throw error;
    }
  }, [activeSetList, canEditFlexibleCard]);

  // 슬롯 참여자 추가 함수 (카드탭과 동일)
  const addSlotParticipant = useCallback(() => {
    if (!editingFlexibleCard || !newParticipantName.trim() || editingSlotIndex < 0) return;

    const currentSlot = currentEditingSlot || editingFlexibleCard.slots[editingSlotIndex];
    const trimmedName = newParticipantName.trim();
    
    // 이미 존재하는 참여자인지 확인
    if (currentSlot.members.includes(trimmedName)) {
      alert('이미 추가된 참여자입니다.');
      return;
    }

    const updatedSlot: FlexibleSlot = {
      ...currentSlot,
      members: [...currentSlot.members, trimmedName]
    };

    setCurrentEditingSlot(updatedSlot);
    setNewParticipantName('');
    updateFlexibleCardSlot(editingFlexibleCard.id, editingSlotIndex, updatedSlot);
  }, [editingFlexibleCard, newParticipantName, editingSlotIndex, currentEditingSlot, updateFlexibleCardSlot]);

  // 슬롯 참여자 제거 함수 (카드탭과 동일)
  const removeSlotParticipant = useCallback((participantToRemove: string) => {
    if (!editingFlexibleCard || editingSlotIndex < 0) return;

    const currentSlot = currentEditingSlot || editingFlexibleCard.slots[editingSlotIndex];
    const updatedSlot: FlexibleSlot = {
      ...currentSlot,
      members: currentSlot.members.filter(member => member !== participantToRemove)
    };

    setCurrentEditingSlot(updatedSlot);
    updateFlexibleCardSlot(editingFlexibleCard.id, editingSlotIndex, updatedSlot);
  }, [editingFlexibleCard, editingSlotIndex, currentEditingSlot, updateFlexibleCardSlot]);

  // 사용자 정보 가져오기
  const fetchUsers = async () => {
    try {
      const usersCollection = await getDocs(collection(db, 'users'));
      const usersData = usersCollection.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      } as UserInfo));
      setAllUsers(usersData);
    } catch (error) {
      console.error('사용자 정보 가져오기 실패:', error);
    }
  };

  // 참가자별 통계 계산 (현재 곡 + 완료된 곡 + 닉네임 카드 모두 포함)
  const calculateParticipantStats = () => {
    if (!activeSetList) {
      setUserStats([]);
      return;
    }

    // 현재 셋리스트의 곡들과 완료된 곡들을 모두 합치기
    const allSongs = [
      ...(activeSetList.songs || []),
      ...(activeSetList.completedSongs || [])
    ];

    // 현재 셋리스트의 닉네임 카드들과 완료된 닉네임 카드들을 모두 합치기
    const allFlexibleCards = [
      ...(activeSetList.flexibleCards || []).filter(card => card.order >= 0),
      ...(activeSetList.completedFlexibleCards || [])
    ];

    if (allSongs.length === 0 && allFlexibleCards.length === 0) {
      setUserStats([]);
      return;
    }

    // 각 참가자별 곡 수 계산
    const participantCounts: { [key: string]: number } = {};
    
    // 일반 곡들 집계
    allSongs.forEach(song => {
      song.members.forEach(member => {
        const trimmedMember = member.trim();
        participantCounts[trimmedMember] = (participantCounts[trimmedMember] || 0) + 1;
      });
    });

    // 닉네임 카드들 집계 (각 슬롯별로)
    allFlexibleCards.forEach(card => {
      card.slots.forEach(slot => {
        slot.members.forEach(member => {
          const trimmedMember = member.trim();
          participantCounts[trimmedMember] = (participantCounts[trimmedMember] || 0) + 1;
        });
      });
    });

    // 사용자 정보와 매칭하여 통계 생성
    const stats: ParticipantStats[] = Object.entries(participantCounts).map(([nickname, songCount]) => {
      const userInfo = allUsers.find(user => user.nickname === nickname);
      
      // 등록된 사용자가 아닌 경우 게스트로 처리
      if (!userInfo) {
        return {
          nickname,
          songCount,
          grade: '👤', // 게스트 표시
          role: '게스트'
        };
      }
      
      return {
        nickname,
        songCount,
        grade: userInfo.grade || '🍒',
        role: userInfo.role || '일반'
      };
    });

    // 곡 수 내림차순으로 정렬, 같은 곡 수면 닉네임 순
    stats.sort((a, b) => {
      if (b.songCount !== a.songCount) {
        return b.songCount - a.songCount;
      }
      return a.nickname.localeCompare(b.nickname);
    });
    
    setUserStats(stats);
  };

  // 참가자 관리 함수들
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
      // 새 셋리스트 생성 (비활성 상태로 저장, 빈 셋리스트)
      const newSetList: Omit<SetListData, 'id'> = {
        name: setListName.trim(),
        participants: attendees,
        songs: [], // 빈 셋리스트로 저장
        completedSongs: [], // 완료된 곡 목록 초기화
        createdBy: user?.nickname || user?.email || '',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isActive: false, // 카드탭에 자동 반영되지 않도록 비활성 상태로 저장
        currentSongIndex: 0
      };

      await addDoc(collection(db, 'setlists'), newSetList);
      
      // 폼 초기화
      setSetListName('');
      setParticipants(['']);
      
      alert(`셋리스트가 저장되었습니다!\n\n※ 카드탭에서 사용하려면 해당 셋리스트를 활성화한 후, 수동으로 곡을 추가해주세요.`);
    } catch (error) {
      console.error('셋리스트 저장 실패:', error);
      alert('셋리스트 저장에 실패했습니다.');
    }
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
      setParticipants([...setList.participants, '']);
      
      alert(`"${setList.name}" 셋리스트가 활성화되었습니다.`);
    } catch (error) {
      console.error('셋리스트 활성화 실패:', error);
      alert('셋리스트 활성화에 실패했습니다.');
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

  // 셋리스트에 곡 추가
  const addSongToSetList = async (song: any) => {
    if (!activeSetList || !isLeader) return;

    const isAlreadyAdded = activeSetList.songs.some(s => s.songId === song.id);
    if (isAlreadyAdded) {
      alert('이미 셋리스트에 추가된 곡입니다.');
      return;
    }

    const newSong: SetListItem = {
      songId: song.id,
      title: song.title,
      members: song.members,
      order: activeSetList.songs.length
    };

    const updatedSongs = [...activeSetList.songs, newSong];

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });
      
      alert(`"${song.title}" 곡이 셋리스트에 추가되었습니다! 🎵`);
    } catch (error) {
      console.error('곡 추가 실패:', error);
      alert('곡 추가에 실패했습니다.');
    }
  };

  // 관리탭에서 곡 완료 처리
  const completeSongFromManager = async (songId: string) => {
    if (!activeSetList || !isLeader) return;

    const songToComplete = activeSetList.songs.find(song => song.songId === songId);
    if (!songToComplete) return;

    if (!window.confirm(`"${songToComplete.title}" 곡을 완료 처리하시겠습니까?`)) return;

    // 완료된 곡을 completedSongs에 추가 (완료 시간 포함)
    const completedSong = {
      ...songToComplete,
      completedAt: Timestamp.now()
    };
    
    const existingCompletedSongs = activeSetList.completedSongs || [];
    const updatedCompletedSongs = [...existingCompletedSongs, completedSong];

    // 셋리스트에서 해당 곡 제거하고 순서 재정렬
    const updatedSongs = activeSetList.songs
      .filter(song => song.songId !== songId)
      .map((song, index) => ({ ...song, order: index }));

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        completedSongs: updatedCompletedSongs,
        updatedAt: Timestamp.now()
      });
      
      alert(`🎵 "${songToComplete.title}" 곡이 완료되었습니다!`);
    } catch (error) {
      console.error('곡 완료 처리 실패:', error);
      alert('곡 완료 처리에 실패했습니다.');
    }
  };

  // 드래그 앤 드롭 핸들러들
  const handleDragStart = (e: React.DragEvent, song: SetListEntry) => {
    if (!isLeader) return;
    setDraggedItem(song);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (!isLeader) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(-1);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (!isLeader || !draggedItem || !activeSetList) return;

    // 전체 항목 목록에서 드래그된 항목의 인덱스 찾기
    const allItems = getAllItems();
    const dragIndex = allItems.findIndex(item => {
      if (isSetListItem(item) && isSetListItem(draggedItem)) {
        return item.songId === draggedItem.songId;
      }
      if (isFlexibleCard(item) && isFlexibleCard(draggedItem)) {
        return item.id === draggedItem.id;
      }
      return false;
    });

    if (dragIndex === -1 || dragIndex === dropIndex) {
      setDraggedItem(null);
      setDragOverIndex(-1);
      return;
    }

    // 새로운 순서로 배열 재구성
    const newItems = [...allItems];
    const [draggedItemData] = newItems.splice(dragIndex, 1);
    newItems.splice(dropIndex, 0, draggedItemData);
    
    // order 재할당
    const reorderedItems = newItems.map((item, index) => ({
      ...item,
      order: index
    }));

    // 곡과 카드 분리
    const reorderedSongs = reorderedItems.filter(isSetListItem);
    const reorderedCards = reorderedItems.filter(isFlexibleCard);

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: reorderedSongs,
        flexibleCards: [
          ...reorderedCards,
          ...(activeSetList.flexibleCards || []).filter(card => card.order < 0)
        ],
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('순서 변경 실패:', error);
      alert('순서 변경에 실패했습니다.');
    }

    setDraggedItem(null);
    setDragOverIndex(-1);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverIndex(-1);
  };

  // 터치 이벤트 핸들러들
  const handleTouchStart = (e: React.TouchEvent, song: SetListEntry, index: number) => {
    if (!isLeader) return;
    const touch = e.touches[0];
    setTouchStart({ y: touch.clientY, itemIndex: index });
    setDraggedItem(song);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isLeader || !touchStart || !activeSetList) return;
    
    // preventDefault() 제거 - CSS touch-action: none이 스크롤을 방지함
    
    const touch = e.touches[0];
    const offset = touch.clientY - touchStart.y;
    setTouchDragOffset(offset);
    
    // 각 항목의 높이를 대략 60px로 가정하고 드래그 오버 인덱스 계산
    const itemHeight = 60;
    const allItemsLength = getAllItems().length;
    const dragOverIdx = Math.max(0, Math.min(
      allItemsLength - 1,
      touchStart.itemIndex + Math.round(offset / itemHeight)
    ));
    setDragOverIndex(dragOverIdx);
  };

  const handleTouchEnd = async () => {
    if (!isLeader || !draggedItem || !activeSetList || touchStart === null) return;
    
    if (dragOverIndex >= 0 && dragOverIndex !== touchStart.itemIndex) {
      const dragIndex = touchStart.itemIndex;
      const dropIndex = dragOverIndex;
      
      // 전체 항목 목록에서 순서 변경
      const allItems = getAllItems();
      const newItems = [...allItems];
      const [draggedItemData] = newItems.splice(dragIndex, 1);
      newItems.splice(dropIndex, 0, draggedItemData);
      
      // order 재할당
      const reorderedItems = newItems.map((item, index) => ({
        ...item,
        order: index
      }));

      // 곡과 카드 분리
      const reorderedSongs = reorderedItems.filter(isSetListItem);
      const reorderedCards = reorderedItems.filter(isFlexibleCard);

      try {
        await updateDoc(doc(db, 'setlists', activeSetList.id!), {
          songs: reorderedSongs,
          flexibleCards: [
            ...reorderedCards,
            ...(activeSetList.flexibleCards || []).filter(card => card.order < 0)
          ],
          updatedAt: Timestamp.now()
        });
      } catch (error) {
        console.error('순서 변경 실패:', error);
        alert('순서 변경에 실패했습니다.');
      }
    }
    
    setDraggedItem(null);
    setDragOverIndex(-1);
    setTouchStart(null);
    setTouchDragOffset(0);
  };

  return (
    <div style={{ width: '100%', maxWidth: 'none' }}>
      {/* 셋리스트 생성 영역 */}
      {isLeader && (
        <div style={{ 
          background: '#F6F2FF', 
          borderRadius: '12px', 
          padding: '24px', 
          marginBottom: '24px' 
        }}>
          <h2 style={{ color: '#8A55CC', fontSize: '20px', marginBottom: '16px' }}>
            새 셋리스트 만들기
          </h2>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              셋리스트 이름
            </label>
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
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              참가자
            </label>
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
            저장
          </button>
        </div>
      )}

      {/* 활성 셋리스트 표시 */}
      {activeSetList && (
        <div style={{ 
          background: '#fff', 
          borderRadius: '12px', 
          padding: '24px', 
          marginBottom: '24px',
          boxShadow: '0 4px 16px rgba(138, 85, 204, 0.1)'
        }}>
          <h2 style={{ color: '#8A55CC', fontSize: '22px', marginBottom: '12px' }}>
            🎭 현재 활성 셋리스트: {activeSetList.name}
          </h2>
          <div style={{ marginBottom: '8px' }}>
            <strong>참가자:</strong> {activeSetList.participants.join(', ')}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>곡 수:</strong> {activeSetList.songs.length}곡
            {activeSetList.completedSongs && activeSetList.completedSongs.length > 0 && (
              <span style={{ color: '#10B981', marginLeft: '8px' }}>
                (완료: {activeSetList.completedSongs.length}곡)
              </span>
            )}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>닉네임 카드:</strong> {(activeSetList.flexibleCards || []).filter(card => card.order >= 0).length}개
            {activeSetList.completedFlexibleCards && activeSetList.completedFlexibleCards.length > 0 && (
              <span style={{ color: '#10B981', marginLeft: '8px' }}>
                (완료: {activeSetList.completedFlexibleCards.length}개)
              </span>
            )}
          </div>
          <div style={{ marginBottom: '16px' }}>
            <strong>생성자:</strong> {activeSetList.createdBy}
          </div>

          {/* 통계 보기 버튼 */}
          {userStats.length > 0 && (
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <button
                onClick={() => setShowStatsModal(true)}
                style={{
                  background: 'linear-gradient(135deg, #8A55CC 0%, #A855F7 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(138, 85, 204, 0.3)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  margin: '0 auto'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(138, 85, 204, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(138, 85, 204, 0.3)';
                }}
              >
                📊 상세 통계 보기
                <span style={{ 
                  background: 'rgba(255, 255, 255, 0.2)', 
                  padding: '4px 8px', 
                  borderRadius: '8px', 
                  fontSize: '14px' 
                }}>
                  {(() => {
                    const totalSongs = activeSetList.songs.length + (activeSetList.completedSongs?.length || 0);
                    const totalCards = (activeSetList.flexibleCards || []).filter(card => card.order >= 0).length + 
                                      (activeSetList.completedFlexibleCards?.length || 0);
                    const totalSlots = [...(activeSetList.flexibleCards || []).filter(card => card.order >= 0),
                                       ...(activeSetList.completedFlexibleCards || [])].reduce((sum, card) => sum + card.totalSlots, 0);
                    
                    return `${totalSongs + totalSlots}곡 (일반: ${totalSongs}, 카드: ${totalCards}개/${totalSlots}곡)`;
                  })()}
                </span>
              </button>
            </div>
          )}

          {/* 셋리스트 전체 항목 목록 (곡 + 유연한 카드) */}
          <div>
            <h3 style={{ color: '#8A55CC', fontSize: '18px', marginBottom: '8px' }}>
              🎵 셋리스트 ({getAllItems().length}개 항목)
              {isLeader && getAllItems().length > 1 && (
                <span style={{ 
                  fontSize: '12px', 
                  fontWeight: 400, 
                  color: '#666', 
                  marginLeft: '8px' 
                }}>
                  (곡: {activeSetList.songs.length}개, 카드: {(activeSetList.flexibleCards || []).length}개)
                </span>
              )}
            </h3>
            
            {getAllItems().length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                {isLeader ? '항목이 없습니다. 곡이나 닉네임 카드를 추가해보세요!' : '아직 항목이 추가되지 않았습니다.'}
              </div>
            ) : (
              <div style={{ border: '1px solid #E5DAF5', borderRadius: '8px' }}>
                {getAllItems().map((item, index) => {
                  const isDragging = draggedItem && (
                    (isSetListItem(item) && isSetListItem(draggedItem) && draggedItem.songId === item.songId) ||
                    (isFlexibleCard(item) && isFlexibleCard(draggedItem) && draggedItem.id === item.id)
                  );
                  const isDragOver = dragOverIndex === index;
                  const shouldShiftDown = draggedItem && dragOverIndex >= 0 && 
                    !isDragging && index >= dragOverIndex && 
                    (touchStart ? touchStart.itemIndex > index : true);

                  // 곡 항목 렌더링
                  if (isSetListItem(item)) {
                    return (
                      <div 
                        key={`song-${item.songId}`}
                        draggable={isLeader}
                        onDragStart={(e) => handleDragStart(e, item)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={(e) => handleTouchStart(e, item, index)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center',
                          padding: '12px',
                          borderBottom: index < getAllItems().length - 1 ? '1px solid #F0F0F0' : 'none',
                          backgroundColor: isDragging ? '#F8F6FF' : isDragOver ? '#E5DAF5' : '#FFFFFF',
                          opacity: isDragging ? 0.7 : 1,
                          transform: isDragging ? 
                            (touchStart && touchStart.itemIndex === index ? 
                              `scale(1.02) translateY(${touchDragOffset}px)` : 
                              'scale(1.02)') : 
                            shouldShiftDown ? 'translateY(4px)' : 'scale(1)',
                          transition: isDragging && touchStart ? 'none' : 'all 0.2s ease',
                          cursor: isLeader ? 'grab' : 'default',
                          borderLeft: isDragOver ? '4px solid #8A55CC' : '4px solid transparent',
                          boxShadow: isDragging ? '0 4px 8px rgba(138, 85, 204, 0.2)' : 'none',
                          zIndex: isDragging && touchStart && touchStart.itemIndex === index ? 10 : 1,
                          position: 'relative',
                          touchAction: isLeader ? 'none' : 'auto' // 터치 드래그 시 스크롤 방지
                        }}
                      >
                        {/* 드래그 핸들 */}
                        {isLeader && (
                          <div style={{ 
                            marginRight: '8px',
                            color: isDragging ? '#A855F7' : '#8A55CC',
                            fontSize: '16px',
                            cursor: isDragging ? 'grabbing' : 'grab',
                            padding: '4px',
                            transition: 'color 0.2s ease',
                            userSelect: 'none'
                          }}>
                            ⋮⋮
                          </div>
                        )}
                        
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
                          <div style={{ fontWeight: 600, color: '#7C4DBC' }}>{item.title}</div>
                          <div style={{ color: '#666', fontSize: '14px' }}>{item.members.join(', ')}</div>
                        </div>
                        
                        {isLeader && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => completeSongFromManager(item.songId)}
                              style={{ 
                                background: '#10B981', 
                                color: '#fff', 
                                border: 'none', 
                                borderRadius: '6px', 
                                padding: '6px 10px', 
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 600,
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#059669';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#10B981';
                              }}
                            >
                              완료
                            </button>
                            <button
                              onClick={() => removeSongFromSetList(item.songId)}
                              style={{ 
                                background: '#EF4444', 
                                color: '#fff', 
                                border: 'none', 
                                borderRadius: '6px', 
                                padding: '6px 10px', 
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 600,
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#DC2626';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#EF4444';
                              }}
                            >
                              제거
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // 유연한 카드 항목 렌더링
                  if (isFlexibleCard(item)) {
                    return (
                      <div 
                        key={`card-${item.id}`}
                        draggable={isLeader}
                        onDragStart={(e) => handleDragStart(e, item)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={(e) => handleTouchStart(e, item, index)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center',
                          padding: '12px',
                          borderBottom: index < getAllItems().length - 1 ? '1px solid #F0F0F0' : 'none',
                          backgroundColor: isDragging ? '#F8F6FF' : isDragOver ? '#F3E8FF' : '#FDFBFF',
                          opacity: isDragging ? 0.7 : 1,
                          transform: isDragging ? 
                            (touchStart && touchStart.itemIndex === index ? 
                              `scale(1.02) translateY(${touchDragOffset}px)` : 
                              'scale(1.02)') : 
                            shouldShiftDown ? 'translateY(4px)' : 'scale(1)',
                          transition: isDragging && touchStart ? 'none' : 'all 0.2s ease',
                          cursor: isLeader ? 'grab' : 'default',
                          borderLeft: isDragOver ? '4px solid #A855F7' : '4px solid #A855F7',
                          boxShadow: isDragging ? '0 4px 8px rgba(168, 85, 247, 0.2)' : 'none',
                          zIndex: isDragging && touchStart && touchStart.itemIndex === index ? 10 : 1,
                          position: 'relative',
                          touchAction: isLeader ? 'none' : 'auto' // 터치 드래그 시 스크롤 방지
                        }}
                                              >
                        {/* 드래그 핸들 */}
                        {isLeader && (
                          <div style={{ 
                            marginRight: '8px',
                            color: isDragging ? '#A855F7' : '#8A55CC',
                            fontSize: '16px',
                            cursor: isDragging ? 'grabbing' : 'grab',
                            padding: '4px',
                            transition: 'color 0.2s ease',
                            userSelect: 'none'
                          }}>
                            ⋮⋮
                          </div>
                        )}
                        
                        <div style={{ 
                          width: '30px', 
                          height: '30px', 
                          background: '#A855F7', 
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
                          <div style={{ fontWeight: 600, color: '#A855F7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            🎤 {item.nickname} {item.totalSlots}곡
                          </div>
                          <div style={{ color: '#666', fontSize: '14px' }}>
                            {item.slots.map((slot, slotIndex) => {
                              const slotNumber = `${slotIndex + 1}번`;
                              const title = slot.title ? `"${slot.title}"` : '';
                              const members = slot.members.length > 0 ? slot.members.join(', ') : '미지정';
                              
                              return title 
                                ? `${slotNumber}: ${title} - ${members}`
                                : `${slotNumber}: ${members}`;
                            }).join(' | ')}
                          </div>
                        </div>
                        
                        {isLeader && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => completeFlexibleCard(item.id)}
                              style={{ 
                                background: '#10B981', 
                                color: '#fff', 
                                border: 'none', 
                                borderRadius: '6px', 
                                padding: '6px 10px', 
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 600,
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#059669';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#10B981';
                              }}
                            >
                              완료
                            </button>
                            {canEditFlexibleCard(item) && (
                              <button
                                                            onClick={() => {
                              console.log('유연한 카드 편집 모달 열기:', item);
                              setEditingFlexibleCard(item);
                            }}
                                style={{ 
                                  background: '#A855F7', 
                                  color: '#fff', 
                                  border: 'none', 
                                  borderRadius: '6px', 
                                  padding: '6px 10px', 
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  fontWeight: 600,
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                편집
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                                     return null;
                 })}
              </div>
            )}
          </div>

          {/* 셋리스트에 추가되지 않은 닉네임 카드 목록 */}
          {getAvailableFlexibleCards().length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ color: '#8A55CC', fontSize: '18px', marginBottom: '16px' }}>
                🎤 생성된 닉네임 카드 ({getAvailableFlexibleCards().length}개)
                <span style={{ fontSize: '14px', fontWeight: 400, color: '#666', marginLeft: '8px' }}>
                  - 셋리스트에 추가되지 않음
                </span>
              </h3>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', 
                gap: '16px',
                marginBottom: '20px'
              }}>
                {getAvailableFlexibleCards().map((card) => (
                  <div
                    key={card.id}
                    style={{
                      background: 'linear-gradient(135deg, #F8F9FA 0%, #E9ECEF 100%)',
                      borderRadius: '12px',
                      padding: '16px',
                      border: '2px dashed #8A55CC',
                      position: 'relative',
                      opacity: 0.8
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      marginBottom: '12px' 
                    }}>
                      <h4 style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: '#7C4DBC',
                        margin: 0
                      }}>
                        {card.nickname} {card.totalSlots}곡
                      </h4>
                      
                      {isLeader && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => addFlexibleCardToSetList(card.id)}
                            style={{
                              background: '#10B981',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              marginBottom: '4px'
                            }}
                          >
                            ➕ 셋리스트에 추가
                          </button>
                          <button
                            onClick={() => {
                              console.log('생성된 카드 편집 모달 열기:', card);
                              setEditingFlexibleCard(card);
                            }}
                            style={{
                              background: '#8A55CC',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              marginBottom: '4px'
                            }}
                          >
                            편집
                          </button>
                          <button
                            onClick={() => deleteFlexibleCard(card.id)}
                            style={{
                              background: '#EF4444',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              marginBottom: '4px'
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* 슬롯 미리보기 */}
                    <div style={{ fontSize: '14px', color: '#666' }}>
                      {card.slots.map((slot, index) => (
                        <div key={slot.id} style={{ marginBottom: '4px' }}>
                          <strong>{index + 1}번째 곡:</strong>{' '}
                          {slot.title && (
                            <span style={{ color: '#8A55CC', fontWeight: 600 }}>
                              "{slot.title}" -{' '}
                            </span>
                          )}
                          {slot.members.length > 0 
                            ? slot.members.join(', ')
                            : '미지정'
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 닉네임 카드 생성 섹션 (리더만) */}
          {isLeader && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ color: '#8A55CC', fontSize: '18px', marginBottom: '16px' }}>
                🎤 닉네임 카드 만들기
              </h3>
              
              {!showFlexibleCardForm ? (
                <button
                  onClick={() => setShowFlexibleCardForm(true)}
                  style={{
                    background: 'linear-gradient(135deg, #8A55CC 0%, #A855F7 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '12px 24px',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(138, 85, 204, 0.3)',
                    marginBottom: '20px'
                  }}
                >
                  ➕ 새 닉네임 카드 만들기
                </button>
              ) : (
                <div style={{
                  background: 'rgba(138, 85, 204, 0.05)',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '20px',
                  border: '1px solid #E5DAF5'
                }}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                      닉네임
                    </label>
                    <input
                      type="text"
                      value={flexibleCardNickname}
                      onChange={(e) => setFlexibleCardNickname(e.target.value)}
                      placeholder="예: 홍길동"
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
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                      곡 수
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={flexibleCardCount}
                      onChange={(e) => setFlexibleCardCount(parseInt(e.target.value) || 3)}
                      style={{
                        width: '100px',
                        padding: '8px',
                        borderRadius: '8px',
                        border: '1px solid #E5DAF5'
                      }}
                    />
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={createFlexibleCard}
                      disabled={!flexibleCardNickname.trim()}
                      style={{
                        background: flexibleCardNickname.trim() ? '#8A55CC' : '#D1D5DB',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        fontWeight: 600,
                        cursor: flexibleCardNickname.trim() ? 'pointer' : 'not-allowed'
                      }}
                    >
                      생성
                    </button>
                    <button
                      onClick={() => {
                        setShowFlexibleCardForm(false);
                        setFlexibleCardNickname('');
                        setFlexibleCardCount(3);
                      }}
                      style={{
                        background: '#EF4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 곡 추가 섹션 (리더만) */}
          {isLeader && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ color: '#8A55CC', fontSize: '18px', marginBottom: '16px' }}>
                ➕ 곡 추가하기
              </h3>
              
              {/* 검색 입력 */}
              <div style={{ marginBottom: '16px' }}>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="곡 제목이나 참가자 이름으로 검색..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #E5DAF5',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* 사용 가능한 곡 목록 */}
              {(() => {
                const filteredSongs = availableSongs.filter(song =>
                  song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  song.members.some((member: string) => member.toLowerCase().includes(searchTerm.toLowerCase()))
                );

                if (filteredSongs.length === 0) {
                  return (
                    <div style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: '#666',
                      background: '#F8F9FA',
                      borderRadius: '12px',
                      border: '1px solid #E5E7EB'
                    }}>
                      {searchTerm ? '검색 결과가 없습니다.' : '현재 참가자들이 부를 수 있는 곡이 없습니다.'}
                    </div>
                  );
                }

                return (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: '10px',
                    maxHeight: '75vh',
                    overflow: 'auto',
                    padding: '6px'
                  }}>
                    {filteredSongs.map((song) => {
                      const isAlreadyAdded = activeSetList.songs.some(s => s.songId === song.id);
                      
                      return (
                        <div
                          key={song.id}
                          style={{
                            background: isAlreadyAdded ? 
                              'linear-gradient(135deg, #E5E7EB 0%, #F3F4F6 100%)' :
                              'linear-gradient(135deg, #E5DAF5 0%, #F3E8FF 100%)',
                            borderRadius: '12px',
                            padding: '16px',
                            border: isAlreadyAdded ? '1px solid #D1D5DB' : '1px solid #E5DAF5',
                            position: 'relative',
                            opacity: isAlreadyAdded ? 0.6 : 1,
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {/* 추가됨 표시 */}
                          {isAlreadyAdded && (
                            <div style={{
                              position: 'absolute',
                              top: '8px',
                              right: '8px',
                              background: '#9CA3AF',
                              color: '#fff',
                              padding: '4px 8px',
                              borderRadius: '8px',
                              fontSize: '10px',
                              fontWeight: 600
                            }}>
                              추가됨
                            </div>
                          )}
                          
                          <div style={{ marginBottom: '8px' }}>
                            <h4 style={{
                              fontSize: '16px',
                              fontWeight: 600,
                              color: isAlreadyAdded ? '#9CA3AF' : '#7C4DBC',
                              margin: '0 0 4px 0'
                            }}>
                              {song.title}
                            </h4>
                            <p style={{
                              fontSize: '14px',
                              color: isAlreadyAdded ? '#9CA3AF' : '#666',
                              margin: 0
                            }}>
                              {song.members.join(', ')}
                            </p>
                          </div>
                          
                          <button
                            onClick={() => addSongToSetList(song)}
                            disabled={isAlreadyAdded}
                            style={{
                              width: '100%',
                              background: isAlreadyAdded ? '#D1D5DB' : '#8A55CC',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              fontSize: '14px',
                              fontWeight: 600,
                              cursor: isAlreadyAdded ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (!isAlreadyAdded) {
                                e.currentTarget.style.background = '#7C4DBC';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isAlreadyAdded) {
                                e.currentTarget.style.background = '#8A55CC';
                              }
                            }}
                          >
                            {isAlreadyAdded ? '이미 추가됨' : '➕ 셋리스트에 추가'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* 모든 셋리스트 목록 */}
      <div>
        <h2 style={{ color: '#8A55CC', fontSize: '22px', marginBottom: '16px' }}>
          전체 셋리스트
        </h2>
        {setLists.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            생성된 셋리스트가 없습니다.
          </div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: '16px' 
          }}>
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
                  <h3 style={{ color: '#8A55CC', fontSize: '18px', margin: 0 }}>
                    {setList.name}
                  </h3>
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

      {/* 통계 모달 */}
      {activeSetList && (
        <StatsModal
          isOpen={showStatsModal}
          onClose={() => setShowStatsModal(false)}
          activeSetList={activeSetList}
          userStats={userStats}
        />
      )}

      {/* 유연한 카드 편집 모달 (카드탭과 동일한 스타일) */}
      {editingFlexibleCard && canEditFlexibleCard(editingFlexibleCard) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ color: '#F59E0B', fontSize: '20px', margin: 0 }}>
                  🎤 {editingFlexibleCard.nickname} 카드 편집
                </h3>
                <p style={{ color: '#666', fontSize: '12px', margin: '4px 0 0 0' }}>
                  {isLeader ? '리더 권한으로 편집 중' : '카드 소유자로 편집 중'}
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    onClick={() => {
                      console.log('=== 디버깅 정보 ===');
                      console.log('편집 중인 카드:', editingFlexibleCard);
                      console.log('활성 셋리스트:', activeSetList);
                      console.log('카드 슬롯들:', editingFlexibleCard.slots);
                      console.log('현재 편집 슬롯 인덱스:', editingSlotIndex);
                      console.log('현재 편집 슬롯:', currentEditingSlot);
                    }}
                    style={{
                      background: '#EF4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    🐛 디버그
                  </button>
                  <button
                    onClick={() => {
                      // 강제로 카드 데이터 새로고침
                      if (activeSetList?.flexibleCards) {
                        const updatedCard = activeSetList.flexibleCards.find(card => card.id === editingFlexibleCard.id);
                        if (updatedCard) {
                          console.log('강제 새로고침:', updatedCard);
                          setEditingFlexibleCard(updatedCard);
                          if (editingSlotIndex >= 0) {
                            setCurrentEditingSlot({
                              ...updatedCard.slots[editingSlotIndex],
                              members: [...(updatedCard.slots[editingSlotIndex].members || [])]
                            });
                          }
                          alert('카드 데이터가 새로고침되었습니다!');
                        }
                      }
                    }}
                    style={{
                      background: '#10B981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 새로고침
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {isLeader && (
                  <button
                    onClick={() => {
                      if (window.confirm(`"${editingFlexibleCard.nickname}" 카드를 삭제하시겠습니까?`)) {
                        deleteFlexibleCard(editingFlexibleCard.id);
                        setEditingFlexibleCard(null);
                        setSlotSearchTerm(''); // 슬롯 검색어 초기화
                      }
                    }}
                    style={{
                      background: '#EF4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 600
                    }}
                  >
                    🗑️ 삭제
                  </button>
                )}
                <button
                  onClick={async () => {
                    // 편집 중인 슬롯이 있으면 저장 후 닫기
                    if (currentEditingSlot && editingFlexibleCard && editingSlotIndex >= 0) {
                      try {
                        await updateFlexibleCardSlot(editingFlexibleCard.id, editingSlotIndex, currentEditingSlot);
                      } catch (error) {
                        console.error('모달 닫기 전 슬롯 저장 실패:', error);
                      }
                    }
                    
                    setEditingFlexibleCard(null);
                    setSlotSearchTerm(''); // 슬롯 검색어 초기화
                  }}
                  style={{
                    background: '#E5E7EB',
                    color: '#6B7280',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  ❌ 닫기
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: '#666', fontSize: '14px', margin: '0 0 16px 0' }}>
                {editingFlexibleCard.nickname}님의 {editingFlexibleCard.totalSlots}곡 카드입니다. 아래에서 곡을 선택하세요.
              </p>
              
              {editingFlexibleCard.slots.map((slot, slotIndex) => (
                <div
                  key={slot.id}
                  style={{
                    border: '2px solid #F59E0B',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '12px',
                    background: slot.isCompleted ? '#D1FAE5' : !slot.title ? '#FEF3C7' : '#F3E8FF',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', color: '#92400E', fontSize: '16px' }}>
                        슬롯 {slotIndex + 1}
                      </h4>
                      {!slot.title ? (
                        <p style={{ margin: 0, color: '#A16207', fontSize: '14px' }}>비어있음</p>
                      ) : (
                        <div>
                          <p style={{ margin: '0 0 4px 0', color: '#059669', fontSize: '14px', fontWeight: 600 }}>
                            🎵 {slot.title}
                          </p>
                          <p style={{ margin: 0, color: '#6B7280', fontSize: '12px' }}>
                            멤버: {slot.members.length > 0 ? slot.members.join(', ') : editingFlexibleCard.nickname}
                          </p>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {slot.title && (
                        <button
                          onClick={async () => {
                            const updatedSlot = { ...slot, isCompleted: !slot.isCompleted };
                            await updateFlexibleCardSlot(editingFlexibleCard.id, slotIndex, updatedSlot);
                          }}
                          style={{
                            background: slot.isCompleted ? '#EF4444' : '#10B981',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          {slot.isCompleted ? '완료취소' : '완료'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 곡 선택 섹션 */}
            <div style={{
              border: '2px solid #8A55CC',
              borderRadius: '12px',
              padding: '20px',
              background: '#F3E8FF'
            }}>
              <h4 style={{ color: '#8A55CC', fontSize: '16px', margin: '0 0 16px 0' }}>
                곡 선택 ({editingFlexibleCard.nickname}님이 합격한 곡)
              </h4>
              
              {/* 검색창 */}
              <input
                type="text"
                value={slotSearchTerm}
                onChange={(e) => setSlotSearchTerm(e.target.value)}
                placeholder="곡 제목이나 멤버 이름으로 검색..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '2px solid #8A55CC',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  marginBottom: '16px'
                }}
              />
              
              {/* 선택된 곡들 표시 */}
              {(() => {
                const selectedSongs = editingFlexibleCard.slots
                  .filter(slot => slot.title)
                  .map((slot, index) => ({ ...slot, slotIndex: index }));
                
                return selectedSongs.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#8A55CC', marginBottom: '8px' }}>
                      선택된 곡 ({selectedSongs.length}/{editingFlexibleCard.totalSlots})
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                      {selectedSongs.map((slot) => (
                        <div
                          key={slot.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: '#8A55CC',
                            color: '#fff',
                            padding: '8px 12px',
                            borderRadius: '20px',
                            fontSize: '14px',
                            fontWeight: 600
                          }}
                        >
                          <span style={{ marginRight: '8px' }}>{slot.title}</span>
                          <button
                            onClick={async () => {
                              const updatedSlot: FlexibleSlot = {
                                ...slot,
                                songId: undefined,
                                title: '',
                                type: 'empty',
                                members: []
                              };
                              await updateFlexibleCardSlot(editingFlexibleCard.id, slot.slotIndex, updatedSlot);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#fff',
                              cursor: 'pointer',
                              padding: '0',
                              fontSize: '16px',
                              fontWeight: 'bold',
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              
              {/* 합격한 곡 드롭다운 */}
              <div style={{
                maxHeight: '300px',
                overflowY: 'auto',
                border: '2px solid #8A55CC',
                borderRadius: '8px',
                background: '#fff'
              }}>
                {(() => {
                  // 편집하는 카드의 닉네임이 포함된 곡들만 필터링
                  const userPassedSongs = songs.filter(song => 
                    Array.isArray(song.members) && 
                    song.members.includes(editingFlexibleCard.nickname)
                  );
                  
                  // 이미 선택된 곡들 제외
                  const selectedSongIds = editingFlexibleCard.slots
                    .filter(slot => slot.songId)
                    .map(slot => slot.songId);
                  
                  const availableSongs = userPassedSongs.filter(song => 
                    !selectedSongIds.includes(song.id)
                  );
                  
                  // 검색어로 추가 필터링
                  const filteredSongs = availableSongs.filter(song =>
                    song.title.toLowerCase().includes(slotSearchTerm.toLowerCase()) ||
                    song.members.some(member => 
                      member.toLowerCase().includes(slotSearchTerm.toLowerCase())
                    )
                  );
                  
                  if (filteredSongs.length === 0) {
                    return (
                      <div style={{
                        padding: '16px',
                        textAlign: 'center',
                        color: '#666',
                        fontSize: '14px'
                      }}>
                        {slotSearchTerm ? '검색 결과가 없습니다' : 
                         availableSongs.length === 0 ? 
                         (selectedSongIds.length >= editingFlexibleCard.totalSlots ? 
                          '모든 슬롯이 선택되었습니다' : 
                          `${editingFlexibleCard.nickname}님이 합격한 곡이 없습니다`) :
                         '검색 결과가 없습니다'}
                      </div>
                    );
                  }
                  
                  const selectedCount = editingFlexibleCard.slots.filter(slot => slot.title).length;
                  const canSelectMore = selectedCount < editingFlexibleCard.totalSlots;
                  
                  return filteredSongs.map(song => (
                    <div
                      key={song.id}
                      onClick={async () => {
                        if (!canSelectMore) return;
                        
                        // 첫 번째 빈 슬롯 찾기
                        const emptySlotIndex = editingFlexibleCard.slots.findIndex(slot => !slot.title);
                        if (emptySlotIndex === -1) return;
                        
                        const updatedSlot: FlexibleSlot = {
                          ...editingFlexibleCard.slots[emptySlotIndex],
                          songId: song.id,
                          title: song.title,
                          type: 'chorus', // 기본값으로 합창 설정
                          members: [editingFlexibleCard.nickname] // 카드 주인만 기본 포함
                        };
                        
                        try {
                          await updateFlexibleCardSlot(editingFlexibleCard.id, emptySlotIndex, updatedSlot);
                        } catch (error) {
                          console.error('곡 선택 저장 실패:', error);
                        }
                      }}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #E5DAF5',
                        cursor: canSelectMore ? 'pointer' : 'not-allowed',
                        opacity: canSelectMore ? 1 : 0.5,
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (canSelectMore) {
                          e.currentTarget.style.backgroundColor = '#F3E8FF';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (canSelectMore) {
                          e.currentTarget.style.backgroundColor = '#fff';
                        }
                      }}
                    >
                      <div style={{ 
                        fontWeight: 600, 
                        color: canSelectMore ? '#8A55CC' : '#999',
                        marginBottom: '4px' 
                      }}>
                        {song.title}
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#666',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <span>👥</span>
                        {song.members.join(', ')}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SetListManager; 