import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
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
const targetDatabase = targetDatabaseId && targetDatabaseId.trim() !== '' ? targetDatabaseId : '(default)';

export const db = (() => {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      targetDatabase
    );
  } catch {
    return getFirestore(app, targetDatabase);
  }
})();

export const auth = getAuth(app);
export const functions = getFunctions(app, 'asia-southeast2');

// Keep Firebase Auth scoped to the current browser tab/session.
// Never use local persistence for SIDOKTER login credentials.
export const authPersistenceReady = setPersistence(auth, browserSessionPersistence);

// Validate connection to Firestore on boot (per firebase skill guidelines)
if (typeof window !== 'undefined') {
  getDocFromServer(doc(db, 'test', 'connection')).catch((error) => {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.info('Firestore initial boot check: client offline or backend not yet reached.');
    }
  });
}

