// src/firebase.js

import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

// 너의 Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyAFnppMjf9K5Cv_ZrrC4PoE_sldORb_HGs",
  authDomain: "veryusduet.firebaseapp.com",
  projectId: "veryusduet",
  storageBucket: "veryusduet.firebasestorage.app",
  messagingSenderId: "966196979262",
  appId: "1:966196979262:web:1d8a73f2d5af425bf7136f",
  measurementId: "G-95YH8RLKYP"
};

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// Firestore 연결
const db = getFirestore(app);

// ✅ 로컬에서 실행 중이면 Firestore Emulator에 연결 (중요!)

// Storage 연결
const storage = getStorage(app);

// 인증 연결
const auth = getAuth(app);

// 디버깅용 콘솔 출력
if (process.env.NODE_ENV === 'development') {
  console.log('🔥 Firebase 연결 완료', {
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket
  });
}

export { db, storage, auth };
