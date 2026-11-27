import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBdWn1wFQYSoFEiulrkcK-CjZUPnojRLlQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'docrama-1a7b9.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'docrama-1a7b9',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'docrama-1a7b9.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '185870979',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:185870979:web:4fffc5da2690222b9349b6',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-NTSPK37XCV',
};

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firestore = getFirestore(firebaseApp);
