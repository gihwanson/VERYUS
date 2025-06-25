import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSetListData } from './hooks/useSetListData';
import './styles.css';

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
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
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

      {/* 임시로 기본 텍스트 표시 */}
      <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
        <h2 style={{ color: '#8A55CC' }}>SetList 컴포넌트 리팩토링 진행 중</h2>
        <p>현재 {viewMode} 모드입니다.</p>
        {activeSetList ? (
          <p>활성 셋리스트: {activeSetList.name}</p>
        ) : (
          <p>활성 셋리스트가 없습니다.</p>
        )}
      </div>
    </div>
  );
};

export default SetList; 