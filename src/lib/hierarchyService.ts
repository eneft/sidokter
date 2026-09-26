import { getDefaultSoegiriMasterCategories, setSoegiriMasterCategories, SoegiriCategory } from '../utils/soegiriStructure';
import { safeSetLocalStorage, getFromIndexedDB, saveToIndexedDB } from '../utils/storageQuota';
import { getPersistedClientSession } from './authService';
import { doc, getDoc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { auth, authPersistenceReady, db, firebaseConfig } from './firebase';
import { isCapacitorNativeRuntime } from './runtimeEndpoints';

const KEY = 'soegiri_offline_hierarchy_v1';
const FIRESTORE_CONFIG_KEY = 'hierarchy_master';
const CHUNKED_FORMAT = 'chunked-json-base64-v1';
const projectId = firebaseConfig.projectId || 'sidokter-soegiri';
const DIRECT_CLOUD_HIERARCHY_URL = `https://asia-southeast2-${projectId}.cloudfunctions.net/hierarchyApiV2`;

let activeCategoriesCache: SoegiriCategory[] | null = null;
let hasSyncedFromCloud = false;
let isInitializingSync = false;
const subscribers = new Set<(categories: SoegiriCategory[]) => void>();
let firestoreUnsubscribe: (() => void) | null = null;

function ensureArray<T = any>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') {
    return Object.keys(val)
      .sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      })
      .map((key) => val[key])
      .filter(Boolean);
  }
  return [];
}

function normalizeChildrenRecursively(node: any): any {
  if (!node) return null;
  return {
    ...node,
    code: String(node.code || '').trim(),
    name: String(node.name || '').trim(),
    active: node.active !== false,
    children: ensureArray(node.children).map((child: any) => normalizeChildrenRecursively(child)).filter(Boolean)
  };
}

export function normalizeHierarchyCategories(cats: any[]): SoegiriCategory[] {
  const list = ensureArray(cats);
  return list.map((cat: any, idx: number) => {
    const subs = ensureArray(cat.subs).map((sub: any) => {
      const instalasis = ensureArray(sub.instalasis).map((inst: any) => {
        const polis = ensureArray(inst.polis).map((poli: any) => ({
          ...poli,
          active: poli.active !== false,
          subUnits: ensureArray(poli.subUnits).map((su: any) => ({ ...su, active: su.active !== false }))
        }));
        return { ...inst, active: inst.active !== false, polis };
      });
      return { ...sub, active: sub.active !== false, instalasis };
    });

    return {
      ...cat,
      number: typeof cat.number === 'number' ? cat.number : idx + 1,
      code: String(cat.code || '').trim().toUpperCase(),
      name: String(cat.name || '').trim(),
      active: cat.active !== false,
      subs,
      children: ensureArray(cat.children).map((child: any) => normalizeChildrenRecursively(child)).filter(Boolean)
    } as SoegiriCategory;
  });
}

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
    try { fn(cats); } catch (err) { console.warn('[HierarchyService] Subscriber notice:', err); }
  });
}

function applyNewCategories(cats: SoegiriCategory[], source: string) {
  if (!cats?.length) return;
  activeCategoriesCache = cats;
  hasSyncedFromCloud = true;
  setSoegiriMasterCategories(cats);
  safeSetLocalStorage(KEY, JSON.stringify(cats));
  void saveToIndexedDB(KEY, JSON.stringify(cats));
  console.info(`[HierarchyService] Hirarki sinkron dari [${source}] (${cats.length} kategori).`);
  notifySubscribers(cats);
}

