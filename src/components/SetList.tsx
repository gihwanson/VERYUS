import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SetListManager from './SetList/SetListManager';
import SetListCards from './SetList/SetListCards';
import { useSetListData } from './SetList/hooks/useSetListData';

const SetList: React.FC = () => {
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isLeader = user && user.role === '리더';
  
  const [viewMode, setViewMode] = useState<'manage' | 'cards'>(isLeader ? 'manage' : 'cards');
  const { activeSetList, loading } = useSetListData();

  useEffect(() => {
    if (!isLeader) {
      setViewMode('cards');
    }
  }, [isLeader]);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div>로딩 중...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '100%', width: '100%', minHeight: '100vh', margin: 0, background: '#fff', borderRadius: 0, boxShadow: 'none', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ color: '#8A55CC', fontWeight: 700, fontSize: '28px', margin: 0 }}>
          🎵 {isLeader ? (viewMode === 'manage' ? '셋리스트 관리' : '셋리스트 카드') : '셋리스트 카드'}
        </h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isLeader && activeSetList && (
            <button 
              onClick={() => setViewMode(viewMode === 'manage' ? 'cards' : 'manage')}
              style={{ 
                background: viewMode === 'cards' ? '#8A55CC' : '#E5DAF5', 
                color: viewMode === 'cards' ? '#fff' : '#7C4DBC', 
                border: 'none', 
                borderRadius: '8px', 
                padding: '8px 16px', 
                fontWeight: 600, 
                cursor: 'pointer' 
              }}
            >
              {viewMode === 'manage' ? '🎴 카드 보기' : '⚙️ 관리'}
            </button>
          )}
          <button 
            onClick={() => navigate('/')}
            style={{ 
              background: '#E5DAF5', 
              color: '#7C4DBC', 
              border: 'none', 
              borderRadius: '8px', 
              padding: '8px 16px', 
              fontWeight: 600, 
              cursor: 'pointer' 
            }}
          >
            홈으로
          </button>
        </div>
      </div>

      {viewMode === 'cards' ? (
        <SetListCards />
      ) : (
        <SetListManager />
      )}
    </div>
  );
};

export default SetList; 