import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Song, SetListData } from '../types';

/** 전체 셋리스트 목록만 로드 — 활성 세션 선택은 useBuskingSession에서 처리 */
export const useSetListData = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [setLists, setSetLists] = useState<SetListData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSongs = async () => {
      try {
        const q = query(collection(db, 'approvedSongs'), orderBy('title'));
        const snap = await getDocs(q);
        const songsData = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          members: Array.isArray(doc.data().members) ? doc.data().members : [],
        })) as Song[];
        setSongs(songsData);
      } catch (error) {
        console.error('합격곡 로드 실패:', error);
      }
    };
    fetchSongs();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'setlists'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const setListsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as SetListData[];
        setSetLists(setListsData);
        setLoading(false);
      },
      (error) => {
        console.error('셋리스트 실시간 업데이트 실패:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return {
    songs,
    setLists,
    loading,
  };
};