async function buildHierarchyWriteHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  try {
    await authPersistenceReady;
    if (typeof (auth as any).authStateReady === 'function') await (auth as any).authStateReady();
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

type HierarchyApiResult = { response: Response; payload: any; url: string };

async function requestHierarchyApi(method: 'GET' | 'POST', body?: Record<string, any>): Promise<HierarchyApiResult> {
  const headers = method === 'POST' ? await buildHierarchyWriteHeaders() : { Accept: 'application/json' };
  const init: RequestInit = {
    method,
    headers,
    cache: 'no-store',
    ...(body ? { body: JSON.stringify(body) } : {})
  };

  const requestOne = async (url: string): Promise<HierarchyApiResult> => {
    const response = await fetch(url, init);
    let payload: any = {};
    try { payload = await response.clone().json(); } catch {}
    return { response, payload, url };
  };

  let first: HierarchyApiResult | null = null;
  try {
    first = await requestOne(isCapacitorNativeRuntime() ? DIRECT_CLOUD_HIERARCHY_URL : '/api/hierarchy');
  } catch (error) {
    console.warn('[HierarchyService] Same-origin hierarchy endpoint unavailable:', error);
  }

  const fallbackStatuses = new Set([401, 403, 404, 405, 500, 502, 503, 504]);
  const firstLooksLikeApi = Boolean(first?.payload && typeof first.payload === 'object' && ('success' in first.payload || 'categories' in first.payload));
  const shouldFallback = !first || fallbackStatuses.has(first.response.status) || (first.response.ok && !firstLooksLikeApi);

  if (shouldFallback) {
    try {
      return await requestOne(DIRECT_CLOUD_HIERARCHY_URL);
    } catch (error) {
      if (first) return first;
      console.error('[HierarchyService] Direct hierarchy endpoint unavailable:', error);
      throw new Error('Gagal terhubung ke layanan Master Hirarki.');
    }
  }

  return first;
}

async function fetchHierarchyFromApi(source: string): Promise<SoegiriCategory[] | null> {
  try {
    const { response, payload } = await requestHierarchyApi('GET');
    if (!response.ok || payload?.success !== true) return null;
    const parsed = parseCategoriesFromRaw(payload?.categories || payload?.value || payload);
    if (parsed?.length) {
      applyNewCategories(parsed, source);
      return parsed;
    }
  } catch (err) {
    console.warn('[HierarchyService] Cloud hierarchy read notice:', err);
  }
  return null;
}

async function initCloudSync(): Promise<void> {
  if (hasSyncedFromCloud || isInitializingSync) return;
  isInitializingSync = true;

  if (db && !firestoreUnsubscribe) {
    try {
      const docRef = doc(db, 'system_config', FIRESTORE_CONFIG_KEY);
      firestoreUnsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data() || {};
          if (data.format === CHUNKED_FORMAT) {
            void fetchHierarchyFromApi('Firestore metadata → hierarchyApiV2');
            return;
          }
          const parsed = parseCategoriesFromRaw(data.value);
          if (parsed?.length) applyNewCategories(parsed, 'Firestore onSnapshot legacy');
        },
        (err) => console.warn('[HierarchyService] Firestore realtime hierarchy sync notice:', err?.message || err)
      );
    } catch (err) {
      console.warn('[HierarchyService] Inisialisasi onSnapshot notice:', err);
    }
  }

  const apiCategories = await fetchHierarchyFromApi('hierarchyApiV2 initial');
  if (apiCategories?.length) {
    isInitializingSync = false;
    return;
  }

  if (db) {
    try {
      const docRef = doc(db, 'system_config', FIRESTORE_CONFIG_KEY);
      let snap;
      try { snap = await getDocFromServer(docRef); } catch { snap = await getDoc(docRef); }
      if (snap?.exists()) {
        const data = snap.data() || {};
        if (data.format !== CHUNKED_FORMAT) {
          const parsed = parseCategoriesFromRaw(data.value);
          if (parsed?.length) applyNewCategories(parsed, 'Firestore direct legacy');
        }
      }
    } catch (err) {
      console.warn('[HierarchyService] Firestore direct get notice:', err);
    }
  }

  isInitializingSync = false;
}

function loadInitialCategories(): SoegiriCategory[] {
  if (activeCategoriesCache) return activeCategoriesCache;

  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) {
      const parsed = parseCategoriesFromRaw(JSON.parse(raw));
      if (parsed?.length) {
        activeCategoriesCache = parsed;
        setSoegiriMasterCategories(parsed);
        void initCloudSync();
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[HierarchyService] Gagal membaca hierarki lokal:', err);
  }

  if (typeof window !== 'undefined') {
    getFromIndexedDB(KEY).then((idbRaw) => {
      if (!idbRaw) return;
      try {
        const parsed = parseCategoriesFromRaw(JSON.parse(idbRaw));
        if (parsed?.length && !hasSyncedFromCloud) applyNewCategories(parsed, 'IndexedDB');
      } catch {}
    });
  }

  void initCloudSync();
  const fallback = getDefaultSoegiriMasterCategories();
  activeCategoriesCache = fallback;
  setSoegiriMasterCategories(fallback);
  return fallback;
}

