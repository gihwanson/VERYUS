import React, { useState, useEffect, useCallback } from 'react';
import { updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSetListData } from './hooks/useSetListData';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useSwipeGestures } from './hooks/useSwipeGestures';
import { DragOverlay } from './components/DragOverlay';
import type { Song, SetListItem, FlexibleCard, FlexibleSlot, SetListEntry } from './types';
import './styles.css';

const SetListCards: React.FC = () => {
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isLeader = user && user.role === '리더';
  const currentUserNickname = user?.nickname || '';
  
  const { songs, activeSetList } = useSetListData();
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [participants, setParticipants] = useState<string[]>(['']);
  const [availableSongs, setAvailableSongs] = useState<Song[]>([]);
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
  
  // 모달 완료 상태 관리
  const [isModalCompleting, setIsModalCompleting] = useState<boolean>(false);

  // 타입 가드 함수들
  const isSetListItem = (entry: SetListEntry): entry is SetListItem => {
    return 'songId' in entry;
  };

  const isFlexibleCard = (entry: SetListEntry): entry is FlexibleCard => {
    return 'type' in entry && entry.type === 'flexible';
  };

  // 유연한 카드 편집 권한 체크 함수
  const canEditFlexibleCard = useCallback((card: FlexibleCard) => {
    return isLeader || card.nickname === currentUserNickname;
  }, [isLeader, currentUserNickname]);

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
      order: (activeSetList.flexibleCards || []).length + activeSetList.songs.length,
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
  }, [activeSetList, isLeader, flexibleCardNickname, flexibleCardCount]);

  // 전체 항목들 (곡 + 유연한 카드) 가져오기 및 정렬 (셋리스트에 추가된 것만)
  const getAllItems = useCallback(() => {
    if (!activeSetList) return [];
    
    const songs = activeSetList.songs.map(song => ({ ...song, type: 'song' as const }));
    const flexCards = (activeSetList.flexibleCards || [])
      .filter(card => card.order >= 0) // order가 0 이상인 카드만 셋리스트에 표시
      .map(card => ({ ...card, type: 'flexible' as const }));
    
    return [...songs, ...flexCards].sort((a, b) => a.order - b.order);
  }, [activeSetList]);

  const allItems = getAllItems();

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

  // 참여자 추가 함수
  const addParticipant = useCallback(() => {
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

  // 참여자 제거 함수
  const removeParticipant = useCallback((participantToRemove: string) => {
    if (!editingFlexibleCard || editingSlotIndex < 0) return;

    const currentSlot = currentEditingSlot || editingFlexibleCard.slots[editingSlotIndex];
    const updatedSlot: FlexibleSlot = {
      ...currentSlot,
      members: currentSlot.members.filter(member => member !== participantToRemove)
    };

    setCurrentEditingSlot(updatedSlot);
    updateFlexibleCardSlot(editingFlexibleCard.id, editingSlotIndex, updatedSlot);
  }, [editingFlexibleCard, editingSlotIndex, currentEditingSlot, updateFlexibleCardSlot]);

  // 현재 곡/카드 완료 처리 함수 (스와이프 훅에서 사용) - 곡/카드를 완료 목록으로 이동
  const completeCurrentSong = async () => {
    if (!activeSetList || !isLeader) return;
    
    const currentIndex = activeSetList.currentSongIndex || 0;
    const currentItem = allItems[currentIndex];
    
    if (!currentItem) return;
    
    // 현재 항목이 곡인지 닉네임카드인지 확인
    if (isSetListItem(currentItem)) {
      // 일반 곡 완료 처리
      await completeRegularSong(currentItem, currentIndex);
    } else if (isFlexibleCard(currentItem)) {
      // 닉네임카드 완료 처리
      await completeFlexibleCard(currentItem, currentIndex);
    }
  };

  // 일반 곡 완료 처리
  const completeRegularSong = async (currentSong: SetListItem, currentIndex: number) => {
    if (!activeSetList) return;

    // 완료된 곡을 completedSongs에 추가 (완료 시간 포함)
    const completedSong = {
      ...currentSong,
      completedAt: Timestamp.now()
    };
    
    const existingCompletedSongs = activeSetList.completedSongs || [];
    const updatedCompletedSongs = [...existingCompletedSongs, completedSong];
    
    // 현재 곡을 제거하고 순서 재정렬 (allItems 기준으로)
    const remainingItems = allItems.filter((_, index) => index !== currentIndex);
    const updatedSongs = remainingItems.filter(isSetListItem).map((song, index) => ({ ...song, order: index }));
    const updatedFlexibleCards = remainingItems.filter(isFlexibleCard).map((card, index) => ({ 
      ...card, 
      order: updatedSongs.length + index 
    }));

    // 셋리스트에 추가되지 않은 기존 카드들도 유지
    const remainingUnlistedCards = (activeSetList.flexibleCards || []).filter(card => card.order < 0);
    const allFlexibleCards = [...updatedFlexibleCards, ...remainingUnlistedCards];
    
    // 모든 항목이 완료되었는지 확인
    if (remainingItems.length === 0) {
      try {
        await updateDoc(doc(db, 'setlists', activeSetList.id!), {
          songs: updatedSongs,
          flexibleCards: allFlexibleCards,
          completedSongs: updatedCompletedSongs,
          currentSongIndex: 0,
          updatedAt: Timestamp.now()
        });
        console.log('🎉 모든 항목이 완료되었습니다! 수고하셨습니다!');
      } catch (error) {
        console.error('셋리스트 업데이트 실패:', error);
      }
      return;
    }
    
    // 현재 인덱스가 남은 항목 수보다 크거나 같으면 마지막 항목으로 이동
    const newCurrentIndex = currentIndex >= remainingItems.length ? remainingItems.length - 1 : currentIndex;
    
    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        flexibleCards: allFlexibleCards,
        completedSongs: updatedCompletedSongs,
        currentSongIndex: newCurrentIndex,
        updatedAt: Timestamp.now()
      });
      
      console.log(`🎵 "${currentSong.title}" 곡이 완료되었습니다!`);
    } catch (error) {
      console.error('곡 완료 처리 실패:', error);
    }
  };

  // 닉네임카드 완료 처리
  const completeFlexibleCard = async (currentCard: FlexibleCard, currentIndex: number) => {
    if (!activeSetList) return;

    // 완료된 카드를 completedFlexibleCards에 추가 (완료 시간 포함)
    const completedCard = {
      ...currentCard,
      completedAt: Timestamp.now()
    };
    
    const existingCompletedCards = activeSetList.completedFlexibleCards || [];
    const updatedCompletedCards = [...existingCompletedCards, completedCard];
    
    // 현재 카드를 제거하고 순서 재정렬 (allItems 기준으로)
    const remainingItems = allItems.filter((_, index) => index !== currentIndex);
    const updatedSongs = remainingItems.filter(isSetListItem).map((song, index) => ({ ...song, order: index }));
    const updatedFlexibleCards = remainingItems.filter(isFlexibleCard).map((card, index) => ({ 
      ...card, 
      order: updatedSongs.length + index 
    }));

    // 셋리스트에 추가되지 않은 기존 카드들도 유지
    const remainingUnlistedCards = (activeSetList.flexibleCards || []).filter(card => card.order < 0);
    const allFlexibleCards = [...updatedFlexibleCards, ...remainingUnlistedCards];
    
    // 모든 항목이 완료되었는지 확인
    if (remainingItems.length === 0) {
      try {
        await updateDoc(doc(db, 'setlists', activeSetList.id!), {
          songs: updatedSongs,
          flexibleCards: allFlexibleCards,
          completedFlexibleCards: updatedCompletedCards,
          currentSongIndex: 0,
          updatedAt: Timestamp.now()
        });
        console.log('🎉 모든 항목이 완료되었습니다! 수고하셨습니다!');
      } catch (error) {
        console.error('셋리스트 업데이트 실패:', error);
      }
      return;
    }
    
    // 현재 인덱스가 남은 항목 수보다 크거나 같으면 마지막 항목으로 이동
    const newCurrentIndex = currentIndex >= remainingItems.length ? remainingItems.length - 1 : currentIndex;
    
    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        flexibleCards: allFlexibleCards,
        completedFlexibleCards: updatedCompletedCards,
        currentSongIndex: newCurrentIndex,
        updatedAt: Timestamp.now()
      });
      
      console.log(`🎤 "${currentCard.nickname} ${currentCard.totalSlots}곡" 카드가 완료되었습니다!`);
    } catch (error) {
      console.error('카드 완료 처리 실패:', error);
    }
  };

  // 현재 곡/카드 삭제 처리 함수 (스와이프 훅에서 사용) - 곡/카드를 바로 제거 (통계 미포함)
  const deleteCurrentSong = async () => {
    if (!activeSetList || !isLeader) return;
    
    // 현재 보고 있는 카드를 삭제 (currentCardIndex 기준)
    const currentItem = allItems[currentCardIndex];
    
    if (!currentItem) return;
    
    // 삭제 후 이동할 카드 인덱스 계산
    const newCardIndex = currentCardIndex >= allItems.length - 1 
      ? Math.max(0, allItems.length - 2) // 마지막 카드 삭제 시 이전 카드로
      : currentCardIndex; // 중간 카드 삭제 시 다음 카드가 현재 위치로 이동
    
    // 현재 항목이 곡인지 닉네임카드인지 확인
    if (isSetListItem(currentItem)) {
      // 일반 곡 삭제 처리
      await deleteRegularSong(currentItem, currentCardIndex);
    } else if (isFlexibleCard(currentItem)) {
      // 닉네임카드 삭제 처리
      await deleteFlexibleCardFromSetList(currentItem, currentCardIndex);
    }
    
    // 삭제 후 적절한 카드로 이동
    if (allItems.length > 1) {
      setCurrentCardIndex(newCardIndex);
    }
  };

  // 일반 곡 삭제 처리
  const deleteRegularSong = async (currentSong: SetListItem, currentIndex: number) => {
    if (!activeSetList) return;

    // 현재 곡을 제거하고 순서 재정렬 (allItems 기준으로)
    const remainingItems = allItems.filter((_, index) => index !== currentIndex);
    const updatedSongs = remainingItems.filter(isSetListItem).map((song, index) => ({ ...song, order: index }));
    const updatedFlexibleCards = remainingItems.filter(isFlexibleCard).map((card, index) => ({ 
      ...card, 
      order: updatedSongs.length + index 
    }));

    // 셋리스트에 추가되지 않은 기존 카드들도 유지
    const remainingUnlistedCards = (activeSetList.flexibleCards || []).filter(card => card.order < 0);
    const allFlexibleCards = [...updatedFlexibleCards, ...remainingUnlistedCards];
    
    // 현재 진행 중인 카드 인덱스 계산
    const currentActiveIndex = activeSetList.currentSongIndex || 0;
    let newCurrentSongIndex: number;
    
    if (remainingItems.length === 0) {
      // 모든 항목이 삭제된 경우
      newCurrentSongIndex = 0;
    } else if (currentIndex < currentActiveIndex) {
      // 진행 중인 카드보다 앞의 카드를 삭제한 경우
      newCurrentSongIndex = currentActiveIndex - 1;
    } else if (currentIndex === currentActiveIndex) {
      // 진행 중인 카드 자체를 삭제한 경우
      newCurrentSongIndex = currentActiveIndex >= remainingItems.length ? remainingItems.length - 1 : currentActiveIndex;
    } else {
      // 진행 중인 카드보다 뒤의 카드를 삭제한 경우
      newCurrentSongIndex = currentActiveIndex;
    }
    
    // 모든 항목이 삭제되었는지 확인
    if (remainingItems.length === 0) {
      try {
        await updateDoc(doc(db, 'setlists', activeSetList.id!), {
          songs: updatedSongs,
          flexibleCards: allFlexibleCards,
          currentSongIndex: 0,
          updatedAt: Timestamp.now()
        });
        console.log('모든 항목이 삭제되었습니다.');
      } catch (error) {
        console.error('셋리스트 업데이트 실패:', error);
      }
      return;
    }
    
    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        flexibleCards: allFlexibleCards,
        currentSongIndex: newCurrentSongIndex,
        updatedAt: Timestamp.now()
      });
      
      console.log(`🗑️ "${currentSong.title}" 곡이 삭제되었습니다.`);
    } catch (error) {
      console.error('곡 삭제 처리 실패:', error);
    }
  };

  // 닉네임카드 삭제 처리
  const deleteFlexibleCardFromSetList = async (currentCard: FlexibleCard, currentIndex: number) => {
    if (!activeSetList) return;

    // 현재 카드를 제거하고 순서 재정렬 (allItems 기준으로)
    const remainingItems = allItems.filter((_, index) => index !== currentIndex);
    const updatedSongs = remainingItems.filter(isSetListItem).map((song, index) => ({ ...song, order: index }));
    const updatedFlexibleCards = remainingItems.filter(isFlexibleCard).map((card, index) => ({ 
      ...card, 
      order: updatedSongs.length + index 
    }));

    // 셋리스트에 추가되지 않은 기존 카드들도 유지
    const remainingUnlistedCards = (activeSetList.flexibleCards || []).filter(card => card.order < 0);
    const allFlexibleCards = [...updatedFlexibleCards, ...remainingUnlistedCards];
    
    // 현재 진행 중인 카드 인덱스 계산
    const currentActiveIndex = activeSetList.currentSongIndex || 0;
    let newCurrentSongIndex: number;
    
    if (remainingItems.length === 0) {
      // 모든 항목이 삭제된 경우
      newCurrentSongIndex = 0;
    } else if (currentIndex < currentActiveIndex) {
      // 진행 중인 카드보다 앞의 카드를 삭제한 경우
      newCurrentSongIndex = currentActiveIndex - 1;
    } else if (currentIndex === currentActiveIndex) {
      // 진행 중인 카드 자체를 삭제한 경우
      newCurrentSongIndex = currentActiveIndex >= remainingItems.length ? remainingItems.length - 1 : currentActiveIndex;
    } else {
      // 진행 중인 카드보다 뒤의 카드를 삭제한 경우
      newCurrentSongIndex = currentActiveIndex;
    }
    
    // 모든 항목이 삭제되었는지 확인
    if (remainingItems.length === 0) {
      try {
        await updateDoc(doc(db, 'setlists', activeSetList.id!), {
          songs: updatedSongs,
          flexibleCards: allFlexibleCards,
          currentSongIndex: 0,
          updatedAt: Timestamp.now()
        });
        console.log('모든 항목이 삭제되었습니다.');
      } catch (error) {
        console.error('셋리스트 업데이트 실패:', error);
      }
      return;
    }
    
    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        flexibleCards: allFlexibleCards,
        currentSongIndex: newCurrentSongIndex,
        updatedAt: Timestamp.now()
      });
      
      console.log(`🗑️ "${currentCard.nickname} ${currentCard.totalSlots}곡" 카드가 삭제되었습니다.`);
    } catch (error) {
      console.error('카드 삭제 처리 실패:', error);
    }
  };

  const {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    isDragging,
    dragDistance,
    isReadyToComplete,
    isReadyToDelete,
    completionThreshold,
    deletionThreshold
  } = useSwipeGestures(
    isLeader, 
    currentCardIndex, 
    activeSetList, 
    setCurrentCardIndex, 
    completeCurrentSong,
    deleteCurrentSong,
    allItems.length // 전체 아이템 수 (곡 + 닉네임카드) 전달
  );

  // currentSongIndex와 로컬 currentCardIndex 동기화
  useEffect(() => {
    if (activeSetList && typeof activeSetList.currentSongIndex === 'number') {
      // 현재 인덱스가 전체 항목 수를 초과하지 않도록 보정
      const validIndex = Math.min(activeSetList.currentSongIndex, Math.max(0, allItems.length - 1));
      setCurrentCardIndex(validIndex);
    } else if (activeSetList && activeSetList.currentSongIndex === undefined) {
      setCurrentCardIndex(0);
    }
  }, [activeSetList, allItems.length]);

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

  // 참가자 변경 시 사용 가능한 곡 필터링
  useEffect(() => {
    const attendees = participants.map(p => p.trim()).filter(Boolean);
    
    if (attendees.length === 0) {
      setAvailableSongs([]);
      return;
    }

    const filtered = songs.filter(song => {
      if (!Array.isArray(song.members) || song.members.length === 0) return false;
      return song.members.every(member => attendees.includes(member.trim()));
    });
    setAvailableSongs(filtered);
  }, [participants, songs]);

  // 현재 카드 인덱스 보정 (항목 개수가 변경될 때)
  useEffect(() => {
    if (activeSetList && currentCardIndex >= allItems.length && allItems.length > 0) {
      setCurrentCardIndex(allItems.length - 1);
    } else if (!activeSetList || allItems.length === 0) {
      setCurrentCardIndex(0);
    }
  }, [activeSetList, currentCardIndex, allItems.length]);

  // 곡을 셋리스트에 추가
  const addSongToSetList = useCallback(async (song: Song, insertAtIndex?: number) => {
    if (!activeSetList || !isLeader) return;

    const isAlreadyAdded = activeSetList.songs.some(s => s.songId === song.id);
    if (isAlreadyAdded) {
      console.log('이미 셋리스트에 추가된 곡입니다.');
      return;
    }

    const newSong: SetListItem = {
      songId: song.id,
      title: song.title,
      members: song.members,
      order: 0 // 임시값, 아래에서 재설정
    };

    // 드래그앤드롭으로 추가할 때는 항상 마지막에 추가
    const insertIndex = allItems.length;
    
    // 기존 곡들 순서 정렬
    const sortedSongs = [...activeSetList.songs].sort((a, b) => a.order - b.order);
    
    // 새 곡을 삽입하고 순서 재배치
    const updatedSongs = [
      ...sortedSongs.slice(0, insertIndex),
      newSong,
      ...sortedSongs.slice(insertIndex)
    ].map((song, index) => ({ ...song, order: index }));

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });
      
      console.log(`"${song.title}" 곡이 셋리스트 끝에 추가되었습니다! 🎵`);
    } catch (error) {
      console.error('곡 추가 실패:', error);
    }
  }, [activeSetList, isLeader]);

  // 유연한 카드를 셋리스트에 추가
  const addFlexibleCardToSetList = useCallback(async (card: FlexibleCard, insertAtIndex?: number) => {
    if (!activeSetList || !isLeader) return;

    // order 값을 기준으로 이미 셋리스트에 추가된 카드인지 확인
    const isAlreadyAdded = (activeSetList.flexibleCards || []).some(c => c.id === card.id && c.order >= 0);
    if (isAlreadyAdded) {
      console.log('이미 셋리스트에 추가된 카드입니다.');
      return;
    }

    // 드래그앤드롭으로 추가할 때는 항상 마지막에 추가
    const insertIndex = allItems.length;
    
    // 새 유연한 카드의 order 설정
    const newFlexibleCard: FlexibleCard = {
      ...card,
      order: insertIndex
    };

    // 기존 항목들의 order 재정렬 (셋리스트에 추가된 카드만 포함)
    const existingFlexibleCards = (activeSetList.flexibleCards || []).filter(c => c.order >= 0);
    const existingSongs = activeSetList.songs || [];

    // 모든 항목을 합쳐서 order 재정렬
    const allUpdatedItems = [...existingSongs, ...existingFlexibleCards, newFlexibleCard]
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({ ...item, order: index }));

    // 곡과 유연한 카드 분리
    const updatedSongs = allUpdatedItems.filter(item => 'songId' in item) as SetListItem[];
    const updatedSetListCards = allUpdatedItems.filter(item => 'type' in item && item.type === 'flexible') as FlexibleCard[];
    
    // 셋리스트에 추가되지 않은 기존 카드들도 유지
    const remainingCards = (activeSetList.flexibleCards || []).filter(c => c.order < 0);
    const updatedFlexibleCards = [...updatedSetListCards, ...remainingCards];

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        flexibleCards: updatedFlexibleCards,
        updatedAt: Timestamp.now()
      });
      
      console.log(`"${card.nickname} ${card.totalSlots}곡" 카드가 셋리스트 끝에 추가되었습니다! 🎤`);
    } catch (error) {
      console.error('유연한 카드 추가 실패:', error);
    }
  }, [activeSetList, isLeader, allItems.length]);

  // 카드 네비게이션 함수들
  const goToNextCard = () => {
    if (currentCardIndex < allItems.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      console.log(`버튼 네비게이션: ${currentCardIndex} → ${currentCardIndex + 1} (총 ${allItems.length}개)`);
    }
  };

  const goToPrevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      console.log(`버튼 네비게이션: ${currentCardIndex} → ${currentCardIndex - 1} (총 ${allItems.length}개)`);
    }
  };

  const goToCard = (index: number) => {
    if (index >= 0 && index < allItems.length) {
      setCurrentCardIndex(index);
      console.log(`도트 네비게이션: ${currentCardIndex} → ${index} (총 ${allItems.length}개)`);
    }
  };

  // 검색된 사용 가능한 곡들
  const filteredAvailableSongs = availableSongs.filter(song =>
    song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    song.members.some(member => member.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // 드래그 앤 드롭 훅 (addSongToSetList와 filteredAvailableSongs가 정의된 후에 호출)
  const {
    availableCardDrag,
    insertIndex,
    handleAvailableCardTouchStart,
    handleAvailableCardTouchMove,
    handleAvailableCardTouchEnd,
    handleAvailableCardMouseDown,
    handleAvailableCardMouseMove,
    handleAvailableCardMouseUp,
    handleFlexibleCardTouchStart,
    handleFlexibleCardMouseDown
  } = useDragAndDrop(
    addSongToSetList, 
    addFlexibleCardToSetList,
    filteredAvailableSongs, 
    (activeSetList?.flexibleCards || []).filter(card => card.order < 0), // 셋리스트에 추가되지 않은 카드만
    allItems.length
  );

  // 드래그 중일 때 마지막 카드로 이동 (항상 마지막에 추가되므로)
  useEffect(() => {
    if (availableCardDrag && activeSetList && allItems.length > 0) {
      const lastIndex = allItems.length - 1;
      // 현재 보고 있는 카드가 마지막에서 2번째보다 앞에 있으면 마지막으로 이동
      if (currentCardIndex < lastIndex - 1) {
        setCurrentCardIndex(lastIndex);
      }
    }
  }, [availableCardDrag, activeSetList, currentCardIndex, allItems.length]);

  // editingFlexibleCard를 activeSetList 변경에 따라 실시간 업데이트
  useEffect(() => {
    if (editingFlexibleCard && activeSetList?.flexibleCards) {
      const updatedCard = activeSetList.flexibleCards.find(card => card.id === editingFlexibleCard.id);
      if (updatedCard && JSON.stringify(updatedCard) !== JSON.stringify(editingFlexibleCard)) {
        console.log('editingFlexibleCard 실시간 업데이트:', {
          이전: editingFlexibleCard,
          업데이트됨: updatedCard
        });
        setEditingFlexibleCard(updatedCard);
        
        // 현재 편집 중인 슬롯도 항상 업데이트 (강제 동기화)
        if (editingSlotIndex >= 0 && updatedCard.slots[editingSlotIndex]) {
          console.log('currentEditingSlot 강제 동기화:', updatedCard.slots[editingSlotIndex]);
          setCurrentEditingSlot({
            ...updatedCard.slots[editingSlotIndex],
            members: [...(updatedCard.slots[editingSlotIndex].members || [])]
          });
        }
      }
    }
  }, [activeSetList?.flexibleCards, editingSlotIndex]);

  return (
    <>
      <DragOverlay 
        dragData={availableCardDrag || undefined} 
        song={availableCardDrag?.type === 'song' ? filteredAvailableSongs.find(s => s.id === availableCardDrag.id) : undefined}
        flexibleCard={availableCardDrag?.type === 'flexible' ? (activeSetList?.flexibleCards || []).filter(card => card.order < 0).find(c => c.id === availableCardDrag.id) : undefined}
      />
      
      {activeSetList ? (
        <div style={{ 
          background: 'transparent', 
          borderRadius: '0', 
          padding: '0', 
          marginBottom: '30px',
          boxShadow: 'none',
          minHeight: '400px'
        }}>
          {/* 리더만 헤더 정보 표시 */}
          {isLeader && (
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#8A55CC', fontSize: '22px', marginBottom: '8px' }}>
                🎭 {activeSetList.name}
              </h2>
              <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
                현재 보는 항목: {currentCardIndex + 1} / {allItems.length} | 
                <span style={{ color: '#8A55CC', fontWeight: 600, marginLeft: '8px' }}>
                  진행 중: {(activeSetList.currentSongIndex ?? 0) + 1}번째 항목
                </span>
              </p>
            </div>
          )}

          {/* 메인 카드 영역 */}
          {allItems.length === 0 ? (
            <div 
              style={{ 
                position: 'relative', 
                height: '500px', 
                overflow: 'hidden',
                border: availableCardDrag ? '3px dashed #8A55CC' : '2px dashed #E5DAF5',
                borderRadius: '16px',
                background: availableCardDrag ? 'rgba(138, 85, 204, 0.05)' : 'rgba(138, 85, 204, 0.02)',
                transition: 'all 0.2s ease',
                touchAction: 'pan-y',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="main-card-area"
            >
              <div style={{ fontSize: '48px', marginBottom: '20px', color: '#E5DAF5' }}>🎵</div>
              <div style={{ color: '#666', fontSize: '18px', marginBottom: '12px' }}>
                {isLeader ? '아직 곡이 추가되지 않았습니다.' : '셋리스트가 준비 중입니다.'}
              </div>
              {isLeader ? (
                <div style={{ color: '#8A55CC', fontSize: '14px', fontWeight: 600 }}>
                  💡 아래 사용 가능한 곡을 여기로 드래그하여 추가하세요
                </div>
              ) : (
                <div style={{ color: '#8A55CC', fontSize: '14px', fontWeight: 600 }}>
                  리더가 곡을 추가하면 여기에 표시됩니다 😊
                </div>
              )}
            </div>
          ) : (
            <div 
              style={{ 
                position: 'relative', 
                height: '500px', 
                overflow: 'hidden',
                border: availableCardDrag ? '3px dashed #8A55CC' : 'none',
                borderRadius: availableCardDrag ? '16px' : '0',
                background: availableCardDrag ? 'rgba(138, 85, 204, 0.05)' : 'transparent',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                touchAction: 'pan-y'
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
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
                  animation: 'none'
                }}>
                  📀 여기로 드래그하여 셋리스트 끝에 추가
                </div>
              )}
              
              {/* 드래그 중일 때 마지막 위치 인디케이터 */}
              {availableCardDrag && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: '-100%',
                    width: '100%',
                    height: '100%',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    pointerEvents: 'none',
                    zIndex: 50
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      border: '3px dashed #10B981',
                      borderRadius: '16px',
                      background: 'rgba(16, 185, 129, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '48px',
                      color: '#10B981'
                    }}
                  >
                    +
                  </div>
                </div>
              )}
              
              {/* 모든 카드 */}
              {allItems.map((item, index) => {
                  const currentIndex = activeSetList.currentSongIndex ?? currentCardIndex;
                  const isCurrentCard = index === currentIndex;
                  const isNextCard = index === currentIndex + 1; // 다음 곡인지 확인
                  
                  // 드래그 중일 때는 카드 위치 조정 없음 (항상 마지막에 추가되므로)
                  let offset = (index - currentCardIndex) * 100;
                  
                  // 현재 카드에 드래그 효과 적용
                  if (isCurrentCard && isDragging && isLeader) {
                    // 위로 드래그하는 경우 카드를 위로 이동
                    if (dragDistance.y > 0 && Math.abs(dragDistance.x) < Math.abs(dragDistance.y)) {
                      offset -= Math.min(dragDistance.y, 100); // 최대 100픽셀까지만 이동
                    }
                    // 아래로 드래그하는 경우 카드를 아래로 이동
                    else if (dragDistance.y < 0 && Math.abs(dragDistance.x) < Math.abs(dragDistance.y)) {
                      offset += Math.min(Math.abs(dragDistance.y), 100); // 최대 100픽셀까지만 이동
                    }
                  }

                  // 현재 카드의 드래그 상태에 따른 시각적 효과 계산
                  const dragProgress = isCurrentCard && isDragging && isLeader && dragDistance.y > 0 
                    ? Math.min(dragDistance.y / completionThreshold, 1) 
                    : 0;
                  
                  const deleteDragProgress = isCurrentCard && isDragging && isLeader && dragDistance.y < 0 
                    ? Math.min(Math.abs(dragDistance.y) / deletionThreshold, 1) 
                    : 0;
                  
                  const cardScale = isCurrentCard 
                    ? (isDragging && isLeader ? 1.05 + (Math.max(dragProgress, deleteDragProgress) * 0.1) : 1)
                    : isNextCard 
                    ? 0.95 
                    : 0.9;
                  
                  const cardOpacity = isCurrentCard 
                    ? (isDragging && isLeader ? Math.max(0.7, 1 - Math.max(dragProgress, deleteDragProgress) * 0.3) : 1)
                    : isNextCard 
                    ? 0.8 
                    : 0.6;

                  return (
                    <div
                      key={item.type === 'song' ? item.songId : item.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: `${offset}%`,
                        width: '100%',
                        height: '100%',
                        transition: (isDragging && isCurrentCard) 
                          ? 'none' 
                          : availableCardDrag 
                          ? 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' 
                          : 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: `scale(${cardScale}) ${isDragging && isCurrentCard && isLeader ? `rotateZ(${dragProgress * 3}deg)` : ''}`,
                        opacity: cardOpacity,
                        filter: isCurrentCard && isReadyToComplete ? 'brightness(1.2) saturate(1.3)' : 'none'
                      }}
                    >
                      <div
                        onClick={() => {
                          if (item.type === 'flexible' && canEditFlexibleCard(item)) {
                            setEditingFlexibleCard(item);
                          }
                        }}
                        style={{
                          background: isCurrentCard ? 
                            isReadyToComplete 
                              ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' 
                              : isReadyToDelete
                              ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                              : 'linear-gradient(135deg, #8A55CC 0%, #A855F7 100%)' : 
                            isNextCard ?
                            'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)' :
                            item.type === 'flexible' ?
                            'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)' :
                            'linear-gradient(135deg, #F8F9FA 0%, #FFFFFF 100%)',
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
                            isReadyToComplete 
                              ? '0 25px 50px rgba(16, 185, 129, 0.6), 0 0 0 4px #10B981, 0 0 30px rgba(16, 185, 129, 0.3)' 
                              : isDragging && isLeader
                              ? '0 25px 50px rgba(138, 85, 204, 0.5), 0 0 0 3px #8A55CC'
                              : '0 20px 40px rgba(138, 85, 204, 0.4), 0 0 0 3px #8A55CC' : 
                            isNextCard ?
                            '0 16px 32px rgba(6, 182, 212, 0.3), 0 0 0 3px #06B6D4' :
                            '0 8px 24px rgba(0, 0, 0, 0.1)',
                          animation: isCurrentCard ? 
                            isReadyToComplete 
                              ? 'readyToComplete 0.5s ease-in-out infinite alternate'
                              : 'shine 3s ease-in-out infinite' : 
                            isNextCard ? 
                            'nextCardGlow 2s ease-in-out infinite' : 
                            'none',
                          border: isCurrentCard ? 
                            isReadyToComplete 
                              ? '4px solid #10B981' 
                              : '3px solid #8A55CC' : 
                            isNextCard ?
                            '3px solid #06B6D4' :
                            item.type === 'flexible' ?
                            '2px solid #F59E0B' :
                            '2px solid #E5E7EB',
                          cursor: item.type === 'flexible' && canEditFlexibleCard(item) ? 'pointer' : 'default',
                        }}
                      >
                        {/* 반짝반짝 효과를 위한 오버레이 */}
                        {isCurrentCard && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '-50%',
                              left: '-50%',
                              width: '200%',
                              height: '200%',
                              background: 'linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.3) 50%, transparent 70%)',
                              animation: 'sparkle 2.5s ease-in-out infinite',
                              pointerEvents: 'none',
                              zIndex: 1
                            }}
                          />
                        )}

                        {/* 다음곡 물결 효과를 위한 오버레이 */}
                        {isNextCard && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '-50%',
                              left: '-50%',
                              width: '200%',
                              height: '200%',
                              background: 'linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.2) 50%, transparent 70%)',
                              animation: 'nextCardWave 3s ease-in-out infinite',
                              pointerEvents: 'none',
                              zIndex: 1
                            }}
                          />
                        )}

                        {/* 완료 준비 상태 오버레이 */}
                        {isCurrentCard && isReadyToComplete && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              background: 'rgba(16, 185, 129, 0.95)',
                              color: '#fff',
                              padding: '20px 30px',
                              borderRadius: '20px',
                              fontSize: '18px',
                              fontWeight: 700,
                              zIndex: 1000,
                              textAlign: 'center',
                              boxShadow: '0 15px 35px rgba(16, 185, 129, 0.4)',
                              border: '3px solid #fff',
                              animation: 'pulse 0.3s ease-in-out infinite alternate'
                            }}
                          >
                            <div style={{ marginBottom: '8px', fontSize: '24px' }}>✅</div>
                            <div style={{ marginBottom: '4px' }}>완료 준비됨!</div>
                            <div style={{ fontSize: '12px', opacity: 0.9 }}>손을 떼면 완료됩니다</div>
                          </div>
                        )}

                        {/* 삭제 준비 상태 오버레이 */}
                        {isCurrentCard && isReadyToDelete && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              background: 'rgba(239, 68, 68, 0.95)',
                              color: '#fff',
                              padding: '20px 30px',
                              borderRadius: '20px',
                              fontSize: '18px',
                              fontWeight: 700,
                              zIndex: 1000,
                              textAlign: 'center',
                              boxShadow: '0 15px 35px rgba(239, 68, 68, 0.4)',
                              border: '3px solid #fff',
                              animation: 'pulse 0.3s ease-in-out infinite alternate'
                            }}
                          >
                            <div style={{ marginBottom: '8px', fontSize: '24px' }}>🗑️</div>
                            <div style={{ marginBottom: '4px' }}>삭제 준비됨!</div>
                            <div style={{ fontSize: '12px', opacity: 0.9 }}>손을 떼면 삭제됩니다</div>
                          </div>
                        )}

                        {/* 위로 드래그 진행도 표시 */}
                        {isCurrentCard && isDragging && isLeader && dragDistance.y > 0 && !isReadyToComplete && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '20px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: '80%',
                              height: '6px',
                              background: 'rgba(255, 255, 255, 0.3)',
                              borderRadius: '3px',
                              overflow: 'hidden',
                              zIndex: 1000
                            }}
                          >
                            <div
                              style={{
                                width: `${(dragProgress * 100)}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #8A55CC 0%, #10B981 100%)',
                                borderRadius: '3px',
                                transition: 'width 0.1s ease-out'
                              }}
                            />
                          </div>
                        )}

                        {/* 아래로 드래그 진행도 표시 */}
                        {isCurrentCard && isDragging && isLeader && dragDistance.y < 0 && !isReadyToDelete && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '20px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: '80%',
                              height: '6px',
                              background: 'rgba(255, 255, 255, 0.3)',
                              borderRadius: '3px',
                              overflow: 'hidden',
                              zIndex: 1000
                            }}
                          >
                            <div
                              style={{
                                width: `${(deleteDragProgress * 100)}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #8A55CC 0%, #EF4444 100%)',
                                borderRadius: '3px',
                                transition: 'width 0.1s ease-out'
                              }}
                            />
                          </div>
                        )}

                        {/* 위로 드래그 안내 텍스트 */}
                        {isCurrentCard && isDragging && isLeader && dragDistance.y > 0 && !isReadyToComplete && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '35px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              color: '#fff',
                              fontSize: '14px',
                              fontWeight: 600,
                              zIndex: 1000,
                              textAlign: 'center',
                              opacity: 0.9
                            }}
                          >
                            위로 더 드래그하세요 ({Math.round(dragProgress * 100)}%)
                          </div>
                        )}

                        {/* 아래로 드래그 안내 텍스트 */}
                        {isCurrentCard && isDragging && isLeader && dragDistance.y < 0 && !isReadyToDelete && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '35px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              color: '#fff',
                              fontSize: '14px',
                              fontWeight: 600,
                              zIndex: 1000,
                              textAlign: 'center',
                              opacity: 0.9
                            }}
                          >
                            아래로 더 드래그하세요 ({Math.round(deleteDragProgress * 100)}%)
                          </div>
                        )}


                        <div style={{ 
                          fontSize: '48px', 
                          marginBottom: '20px',
                          color: isCurrentCard ? '#fff' : isNextCard ? '#fff' : '#8A55CC',
                          position: 'relative',
                          zIndex: 10
                        }}>
                          {index + 1}
                        </div>
                        
                        <h3 style={{ 
                          fontSize: '24px', 
                          fontWeight: 700, 
                          marginBottom: '16px',
                          textAlign: 'center',
                          color: isCurrentCard ? '#fff' : isNextCard ? '#fff' : '#2D3748',
                          position: 'relative',
                          zIndex: 10
                        }}>
                          {item.type === 'song' ? item.title : `${item.nickname} (${item.totalSlots}곡)`}
                        </h3>
                        
                        {item.type === 'song' ? (
                          <p style={{ 
                            fontSize: '16px', 
                            marginBottom: isCurrentCard || isNextCard ? '40px' : '20px',
                            textAlign: 'center',
                            color: isCurrentCard ? 'rgba(255,255,255,0.9)' : isNextCard ? 'rgba(255,255,255,0.9)' : '#4A5568',
                            position: 'relative',
                            zIndex: 10
                          }}>
                            {item.members.join(', ')}
                          </p>
                        ) : (
                          <div style={{
                            marginBottom: isCurrentCard || isNextCard ? '100px' : '80px', // 안내문구를 위한 공간 확보
                            position: 'relative',
                            zIndex: 10
                          }}>
                            {/* 각 슬롯별 세부 정보 */}
                            <div style={{ 
                              maxHeight: isCurrentCard || isNextCard ? '100px' : '120px', // 진행률 제거로 높이 증가
                              overflowY: 'auto',
                              padding: '0 8px'
                            }}>
                              {item.slots.map((slot, slotIndex) => {
                                const getSlotIcon = (type: string) => {
                                  switch (type) {
                                    case 'solo': return '🎤';
                                    case 'duet': return '👥';
                                    case 'chorus': return '🎵';
                                    default: return '📝';
                                  }
                                };
                                
                                const getSlotTypeText = (type: string) => {
                                  switch (type) {
                                    case 'solo': return '솔로';
                                    case 'duet': return '듀엣';
                                    case 'chorus': return '합창';
                                    default: return '미정';
                                  }
                                };
                                
                                return (
                                  <div 
                                    key={slotIndex}
                                    style={{ 
                                      fontSize: '13px',
                                      marginBottom: '8px',
                                      textAlign: 'left',
                                      color: isCurrentCard ? 'rgba(255,255,255,0.85)' : isNextCard ? 'rgba(255,255,255,0.85)' : '#666',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      opacity: slot.isCompleted ? 0.7 : 1
                                    }}
                                  >
                                    <span style={{ fontSize: '14px', minWidth: '18px' }}>
                                      {slot.isCompleted ? '✅' : getSlotIcon(slot.type)}
                                    </span>
                                    <span style={{ fontWeight: 600, minWidth: '45px', fontSize: '13px' }}>
                                      {slotIndex + 1}번:
                                    </span>
                                    <span style={{ 
                                      flex: 1,
                                      textDecoration: slot.isCompleted ? 'line-through' : 'none',
                                      fontSize: '13px'
                                    }}>
                                      {slot.type === 'empty' ? (
                                        <span style={{ color: isCurrentCard || isNextCard ? 'rgba(255,255,255,0.6)' : '#999' }}>
                                          미정
                                        </span>
                                      ) : (
                                        <>
                                          <span style={{ fontWeight: 600 }}>
                                            {getSlotTypeText(slot.type)}
                                          </span>
                                          {slot.title && (
                                            <span> - {slot.title}</span>
                                          )}
                                          {slot.members && slot.members.length > 0 && (
                                            <span style={{ 
                                              fontSize: '12px', 
                                              color: isCurrentCard || isNextCard ? 'rgba(255,255,255,0.7)' : '#888',
                                              marginLeft: '4px'
                                            }}>
                                              ({slot.members.join(', ')})
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 다음 곡 안내 문구 */}
                        {!isCurrentCard && index === (activeSetList.currentSongIndex || 0) + 1 && (
                          <div style={{
                            position: 'absolute',
                            bottom: '10px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: '#10B981',
                            color: '#fff',
                            padding: '8px 16px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textAlign: 'center',
                            maxWidth: '90%',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                            zIndex: 100,
                            whiteSpace: 'nowrap'
                          }}>
                            🎤 다음 무대를 위해 미리 준비해주세요
                          </div>
                        )}

                        {/* 현재 곡에서 다음 곡 안내 메시지 */}
                        {isCurrentCard && currentIndex < allItems.length - 1 && (
                          <div style={{
                            position: 'absolute',
                            bottom: '10px', // 최하단으로 이동
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: '#10B981',
                            color: '#fff',
                            padding: '8px 16px',
                            borderRadius: '16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            animation: 'none',
                            whiteSpace: 'nowrap',
                            zIndex: 100,
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                            maxWidth: '85%',
                            textAlign: 'center'
                          }}>
                            {(() => {
                              const nextItem = allItems[currentIndex + 1];
                              if (!nextItem) return '';
                              
                              const nextTitle = nextItem.type === 'song' 
                                ? nextItem.title 
                                : `${nextItem.nickname} (${nextItem.totalSlots}곡)`;
                              
                              return `🎤 다음: ${nextTitle.length > 15 ? nextTitle.substring(0, 15) + '...' : nextTitle}`;
                            })()}
                          </div>
                        )}



                        {/* 마지막 항목일 때 완료 메시지 */}
                        {isCurrentCard && currentIndex === allItems.length - 1 && (
                          <>
                            <div style={{
                              position: 'absolute',
                              bottom: '10px', // 최하단으로 이동
                              left: '50%',
                              transform: 'translateX(-50%)',
                              background: '#F59E0B',
                              color: '#fff',
                              padding: '8px 16px',
                              borderRadius: '16px',
                              fontSize: '12px',
                              fontWeight: 600,
                              animation: 'none',
                              whiteSpace: 'nowrap',
                              zIndex: 100,
                              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
                            }}>
                              🎉 마지막 곡입니다. 수고하셨습니다!
                            </div>


                          </>
                        )}

                        {/* 유연한 카드 편집 안내 */}
                        {item.type === 'flexible' && canEditFlexibleCard(item) && !isCurrentCard && !isNextCard && (
                          <div style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            background: '#F59E0B',
                            color: '#fff',
                            padding: '4px 8px',
                            borderRadius: '8px',
                            fontSize: '10px',
                            fontWeight: 600,
                            zIndex: 10
                          }}>
                            편집
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

              {/* 네비게이션 버튼들은 리더가 아닐 때만 표시 (리더는 스와이프로 제어) */}
              {!isLeader && (
                <>
                  <button
                    onClick={goToPrevCard}
                    disabled={currentCardIndex === 0}
                    style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: currentCardIndex === 0 ? '#ccc' : '#8A55CC',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '50px',
                      height: '50px',
                      fontSize: '24px',
                      cursor: currentCardIndex === 0 ? 'not-allowed' : 'pointer',
                      zIndex: 10,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    }}
                  >
                    ‹
                  </button>

                  <button
                    onClick={goToNextCard}
                    disabled={currentCardIndex === allItems.length - 1}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: currentCardIndex === allItems.length - 1 ? '#ccc' : '#8A55CC',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '50px',
                      height: '50px',
                      fontSize: '24px',
                      cursor: currentCardIndex === allItems.length - 1 ? 'not-allowed' : 'pointer',
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
          {allItems.length > 0 && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              gap: allItems.length > 20 ? '2px' : '3px',
              marginTop: '20px',
              padding: '0 10px',
              flexWrap: 'wrap',
              maxWidth: '100%',
              overflow: 'hidden',
              maxHeight: '60px',
              overflowY: 'auto'
            }}>
              {allItems.map((_, index) => {
                const isCurrentlyPlaying = index === (activeSetList.currentSongIndex ?? 0);
                const isCurrentlyViewing = index === currentCardIndex;
                const dotSize = allItems.length > 30 ? '4px' : allItems.length > 20 ? '5px' : '6px';
                const activeDotSize = allItems.length > 30 ? '6px' : allItems.length > 20 ? '7px' : '8px';
                
                return (
                  <button
                    key={index}
                    onClick={() => goToCard(index)}
                    style={{
                      width: isCurrentlyPlaying ? activeDotSize : dotSize,
                      height: isCurrentlyPlaying ? activeDotSize : dotSize,
                      borderRadius: '50%',
                      border: 'none',
                      background: isCurrentlyPlaying ? '#8A55CC' : isCurrentlyViewing ? '#A855F7' : '#D1D5DB',
                      cursor: 'pointer',
                      transition: 'all 0.1s ease',
                      boxShadow: 'none',
                      opacity: isCurrentlyPlaying ? 1 : isCurrentlyViewing ? 0.8 : 0.5,
                      padding: '0',
                      flexShrink: 0,
                      minWidth: dotSize,
                      minHeight: dotSize,
                      margin: '1px'
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* 일반 사용자용 안내 메시지 */}
          {!isLeader && (
            <div style={{ 
              marginTop: '30px',
              padding: '20px',
              background: 'linear-gradient(135deg, #F3E8FF 0%, #E5DAF5 100%)',
              borderRadius: '12px',
              textAlign: 'center',
              border: '2px solid #E5DAF5'
            }}>
              <div style={{ fontSize: '24px', marginBottom: '12px' }}>🎵</div>
              <p style={{ color: '#666', fontSize: '14px', margin: 0, lineHeight: 1.4 }}>
                현재 진행 중인 셋리스트를 카드 형태로 확인할 수 있습니다.<br/>
                리더가 곡을 관리하고 있으니 편안히 감상해주세요! 😊
              </p>
            </div>
          )}

          {/* 리더만 사용 가능한 곡 카드들 */}
          {isLeader && (
            <div style={{ marginTop: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ color: '#8A55CC', fontSize: '18px', margin: 0 }}>
                  사용 가능한 곡
                </h3>
                <button
                  onClick={() => setShowFlexibleCardForm(!showFlexibleCardForm)}
                  style={{
                    background: '#F59E0B',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
                  }}
                >
                  {showFlexibleCardForm ? '❌ 취소' : '➕ 닉네임 카드 추가'}
                </button>
              </div>

              {/* 유연한 카드 생성 폼 */}
              {showFlexibleCardForm && (
                <div style={{
                  background: '#FEF3C7',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '16px',
                  border: '2px solid #F59E0B'
                }}>
                  <h4 style={{ color: '#92400E', fontSize: '16px', marginBottom: '16px', margin: '0 0 16px 0' }}>
                    🎤 닉네임 카드 생성
                  </h4>
                  
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1', minWidth: '150px' }}>
                      <label style={{ color: '#92400E', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        닉네임
                      </label>
                      <input
                        type="text"
                        value={flexibleCardNickname}
                        onChange={(e) => setFlexibleCardNickname(e.target.value)}
                        placeholder="예: 민주"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '2px solid #F59E0B',
                          borderRadius: '8px',
                          fontSize: '14px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    
                    <div style={{ flex: '0 0 100px' }}>
                      <label style={{ color: '#92400E', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        곡수
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={flexibleCardCount}
                        onChange={(e) => setFlexibleCardCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '2px solid #F59E0B',
                          borderRadius: '8px',
                          fontSize: '14px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => {
                        setShowFlexibleCardForm(false);
                        setFlexibleCardNickname('');
                        setFlexibleCardCount(3);
                      }}
                      style={{
                        background: '#E5E7EB',
                        color: '#6B7280',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 16px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      취소
                    </button>
                    <button
                      onClick={createFlexibleCard}
                      disabled={!flexibleCardNickname.trim()}
                      style={{
                        background: !flexibleCardNickname.trim() ? '#D1D5DB' : '#F59E0B',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 16px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: !flexibleCardNickname.trim() ? 'not-allowed' : 'pointer',
                        boxShadow: !flexibleCardNickname.trim() ? 'none' : '0 2px 8px rgba(245, 158, 11, 0.3)'
                      }}
                    >
                      카드 생성
                    </button>
                  </div>
                </div>
              )}

              <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px', textAlign: 'center', margin: '0 0 16px 0' }}>
                💡 카드를 위쪽 메인 카드로 드래그하여 셋리스트에 추가하세요
              </p>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '12px', 
                padding: '10px 0',
                touchAction: availableCardDrag ? 'none' : 'auto'
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
                    const isDragging = availableCardDrag?.type === 'song' && availableCardDrag?.id === song.id;
                    
                    return (
                      <div
                        key={song.id}
                        onTouchStart={(e) => handleAvailableCardTouchStart(e, song)}
                        onTouchMove={handleAvailableCardTouchMove}
                        onTouchEnd={handleAvailableCardTouchEnd}
                        onMouseDown={(e) => handleAvailableCardMouseDown(e, song)}
                        onMouseMove={handleAvailableCardMouseMove}
                        onMouseUp={handleAvailableCardMouseUp}
                        onClick={(e) => {
                          // 드래그 중이었다면 클릭 이벤트 무시
                          if (e.currentTarget.getAttribute('data-dragging') === 'true') {
                            return;
                          }
                          
                          if (!isAlreadyAdded) {
                            addSongToSetList(song);
                          }
                        }}
                        style={{
                          width: '100%',
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
                          touchAction: isDragging ? 'none' : 'auto',
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

              {/* 생성된 유연한 카드들 (셋리스트에 추가되지 않은 것들) */}
              {(activeSetList.flexibleCards || []).filter(card => card.order < 0).length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h4 style={{ color: '#F59E0B', fontSize: '16px', marginBottom: '12px', textAlign: 'center' }}>
                    🎤 생성된 닉네임 카드들
                  </h4>
                  
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '12px', 
                    padding: '10px 0'
                  }}>
                    {(activeSetList.flexibleCards || []).filter(card => card.order < 0).map((flexCard) => {
                      const isDragging = availableCardDrag?.type === 'flexible' && availableCardDrag?.id === flexCard.id;
                      
                      return (
                        <div
                          key={flexCard.id}
                          onTouchStart={(e) => {
                            if (isLeader) {
                              handleFlexibleCardTouchStart(e, flexCard);
                            }
                          }}
                          onTouchMove={handleAvailableCardTouchMove}
                          onTouchEnd={handleAvailableCardTouchEnd}
                          onMouseDown={(e) => {
                            if (isLeader) {
                              handleFlexibleCardMouseDown(e, flexCard);
                            }
                          }}
                          onMouseMove={handleAvailableCardMouseMove}
                          onMouseUp={handleAvailableCardMouseUp}
                          style={{
                            width: '100%',
                            height: '120px',
                            background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                            borderRadius: '12px',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            position: 'relative',
                            cursor: canEditFlexibleCard(flexCard) ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)',
                            border: '2px solid #F59E0B',
                            opacity: canEditFlexibleCard(flexCard) ? (isDragging ? 0.3 : 1) : 0.6,
                            userSelect: 'none',
                            transform: isDragging ? 'scale(0.95)' : 'none'
                          }}
                          onClick={(e) => {
                            // 드래그 중이었다면 클릭 이벤트 무시
                            if (e.currentTarget.getAttribute('data-dragging') === 'true') {
                              return;
                            }
                            
                            if (canEditFlexibleCard(flexCard)) {
                              console.log('유연한 카드 편집 모달 열기:', flexCard);
                              setEditingFlexibleCard(flexCard);
                            }
                          }}
                        >
                        {/* 닉네임 아이콘 */}
                        <div style={{ 
                          fontSize: '24px', 
                          marginBottom: '8px',
                          color: '#92400E'
                        }}>
                          🎤
                        </div>
                        
                        {/* 닉네임과 곡수 */}
                        <h4 style={{ 
                          fontSize: '16px', 
                          fontWeight: 700, 
                          marginBottom: '6px',
                          textAlign: 'center',
                          color: '#92400E',
                          margin: '0 0 6px 0'
                        }}>
                          {flexCard.nickname}
                        </h4>
                        
                        {/* 진행 상황 */}
                        <p style={{ 
                          fontSize: '12px', 
                          textAlign: 'center',
                          color: '#A16207',
                          margin: 0
                        }}>
                          {flexCard.slots.filter(slot => slot.isCompleted).length} / {flexCard.totalSlots} 곡
                        </p>

                        {/* 편집 안내 */}
                        <div style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          background: canEditFlexibleCard(flexCard) ? '#F59E0B' : '#9CA3AF',
                          color: '#fff',
                          padding: '2px 6px',
                          borderRadius: '8px',
                          fontSize: '10px',
                          fontWeight: 600
                        }}>
                          {canEditFlexibleCard(flexCard) ? '편집' : '읽기전용'}
                        </div>

                        {/* 셋리스트에 추가 버튼 */}
                        {isLeader && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addFlexibleCardToSetList(flexCard);
                            }}
                            style={{
                              position: 'absolute',
                              bottom: '6px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              background: '#10B981',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '10px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              zIndex: 10
                            }}
                          >
                            셋리스트에 추가
                          </button>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
      )}

      {/* 유연한 카드 편집 모달 */}
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
            overflowY: 'auto',
            transform: isModalCompleting ? 'scale(0.98)' : 'scale(1)',
            opacity: isModalCompleting ? 0.95 : 1,
            transition: 'all 0.3s ease'
          }}>
            {isModalCompleting ? (
              // 완료 상태 UI
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                minHeight: '200px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  fontSize: '80px',
                  marginBottom: '20px',
                  animation: 'bounce 0.8s ease-in-out infinite alternate'
                }}>
                  ✅
                </div>
                <h2 style={{
                  color: '#10B981',
                  fontSize: '24px',
                  fontWeight: 700,
                  marginBottom: '12px',
                  margin: 0
                }}>
                  제출 완료되었습니다!
                </h2>
                <p style={{
                  color: '#6B7280',
                  fontSize: '16px',
                  margin: '12px 0 0 0'
                }}>
                  {editingFlexibleCard.nickname}님의 {editingFlexibleCard.totalSlots}곡이 모두 선택되었어요 🎵
                </p>
                <div style={{
                  width: '100%',
                  height: '4px',
                  background: '#E5E7EB',
                  borderRadius: '2px',
                  marginTop: '24px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(90deg, #10B981, #34D399)',
                    borderRadius: '2px',
                    animation: 'progressComplete 1.5s ease-out'
                  }} />
                </div>
              </div>
            ) : (
              // 기존 편집 UI
              <>
                <style>
                  {`
                    @keyframes bounce {
                      0% { transform: translateY(0px); }
                      100% { transform: translateY(-10px); }
                    }
                    @keyframes progressComplete {
                      0% { width: 0%; }
                      100% { width: 100%; }
                    }
                  `}
                </style>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
               <div>
                 <h3 style={{ color: '#F59E0B', fontSize: '20px', margin: 0 }}>
                   🎤 {editingFlexibleCard.nickname} 카드 편집
                 </h3>
                 <p style={{ color: '#666', fontSize: '12px', margin: '4px 0 0 0' }}>
                   {isLeader ? '리더 권한으로 편집 중' : '카드 소유자로 편집 중'}
                 </p>
               </div>
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

            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: '#666', fontSize: '14px', margin: '0 0 16px 0' }}>
                {editingFlexibleCard.nickname}님의 {editingFlexibleCard.totalSlots}곡 카드입니다. 아래에서 곡을 선택하세요.
              </p>
              
                            {editingFlexibleCard.slots.map((slot, slotIndex) => (
                <div
                  key={`${editingFlexibleCard.id}-slot-${slotIndex}-${slot.id}`}
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
                  .map((slot, originalIndex) => ({ ...slot, slotIndex: originalIndex }))
                  .filter(slot => slot.title);
                
                return selectedSongs.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#8A55CC', marginBottom: '8px' }}>
                      선택된 곡 ({selectedSongs.length}/{editingFlexibleCard.totalSlots})
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                      {selectedSongs.map((slot) => (
                        <div
                          key={`${editingFlexibleCard.id}-selected-${slot.slotIndex}-${slot.id}`}
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
                              // songId 필드를 제거하고 나머지 필드들을 초기화
                              const { songId, ...resetSlot } = slot;
                              const updatedSlot: FlexibleSlot = {
                                ...resetSlot,
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
                          
                          // 곡 선택 후 모든 슬롯이 채워졌는지 확인
                          const selectedCount = editingFlexibleCard.slots.filter(slot => slot.title).length + 1; // +1은 방금 선택한 곡
                          if (selectedCount >= editingFlexibleCard.totalSlots) {
                            // 완료 상태로 변경하고 애니메이션 시작
                            setIsModalCompleting(true);
                            
                            // 2초 후 모달 닫기
                            setTimeout(() => {
                              setEditingFlexibleCard(null);
                              setSlotSearchTerm('');
                              setIsModalCompleting(false);
                            }, 2000);
                          }
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
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default SetListCards;