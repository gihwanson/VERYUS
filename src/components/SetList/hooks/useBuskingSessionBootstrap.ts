import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { SetListData } from '../types';
import { buildBuskingSessionName } from '../buskingSessionUtils';
import { toLocalDateISO } from '../setListSessionDate';

let bootstrapLock = false;

export interface BuskingSessionBootstrapUser {
  uid: string;
  nickname: string;
}

/** 조장·리더가 버스킹에 들어왔을 때 본인 호스트 세션이 없으면 생성 UI 표시 (다른 세션은 건드리지 않음) */
export function useBuskingSessionBootstrap(
  setLists: SetListData[],
  hostHasLiveSession: boolean,
  canHost: boolean,
  user: BuskingSessionBootstrapUser | null
) {
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [awaitingVenue, setAwaitingVenue] = useState(false);

  const retryBootstrap = useCallback(() => {
    bootstrapLock = false;
    setBootstrapError(null);
    setRetryTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (hostHasLiveSession) {
      setBootstrapping(false);
      setBootstrapError(null);
      setAwaitingVenue(false);
      bootstrapLock = false;
    }
  }, [hostHasLiveSession]);

  useEffect(() => {
    if (!canHost || !user?.uid || hostHasLiveSession || bootstrapLock) return;
    setAwaitingVenue(true);
  }, [canHost, user?.uid, hostHasLiveSession, setLists, retryTick]);

  const createSession = useCallback(
    async (venueLabel: string): Promise<string | false> => {
      if (!user?.uid) return false;
      if (bootstrapLock) return false;

      bootstrapLock = true;
      setBootstrapping(true);
      setBootstrapError(null);

      try {
        const sessionDate = toLocalDateISO(new Date());
        const venue = venueLabel.trim();
        const hostNickname = user.nickname.trim() || '조장';
        const ref = await addDoc(collection(db, 'setlists'), {
          name: buildBuskingSessionName(sessionDate, venue, hostNickname),
          sessionDate,
          venueLabel: venue,
          hostUid: user.uid,
          hostNickname,
          status: 'live',
          participants: [],
          songs: [],
          participantRegistrationComplete: false,
          createdBy: hostNickname,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          isActive: true,
          isCompleted: false,
        });
        setAwaitingVenue(false);
        bootstrapLock = false;
        return ref.id;
      } catch (e) {
        console.error('버스킹 세션 생성 실패:', e);
        setBootstrapError('버스킹 세션을 만들지 못했습니다. 네트워크를 확인해 주세요.');
        bootstrapLock = false;
        return false;
      } finally {
        setBootstrapping(false);
      }
    },
    [user]
  );

  return {
    bootstrapping,
    bootstrapError,
    retryBootstrap,
    awaitingVenue,
    createSession,
  };
}
