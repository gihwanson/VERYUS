import { useState, useEffect, useRef } from 'react';
import {
  collection,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Song, SetListData } from '../types';

const SETLIST_RESUBSCRIBE_MS = 2000;

/** 전체 셋리스트 목록만 로드 — 활성 세션 선택은 useBuskingSession에서 처리 */
export const useSetListData = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [setLists, setSetLists] = useState<SetListData[]>([]);
  const [loading, setLoading] = useState(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fetchSongs = async () => {
      try {
        const q = query(collection(db, 'approvedSongs'), orderBy('title'));
        const snap = await getDocs(q);
        const songsData = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          members: Array.isArray(docSnap.data().members) ? docSnap.data().members : [],
        })) as Song[];
        setSongs(songsData);
      } catch (error) {
        console.error('합격곡 로드 실패:', error);
      }
    };
    fetchSongs();
  }, []);

  useEffect(() => {
    let unsubscribe: Unsubscribe | null = null;
    let cancelled = false;

    const clearRetry = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const subscribe = () => {
      if (cancelled) return;
      clearRetry();
      unsubscribe?.();

      unsubscribe = onSnapshot(
        query(collection(db, 'setlists'), orderBy('createdAt', 'desc')),
        (snapshot) => {
          const setListsData = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })) as SetListData[];
          setSetLists(setListsData);
          setLoading(false);
        },
        (error) => {
          console.error('셋리스트 실시간 업데이트 실패:', error);
          setLoading(false);
          // 리스너가 끊기면 목록이 고정되므로 잠시 후 재구독
          clearRetry();
          retryTimerRef.current = setTimeout(subscribe, SETLIST_RESUBSCRIBE_MS);
        }
      );
    };

    subscribe();

    return () => {
      cancelled = true;
      clearRetry();
      unsubscribe?.();
    };
  }, []);

  return {
    songs,
    setLists,
    loading,
  };
};
