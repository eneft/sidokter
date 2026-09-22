import { getDefaultSoegiriMasterCategories, setSoegiriMasterCategories, SoegiriCategory } from '../utils/soegiriStructure';
import { safeSetLocalStorage, getFromIndexedDB, saveToIndexedDB } from '../utils/storageQuota';
import { getPersistedClientSession } from './authService';
import { doc, getDoc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, authPersistenceReady, db } from './firebase';

const KEY = 'soegiri_offline_hierarchy_v1';
const FIRESTORE_CONFIG_KEY = 'hierarchy_master';

let activeCategoriesCache: SoegiriCategory[] | null = null;
let hasSyncedFromCloud = false;
let isInitializingSync = false;
const subscribers = new Set<(categories: SoegiriCategory[]) => void>();
let firestoreUnsubscribe: (() => void) | null = null;

if (typeof window !== 'undefined' && auth) {
  try {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        void initCloudSync();
      }
    });
  } catch {}
}

/**
 * Konversi objek numerik { "0": {...}, "1": {...} } atau Array menjadi Array standar
 */
function ensureArray<T = any>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') {
    const keys = Object.keys(val).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
    return keys.map((k) => val[k]).filter(Boolean);
  }
  return [];
}

function normalizeChildrenRecursively(node: any): any {
  if (!node) return null;
  const rawChildren = ensureArray(node.children);
  return {
    ...node,
    code: String(node.code || '').trim(),
    name: String(node.name || '').trim(),
    active: node.active !== false,
    children: rawChildren.map((c: any) => normalizeChildrenRecursively(c)).filter(Boolean)
  };
}

/**
 * Normalisasi struktur hirarki agar selalu valid dan berbentuk Array di setiap tingkat kedalaman
 */
export function normalizeHierarchyCategories(cats: any[]): SoegiriCategory[] {
  const list = ensureArray(cats);
  return list.map((cat: any, idx: number) => {
    const rawSubs = ensureArray(cat.subs);
    const rawChildren = ensureArray(cat.children);

    const subs = rawSubs.map((sub: any) => {
      const instalasis = ensureArray(sub.instalasis).map((inst: any) => {
        const polis = ensureArray(inst.polis).map((poli: any) => {
          const subUnits = ensureArray(poli.subUnits).map((su: any) => ({
            ...su,
            active: su.active !== false
          }));
          return {
            ...poli,
            active: poli.active !== false,
            subUnits
          };
        });
        return {
          ...inst,
          active: inst.active !== false,
          polis
        };
      });
      return {
        ...sub,
        active: sub.active !== false,
        instalasis
      };
    });

    const children = rawChildren.map((c: any) => normalizeChildrenRecursively(c)).filter(Boolean);

    return {
      ...cat,
      number: typeof cat.number === 'number' ? cat.number : idx + 1,
      code: String(cat.code || '').trim().toUpperCase(),
      name: String(cat.name || '').trim(),
      active: cat.active !== false,
      subs,
      children
    } as SoegiriCategory;
  });
}

/**
 * Parsing aman dari berbagai sumber (Firestore object/array, JSON string, IndexedDB)
 */
export function parseCategoriesFromRaw(rawVal: any): SoegiriCategory[] | null {
  if (!rawVal) return null;
  const list = ensureArray(rawVal);
  if (list.length > 0 && list.some((item) => item && (item.code || item.name))) {
    return normalizeHierarchyCategories(list);
  }
  return null;
}

function notifySubscribers(cats: SoegiriCategory[]) {
  subscribers.forEach((fn) => {
    try {
      fn(cats);
    } catch (err) {
      console.warn('[HierarchyService] Subscriber notice:', err);
    }
  });
}

function applyNewCategories(cats: SoegiriCategory[], source: string) {
  if (!cats || !cats.length) return;
  activeCategoriesCache = cats;
  setSoegiriMasterCategories(cats);
  safeSetLocalStorage(KEY, JSON.stringify(cats));
  void saveToIndexedDB(KEY, JSON.stringify(cats));
  console.info(`[HierarchyService] Hirarki sinkron dari [${source}] (${cats.length} kategori).`);
  notifySubscribers(cats);
}

async function buildHierarchyWriteHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  try {
    await authPersistenceReady;
    if (typeof (auth as any).authStateReady === 'function') {
      await (auth as any).authStateReady();
    }
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    if (token && token.includes('.')) headers.Authorization = `Bearer ${token}`;
  } catch (err) {
    console.warn('[HierarchyService] Firebase auth token notice:', err);
  }

  const session = getPersistedClientSession();
  if (session?.sessionId) headers['X-Session-Id'] = session.sessionId;
  if (session?.authUid) headers['X-Soegiri-Auth-Uid'] = session.authUid;
  if (session?.username) headers['X-User-Username'] = session.username;

  return headers;
}

/**
 * Eager cloud synchronization: mendengarkan Firestore real-time dan langsung fetch dari server
 */
