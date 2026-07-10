import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BuskingCategory } from '../BuskingNav';
import type { SetListData } from '../types';
import { canManageAnyBuskingSession } from '../buskingSessionPermissions';
import {
  getLiveSessions,
  hasHostLiveSession,
  pickBuskingSession,
  readStoredBuskingSessionId,
  writeStoredBuskingSessionId,
} from '../buskingSessionUtils';

export interface BuskingSessionUser {
  uid: string;
  nickname: string;
  role?: string | null;
}

export function useBuskingSession(
  setLists: SetListData[],
  user: BuskingSessionUser | null,
  category: BuskingCategory
) {
  const canSuperviseSessions = canManageAnyBuskingSession(user);
  const userUid = user?.uid ?? '';
  const userNickname = user?.nickname ?? '';

  const [selectedSessionId, setSelectedSessionIdState] = useState<string | null>(() =>
    readStoredBuskingSessionId(userUid, category)
  );
  const [pickerDismissed, setPickerDismissed] = useState(false);

  useEffect(() => {
    setSelectedSessionIdState(readStoredBuskingSessionId(userUid, category));
    setPickerDismissed(false);
  }, [userUid, category]);

  const setSelectedSessionId = useCallback(
    (sessionId: string | null) => {
      setSelectedSessionIdState(sessionId);
      writeStoredBuskingSessionId(userUid, sessionId, category);
      setPickerDismissed(true);
    },
    [userUid, category]
  );

  const liveSessionsToday = useMemo(
    () => getLiveSessions(setLists, category),
    [setLists, category]
  );

  const hostHasLiveSession = useMemo(
    () => (userUid ? hasHostLiveSession(setLists, userUid, category) : false),
    [setLists, userUid, category]
  );

  const activeSetList = useMemo(
    () =>
      pickBuskingSession(setLists, {
        selectedSessionId,
        userUid,
        userNickname,
        isLeader: canSuperviseSessions,
        category,
      }),
    [setLists, selectedSessionId, userUid, userNickname, canSuperviseSessions, category]
  );

  useEffect(() => {
    if (activeSetList?.id && activeSetList.id !== selectedSessionId) {
      writeStoredBuskingSessionId(userUid, activeSetList.id, category);
      setSelectedSessionIdState(activeSetList.id);
    }
  }, [activeSetList?.id, selectedSessionId, userUid, category]);

  const needsSessionPicker = !activeSetList && liveSessionsToday.length > 0 && !pickerDismissed;

  return {
    activeSetList,
    selectedSessionId,
    setSelectedSessionId,
    liveSessionsToday,
    hostHasLiveSession,
    needsSessionPicker,
  };
}
