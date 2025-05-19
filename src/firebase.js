// src/firebase.js

import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// 🔐 실제 프로젝트의 설정으로 바꿔줘야 함
const firebaseConfig = {
    apiKey: "AIzaSyAFnppMjf9K5Cv_ZrrC4PoE_sldORb_HGs",
    authDomain: "veryusduet.firebaseapp.com",
    projectId: "veryusduet",
    storageBucket: "veryusduet.firebasestorage.app",
    messagingSenderId: "966196979262",
    appId: "1:966196979262:web:1d8a73f2d5af425bf7136f",
    measurementId: "G-95YH8RLKYP"
  };

// 🔄 중복 초기화 방지
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// 🔗 Firebase 서비스 연결
const db = getFirestore(app);
const storage = getStorage(app);

// 📤 외부에서 사용할 수 있도록 export
export { db, storage };