async function initCloudSync(): Promise<void> {
  if (hasSyncedFromCloud || isInitializingSync) return;
  isInitializingSync = true;

  // 1. Prioritas utama: fetch melalui REST endpoint /api/hierarchy (server-authoritative Cloud Function)
  try {
    const res = await fetch('/api/hierarchy');
    if (res.ok) {
      const data = await res.json();
      const parsed = parseCategoriesFromRaw(data?.categories || data?.value || data);
      if (parsed && parsed.length > 0) {
        hasSyncedFromCloud = true;
        applyNewCategories(parsed, '/api/hierarchy REST');
        isInitializingSync = false;
      }
    }
  } catch {}

  // 2. Singleton listener real-time Firestore onSnapshot (hanya ketika pengguna telah terotentikasi)
  if (db && !firestoreUnsubscribe && auth?.currentUser) {
    try {
      const docRef = doc(db, 'system_config', FIRESTORE_CONFIG_KEY);
      firestoreUnsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (snap.exists()) {
            const parsed = parseCategoriesFromRaw(snap.data()?.value);
            if (parsed && parsed.length > 0) {
              hasSyncedFromCloud = true;
              applyNewCategories(parsed, 'Firestore onSnapshot');
            }
          }
        },
        (err) => {
          if (err?.code !== 'permission-denied') {
            console.warn('[HierarchyService] Firestore realtime hierarchy sync notice:', err?.message || err);
          }
        }
      );
    } catch {}
  }

  // 3. Direct fetch dari Firestore jika belum tersinkron dan pengguna telah login
  if (db && !hasSyncedFromCloud && auth?.currentUser) {
    try {
      const docRef = doc(db, 'system_config', FIRESTORE_CONFIG_KEY);
      let snap;
      try {
        snap = await getDocFromServer(docRef);
      } catch {
        snap = await getDoc(docRef);
      }
      if (snap && snap.exists()) {
        const parsed = parseCategoriesFromRaw(snap.data()?.value);
        if (parsed && parsed.length > 0) {
          hasSyncedFromCloud = true;
          applyNewCategories(parsed, 'Firestore direct getDoc');
          isInitializingSync = false;
          return;
        }
      }
    } catch (err: any) {
      if (err?.code !== 'permission-denied') {
        console.warn('[HierarchyService] Firestore direct get notice:', err);
      }
    }
  }

  isInitializingSync = false;
}

function loadInitialCategories(): SoegiriCategory[] {
  if (activeCategoriesCache) return activeCategoriesCache;

  // 1. Coba baca dari localStorage
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) {
      const parsed = parseCategoriesFromRaw(JSON.parse(raw));
      if (parsed && parsed.length > 0) {
        activeCategoriesCache = parsed;
        setSoegiriMasterCategories(parsed);
        // Tetap jalankan cloud sync di latar belakang agar PC lain menerima pembaruan
        void initCloudSync();
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[HierarchyService] Gagal membaca hierarki lokal:', err);
  }

  // 2. Coba baca dari IndexedDB secara asinkron
  if (typeof window !== 'undefined') {
    getFromIndexedDB(KEY).then((idbRaw) => {
      if (idbRaw) {
        try {
          const parsed = parseCategoriesFromRaw(JSON.parse(idbRaw));
          if (parsed && parsed.length > 0 && !hasSyncedFromCloud) {
            applyNewCategories(parsed, 'IndexedDB');
          }
        } catch {}
      }
    });
  }

  // 3. Mulai sinkronisasi cloud segera
  void initCloudSync();

  // 4. Default fallback
  const fallback = getDefaultSoegiriMasterCategories();
  activeCategoriesCache = fallback;
  setSoegiriMasterCategories(fallback);
  return fallback;
}

/**
 * Berlangganan perubahan data master hirarki.
 * Seluruh komponen (App, UserView, HierarchyPicker, modal) akan mendapatkan update real-time.
 */
