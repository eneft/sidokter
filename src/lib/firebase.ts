import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import config from '../../firebase-applet-config.json';

export const firebaseConfig = {
  projectId: config.projectId,
  appId: config.appId,
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(
  app,
  config.firestoreDatabaseId && config.firestoreDatabaseId.trim() !== ''
    ? config.firestoreDatabaseId
    : '(default)'
);

export const auth = getAuth(app);

// Keep Firebase Auth scoped to the current browser tab/session.
// Never use local persistence for SIDOKTER login credentials.
export const authPersistenceReady = setPersistence(auth, browserSessionPersistence);
