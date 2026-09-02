/**
 * Utility for handling file downloads safely in all browser environments (including iframes & sandboxes)
 * and managing local/IndexedDB persistent document caching for PDFs, scans, and attachments.
 */

// In-memory fallback map for instant synchronous access
const memoryCache = new Map<string, string>();

const DB_NAME = 'SopSoegiriFilesDB';
const DB_VERSION = 1;
const STORE_NAME = 'files';

function getIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = (e: any) => resolve(e.target.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// Convert a base64 data URL into a native Blob safely
export function dataUrlToBlob(dataUrl: string): Blob {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') {
      return new Blob([], { type: 'application/octet-stream' });
    }
    if (!dataUrl.startsWith('data:')) {
      return new Blob([dataUrl], { type: 'text/plain' });
    }
    const arr = dataUrl.split(',');
    if (arr.length < 2 || !arr[1]) {
      return new Blob([], { type: 'application/octet-stream' });
    }
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const isBase64 = arr[0].includes(';base64');

    if (isBase64) {
      const cleanBase64 = arr[1].replace(/\s/g, '');
      const bstr = atob(cleanBase64);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } else {
      const decoded = decodeURIComponent(arr[1]);
      return new Blob([decoded], { type: mime });
    }
  } catch (err) {
    console.warn('Error converting dataUrl to blob:', err);
    return new Blob([], { type: 'application/octet-stream' });
  }
}

/**
 * Triggers a direct browser file download from Data URL, Blob, or regular URL
 */
export function triggerFileDownload(urlOrDataUrl: string, fileName: string): boolean {
  if (!urlOrDataUrl) return false;

  try {
    let downloadUrl = urlOrDataUrl;
    let isObjectUrl = false;

    // Sanitize filename
    const safeFileName = (fileName || 'Dokumen_SPO.pdf')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, '_');

    if (urlOrDataUrl.startsWith('data:')) {
      const blob = dataUrlToBlob(urlOrDataUrl);
      downloadUrl = URL.createObjectURL(blob);
      isObjectUrl = true;
    }

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = downloadUrl;
    a.download = safeFileName;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      if (isObjectUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    }, 2000);

    return true;
  } catch (error) {
    console.error('File download error:', error);
    // Fallback: try opening in new window or directly creating link
    try {
      if (urlOrDataUrl.startsWith('data:')) {
        const blob = dataUrlToBlob(urlOrDataUrl);
        const blobUrl = URL.createObjectURL(blob);
        const win = window.open(blobUrl, '_blank');
        if (!win) {
          window.location.href = blobUrl;
        }
      } else {
        window.open(urlOrDataUrl, '_blank');
      }
      return true;
    } catch (e2) {
      console.error('Fallback open window error:', e2);
      return false;
    }
  }
}

/**
 * Safely handles document preview / download without triggering browser iframe blocks
 */
export function openDocumentPreview(urlOrDataUrl: string, title?: string): void {
  try {
    if (urlOrDataUrl.startsWith('data:')) {
      const blob = dataUrlToBlob(urlOrDataUrl);
      const blobUrl = URL.createObjectURL(blob);
      const newWin = window.open(blobUrl, '_blank');
      if (!newWin) {
        // Pop-up blocked or not allowed, trigger direct download
        triggerFileDownload(urlOrDataUrl, `${title || 'Dokumen_SPO'}.pdf`);
      }
    } else {
      window.open(urlOrDataUrl, '_blank');
    }
  } catch (e) {
    console.error('Open document error:', e);
    triggerFileDownload(urlOrDataUrl, `${title || 'Dokumen_SPO'}.pdf`);
  }
}

/**
 * Local cache storage for full-fidelity files (so files > 800KB remain accessible on device)
 * Uses IndexedDB with SessionStorage & Memory map fallbacks.
 */
const FILE_CACHE_PREFIX = 'sop_file_cache_';

export function saveFileToLocalCache(sopId: string, type: 'file' | 'oldFile' | 'signedScan', dataUrl: string): void {
  if (!sopId || !dataUrl) return;
  const key = `${FILE_CACHE_PREFIX}${sopId}_${type}`;
  
  // 1. In-memory
  memoryCache.set(key, dataUrl);

  // 2. SessionStorage
  try {
    sessionStorage.setItem(key, dataUrl);
  } catch {
    // SessionStorage quota exceeded, ignore
  }

  // 3. LocalStorage (if small enough)
  if (dataUrl.length < 500000) {
    try {
      localStorage.setItem(key, dataUrl);
    } catch {
      // LocalStorage quota exceeded, ignore
    }
  }

  // 4. IndexedDB (Persistent across refreshes & tabs for any file size)
  getIndexedDB().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ key, dataUrl, savedAt: Date.now() });
    } catch (e) {
      console.warn('IndexedDB write warning:', e);
    }
  });
}

