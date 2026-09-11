/**
 * SPO SERVICE
 * Service khusus dokumen SPO dan konfigurasi penomoran SPO.
 */
import { SopDocument, NumberingConfig, SopStatus } from '../types';
import { DEFAULT_NUMBERING_CONFIG, generateSopNumber } from '../utils/numbering';
import { saveSopToFirestore, deleteSopFromFirestore, saveSystemConfigToFirestore, subscribeToFirestoreSops, fetchSopsFromFirestore } from './firestoreService';
import { getUserHierarchyAccessKeys, isSopAccessibleByUser } from '../utils/soegiriStructure';
import { UserSession } from '../types';
import { uploadFileToCloudStorage } from './cloudStorageService';
import { getFileFromPersistentCacheAsync } from '../utils/fileStorage';

const KEYS = {
  sops: 'soegiri_offline_sops_v1',
  config: 'soegiri_offline_numbering_v1',
};

const IDB_NAME = 'SoegiriOfflineDB';
const IDB_VERSION = 2;
const IDB_SOPS_STORE = 'sops';
const IDB_NUMBER_RESERVATIONS_STORE = 'sopNumberReservations';

const subscribers = new Map<string, Set<() => void>>();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch { return fallback; }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
  subscribers.get(key)?.forEach((fn) => fn());
}

function watch(key: string, fn: () => void): () => void {
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key)!.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key === key) fn(); };
  window.addEventListener('storage', onStorage);
  return () => { subscribers.get(key)?.delete(fn); window.removeEventListener('storage', onStorage); };
}

/**
 * SPO documents are stored in IndexedDB, not localStorage.
 * This avoids the browser's small localStorage quota and allows SOP records
 * to contain PDF/blob/file data without serializing everything into JSON.
 */
function openSopDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia pada browser ini.'));
      return;
    }

    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_SOPS_STORE)) {
        db.createObjectStore(IDB_SOPS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IDB_NUMBER_RESERVATIONS_STORE)) {
        db.createObjectStore(IDB_NUMBER_RESERVATIONS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gagal membuka IndexedDB.'));
  });
}

function idbGetAllSops(): Promise<SopDocument[]> {
  return openSopDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_SOPS_STORE, 'readonly');
    const request = tx.objectStore(IDB_SOPS_STORE).getAll();
    request.onsuccess = () => resolve((request.result || []) as SopDocument[]);
    request.onerror = () => reject(request.error || new Error('Gagal membaca data SPO.'));
    tx.oncomplete = () => db.close();
  }));
}

function idbPutSops(sops: SopDocument[]): Promise<void> {
  return openSopDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_SOPS_STORE, 'readwrite');
    const store = tx.objectStore(IDB_SOPS_STORE);
    store.clear();
    for (const sop of sops) store.put(sop);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Gagal menyimpan data SPO.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Penyimpanan data SPO dibatalkan.')); };
  }));
}

function idbDeleteSop(id: string): Promise<void> {
  return openSopDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_SOPS_STORE, 'readwrite');
    tx.objectStore(IDB_SOPS_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Gagal menghapus SPO.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Penghapusan SPO dibatalkan.')); };
  }));
}

async function getSops(): Promise<SopDocument[]> {
  const stored = await idbGetAllSops();

  // Normal reads never hydrate SPO from localStorage. Firestore is the
  // authoritative source and IndexedDB is only its browser cache. Legacy
  // localStorage migration is intentionally handled only by explicit backup/
  // restore workflows, never during login or realtime synchronization.

  // Reservation nomor bukan dokumen SPO dan tidak boleh masuk ke daftar dokumen.
  return stored.filter((s) => !(s as any).isNumberReservation).map(normalizeSop);
}

function notifySopSubscribers(): void {
  subscribers.get(KEYS.sops)?.forEach((fn) => fn());
}