export function subscribeToHierarchyMaster(
  onData: (categories: SoegiriCategory[]) => void,
  onError?: (error: any) => void
): () => void {
  subscribers.add(onData);

  // Segera kirim data terbaik saat ini
  try {
    const current = activeCategoriesCache || loadInitialCategories();
    onData(current);
  } catch (e) {
    const d = getDefaultSoegiriMasterCategories();
    setSoegiriMasterCategories(d);
    onData(d);
    onError?.(e);
  }

  // Pastikan sinkronisasi cloud berjalan
  void initCloudSync();

  const handleStorage = (e: StorageEvent) => {
    if (e.key === KEY && e.newValue) {
      try {
        const parsed = parseCategoriesFromRaw(JSON.parse(e.newValue));
        if (parsed && parsed.length > 0) {
          activeCategoriesCache = parsed;
          setSoegiriMasterCategories(parsed);
          notifySubscribers(parsed);
        }
      } catch (err) {
        onError?.(err);
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }

  return () => {
    subscribers.delete(onData);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
  };
}

/**
 * Menyimpan master hirarki melalui trusted Firebase Function dan baru mengubah cache lokal
 * setelah server mengonfirmasi write Firestore berhasil. Browser tidak pernah menulis
 * system_config secara langsung karena collection tersebut tetap Admin/trusted-backend only.
 */
export async function saveHierarchyMaster(
  categories: SoegiriCategory[],
  updatedBy = 'admin'
): Promise<SoegiriCategory[]> {
  const clean = normalizeHierarchyCategories(
    JSON.parse(JSON.stringify(categories.map((c) => ({ ...c, active: c.active !== false }))))
  );

  if (!clean.length) throw new Error('Data kategori tidak boleh kosong.');

  let response: Response;
  try {
    response = await fetch('/api/hierarchy', {
      method: 'POST',
      headers: await buildHierarchyWriteHeaders(),
      body: JSON.stringify({ categories: clean, updatedBy }),
      cache: 'no-store'
    });
  } catch (err) {
    console.error('[HierarchyService] Trusted hierarchy endpoint network error:', err);
    throw new Error('Gagal terhubung ke layanan penyimpanan Master Hirarki.');
  }

  let payload: any = {};
  try {
    payload = await response.json();
  } catch {}

  if (!response.ok || payload?.success !== true || payload?.firestoreSynced !== true) {
    const message = payload?.message
      || (response.status === 401 ? 'Sesi login tidak valid atau sudah berakhir. Silakan login kembali.' : '')
      || (response.status === 403 ? 'Akses menyimpan Master Hirarki ditolak.' : '')
      || `Gagal menyimpan Master Hirarki ke server (HTTP ${response.status}).`;
    throw new Error(message);
  }

  activeCategoriesCache = clean;
  hasSyncedFromCloud = true;
  setSoegiriMasterCategories(clean);

  try {
    safeSetLocalStorage(KEY, JSON.stringify(clean));
    void saveToIndexedDB(KEY, JSON.stringify(clean));
  } catch (err) {
    console.warn('[HierarchyService] Local persistence warning:', err);
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: JSON.stringify(clean) }));
    } catch {}
  }
  notifySubscribers(clean);

  console.info(`[HierarchyService] Master Hirarki tersimpan melalui trusted backend (${clean.length} kategori).`);
  return clean;
}

/**
 * Mengambil master hirarki dengan jaminan pengecekan Cloud Firestore terlebih dahulu jika belum tersinkron
 */
export async function getHierarchyMaster(forceRefresh = false): Promise<SoegiriCategory[]> {
  if (!forceRefresh && hasSyncedFromCloud && activeCategoriesCache && activeCategoriesCache.length > 0) {
    return activeCategoriesCache;
  }

  // 1. Coba baca dari Firestore (server-authoritative)
  if (db) {
    try {
      const docRef = doc(db, 'system_config', FIRESTORE_CONFIG_KEY);
      let snap;
      try {
        snap = await getDocFromServer(docRef);
      } catch {
        snap = await getDoc(docRef);
      }
      if (snap && snap.exists()) {
        const parsed = parseCategoriesFromRaw(snap.data()?.value);
        if (parsed && parsed.length > 0) {
          hasSyncedFromCloud = true;
          applyNewCategories(parsed, 'Firestore getHierarchyMaster');
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[HierarchyService] Gagal mengambil hierarki dari Firestore:', err);
    }
  }

  // 2. Coba baca dari /api/hierarchy REST endpoint
  try {
    const res = await fetch('/api/hierarchy');
    if (res.ok) {
      const data = await res.json();
      const parsed = parseCategoriesFromRaw(data?.categories || data?.value || data);
      if (parsed && parsed.length > 0) {
        hasSyncedFromCloud = true;
        applyNewCategories(parsed, '/api/hierarchy REST');
        return parsed;
      }
    }
  } catch {}

  // 3. Coba baca dari localStorage
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) {
      const parsed = parseCategoriesFromRaw(JSON.parse(raw));
      if (parsed && parsed.length > 0) {
        activeCategoriesCache = parsed;
        setSoegiriMasterCategories(parsed);
        return parsed;
      }
    }
  } catch {}

  // 4. Coba baca dari IndexedDB jika di localStorage belum ada
  try {
    const idbRaw = await getFromIndexedDB(KEY);
    if (idbRaw) {
      const parsed = parseCategoriesFromRaw(JSON.parse(idbRaw));
      if (parsed && parsed.length > 0) {
        activeCategoriesCache = parsed;
        setSoegiriMasterCategories(parsed);
        return parsed;
      }
    }
  } catch {}

  // 5. Default fallback
  const fallback = getDefaultSoegiriMasterCategories();
  activeCategoriesCache = fallback;
  setSoegiriMasterCategories(fallback);
  return fallback;
}
