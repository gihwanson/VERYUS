import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  mergeVeryusUserFromAuth,
  readVeryusUserFromStorage,
  type VeryusUser,
  writeVeryusUserToStorage
} from '../utils/veryusUserStorage';

interface UserProfileContextValue {
  profile: VeryusUser | null;
  loading: boolean;
  reloadProfile: () => Promise<void>;
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

interface UserProfileProviderProps {
  authUser: FirebaseUser | null;
  children: React.ReactNode;
}

export const UserProfileProvider: React.FC<UserProfileProviderProps> = ({ authUser, children }) => {
  const [profile, setProfile] = useState<VeryusUser | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadProfile = useCallback(async () => {
    if (!authUser) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const previous = readVeryusUserFromStorage();
      const userSnap = await getDoc(doc(db, 'users', authUser.uid));
      const userData = userSnap.exists() ? userSnap.data() : {};
      const merged = mergeVeryusUserFromAuth(authUser, userData, previous);
      writeVeryusUserToStorage(merged);
      setProfile(merged);
      void import('../utils/skinUnlockService').then(({ queueSkinUnlockSync }) => {
        queueSkinUnlockSync({ uid: authUser.uid, nickname: merged.nickname });
      });
    } catch (error) {
      console.error('UserProfileContext 사용자 정보 로드 실패:', error);
      const merged = mergeVeryusUserFromAuth(authUser, {}, readVeryusUserFromStorage());
      writeVeryusUserToStorage(merged);
      setProfile(merged);
      void import('../utils/skinUnlockService').then(({ queueSkinUnlockSync }) => {
        queueSkinUnlockSync({ uid: authUser.uid, nickname: merged.nickname });
      });
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    void reloadProfile();
  }, [reloadProfile]);

  useEffect(() => {
    if (!authUser?.uid) return;
    const uid = authUser.uid;
    let cancelled = false;
    let midnightTimer = 0;

    const bumpIfNewDay = () => {
      void import('../utils/skinUnlockMetrics').then(async ({ touchActiveLoginDay }) => {
        const result = await touchActiveLoginDay(uid);
        if (cancelled || !result.newlyCounted) return;
        const { queueSkinUnlockSync } = await import('../utils/skinUnlockService');
        const stored = readVeryusUserFromStorage();
        queueSkinUnlockSync({ uid, nickname: stored?.nickname });
      });
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') bumpIfNewDay();
    };

    const scheduleMidnight = () => {
      void import('../utils/skinUnlockMetrics').then(({ msUntilNextKstMidnight }) => {
        if (cancelled) return;
        midnightTimer = window.setTimeout(() => {
          bumpIfNewDay();
          scheduleMidnight();
        }, msUntilNextKstMidnight() + 1500);
      });
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', bumpIfNewDay);
    scheduleMidnight();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', bumpIfNewDay);
      window.clearTimeout(midnightTimer);
    };
  }, [authUser?.uid]);

  const value = useMemo(
    () => ({
      profile,
      loading,
      reloadProfile
    }),
    [loading, profile, reloadProfile]
  );

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>;
};

export const useUserProfile = (): UserProfileContextValue => {
  const context = useContext(UserProfileContext);
  if (!context) {
    return {
      profile: null,
      loading: false,
      reloadProfile: async () => undefined
    };
  }
  return context;
};
