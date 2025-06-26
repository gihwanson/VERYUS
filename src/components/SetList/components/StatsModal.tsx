import React from 'react';
import type { SetListData } from '../types';

interface UserInfo {
  uid: string;
  nickname: string;
  email: string;
  grade: string;
  role: string;
}

interface ParticipantStats {
  nickname: string;
  songCount: number;
  grade: string;
  role: string;
}

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSetList: SetListData;
  userStats: ParticipantStats[];
}

const StatsModal: React.FC<StatsModalProps> = ({ isOpen, onClose, activeSetList, userStats }) => {
  const gradeNames: { [key: string]: string } = {
    '🍒': '체리',
    '🫐': '블루베리',
    '🥝': '키위',
    '🍎': '사과',
    '🍈': '멜론',
    '🍉': '수박',
    '🌍': '지구',
    '🪐': '토성',
    '☀️': '태양',
    '🌌': '은하',
    '🌙': '달',
    '👤': '게스트'
  };

  if (!isOpen) return null;

  return (
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
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)'
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: '#fff',
          borderRadius: '16px 16px 0 0'
        }}>
          <div>
            <h2 style={{ 
              color: '#8A55CC', 
              fontSize: '24px', 
              margin: 0,
              marginBottom: '4px'
            }}>
              📊 {activeSetList.name} 통계
            </h2>
            <p style={{ 
              color: '#666', 
              fontSize: '14px', 
              margin: 0 
            }}>
              전체 {activeSetList.songs.length + (activeSetList.completedSongs?.length || 0)}곡 분석
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
              padding: '8px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* 콘텐츠 */}
        <div style={{ padding: '24px' }}>
          {/* 요약 정보 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px',
            marginBottom: '30px'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #8A55CC 0%, #A855F7 100%)',
              color: '#fff',
              padding: '20px',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
                {activeSetList.songs.length}
              </div>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>
                대기 중인 곡
              </div>
            </div>
            
            <div style={{
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#fff',
              padding: '20px',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
                {activeSetList.completedSongs?.length || 0}
              </div>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>
                완료된 곡
              </div>
            </div>
            
            <div style={{
              background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
              color: '#fff',
              padding: '20px',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
                {userStats.length}
              </div>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>
                참가자 수
              </div>
            </div>
          </div>

          {/* 참가자별 통계 */}
          {userStats.length > 0 && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ 
                color: '#8A55CC', 
                fontSize: '20px', 
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                🏆 참가자 순위
              </h3>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', 
                gap: '16px' 
              }}>
                {userStats.map((stat, index) => (
                  <div
                    key={stat.nickname}
                    style={{
                      background: stat.role === '게스트' ? 
                        'linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%)' :
                        index === 0 ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)' : 
                        index === 1 ? 'linear-gradient(135deg, #C0C0C0 0%, #A9A9A9 100%)' :
                        index === 2 ? 'linear-gradient(135deg, #CD7F32 0%, #B8860B 100%)' :
                        'linear-gradient(135deg, #F8F9FA 0%, #E9ECEF 100%)',
                      borderRadius: '12px',
                      padding: '18px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                      border: stat.role === '게스트' ? '2px dashed #9CA3AF' :
                              index < 3 ? '2px solid transparent' : '1px solid #E5E7EB',
                      position: 'relative',
                      overflow: 'hidden',
                      opacity: stat.role === '게스트' ? 0.8 : 1
                    }}
                  >
                    {/* 순위 표시 (게스트 제외) */}
                    {index < 3 && stat.role !== '게스트' && (
                      <div style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: index === 0 ? '#FFD700' : 
                                   index === 1 ? '#C0C0C0' : '#CD7F32',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                      }}>
                        {index + 1}
                      </div>
                    )}

                    {/* 게스트 표시 */}
                    {stat.role === '게스트' && (
                      <div style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        background: '#9CA3AF',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }}>
                        GUEST
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ fontSize: '24px', marginRight: '12px' }}>
                        {stat.grade}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontWeight: 600, 
                          fontSize: '18px',
                          color: stat.role === '게스트' ? '#4B5563' :
                                 index < 3 && stat.role !== '게스트' ? '#fff' : '#2D3748',
                          textShadow: index < 3 && stat.role !== '게스트' ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none',
                          marginBottom: '4px'
                        }}>
                          {stat.nickname}
                        </div>
                        <div style={{ 
                          fontSize: '13px', 
                          color: stat.role === '게스트' ? '#6B7280' :
                                 index < 3 && stat.role !== '게스트' ? 'rgba(255, 255, 255, 0.9)' : '#666',
                          fontWeight: 500
                        }}>
                          {gradeNames[stat.grade] || '체리'} • {stat.role}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ 
                      fontSize: '24px', 
                      fontWeight: 'bold',
                      color: stat.role === '게스트' ? '#6B7280' :
                             index < 3 && stat.role !== '게스트' ? '#fff' : '#8A55CC',
                      textShadow: index < 3 && stat.role !== '게스트' ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none',
                      textAlign: 'center'
                    }}>
                      {stat.songCount}곡
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 완료된 곡 목록 */}
          {activeSetList.completedSongs && activeSetList.completedSongs.length > 0 && (
            <div>
              <h3 style={{ 
                color: '#10B981', 
                fontSize: '20px', 
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                ✅ 완료된 곡 히스토리 ({activeSetList.completedSongs.length}곡)
              </h3>
              
              <div style={{ 
                border: '1px solid #D1FAE5', 
                borderRadius: '12px', 
                background: '#F0FDF4',
                maxHeight: '300px',
                overflow: 'auto'
              }}>
                {activeSetList.completedSongs
                  .sort((a, b) => {
                    // completedAt으로 정렬 (최근 완료 순)
                    const aTime = a.completedAt?.seconds || 0;
                    const bTime = b.completedAt?.seconds || 0;
                    return bTime - aTime;
                  })
                  .map((song, index) => (
                    <div 
                      key={`${song.songId}-completed`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        padding: '14px 16px',
                        borderBottom: index < activeSetList.completedSongs!.length - 1 ? '1px solid #BBF7D0' : 'none',
                        backgroundColor: '#F0FDF4'
                      }}
                    >
                      <div style={{ 
                        width: '36px', 
                        height: '36px', 
                        background: '#10B981', 
                        color: '#fff', 
                        borderRadius: '50%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontWeight: 600,
                        marginRight: '14px',
                        fontSize: '16px'
                      }}>
                        ✓
                      </div>
                      
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontWeight: 600, 
                          color: '#065F46',
                          fontSize: '16px',
                          marginBottom: '2px'
                        }}>
                          {song.title}
                        </div>
                        <div style={{ 
                          color: '#047857', 
                          fontSize: '14px' 
                        }}>
                          {song.members.join(', ')}
                        </div>
                      </div>
                      
                      <div style={{ 
                        fontSize: '13px', 
                        color: '#047857',
                        textAlign: 'right',
                        fontWeight: 500
                      }}>
                        {song.completedAt && new Date(song.completedAt.seconds * 1000).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })} 완료
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatsModal; 