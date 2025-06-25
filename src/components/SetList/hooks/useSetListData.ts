import { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Song, SetListData } from '../types';

export const useSetListData = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [setLists, setSetLists] = useState<SetListData[]>([]);
  const [activeSetList, setActiveSetList] = useState<SetListData | null>(null);
  const [loading, setLoading] = useState(true);

  // 합격곡 데이터 로드
  useEffect(() => {
    const fetchSongs = async () => {
      try {
        const q = query(collection(db, 'approvedSongs'), orderBy('title'));
        const snap = await getDocs(q);
        const songsData = snap.docs.map(doc => ({
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

  // 셋리스트 실시간 업데이트
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'setlists'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const setListsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as SetListData[];
        setSetLists(setListsData);
        
        // 활성화된 셋리스트가 있으면 업데이트
        const activeList = setListsData.find(list => list.isActive);
        setActiveSetList(activeList || null);
        
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
    activeSetList,
    loading
  };
}; 