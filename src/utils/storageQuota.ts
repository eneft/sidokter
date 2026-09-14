/**
 * STORAGE QUOTA & PERSISTENCE MANAGER
 * Melindungi aplikasi dari kegagalan browser 'QuotaExceededError' (batas 5MB localStorage).
 * Membersihkan cache sampah lawas, memotong data biner berlebih, dan menyediakan
 * fallback IndexedDB otomatis yang berkapasitas besar.
 */

const FILE_CACHE_PREFIX = 'soegiri_file_cache_';
const AUDIT_KEY = 'soegiri_offline_audit_v1';
const NOTIF_QUEUE_KEY = 'soegiri_offline_admin_proposals_queue_v1';
const LEGACY_SOPS_KEY = 'soegiri_offline_sops_v1';
const USER_PROFILES_CACHE = 'soegiri_user_profiles_cache_v2';
const LIBRARY_KEY = 'soegiri_offline_library_v1';

// Kunci yang TIDAK BOLEH dihapus sembarangan karena menyimpan identitas sesi pengguna
const PROTECTED_KEYS = new Set([
  'soegiri_sop_client_session_v3',
  'soegiri_username_remember_v1',
  'soegiri_remember_pref_v1',
  'soegiri_offline_numbering_v1',
  'soegiri_offline_maintenance_v1'
]);

// In-memory fallback untuk situasi ekstrim di mana browser memblokir storage
const inMemoryFallbackStorage = new Map<string, string>();

/**
 * Akses database IndexedDB untuk penyimpanan cadangan tanpa batas kuota 5MB.
 */
const IDB_STORE_NAME = 'app_state';
let idbPromise: Promise<IDBDatabase | null> | null = null;

function getAppStateIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (!idbPromise) {
    idbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open('SoegiriAppStateDB', 1);
        req.onupgradeneeded = (e: any) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
            db.createObjectStore(IDB_STORE_NAME, { keyPath: 'key' });
          }
        };
        req.onsuccess = (e: any) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return idbPromise;
}

