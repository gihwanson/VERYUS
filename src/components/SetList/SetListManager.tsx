import React, { useCallback } from 'react';
import SetListForm from './components/SetListForm';
import { canManageBuskingSession } from './buskingSessionPermissions';
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
  const canManageSession = canManageBuskingSession(activeSetList, user);

  const handleSetListDeleted = useCallback(() => {}, []);
  const handleSetListActivated = useCallback(() => {}, []);

  return (
    <div className="setlist-manage-shell">
      <SetListForm
        setLists={setLists}
        activeSetList={activeSetList}
        isLeader={canManageSession}
        onSetListDeleted={handleSetListDeleted}
        onSetListActivated={handleSetListActivated}
        onAfterSessionActivated={onAfterSessionActivated}
      />
    </div>
  );
};

export default SetListManager;
