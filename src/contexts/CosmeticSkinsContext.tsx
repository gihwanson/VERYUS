import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  COSMETIC_CHANGE_EVENT,
  COSMETIC_SKINS_USER_FIELD,
  getCosmeticClassNameBySkinId,
  getLocalEquippedCosmeticSkins,
  parseEquippedCosmeticSkins,
  writeLocalEquippedCosmeticSkins,
  type CosmeticCategory,
  type EquippedCosmeticSkins,
} from '../utils/cosmeticSkins';
import {
  GRADE_FX_CHANGE_EVENT,
  GRADE_FX_USER_FIELD,
  getEquippedGradeFxId,
  getGradeFxClassNameBySkinId,
  getGradeFxSkin,
  writeLocalEquippedGradeFx,
  type GradeFxSkinId,
} from '../utils/gradeFxSkins';
import { useUserProfile } from './UserProfileContext';

export type WriterDisplaySkins = EquippedCosmeticSkins & {
  gradeFx?: GradeFxSkinId | null;
};

interface CosmeticSkinsContextValue {
  getWriterSkins: (writerUid?: string | null) => WriterDisplaySkins | null;
  getWriterCosmeticClass: (
    category: CosmeticCategory,
    writerUid?: string | null
  ) => string;
  getWriterGradeFxClass: (writerUid?: string | null) => string;
  preloadWriterSkins: (writerUids: Array<string | null | undefined>) => void;
}

const CosmeticSkinsContext = createContext<CosmeticSkinsContextValue | null>(null);

function parseGradeFxEquipped(raw: unknown): GradeFxSkinId | null {
  if (typeof raw !== 'string' || !raw || raw === 'none') return null;
  return getGradeFxSkin(raw) ? (raw as GradeFxSkinId) : null;
}

function localWriterSkins(): WriterDisplaySkins {
  return {
    ...getLocalEquippedCosmeticSkins(),
    gradeFx: getEquippedGradeFxId(),
  };
}

function hasAnyEquipped(skins: WriterDisplaySkins): boolean {
  return Boolean(
    skins.nickname || skins.badge || skins.postTitle || skins.postBody || skins.gradeFx
  );
}