function normalizeSop(sop: SopDocument): SopDocument {
  // Canonical document statuses are only DRAFT, AKTIF and DIARSIPKAN.
  // Legacy values are normalized on read so old data remains compatible.
  const rawStatus = String((sop as any).status || '').trim().toUpperCase();
  let status: SopStatus;
  if (rawStatus === 'AKTIF') {
    status = 'AKTIF';
  } else if (rawStatus === 'TIDAK_AKTIF' || rawStatus === 'DIARSIPKAN') {
    status = 'DIARSIPKAN';
  } else {
    // MENUNGGU_PENGESAHAN, BELUM_UPLOAD, DRAFT and unknown legacy values
    // all mean the document has not yet been signed/activated.
    status = 'DRAFT';
  }
  return { ...sop, status };
}


function initFirestoreSopSync(userSession?: UserSession | null, onInitialSyncSettled?: (ok: boolean) => void): () => void {
  let active = true;
  if (!userSession) {
    return () => { active = false; };
  }
  const scopedKeys = getUserHierarchyAccessKeys(userSession);
  const hasAllHierarchyAssignment = Array.isArray(userSession?.assignments)
    ? userSession!.assignments!.some((a) => String(a?.divisionCode || '').trim().toUpperCase() === 'ALL')
    : Array.isArray(userSession?.divisionCodes)
      ? userSession!.divisionCodes!.some((code) => String(code || '').trim().toUpperCase() === 'ALL')
      : String(userSession?.divisionCode || '').trim().toUpperCase() === 'ALL';
  const globalAccess = userSession?.role === 'admin'
    || hasAllHierarchyAssignment;

  // Serialize cloud -> IndexedDB writes. Initial fetch and realtime snapshots can
  // arrive at nearly the same time; without a queue an older snapshot can finish
  // after a newer one and make a file reference appear/disappear intermittently.
  let cloudApplyQueue: Promise<void> = Promise.resolve();
  let cloudRevision = 0;

  const applyCloudSops = (cloudSops: SopDocument[]) => {
    const revision = ++cloudRevision;
    cloudApplyQueue = cloudApplyQueue.then(async () => {
      if (!active) return;
      if (!Array.isArray(cloudSops)) return;

      if (!active || revision < cloudRevision) return;

      // Firestore is authoritative. The scoped query already contains the
      // complete set this session is allowed to see, so replace the local
      // cache instead of merging stale browser-only records into it.
      // Firestore success is authoritative. Replace the browser cache with the
      // exact successful cloud snapshot. Never merge stale IndexedDB records
      // into cloud data and never preserve browser-only file binaries here.
      // A successful [] is intentionally allowed to clear the cache; read errors
      // never call this function because fetch/listener errors are propagated.
      const authoritative = cloudSops.map((s) => {
        const clean = { ...s } as any;
        delete clean.fileDataUrl;
        delete clean.signedScanDataUrl;
        delete clean.oldFileDataUrl;
        return normalizeSop(clean);
      });
      await idbPutSops(authoritative);
      if (active) notifySopSubscribers();
    }).catch((err) => {
      console.warn('[SPO sync] Failed applying cloud snapshot:', err);
    });
    return cloudApplyQueue;
  };

  void fetchSopsFromFirestore(scopedKeys, globalAccess)
    .then((cloudSops) => applyCloudSops(cloudSops).then(() => onInitialSyncSettled?.(true)))
    .catch((err) => {
      // A failed cloud read is NOT an empty dataset. Keep the local cache for
      // offline continuity, but explicitly mark the initial cloud sync as failed.
      console.info('Firestore initial SOP sync unavailable; local cache fallback allowed:', err?.message || err);
      onInitialSyncSettled?.(false);
    });

  const unsubscribe = subscribeToFirestoreSops((cloudSops) => {
    void applyCloudSops(cloudSops).then(() => onInitialSyncSettled?.(true));
  }, (err) => {
    // Graceful offline fallback: local IndexedDB cache is shown only after the
    // cloud sync has explicitly failed. Never infer failure from an empty set.
    console.info('Firestore realtime sync notice (local cache fallback):', err?.message || err);
    onInitialSyncSettled?.(false);
  }, scopedKeys, globalAccess);

  return () => { active = false; unsubscribe(); };
}