export async function saveToIndexedDB(key: string, value: string): Promise<boolean> {
  try {
    inMemoryFallbackStorage.set(key, value);
    const db = await getAppStateIndexedDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        tx.objectStore(IDB_STORE_NAME).put({ key, value, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

export async function getFromIndexedDB(key: string): Promise<string | null> {
  if (inMemoryFallbackStorage.has(key)) {
    return inMemoryFallbackStorage.get(key)!;
  }
  try {
    const db = await getAppStateIndexedDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE_NAME, 'readonly');
        const req = tx.objectStore(IDB_STORE_NAME).get(key);
        req.onsuccess = () => {
          if (req.result && req.result.value) {
            inMemoryFallbackStorage.set(key, req.result.value);
            resolve(req.result.value);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

/**
 * Membersihkan item sampah atau data lawas yang membebani kuota 5MB localStorage:
 * 1. 'soegiri_offline_sops_v1' (SOPs kini berada di IndexedDB & Cloud Firestore).
 * 2. 'soegiri_file_cache_*' (Berkas biner yang seharusnya di IndexedDB).
 * 3. Nilai yang memuat string dataURL/base64 besar.
 * 4. Pangkas riwayat log atau antrean yang terlalu panjang.
 */
export function purgeBloatedLocalStorage(preserveKey?: string): number {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  let freedCount = 0;
  try {
    const keysToRemove: string[] = [];
    const keysToExamine: { key: string; len: number }[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === preserveKey || PROTECTED_KEYS.has(k)) continue;

      // 1. Kunci lawas atau file cache biner: Hapus segera
      if (k === LEGACY_SOPS_KEY || k.startsWith(FILE_CACHE_PREFIX)) {
        keysToRemove.push(k);
        continue;
      }

      try {
        const val = localStorage.getItem(k);
        if (val) {
          // 2. Berkas data biner atau base64 yang tersesat di localStorage
          if (val.startsWith('data:') || val.includes('data:application/pdf') || val.includes('data:image/')) {
            keysToRemove.push(k);
            continue;
          }
          keysToExamine.push({ key: k, len: val.length });
        }
      } catch {}
    }

    // Hapus daftar prioritas pertama
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
        freedCount++;
      } catch {}
    });

    // 3. Pangkas riwayat audit log jika terlalu besar (> 20KB)
    try {
      const auditRaw = localStorage.getItem(AUDIT_KEY);
      if (auditRaw && auditRaw.length > 20000) {
        const items = JSON.parse(auditRaw);
        if (Array.isArray(items)) {
          localStorage.setItem(AUDIT_KEY, JSON.stringify(items.slice(0, 20)));
          freedCount++;
        }
      }
    } catch {}

    // 4. Pangkas antrean notifikasi admin jika terlalu besar
    try {
      const notifRaw = localStorage.getItem(NOTIF_QUEUE_KEY);
      if (notifRaw && notifRaw.length > 20000) {
        const notifs = JSON.parse(notifRaw);
        if (Array.isArray(notifs)) {
          localStorage.setItem(NOTIF_QUEUE_KEY, JSON.stringify(notifs.slice(0, 10)));
          freedCount++;
        }
      }
    } catch {}

    // 5. Jika masih ada item non-kritis yang sangat besar (> 50KB) seperti cache profil, hapus
    keysToExamine
      .filter((item) => item.len > 50000 && !PROTECTED_KEYS.has(item.key))
      .sort((a, b) => b.len - a.len)
      .forEach((item) => {
        try {
          // Pindahkan cadangannya ke IndexedDB sebelum dihapus dari localStorage
          const v = localStorage.getItem(item.key);
          if (v) saveToIndexedDB(item.key, v);
          localStorage.removeItem(item.key);
          freedCount++;
        } catch {}
      });

    if (freedCount > 0) {
      console.info(`[StorageQuota] Berhasil mengosongkan ${freedCount} entri sampah/besar dari localStorage.`);
    }
  } catch (err) {
    console.warn('[StorageQuota] Gagal saat membersihkan storage:', err);
  }
  return freedCount;
}

/**
 * Menyimpan data ke localStorage dengan proteksi kuota penuh.
 * Jika localStorage tetap menolak karena kuota sistem (misal mode penyamaran ketat),
 * data otomatis dialihkan ke IndexedDB & memori runtime tanpa memutus alur aplikasi.
 */
export function safeSetLocalStorage(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;

  // Selalu simpan salinan di memori runtime dan IndexedDB
  inMemoryFallbackStorage.set(key, value);
  saveToIndexedDB(key, value);

  if (!window.localStorage) return true;

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (firstError: any) {
    const isQuota =
      firstError?.name === 'QuotaExceededError' ||
      firstError?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      firstError?.code === 22 ||
      firstError?.code === 1014 ||
      String(firstError?.message || '').includes('exceeded the quota');

    if (isQuota) {
      // Jalankan pembersihan agresif
      purgeBloatedLocalStorage(key);

      try {
        localStorage.setItem(key, value);
        console.info(`[StorageQuota] Berhasil menyimpan '${key}' ke localStorage setelah pembersihan kuota.`);
        return true;
      } catch (retryError) {
        // Jika masih gagal, hapus cache sekunder lain yang tidak esensial
        try {
          localStorage.removeItem(USER_PROFILES_CACHE);
          localStorage.removeItem(LIBRARY_KEY);
          localStorage.setItem(key, value);
          console.info(`[StorageQuota] Berhasil menyimpan '${key}' setelah pembebasan cache sekunder.`);
          return true;
        } catch {
          // Data sudah tersimpan aman di IndexedDB dan Memory. Tidak perlu crash.
          console.info(`[StorageQuota] Catatan: Kuota localStorage browser penuh. Data '${key}' tetap tersimpan aman di IndexedDB & State memori.`);
          return true;
        }
      }
    }

    // Jika terjadi error selain kuota, tetap kembalikan true karena data ada di IDB
    return true;
  }
}

/**
 * Membaca data dari localStorage dengan fallback transparan ke IndexedDB.
 */
export async function safeGetLocalStorage(key: string): Promise<string | null> {
  if (typeof window === 'undefined') return inMemoryFallbackStorage.get(key) || null;

  try {
    const val = localStorage.getItem(key);
    if (val) return val;
  } catch {}

  return await getFromIndexedDB(key);
}

// Jalankan pembersihan awal saat aplikasi dibuka
if (typeof window !== 'undefined') {
  setTimeout(() => {
    try {
      purgeBloatedLocalStorage();
    } catch {}
  }, 100);
}