export function subscribeToHierarchyMaster(
  onData: (categories: SoegiriCategory[]) => void,
  onError?: (error: any) => void
): () => void {
  subscribers.add(onData);
  try {
    onData(activeCategoriesCache || loadInitialCategories());
  } catch (error) {
    const fallback = getDefaultSoegiriMasterCategories();
    setSoegiriMasterCategories(fallback);
    onData(fallback);
    onError?.(error);
  }

  void initCloudSync();
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== KEY || !event.newValue) return;
    try {
      const parsed = parseCategoriesFromRaw(JSON.parse(event.newValue));
      if (parsed?.length) {
        activeCategoriesCache = parsed;
        setSoegiriMasterCategories(parsed);
        notifySubscribers(parsed);
      }
    } catch (err) { onError?.(err); }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', handleStorage);

  return () => {
    subscribers.delete(onData);
    if (typeof window !== 'undefined') window.removeEventListener('storage', handleStorage);
  };
}

export async function saveHierarchyMaster(
  categories: SoegiriCategory[],
  updatedBy = 'admin'
): Promise<SoegiriCategory[]> {
  const clean = normalizeHierarchyCategories(
    JSON.parse(JSON.stringify(categories.map((category) => ({ ...category, active: category.active !== false }))))
  );
  if (!clean.length) throw new Error('Data kategori tidak boleh kosong.');

  const { response, payload, url } = await requestHierarchyApi('POST', { categories: clean, updatedBy });
  if (!response.ok || payload?.success !== true || payload?.firestoreSynced !== true) {
    const message = payload?.message
      || (response.status === 401 ? 'Sesi login tidak valid atau sudah berakhir. Silakan login kembali.' : '')
      || (response.status === 403 ? 'Akses menyimpan Master Hirarki ditolak.' : '')
      || `Gagal menyimpan Master Hirarki ke server (HTTP ${response.status}).`;
    throw new Error(message);
  }

  applyNewCategories(clean, `trusted backend ${url}`);
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: JSON.stringify(clean) })); } catch {}
  }
  console.info(`[HierarchyService] Master Hirarki tersimpan melalui trusted chunked backend (${clean.length} kategori).`);
  return clean;
}

export async function getHierarchyMaster(forceRefresh = false): Promise<SoegiriCategory[]> {
  if (!forceRefresh && hasSyncedFromCloud && activeCategoriesCache?.length) return activeCategoriesCache;

  const fromApi = await fetchHierarchyFromApi('hierarchyApiV2 getHierarchyMaster');
  if (fromApi?.length) return fromApi;

  if (db) {
    try {
      const docRef = doc(db, 'system_config', FIRESTORE_CONFIG_KEY);
      let snap;
      try { snap = await getDocFromServer(docRef); } catch { snap = await getDoc(docRef); }
      if (snap?.exists()) {
        const data = snap.data() || {};
        if (data.format !== CHUNKED_FORMAT) {
          const parsed = parseCategoriesFromRaw(data.value);
          if (parsed?.length) {
            applyNewCategories(parsed, 'Firestore getHierarchyMaster legacy');
            return parsed;
          }
        }
      }
    } catch (err) {
      console.warn('[HierarchyService] Gagal mengambil hierarki dari Firestore:', err);
    }
  }

  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) {
      const parsed = parseCategoriesFromRaw(JSON.parse(raw));
      if (parsed?.length) {
        activeCategoriesCache = parsed;
        setSoegiriMasterCategories(parsed);
        return parsed;
      }
    }
  } catch {}

  try {
    const idbRaw = await getFromIndexedDB(KEY);
    if (idbRaw) {
      const parsed = parseCategoriesFromRaw(JSON.parse(idbRaw));
      if (parsed?.length) {
        activeCategoriesCache = parsed;
        setSoegiriMasterCategories(parsed);
        return parsed;
      }
    }
  } catch {}

  const fallback = getDefaultSoegiriMasterCategories();
  activeCategoriesCache = fallback;
  setSoegiriMasterCategories(fallback);
  return fallback;
}
