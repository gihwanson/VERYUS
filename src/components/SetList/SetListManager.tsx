import React from 'react';
import { useSetListData } from './hooks/useSetListData';
import SetListForm from './components/SetListForm';

const SetListManager: React.FC = () => {
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isLeader = user && user.role === '리더';
  const currentUserNickname = user?.nickname || '';
  
  const { setLists, activeSetList } = useSetListData();

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      {/* 셋리스트 생성/관리 폼 */}
      <SetListForm
        setLists={setLists}
        activeSetList={activeSetList}
        isLeader={isLeader}
        onSetListCreated={() => {}}
        onSetListDeleted={() => {}}
        onSetListActivated={() => {}}
      />

    </div>
  );
};

export default SetListManager;