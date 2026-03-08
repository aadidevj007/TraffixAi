// lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const hasFirebaseConfig = Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

// Prevent build-time crashes when env vars are missing on server/prerender.
const canInit = hasFirebaseConfig || typeof window !== 'undefined';
const app = canInit
    ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp())
    : null;

export const auth = app ? getAuth(app) : ({} as ReturnType<typeof getAuth>);
export const db = app ? getFirestore(app) : ({} as ReturnType<typeof getFirestore>);
export const storage = app ? getStorage(app) : ({} as ReturnType<typeof getStorage>);
export default app;
