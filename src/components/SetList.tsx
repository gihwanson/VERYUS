import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SetListManager from './SetList/SetListManager';
import SetListCards from './SetList/SetListCards';
import SetListStorage from './SetList/SetListStorage';
import { useSetListData } from './SetList/hooks/useSetListData';

const SetList: React.FC = () => {
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isLeader = user && user.role === '리더';
  
  const [viewMode, setViewMode] = useState<'manage' | 'cards' | 'storage'>(isLeader ? 'manage' : 'cards');
  const { activeSetList, loading } = useSetListData();

  useEffect(() => {
    if (!isLeader) {
      setViewMode('cards');
    }
  }, [isLeader]);

  if (loading) {
    return (
      <div style={{ 
        maxWidth: '100%', 
        width: '100%', 
        minHeight: '100vh', 
        margin: 0, 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 0, 
        boxShadow: 'none', 
        padding: '20px',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* 배경 패턴 */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255, 255, 255, 0.08) 0%, transparent 50%)',
          pointerEvents: 'none'
        }} />
        
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: 20,
          padding: 32,
          border: '1px solid rgba(255, 255, 255, 0.2)',
          textAlign: 'center',
          color: 'white',
          fontSize: 18,
          fontWeight: 600
        }}>
          🎵 로딩 중...
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      maxWidth: '100%', 
      width: '100%', 
      minHeight: '100vh', 
      margin: 0, 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderRadius: 0, 
      boxShadow: 'none', 
      padding: '20px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 배경 패턴 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255, 255, 255, 0.08) 0%, transparent 50%)',
        pointerEvents: 'none'
      }} />
      
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* 헤더 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 32,
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <h1 style={{ 
            color: 'white', 
            fontWeight: 700, 
            fontSize: 28, 
            margin: 0,
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            🎵 {viewMode === 'manage' ? '셋리스트 관리' : viewMode === 'cards' ? '셋리스트 카드' : '셋리스트 저장소'}
          </h1>
          
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isLeader && (
              <button 
                onClick={() => setViewMode('manage')}
                style={{ 
                  background: viewMode === 'manage' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)',
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 12, 
                  padding: '10px 16px', 
                  fontWeight: 600, 
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = viewMode === 'manage' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)'}
              >
                ⚙️ 관리
              </button>
            )}
            {activeSetList && (
              <button 
                onClick={() => setViewMode('cards')}
                style={{ 
                  background: viewMode === 'cards' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)',
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 12, 
                  padding: '10px 16px', 
                  fontWeight: 600, 
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = viewMode === 'cards' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)'}
              >
                🎴 카드
              </button>
            )}
            <button 
              onClick={() => setViewMode('storage')}
              style={{ 
                background: viewMode === 'storage' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(10px)',
                color: 'white', 
                border: 'none', 
                borderRadius: 12, 
                padding: '10px 16px', 
                fontWeight: 600, 
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
              onMouseLeave={(e) => e.currentTarget.style.background = viewMode === 'storage' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)'}
            >
              📦 저장소
            </button>
          </div>
        </div>

        {viewMode === 'cards' ? (
          <SetListCards />
        ) : viewMode === 'storage' ? (
          <SetListStorage />
        ) : (
          <SetListManager />
        )}
      </div>
    </div>
  );
};

export default SetList; 