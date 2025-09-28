import React, { useState, useCallback } from 'react';
import { updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { FlexibleCard, FlexibleSlot, SetListData } from '../types';

interface FlexibleCardManagerProps {
  activeSetList: SetListData | null;
  isLeader: boolean;
  currentUserNickname: string;
  availableSongs: any[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  slotSearchTerm: string;
  setSlotSearchTerm: (term: string) => void;
  onCardUpdated: () => void;
}

const FlexibleCardManager: React.FC<FlexibleCardManagerProps> = ({
  activeSetList,
  isLeader,
  currentUserNickname,
  availableSongs,
  searchTerm,
  setSearchTerm,
  slotSearchTerm,
  setSlotSearchTerm,
  onCardUpdated
}) => {
  // 유연한 카드 생성 관련 상태
  const [showFlexibleCardForm, setShowFlexibleCardForm] = useState(false);
  const [flexibleCardNickname, setFlexibleCardNickname] = useState('');
  const [flexibleCardCount, setFlexibleCardCount] = useState(3);
  
  // 유연한 카드 편집 관련 상태
  const [editingFlexibleCard, setEditingFlexibleCard] = useState<FlexibleCard | null>(null);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number>(-1);
  const [currentEditingSlot, setCurrentEditingSlot] = useState<FlexibleSlot | null>(null);
  const [newParticipantName, setNewParticipantName] = useState('');

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
      order: -1, // 생성 시에는 셋리스트에 추가되지 않은 상태
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
      onCardUpdated();
    } catch (error) {
      console.error('유연한 카드 생성 실패:', error);
      alert('유연한 카드 생성에 실패했습니다.');
    }
  }, [activeSetList, isLeader, flexibleCardNickname, flexibleCardCount, onCardUpdated]);

  // 유연한 카드 삭제 함수
  const deleteFlexibleCard = useCallback(async (cardId: string) => {
    if (!activeSetList || !isLeader) return;
    
    const cardToDelete = activeSetList.flexibleCards?.find(card => card.id === cardId);
    if (!cardToDelete || !canEditFlexibleCard(cardToDelete)) return;
    
    if (!confirm(`"${cardToDelete.nickname}" 카드를 삭제하시겠습니까?`)) return;

    try {
      const updatedFlexibleCards = (activeSetList.flexibleCards || []).filter(card => card.id !== cardId);
      
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        flexibleCards: updatedFlexibleCards,
        updatedAt: Timestamp.now()
      });
      
      alert('유연한 카드가 삭제되었습니다.');
      onCardUpdated();
    } catch (error) {
      console.error('유연한 카드 삭제 실패:', error);
      alert('유연한 카드 삭제에 실패했습니다.');
    }
  }, [activeSetList, isLeader, canEditFlexibleCard, onCardUpdated]);

  // 유연한 카드를 셋리스트에 추가
  const addFlexibleCardToSetList = useCallback(async (cardId: string) => {
    if (!activeSetList || !isLeader) return;
    
    const cardToAdd = activeSetList.flexibleCards?.find(card => card.id === cardId);
    if (!cardToAdd || cardToAdd.order >= 0) return;
    
    // 새로운 순서 계산
    const allItems = [
      ...activeSetList.songs,
      ...(activeSetList.flexibleCards || []).filter(card => card.order >= 0),
      ...(activeSetList.requestSongCards || []).filter(card => card.order >= 0)
    ];
    const newOrder = allItems.length;

    const updatedFlexibleCards = (activeSetList.flexibleCards || []).map(card => 
      card.id === cardId ? { ...card, order: newOrder } : card
    );

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        flexibleCards: updatedFlexibleCards,
        updatedAt: Timestamp.now()
      });
      
      alert(`"${cardToAdd.nickname}" 카드가 셋리스트에 추가되었습니다! 🎵`);
      onCardUpdated();
    } catch (error) {
      console.error('유연한 카드 추가 실패:', error);
      alert('유연한 카드 추가에 실패했습니다.');
    }
  }, [activeSetList, isLeader, onCardUpdated]);

  // 유연한 카드 완료 처리
  const completeFlexibleCard = useCallback(async (cardId: string) => {
    if (!activeSetList || !isLeader) return;
    
    const cardToComplete = activeSetList.flexibleCards?.find(card => card.id === cardId);
    if (!cardToComplete) return;
    
    if (!confirm(`"${cardToComplete.nickname}" 카드를 완료 처리하시겠습니까?`)) return;

    try {
      // 완료된 카드를 completedFlexibleCards로 이동
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
      
      alert(`"${cardToComplete.nickname}" 카드가 완료되었습니다! 🎉`);
      onCardUpdated();
    } catch (error) {
      console.error('유연한 카드 완료 실패:', error);
      alert('유연한 카드 완료에 실패했습니다.');
    }
  }, [activeSetList, isLeader, onCardUpdated]);

  // 슬롯 업데이트 함수
  const updateFlexibleCardSlot = useCallback(async (cardId: string, slotIndex: number, updatedSlot: FlexibleSlot) => {
    if (!activeSetList) {
      console.error('활성 셋리스트가 없습니다.');
      return;
    }
    
    const cardToUpdate = activeSetList.flexibleCards?.find(card => card.id === cardId);
    if (!cardToUpdate) {
      console.error('업데이트할 카드를 찾을 수 없습니다.');
      return;
    }
    
    if (!canEditFlexibleCard(cardToUpdate)) {
      alert('이 카드를 편집할 권한이 없습니다.');
      return;
    }

    const updatedSlots = [...cardToUpdate.slots];
    updatedSlots[slotIndex] = updatedSlot;
    
    const updatedCard = {
      ...cardToUpdate,
      slots: updatedSlots
    };

    const updatedFlexibleCards = (activeSetList.flexibleCards || []).map(card => 
      card.id === cardId ? updatedCard : card
    );

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        flexibleCards: updatedFlexibleCards,
        updatedAt: Timestamp.now()
      });
      
      onCardUpdated();
    } catch (error) {
      console.error('슬롯 업데이트 실패:', error);
      alert('슬롯 업데이트에 실패했습니다.');
    }
  }, [activeSetList, canEditFlexibleCard, onCardUpdated]);

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

  // 사용 가능한 유연한 카드 목록
  const getAvailableFlexibleCards = useCallback(() => {
    if (!activeSetList) return [];
    return (activeSetList.flexibleCards || []).filter(card => card.order < 0);
  }, [activeSetList]);

  return (
    <div>
      {/* 유연한 카드 생성 폼 */}
      {isLeader && (
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ color: 'white', fontSize: 20, margin: 0, fontWeight: 700 }}>
              🎭 유연한 카드 관리
            </h2>
            <button
              onClick={() => setShowFlexibleCardForm(!showFlexibleCardForm)}
              style={{
                background: showFlexibleCardForm ? 'rgba(220, 38, 38, 0.8)' : 'rgba(34, 197, 94, 0.8)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              {showFlexibleCardForm ? '취소' : '+ 새 카드'}
            </button>
          </div>

          {showFlexibleCardForm && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="닉네임을 입력하세요"
                  value={flexibleCardNickname}
                  onChange={(e) => setFlexibleCardNickname(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    fontSize: 14,
                    outline: 'none'
                  }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <select
                  value={flexibleCardCount}
                  onChange={(e) => setFlexibleCardCount(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    fontSize: 14,
                    outline: 'none'
                  }}
                >
                  <option value={1}>1곡</option>
                  <option value={2}>2곡</option>
                  <option value={3}>3곡</option>
                  <option value={4}>4곡</option>
                  <option value={5}>5곡</option>
                </select>
              </div>
              <button
                onClick={createFlexibleCard}
                disabled={!flexibleCardNickname.trim()}
                style={{
                  background: flexibleCardNickname.trim() ? 'rgba(34, 197, 94, 0.8)' : 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 16px',
                  cursor: flexibleCardNickname.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                  fontWeight: 600,
                  width: '100%'
                }}
              >
                🎭 유연한 카드 생성
              </button>
            </div>
          )}
        </div>
      )}

      {/* 사용 가능한 유연한 카드 목록 */}
      {getAvailableFlexibleCards().length > 0 && (
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <h3 style={{ color: 'white', fontSize: 18, marginBottom: 16, fontWeight: 700 }}>
            🎭 사용 가능한 유연한 카드 ({getAvailableFlexibleCards().length}개)
          </h3>
          
          <div style={{ display: 'grid', gap: 12 }}>
            {getAvailableFlexibleCards().map((card) => (
              <div
                key={card.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 16,
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ color: 'white', fontSize: 16, margin: '0 0 8px 0', fontWeight: 700 }}>
                      🎭 {card.nickname} ({card.totalSlots}곡)
                    </h4>
                    <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 14, margin: 0 }}>
                      슬롯: {card.slots.length}개
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    {isLeader && (
                      <button
                        onClick={() => addFlexibleCardToSetList(card.id)}
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
                        셋리스트에 추가
                      </button>
                    )}
                    {canEditFlexibleCard(card) && (
                      <button
                        onClick={() => deleteFlexibleCard(card.id)}
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
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FlexibleCardManager;
