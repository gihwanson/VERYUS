import React, { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  Timestamp,
  query,
  orderBy 
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useSetListData } from './hooks/useSetListData';

interface StoredSetList {
  id: string;
  name: string;
  originalSetListId: string;
  participants: string[];
  songs: any[];
  completedSongs: any[];
  flexibleCards: any[];
  completedFlexibleCards: any[];
  statistics: {
    totalSongs: number;
    totalSlots: number;
    participantStats: any[];
  };
  createdBy: string;
  savedAt: Timestamp;
  originalCreatedAt: Timestamp;
}

const SetListStorage: React.FC = () => {
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isLeader = user && user.role === '리더';
  
  const { activeSetList, setLists } = useSetListData();
  const [storedSetLists, setStoredSetLists] = useState<StoredSetList[]>([]);
  const [loading, setLoading] = useState(false);

  // 저장된 셋리스트 목록 가져오기
  const fetchStoredSetLists = async () => {
    try {
      const q = query(collection(db, 'storedSetLists'), orderBy('savedAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const stored = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StoredSetList[];
      setStoredSetLists(stored);
    } catch (error) {
      console.error('저장된 셋리스트 가져오기 실패:', error);
    }
  };

  useEffect(() => {
    fetchStoredSetLists();
  }, []);

  // 현재 활성 셋리스트를 저장소에 저장
  const saveCurrentSetList = async () => {
    if (!activeSetList || !isLeader) {
      alert('저장할 활성 셋리스트가 없거나 권한이 없습니다.');
      return;
    }

    setLoading(true);
    try {
      // 통계 계산
      const totalSongs = activeSetList.songs.length + (activeSetList.completedSongs?.length || 0);
      const totalCards = (activeSetList.flexibleCards || []).filter(card => card.order >= 0).length + 
                        (activeSetList.completedFlexibleCards?.length || 0);
      const totalSlots = [...(activeSetList.flexibleCards || []).filter(card => card.order >= 0),
                         ...(activeSetList.completedFlexibleCards || [])].reduce((sum, card) => sum + card.totalSlots, 0);

      // 참가자별 통계 계산
      const participantStats = activeSetList.participants.map(participant => {
        const songCount = [
          ...activeSetList.songs,
          ...(activeSetList.completedSongs || [])
        ].filter(song => song.members.includes(participant)).length;

        const slotCount = [
          ...(activeSetList.flexibleCards || []).filter(card => card.order >= 0),
          ...(activeSetList.completedFlexibleCards || [])
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

      const storedData = {
        name: activeSetList.name,
        originalSetListId: activeSetList.id || '',
        participants: activeSetList.participants,
        songs: activeSetList.songs,
        completedSongs: activeSetList.completedSongs || [],
        flexibleCards: activeSetList.flexibleCards || [],
        completedFlexibleCards: activeSetList.completedFlexibleCards || [],
        statistics: {
          totalSongs: totalSongs + totalSlots,
          totalSlots,
          participantStats
        },
        createdBy: activeSetList.createdBy,
        savedAt: Timestamp.now(),
        originalCreatedAt: activeSetList.createdAt || Timestamp.now()
      };

      await addDoc(collection(db, 'storedSetLists'), storedData);
      alert('셋리스트가 저장소에 저장되었습니다! 📦');
      fetchStoredSetLists(); // 목록 새로고침
    } catch (error) {
      console.error('셋리스트 저장 실패:', error);
      alert('셋리스트 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 저장된 셋리스트 삭제
  const deleteStoredSetList = async (storedId: string) => {
    if (!isLeader) {
      alert('삭제 권한이 없습니다.');
      return;
    }

    if (!confirm('정말로 이 저장된 셋리스트를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'storedSetLists', storedId));
      alert('저장된 셋리스트가 삭제되었습니다.');
      fetchStoredSetLists(); // 목록 새로고침
    } catch (error) {
      console.error('저장된 셋리스트 삭제 실패:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: 'none' }}>
      {/* 현재 셋리스트 저장 영역 */}
      {isLeader && activeSetList && (
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: 20, 
          padding: 24, 
          marginBottom: 24,
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <h2 style={{ color: 'white', fontSize: 20, marginBottom: 16, fontWeight: 700 }}>
            💾 현재 셋리스트 저장
          </h2>
          
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 14, margin: '0 0 12px 0' }}>
              현재 활성 셋리스트: <strong style={{ color: 'white' }}>{activeSetList.name}</strong>
            </p>
            <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 12, margin: 0 }}>
              모든 곡, 닉네임 카드, 완료 상태 및 통계가 함께 저장됩니다.
            </p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <button
              onClick={saveCurrentSetList}
              disabled={loading}
              style={{ 
                background: loading ? 'rgba(255, 255, 255, 0.1)' : 'rgba(34, 197, 94, 0.8)',
                backdropFilter: 'blur(10px)',
                color: 'white', 
                border: '1px solid rgba(255, 255, 255, 0.3)', 
                borderRadius: 12, 
                padding: '12px 24px', 
                fontWeight: 600, 
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 16,
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.9)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.8)';
                }
              }}
            >
              {loading ? '⏳ 저장 중...' : '💾 저장소에 저장'}
            </button>
          </div>
        </div>
      )}

      {/* 저장된 셋리스트 목록 */}
      <div>
        <h3 style={{ color: 'white', fontSize: 18, marginBottom: 16, fontWeight: 700 }}>
          📦 저장된 셋리스트 ({storedSetLists.length}개)
        </h3>
        
        {storedSetLists.length === 0 ? (
          <div style={{ 
            padding: 40, 
            textAlign: 'center', 
            color: 'rgba(255, 255, 255, 0.8)',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            borderRadius: 20,
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
            <p style={{ fontSize: 16, margin: 0 }}>저장된 셋리스트가 없습니다.</p>
            {isLeader && (
              <p style={{ fontSize: 14, margin: '8px 0 0 0', color: 'rgba(255, 255, 255, 0.6)' }}>
                위에서 현재 셋리스트를 저장해보세요!
              </p>
            )}
          </div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))'
          }}>
            {storedSetLists.map((stored) => (
              <div
                key={stored.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(15px)',
                  borderRadius: 20,
                  padding: 20,
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ color: 'white', fontSize: 16, margin: '0 0 8px 0', fontWeight: 700 }}>
                    🎭 {stored.name}
                  </h4>
                  <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 12, margin: 0 }}>
                    저장일: {stored.savedAt.toDate().toLocaleDateString('ko-KR')} {stored.savedAt.toDate().toLocaleTimeString('ko-KR')}
                  </p>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 14 }}>
                      👥 참가자: {stored.participants.join(', ')}
                    </span>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 14 }}>
                      🎵 총 곡수: {stored.statistics.totalSongs}곡
                    </span>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 14 }}>
                      📊 완료: {stored.completedSongs.length + stored.completedFlexibleCards.length}개
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 14 }}>
                      👤 생성자: {stored.createdBy}
                    </span>
                  </div>
                </div>

                {/* 참가자별 통계 */}
                <div style={{ marginBottom: 16 }}>
                  <h5 style={{ color: 'white', fontSize: 14, margin: '0 0 8px 0', fontWeight: 600 }}>
                    📈 참가자별 통계
                  </h5>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {stored.statistics.participantStats.map((stat, index) => (
                      <div
                        key={index}
                        style={{
                          background: 'rgba(255, 255, 255, 0.1)',
                          backdropFilter: 'blur(5px)',
                          borderRadius: 8,
                          padding: '4px 8px',
                          fontSize: 12,
                          color: 'white'
                        }}
                      >
                        {stat.nickname}: {stat.songCount}곡
                      </div>
                    ))}
                  </div>
                </div>

                {/* 삭제 버튼 (리더만) */}
                {isLeader && (
                  <div style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => deleteStoredSetList(stored.id)}
                      style={{
                        background: 'rgba(220, 38, 38, 0.8)',
                        backdropFilter: 'blur(10px)',
                        color: 'white',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
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
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SetListStorage; 