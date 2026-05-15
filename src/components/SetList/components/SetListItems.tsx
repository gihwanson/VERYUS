import React, { useState, useCallback } from 'react';
import { updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { SetListData, SetListItem, FlexibleCard, RequestSongCard, SetListEntry } from '../types';

interface SetListItemsProps {
  activeSetList: SetListData | null;
  isLeader: boolean;
  currentUserNickname: string;
  availableSongs: any[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onItemUpdated: () => void;
}

const SetListItems: React.FC<SetListItemsProps> = ({
  activeSetList,
  isLeader,
  currentUserNickname,
  availableSongs,
  searchTerm,
  setSearchTerm,
  onItemUpdated
}) => {
  const [draggedItem, setDraggedItem] = useState<SetListEntry | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number>(-1);
  const [touchStart, setTouchStart] = useState<{ y: number; itemIndex: number } | null>(null);
  const [touchDragOffset, setTouchDragOffset] = useState<number>(0);

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

  // 모든 아이템 가져오기
  const getAllItems = useCallback(() => {
    if (!activeSetList) return [];
    
    const songs = activeSetList.songs.map(song => ({ ...song, type: 'song' as const }));
    const flexCards = (activeSetList.flexibleCards || [])
      .filter(card => card.order >= 0) // order가 0 이상인 카드만 셋리스트에 표시
      .map(card => ({ ...card, type: 'flexible' as const }));
    const requestSongCards = (activeSetList.requestSongCards || [])
      .filter(card => card.order >= 0) // order가 0 이상인 카드만 셋리스트에 표시
      .map(card => ({ ...card, type: 'requestSong' as const }));
    
    return [...songs, ...flexCards, ...requestSongCards]
      .sort((a, b) => a.order - b.order);
  }, [activeSetList]);

  // 곡을 셋리스트에 추가
  const addSongToSetList = async (song: any) => {
    if (!activeSetList || !isLeader) return;
    
    const isAlreadyAdded = activeSetList.songs.some(s => s.songId === song.id);
    if (isAlreadyAdded) {
      alert('이미 추가된 곡입니다.');
      return;
    }

    const newSetListItem: SetListItem = {
      songId: song.id,
      title: song.title,
      members: song.members,
      order: activeSetList.songs.length
    };

    const updatedSongs = [...activeSetList.songs, newSetListItem];

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });
      
      alert(`"${song.title}"이 셋리스트에 추가되었습니다! 🎵`);
      onItemUpdated();
    } catch (error) {
      console.error('곡 추가 실패:', error);
      alert('곡 추가에 실패했습니다.');
    }
  };

  // 셋리스트에서 곡 제거
  const removeSongFromSetList = async (songId: string) => {
    if (!activeSetList || !isLeader) return;
    
    if (!confirm('정말로 이 곡을 셋리스트에서 제거하시겠습니까?')) return;

    try {
      const updatedSongs = activeSetList.songs.filter(song => song.songId !== songId);
      
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });
      
      alert('곡이 셋리스트에서 제거되었습니다.');
      onItemUpdated();
    } catch (error) {
      console.error('곡 제거 실패:', error);
      alert('곡 제거에 실패했습니다.');
    }
  };

  // 곡 완료 처리
  const completeSongFromManager = async (songId: string) => {
    if (!activeSetList || !isLeader) return;
    
    const songToComplete = activeSetList.songs.find(song => song.songId === songId);
    if (!songToComplete) return;
    
    if (!confirm(`"${songToComplete.title}"을 완료 처리하시겠습니까?`)) return;

    try {
      const completedSong = {
        ...songToComplete,
        completedAt: Timestamp.now()
      };
      
      const updatedSongs = activeSetList.songs.filter(song => song.songId !== songId);
      const updatedCompletedSongs = [...(activeSetList.completedSongs || []), completedSong];
      
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        completedSongs: updatedCompletedSongs,
        updatedAt: Timestamp.now()
      });
      
      alert(`"${songToComplete.title}"이 완료되었습니다! 🎉`);
      onItemUpdated();
    } catch (error) {
      console.error('곡 완료 실패:', error);
      alert('곡 완료에 실패했습니다.');
    }
  };

  // 유연한 카드 완료 처리
  const completeFlexibleCard = async (cardId: string) => {
    if (!activeSetList || !isLeader) return;
    
    const cardToComplete = activeSetList.flexibleCards?.find(card => card.id === cardId);
    if (!cardToComplete) return;
    
    if (!confirm(`"${cardToComplete.nickname}" 자유곡을 완료 처리하시겠습니까?`)) return;

    try {
      const completedCard = {
        ...cardToComplete,
        completedAt: Timestamp.now()
      };
      
      const updatedFlexibleCards = (activeSetList.flexibleCards || []).map(card => 
        card.id === cardId ? { ...card, order: -1 } : card
      );
      
      const updatedCompletedFlexibleCards = [
        ...(activeSetList.completedFlexibleCards || []),
        completedCard
      ];

      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        flexibleCards: updatedFlexibleCards,
        completedFlexibleCards: updatedCompletedFlexibleCards,
        updatedAt: Timestamp.now()
      });
      
      alert(`"${cardToComplete.nickname}" 자유곡이 완료되었습니다! 🎉`);
      onItemUpdated();
    } catch (error) {
      console.error('유연한 카드 완료 실패:', error);
      alert('자유곡 완료에 실패했습니다.');
    }
  };

  // 신청곡 카드 완료 처리
  const completeRequestSongCard = async (cardId: string) => {
    if (!activeSetList || !isLeader) return;
    
    const cardToComplete = activeSetList.requestSongCards?.find(card => card.id === cardId);
    if (!cardToComplete) return;
    
    if (!confirm('이 신청곡 카드를 완료 처리하시겠습니까?')) return;

    try {
      const completedCard = {
        ...cardToComplete,
        completedAt: Timestamp.now()
      };
      
      const updatedRequestSongCards = (activeSetList.requestSongCards || []).map(card => 
        card.id === cardId ? { ...card, order: -1 } : card
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
      onItemUpdated();
    } catch (error) {
      console.error('신청곡 카드 완료 실패:', error);
      alert('신청곡 카드 완료에 실패했습니다.');
    }
  };

  // 드래그 시작
  const handleDragStart = (e: React.DragEvent, item: SetListEntry, index: number) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };

  // 드래그 오버
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  // 드롭 처리
  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    
    if (!draggedItem || !activeSetList || !isLeader) return;
    
    const allItems = getAllItems();
    const sourceIndex = allItems.findIndex(item => 
      (isSetListItem(item) && isSetListItem(draggedItem) && item.songId === draggedItem.songId) ||
      (isFlexibleCard(item) && isFlexibleCard(draggedItem) && item.id === draggedItem.id) ||
      (isRequestSongCard(item) && isRequestSongCard(draggedItem) && item.id === draggedItem.id)
    );
    
    if (sourceIndex === -1 || sourceIndex === targetIndex) {
      setDraggedItem(null);
      setDragOverIndex(-1);
      return;
    }
    
    // 순서 재정렬 로직
    const reorderedItems = [...allItems];
    const [movedItem] = reorderedItems.splice(sourceIndex, 1);
    reorderedItems.splice(targetIndex, 0, movedItem);
    
    // 새로운 순서로 업데이트
    const updatedSongs = reorderedItems
      .filter(item => isSetListItem(item))
      .map((item, index) => ({ ...item, order: index }));
    
    const updatedFlexibleCards = reorderedItems
      .filter(item => isFlexibleCard(item))
      .map((item, index) => ({ ...item, order: index }));
    
    const updatedRequestSongCards = reorderedItems
      .filter(item => isRequestSongCard(item))
      .map((item, index) => ({ ...item, order: index }));

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        flexibleCards: updatedFlexibleCards,
        requestSongCards: updatedRequestSongCards,
        updatedAt: Timestamp.now()
      });
      
      onItemUpdated();
    } catch (error) {
      console.error('순서 변경 실패:', error);
      alert('순서 변경에 실패했습니다.');
    }
    
    setDraggedItem(null);
    setDragOverIndex(-1);
  };

  // 터치 드래그 시작
  const handleTouchStart = (e: React.TouchEvent, item: SetListEntry, index: number) => {
    const touch = e.touches[0];
    setTouchStart({ y: touch.clientY, itemIndex: index });
    setTouchDragOffset(0);
  };

  // 터치 드래그 이동
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    
    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStart.y;
    setTouchDragOffset(deltaY);
  };

  // 터치 드래그 종료
  const handleTouchEnd = () => {
    setTouchStart(null);
    setTouchDragOffset(0);
  };

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

  return (
    <div>
      {/* 셋리스트 아이템 목록 */}
      <div style={{ 
        background: 'rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(15px)',
        borderRadius: 20,
        padding: 24,
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <h2 style={{ color: 'white', fontSize: 20, marginBottom: 16, fontWeight: 700 }}>
          🎵 셋리스트 아이템 ({allItems.length}개)
        </h2>
        
        {allItems.length === 0 ? (
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
              곡을 추가하거나 자유곡을 생성해보세요.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {allItems.map((item, index) => (
              <div
                key={isSetListItem(item) ? item.songId : item.id}
                draggable={isLeader}
                onDragStart={(e) => handleDragStart(e, item, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onTouchStart={(e) => handleTouchStart(e, item, index)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                  background: dragOverIndex === index 
                    ? 'rgba(34, 197, 94, 0.2)' 
                    : 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 16,
                  border: dragOverIndex === index 
                    ? '1px solid rgba(34, 197, 94, 0.5)' 
                    : '1px solid rgba(255, 255, 255, 0.2)',
                  transform: touchStart?.itemIndex === index 
                    ? `translateY(${touchDragOffset}px)` 
                    : 'none',
                  transition: 'all 0.2s ease',
                  cursor: isLeader ? 'move' : 'default'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    {isSetListItem(item) && (
                      <>
                        <h4 style={{ color: 'white', fontSize: 16, margin: '0 0 8px 0', fontWeight: 700 }}>
                          🎵 {item.title}
                        </h4>
                        <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 14, margin: 0 }}>
                          참여자: {item.members.join(', ')}
                        </p>
                      </>
                    )}
                    
                    {isFlexibleCard(item) && (
                      <>
                        <h4 style={{ color: 'white', fontSize: 16, margin: '0 0 8px 0', fontWeight: 700 }}>
                          🎵 {item.nickname} 자유곡 ({item.totalSlots}곡)
                        </h4>
                        <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 14, margin: 0 }}>
                          슬롯: {item.slots.length}개
                        </p>
                      </>
                    )}
                    
                    {isRequestSongCard(item) && (
                      <>
                        <h4 style={{ color: 'white', fontSize: 16, margin: '0 0 8px 0', fontWeight: 700 }}>
                          🎤 신청곡 카드 ({item.songs.length}곡)
                        </h4>
                        <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 14, margin: 0 }}>
                          {item.songs.length > 0 ? item.songs.map(song => song.title).join(', ') : '아직 신청곡이 없습니다.'}
                        </p>
                      </>
                    )}
                  </div>
                  
                  {isLeader && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          if (isSetListItem(item)) {
                            completeSongFromManager(item.songId || '');
                          } else if (isFlexibleCard(item)) {
                            completeFlexibleCard(item.id);
                          } else if (isRequestSongCard(item)) {
                            completeRequestSongCard(item.id);
                          }
                        }}
                        style={{
                          background: 'rgba(34, 197, 94, 0.8)',
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          padding: '6px 12px',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600
                        }}
                      >
                        완료
                      </button>
                      <button
                        onClick={() => {
                          if (isSetListItem(item)) {
                            removeSongFromSetList(item.songId || '');
                          }
                        }}
                        style={{
                          background: 'rgba(220, 38, 38, 0.8)',
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          padding: '6px 12px',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600
                        }}
                      >
                        제거
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SetListItems;
