// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v9-compat and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyAFnppMjf9K5Cv_ZrrC4PoE_sldORb_HGs",
    authDomain: "veryusduet.firebaseapp.com",
    projectId: "veryusduet",
    storageBucket: "veryusduet.firebasestorage.app",
    messagingSenderId: "966196979262",
    appId: "1:966196979262:web:1d8a73f2d5af425bf7136f",
    measurementId: "G-95YH8RLKYP"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Firestore Database
export const db = getFirestore(app);

// Initialize Firebase Storage
export const storage = getStorage(app);

export default app; 