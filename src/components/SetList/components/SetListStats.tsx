import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebase';

interface ParticipantStats {
  nickname: string;
  totalSongs: number;
  completedSongs: number;
  participationRate: number;
}

interface SetListStatsProps {
  activeSetList: any;
  participants: string[];
  onStatsReset?: () => void;
}

const SetListStats: React.FC<SetListStatsProps> = ({ activeSetList, participants, onStatsReset }) => {
  const [stats, setStats] = useState<ParticipantStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (activeSetList && participants.length > 0) {
      calculateStats();
    }
  }, [activeSetList, participants]);

  const calculateStats = async () => {
    setLoading(true);
    try {
      // 현재 셋리스트의 모든 곡들 (일반 곡 + 닉네임카드)
      const allSongs = activeSetList.songs || [];
      const completedSongs = activeSetList.completedSongs || [];
      const completedFlexibleCards = activeSetList.completedFlexibleCards || [];
      
      // 참가자별 통계 계산
      const participantStats: ParticipantStats[] = participants.map(participant => {
        let totalSongs = 0;
        let completedSongsCount = 0;
        
        // 현재 셋리스트의 곡들에서 참여 횟수 계산
        allSongs.forEach((song: any) => {
          if (song.members && song.members.includes(participant)) {
            totalSongs++;
          }
          
          // 닉네임카드인 경우 슬롯별로 계산
          if (song.nickname && song.slots) {
            song.slots.forEach((slot: any) => {
              if (slot.members && slot.members.includes(participant)) {
                totalSongs++;
              }
            });
          }
        });
        
        // 완료된 곡들에서 참여 횟수 계산
        completedSongs.forEach((song: any) => {
          if (song.members && song.members.includes(participant)) {
            completedSongsCount++;
          }
          
          // 닉네임카드인 경우 슬롯별로 계산
          if (song.nickname && song.slots) {
            song.slots.forEach((slot: any) => {
              if (slot.members && slot.members.includes(participant)) {
                completedSongsCount++;
              }
            });
          }
        });
        
        // 완료된 닉네임카드들에서 참여 횟수 계산
        completedFlexibleCards.forEach((card: any) => {
          if (card.nickname && card.slots) {
            card.slots.forEach((slot: any) => {
              if (slot.members && slot.members.includes(participant)) {
                completedSongsCount++;
              }
            });
          }
        });
        
        const participationRate = totalSongs > 0 ? Math.round((completedSongsCount / totalSongs) * 100) : 0;
        
        return {
          nickname: participant,
          totalSongs,
          completedSongs: completedSongsCount,
          participationRate
        };
      });
      
      // 완료된 곡 수 기준으로 내림차순 정렬
      participantStats.sort((a, b) => b.completedSongs - a.completedSongs);
      
      setStats(participantStats);
    } catch (error) {
      console.error('통계 계산 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 통계 초기화 함수
  const resetStats = async () => {
    if (!activeSetList) return;
    
    if (!confirm('모든 통계를 초기화하시겠습니까?\n\n완료된 곡들이 모두 삭제되고 통계가 0으로 돌아갑니다.')) {
      return;
    }

    setResetting(true);
    try {
      // completedSongs 배열을 빈 배열로 초기화
      await updateDoc(doc(db, 'setlists', activeSetList.id), {
        completedSongs: [],
        completedFlexibleCards: [],
        updatedAt: Timestamp.now()
      });

      // 통계를 즉시 0으로 초기화
      const resetStats: ParticipantStats[] = participants.map(participant => ({
        nickname: participant,
        totalSongs: 0,
        completedSongs: 0,
        participationRate: 0
      }));
      
      setStats(resetStats);

      alert('통계가 초기화되었습니다! 🎉');
      
      // 부모 컴포넌트에 초기화 완료 알림
      if (onStatsReset) {
        onStatsReset();
      }
    } catch (error) {
      console.error('통계 초기화 실패:', error);
      alert('통계 초기화에 실패했습니다.');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 20,
        marginTop: 20,
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <div style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.7)' }}>
          📊 통계를 계산하는 중...
        </div>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 20,
        marginTop: 20,
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <h3 style={{ 
          color: 'white', 
          fontSize: 18, 
          margin: '0 0 16px 0', 
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          📊 참가자 통계
        </h3>
        <div style={{ 
          color: 'rgba(255, 255, 255, 0.7)', 
          fontSize: 14,
          textAlign: 'center',
          padding: '20px 0'
        }}>
          아직 완료된 곡이 없습니다.
        </div>
      </div>
    );
  }

  return (
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
          📊 참가자 통계
        </h3>
        
        <button
          onClick={resetStats}
          disabled={resetting}
          style={{
            background: resetting ? 'rgba(107, 114, 128, 0.3)' : 'rgba(220, 38, 38, 0.8)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            cursor: resetting ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontWeight: 600,
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
          onMouseEnter={(e) => {
            if (!resetting) {
              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.9)';
            }
          }}
          onMouseLeave={(e) => {
            if (!resetting) {
              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.8)';
            }
          }}
        >
          {resetting ? '⏳ 초기화 중...' : '🔄 통계 초기화'}
        </button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {stats.map((participant, index) => (
          <div
            key={participant.nickname}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 8,
              padding: 16,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                background: index === 0 ? 'rgba(255, 215, 0, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                color: index === 0 ? '#FFD700' : '#3B82F6',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 600
              }}>
                {index + 1}
              </div>
              <div>
                <div style={{
                  color: 'white',
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 4
                }}>
                  {participant.nickname}
                  {index === 0 && <span style={{ marginLeft: 8, color: '#FFD700' }}>👑</span>}
                </div>
                <div style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: 12
                }}>
                  총 {participant.totalSongs}곡 참여
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{
                color: '#10B981',
                fontSize: 20,
                fontWeight: 700
              }}>
                {participant.completedSongs}곡
              </div>
              <div style={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: 12
              }}>
                완료율 {participant.participationRate}%
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div style={{
        marginTop: 16,
        padding: 12,
        background: 'rgba(59, 130, 246, 0.1)',
        borderRadius: 8,
        border: '1px solid rgba(59, 130, 246, 0.2)'
      }}>
        <div style={{
          color: 'rgba(255, 255, 255, 0.8)',
          fontSize: 14,
          textAlign: 'center'
        }}>
          💡 완료된 곡만 통계에 반영됩니다
        </div>
      </div>
    </div>
  );
};

export default SetListStats;