export function subscribeToSops(onData: (sops: SopDocument[]) => void, onError?: (err: any) => void, divisionCodes?: string | string[], userSession?: UserSession | null) {
  let initialCloudSyncSettled = !userSession;
  let disposed = false;

  const emit = async (force = false) => {
    if (disposed || (!initialCloudSyncSettled && !force)) return;
    try {
      const normalized = Array.from(new Set((Array.isArray(divisionCodes) ? divisionCodes : [divisionCodes]).filter(Boolean).map(String)));
      const effective = normalized.filter((c) => c.toUpperCase() !== 'ALL').map((c) => c.toUpperCase());
      let sops = await getSops();
      if (userSession) sops = sops.filter((s) => isSopAccessibleByUser(s, userSession));
      if (effective.length) sops = sops.filter((s) => effective.includes(String(s.divisionCode || '').toUpperCase()));
      sops.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      onData(sops);
    } catch (e) { onError?.(e); }
  };

  const stopFirestoreSync = initFirestoreSopSync(userSession, (ok) => {
    if (disposed) return;

    if (!ok) {
      console.warn('[SPO] Cloud sync unavailable or offline; using local database cache.');
    }

    initialCloudSyncSettled = true;
    // Emit authoritative snapshot from IndexedDB (updated if cloud succeeded, or cached if offline/unreachable)
    void emit();
  });

  const listener = () => { void emit(); };
  if (!subscribers.has(KEYS.sops)) subscribers.set(KEYS.sops, new Set());
  subscribers.get(KEYS.sops)!.add(listener);

  // Emit local cache immediately so the user never sees a blank screen or broken UI
  void emit(true);

  return () => {
    disposed = true;
    subscribers.get(KEYS.sops)?.delete(listener);
    stopFirestoreSync();
  };
}

export async function getAllSopsFromLocal(): Promise<SopDocument[]> { return getSops(); }

/**
 * Helper to identify Word (.docx / .doc) binaries and DataURLs.
 * Dokumen Word (.docx) pada input SPO hanya digunakan untuk ekstraksi data (parsing teks naskah),
 * BUKAN untuk disimpan atau diunggah sebagai file biner ke Cloud Storage.
 */
function isDocxBinaryData(dataUrl?: string, fileName?: string, fileType?: string): boolean {
  if (fileName && (fileName.toLowerCase().endsWith('.docx') || fileName.toLowerCase().endsWith('.doc'))) return true;
  if (fileType && (fileType.toLowerCase().includes('wordprocessingml') || fileType.toLowerCase().includes('msword') || fileType.toLowerCase().includes('officedocument'))) return true;
  if (dataUrl && (
    dataUrl.startsWith('data:application/vnd.openxmlformats-officedocument') ||
    dataUrl.startsWith('data:application/msword') ||
    dataUrl.startsWith('data:application/x-msword') ||
    dataUrl.startsWith('data:application/x-zip-compressed')
  )) return true;
  return false;
}

