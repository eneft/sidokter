/**
 * STORAGE QUOTA MANAGER
 * Melindungi aplikasi dari kegagalan browser 'QuotaExceededError' (batas 5MB localStorage).
 * Membersihkan cache file biner/base64 lawas dan memprioritaskan IndexedDB.
 */

const FILE_CACHE_PREFIX = 'soegiri_file_cache_';
const AUDIT_KEY = 'soegiri_offline_audit_v1';
const NOTIF_QUEUE_KEY = 'soegiri_offline_admin_proposals_queue_v1';

/**
 * Membersihkan item berukuran besar yang tidak seharusnya ada di localStorage
 * (seperti dataUrl PDF/gambar berkas yang sudah aman disimpan di IndexedDB).
 */
export function purgeBloatedLocalStorage(): number {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  let freedCount = 0;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // 1. Bersihkan semua cache berkas biner/PDF (seharusnya hanya di IndexedDB)
      if (key.startsWith(FILE_CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
        freedCount++;
      } catch {}
    });

    // 2. Pangkas riwayat audit log jika terlalu besar
    try {
      const auditRaw = localStorage.getItem(AUDIT_KEY);
      if (auditRaw && auditRaw.length > 50000) {
        const auditItems = JSON.parse(auditRaw);
        if (Array.isArray(auditItems) && auditItems.length > 50) {
          localStorage.setItem(AUDIT_KEY, JSON.stringify(auditItems.slice(0, 50)));
          freedCount++;
        }
      }
    } catch {}

    // 3. Pangkas antrean notifikasi berlebih
    try {
      const notifRaw = localStorage.getItem(NOTIF_QUEUE_KEY);
      if (notifRaw && notifRaw.length > 50000) {
        const notifs = JSON.parse(notifRaw);
        if (Array.isArray(notifs) && notifs.length > 20) {
          localStorage.setItem(NOTIF_QUEUE_KEY, JSON.stringify(notifs.slice(0, 20)));
          freedCount++;
        }
      }
    } catch {}

    if (freedCount > 0) {
      console.info(`[StorageQuota] Berhasil mengosongkan ${freedCount} entri besar dari localStorage.`);
    }
  } catch (err) {
    console.warn('[StorageQuota] Gagal saat membersihkan storage:', err);
  }
  return freedCount;
}

/**
 * Menyimpan data ke localStorage dengan aman.
 * Jika kuota penuh (QuotaExceededError), otomatis membersihkan sampah cache dan mencoba ulang.
 */
export function safeSetLocalStorage(key: string, value: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (firstError: any) {
    // Deteksi apakah kesalahan karena kuota habis
    const isQuotaExceeded =
      firstError?.name === 'QuotaExceededError' ||
      firstError?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      firstError?.code === 22 ||
      firstError?.code === 1014 ||
      String(firstError?.message || '').includes('exceeded the quota');

    if (isQuotaExceeded) {
      console.warn(`[StorageQuota] Kuota localStorage terlampaui saat menulis '${key}'. Menjalankan pembersihan otomatis...`);
      purgeBloatedLocalStorage();

      try {
        localStorage.setItem(key, value);
        console.info(`[StorageQuota] Berhasil menyimpan '${key}' setelah pembersihan otomatis.`);
        return true;
      } catch (retryError) {
        console.error(`[StorageQuota] Tetap gagal menyimpan '${key}' ke localStorage setelah pembersihan:`, retryError);
        return false;
      }
    }

    console.warn(`[StorageQuota] Kesalahan tidak terduga pada localStorage.setItem('${key}'):`, firstError);
    return false;
  }
}

// Jalankan pembersihan otomatis saat pertama kali diimpor di browser
if (typeof window !== 'undefined') {
  setTimeout(() => {
    purgeBloatedLocalStorage();
  }, 100);
}
