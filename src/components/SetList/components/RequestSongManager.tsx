import React, { useState, useCallback } from 'react';
import { updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { RequestSongCard, RequestSong, SetListData } from '../types';

interface RequestSongManagerProps {
  activeSetList: SetListData | null;
  isLeader: boolean;
  onCardUpdated: () => void;
}

const RequestSongManager: React.FC<RequestSongManagerProps> = ({
  activeSetList,
  isLeader,
  onCardUpdated
}) => {
  // 신청곡 카드 편집 관련 상태
  const [editingRequestSongCard, setEditingRequestSongCard] = useState<RequestSongCard | null>(null);
  const [newSongTitle, setNewSongTitle] = useState('');

  // 신청곡 카드 생성 함수
  const createRequestSongCard = useCallback(async () => {
    if (!activeSetList || !isLeader) return;
    
    const newRequestSongCard: RequestSongCard = {
      id: `request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'requestSong',
      songs: [],
      order: -1, // 생성 시에는 셋리스트에 추가되지 않은 상태
    };

    // 기존 신청곡 카드들의 order를 -1로 설정
    const updatedRequestSongCards = (activeSetList.requestSongCards || []).map(card => ({
      ...card,
      order: -1
    }));

    // 유연한 카드들의 order도 -1로 설정
    const updatedFlexibleCards = (activeSetList.flexibleCards || []).map(card => ({
      ...card,
      order: -1
    }));

    const allUpdatedRequestSongCards = [...updatedRequestSongCards, newRequestSongCard];

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        requestSongCards: allUpdatedRequestSongCards,
        flexibleCards: updatedFlexibleCards,
        updatedAt: Timestamp.now()
      });
      
      alert('신청곡 카드가 생성되었습니다! 🎵');
      onCardUpdated();
    } catch (error) {
      console.error('신청곡 카드 생성 실패:', error);
      alert('신청곡 카드 생성에 실패했습니다.');
    }
  }, [activeSetList, isLeader, onCardUpdated]);

  // 신청곡 카드 삭제 함수
  const deleteRequestSongCard = useCallback(async (cardId: string) => {
    if (!activeSetList || !isLeader) return;
    
    if (!confirm('정말로 이 신청곡 카드를 삭제하시겠습니까?')) return;

    try {
      const updatedRequestSongCards = (activeSetList.requestSongCards || []).filter(card => card.id !== cardId);
      
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        requestSongCards: updatedRequestSongCards,
        updatedAt: Timestamp.now()
      });
      
      alert('신청곡 카드가 삭제되었습니다.');
      onCardUpdated();
    } catch (error) {
      console.error('신청곡 카드 삭제 실패:', error);
      alert('신청곡 카드 삭제에 실패했습니다.');
    }
  }, [activeSetList, isLeader, onCardUpdated]);

  // 신청곡 카드를 셋리스트에 추가
  const addRequestSongCardToSetList = useCallback(async (cardId: string) => {
    if (!activeSetList || !isLeader) return;
    
    const cardToAdd = activeSetList.requestSongCards?.find(card => card.id === cardId);
    if (!cardToAdd || cardToAdd.order >= 0) return;
    
    // 새로운 순서 계산
    const allItems = [
      ...activeSetList.songs,
      ...(activeSetList.flexibleCards || []).filter(card => card.order >= 0),
      ...(activeSetList.requestSongCards || []).filter(card => card.order >= 0)
    ];
    const newOrder = allItems.length;

    const updatedRequestSongCards = (activeSetList.requestSongCards || []).map(card => 
      card.id === cardId ? { ...card, order: newOrder } : card
    );

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        requestSongCards: updatedRequestSongCards,
        updatedAt: Timestamp.now()
      });
      
      alert('신청곡 카드가 셋리스트에 추가되었습니다! 🎵');
      onCardUpdated();
    } catch (error) {
      console.error('신청곡 카드 추가 실패:', error);
      alert('신청곡 카드 추가에 실패했습니다.');
    }
  }, [activeSetList, isLeader, onCardUpdated]);

  // 신청곡 카드 완료 처리
  const completeRequestSongCard = useCallback(async (cardId: string) => {
    if (!activeSetList || !isLeader) return;
    
    const cardToComplete = activeSetList.requestSongCards?.find(card => card.id === cardId);
    if (!cardToComplete) return;
    
    if (!confirm('이 신청곡 카드를 완료 처리하시겠습니까?')) return;

    try {
      // 완료된 카드를 completedRequestSongCards로 이동
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
      onCardUpdated();
    } catch (error) {
      console.error('신청곡 카드 완료 실패:', error);
      alert('신청곡 카드 완료에 실패했습니다.');
    }
  }, [activeSetList, isLeader, onCardUpdated]);

  // 신청곡 추가
  const addSongToRequestCard = useCallback(async (cardId: string, songTitle: string) => {
    if (!activeSetList) return;
    
    const cardToUpdate = activeSetList.requestSongCards?.find(card => card.id === cardId);
    if (!cardToUpdate) return;
    
    const newSong: RequestSong = {
      id: `song_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: songTitle.trim(),
      requestedBy: 'Unknown' // 실제로는 현재 사용자 정보를 사용해야 함
    };
    
    const updatedCard = {
      ...cardToUpdate,
      songs: [...cardToUpdate.songs, newSong]
    };
    
    const updatedRequestSongCards = (activeSetList.requestSongCards || []).map(card => 
      card.id === cardId ? updatedCard : card
    );

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        requestSongCards: updatedRequestSongCards,
        updatedAt: Timestamp.now()
      });
      
      onCardUpdated();
    } catch (error) {
      console.error('신청곡 추가 실패:', error);
      alert('신청곡 추가에 실패했습니다.');
    }
  }, [activeSetList, onCardUpdated]);

  // 신청곡 제거
  const removeSongFromRequestCard = useCallback(async (cardId: string, songId: string) => {
    if (!activeSetList) return;
    
    const cardToUpdate = activeSetList.requestSongCards?.find(card => card.id === cardId);
    if (!cardToUpdate) return;
    
    const updatedCard = {
      ...cardToUpdate,
      songs: cardToUpdate.songs.filter(song => song.id !== songId)
    };
    
    const updatedRequestSongCards = (activeSetList.requestSongCards || []).map(card => 
      card.id === cardId ? updatedCard : card
    );

    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        requestSongCards: updatedRequestSongCards,
        updatedAt: Timestamp.now()
      });
      
      onCardUpdated();
    } catch (error) {
      console.error('신청곡 제거 실패:', error);
      alert('신청곡 제거에 실패했습니다.');
    }
  }, [activeSetList, onCardUpdated]);

  // 사용 가능한 신청곡 카드 목록
  const getAvailableRequestSongCards = useCallback(() => {
    if (!activeSetList) return [];
    return (activeSetList.requestSongCards || []).filter(card => card.order < 0);
  }, [activeSetList]);

  return (
    <div>
      {/* 신청곡 카드 생성 */}
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
              🎤 신청곡 카드 관리
            </h2>
            <button
              onClick={createRequestSongCard}
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
              + 새 신청곡 카드
            </button>
          </div>
        </div>
      )}

      {/* 사용 가능한 신청곡 카드 목록 */}
      {getAvailableRequestSongCards().length > 0 && (
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <h3 style={{ color: 'white', fontSize: 18, marginBottom: 16, fontWeight: 700 }}>
            🎤 사용 가능한 신청곡 카드 ({getAvailableRequestSongCards().length}개)
          </h3>
          
          <div style={{ display: 'grid', gap: 12 }}>
            {getAvailableRequestSongCards().map((card) => (
              <div
                key={card.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 16,
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <div style={{ marginBottom: 12 }}>
                  <h4 style={{ color: 'white', fontSize: 16, margin: '0 0 8px 0', fontWeight: 700 }}>
                    🎤 신청곡 카드 ({card.songs.length}곡)
                  </h4>
                  
                  {card.songs.length > 0 ? (
                    <div style={{ marginBottom: 12 }}>
                      {card.songs.map((song, index) => (
                        <div
                          key={song.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: 8,
                            padding: '8px 12px',
                            marginBottom: 4
                          }}
                        >
                          <span style={{ color: 'white', fontSize: 14 }}>
                            {index + 1}. {song.title}
                          </span>
                          <button
                            onClick={() => removeSongFromRequestCard(card.id, song.id)}
                            style={{
                              background: 'rgba(220, 38, 38, 0.8)',
                              color: 'white',
                              border: 'none',
                              borderRadius: 4,
                              padding: '4px 8px',
                              cursor: 'pointer',
                              fontSize: 12
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 14, margin: '0 0 12px 0' }}>
                      아직 신청곡이 없습니다.
                    </p>
                  )}
                  
                  {/* 신청곡 추가 폼 */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                      type="text"
                      placeholder="신청곡 제목을 입력하세요"
                      value={newSongTitle}
                      onChange={(e) => setNewSongTitle(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && newSongTitle.trim()) {
                          addSongToRequestCard(card.id, newSongTitle);
                          setNewSongTitle('');
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        fontSize: 14,
                        outline: 'none'
                      }}
                    />
                    <button
                      onClick={() => {
                        if (newSongTitle.trim()) {
                          addSongToRequestCard(card.id, newSongTitle);
                          setNewSongTitle('');
                        }
                      }}
                      disabled={!newSongTitle.trim()}
                      style={{
                        background: newSongTitle.trim() ? 'rgba(34, 197, 94, 0.8)' : 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 12px',
                        cursor: newSongTitle.trim() ? 'pointer' : 'not-allowed',
                        fontSize: 14,
                        fontWeight: 600
                      }}
                    >
                      추가
                    </button>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: 8 }}>
                  {isLeader && (
                    <button
                      onClick={() => addRequestSongCardToSetList(card.id)}
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
                  <button
                    onClick={() => deleteRequestSongCard(card.id)}
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
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RequestSongManager;
