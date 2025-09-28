import React, { useState, useEffect } from 'react';
import { addDoc, updateDoc, deleteDoc, doc, Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import SetListStats from './SetListStats';
import type { SetListData } from '../types';

interface SetListFormProps {
  setLists: SetListData[];
  activeSetList: SetListData | null;
  isLeader: boolean;
  onSetListCreated: () => void;
  onSetListDeleted: () => void;
  onSetListActivated: () => void;
}

const SetListForm: React.FC<SetListFormProps> = ({
  setLists,
  activeSetList,
  isLeader,
  onSetListCreated,
  onSetListDeleted,
  onSetListActivated
}) => {
  const [participants, setParticipants] = useState<string[]>(['']);
  const [setListName, setSetListName] = useState('');
  
  // 참가자별 합격곡 모달 상태
  const [showPassedSongsModal, setShowPassedSongsModal] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<string>('');
  const [participantPassedSongs, setParticipantPassedSongs] = useState<any[]>([]);
  const [loadingPassedSongs, setLoadingPassedSongs] = useState(false);

  // 닉네임카드 추가 모달 상태
  const [showNicknameCardModal, setShowNicknameCardModal] = useState(false);
  const [selectedNickname, setSelectedNickname] = useState<string>('');
  const [cardSlotCount, setCardSlotCount] = useState<number>(3);

  // 기존 셋리스트가 있으면 참가자 목록 초기화
  useEffect(() => {
    if (activeSetList) {
      setParticipants(activeSetList.participants.length > 0 ? activeSetList.participants : ['']);
    } else {
      setParticipants(['']);
    }
  }, [activeSetList]);

  const addParticipant = () => {
    setParticipants([...participants, '']);
  };

  const removeParticipant = (index: number) => {
    if (participants.length > 1) {
      const updatedParticipants = participants.filter((_, i) => i !== index);
      setParticipants(updatedParticipants);
      
      // 활성 셋리스트가 있으면 참가자 업데이트
      if (activeSetList && isLeader) {
        const validParticipants = updatedParticipants.map(p => p.trim()).filter(Boolean);
        updateSetListParticipants(validParticipants);
      }
    }
  };

  const updateParticipant = (index: number, value: string) => {
    const updated = [...participants];
    updated[index] = value;
    setParticipants(updated);
    
    // 활성 셋리스트가 있으면 참가자 업데이트
    if (activeSetList && isLeader) {
      const validParticipants = updated.map(p => p.trim()).filter(Boolean);
      updateSetListParticipants(validParticipants);
    }
  };

  const updateSetListParticipants = async (newParticipants: string[]) => {
    if (!activeSetList || !isLeader) return;
    
    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        participants: newParticipants,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('참가자 업데이트 실패:', error);
    }
  };

  const createSetList = async () => {
    if (!setListName.trim()) {
      alert('셋리스트 이름을 입력해주세요.');
      return;
    }

    const attendees = participants.map(p => p.trim()).filter(Boolean);
    if (attendees.length === 0) {
      alert('최소 한 명의 참가자를 입력해주세요.');
      return;
    }

    try {
      const userString = localStorage.getItem('veryus_user');
      const user = userString ? JSON.parse(userString) : null;
      
      const newSetList = {
        name: setListName.trim(),
        participants: attendees,
        songs: [],
        flexibleCards: [],
        requestSongCards: [],
        completedSongs: [],
        completedFlexibleCards: [],
        completedRequestSongCards: [],
        createdBy: user?.nickname || 'Unknown',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isActive: false
      };

      await addDoc(collection(db, 'setlists'), newSetList);
      setSetListName('');
      setParticipants(['']);
      onSetListCreated();
      alert('새 셋리스트가 생성되었습니다! 🎵');
    } catch (error) {
      console.error('셋리스트 생성 실패:', error);
      alert('셋리스트 생성에 실패했습니다.');
    }
  };

  const deleteSetList = async (setListId: string) => {
    if (!isLeader) return;
    
    if (!confirm('정말로 이 셋리스트를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'setlists', setListId));
      onSetListDeleted();
      alert('셋리스트가 삭제되었습니다.');
    } catch (error) {
      console.error('셋리스트 삭제 실패:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  const activateSetList = async (setList: SetListData) => {
    if (!isLeader) return;
    
    try {
      // 모든 셋리스트를 비활성화
      const batch = setLists.map(list => 
        updateDoc(doc(db, 'setlists', list.id!), {
          isActive: false,
          updatedAt: Timestamp.now()
        })
      );
      
      // 선택된 셋리스트만 활성화
      batch.push(
        updateDoc(doc(db, 'setlists', setList.id!), {
          isActive: true,
          updatedAt: Timestamp.now()
        })
      );
      
      await Promise.all(batch);
      onSetListActivated();
      alert(`"${setList.name}" 셋리스트가 활성화되었습니다! 🎵`);
    } catch (error) {
      console.error('셋리스트 활성화 실패:', error);
      alert('셋리스트 활성화에 실패했습니다.');
    }
  };

  // 참가자별 합격곡 가져오기 (현재 셋리스트 참가자만 포함된 곡)
  const loadParticipantPassedSongs = async (participant: string) => {
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
      }));

      // 현재 셋리스트의 참가자 목록 가져오기
      const currentParticipants = activeSetList?.participants || participants.filter(p => p.trim());
      
      // 현재 참가자 목록에 있는 사람들만 포함된 곡만 필터링
      const filteredSongs = allSongs.filter((song: any) => {
        if (!song.members || !Array.isArray(song.members)) return false;
        
        // 곡의 모든 참여자가 현재 셋리스트 참가자 목록에 있는지 확인
        return song.members.every((member: string) => 
          currentParticipants.includes(member.trim())
        );
      });

      setParticipantPassedSongs(filteredSongs);
    } catch (error) {
      console.error('합격곡 가져오기 실패:', error);
      alert('합격곡을 가져오는데 실패했습니다.');
    } finally {
      setLoadingPassedSongs(false);
    }
  };

  // 참가자별 합격곡 모달 열기
  const openPassedSongsModal = async (participant: string) => {
    setSelectedParticipant(participant);
    setShowPassedSongsModal(true);
    await loadParticipantPassedSongs(participant);
  };

  // undefined 값 제거 함수
  const removeUndefinedValues = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(removeUndefinedValues).filter(item => item !== null && item !== undefined);
    }
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefinedValues(value);
      }
    }
    return cleaned;
  };

  // 합격곡을 셋리스트에 추가
  const addSongToSetList = async (song: any) => {
    if (!activeSetList || !isLeader) {
      alert('활성 셋리스트가 없거나 권한이 없습니다.');
      return;
    }

    try {
      // 새로운 셋리스트 아이템 생성 (undefined 값 방지)
      const newSetListItem = {
        title: song.title || '',
        artist: song.artist || '',
        members: Array.isArray(song.members) ? song.members : [],
        type: song.members && song.members.length > 1 ? 'duet' : 'solo',
        order: activeSetList.songs.length, // 현재 곡 수를 순서로 설정
        songId: song.id || song.songId || `song_${Date.now()}`, // songId 필드 추가
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      // undefined 값 제거
      const cleanedItem = removeUndefinedValues(newSetListItem);
      console.log('정리된 곡 데이터:', cleanedItem);

      // 셋리스트에 곡 추가
      const updatedSongs = [...(activeSetList.songs || []), cleanedItem];
      
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });

      alert(`"${song.title}" 곡이 셋리스트에 추가되었습니다! 🎵`);
      
      // 상태 업데이트
      onSetListActivated();
      
      // 모달 닫기
      setShowPassedSongsModal(false);
    } catch (error) {
      console.error('곡 추가 실패:', error);
      alert('곡 추가에 실패했습니다.');
    }
  };

  // 셋리스트에서 곡 제거
  const removeSongFromSetList = async (songIndex: number) => {
    if (!activeSetList || !isLeader) {
      alert('권한이 없습니다.');
      return;
    }

    if (!confirm('이 곡을 셋리스트에서 제거하시겠습니까?')) {
      return;
    }

    try {
      const updatedSongs = activeSetList.songs.filter((_, index) => index !== songIndex);
      
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });

      alert('곡이 셋리스트에서 제거되었습니다.');
      
      // 상태 업데이트
      onSetListActivated();
    } catch (error) {
      console.error('곡 제거 실패:', error);
      alert('곡 제거에 실패했습니다.');
    }
  };

  // 셋리스트에서 곡 완료 처리
  const completeSongFromSetList = async (songIndex: number) => {
    if (!activeSetList || !isLeader) {
      alert('권한이 없습니다.');
      return;
    }

    const song = activeSetList.songs[songIndex];
    if (!song) {
      alert('곡을 찾을 수 없습니다.');
      return;
    }

    const songTitle = (song as any).nickname ? `${(song as any).nickname}님의 닉네임카드` : song.title;
    
    if (!confirm(`"${songTitle}"을 완료 처리하시겠습니까?\n\n완료된 곡은 통계에 반영됩니다.`)) {
      return;
    }

    try {
      let completedSong;
      
      // 닉네임카드인 경우 모든 슬롯의 참여자들을 수집
      if ((song as any).nickname && (song as any).slots) {
        const allParticipants: string[] = [];
        (song as any).slots.forEach((slot: any) => {
          if (slot.members && Array.isArray(slot.members)) {
            allParticipants.push(...slot.members);
          }
        });
        
        // 중복 제거
        const uniqueParticipants = [...new Set(allParticipants)];
        
        completedSong = {
          ...song,
          completedAt: Timestamp.now(),
          isCompleted: true,
          allParticipants: uniqueParticipants, // 통계용 참여자 목록 추가
          totalSlotsCompleted: (song as any).slots.length
        };
      } else {
        // 일반 곡인 경우
        completedSong = {
          ...song,
          completedAt: Timestamp.now(),
          isCompleted: true
        };
      }

      // 완료된 곡을 completedSongs 배열에 추가
      const updatedCompletedSongs = [...(activeSetList.completedSongs || []), completedSong];
      
      // 원본 곡을 songs 배열에서 제거
      const updatedSongs = activeSetList.songs.filter((_, index) => index !== songIndex);
      
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        completedSongs: updatedCompletedSongs,
        updatedAt: Timestamp.now()
      });

      if ((song as any).nickname) {
        const participantCount = (completedSong as any).allParticipants?.length || 0;
        const slotCount = (song as any).slots?.length || 0;
        alert(`"${songTitle}"이 완료되었습니다! 🎉\n\n📊 통계 기록: ${participantCount}명이 ${slotCount}곡 완료`);
      } else {
        alert(`"${songTitle}"이 완료되었습니다! 🎉\n통계에 반영됩니다.`);
      }
      
      // 상태 업데이트
      onSetListActivated();
    } catch (error) {
      console.error('곡 완료 실패:', error);
      alert('곡 완료에 실패했습니다.');
    }
  };

  // 닉네임카드 추가
  const addNicknameCardToSetList = async () => {
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
      // 슬롯 생성
      const slots = Array.from({ length: cardSlotCount }, (_, index) => ({
        id: `slot_${Date.now()}_${index}`,
        title: '',
        artist: '',
        members: [],
        type: 'solo' as const,
        isCompleted: false
      }));

      // 새로운 닉네임카드 생성
      const newNicknameCard = {
        id: `card_${Date.now()}`,
        nickname: selectedNickname.trim(),
        totalSlots: cardSlotCount,
        slots: slots,
        order: activeSetList.songs.length, // 현재 곡 수를 순서로 설정
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      // 셋리스트에 닉네임카드 추가
      const updatedSongs = [...(activeSetList.songs || []), newNicknameCard];
      
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });

      alert(`"${selectedNickname}"님의 닉네임카드(${cardSlotCount}곡)가 셋리스트에 추가되었습니다! 🎭`);
      
      // 상태 업데이트
      onSetListActivated();
      
      // 모달 닫기 및 초기화
      setShowNicknameCardModal(false);
      setSelectedNickname('');
      setCardSlotCount(3);
    } catch (error) {
      console.error('닉네임카드 추가 실패:', error);
      alert('닉네임카드 추가에 실패했습니다.');
    }
  };

  const completeSetList = async (setList: SetListData) => {
    if (!isLeader) return;
    
    if (!confirm(`"${setList.name}" 셋리스트를 완료하고 저장소로 이동하시겠습니까?`)) {
      return;
    }

    try {
      // 통계 계산
      const totalSongs = setList.songs.length + (setList.completedSongs?.length || 0);
      const totalCards = (setList.flexibleCards || []).filter(card => card.order >= 0).length + 
                        (setList.completedFlexibleCards?.length || 0);
      const totalSlots = [...(setList.flexibleCards || []).filter(card => card.order >= 0),
                         ...(setList.completedFlexibleCards || [])].reduce((sum, card) => sum + card.totalSlots, 0);

      // 참가자별 통계 계산
      const participantStats = setList.participants.map(participant => {
        const songCount = [
          ...setList.songs,
          ...(setList.completedSongs || [])
        ].filter(song => song.members.includes(participant)).length;

        const slotCount = [
          ...(setList.flexibleCards || []).filter(card => card.order >= 0),
          ...(setList.completedFlexibleCards || [])
        ].reduce((count, card) => {
          return count + card.slots.filter(slot => slot.members.includes(participant)).length;
        }, 0);

        return {
          nickname: participant,
          songCount: songCount + slotCount,
          totalSongs: songCount,
          totalSlots: slotCount
        };
      });

      // 저장소에 저장할 데이터 준비
      const storedData = {
        name: setList.name,
        originalSetListId: setList.id || '',
        participants: setList.participants,
        songs: setList.songs,
        completedSongs: setList.completedSongs || [],
        flexibleCards: setList.flexibleCards || [],
        completedFlexibleCards: setList.completedFlexibleCards || [],
        statistics: {
          totalSongs: totalSongs + totalSlots,
          totalSlots,
          participantStats
        },
        createdBy: setList.createdBy,
        savedAt: Timestamp.now(),
        originalCreatedAt: setList.createdAt || Timestamp.now()
      };

      // 저장소에 저장
      await addDoc(collection(db, 'storedSetLists'), storedData);

      // 셋리스트를 완료 상태로 변경 (비활성화)
      await updateDoc(doc(db, 'setlists', setList.id!), {
        isActive: false,
        isCompleted: true,
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      
      onSetListActivated(); // 상태 업데이트
      alert(`"${setList.name}" 셋리스트가 완료되어 저장소로 이동되었습니다! 🎉`);
    } catch (error) {
      console.error('셋리스트 완료 실패:', error);
      alert('셋리스트 완료에 실패했습니다.');
    }
  };

  return (
    <div style={{ marginBottom: '30px' }}>
      {/* 셋리스트 생성 폼 */}
      <div style={{ 
        background: 'rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(15px)',
        borderRadius: 20,
        padding: window.innerWidth < 768 ? '16px' : '24px',
        marginBottom: 24,
        border: '1px solid rgba(255, 255, 255, 0.2)',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <h2 style={{ color: 'white', fontSize: 20, marginBottom: 16, fontWeight: 700 }}>
          🎵 새 셋리스트 생성
        </h2>
        
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="셋리스트 이름을 입력하세요"
            value={setListName}
            onChange={(e) => setSetListName(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid rgba(255, 255, 255, 0.3)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              fontSize: 16,
              outline: 'none'
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: 'white', fontSize: 16, marginBottom: 12, fontWeight: 600 }}>
            👥 참가자 목록
          </h3>
          {participants.map((participant, index) => (
            <div key={index} style={{ 
              display: 'flex', 
              gap: window.innerWidth < 768 ? '4px' : '8px', 
              marginBottom: 8, 
              alignItems: 'center',
              width: '100%',
              flexWrap: window.innerWidth < 768 ? 'wrap' : 'nowrap'
            }}>
              <input
                type="text"
                placeholder={`참가자 ${index + 1}`}
                value={participant}
                onChange={(e) => updateParticipant(index, e.target.value)}
                style={{
                  flex: 1,
                  minWidth: window.innerWidth < 768 ? '120px' : '200px',
                  padding: window.innerWidth < 768 ? '6px 8px' : '8px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  fontSize: window.innerWidth < 768 ? '12px' : '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {participant.trim() && (
                <button
                  onClick={() => openPassedSongsModal(participant.trim())}
                  style={{
                    background: 'rgba(59, 130, 246, 0.8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    padding: window.innerWidth < 768 ? '6px 8px' : '8px 12px',
                    cursor: 'pointer',
                    fontSize: window.innerWidth < 768 ? '10px' : '12px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.9)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.8)';
                  }}
                >
                  🎵 합격곡
                </button>
              )}
              {participants.length > 1 && (
                <button
                  onClick={() => removeParticipant(index)}
                  style={{
                    background: 'rgba(220, 38, 38, 0.8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    padding: window.innerWidth < 768 ? '6px 8px' : '8px 12px',
                    cursor: 'pointer',
                    fontSize: window.innerWidth < 768 ? '10px' : '14px',
                    flexShrink: 0
                  }}
                >
                  삭제
                </button>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={addParticipant}
              style={{
                background: 'rgba(34, 197, 94, 0.8)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              + 참가자 추가
            </button>
            
            <button
              onClick={() => setShowNicknameCardModal(true)}
              style={{
                background: 'rgba(168, 85, 247, 0.8)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              + 닉네임카드 추가
            </button>
          </div>
        </div>

        <button
          onClick={createSetList}
          style={{
            background: 'rgba(34, 197, 94, 0.8)',
            color: 'white',
            border: 'none',
            borderRadius: 12,
            padding: '12px 24px',
            cursor: 'pointer',
            fontSize: 16,
            fontWeight: 600,
            width: '100%'
          }}
        >
          🎵 셋리스트 생성
        </button>
      </div>

      {/* 기존 셋리스트 목록 */}
      {setLists.length > 0 && (
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: 20,
          padding: window.innerWidth < 768 ? '16px' : '24px',
          width: '100%',
          boxSizing: 'border-box'
          // 테두리 제거
        }}>
          <h2 style={{ color: 'white', fontSize: 20, marginBottom: 16, fontWeight: 700 }}>
            📋 기존 셋리스트 ({setLists.filter((setList: any) => !setList.isCompleted).length}개)
          </h2>
          
          <div style={{ display: 'grid', gap: 12 }}>
            {setLists.filter((setList: any) => !setList.isCompleted).map((setList) => (
              <div
                key={setList.id}
                style={{
                  background: setList.isActive 
                    ? 'rgba(34, 197, 94, 0.2)' 
                    : 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 16,
                  border: setList.isActive 
                    ? '1px solid rgba(34, 197, 94, 0.5)' 
                    : '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ 
                      color: 'white', 
                      fontSize: 16, 
                      margin: '0 0 8px 0', 
                      fontWeight: 700 
                    }}>
                      {setList.isActive && '🎵 '}{setList.name}
                    </h3>
                    <p style={{ 
                      color: 'rgba(255, 255, 255, 0.7)', 
                      fontSize: 14, 
                      margin: '0 0 4px 0' 
                    }}>
                      참가자: {setList.participants.join(', ')}
                    </p>
                    <p style={{ 
                      color: 'rgba(255, 255, 255, 0.6)', 
                      fontSize: 12, 
                      margin: 0 
                    }}>
                      생성자: {setList.createdBy} | 
                      곡수: {setList.songs.length}곡
                    </p>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    gap: window.innerWidth < 768 ? '4px' : '8px',
                    flexWrap: window.innerWidth < 768 ? 'wrap' : 'nowrap',
                    justifyContent: window.innerWidth < 768 ? 'flex-end' : 'flex-start'
                  }}>
                    {!setList.isActive && (
                      <button
                        onClick={() => activateSetList(setList)}
                        style={{
                          background: 'rgba(34, 197, 94, 0.8)',
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          padding: window.innerWidth < 768 ? '4px 8px' : '6px 12px',
                          cursor: 'pointer',
                          fontSize: window.innerWidth < 768 ? '10px' : '12px',
                          fontWeight: 600,
                          flexShrink: 0
                        }}
                      >
                        활성화
                      </button>
                    )}
                    {setList.isActive && (
                      <button
                        onClick={() => completeSetList(setList)}
                        style={{
                          background: 'rgba(59, 130, 246, 0.8)',
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          padding: window.innerWidth < 768 ? '4px 8px' : '6px 12px',
                          cursor: 'pointer',
                          fontSize: window.innerWidth < 768 ? '10px' : '12px',
                          flexShrink: 0,
                          fontWeight: 600
                        }}
                      >
                        완료
                      </button>
                    )}
                    <button
                      onClick={() => deleteSetList(setList.id!)}
                      style={{
                        background: 'rgba(220, 38, 38, 0.8)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        padding: window.innerWidth < 768 ? '4px 8px' : '6px 12px',
                        cursor: 'pointer',
                        fontSize: window.innerWidth < 768 ? '10px' : '12px',
                        fontWeight: 600,
                        flexShrink: 0
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 현재 셋리스트 곡 목록 */}
      {activeSetList && activeSetList.songs && activeSetList.songs.length > 0 && (
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: 20,
          padding: window.innerWidth < 768 ? '16px' : '24px',
          marginTop: 32,
          marginBottom: 24,
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <h2 style={{ color: 'white', fontSize: 20, marginBottom: 16, fontWeight: 700 }}>
            🎵 현재 셋리스트 곡 목록 ({activeSetList.songs.length}곡)
          </h2>
          
          <div style={{ display: 'grid', gap: 12 }}>
            {activeSetList.songs.map((song, index) => (
              <div
                key={index}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 16,
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    {/* 일반 곡인 경우 */}
                    {!(song as any).nickname && (
                      <>
                        <h3 style={{ 
                          color: 'white', 
                          fontSize: 16, 
                          margin: '0 0 4px 0', 
                          fontWeight: 600 
                        }}>
                          🎵 {song.title}
                        </h3>
                        <p style={{ 
                          color: 'rgba(255, 255, 255, 0.8)', 
                          fontSize: 14, 
                          margin: '0 0 8px 0' 
                        }}>
                          {(song as any).artist}
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {song.members && song.members.map((member: string, memberIndex: number) => (
                            <span
                              key={memberIndex}
                              style={{
                                background: 'rgba(59, 130, 246, 0.8)',
                                color: 'white',
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
                      </>
                    )}
                    
                    {/* 닉네임카드인 경우 */}
                    {(song as any).nickname && (
                      <>
                        <h3 style={{ 
                          color: 'white', 
                          fontSize: 16, 
                          margin: '0 0 4px 0', 
                          fontWeight: 600 
                        }}>
                          🎭 {(song as any).nickname} ({(song as any).totalSlots || (song as any).slots?.length || 0}곡)
                        </h3>
                        <p style={{ 
                          color: 'rgba(255, 255, 255, 0.8)', 
                          fontSize: 14, 
                          margin: '0 0 8px 0' 
                        }}>
                          슬롯: {(song as any).slots?.length || 0}개
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(song as any).slots && (song as any).slots.map((slot: any, slotIndex: number) => (
                            <span
                              key={slotIndex}
                              style={{
                                background: 'rgba(168, 85, 247, 0.8)',
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600
                              }}
                            >
                              {slot.title || '미정'}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: window.innerWidth < 768 ? '6px' : '12px',
                    flexWrap: window.innerWidth < 768 ? 'wrap' : 'nowrap'
                  }}>
                    <div style={{ 
                      background: 'rgba(34, 197, 94, 0.8)',
                      color: 'white',
                      padding: window.innerWidth < 768 ? '4px 8px' : '6px 12px',
                      borderRadius: 8,
                      fontSize: window.innerWidth < 768 ? '12px' : '14px',
                      fontWeight: 600,
                      flexShrink: 0
                    }}>
                      #{index + 1}
                    </div>
                    
                    {isLeader && (
                      <div style={{ 
                        display: 'flex', 
                        gap: window.innerWidth < 768 ? '4px' : '8px',
                        flexWrap: window.innerWidth < 768 ? 'wrap' : 'nowrap'
                      }}>
                        <button
                          onClick={() => completeSongFromSetList(index)}
                          style={{
                            background: 'rgba(34, 197, 94, 0.8)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            padding: window.innerWidth < 768 ? '4px 8px' : '6px 12px',
                            cursor: 'pointer',
                            fontSize: window.innerWidth < 768 ? '10px' : '12px',
                            fontWeight: 600,
                            transition: 'all 0.3s ease',
                            flexShrink: 0
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(34, 197, 94, 0.9)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(34, 197, 94, 0.8)';
                          }}
                        >
                          완료
                        </button>
                        <button
                          onClick={() => removeSongFromSetList(index)}
                          style={{
                            background: 'rgba(220, 38, 38, 0.8)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            padding: window.innerWidth < 768 ? '4px 8px' : '6px 12px',
                            cursor: 'pointer',
                            fontSize: window.innerWidth < 768 ? '10px' : '12px',
                            fontWeight: 600,
                            flexShrink: 0,
                            transition: 'all 0.3s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(220, 38, 38, 0.9)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(220, 38, 38, 0.8)';
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 참가자별 합격곡 모달 */}
      {showPassedSongsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: 16,
            padding: 24,
            maxWidth: 600,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: '#333', fontSize: 20, fontWeight: 700 }}>
                🎵 {selectedParticipant}님의 합격곡
              </h3>
              <button
                onClick={() => setShowPassedSongsModal(false)}
                style={{
                  background: '#6b7280',
                  color: 'white',
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
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 18, color: '#666' }}>합격곡을 불러오는 중...</div>
              </div>
            ) : participantPassedSongs.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '40px 0',
                color: '#666'
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
                <div style={{ fontSize: 16, marginBottom: 8 }}>합격곡이 없습니다</div>
                <div style={{ fontSize: 14, color: '#999' }}>
                  {selectedParticipant}님이 합격한 곡이 아직 없습니다.
                </div>
              </div>
            ) : (
              <div>
                <div style={{ 
                  marginBottom: 16, 
                  padding: '12px 16px', 
                  background: '#f3f4f6', 
                  borderRadius: 8,
                  color: '#374151',
                  fontSize: 14,
                  fontWeight: 600
                }}>
                  총 {participantPassedSongs.length}곡의 합격곡이 있습니다
                </div>
                
                <div style={{ display: 'grid', gap: 12 }}>
                  {participantPassedSongs.map((song, index) => (
                    <div
                      key={song.id || index}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 12,
                        padding: 16,
                        background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ 
                            margin: '0 0 4px 0', 
                            color: '#1f2937', 
                            fontSize: 16, 
                            fontWeight: 700 
                          }}>
                            🎵 {song.title}
                          </h4>
                          <p style={{ 
                            margin: '0 0 8px 0', 
                            color: '#6b7280', 
                            fontSize: 14 
                          }}>
                            {(song as any).artist}
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {song.members && song.members.map((member: string, memberIndex: number) => (
                              <span
                                key={memberIndex}
                                style={{
                                  background: '#dbeafe',
                                  color: '#1e40af',
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
                        <div style={{ 
                          display: 'flex',
                          gap: 8,
                          alignItems: 'center'
                        }}>
                          <div style={{ 
                            background: '#10b981',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600
                          }}>
                            합격
                          </div>
                          <button
                            onClick={() => addSongToSetList(song)}
                            style={{
                              background: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: 6,
                              padding: '4px 8px',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#2563eb';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#3b82f6';
                            }}
                          >
                            반영
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 닉네임카드 추가 모달 */}
      {showNicknameCardModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: 16,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: '#333', fontSize: 20, fontWeight: 700 }}>
                🎭 닉네임카드 추가
              </h3>
              <button
                onClick={() => {
                  setShowNicknameCardModal(false);
                  setSelectedNickname('');
                  setCardSlotCount(3);
                }}
                style={{
                  background: '#6b7280',
                  color: 'white',
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

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600, color: '#374151' }}>
                닉네임 선택
              </label>
              <select
                value={selectedNickname}
                onChange={(e) => setSelectedNickname(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 14,
                  backgroundColor: 'white',
                  color: '#374151'
                }}
              >
                <option value="">닉네임을 선택하세요</option>
                {participants.filter(p => p.trim()).map((participant, index) => (
                  <option key={index} value={participant.trim()}>
                    {participant.trim()}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600, color: '#374151' }}>
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
              <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                해당 닉네임이 몇 곡을 부여받을지 설정하세요.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowNicknameCardModal(false);
                  setSelectedNickname('');
                  setCardSlotCount(3);
                }}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px 24px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                취소
              </button>
              <button
                onClick={addNicknameCardToSetList}
                disabled={!selectedNickname.trim()}
                style={{
                  background: selectedNickname.trim() ? '#a855f7' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px 24px',
                  cursor: selectedNickname.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                닉네임카드 추가
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 통계 컴포넌트 */}
      {activeSetList && (
        <SetListStats 
          activeSetList={activeSetList}
          participants={participants.filter(p => p.trim())}
          onStatsReset={() => {
            // 통계 초기화 후 상태 새로고침
            onSetListActivated();
          }}
        />
      )}
    </div>
  );
};

export default SetListForm;
