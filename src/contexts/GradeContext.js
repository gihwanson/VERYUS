import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const GradeContext = createContext();

export const useGrades = () => {
  const context = useContext(GradeContext);
  if (!context) {
    throw new Error('useGrades must be used within a GradeProvider');
  }
  return context;
};

export const GradeProvider = ({ children }) => {
  const [grades, setGrades] = useState({});
  const [profilePics, setProfilePics] = useState({});
  const [introductions, setIntroductions] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("등급 Context 실시간 리스너 설정...");
    
    // 실시간 사용자 정보 리스너
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const gradeMap = {};
        const picMap = {};
        const introMap = {};
        
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data.nickname) {
            // 등급 정보
            if (data.grade) {
              gradeMap[data.nickname] = data.grade;
            }
            // 프로필 사진
            if (data.profilePic || data.profilePicUrl) {
              picMap[data.nickname] = data.profilePic || data.profilePicUrl;
            }
            // 자기소개
            if (data.introduction) {
              introMap[data.nickname] = data.introduction;
            }
          }
        });
        
        setGrades(gradeMap);
        setProfilePics(picMap);
        setIntroductions(introMap);
        setLoading(false);
        
        console.log("등급 정보 업데이트:", Object.keys(gradeMap).length, "명");
        console.log("프로필 사진 업데이트:", Object.keys(picMap).length, "명");
      },
      (error) => {
        console.error("등급 정보 리스너 오류:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const value = {
    grades,
    profilePics,
    introductions,
    loading,
    setGrades,
    setProfilePics,
    setIntroductions
  };

  return (
    <GradeContext.Provider value={value}>
      {children}
    </GradeContext.Provider>
  );
}; 