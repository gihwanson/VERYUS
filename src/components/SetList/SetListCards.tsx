import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { updateDoc, doc, Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSwipeGestures } from './hooks/useSwipeGestures';
import type { Song, SetListItem, FlexibleCard, FlexibleSlot, SetListEntry, RequestSongCard, RequestSong, SetListData } from './types';
import { isSongRegistrationPhase } from './types';
import SetListParadeView from './SetListParadeView';
import SetListChat from './SetListChat';
import { buildParadeEntries } from './paradeUtils';
import './styles.css';

interface SetListCardsProps {
  songs: Song[];
  activeSetList: SetListData | null;
  onSetListActivated?: () => void;
  fullscreen?: boolean;
}

const SetListCards: React.FC<SetListCardsProps> = ({
  songs,
  activeSetList,
  onSetListActivated,
  fullscreen = false
}) => {
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isLeader = user && user.role === '리더';
  /** 진행 탭은 멤버용 보기 전용 — 곡 등록·편집 없음 */
  const canLeaderModerateCards = false;
  const currentUserNickname = user?.nickname || '';
  const currentUserUid = user?.uid || '';
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
  const [gradeByNickname, setGradeByNickname] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const loadGrades = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        if (cancelled) return;
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.nickname) map[data.nickname] = data.grade;
        });
        setGradeByNickname(map);
      } catch (e) {
        console.error('멤버 등급 로드 실패:', e);
      }
    };
    void loadGrades();
    return () => {
      cancelled = true;
    };
  }, []);

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
      alert('이 자유곡을 편집할 권한이 없습니다.');
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
      alert('이 자유곡을 편집할 권한이 없습니다.');
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
    if (!activeSetList || !canLeaderModerateCards) return;
    
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
      if (!confirm(`"${currentItem.nickname}" 자유곡을 완료 처리하시겠습니까?`)) return;

      setIsModalCompleting(true);
      try {
    const completedCard = {
          ...currentItem,
          completedAt: Timestamp.now()
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
        
        alert(`"${currentItem.nickname}" 자유곡이 완료되었습니다! 🎉`);
        
        // 다음 카드로 이동
        if (currentCardIndex < allItems.length - 1) {
          setCurrentCardIndex(currentCardIndex + 1);
        }
    } catch (error) {
        console.error('유연한 카드 완료 실패:', error);
        alert('자유곡 완료에 실패했습니다.');
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
  }, [activeSetList, canLeaderModerateCards, currentCardIndex, getAllItems]);

  // 현재 곡 삭제 처리
  const deleteCurrentSong = useCallback(async () => {
    if (!activeSetList || !canLeaderModerateCards) return;
    
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
      const cardTitle = currentItem.nickname ? `${currentItem.nickname}님의 자유곡` : '자유곡';
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
        
        alert('자유곡이 셋리스트에서 제거되었습니다.');
        
        // 현재 인덱스 조정
        if (currentCardIndex >= allItems.length - 1 && currentCardIndex > 0) {
          setCurrentCardIndex(currentCardIndex - 1);
        }
      } catch (error) {
        console.error('자유곡 제거 실패:', error);
        alert('자유곡 제거에 실패했습니다.');
      }
    }
  }, [activeSetList, canLeaderModerateCards, currentCardIndex, getAllItems]);

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
    if (!activeSetList || !canLeaderModerateCards) return;
    
    const allItems = getAllItems();
    const currentItem = allItems[currentCardIndex];
    
    if (!currentItem) return;
    
    if (isFlexibleCard(currentItem)) {
      const cardTitle = currentItem.nickname ? `${currentItem.nickname}님의 자유곡` : '자유곡';
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
      
        alert('자유곡이 셋리스트에서 제거되었습니다.');
        
        // 현재 인덱스 조정
        if (currentCardIndex >= allItems.length - 1 && currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
        }
      } catch (error) {
        console.error('자유곡 제거 실패:', error);
        alert('자유곡 제거에 실패했습니다.');
      }
    }
  }, [activeSetList, canLeaderModerateCards, currentCardIndex, getAllItems]);

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
    canLeaderModerateCards, 
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

  const songPhase = isSongRegistrationPhase(activeSetList);
  if (!songPhase) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          color: 'rgba(255, 255, 255, 0.9)',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: 20,
          border: '1px solid rgba(255, 255, 255, 0.2)',
          maxWidth: window.innerWidth < 768 ? '100%' : '1400px',
          margin: '0 auto'
        }}
      >
        <div style={{ fontSize: 44, marginBottom: 14 }}>👥</div>
        <p style={{ fontSize: 17, margin: 0, fontWeight: 600 }}>먼저 참가자를 확정해 주세요</p>
        <p style={{ fontSize: 14, margin: '12px 0 0 0', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.55 }}>
          <strong style={{ color: 'white' }}>관리</strong> 탭에서 참가자를 확정하고 곡을 등록해 주세요. 이 탭에서는 순서만 확인합니다.
        </p>
      </div>
    );
  }

  const allItems = getAllItems();
  const currentItem = allItems[currentCardIndex];
  const paradeEntries = useMemo(
    () => buildParadeEntries(allItems, gradeByNickname),
    [allItems, gradeByNickname]
  );

  return (
    <div
      className={fullscreen ? 'setlist-perform-shell' : ''}
      style={{
        maxWidth: fullscreen ? '100%' : window.innerWidth < 768 ? '100%' : '1400px',
        margin: '0 auto',
        padding: fullscreen ? 0 : window.innerWidth < 768 ? '5px' : '20px',
        paddingBottom: fullscreen
          ? 0
          : 'max(20px, calc(12px + env(safe-area-inset-bottom, 0px)))',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      {allItems.length === 0 && (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'rgba(255, 255, 255, 0.85)',
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(10px)',
            borderRadius: 20,
            border: '1px solid rgba(255, 255, 255, 0.18)',
            marginBottom: 16
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 12 }}>🎵</div>
          <p style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>아직 등록된 곡이 없습니다</p>
          <p style={{ fontSize: 14, margin: '10px 0 0 0', color: 'rgba(255, 255, 255, 0.62)', lineHeight: 1.55 }}>
            관리자가 곡을 등록하면 이곳에 순서대로 표시됩니다.
          </p>
        </div>
      )}

      {/* 진행 탭 — 등급 이모지 퍼레이드 + 모바일 멤버 채팅 */}
      {allItems.length > 0 && (
        <div className={fullscreen ? 'setlist-mobile-perform-layout' : ''}>
          <SetListParadeView
            entries={paradeEntries}
            currentIndex={currentCardIndex}
            onSelectIndex={setCurrentCardIndex}
            currentUserNickname={currentUserNickname}
            fullscreen={fullscreen}
            withChat={fullscreen && Boolean(activeSetList?.id)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
          {fullscreen && activeSetList?.id && (
            <SetListChat
              setListId={activeSetList.id}
              currentUserNickname={currentUserNickname}
              currentUserUid={currentUserUid}
            />
          )}
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
                🎵 {editingFlexibleCard.nickname} 자유곡 편집
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



    </div>
  );
};

export default SetListCards;