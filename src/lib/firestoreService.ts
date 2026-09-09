/**
 * FIRESTORE SERVICE - SIDOKTER SOEGIRI
 * Mengintegrasikan penyimpanan dan sinkronisasi data cloud real-time ke Firebase Firestore.
 */
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  getDocFromServer,
  onSnapshot,
  query,
  where,
  limit,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { SopDocument, LibraryDocument, UserAccount, NumberingConfig } from '../types';
import { getSopAccessKeys } from '../utils/soegiriStructure';

export interface FirebaseConnectionStatus {
  isConnected: boolean;
  isSyncing: boolean;
  lastSync: string | null;
  error: string | null;
}

let connectionStatus: FirebaseConnectionStatus = {
  isConnected: false,
  isSyncing: false,
  lastSync: null,
  error: null
};

const statusListeners = new Set<(status: FirebaseConnectionStatus) => void>();

function updateStatus(updates: Partial<FirebaseConnectionStatus>) {
  connectionStatus = { ...connectionStatus, ...updates };
  statusListeners.forEach((fn) => {
    try {
      fn(connectionStatus);
    } catch (e) {
      console.error('Error in status listener:', e);
    }
  });
}

export function subscribeToFirebaseStatus(callback: (status: FirebaseConnectionStatus) => void): () => void {
  callback(connectionStatus);
  statusListeners.add(callback);
  return () => {
    statusListeners.delete(callback);
  };
}

export function getFirebaseStatus(): FirebaseConnectionStatus {
  return connectionStatus;
}

/**
 * Filter out large fields (such as multi-megabyte base64 data URLs)
 * to prevent exceeding the Firestore 1MB document limit.
 */
function sanitizeForFirestore<T extends Record<string, any>>(obj: T): any {
  if (!obj || typeof obj !== 'object') return obj;
  const clean: Record<string, any> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;

    // Do not send huge data URLs to Firestore; Firebase Storage holds the durable binary.
    if (typeof val === 'string' && val.startsWith('data:') && val.length > 300000) {
      clean[key] = '[STORAGE_BINARY]';
      continue;
    }

    if (Array.isArray(val)) {
      clean[key] = val.map((item) =>
        item && typeof item === 'object' ? sanitizeForFirestore(item) : item
      );
    } else if (val !== null && typeof val === 'object' && !(val instanceof Date) && !(val instanceof Timestamp)) {
      clean[key] = sanitizeForFirestore(val);
    } else {
      clean[key] = val;
    }
  }

  return clean;
}

/* =========================================================================
   SOP (STANDAR PROSEDUR OPERASIONAL) FIRESTORE SYNC
========================================================================= */

