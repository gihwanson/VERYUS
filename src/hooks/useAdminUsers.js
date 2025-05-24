import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  limit,
  startAfter,
  orderBy,
  writeBatch,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';

const USERS_PER_PAGE = 10;

export const useAdminUsers = (activeFilter = 'all', sortBy = 'nickname', sortDirection = 'asc') => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const [userCount, setUserCount] = useState(0);

  // 사용자 수 가져오기
  const fetchUserCount = useCallback(async () => {
    try {
      let userQuery = query(collection(db, 'users'));
      
      // 필터 적용
      if (activeFilter === 'admin') {
        userQuery = query(userQuery, where('role', '==', '관리자'));
      } else if (activeFilter === 'recent') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        userQuery = query(userQuery, where('createdAt', '>=', thirtyDaysAgo));
      }
      
      const snapshot = await getDocs(userQuery);
      setUserCount(snapshot.size);
    } catch (err) {
      console.error('사용자 수 로드 오류:', err);
      setError('사용자 수를 가져오는 중 오류가 발생했습니다');
    }
  }, [activeFilter]);

  // 초기 데이터 로드
  useEffect(() => {
    let unsubscribe;
    
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        let userQuery = query(
          collection(db, 'users'),
          orderBy(sortBy, sortDirection),
          limit(USERS_PER_PAGE)
        );
        
        // 필터 적용
        if (activeFilter === 'admin') {
          userQuery = query(
            collection(db, 'users'),
            where('role', 'in', ['운영진', '리더', '부운영진']),
            orderBy(sortBy, sortDirection),
            limit(USERS_PER_PAGE)
          );
        } else if (activeFilter === 'recent') {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          userQuery = query(
            collection(db, 'users'),
            where('createdAt', '>=', thirtyDaysAgo),
            orderBy('createdAt', 'desc'),
            limit(USERS_PER_PAGE)
          );
        }
        
        // 실시간 리스너 설정
        unsubscribe = onSnapshot(userQuery, 
          (snapshot) => {
            const userData = [];
            const seenIds = new Set(); // 중복 체크를 위한 Set
            
            snapshot.forEach((doc) => {
              const id = doc.id;
              // 중복 ID 체크
              if (!seenIds.has(id)) {
                seenIds.add(id);
                userData.push({ id, ...doc.data() });
              }
            });
            
            setUsers(userData);
            setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
            setHasMore(snapshot.docs.length === USERS_PER_PAGE);
            setLoading(false);
            
            // 새로운 데이터가 감지되면 강제로 다시 렌더링
            console.log("사용자 데이터 업데이트됨:", userData.length, "명 (중복 제거됨)");
          },
          (err) => {
            console.error('사용자 데이터 로드 오류:', err);
            setError('사용자 데이터를 불러오는 중 오류가 발생했습니다');
            setLoading(false);
          }
        );
        
        // 전체 사용자 수 가져오기
        await fetchUserCount();
        
      } catch (err) {
        console.error('초기 데이터 로드 오류:', err);
        setError('데이터를 불러오는 중 오류가 발생했습니다');
        setLoading(false);
      }
    };

    loadInitialData();
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [activeFilter, sortBy, sortDirection, fetchUserCount]);

  // 추가 사용자 로드
  const loadMoreUsers = useCallback(async () => {
    if (!lastVisible || loadingMore) return;
    
    setLoadingMore(true);
    
    try {
      let nextQuery;
      switch (activeFilter) {
        case 'admin':
          nextQuery = query(
            collection(db, 'users'),
            where('role', 'in', ['운영진', '리더', '부운영진']),
            orderBy(sortBy, sortDirection),
            startAfter(lastVisible),
            limit(USERS_PER_PAGE)
          );
          break;
        case 'recent':
          nextQuery = query(
            collection(db, 'users'),
            orderBy('createdAt', 'desc'),
            startAfter(lastVisible),
            limit(USERS_PER_PAGE)
          );
          break;
        default:
          nextQuery = query(
            collection(db, 'users'),
            orderBy(sortBy, sortDirection),
            startAfter(lastVisible),
            limit(USERS_PER_PAGE)
          );
      }

      const snapshot = await getDocs(nextQuery);
      const newUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        originalData: { ...doc.data() },
        ...doc.data()
      }));

      if (snapshot.docs.length > 0) {
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        // 중복 제거하여 사용자 추가
        setUsers(prev => {
          const existingIds = new Set(prev.map(user => user.id));
          const filteredNewUsers = newUsers.filter(user => !existingIds.has(user.id));
          return [...prev, ...filteredNewUsers];
        });
      } else {
        setHasMore(false);
      }
    } catch (err) {
      setError('추가 사용자를 불러오는 중 오류가 발생했습니다');
      console.error('추가 사용자 로드 오류:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [lastVisible, loadingMore, activeFilter, sortBy, sortDirection]);

  // 사용자 업데이트
  const updateUser = useCallback(async (userId, data) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        ...data,
        updatedAt: serverTimestamp()
      });
      
      // 실시간 업데이트를 위해 로컬 상태도 즉시 업데이트
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user.id === userId 
            ? { ...user, ...data }
            : user
        )
      );
      
      return true;
    } catch (err) {
      setError('사용자 정보 업데이트 중 오류가 발생했습니다');
      console.error('사용자 업데이트 오류:', err);
      return false;
    }
  }, []);

  // 사용자 삭제
  const deleteUser = useCallback(async (userId) => {
    try {
      await deleteDoc(doc(db, 'users', userId));
      return true;
    } catch (err) {
      setError('사용자 삭제 중 오류가 발생했습니다');
      console.error('사용자 삭제 오류:', err);
      return false;
    }
  }, []);

  // 일괄 업데이트
  const bulkUpdateUsers = useCallback(async (userIds, data) => {
    try {
      const batch = writeBatch(db);
      
      userIds.forEach(userId => {
        const userRef = doc(db, 'users', userId);
        batch.update(userRef, {
          ...data,
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
      return true;
    } catch (err) {
      setError('일괄 업데이트 중 오류가 발생했습니다');
      console.error('일괄 업데이트 오류:', err);
      return false;
    }
  }, []);

  // 새 사용자 추가
  const addUser = useCallback(async (userData) => {
    try {
      const userRef = doc(collection(db, 'users'));
      await setDoc(userRef, {
        ...userData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (err) {
      setError('새 사용자 추가 중 오류가 발생했습니다');
      console.error('사용자 추가 오류:', err);
      return false;
    }
  }, []);

  return {
    users,
    loading,
    loadingMore,
    hasMore,
    error,
    userCount,
    loadMoreUsers,
    updateUser,
    deleteUser,
    bulkUpdateUsers,
    addUser
  };
}; 