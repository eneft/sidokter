import { getDefaultSoegiriMasterCategories, setSoegiriMasterCategories, SoegiriCategory } from '../utils/soegiriStructure';
import { safeSetLocalStorage } from '../utils/storageQuota';
import { saveSystemConfigToFirestore } from './firestoreService';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

const KEY = 'soegiri_offline_hierarchy_v1';
const FIRESTORE_CONFIG_KEY = 'hierarchy_master';

let activeCategoriesCache: SoegiriCategory[] | null = null;
let firestoreSubscribed = false;

function loadInitialCategories(): SoegiriCategory[] {
  if (activeCategoriesCache) return activeCategoriesCache;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        activeCategoriesCache = parsed;
        setSoegiriMasterCategories(parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[HierarchyService] Gagal membaca hierarki lokal:', err);
  }
  const fallback = getDefaultSoegiriMasterCategories();
  activeCategoriesCache = fallback;
  setSoegiriMasterCategories(fallback);
  return fallback;
}

export function subscribeToHierarchyMaster(
  onData: (categories: SoegiriCategory[]) => void,
  onError?: (error: any) => void
): () => void {
  const emit = () => {
    try {
      const data = loadInitialCategories();
      onData(data);
    } catch (e) {
      const d = getDefaultSoegiriMasterCategories();
      setSoegiriMasterCategories(d);
      onData(d);
      onError?.(e);
    }
  };

  emit();

  const handleStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          activeCategoriesCache = parsed;
          setSoegiriMasterCategories(parsed);
          onData(parsed);
        }
      } catch (err) {
        onError?.(err);
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }

  // Real-time sync dari Firestore (system_config/hierarchy_master)
  let unsubscribeFirestore: (() => void) | null = null;
  if (!firestoreSubscribed && db) {
    firestoreSubscribed = true;
    try {
      const docRef = doc(db, 'system_config', FIRESTORE_CONFIG_KEY);
      unsubscribeFirestore = onSnapshot(
        docRef,
        (snap) => {
          if (snap.exists()) {
            const val = snap.data()?.value;
            if (Array.isArray(val) && val.length > 0) {
              activeCategoriesCache = val;
              setSoegiriMasterCategories(val);
              safeSetLocalStorage(KEY, JSON.stringify(val));
              onData(val);
            }
          }
        },
        (err) => {
          console.warn('[HierarchyService] Firestore realtime hierarchy sync notice:', err?.message || err);
        }
      );
    } catch (err) {
      console.warn('[HierarchyService] Gagal inisialisasi Firestore listener:', err);
    }
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
    if (unsubscribeFirestore) {
      unsubscribeFirestore();
      firestoreSubscribed = false;
    }
  };
}

export async function saveHierarchyMaster(
  categories: SoegiriCategory[],
  updatedBy = 'admin'
): Promise<SoegiriCategory[]> {
  const clean: SoegiriCategory[] = JSON.parse(
    JSON.stringify(categories.map((c) => ({ ...c, active: c.active !== false })))
  );

  activeCategoriesCache = clean;
  setSoegiriMasterCategories(clean);

  // 1. Simpan ke localStorage dengan pengamanan kuota otomatis (auto-purge jika penuh)
  try {
    safeSetLocalStorage(KEY, JSON.stringify(clean));
  } catch (err) {
    console.warn('[HierarchyService] safeSetLocalStorage warning:', err);
  }

  // 2. Broadcast event perubahan ke seluruh tab/komponen
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    } catch {}
  }

  // 3. Sinkronkan ke Firestore system_config agar data tersimpan aman di Cloud
  try {
    await saveSystemConfigToFirestore(FIRESTORE_CONFIG_KEY, clean);
  } catch (err) {
    console.warn('[HierarchyService] Firestore cloud sync notice:', err);
  }

  return clean;
}

export async function getHierarchyMaster(): Promise<SoegiriCategory[]> {
  if (activeCategoriesCache) return activeCategoriesCache;

  // 1. Coba baca dari localStorage
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        activeCategoriesCache = parsed;
        setSoegiriMasterCategories(parsed);
        return parsed;
      }
    }
  } catch {}

  // 2. Coba baca dari Firestore jika di localStorage belum ada
  if (db) {
    try {
      const snap = await getDoc(doc(db, 'system_config', FIRESTORE_CONFIG_KEY));
      if (snap.exists()) {
        const val = snap.data()?.value;
        if (Array.isArray(val) && val.length > 0) {
          activeCategoriesCache = val;
          setSoegiriMasterCategories(val);
          safeSetLocalStorage(KEY, JSON.stringify(val));
          return val;
        }
      }
    } catch (err) {
      console.warn('[HierarchyService] Gagal mengambil hierarki dari Firestore:', err);
    }
  }

  const fallback = getDefaultSoegiriMasterCategories();
  activeCategoriesCache = fallback;
  setSoegiriMasterCategories(fallback);
  return fallback;
}