export async function saveSopToFirestore(sop: SopDocument, options?: { throwOnError?: boolean }): Promise<void> {
  try {
    if (!sop || !sop.id) return;
    updateStatus({ isSyncing: true });
    const cleanSop = sanitizeForFirestore({
      ...sop,
      accessKeys: getSopAccessKeys(sop),
      _syncedAt: new Date().toISOString()
    });
    const docRef = doc(db, 'sops', sop.id);
    await setDoc(docRef, cleanSop, { merge: true });
    updateStatus({
      isConnected: true,
      isSyncing: false,
      lastSync: new Date().toISOString(),
      error: null
    });
  } catch (err: any) {
    console.warn('Firebase sync warning (SOP):', err?.message || err);
    updateStatus({
      isSyncing: false,
      error: err?.message || 'Gagal sinkronisasi SPO ke Firestore'
    });
    if (options?.throwOnError) throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function deleteSopFromFirestore(id: string): Promise<void> {
  try {
    if (!id) return;
    updateStatus({ isSyncing: true });
    const docRef = doc(db, 'sops', id);
    await deleteDoc(docRef);
    updateStatus({
      isConnected: true,
      isSyncing: false,
      lastSync: new Date().toISOString()
    });
  } catch (err: any) {
    console.warn('Firebase delete warning (SOP):', err?.message || err);
    updateStatus({ isSyncing: false });
  }
}

export async function fetchSopsFromFirestore(accessKeys?: string[], globalAccess = false): Promise<SopDocument[]> {
  // Never issue a Firestore SOP read before Firebase Auth is established.
  // An unauthenticated bootstrap is NOT an empty cloud dataset.
  if (!auth.currentUser) throw new Error('FIRESTORE_AUTH_NOT_READY');

  const colRef = collection(db, 'sops');
  const keys = Array.from(new Set((accessKeys || []).map((k) => String(k).trim().toUpperCase()).filter(Boolean)));

  if (!globalAccess && keys.length === 0) {
    // Do not return [] here: [] means a successful query with zero documents
    // and is allowed to replace the local cache. Missing access scope is an
    // error state and must preserve the existing cache.
    throw new Error('FIRESTORE_ACCESS_SCOPE_EMPTY');
  }

  try {
    const snapshots = globalAccess
      ? [await getDocs(colRef)]
      : await Promise.all(
          Array.from({ length: Math.ceil(keys.length / 30) }, (_, i) =>
            getDocs(query(colRef, where('accessKeys', 'array-contains-any', keys.slice(i * 30, i * 30 + 30))))
          )
        );

    const byId = new Map<string, SopDocument>();
    for (const snapshot of snapshots) {
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && (data.id || docSnap.id)) {
          const id = String(data.id || docSnap.id);
          byId.set(id, { ...data, id } as SopDocument);
        }
      });
    }

    updateStatus({ isConnected: true, error: null, lastSync: new Date().toISOString() });
    return Array.from(byId.values());
  } catch (err: any) {
    updateStatus({ isConnected: false, error: err?.message || 'Gagal membaca SPO dari Firestore' });
    console.warn('Firestore scoped SOP sync unavailable; preserving local cache.', err?.message || err);
    // IMPORTANT: propagate read failures. The caller must distinguish
    // "successful empty snapshot" from "cloud read failed".
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export function subscribeToFirestoreSops(
  callback: (sops: SopDocument[]) => void,
  onError?: (err: any) => void,
  accessKeys?: string[],
  globalAccess = false
): () => void {
  if (!auth.currentUser) {
    onError?.(new Error('FIRESTORE_AUTH_NOT_READY'));
    return () => {};
  }

  try {
    const colRef = collection(db, 'sops');
    const keys = Array.from(new Set((accessKeys || []).map((k) => String(k).trim().toUpperCase()).filter(Boolean)));

    if (!globalAccess && keys.length === 0) {
      onError?.(new Error('FIRESTORE_ACCESS_SCOPE_EMPTY'));
      return () => {};
    }

    // Firestore array-contains-any accepts max 30 comparison values. Use one
    // listener per batch and combine snapshots. A successful empty combined
    // result is authoritative; listener errors are NOT treated as empty data.
    const chunks = globalAccess ? [null] : Array.from({ length: Math.ceil(keys.length / 30) }, (_, i) => keys.slice(i * 30, i * 30 + 30));
    const latest = new Map<number, SopDocument[]>();
    const unsubscribers: Array<() => void> = [];
    let closed = false;

    const emitCombined = () => {
      if (closed || latest.size !== chunks.length) return;
      const byId = new Map<string, SopDocument>();
      latest.forEach((items) => items.forEach((s) => byId.set(String(s.id), s)));
      updateStatus({ isConnected: true, error: null, lastSync: new Date().toISOString() });
      callback(Array.from(byId.values()));
    };

    chunks.forEach((chunk, index) => {
      const q = globalAccess
        ? colRef
        : query(colRef, where('accessKeys', 'array-contains-any', chunk!));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items: SopDocument[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data && (data.id || docSnap.id)) items.push({ ...data, id: data.id || docSnap.id } as SopDocument);
        });
        latest.set(index, items);
        emitCombined();
      }, (err) => {
        if (closed) return;
        updateStatus({ isConnected: false, error: err?.message || 'Realtime Firestore error' });
        console.warn('Firestore scoped SOP realtime sync unavailable; preserving local cache.', err?.message || err);
        onError?.(err);
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      closed = true;
      unsubscribers.forEach((unsubscribe) => {
        try { unsubscribe(); } catch { /* noop */ }
      });
    };
  } catch (err: any) {
    onError?.(err);
    return () => {};
  }
}