export function getFileFromLocalCache(sopId: string, type: 'file' | 'oldFile' | 'signedScan'): string | null {
  if (!sopId) return null;
  const key = `${FILE_CACHE_PREFIX}${sopId}_${type}`;

  // 1. Check memory map
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }

  // 2. Check SessionStorage
  try {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession) {
      memoryCache.set(key, fromSession);
      return fromSession;
    }
  } catch {
    // ignore
  }

  // 3. Check LocalStorage
  try {
    const fromLocal = localStorage.getItem(key);
    if (fromLocal) {
      memoryCache.set(key, fromLocal);
      return fromLocal;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Asynchronously retrieve file from IndexedDB if not found in synchronous caches
 */
export async function getFileFromPersistentCacheAsync(sopId: string, type: 'file' | 'oldFile' | 'signedScan'): Promise<string | null> {
  const syncResult = getFileFromLocalCache(sopId, type);
  if (syncResult) return syncResult;

  const key = `${FILE_CACHE_PREFIX}${sopId}_${type}`;
  const db = await getIndexedDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.dataUrl) {
          memoryCache.set(key, req.result.dataUrl);
          resolve(req.result.dataUrl);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Deletes a document's cached files from all memory, storage, and IndexedDB layers
 */

/**
 * Returns all persisted document attachments from IndexedDB.
 * Used by the Admin backup feature so files larger than local database's
 * document limit are not silently omitted from a backup.
 */
export async function getAllCachedFiles(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const db = await getIndexedDB();
  if (!db) return result;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const rows = Array.isArray(request.result) ? request.result : [];
        rows.forEach((row: any) => {
          if (row?.key && row?.dataUrl) {
            result[row.key] = row.dataUrl;
          }
        });
        resolve(result);
      };
      request.onerror = () => resolve(result);
    } catch {
      resolve(result);
    }
  });
}

export function deleteFileFromLocalCache(sopId: string): void {
  if (!sopId) return;
  const keys = [
    `${FILE_CACHE_PREFIX}${sopId}_file`,
    `${FILE_CACHE_PREFIX}${sopId}_oldFile`
  ];

  keys.forEach((key) => {
    // 1. In-memory
    memoryCache.delete(key);
    // 2. SessionStorage
    try {
      sessionStorage.removeItem(key);
    } catch {}
    // 3. LocalStorage
    try {
      localStorage.removeItem(key);
    } catch {}
  });

  // 4. IndexedDB
  getIndexedDB().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      keys.forEach((k) => store.delete(k));
    } catch (e) {
      console.warn('IndexedDB delete warning:', e);
    }
  });
}

/**
 * Completely clears all cached file attachments
 */
export function clearAllFileLocalCache(): void {
  memoryCache.clear();
  try {
    Object.keys(sessionStorage).forEach((k) => {
      if (k.startsWith(FILE_CACHE_PREFIX)) sessionStorage.removeItem(k);
    });
  } catch {}
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(FILE_CACHE_PREFIX)) localStorage.removeItem(k);
    });
  } catch {}
  getIndexedDB().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
    } catch (e) {
      console.warn('IndexedDB clear warning:', e);
    }
  });
}

export async function saveNamedFileToLocalCache(keyName: string, dataUrl: string): Promise<void> {
  if (!keyName || !dataUrl) return;
  const key = `${FILE_CACHE_PREFIX}named_${keyName}`;
  memoryCache.set(key, dataUrl);
  try { localStorage.setItem(key, dataUrl); } catch {}
  const db = await getIndexedDB();
  if (!db) return;
  try { db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ key, dataUrl, savedAt: Date.now() }); } catch {}
}

export async function getNamedFileFromLocalCache(keyName: string): Promise<string | null> {
  const key = `${FILE_CACHE_PREFIX}named_${keyName}`;
  if (memoryCache.has(key)) return memoryCache.get(key)!;
  try { const local = localStorage.getItem(key); if (local) { memoryCache.set(key, local); return local; } } catch {}
  const db = await getIndexedDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try { const req = db.transaction(STORE_NAME,'readonly').objectStore(STORE_NAME).get(key); req.onsuccess=()=>{const value=req.result?.dataUrl||null; if(value) memoryCache.set(key,value); resolve(value);}; req.onerror=()=>resolve(null); } catch { resolve(null); }
  });
}

export async function deleteNamedFileFromLocalCache(keyName: string): Promise<void> {
  const key = `${FILE_CACHE_PREFIX}named_${keyName}`; memoryCache.delete(key); try { localStorage.removeItem(key); } catch {}
  const db = await getIndexedDB(); if (!db) return; try { db.transaction(STORE_NAME,'readwrite').objectStore(STORE_NAME).delete(key); } catch {}
}
