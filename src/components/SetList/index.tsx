import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSetListData } from './hooks/useSetListData';
import SetListCards from './SetListCards';
import SetListManager from './SetListManager';
import './styles.css';

const SetList: React.FC = () => {
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isLeader = user && user.role === '리더';
  
  // 디버깅용 로그
  console.log('SetList 컴포넌트 - 사용자 정보:', { user, isLeader });
  
  const [viewMode, setViewMode] = useState<'manage' | 'cards'>(isLeader ? 'manage' : 'cards');
  const { activeSetList, loading } = useSetListData();

  // 셋리스트 활성화 콜백 함수
  const handleSetListActivated = () => {
    // 셋리스트가 활성화되었을 때 필요한 로직
    console.log('셋리스트가 활성화되었습니다.');
  };

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
    <div style={{ 
      maxWidth: window.innerWidth < 768 ? '100%' : '1200px', 
      margin: window.innerWidth < 768 ? '10px auto' : '40px auto', 
      padding: window.innerWidth < 768 ? '10px' : '20px',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* 리더인 경우에만 헤더 표시 */}
      {isLeader ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h1 style={{ color: '#8A55CC', fontWeight: 700, fontSize: '28px', margin: 0 }}>
            🎵 {viewMode === 'manage' ? '셋리스트 관리' : '셋리스트 카드'}
          </h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {activeSetList && (
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
          </div>
        </div>
      ) : (
        /* 일반 사용자는 홈으로 버튼만 표시 */
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '30px' }}>
        </div>
      )}

      {/* 뷰 모드에 따라 컴포넌트 렌더링 */}
      {viewMode === 'manage' ? <SetListManager /> : <SetListCards onSetListActivated={handleSetListActivated} />}
    </div>
  );
};

export default SetList; 