/* =========================================================================
   LIBRARY DOCUMENTS (SK & MOU) FIRESTORE SYNC
========================================================================= */

export async function saveLibraryDocToFirestore(document: LibraryDocument): Promise<void> {
  try {
    if (!document || !document.id) return;
    updateStatus({ isSyncing: true });
    const cleanDoc = sanitizeForFirestore({
      ...document,
      _syncedAt: new Date().toISOString()
    });
    const docRef = doc(db, 'library_documents', document.id);
    await setDoc(docRef, cleanDoc, { merge: true });
    updateStatus({
      isConnected: true,
      isSyncing: false,
      lastSync: new Date().toISOString(),
      error: null
    });
  } catch (err: any) {
    console.warn('Firebase sync warning (Library):', err?.message || err);
    updateStatus({
      isSyncing: false,
      error: err?.message || 'Gagal sinkronisasi SK/MOU ke Firestore'
    });
  }
}

export async function deleteLibraryDocFromFirestore(id: string): Promise<void> {
  try {
    if (!id) return;
    updateStatus({ isSyncing: true });
    const docRef = doc(db, 'library_documents', id);
    await deleteDoc(docRef);
    updateStatus({
      isConnected: true,
      isSyncing: false,
      lastSync: new Date().toISOString()
    });
  } catch (err: any) {
    console.warn('Firebase delete warning (Library):', err?.message || err);
    updateStatus({ isSyncing: false });
  }
}

export async function fetchLibraryDocsFromFirestore(): Promise<LibraryDocument[] | null> {
  try {
    const colRef = collection(db, 'library_documents');
    const snapshot = await getDocs(colRef);
    const docs: LibraryDocument[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && (data.id || docSnap.id)) {
        docs.push({
          ...data,
          id: data.id || docSnap.id
        } as LibraryDocument);
      }
    });
    return docs;
  } catch (err: any) {
    console.warn('Failed to fetch Library Docs from Firestore:', err?.message || err);
    return null;
  }
}

export function subscribeToFirestoreLibraryDocs(
  callback: (docs: LibraryDocument[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const colRef = collection(db, 'library_documents');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const docs: LibraryDocument[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data && (data.id || docSnap.id)) {
            docs.push({
              ...data,
              id: data.id || docSnap.id
            } as LibraryDocument);
          }
        });
        updateStatus({ isConnected: true, lastSync: new Date().toISOString() });
        callback(docs);
      },
      (err) => {
        if (err?.code !== 'permission-denied') console.info('Firestore library_documents realtime sync unavailable; local cache remains active.');
        onError?.(err);
      }
    );
  } catch (err) {
    console.info('Firestore library_documents listener unavailable; local cache remains active.');
    return () => {};
  }
}

/* =========================================================================
   SYSTEM CONFIG & NUMBERING
========================================================================= */

