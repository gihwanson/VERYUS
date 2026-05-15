import React, { useCallback } from 'react';
import SetListForm from './components/SetListForm';
import type { SetListData } from './types';

interface SetListManagerProps {
  setLists: SetListData[];
  activeSetList: SetListData | null;
  onAfterSessionActivated?: () => void;
}

const SetListManager: React.FC<SetListManagerProps> = ({
  setLists,
  activeSetList,
  onAfterSessionActivated
}) => {
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isLeader = user && user.role === '리더';

  const handleSetListDeleted = useCallback(() => {}, []);
  const handleSetListActivated = useCallback(() => {}, []);

  return (
    <div style={{ 
      maxWidth: window.innerWidth < 768 ? '100%' : '1400px', 
      margin: '0 auto', 
      padding: window.innerWidth < 768 ? '5px' : '20px',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* 셋리스트 생성/관리 폼 */}
      <SetListForm
        setLists={setLists}
        activeSetList={activeSetList}
        isLeader={isLeader}
        onSetListDeleted={handleSetListDeleted}
        onSetListActivated={handleSetListActivated}
        onAfterSessionActivated={onAfterSessionActivated}
      />

    </div>
  );
};

export default SetListManager;