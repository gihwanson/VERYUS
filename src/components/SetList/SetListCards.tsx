import React, { useState, useEffect, useCallback } from 'react';
import { updateDoc, doc, Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSetListData } from './hooks/useSetListData';
import { useSwipeGestures } from './hooks/useSwipeGestures';
import FlexibleCardManager from './components/FlexibleCardManager';
import type { Song, SetListItem, FlexibleCard, FlexibleSlot, SetListEntry, RequestSongCard, RequestSong } from './types';
import './styles.css';

interface SetListCardsProps {
  onSetListActivated?: () => void;
}

const SetListCards: React.FC<SetListCardsProps> = ({ onSetListActivated }) => {
  console.log('🎬 SetListCards 컴포넌트 렌더링 시작');
  
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

  // 신청곡 카드 편집 관련 상태
  const [editingRequestSongCard, setEditingRequestSongCard] = useState<RequestSongCard | null>(null);
  const [newSongTitle, setNewSongTitle] = useState('');
  
  // 모달 완료 상태 관리
  const [isModalCompleting, setIsModalCompleting] = useState<boolean>(false);
  
  // 드래그 활성화 상태 관리
  const [dragEnabled, setDragEnabled] = useState<boolean>(true);
  
  // 편집 모드 상태 관리
  const [isEditing, setIsEditing] = useState<boolean>(false);
  
  // 참가자 목록 및 합격곡 모달 관련 상태
  const [showPassedSongsModal, setShowPassedSongsModal] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<string>('');
  const [participantPassedSongs, setParticipantPassedSongs] = useState<Song[]>([]);
  const [loadingPassedSongs, setLoadingPassedSongs] = useState(false);
  
  // 모든 합격곡 모달 관련 상태
  const [showAllPassedSongsModal, setShowAllPassedSongsModal] = useState(false);
  const [allPassedSongs, setAllPassedSongs] = useState<Song[]>([]);
  const [loadingAllPassedSongs, setLoadingAllPassedSongs] = useState(false);
  const [songFilter, setSongFilter] = useState<'all' | 'solo' | 'duet' | 'group'>('all');
  
  // 닉네임카드 추가 관련 상태
  const [showNicknameCardModal, setShowNicknameCardModal] = useState(false);
  const [selectedNickname, setSelectedNickname] = useState<string>('');
  const [cardSlotCount, setCardSlotCount] = useState<number>(1);
  
  // 디버깅용 로그
  console.log('showNicknameCardModal 상태:', showNicknameCardModal);
  
  // 컴포넌트 언마운트 시 cleanup
  useEffect(() => {
    return () => {
      console.log('SetListCards 컴포넌트 언마운트 - 드래그 상태 정리');
      // 드래그 관련 상태 초기화
    };
  }, []);

  // 타입 가드 함수들
  const isSetListItem = (entry: SetListEntry): entry is SetListItem => {
    return 'songId' in entry;
  };

  const isFlexibleCard = (entry: SetListEntry): entry is FlexibleCard => {
    return 'type' in entry && entry.type === 'flexible';
  };

  const isRequestSongCard = (entry: SetListEntry): entry is RequestSongCard => {
    return 'type' in entry && entry.type === 'requestSong';
  };

  // 유연한 카드 편집 권한 체크 함수
  const canEditFlexibleCard = useCallback((card: FlexibleCard) => {
    return isLeader || card.nickname === currentUserNickname;
  }, [isLeader, currentUserNickname]);

  // 현재 카드가 본인 닉네임 카드인지 확인하는 함수
  const checkIsMyFlexibleCard = useCallback((item: SetListEntry | undefined) => {
    if (!item || !isFlexibleCard(item)) return false;
    return item.nickname === currentUserNickname;
  }, [currentUserNickname]);

  // undefined 값과 함수 제거 함수
  const removeUndefinedValues = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj === 'function') return null; // 함수 제거
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(removeUndefinedValues).filter(item => item !== null && item !== undefined);
    }
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && typeof value !== 'function') {
        cleaned[key] = removeUndefinedValues(value);
      }
    }
    return cleaned;
  };

  // 슬롯 업데이트 함수
  const updateFlexibleCardSlot = useCallback(async (cardId: string, slotIndex: number, updatedSlot: FlexibleSlot) => {
    if (!activeSetList) {
      console.error('활성 셋리스트가 없습니다.');
      return;
    }
    
    // flexibleCards에서 먼저 찾기
    let cardToUpdate = activeSetList.flexibleCards?.find(card => card.id === cardId);
    let isInSongs = false;
    
    // flexibleCards에서 찾지 못했으면 songs에서 찾기 (관리탭에서 추가한 닉네임카드)
    if (!cardToUpdate) {
      cardToUpdate = activeSetList.songs?.find((song: any) => song.id === cardId && song.nickname) as any;
      isInSongs = true;
    }
    
    if (!cardToUpdate) {
      console.error('업데이트할 카드를 찾을 수 없습니다.');
      return;
    }
    
    // 편집 권한 체크 (직접 구현)
    const hasEditPermission = isLeader || cardToUpdate.nickname === currentUserNickname;
    if (!hasEditPermission) {
      alert('이 카드를 편집할 권한이 없습니다.');
      return;
    }

    // undefined 값 제거
    const cleanedSlot = removeUndefinedValues(updatedSlot);
    console.log('정리된 슬롯 데이터:', cleanedSlot);

    const updatedSlots = [...cardToUpdate.slots];
    updatedSlots[slotIndex] = cleanedSlot;

    const updatedCard = removeUndefinedValues({ 
      ...cardToUpdate, 
      slots: updatedSlots
    });

    try {
      if (isInSongs) {
        // songs 배열에서 업데이트
        const updatedSongs = (activeSetList.songs || []).map((song: any) => 
          song.id === cardId ? updatedCard : song
        );
        
        await updateDoc(doc(db, 'setlists', activeSetList.id!), {
          songs: removeUndefinedValues(updatedSongs),
          updatedAt: Timestamp.now()
        });
      } else {
        // flexibleCards 배열에서 업데이트
        const updatedFlexibleCards = (activeSetList.flexibleCards || []).map(card => 
          card.id === cardId ? updatedCard : card
        );

        await updateDoc(doc(db, 'setlists', activeSetList.id!), {
          flexibleCards: removeUndefinedValues(updatedFlexibleCards),
          updatedAt: Timestamp.now()
        });
      }
      
      // 편집 중인 카드 업데이트
      setEditingFlexibleCard(updatedCard);
      console.log('슬롯 업데이트 성공:', cleanedSlot);
    } catch (error) {
      console.error('슬롯 업데이트 실패:', error);
      alert('슬롯 업데이트에 실패했습니다.');
    }
  }, [activeSetList, isLeader, currentUserNickname]);

  // 슬롯에 참가자 추가
  const addSlotParticipant = useCallback(() => {
    if (!editingFlexibleCard || !newParticipantName.trim() || editingSlotIndex < 0) return;
    
    const trimmedName = newParticipantName.trim();
    if (!currentEditingSlot) return;
    
    if (currentEditingSlot.members.includes(trimmedName)) {
      alert('이미 추가된 참가자입니다.');
      return;
    }

    const updatedSlot = {
      ...currentEditingSlot,
      members: [...currentEditingSlot.members, trimmedName]
    };
    
    updateFlexibleCardSlot(editingFlexibleCard.id, editingSlotIndex, updatedSlot);
    setCurrentEditingSlot(updatedSlot);
    setNewParticipantName('');
  }, [editingFlexibleCard, newParticipantName, editingSlotIndex, currentEditingSlot, updateFlexibleCardSlot]);

  // 슬롯에서 참가자 제거
  const removeSlotParticipant = useCallback((participantToRemove: string) => {
    if (!editingFlexibleCard || editingSlotIndex < 0 || !currentEditingSlot) return;
    
    const updatedSlot = {
      ...currentEditingSlot,
      members: currentEditingSlot.members.filter(member => member !== participantToRemove)
    };
    
    updateFlexibleCardSlot(editingFlexibleCard.id, editingSlotIndex, updatedSlot);
    setCurrentEditingSlot(updatedSlot);
  }, [editingFlexibleCard, editingSlotIndex, currentEditingSlot, updateFlexibleCardSlot]);

  // 슬롯 초기화 함수
  const resetSlot = useCallback(async (cardId: string, slotIndex: number) => {
    if (!editingFlexibleCard) return;
    
    const cardToUpdate = activeSetList?.flexibleCards?.find(card => card.id === cardId);
    if (!cardToUpdate) return;
    
    // 편집 권한 체크
    const hasEditPermission = isLeader || cardToUpdate.nickname === currentUserNickname;
    if (!hasEditPermission) {
      alert('이 카드를 편집할 권한이 없습니다.');
      return;
    }

    // 슬롯을 빈 상태로 초기화
    const resetSlot: FlexibleSlot = {
      id: cardToUpdate.slots[slotIndex].id,
      type: 'empty',
      members: [],
      isCompleted: false
    };

    try {
      await updateFlexibleCardSlot(cardId, slotIndex, resetSlot);
      console.log('슬롯 초기화 성공');
      } catch (error) {
      console.error('슬롯 초기화 실패:', error);
      alert('슬롯 초기화에 실패했습니다.');
    }
  }, [editingFlexibleCard, activeSetList, isLeader, currentUserNickname, updateFlexibleCardSlot]);

  // 본인이 합격한 곡들 가져오기
  const [myPassedSongs, setMyPassedSongs] = useState<Song[]>([]);
  
  const loadMyPassedSongs = useCallback(async () => {
    if (!currentUserNickname || !activeSetList) return;
    
    try {
      const q = query(
        collection(db, 'approvedSongs'), 
        where('members', 'array-contains', currentUserNickname)
      );
      const snap = await getDocs(q);
      const allSongs = snap.docs.map(doc => {
        const data = doc.data();
        return { 
          ...data, 
          id: doc.id,
          songId: doc.id,
          members: Array.isArray(data.members) ? data.members : []
        } as Song;
      });

      // 현재 셋리스트의 참가자 목록 가져오기
      const currentParticipants = activeSetList.participants || [];
      
      // 현재 참가자 목록에 있는 사람들만 포함된 곡만 필터링
      const filteredSongs = allSongs.filter(song => {
        if (!song.members || !Array.isArray(song.members)) return false;
        
        // 곡의 모든 참여자가 현재 셋리스트 참가자 목록에 있는지 확인
        return song.members.every(member => 
          currentParticipants.includes(member.trim())
        );
      });

      // 최신순 정렬(합격일 createdAt 기준)
      filteredSongs.sort((a, b) => ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setMyPassedSongs(filteredSongs);
    } catch (error) {
      console.error('합격곡 불러오기 오류:', error);
      setMyPassedSongs([]);
    }
  }, [currentUserNickname, activeSetList]);

  // 컴포넌트 마운트 시 합격곡 로드
  useEffect(() => {
    loadMyPassedSongs();
  }, [loadMyPassedSongs]);

  // 합격한 곡을 슬롯에 적용
  const applyPassedSongToSlot = useCallback(async (song: Song) => {
    if (!editingFlexibleCard || editingSlotIndex < 0 || !currentEditingSlot) {
      console.error('편집 상태가 올바르지 않습니다.');
      return;
    }

    console.log('합격곡 적용 시작:', song);
    
    // undefined 값 방지를 위해 기본값 설정
    const updatedSlot = {
      ...currentEditingSlot,
      title: song.title || '',
      artist: (song as any).artist || '',
      songId: (song as any).songId || song.id || '',
      type: 'solo' as const,
      members: song.members || [], // 합격곡의 참여자 목록을 자동으로 반영
      isCompleted: currentEditingSlot.isCompleted || false
    };
    
    // undefined 값이 있는지 확인
    const hasUndefined = Object.values(updatedSlot).some(value => value === undefined);
    if (hasUndefined) {
      console.error('undefined 값이 포함된 슬롯 데이터:', updatedSlot);
      alert('곡 정보에 문제가 있습니다.');
      return;
    }
    
    try {
      await updateFlexibleCardSlot(editingFlexibleCard.id, editingSlotIndex, updatedSlot);
      setCurrentEditingSlot(updatedSlot);
      console.log('합격곡 적용 성공');
    } catch (error) {
      console.error('합격곡 적용 실패:', error);
      alert('곡 선택에 실패했습니다.');
    }
  }, [editingFlexibleCard, editingSlotIndex, currentEditingSlot, updateFlexibleCardSlot]);


  // 모든 아이템 가져오기
  const getAllItems = useCallback(() => {
    if (!activeSetList) return [];
    
    // songs 배열에서 일반 곡과 닉네임카드 분리
    const regularSongs = activeSetList.songs.filter((song: any) => !song.nickname);
    const nicknameCards = activeSetList.songs.filter((song: any) => song.nickname);
    
    const songs = regularSongs.map(song => ({ ...song, type: 'song' as const }));
    const flexCards = (activeSetList.flexibleCards || [])
      .filter(card => card.order >= 0) // order가 0 이상인 카드만 셋리스트에 표시
      .map(card => ({ ...card, type: 'flexible' as const }));
    const requestSongCards = (activeSetList.requestSongCards || [])
      .filter(card => card.order >= 0) // order가 0 이상인 카드만 셋리스트에 표시
      .map(card => ({ ...card, type: 'requestSong' as const }));
    
    // 닉네임카드를 유연한 카드로 변환
    const convertedNicknameCards = nicknameCards.map(card => ({
      ...card,
      type: 'flexible' as const,
      totalSlots: (card as any).totalSlots || (card as any).slots?.length || 0
    }));
    
    return [...songs, ...flexCards, ...convertedNicknameCards, ...requestSongCards]
      .sort((a, b) => a.order - b.order);
  }, [activeSetList]);

  // 현재 곡 완료 처리
  const completeCurrentSong = useCallback(async () => {
    if (!activeSetList || !isLeader) return;
    
    const allItems = getAllItems();
    const currentItem = allItems[currentCardIndex];
    
    if (!currentItem) return;
    
    if (isSetListItem(currentItem)) {
      if (!confirm(`"${currentItem.title}"을 완료 처리하시겠습니까?`)) return;

      setIsModalCompleting(true);
      try {
    const completedSong = {
          ...currentItem,
      completedAt: Timestamp.now()
    };
    
        const updatedSongs = activeSetList.songs.filter(song => song.songId !== currentItem.songId);
        const updatedCompletedSongs = [...(activeSetList.completedSongs || []), completedSong];
        
        await updateDoc(doc(db, 'setlists', activeSetList.id!), {
          songs: updatedSongs,
          completedSongs: updatedCompletedSongs,
          updatedAt: Timestamp.now()
        });
        
        alert(`"${currentItem.title}"이 완료되었습니다! 🎉`);
        
        // 다음 카드로 이동
        if (currentCardIndex < allItems.length - 1) {
          setCurrentCardIndex(currentCardIndex + 1);
        }
      } catch (error) {
        console.error('곡 완료 실패:', error);
        alert('곡 완료에 실패했습니다.');
      } finally {
        setIsModalCompleting(false);
      }
    } else if (isFlexibleCard(currentItem)) {
      if (!confirm(`"${currentItem.nickname}" 카드를 완료 처리하시겠습니까?\n\n모든 슬롯의 참여자들이 통계에 기록됩니다.`)) return;

      setIsModalCompleting(true);
      try {
        // 모든 슬롯의 참여자들을 수집
        const allParticipants: string[] = [];
        if (currentItem.slots && Array.isArray(currentItem.slots)) {
          currentItem.slots.forEach(slot => {
            if (slot.members && Array.isArray(slot.members)) {
              allParticipants.push(...slot.members);
            }
          });
        }
        
        // 중복 제거
        const uniqueParticipants = [...new Set(allParticipants)];
        
    const completedCard = {
          ...currentItem,
          completedAt: Timestamp.now(),
          allParticipants: uniqueParticipants, // 통계용 참여자 목록 추가
          totalSlotsCompleted: currentItem.slots?.length || 0
        };
        
        // flexibleCards에서 제거
        const updatedFlexibleCards = (activeSetList.flexibleCards || []).map(card => 
          card.id === currentItem.id ? { ...card, order: -1 } : card
        );
        
        // songs에서도 제거 (관리탭에서 추가한 닉네임카드인 경우)
        const updatedSongs = (activeSetList.songs || []).filter((song: any) => song.id !== currentItem.id);
        
        const updatedCompletedFlexibleCards = [
          ...(activeSetList.completedFlexibleCards || []),
          completedCard
        ];

        await updateDoc(doc(db, 'setlists', activeSetList.id!), {
          flexibleCards: updatedFlexibleCards,
          songs: updatedSongs,
          completedFlexibleCards: updatedCompletedFlexibleCards,
          updatedAt: Timestamp.now()
        });
        
        const participantCount = uniqueParticipants.length;
        const slotCount = currentItem.slots?.length || 0;
        alert(`"${currentItem.nickname}" 카드가 완료되었습니다! 🎉\n\n📊 통계 기록: ${participantCount}명이 ${slotCount}곡 완료`);
        
        // 다음 카드로 이동
        if (currentCardIndex < allItems.length - 1) {
          setCurrentCardIndex(currentCardIndex + 1);
        }
    } catch (error) {
        console.error('유연한 카드 완료 실패:', error);
        alert('유연한 카드 완료에 실패했습니다.');
      } finally {
        setIsModalCompleting(false);
      }
    } else if (isRequestSongCard(currentItem)) {
      if (!confirm('이 신청곡 카드를 완료 처리하시겠습니까?')) return;

      setIsModalCompleting(true);
      try {
        const completedCard = {
          ...currentItem,
          completedAt: Timestamp.now()
        };
        
        const updatedRequestSongCards = (activeSetList.requestSongCards || []).map(card => 
          card.id === currentItem.id ? { ...card, order: -1 } : card
        );
        
        const updatedCompletedRequestSongCards = [
          ...(activeSetList.completedRequestSongCards || []),
          completedCard
        ];

        await updateDoc(doc(db, 'setlists', activeSetList.id!), {
          requestSongCards: updatedRequestSongCards,
          completedRequestSongCards: updatedCompletedRequestSongCards,
          updatedAt: Timestamp.now()
        });
        
        alert('신청곡 카드가 완료되었습니다! 🎉');
        
        // 다음 카드로 이동
        if (currentCardIndex < allItems.length - 1) {
          setCurrentCardIndex(currentCardIndex + 1);
        }
      } catch (error) {
        console.error('신청곡 카드 완료 실패:', error);
        alert('신청곡 카드 완료에 실패했습니다.');
      } finally {
        setIsModalCompleting(false);
      }
    }
  }, [activeSetList, isLeader, currentCardIndex, getAllItems]);

  // 현재 곡 삭제 처리
  const deleteCurrentSong = useCallback(async () => {
    if (!activeSetList || !isLeader) return;
    
    const allItems = getAllItems();
    const currentItem = allItems[currentCardIndex];
    
    if (!currentItem) return;
    
    if (isSetListItem(currentItem)) {
      if (!confirm(`"${currentItem.title}"을 셋리스트에서 제거하시겠습니까?`)) return;

      try {
        const updatedSongs = activeSetList.songs.filter(song => song.songId !== currentItem.songId);
        
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });
      
        alert('곡이 셋리스트에서 제거되었습니다.');
        
        // 현재 인덱스 조정
        if (currentCardIndex >= allItems.length - 1 && currentCardIndex > 0) {
          setCurrentCardIndex(currentCardIndex - 1);
        }
      } catch (error) {
        console.error('곡 제거 실패:', error);
        alert('곡 제거에 실패했습니다.');
      }
    } else if (isFlexibleCard(currentItem)) {
      // 닉네임카드 삭제 처리
      const cardTitle = currentItem.nickname ? `${currentItem.nickname}님의 닉네임카드` : '닉네임카드';
      if (!confirm(`"${cardTitle}"을 셋리스트에서 제거하시겠습니까?`)) return;

      try {
        // flexibleCards에서 제거
        const updatedFlexibleCards = (activeSetList.flexibleCards || []).filter(card => card.id !== currentItem.id);
        
        // songs에서도 제거 (관리탭에서 추가한 닉네임카드인 경우)
        const updatedSongs = (activeSetList.songs || []).filter((song: any) => song.id !== currentItem.id);
        
        await updateDoc(doc(db, 'setlists', activeSetList.id!), {
          flexibleCards: updatedFlexibleCards,
          songs: updatedSongs,
          updatedAt: Timestamp.now()
        });
        
        alert('닉네임카드가 셋리스트에서 제거되었습니다.');
        
        // 현재 인덱스 조정
        if (currentCardIndex >= allItems.length - 1 && currentCardIndex > 0) {
          setCurrentCardIndex(currentCardIndex - 1);
        }
      } catch (error) {
        console.error('닉네임카드 제거 실패:', error);
        alert('닉네임카드 제거에 실패했습니다.');
      }
    }
  }, [activeSetList, isLeader, currentCardIndex, getAllItems]);

  // 참가자 합격곡 로딩
  const loadParticipantPassedSongs = useCallback(async (participant: string) => {
    setLoadingPassedSongs(true);
    try {
      const q = query(
        collection(db, 'approvedSongs'),
        where('members', 'array-contains', participant)
      );
      const querySnapshot = await getDocs(q);
      const allSongs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Song[];

      // 현재 셋리스트의 참가자 목록 가져오기
      const currentParticipants = activeSetList?.participants || [];
      
      // 현재 참가자 목록에 있는 사람들만 포함된 곡만 필터링
      const filteredSongs = allSongs.filter(song => {
        if (!song.members || !Array.isArray(song.members)) return false;
        
        // 곡의 모든 참여자가 현재 셋리스트 참가자 목록에 있는지 확인
        return song.members.every((member: string) => 
          currentParticipants.includes(member.trim())
        );
      });

      setParticipantPassedSongs(filteredSongs as Song[]);
    } catch (error) {
      console.error('합격곡 가져오기 실패:', error);
      alert('합격곡을 가져오는데 실패했습니다.');
    } finally {
      setLoadingPassedSongs(false);
    }
  }, [activeSetList]);

  // 참가자 합격곡 모달 열기
  const openPassedSongsModal = useCallback((participant: string) => {
    setSelectedParticipant(participant);
    setShowPassedSongsModal(true);
    loadParticipantPassedSongs(participant);
  }, [loadParticipantPassedSongs]);

  // 모든 참가자들의 합격곡 로딩
  const loadAllPassedSongs = useCallback(async () => {
    setLoadingAllPassedSongs(true);
    try {
      if (!activeSetList || !activeSetList.participants) {
        setAllPassedSongs([]);
      return;
    }

      const currentParticipants = activeSetList.participants.filter(p => p.trim());
      if (currentParticipants.length === 0) {
        setAllPassedSongs([]);
        return;
      }

      // 모든 참가자들의 합격곡을 가져오기
      const allSongs: Song[] = [];
      
      for (const participant of currentParticipants) {
        const q = query(
          collection(db, 'approvedSongs'),
          where('members', 'array-contains', participant)
        );
        const querySnapshot = await getDocs(q);
        const participantSongs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // 현재 셋리스트 참가자와 관련된 곡만 필터링
        const filteredSongs = participantSongs.filter((song: any) => {
          if (!song.members || !Array.isArray(song.members)) return false;
          
          return song.members.every((member: string) => 
            currentParticipants.includes(member.trim())
          );
        });

        allSongs.push(...(filteredSongs as Song[]));
      }

      // 중복 제거 (같은 곡이 여러 참가자에게 있을 수 있음)
      const uniqueSongs = allSongs.filter((song, index, self) => 
        index === self.findIndex(s => s.id === song.id)
      );

      // 최신순 정렬
      uniqueSongs.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });

      setAllPassedSongs(uniqueSongs);
    } catch (error) {
      console.error('모든 합격곡 가져오기 실패:', error);
      alert('합격곡을 가져오는데 실패했습니다.');
    } finally {
      setLoadingAllPassedSongs(false);
    }
  }, [activeSetList]);

  // 모든 합격곡 모달 열기
  const openAllPassedSongsModal = useCallback(() => {
    setShowAllPassedSongsModal(true);
    setSongFilter('all'); // 필터 초기화
    loadAllPassedSongs();
  }, [loadAllPassedSongs]);

  // 닉네임카드 추가
  const addNicknameCardToSetList = useCallback(async () => {
    if (!activeSetList || !isLeader) {
      alert('활성 셋리스트가 없거나 권한이 없습니다.');
      return;
    }

    if (!selectedNickname.trim()) {
      alert('닉네임을 선택해주세요.');
      return;
    }

    if (cardSlotCount < 1 || cardSlotCount > 10) {
      alert('슬롯 수는 1개 이상 10개 이하여야 합니다.');
      return;
    }

    try {
      // 닉네임카드 생성
      const nicknameCard = {
        id: `nickname_${Date.now()}`,
        nickname: selectedNickname,
        totalSlots: cardSlotCount,
        slots: Array.from({ length: cardSlotCount }, (_, index) => ({
          title: '미정',
          artist: '미정',
          members: [],
          isCompleted: false
        })),
        order: (activeSetList.songs || []).length,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      // 셋리스트에 닉네임카드 추가
      const updatedSongs = [...(activeSetList.songs || []), nicknameCard];
      
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });

      alert(`"${selectedNickname}"님의 닉네임카드가 추가되었습니다! 🎭`);
      
      // 모달 닫기
      setShowNicknameCardModal(false);
      setSelectedNickname('');
      setCardSlotCount(1);
      
      // 상태 업데이트
      if (onSetListActivated) {
        onSetListActivated();
      }
    } catch (error) {
      console.error('닉네임카드 추가 실패:', error);
      alert('닉네임카드 추가에 실패했습니다.');
    }
  }, [activeSetList, isLeader, selectedNickname, cardSlotCount, onSetListActivated]);

  // 필터링된 곡들 계산
  const getFilteredSongs = useCallback(() => {
    if (songFilter === 'all') {
      return allPassedSongs;
    }
    
    return allPassedSongs.filter(song => {
      const memberCount = song.members?.length || 0;
      
      switch (songFilter) {
        case 'solo':
          return memberCount === 1;
        case 'duet':
          return memberCount === 2;
        case 'group':
          return memberCount >= 3;
        default:
          return true;
      }
    });
  }, [allPassedSongs, songFilter]);

  // 현재 닉네임카드 삭제
  const deleteCurrentFlexibleCard = useCallback(async () => {
    if (!activeSetList || !isLeader) return;
    
    const allItems = getAllItems();
    const currentItem = allItems[currentCardIndex];
    
    if (!currentItem) return;
    
    if (isFlexibleCard(currentItem)) {
      const cardTitle = currentItem.nickname ? `${currentItem.nickname}님의 닉네임카드` : '닉네임카드';
      if (!confirm(`"${cardTitle}"을 셋리스트에서 제거하시겠습니까?`)) return;

      try {
        // flexibleCards에서 제거
        const updatedFlexibleCards = (activeSetList.flexibleCards || []).filter(card => card.id !== currentItem.id);
        
        // songs에서도 제거 (관리탭에서 추가한 닉네임카드인 경우)
        const updatedSongs = (activeSetList.songs || []).filter((song: any) => song.id !== currentItem.id);
        
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        flexibleCards: updatedFlexibleCards,
          songs: updatedSongs,
        updatedAt: Timestamp.now()
      });
      
        alert('닉네임카드가 셋리스트에서 제거되었습니다.');
        
        // 현재 인덱스 조정
        if (currentCardIndex >= allItems.length - 1 && currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
        }
      } catch (error) {
        console.error('닉네임카드 제거 실패:', error);
        alert('닉네임카드 제거에 실패했습니다.');
      }
    }
  }, [activeSetList, isLeader, currentCardIndex, getAllItems]);

  // 스와이프 제스처 훅
  const {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    isDragging,
    dragDistance,
    isReadyToComplete,
    isReadyToDelete
  } = useSwipeGestures(
    isLeader, 
    currentCardIndex, 
    activeSetList, 
    setCurrentCardIndex, 
    completeCurrentSong,
    deleteCurrentSong,
    getAllItems().length,
    () => {
      const allItems = getAllItems();
      if (currentCardIndex < allItems.length - 1) {
        setCurrentCardIndex(currentCardIndex + 1);
      }
    },
    () => {
      if (currentCardIndex > 0) {
        setCurrentCardIndex(currentCardIndex - 1);
      }
    },
    dragEnabled
  );

  // 현재 카드 인덱스가 범위를 벗어나지 않도록 조정
  useEffect(() => {
    const allItems = getAllItems();
    if (currentCardIndex >= allItems.length && allItems.length > 0) {
      setCurrentCardIndex(Math.max(0, allItems.length - 1));
    }
  }, [currentCardIndex, getAllItems]);

  if (!activeSetList) {
    return (
      <div style={{ 
        padding: 40, 
        textAlign: 'center', 
        color: 'rgba(255, 255, 255, 0.8)',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        borderRadius: 20,
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
        <p style={{ fontSize: 16, margin: 0 }}>활성 셋리스트가 없습니다.</p>
        <p style={{ fontSize: 14, margin: '8px 0 0 0', color: 'rgba(255, 255, 255, 0.6)' }}>
          먼저 셋리스트를 생성하거나 활성화해주세요.
        </p>
      </div>
    );
  }

  const allItems = getAllItems();
  const currentItem = allItems[currentCardIndex];

  if (allItems.length === 0) {
    return (
        <div style={{ 
        padding: 40, 
              textAlign: 'center', 
        color: 'rgba(255, 255, 255, 0.8)',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
              borderRadius: 20,
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
        <p style={{ fontSize: 16, margin: 0 }}>셋리스트가 비어있습니다.</p>
        <p style={{ fontSize: 14, margin: '8px 0 0 0', color: 'rgba(255, 255, 255, 0.6)' }}>
          곡을 추가하거나 유연한 카드를 생성해보세요.
        </p>
        
        {/* 닉네임카드 추가 버튼 */}
        {isLeader && (
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button
              onClick={() => {
                console.log('닉네임카드 추가 버튼 클릭됨');
                setShowNicknameCardModal(true);
              }}
              style={{
                background: 'rgba(168, 85, 247, 0.8)',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                padding: '12px 24px',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                margin: '0 auto'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(168, 85, 247, 0.9)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(168, 85, 247, 0.8)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span style={{ fontSize: 16 }}>🎭</span>
              닉네임카드 추가
            </button>
            <p style={{ 
              fontSize: 12, 
              margin: '8px 0 0 0', 
              color: 'rgba(255, 255, 255, 0.5)',
              fontStyle: 'italic'
            }}>
              관리탭에서 참가자를 추가한 후 닉네임카드를 생성할 수 있습니다.
            </p>
          </div>
        )}
            </div>
    );
  }

  return (
    <div style={{ 
      maxWidth: window.innerWidth < 768 ? '100%' : '1400px', 
      margin: '0 auto', 
      padding: window.innerWidth < 768 ? '5px' : '20px',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* 현재 카드 */}
      {currentItem && (
        <div
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{ 
            transform: (isDragging && dragEnabled && isLeader) 
              ? `translateY(${dragDistance.y}px) translateX(${dragDistance.x}px)` 
              : 'none',
            transition: (isDragging && dragEnabled && isLeader) ? 'none' : 'transform 0.3s ease',
            position: 'relative'
          }}
        >
          {/* 완료/삭제 준비 상태 표시 */}
          {isReadyToComplete && (
                <div style={{
                  position: 'absolute',
              top: -10,
                  left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(34, 197, 94, 0.9)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: 20,
              fontSize: 14,
                  fontWeight: 600,
              zIndex: 1000,
              animation: 'pulse 1s infinite'
            }}>
              ✅ 완료하려면 놓으세요
                </div>
              )}
              
          {isReadyToDelete && (
            <div style={{
                    position: 'absolute',
              bottom: -10,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(220, 38, 38, 0.9)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 600,
              zIndex: 1000,
              animation: 'pulse 1s infinite'
            }}>
              🗑️ 삭제하려면 놓으세요
                </div>
              )}
              
          {/* 카드 렌더링 */}
          <div
                      style={{
              background: 'linear-gradient(135deg, rgba(138, 85, 204, 0.6), rgba(59, 130, 246, 0.4))',
              backdropFilter: 'blur(15px)',
              borderRadius: 20,
              padding: 24,
              marginBottom: 16,
              border: '2px solid rgba(138, 85, 204, 0.7)',
              transition: 'all 0.3s ease',
                          position: 'relative',
                          overflow: 'hidden',
              animation: 'cardGlow 3s ease-in-out infinite alternate, shine 4s ease-in-out infinite',
              boxShadow: '0 8px 32px rgba(138, 85, 204, 0.4)',
              minHeight: '280px', // 최소 높이 설정 (더 크게)
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* 번쩍번쩍 빛나는 효과 */}
                          <div
                            style={{
                              position: 'absolute',
                top: 0,
                left: '-100%',
                width: '100%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
                animation: 'shimmer 2.5s ease-in-out infinite',
                              pointerEvents: 'none',
                              zIndex: 1
                            }}
                          />
            {/* 추가 빛나는 효과 */}
                          <div
                            style={{
                              position: 'absolute',
                top: 0,
                left: '-100%',
                width: '100%',
                height: '100%',
                background: 'linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                animation: 'shimmer 3.5s ease-in-out infinite reverse',
                              pointerEvents: 'none',
                              zIndex: 1
                            }}
                          />
            {/* 곡 카드 */}
            {isSetListItem(currentItem) && (
              <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* 상단 정보 영역 */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'flex-start', 
                  marginBottom: 20,
                  paddingBottom: 16,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ 
                      color: 'white', 
                      fontSize: 22, 
                      margin: '0 0 8px 0', 
                      fontWeight: 700 
                    }}>
                      🎵 {currentItem.title}
                    </h3>
                    <p style={{ 
                      color: 'rgba(255, 255, 255, 0.8)', 
                      fontSize: 16, 
                      margin: 0,
                      fontWeight: 500
                    }}>
                      참여자: {currentItem.members.join(', ')}
                    </p>
                          </div>
                  
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.25)',
                    borderRadius: 12,
                    padding: '8px 16px',
                    color: 'white',
                    fontSize: 14,
                              fontWeight: 700,
                    marginLeft: 16,
                    border: '1px solid rgba(255, 255, 255, 0.3)'
                  }}>
                    #{currentCardIndex + 1}
                          </div>
                          </div>
                
                {/* 하단 여백 영역 */}
                <div style={{ flex: 1 }}></div>
                          </div>
                        )}

            {/* 유연한 카드 */}
            {isFlexibleCard(currentItem) && (
              <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flex: 1 }}>
                  <div style={{ flex: 1 }}>
                        <h3 style={{ 
                      color: 'white', 
                      fontSize: 20, 
                      margin: '0 0 6px 0', 
                      fontWeight: 600 
                    }}>
                      🎭 {currentItem.nickname} ({currentItem.totalSlots}곡)
                        </h3>
                          <p style={{ 
                      color: 'rgba(255, 255, 255, 0.7)', 
                      fontSize: 14, 
                      margin: 0 
                    }}>
                      슬롯: {currentItem.slots.length}개
                    </p>
                  </div>
                  
                          <div style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 600,
                    marginLeft: 12
                  }}>
                    #{currentCardIndex + 1}
                  </div>
                </div>

                {/* 슬롯 목록 */}
                <div style={{ marginBottom: 12 }}>
                  <h4 style={{ 
                    color: 'white', 
                    fontSize: 14, 
                    margin: '0 0 8px 0', 
                    fontWeight: 600 
                  }}>
                    🎵 슬롯 목록
                  </h4>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {currentItem.slots.map((slot, slotIndex) => (
                      <div
                        key={slot.id}
                                    style={{ 
                          background: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: 6,
                          padding: 8,
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                                    <span style={{ 
                              color: 'white', 
                              fontSize: 12, 
                              fontWeight: 600 
                            }}>
                              슬롯 {slotIndex + 1}
                                          </span>
                                          {slot.title && (
                                            <span style={{ 
                                color: 'rgba(255, 255, 255, 0.7)', 
                                fontSize: 12, 
                                marginLeft: 6 
                              }}>
                                - {slot.title}
                                            </span>
                                          )}
                                  </div>
                          <div style={{ 
                            background: slot.isCompleted ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                            borderRadius: 4,
                            padding: '2px 6px',
                            fontSize: 10,
                            color: 'white'
                          }}>
                            {slot.isCompleted ? '완료' : '대기'}
                            </div>
                          </div>
                        
                        {slot.members.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <span style={{ 
                              color: 'rgba(255, 255, 255, 0.6)', 
                              fontSize: 10 
                            }}>
                              참여자: {slot.members.join(', ')}
                            </span>
                                        </div>
                        )}
                                      </div>
                                    ))}
                                </div>
                            </div>
                          </div>
                        )}

            {/* 신청곡 카드 */}
            {isRequestSongCard(currentItem) && (
              <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* 상단 정보 영역 */}
                          <div style={{
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'flex-start', 
                  marginBottom: 20,
                  paddingBottom: 16,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
                }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ 
                      color: 'white', 
                      fontSize: 22, 
                      margin: '0 0 8px 0', 
                      fontWeight: 700 
                    }}>
                      🎤 신청곡 카드 ({currentItem.songs.length}곡)
                    </h3>
                    <p style={{ 
                      color: 'rgba(255, 255, 255, 0.8)', 
                      fontSize: 16, 
                      margin: 0,
                      fontWeight: 500
                    }}>
                      {currentItem.songs.length > 0 ? currentItem.songs.map(song => song.title).join(', ') : '아직 신청곡이 없습니다.'}
                    </p>
                          </div>

                          <div style={{
                    background: 'rgba(255, 255, 255, 0.25)',
                    borderRadius: 12,
                            padding: '8px 16px',
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 700,
                    marginLeft: 16,
                    border: '1px solid rgba(255, 255, 255, 0.3)'
                  }}>
                    #{currentCardIndex + 1}
                          </div>
                </div>
                
                {/* 하단 여백 영역 */}
                <div style={{ flex: 1 }}></div>

                {/* 신청곡 목록 */}
                {currentItem.songs.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <h4 style={{ 
                      color: 'white', 
                      fontSize: 14, 
                      margin: '0 0 8px 0', 
                      fontWeight: 600 
                    }}>
                      🎵 신청곡 목록
                    </h4>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {currentItem.songs.map((song, songIndex) => (
                        <div
                          key={song.id}
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: 6,
                            padding: 8,
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ 
                              color: 'white', 
                              fontSize: 12, 
                              fontWeight: 600 
                            }}>
                              {songIndex + 1}. {song.title}
                            </span>
                            <span style={{ 
                              color: 'rgba(255, 255, 255, 0.6)', 
                              fontSize: 10 
                            }}>
                              신청자: {song.requestedBy}
                            </span>
                            </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                          </div>
                        )}

            {/* 액션 버튼들 */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              {/* 편집 버튼 (본인 닉네임 카드인 경우만) */}
              {checkIsMyFlexibleCard(currentItem) && isFlexibleCard(currentItem) && (
                <button
                  onClick={() => {
                    setEditingFlexibleCard(currentItem);
                    setEditingSlotIndex(-1);
                    setCurrentEditingSlot(null);
                  }}
                            style={{
                    background: 'rgba(59, 130, 246, 0.8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: 12,
                              fontWeight: 600,
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.9)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.8)';
                  }}
                >
                  ✏️ 편집
                </button>
              )}

              {/* 드래그 토글 버튼 - 리더만 */}
              {isLeader && (
                <button
                  onClick={() => setDragEnabled(!dragEnabled)}
                  style={{
                    background: dragEnabled ? 'rgba(34, 197, 94, 0.8)' : 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = dragEnabled ? 'rgba(34, 197, 94, 0.9)' : 'rgba(255, 255, 255, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = dragEnabled ? 'rgba(34, 197, 94, 0.8)' : 'rgba(255, 255, 255, 0.2)';
                  }}
                >
                  {dragEnabled ? '고정❌' : '고정✅'}
                </button>
              )}

              {isLeader && (
                  <button
                  onClick={completeCurrentSong}
                    style={{
                    background: 'rgba(34, 197, 94, 0.8)',
                    color: 'white',
                      border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(34, 197, 94, 0.9)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(34, 197, 94, 0.8)';
                  }}
                >
                  ✅ 완료
                  </button>
              )}

              {isLeader && isSetListItem(currentItem) && (
                  <button
                  onClick={deleteCurrentSong}
                    style={{
                    background: 'rgba(220, 38, 38, 0.8)',
                    color: 'white',
                      border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(220, 38, 38, 0.9)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(220, 38, 38, 0.8)';
                  }}
                >
                  🗑️ 삭제
                  </button>
              )}

              {isLeader && isFlexibleCard(currentItem) && (
                  <button
                  onClick={deleteCurrentFlexibleCard}
                    style={{
                    background: 'rgba(220, 38, 38, 0.8)',
                    color: 'white',
                      border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                      cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(220, 38, 38, 0.9)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(220, 38, 38, 0.8)';
                  }}
                >
                  🗑️ 삭제
                  </button>
              )}
            </div>

            {/* 첫 번째 카드 안내문구 */}
            {currentCardIndex === 0 && (
            <div style={{ 
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                padding: 12,
                marginTop: 16,
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}>
                <div style={{
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontSize: 14,
                  fontWeight: 600,
              display: 'flex', 
                  alignItems: 'center',
              justifyContent: 'center', 
                  gap: 8
                }}>
                  <span style={{ fontSize: 16 }}>⏳</span>
                  다음 순서는 대기해주세요
                </div>
              </div>
            )}
          </div>
            </div>
          )}


      {/* 로딩 상태 */}
      {isModalCompleting && (
            <div style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.9)',
              borderRadius: 20,
            padding: 40,
              textAlign: 'center',
            color: '#333'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <p style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>
              처리 중입니다...
            </p>
          </div>
            </div>
          )}

      {/* 유연한 카드 편집 모달 */}
      {editingFlexibleCard && (
            <div style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: 12,
              padding: 24,
            maxWidth: 600,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: '#333' }}>
                🎭 {editingFlexibleCard.nickname} 카드 편집
                </h3>
                  <button
                onClick={() => {
                  setEditingFlexibleCard(null);
                  setEditingSlotIndex(-1);
                  setCurrentEditingSlot(null);
                }}
                    style={{
                  background: '#6b7280',
                      color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 12px',
                      cursor: 'pointer',
                  fontSize: 14
                    }}
                  >
                ✕ 닫기
                  </button>
            </div>

            {/* 슬롯 목록 */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: '#333', marginBottom: 12 }}>슬롯 목록</h4>
              <div style={{ display: 'grid', gap: 12 }}>
                {editingFlexibleCard.slots.map((slot, index) => (
                  <div
                    key={slot.id}
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: 8,
                      padding: 16,
                      backgroundColor: editingSlotIndex === index ? '#f3f4f6' : 'white'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h5 style={{ margin: 0, color: '#333' }}>슬롯 {index + 1}</h5>
                      <div style={{ display: 'flex', gap: 8 }}>
                  <button
                          onClick={() => {
                            setEditingSlotIndex(index);
                            setCurrentEditingSlot(slot);
                          }}
                    style={{
                            background: editingSlotIndex === index ? '#3b82f6' : '#6b7280',
                      color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            padding: '4px 8px',
                      cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          {editingSlotIndex === index ? '편집 중' : '편집'}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('이 슬롯을 초기화하시겠습니까? 곡과 참여자 정보가 모두 삭제됩니다.')) {
                              resetSlot(editingFlexibleCard.id, index);
                            }
                          }}
                          style={{
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          초기화
                  </button>
                </div>
              </div>

                    {editingSlotIndex === index && (
                      <div style={{ marginTop: 12 }}>
                        {/* 합격한 곡 목록 */}
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                            🎵 내가 합격한 곡에서 선택
                          </label>
                          {myPassedSongs.length > 0 ? (
                <div style={{
                              maxHeight: '150px', 
                              overflowY: 'auto', 
                              border: '1px solid #ddd', 
                              borderRadius: 4,
                              padding: 8
                            }}>
                              {myPassedSongs.map((song) => (
                                <div
                                  key={(song as any).songId || song.id}
                                  onClick={async () => await applyPassedSongToSlot(song)}
                                  style={{
                                    padding: '8px 12px',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: 4,
                                    marginBottom: 4,
                                    cursor: 'pointer',
                                    backgroundColor: '#f9fafb',
                                    transition: 'all 0.2s ease'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#e5e7eb';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f9fafb';
                                  }}
                                >
                                  <div style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>
                                    {song.title}
                                  </div>
                                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                                    {(song as any).artist}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ 
                              padding: '12px', 
                              backgroundColor: '#f3f4f6', 
                              borderRadius: 4,
                              textAlign: 'center',
                              color: '#6b7280',
                              fontSize: 14
                            }}>
                              합격한 곡이 없습니다
                            </div>
                          )}
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
                            곡 제목
                      </label>
                      <input
                        type="text"
                            value={slot.title || ''}
                            onChange={(e) => {
                              const updatedSlot = { ...slot, title: e.target.value };
                              setCurrentEditingSlot(updatedSlot);
                            }}
                            placeholder="곡 제목을 입력하세요"
                        style={{
                          width: '100%',
                              padding: '8px 12px',
                              border: '1px solid #ddd',
                              borderRadius: 4,
                              fontSize: 14
                        }}
                      />
                    </div>
                    
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
                            참여자
                      </label>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input
                              type="text"
                              value={newParticipantName}
                              onChange={(e) => setNewParticipantName(e.target.value)}
                              placeholder="참여자 이름"
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                border: '1px solid #ddd',
                                borderRadius: 4,
                                fontSize: 14
                              }}
                            />
                            <button
                              onClick={addSlotParticipant}
                              disabled={!newParticipantName.trim()}
                        style={{
                                background: newParticipantName.trim() ? '#3b82f6' : '#9ca3af',
                          color: 'white',
                                border: 'none',
                                borderRadius: 4,
                                padding: '8px 12px',
                                cursor: newParticipantName.trim() ? 'pointer' : 'not-allowed',
                                fontSize: 14
                              }}
                            >
                              추가
                            </button>
                    </div>

                          {slot.members.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {slot.members.map((member, memberIndex) => (
                                <span
                                  key={memberIndex}
                                  style={{
                                    background: '#e5e7eb',
                                    color: '#374151',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    fontSize: 12,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                >
                                  {member}
                                  <button
                                    onClick={() => removeSlotParticipant(member)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#ef4444',
                                      cursor: 'pointer',
                                      fontSize: 12,
                                      padding: 0
                                    }}
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => {
                              if (currentEditingSlot) {
                                updateFlexibleCardSlot(editingFlexibleCard.id, index, currentEditingSlot);
                              }
                              setEditingSlotIndex(-1);
                              setCurrentEditingSlot(null);
                      }}
                      style={{
                              background: '#3b82f6',
                        color: 'white',
                              border: 'none',
                              borderRadius: 4,
                              padding: '8px 16px',
                              cursor: 'pointer',
                              fontSize: 14
                            }}
                          >
                            저장
                    </button>
                    <button
                            onClick={() => {
                              setEditingSlotIndex(-1);
                              setCurrentEditingSlot(null);
                            }}
                      style={{
                              background: '#6b7280',
                        color: 'white',
                              border: 'none',
                              borderRadius: 4,
                              padding: '8px 16px',
                              cursor: 'pointer',
                              fontSize: 14
                            }}
                          >
                            취소
                    </button>
                  </div>
                </div>
              )}

                    {editingSlotIndex !== index && (
                      <div>
                        <p style={{ margin: '4px 0', color: '#666', fontSize: 14 }}>
                          <strong>곡:</strong> {slot.title || '미정'}
                        </p>
                        <p style={{ margin: '4px 0', color: '#666', fontSize: 14 }}>
                          <strong>참여자:</strong> {slot.members.length > 0 ? slot.members.join(', ') : '없음'}
                        </p>
                  </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 참가자 목록 */}
      <div style={{ 
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 20,
        marginTop: 20,
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16
        }}>
          <h3 style={{ 
            color: 'white', 
            fontSize: 18, 
            margin: 0, 
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            👥 참가자 목록
          </h3>
          {activeSetList && activeSetList.participants && activeSetList.participants.length > 0 && (
            <button
              onClick={openAllPassedSongsModal}
              style={{
                background: 'rgba(34, 197, 94, 0.8)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.9)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.8)';
              }}
            >
              🎵 모든 합격곡 보기
            </button>
          )}
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {activeSetList && activeSetList.participants && activeSetList.participants.length > 0 ? (
            activeSetList.participants.filter(p => p.trim()).map((participant, index) => (
              <div
                key={index}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
                onClick={() => openPassedSongsModal(participant)}
              >
                <div style={{
                  background: 'rgba(59, 130, 246, 0.8)',
                  color: 'white',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 600
                }}>
                  {participant.charAt(0)}
                </div>
                <div>
                  <div style={{
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 600
                  }}>
                    {participant}
                  </div>
                  <div style={{
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: 12
                  }}>
                    클릭하여 합격곡 보기
                  </div>
                </div>
                <div style={{
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: 16
                }}>
                  🎵
                </div>
              </div>
            ))
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '20px 0',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: 14
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
              <p style={{ margin: 0 }}>아직 참가자가 없습니다.</p>
              <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
                관리탭에서 참가자를 추가해주세요.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 참가자 합격곡 모달 */}
      {showPassedSongsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: 16,
            padding: 24,
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
          }}>
              <div style={{
                display: 'flex',
              justifyContent: 'space-between',
                alignItems: 'center',
              marginBottom: 20
            }}>
              <h3 style={{
                color: '#1f2937',
                fontSize: 20,
                fontWeight: 600,
                  margin: 0
                }}>
                🎵 {selectedParticipant}님의 합격곡
                 </h3>
              <button
                onClick={() => setShowPassedSongsModal(false)}
                style={{
                  background: 'rgba(220, 38, 38, 0.1)',
                  color: '#dc2626',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                ✕ 닫기
              </button>
            </div>

            {loadingPassedSongs ? (
            <div style={{
                textAlign: 'center',
                padding: '40px 0',
                color: '#6b7280'
              }}>
                📊 합격곡을 불러오는 중...
                        </div>
            ) : participantPassedSongs.length === 0 ? (
              <div style={{
                        textAlign: 'center',
                padding: '40px 0',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
                <p style={{ margin: 0, fontSize: 16 }}>합격곡이 없습니다.</p>
                <p style={{ margin: '8px 0 0 0', fontSize: 14, color: '#9ca3af' }}>
                  아직 합격한 곡이 없거나 현재 셋리스트 참가자와 관련된 곡이 없습니다.
                </p>
                      </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {participantPassedSongs.map((song, index) => (
                  <div
                    key={song.id || index}
                      style={{
                      background: 'rgba(59, 130, 246, 0.05)',
                      borderRadius: 8,
                      padding: 16,
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      transition: 'all 0.3s ease'
                      }}
                    >
                      <div style={{ 
                      color: '#1f2937',
                      fontSize: 16,
                        fontWeight: 600, 
                      marginBottom: 8
                      }}>
                        {song.title}
                      </div>
                      <div style={{ 
                      color: '#6b7280',
                      fontSize: 14,
                      marginBottom: 8
                    }}>
                      {song.artist}
                      </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {song.members && song.members.map((member: string, memberIndex: number) => (
                        <span
                          key={memberIndex}
                          style={{
                            background: 'rgba(59, 130, 246, 0.1)',
                            color: '#3b82f6',
                            padding: '4px 8px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600
                          }}
                        >
                          {member}
                        </span>
                      ))}
                    </div>
              </div>
                ))}
            </div>
            )}
          </div>
        </div>
      )}

      {/* 모든 합격곡 모달 */}
      {showAllPassedSongsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: 16,
            padding: 24,
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20
          }}>
            <h3 style={{
                color: '#1f2937',
                fontSize: 20,
                fontWeight: 600,
                margin: 0
              }}>
                🎵 모든 참가자 합격곡
            </h3>
                <button
                onClick={() => setShowAllPassedSongsModal(false)}
                  style={{
                  background: 'rgba(220, 38, 38, 0.1)',
                  color: '#dc2626',
                    border: 'none',
                  borderRadius: 8,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                ✕ 닫기
                </button>
            </div>

            {/* 필터링 버튼들 */}
            <div style={{
              display: 'flex',
              gap: 8,
              marginBottom: 20,
              flexWrap: 'wrap'
            }}>
              {[
                { key: 'all', label: '전체', icon: '🎵' },
                { key: 'solo', label: '솔로', icon: '🎤' },
                { key: 'duet', label: '듀엣', icon: '👥' },
                { key: 'group', label: '합창', icon: '🎭' }
              ].map(filter => (
                <button
                  key={filter.key}
                  onClick={() => setSongFilter(filter.key as any)}
                      style={{
                    background: songFilter === filter.key 
                      ? 'rgba(59, 130, 246, 0.8)' 
                      : 'rgba(59, 130, 246, 0.1)',
                    color: songFilter === filter.key 
                      ? 'white' 
                      : '#3b82f6',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: 8,
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    transition: 'all 0.3s ease',
                        display: 'flex',
                        alignItems: 'center',
                    gap: 6
                  }}
                  onMouseEnter={(e) => {
                    if (songFilter !== filter.key) {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (songFilter !== filter.key) {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                    }
                  }}
                >
                  <span>{filter.icon}</span>
                  {filter.label}
                        </button>
                  ))}
                </div>

            {loadingAllPassedSongs ? (
              <div style={{
                textAlign: 'center',
                padding: '40px 0',
                color: '#6b7280'
              }}>
                📊 모든 합격곡을 불러오는 중...
              </div>
            ) : allPassedSongs.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '40px 0',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
                <p style={{ margin: 0, fontSize: 16 }}>합격곡이 없습니다.</p>
                <p style={{ margin: '8px 0 0 0', fontSize: 14, color: '#9ca3af' }}>
                  아직 합격한 곡이 없거나 현재 셋리스트 참가자와 관련된 곡이 없습니다.
                </p>
              </div>
            ) : (() => {
              const filteredSongs = getFilteredSongs();
              return (
                <div>
                  <div style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                    border: '1px solid rgba(59, 130, 246, 0.2)'
                  }}>
                    <div style={{
                      color: '#1f2937',
                      fontSize: 14,
                      fontWeight: 600,
                      textAlign: 'center'
                    }}>
                      📊 {songFilter === 'all' ? '전체' : 
                           songFilter === 'solo' ? '솔로' :
                           songFilter === 'duet' ? '듀엣' : '합창'} 
                      {filteredSongs.length}곡 / 총 {allPassedSongs.length}곡
                    </div>
            </div>

                  {filteredSongs.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 0',
                      color: '#6b7280'
                    }}>
                      <div style={{ fontSize: 48, marginBottom: 16 }}>
                        {songFilter === 'solo' ? '🎤' : 
                         songFilter === 'duet' ? '👥' : '🎭'}
                      </div>
                      <p style={{ margin: 0, fontSize: 16 }}>
                        {songFilter === 'solo' ? '솔로 곡이 없습니다.' :
                         songFilter === 'duet' ? '듀엣 곡이 없습니다.' :
                         '합창 곡이 없습니다.'}
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {filteredSongs.map((song, index) => (
                    <div
                      key={song.id || index}
                style={{
                        background: 'rgba(59, 130, 246, 0.05)',
                        borderRadius: 8,
                        padding: 16,
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <div style={{
                        color: '#1f2937',
                        fontSize: 16,
                  fontWeight: 600,
                        marginBottom: 8
                      }}>
                        {song.title}
                      </div>
                      <div style={{
                        color: '#6b7280',
                        fontSize: 14,
                        marginBottom: 8
                      }}>
                        {song.artist}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {song.members && song.members.map((member: string, memberIndex: number) => (
                          <span
                            key={memberIndex}
                            style={{
                              background: 'rgba(59, 130, 246, 0.1)',
                              color: '#3b82f6',
                              padding: '4px 8px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600
                            }}
                          >
                            {member}
                          </span>
                        ))}
            </div>
          </div>
                      ))}
        </div>
      )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 닉네임카드 추가 모달 */}
      {showNicknameCardModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowNicknameCardModal(false);
            }
          }}
        >
          <div 
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: 16,
              padding: 24,
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
              border: '3px solid red' // 디버깅용 빨간 테두리
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20
            }}>
              <h3 style={{
                color: '#1f2937',
                fontSize: 20,
                fontWeight: 600,
                margin: 0
              }}>
                🎭 닉네임카드 추가
              </h3>
              <div style={{
                color: 'red',
                fontSize: 12,
                fontWeight: 'bold'
              }}>
                모달이 표시되었습니다!
              </div>
              <button
                onClick={() => setShowNicknameCardModal(false)}
                style={{
                  background: 'rgba(220, 38, 38, 0.1)',
                  color: '#dc2626',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                ✕ 닫기
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 닉네임 선택 */}
              <div>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 8
                }}>
                  참가자 선택
                </label>
                <select
                  value={selectedNickname}
                  onChange={(e) => setSelectedNickname(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 14,
                    color: '#374151',
                    background: 'white'
                  }}
                >
                  <option value="">닉네임을 선택하세요</option>
                  {activeSetList?.participants?.filter(p => p.trim()).map((participant, index) => (
                    <option key={index} value={participant}>
                      {participant}
                    </option>
                  ))}
                </select>
              </div>

              {/* 슬롯 수 선택 */}
              <div>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 8
                }}>
                  슬롯 수 선택
                </label>
                <div style={{ 
                  display: 'flex', 
                  gap: 8, 
                  flexWrap: 'wrap' 
                }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setCardSlotCount(count)}
                      style={{
                        padding: '8px 16px',
                        border: cardSlotCount === count ? '2px solid #3b82f6' : '1px solid #d1d5db',
                        borderRadius: 8,
                        background: cardSlotCount === count ? '#3b82f6' : '#ffffff',
                        color: cardSlotCount === count ? '#ffffff' : '#374151',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        minWidth: '50px'
                      }}
                      onMouseEnter={(e) => {
                        if (cardSlotCount !== count) {
                          e.currentTarget.style.background = '#f3f4f6';
                          e.currentTarget.style.borderColor = '#9ca3af';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (cardSlotCount !== count) {
                          e.currentTarget.style.background = '#ffffff';
                          e.currentTarget.style.borderColor = '#d1d5db';
                        }
                      }}
                    >
                      {count}곡
                    </button>
                  ))}
                </div>
              </div>

              {/* 버튼들 */}
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button
                  onClick={() => setShowNicknameCardModal(false)}
                  style={{
                    flex: 1,
                    background: 'rgba(107, 114, 128, 0.1)',
                    color: '#6b7280',
                    border: 'none',
                    borderRadius: 8,
                    padding: '12px',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600
                  }}
                >
                  취소
                </button>
                <button
                  onClick={addNicknameCardToSetList}
                  style={{
                    flex: 1,
                    background: 'rgba(168, 85, 247, 0.8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    padding: '12px',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600
                  }}
                >
                  추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SetListCards;