export async function saveSystemConfigToFirestore(key: string, value: any): Promise<void> {
  try {
    if (!key) return;
    const docRef = doc(db, 'system_config', key);
    await setDoc(
      docRef,
      {
        id: key,
        value: sanitizeForFirestore(value),
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    updateStatus({ isConnected: true });
  } catch (err: any) {
    console.warn('Firebase config sync warning:', err?.message || err);
  }
}

/* Normalize legacy badge nomenclature: badge ADMIN was the old name for VERIFIKATOR.
   Role 'admin' remains reserved for Admin Root and is never renamed. */
function normalizeUserBadges(value: unknown): UserAccount['badges'] {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((badge) => String(badge).trim().toUpperCase())
    .map((badge) => badge === 'ADMIN' ? 'VERIFIKATOR' : badge)
    .filter((badge) => badge === 'STRUKTURAL' || badge === 'VERIFIKATOR');
  return Array.from(new Set(normalized)) as UserAccount['badges'];
}

/* =========================================================================
   USERS SYNC
========================================================================= */

export async function saveUserToFirestore(user: UserAccount): Promise<void> {
  // Deprecated for account writes. Credentials are managed exclusively by authApi.
  // Kept as a compatibility no-op so legacy callers cannot accidentally write hashes.
  void user;
  return;
}

export async function fetchUsersFromFirestore(): Promise<UserAccount[]> {
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    const users: UserAccount[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && (data.id || docSnap.id) && data.username) {
        users.push({
          id: data.id || docSnap.id,
          username: data.username,
          name: data.name || data.username,
          role: String(data.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
          unitName: data.unitName,
          divisionCode: data.divisionCode,
          divisionCodes: data.divisionCodes || (data.divisionCode ? [data.divisionCode] : undefined),
          assignments: data.assignments,
          badges: normalizeUserBadges(data.badges),
          subCode: data.subCode,
          instCode: data.instCode,
          poliCode: data.poliCode,
          subUnitCode: data.subUnitCode,
          credentialStatus: data.credentialStatus,
          createdAt: data.createdAt || '',
          updatedAt: data.updatedAt
        });
      }
    });
    return users;
  } catch (err: any) {
    console.warn('Failed to fetch users from Firestore:', err?.message || err);
    return [];
  }
}

export async function fetchUserByUsernameFromFirestore(username: string): Promise<UserAccount | null> {
  const cleanUser = username.trim().toLowerCase();
  try {
    const users = await fetchUsersFromFirestore();
    return users.find((u) => u.username.toLowerCase() === cleanUser) || null;
  } catch {
    return null;
  }
}

export function subscribeToFirestoreUsers(callback: (users: UserAccount[]) => void): () => void {
  try {
    const colRef = collection(db, 'users');
    return onSnapshot(colRef, (snapshot) => {
      const users: UserAccount[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && (data.id || docSnap.id) && data.username) {
          users.push({
            id: data.id || docSnap.id,
            username: data.username,
            name: data.name || data.username,
            role: String(data.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
            unitName: data.unitName, divisionCode: data.divisionCode,
            divisionCodes: data.divisionCodes || (data.divisionCode ? [data.divisionCode] : undefined),
            assignments: data.assignments, badges: normalizeUserBadges(data.badges),
            subCode: data.subCode, instCode: data.instCode, poliCode: data.poliCode, subUnitCode: data.subUnitCode,
            credentialStatus: data.credentialStatus, createdAt: data.createdAt || '', updatedAt: data.updatedAt
          });
        }
      });
      callback(users);
    }, (err) => {
      if (err?.code !== 'permission-denied') console.info('Firestore users realtime sync unavailable; local cache remains active.');
    });
  } catch (err) {
    console.info('Firestore users listener unavailable; local cache remains active.');
    return () => {};
  }
}

/* =========================================================================
   AUDIT LOGS
========================================================================= */

export async function logAuditToFirestore(audit: {
  action: string;
  actorName?: string;
  actorRole?: string;
  details?: string;
}): Promise<void> {
  try {
    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const docRef = doc(db, 'audit_logs', id);
    await setDoc(docRef, {
      id,
      ...audit,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    // Non-critical, fail silently in background
  }
}

/* =========================================================================
   INITIALIZATION & HEALTH CHECK
========================================================================= */

export async function checkFirebaseConnection(): Promise<boolean> {
  try {
    updateStatus({ isSyncing: true });
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch {
      const cfgSnap = await getDoc(doc(db, 'system_config', 'maintenance'));
      if (!cfgSnap.exists()) {
        await getDoc(doc(db, 'test', 'connection'));
      }
    }
    updateStatus({
      isConnected: true,
      isSyncing: false,
      lastSync: new Date().toISOString(),
      error: null
    });
    return true;
  } catch (err: any) {
    if (err?.code !== 'permission-denied') console.info('Firestore connection check unavailable; local cache remains active.');
    updateStatus({
      isConnected: false,
      isSyncing: false,
      error: err?.message || 'Tidak dapat menghubungi Firestore'
    });
    return false;
  }
}
