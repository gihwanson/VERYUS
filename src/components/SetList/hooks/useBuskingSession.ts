import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
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

function mapSetListDoc(id: string, data: Record<string, unknown>): SetListData {
  return { id, ...data } as SetListData;
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
  /** 활성 세션 문서 단위 실시간 스냅샷 — 곡 전송/선정/완료 반영용 */
  const [liveActiveSetList, setLiveActiveSetList] = useState<SetListData | null>(null);

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

  const pickedSetList = useMemo(
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
    if (pickedSetList?.id && pickedSetList.id !== selectedSessionId) {
      writeStoredBuskingSessionId(userUid, pickedSetList.id, category);
      setSelectedSessionIdState(pickedSetList.id);
    }
  }, [pickedSetList?.id, selectedSessionId, userUid, category]);

  useEffect(() => {
    const sessionId = pickedSetList?.id;
    if (!sessionId) {
      setLiveActiveSetList(null);
      return;
    }

    // 문서 스냅샷이 오기 전에도 목록 데이터로 먼저 표시
    setLiveActiveSetList((prev) => (prev?.id === sessionId ? prev : pickedSetList));

    const unsubscribe = onSnapshot(
      doc(db, 'setlists', sessionId),
      (snap) => {
        if (!snap.exists()) {
          setLiveActiveSetList(null);
          return;
        }
        setLiveActiveSetList(mapSetListDoc(snap.id, snap.data() as Record<string, unknown>));
      },
      (error) => {
        console.error('활성 버스킹 세션 실시간 구독 실패:', error);
      }
    );

    return () => unsubscribe();
  }, [pickedSetList?.id]);

  const activeSetList = useMemo(() => {
    if (!pickedSetList) return null;
    if (liveActiveSetList?.id === pickedSetList.id) return liveActiveSetList;
    return pickedSetList;
  }, [pickedSetList, liveActiveSetList]);

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
