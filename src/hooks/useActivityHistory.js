import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  Timestamp,
  query,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';

export const useActivityHistory = () => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const snap = await getDocs(collection(db, 'meta'));
      const document = snap.docs.find(d => d.id === 'history');

      if (document) {
        const data = document.data();
        setText(data.text || '');
        
        if (data.lastUpdated) {
          setLastUpdated(data.lastUpdated.toDate());
        }
      }

      const historyQuery = query(
        collection(db, 'historyLogs'),
        orderBy('timestamp', 'desc'),
        limit(5)
      );

      const historySnap = await getDocs(historyQuery);
      const historyData = historySnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate()
      }));

      setHistory(historyData);
    } catch (err) {
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
      console.error('활동 이력을 불러오는 중 오류 발생:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateHistory = async (newText, nickname) => {
    try {
      setLoading(true);
      setError(null);
      const timestamp = Timestamp.now();

      await setDoc(doc(db, 'meta', 'history'), {
        text: newText,
        lastUpdated: timestamp,
        updatedBy: nickname
      });

      const logRef = doc(collection(db, 'historyLogs'));
      await setDoc(logRef, {
        previousText: text,
        newText,
        updatedBy: nickname,
        timestamp
      });

      setText(newText);
      setLastUpdated(new Date());
      await fetchHistory();
      return true;
    } catch (err) {
      setError('저장 중 오류가 발생했습니다');
      console.error('저장 중 오류 발생:', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();

    const unsubscribe = onSnapshot(
      doc(db, 'meta', 'history'),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setText(data.text || '');
          
          if (data.lastUpdated) {
            setLastUpdated(data.lastUpdated.toDate());
          }
        }
      },
      (error) => {
        setError('실시간 업데이트 중 오류가 발생했습니다');
        console.error('실시간 업데이트 오류:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  return {
    text,
    loading,
    error,
    history,
    lastUpdated,
    updateHistory
  };
}; 