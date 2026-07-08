import { useCallback, useEffect, useMemo, useState } from 'react';
import { ROLE_SYSTEM } from '../../AdminTypes';
import type { SetListData } from '../types';
import {
  getLiveSessionsForDate,
  hasHostLiveSession,
  pickBuskingSession,
  readStoredBuskingSessionId,
  writeStoredBuskingSessionId,
} from '../buskingSessionUtils';
import { toLocalDateISO } from '../setListSessionDate';

export interface BuskingSessionUser {
  uid: string;
  nickname: string;
  role?: string | null;
}

export function useBuskingSession(setLists: SetListData[], user: BuskingSessionUser | null) {
  const isLeader = user?.role === ROLE_SYSTEM.LEADER;
  const userUid = user?.uid ?? '';
  const userNickname = user?.nickname ?? '';

  const [selectedSessionId, setSelectedSessionIdState] = useState<string | null>(() =>
    readStoredBuskingSessionId(userUid)
  );
  const [pickerDismissed, setPickerDismissed] = useState(false);

  useEffect(() => {
    setSelectedSessionIdState(readStoredBuskingSessionId(userUid));
    setPickerDismissed(false);
  }, [userUid]);

  const setSelectedSessionId = useCallback(
    (sessionId: string | null) => {
      setSelectedSessionIdState(sessionId);
      writeStoredBuskingSessionId(userUid, sessionId);
      setPickerDismissed(true);
    },
    [userUid]
  );

  const today = toLocalDateISO(new Date());
  const liveSessionsToday = useMemo(
    () => getLiveSessionsForDate(setLists, today),
    [setLists, today]
  );

  const hostHasLiveSession = useMemo(
    () => (userUid ? hasHostLiveSession(setLists, userUid, today) : false),
    [setLists, userUid, today]
  );

  const activeSetList = useMemo(
    () =>
      pickBuskingSession(setLists, {
        selectedSessionId,
        userUid,
        userNickname,
        isLeader,
      }),
    [setLists, selectedSessionId, userUid, userNickname, isLeader]
  );

  useEffect(() => {
    if (activeSetList?.id && activeSetList.id !== selectedSessionId) {
      writeStoredBuskingSessionId(userUid, activeSetList.id);
      setSelectedSessionIdState(activeSetList.id);
    }
  }, [activeSetList?.id, selectedSessionId, userUid]);

  const needsSessionPicker = !activeSetList && liveSessionsToday.length > 0 && !pickerDismissed;

  return {
    activeSetList,
    selectedSessionId,
    setSelectedSessionId,
    liveSessionsToday,
    hostHasLiveSession,
    needsSessionPicker,
    today,
  };
}