export const CosmeticSkinsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useUserProfile();
  const [byUid, setByUid] = useState<Record<string, WriterDisplaySkins>>({});
  const byUidRef = useRef(byUid);
  const loadingRef = useRef<Set<string>>(new Set());
  byUidRef.current = byUid;

  const syncSelfFromLocal = useCallback(() => {
    if (!profile?.uid) return;
    setByUid((prev) => ({
      ...prev,
      [profile.uid]: localWriterSkins(),
    }));
  }, [profile?.uid]);

  useEffect(() => {
    syncSelfFromLocal();
    window.addEventListener(COSMETIC_CHANGE_EVENT, syncSelfFromLocal);
    window.addEventListener(GRADE_FX_CHANGE_EVENT, syncSelfFromLocal);
    return () => {
      window.removeEventListener(COSMETIC_CHANGE_EVENT, syncSelfFromLocal);
      window.removeEventListener(GRADE_FX_CHANGE_EVENT, syncSelfFromLocal);
    };
  }, [syncSelfFromLocal]);

  // 로그인 시 Firestore ↔ 로컬 장착값 동기화
  useEffect(() => {
    if (!profile?.uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', profile.uid));
        if (cancelled) return;
        if (!snap.exists()) {
          syncSelfFromLocal();
          return;
        }
        const data = snap.data();
        const remote: WriterDisplaySkins = {
          ...parseEquippedCosmeticSkins(data?.[COSMETIC_SKINS_USER_FIELD]),
          gradeFx: parseGradeFxEquipped(data?.[GRADE_FX_USER_FIELD]),
        };

        if (hasAnyEquipped(remote)) {
          writeLocalEquippedCosmeticSkins(remote, { emit: false });
          writeLocalEquippedGradeFx(remote.gradeFx ?? null, { emit: false });
          window.dispatchEvent(new Event(COSMETIC_CHANGE_EVENT));
          window.dispatchEvent(new Event(GRADE_FX_CHANGE_EVENT));
          setByUid((prev) => ({ ...prev, [profile.uid]: remote }));
          return;
        }

        const local = localWriterSkins();
        if (hasAnyEquipped(local)) {
          setByUid((prev) => ({ ...prev, [profile.uid]: local }));
          await updateDoc(doc(db, 'users', profile.uid), {
            [COSMETIC_SKINS_USER_FIELD]: getLocalEquippedCosmeticSkins(),
            [GRADE_FX_USER_FIELD]: getEquippedGradeFxId(),
          });
        }
      } catch (error) {
        console.error('내 코스메틱 스킨 동기화 실패:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.uid, syncSelfFromLocal]);

  const preloadWriterSkins = useCallback(
    (writerUids: Array<string | null | undefined>) => {
      const unique = [...new Set(writerUids.map((u) => (u || '').trim()).filter(Boolean))];
      const toFetch = unique.filter(
        (uid) => !(uid in byUidRef.current) && !loadingRef.current.has(uid)
      );
      if (toFetch.length === 0) return;

      toFetch.forEach((uid) => loadingRef.current.add(uid));

      void Promise.all(
        toFetch.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            if (!snap.exists()) return { uid, skins: {} as WriterDisplaySkins };
            const data = snap.data();
            return {
              uid,
              skins: {
                ...parseEquippedCosmeticSkins(data?.[COSMETIC_SKINS_USER_FIELD]),
                gradeFx: parseGradeFxEquipped(data?.[GRADE_FX_USER_FIELD]),
              } as WriterDisplaySkins,
            };
          } catch (error) {
            console.error('작성자 코스메틱 스킨 로드 실패:', uid, error);
            return { uid, skins: {} as WriterDisplaySkins };
          } finally {
            loadingRef.current.delete(uid);
          }
        })
      ).then((rows) => {
        setByUid((prev) => {
          const next = { ...prev };
          rows.forEach(({ uid, skins }) => {
            if (uid === profile?.uid && prev[uid]) return;
            next[uid] = skins;
          });
          return next;
        });
      });
    },
    [profile?.uid]
  );

  const getWriterSkins = useCallback(
    (writerUid?: string | null): WriterDisplaySkins | null => {
      if (!writerUid) return null;
      return byUid[writerUid] ?? null;
    },
    [byUid]
  );

  const getWriterCosmeticClass = useCallback(
    (category: CosmeticCategory, writerUid?: string | null): string => {
      if (!writerUid) return '';
      const skins = byUid[writerUid];
      if (!skins) return '';
      return getCosmeticClassNameBySkinId(category, skins[category]);
    },
    [byUid]
  );

  const getWriterGradeFxClass = useCallback(
    (writerUid?: string | null): string => {
      if (!writerUid) return '';
      const skins = byUid[writerUid];
      if (!skins) return '';
      return getGradeFxClassNameBySkinId(skins.gradeFx);
    },
    [byUid]
  );

  const value = useMemo(
    () => ({
      getWriterSkins,
      getWriterCosmeticClass,
      getWriterGradeFxClass,
      preloadWriterSkins,
    }),
    [getWriterSkins, getWriterCosmeticClass, getWriterGradeFxClass, preloadWriterSkins]
  );

  return (
    <CosmeticSkinsContext.Provider value={value}>{children}</CosmeticSkinsContext.Provider>
  );
};

export function useCosmeticSkinsContext(): CosmeticSkinsContextValue {
  const ctx = useContext(CosmeticSkinsContext);
  if (!ctx) {
    return {
      getWriterSkins: () => null,
      getWriterCosmeticClass: () => '',
      getWriterGradeFxClass: () => '',
      preloadWriterSkins: () => undefined,
    };
  }
  return ctx;
}