export async function saveSopToLocal(sop: SopDocument): Promise<void> {
  if ((sop as any).isNumberReservation) return;
  const all = await getSops();
  const next = normalizeSop(sop);

  // Aturan Rumah Sakit: File .docx hanya untuk ekstraksi data naskah SPO (Pengertian, Tujuan,
  // Kebijakan, Prosedur, Alur, Unit Terkait), bukan untuk disimpan ke Cloud Storage.
  // Jika terdapat fileDataUrl berupa docx, bersihkan agar tidak dikirim ke endpoint storage.
  if (isDocxBinaryData(next.fileDataUrl, next.fileName, next.fileType)) {
    delete next.fileDataUrl;
    if (next.fileName && (next.fileName.toLowerCase().endsWith('.docx') || next.fileName.toLowerCase().endsWith('.doc'))) {
      next.fileName = `${next.sopNumber || next.id}.pdf`;
      next.fileType = 'application/pdf';
    }
  }
  if (isDocxBinaryData(next.signedScanDataUrl, next.signedScanFileName, next.signedScanFileType)) {
    delete next.signedScanDataUrl;
    if (next.signedScanFileName && (next.signedScanFileName.toLowerCase().endsWith('.docx') || next.signedScanFileName.toLowerCase().endsWith('.doc'))) {
      next.signedScanFileName = `${next.sopNumber || next.id}_scan.pdf`;
      next.signedScanFileType = 'application/pdf';
    }
  }
  if (isDocxBinaryData(next.oldFileDataUrl, next.oldFileName, next.oldFileType)) {
    delete next.oldFileDataUrl;
  }

  // IMPORTANT: file upload is part of the authoritative save. The old code
  // started uploads in the background and immediately wrote Firestore, so the
  // document could be published without fileUrl. That made it work only on the
  // browser that still had the local cache.
  const uploadTasks: Promise<void>[] = [];

  if (next.fileDataUrl?.startsWith('data:') && !next.fileUrl) {
    uploadTasks.push(
      uploadFileToCloudStorage(next.fileDataUrl, `${next.sopNumber || next.id}.pdf`, `${next.id}_file`)
        .then((res) => { next.fileUrl = res.url; next.storagePath = res.storagePath; })
    );
  }
  if (next.signedScanDataUrl?.startsWith('data:') && !next.signedScanUrl) {
    uploadTasks.push(
      uploadFileToCloudStorage(next.signedScanDataUrl, `${next.sopNumber || next.id}_scan.pdf`, `${next.id}_signedScan`)
        .then((res) => { next.signedScanUrl = res.url; next.signedScanStoragePath = res.storagePath; })
    );
  }
  if (next.oldFileDataUrl?.startsWith('data:') && !next.oldFileUrl) {
    uploadTasks.push(
      uploadFileToCloudStorage(next.oldFileDataUrl, `${next.sopNumber || next.id}_legacy.pdf`, `${next.id}_oldFile`)
        .then((res) => { next.oldFileUrl = res.url; next.oldStoragePath = res.storagePath; })
    );
  }

  if (uploadTasks.length) {
    try {
      await Promise.all(uploadTasks);
    } catch (err) {
      // Never publish a SPO whose binary failed to reach Firebase Cloud Storage.
      throw new Error(`File SPO gagal disimpan ke Firebase Cloud Storage: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // IMPORTANT: once Firebase Storage has the binary, remove the DataURL from the
  // authoritative/cached SOP record. The binary must never be required from a
  // browser-local copy for normal operation. The upload service may retain an
  // optional browser cache, but it is not part of the SOP source of truth.
  if (next.fileUrl) delete next.fileDataUrl;
  if (next.signedScanUrl) delete next.signedScanDataUrl;
  if (next.oldFileUrl) delete next.oldFileDataUrl;

  const index = all.findIndex((s) => s.id === next.id);
  const previous = index >= 0 ? all[index] : undefined;
  if (index >= 0) all[index] = next; else all.push(next);

  // Persist to Firestore first. IndexedDB is a local cache, not the source of
  // truth for a cross-device document. If the authoritative save fails, roll
  // back the local cache so the UI cannot report a successful save that only
  // exists on this browser.
  try {
    await saveSopToFirestore(next, { throwOnError: true });
  } catch (err) {
    const rollback = all.filter((s) => s.id !== next.id);
    if (previous) rollback.push(previous);
    await idbPutSops(rollback);
    notifySopSubscribers();
    throw err;
  }

  await idbPutSops(all);
  notifySopSubscribers();
}

/**
 * Repairs legacy SPO records that contain a local DataURL but have no durable
 * storage URL. This is intentionally best-effort: if the original binary is
 * no longer present in the current browser, the record is left untouched and
 * can be flagged for manual re-upload rather than fabricating a file.
 */
export async function repairSopFileReferences(sop: SopDocument): Promise<SopDocument> {
  const next = normalizeSop(sop);

  // Legacy records may only have the binary in this browser's IndexedDB cache.
  // Recover that binary before deciding that a durable reference is missing.
  const candidates: Array<{ dataKey: 'fileDataUrl' | 'signedScanDataUrl' | 'oldFileDataUrl'; urlKey: 'fileUrl' | 'signedScanUrl' | 'oldFileUrl'; type: 'file' | 'signedScan' | 'oldFile'; suffix: string }> = [
    { dataKey: 'fileDataUrl', urlKey: 'fileUrl', type: 'file', suffix: '.pdf' },
    { dataKey: 'signedScanDataUrl', urlKey: 'signedScanUrl', type: 'signedScan', suffix: '_scan.pdf' },
    { dataKey: 'oldFileDataUrl', urlKey: 'oldFileUrl', type: 'oldFile', suffix: '_legacy.pdf' },
  ];

  for (const c of candidates) {
    if ((next as any)[c.urlKey]) continue;
    let data = (next as any)[c.dataKey];
    if (!(typeof data === 'string' && data.startsWith('data:'))) {
      try {
        data = await getFileFromPersistentCacheAsync(next.id, c.type);
      } catch {
        data = null;
      }
    }
    if (typeof data === 'string' && data.startsWith('data:')) {
      if (isDocxBinaryData(data, (next as any)[c.urlKey === 'fileUrl' ? 'fileName' : 'signedScanFileName'], (next as any)[c.urlKey === 'fileUrl' ? 'fileType' : 'signedScanFileType'])) {
        // File docx tidak diunggah ke storage
        delete (next as any)[c.dataKey];
        continue;
      }
      (next as any)[c.dataKey] = data;
      const result = await uploadFileToCloudStorage(
        data,
        `${next.sopNumber || next.id}${c.suffix}`,
        `${next.id}_${c.type}`
      );
      (next as any)[c.urlKey] = result.url;
      const pathKey = c.urlKey === 'fileUrl' ? 'storagePath' : c.urlKey === 'signedScanUrl' ? 'signedScanStoragePath' : 'oldStoragePath';
      (next as any)[pathKey] = result.storagePath;
      delete (next as any)[c.dataKey];
    }
  }

  const hasDurableBinary =
    Boolean((next as any).fileUrl) ||
    Boolean((next as any).signedScanUrl) ||
    Boolean((next as any).oldFileUrl);

  if (hasDurableBinary) {
    await saveSopToFirestore(next, { throwOnError: true });
  }
  return next;
}

export async function restoreSopsToLocal(sops: SopDocument[]): Promise<void> {
  const normalized = sops.filter((s) => !(s as any).isNumberReservation).map(normalizeSop);
  await idbPutSops(normalized);
  notifySopSubscribers();
}

export async function bulkUpdateSops(sops: SopDocument[], changedIds?: string[]): Promise<void> {
  const normalized = sops.filter((s) => !(s as any).isNumberReservation).map(normalizeSop);
  await idbPutSops(normalized);
  notifySopSubscribers();
  // Firestore is authoritative. Callers that intentionally change SPOs must
  // use saveSopToLocal(), which uploads binaries and commits metadata first.
  // Never push an arbitrary local cache snapshot back to Firestore here.
}

export async function deleteSopFromLocal(id: string): Promise<void> {
  // Cloud/Firestore deletion is authoritative. Do not remove the local cache
  // first and then fire-and-forget the cloud delete; that can make one browser
  // appear deleted while another browser still sees the document.
  await deleteSopFromFirestore(id);
  await idbDeleteSop(id);
  notifySopSubscribers();
}

export async function deleteAllSops(): Promise<number> {
  const all = await getSops();
  await idbPutSops([]);
  notifySopSubscribers();
  return all.length;
}

export async function deleteAllDummySops(): Promise<number> {
  const all = await getSops();
  const kept = all.filter((s) => !s.isExampleOnly);
  const removed = all.length - kept.length;
  await idbPutSops(kept);
  notifySopSubscribers();
  return removed;
}

export function subscribeToNumberingConfig(onData: (config: NumberingConfig) => void, onError?: (err: any) => void) {
  const emit = () => { try { onData(read(KEYS.config, DEFAULT_NUMBERING_CONFIG)); } catch (e) { onError?.(e); } };
  emit(); return watch(KEYS.config, emit);
}
export async function saveConfigToLocal(config: NumberingConfig): Promise<void> {
  write(KEYS.config, config);
  void saveSystemConfigToFirestore('numbering', config);
}

export interface SopNumberReservation {
  id: string;
  divisionCode: string;
  subHierarchyCode: string;
  sequenceNumber: number;
  sopNumber: string;
  year: string;
  title?: string;
  effectiveDate?: string;
  reservedBy: string;
  reservedAt: string;
  status: 'RESERVED' | 'USED';
  purpose?: 'EXISTING_REPLACE_ONLY' | 'SYSTEM_DOCUMENT' | string;
  usedAt?: string;
  usedDocumentId?: string;
}

/**
 * Atomically reserves the next official SPO number. The reservation store is
 * in the same IndexedDB database as SOPs, so two browser tabs cannot reserve
 * the same unit/year/sequence at the same time. Reservations are permanent
 * number consumption: an unused number is never silently reused.
 */
export async function reserveNextSopNumber(params: {
  config: NumberingConfig;
  divisionCode: string;
  subHierarchyCode?: string;
  dateStr?: string;
  title?: string;
  reservedBy: string;
  purpose?: 'EXISTING_REPLACE_ONLY' | 'SYSTEM_DOCUMENT' | string;
}): Promise<SopNumberReservation> {
  const { config, divisionCode, subHierarchyCode = '', dateStr, reservedBy } = params;
  const cleanDiv = (divisionCode || 'PEL').trim().toUpperCase();
  const cleanSub = (subHierarchyCode || '').trim();
  const year = dateStr ? new Date(dateStr).getFullYear().toString() : new Date().getFullYear().toString();

  const db = await openSopDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IDB_SOPS_STORE, IDB_NUMBER_RESERVATIONS_STORE], 'readwrite');
    const sopStore = tx.objectStore(IDB_SOPS_STORE);
    const reservationStore = tx.objectStore(IDB_NUMBER_RESERVATIONS_STORE);

    let sops: SopDocument[] = [];
    let reservations: SopNumberReservation[] = [];
    let result: SopNumberReservation | null = null;

    const sopRequest = sopStore.getAll();
    sopRequest.onsuccess = () => {
      sops = (sopRequest.result || []) as SopDocument[];
      const reservationRequest = reservationStore.getAll();
      reservationRequest.onsuccess = () => {
        reservations = (reservationRequest.result || []) as SopNumberReservation[];

        const used = new Set<number>();
        for (const sop of sops) {
          if (sop.isLegacySop || sop.documentType === 'LAMA') continue;
          const sopYear = sop.sopNumber ? String(sop.sopNumber).match(/\/(\d{4})\s*$/)?.[1] : undefined;
          const effectiveYear = sopYear || (sop.effectiveDate || '').slice(0, 4);
          if (String(sop.divisionCode || '').trim().toUpperCase() !== cleanDiv || effectiveYear !== year) continue;
          if (String(sop.subHierarchyCode || '').trim() !== cleanSub) continue;
          if (typeof sop.sequenceNumber === 'number' && sop.sequenceNumber > 0) used.add(sop.sequenceNumber);
        }
        for (const reservation of reservations) {
          if (reservation.divisionCode === cleanDiv && reservation.subHierarchyCode === cleanSub && reservation.year === year) {
            used.add(reservation.sequenceNumber);
          }
        }

        let sequenceNumber = 1;
        while (used.has(sequenceNumber)) sequenceNumber++;

        const generated = generateSopNumber({
          config,
          divisionCode: cleanDiv,
          subHierarchyCode: cleanSub || undefined,
          dateStr: dateStr || `${year}-01-01`,
          sequenceNum: sequenceNumber
        });

        result = {
          id: `sop-number-${year}-${cleanDiv}-${cleanSub || 'ROOT'}-${sequenceNumber}`,
          divisionCode: cleanDiv,
          subHierarchyCode: cleanSub,
          sequenceNumber,
          sopNumber: generated.sopNumber,
          year,
          title: params.title?.trim() || undefined,
          effectiveDate: dateStr || `${year}-01-01`,
          reservedBy,
          reservedAt: new Date().toISOString(),
          status: 'RESERVED',
          purpose: params.purpose || 'SYSTEM_DOCUMENT'
        };
        reservationStore.add(result);
      };
      reservationRequest.onerror = () => {
        try { db.close(); } catch {}
        reject(reservationRequest.error || new Error('Gagal membaca register nomor SPO.'));
      };
    };
    sopRequest.onerror = () => {
      try { db.close(); } catch {}
      reject(sopRequest.error || new Error('Gagal membaca data SPO.'));
    };

    tx.oncomplete = () => {
      try { db.close(); } catch {}
      if (result) resolve(result);
      else reject(new Error('Nomor SPO gagal dialokasikan.'));
    };
    tx.onerror = () => {
      try { db.close(); } catch {}
      reject(tx.error || new Error('Gagal menyimpan nomor SPO.'));
    };
    tx.onabort = () => {
      try { db.close(); } catch {}
      reject(tx.error || new Error('Penerbitan nomor SPO dibatalkan.'));
    };
  });
}

export async function getAllNumberReservations(): Promise<SopNumberReservation[]> {
  const db = await openSopDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_NUMBER_RESERVATIONS_STORE, 'readonly');
    const request = tx.objectStore(IDB_NUMBER_RESERVATIONS_STORE).getAll();
    request.onsuccess = () => resolve((request.result || []).map((r: any) => ({ ...r, status: r.status === 'USED' ? 'USED' : 'RESERVED' })) as SopNumberReservation[]);
    request.onerror = () => reject(request.error || new Error('Gagal membaca register reservation nomor SPO.'));
    tx.oncomplete = () => db.close();
  });
}

export async function findNumberReservationBySopNumber(sopNumber: string): Promise<SopNumberReservation | undefined> {
  const target = String(sopNumber || '').trim().replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').toUpperCase();
  if (!target) return undefined;
  const reservations = await getAllNumberReservations();
  return reservations.find((r) => r.status === 'RESERVED' && (r.purpose === 'EXISTING_REPLACE_ONLY' || !r.purpose) && String(r.sopNumber || '').trim().replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').toUpperCase() === target);
}

export async function consumeNumberReservation(id: string, usedDocumentId?: string): Promise<void> {
  if (!id) return;
  const db = await openSopDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_NUMBER_RESERVATIONS_STORE, 'readwrite');
    const store = tx.objectStore(IDB_NUMBER_RESERVATIONS_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result as SopNumberReservation | undefined;
      if (!current) return;
      store.put({ ...current, status: 'USED', usedAt: new Date().toISOString(), usedDocumentId: usedDocumentId || current.usedDocumentId });
    };
    request.onerror = () => reject(request.error || new Error('Gagal membaca reservation nomor SPO.'));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Gagal mengubah reservation menjadi nomor terpakai.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Konsumsi reservation nomor dibatalkan.')); };
  });
}


export async function restoreNumberReservations(reservations: SopNumberReservation[]): Promise<void> {
  const db = await openSopDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_NUMBER_RESERVATIONS_STORE, 'readwrite');
    const store = tx.objectStore(IDB_NUMBER_RESERVATIONS_STORE);
    store.clear();
    for (const reservation of reservations || []) store.put(reservation);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Gagal memulihkan register reservation nomor SPO.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Pemulihan reservation nomor dibatalkan.')); };
  });
}

export async function registerSopAndNumberingToLocal(sop: SopDocument, config: NumberingConfig): Promise<void> {
  await saveSopToLocal(sop); await saveConfigToLocal(config);
}
