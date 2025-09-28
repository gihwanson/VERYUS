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
  
  const { setLists } = useSetListData();
  const [storedSetLists, setStoredSetLists] = useState<StoredSetList[]>([]);

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


  // 저장된 셋리스트를 다시 활성화
  const reactivateStoredSetList = async (stored: StoredSetList) => {
    if (!isLeader) {
      alert('활성화 권한이 없습니다.');
      return;
    }

    if (!confirm(`"${stored.name}" 셋리스트를 다시 활성화하시겠습니까?`)) {
      return;
    }

    try {
      // 새로운 셋리스트 생성
      const newSetListData = {
        name: stored.name,
        participants: stored.participants,
        songs: stored.songs,
        completedSongs: stored.completedSongs,
        flexibleCards: stored.flexibleCards,
        completedFlexibleCards: stored.completedFlexibleCards,
        isActive: true,
        isCompleted: false,
        createdBy: stored.createdBy,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      // 새로운 셋리스트 생성
      await addDoc(collection(db, 'setlists'), newSetListData);
      
      alert(`"${stored.name}" 셋리스트가 활성화되었습니다! 🎉`);
      
      // 페이지 새로고침으로 관리탭에 반영
      window.location.reload();
    } catch (error) {
      console.error('셋리스트 활성화 실패:', error);
      alert('셋리스트 활성화에 실패했습니다.');
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
                관리탭에서 셋리스트를 완료하면 여기에 저장됩니다!
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

                {/* 버튼 영역 (리더만) */}
                {isLeader && (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => reactivateStoredSetList(stored)}
                      style={{
                        background: 'rgba(34, 197, 94, 0.8)',
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
                        e.currentTarget.style.background = 'rgba(34, 197, 94, 0.9)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(34, 197, 94, 0.8)';
                      }}
                    >
                      🔄 활성화
                    </button>
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