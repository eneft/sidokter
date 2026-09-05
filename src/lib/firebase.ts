import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import config from '../../firebase-applet-config.json';

const metaEnv = ((typeof import.meta !== 'undefined' && (import.meta as any).env) || {}) as Record<string, string | undefined>;

export const firebaseConfig = {
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || config.projectId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || config.appId,
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || config.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || config.authDomain,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || config.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || config.messagingSenderId,
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const targetDatabaseId = metaEnv.VITE_FIRESTORE_DATABASE_ID || config.firestoreDatabaseId;

export const db = getFirestore(
  app,
  targetDatabaseId && targetDatabaseId.trim() !== ''
    ? targetDatabaseId
    : '(default)'
);

export const auth = getAuth(app);

// Keep Firebase Auth scoped to the current browser tab/session.
// Never use local persistence for SIDOKTER login credentials.
export const authPersistenceReady = setPersistence(auth, browserSessionPersistence);
