/**
 * SPO SERVICE
 * Service khusus dokumen SPO dan konfigurasi penomoran SPO.
 */
import { SopDocument, NumberingConfig, SopStatus, SopNumberReservation } from '../types';
import { DEFAULT_NUMBERING_CONFIG, generateSopNumber } from '../utils/numbering';
import { saveSopToFirestore, updateExistingSopInFirestore, deleteSopFromFirestore, saveSystemConfigToFirestore, subscribeToFirestoreSops, fetchSopsFromFirestore, reserveNextSopNumberInFirestore, fetchSopNumberReservationsFromFirestore, consumeSopNumberReservationInFirestore, restoreSopNumberReservationsToFirestore } from './firestoreService';
import { getUserHierarchyAccessKeys, isSopAccessibleByUser } from '../utils/soegiriStructure';
import { UserSession } from '../types';
import { uploadFileToCloudStorage } from './cloudStorageService';
import { validateSupportingEvidence } from '../utils/supportingEvidence';
import { getFileFromPersistentCacheAsync, saveFileToLocalCache } from '../utils/fileStorage';

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
  // Only the actual Admin role may subscribe to archived records. An ALL
  // hierarchy assignment broadens hierarchy scope, not lifecycle visibility.
  const globalAccess = userSession?.role === 'admin';

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

export async function saveSopToLocal(sop: SopDocument, options?: { allocateOfficialNumber?: NumberingConfig; editActor?: UserSession; reservationId?: string }): Promise<SopDocument> {
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

  // New Riviu submissions are required to carry this array at the App boundary.
  // Do not make unrelated saves of historical Riviu records fail solely because
  // those records predate the supportingEvidence schema.
  if ((next.jenis_spo === 'RIVIU' || next.documentType === 'RIVIU' || next.documentType === 'REVIEW' || next.isReviewDocument)
      && next.supportingEvidence !== undefined) {
    validateSupportingEvidence(next.supportingEvidence);
    for (const evidence of next.supportingEvidence || []) {
      if (!evidence.dataUrl) continue;
      const result = await uploadFileToCloudStorage(
        evidence.dataUrl,
        evidence.originalName,
        `${next.id}_evidence_${evidence.id}`,
        'SPO'
      );
      evidence.fileUrl = result.url;
      evidence.storagePath = result.storagePath;
      delete evidence.dataUrl;
    }
    validateSupportingEvidence(next.supportingEvidence);
  }

  // IMPORTANT: file upload is part of the authoritative save. The old code
  // started uploads in the background and immediately wrote Firestore, so the
  // document could be published without fileUrl. That made it work only on the
  // browser that still had the local cache.
  const uploadTasks: Promise<void>[] = [];

  if (next.fileDataUrl?.startsWith('data:')) {
    saveFileToLocalCache(next.id, 'file', next.fileDataUrl);
    uploadTasks.push(
      uploadFileToCloudStorage(next.fileDataUrl, `${next.sopNumber || next.id}.pdf`, `${next.id}_file`)
        .then((res) => { next.fileUrl = res.url; next.storagePath = res.storagePath; })
    );
  }
  if (next.signedScanDataUrl?.startsWith('data:')) {
    saveFileToLocalCache(next.id, 'signedScan', next.signedScanDataUrl);
    uploadTasks.push(
      uploadFileToCloudStorage(next.signedScanDataUrl, `${next.sopNumber || next.id}_scan.pdf`, `${next.id}_signedScan`)
        .then((res) => { next.signedScanUrl = res.url; next.signedScanStoragePath = res.storagePath; })
    );
  }
  if (next.oldFileDataUrl?.startsWith('data:')) {
    saveFileToLocalCache(next.id, 'oldFile', next.oldFileDataUrl);
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

  // Activation preparation is asset-only. The DRAFT -> AKTIF lifecycle and
  // activation metadata are committed by the trusted sop-activate transaction.
  // Do not perform a separate sop-edit/Firestore write here: that extra boundary
  // can fail independently and must never block an otherwise valid activation.
  const isActivationPreparation = Boolean(
    options?.editActor &&
    next.status === 'DRAFT' &&
    next.activatedAt &&
    (next.activatedBy || next.activationNotes)
  );
  if (isActivationPreparation) {
    return next;
  }

  const index = all.findIndex((s) => s.id === next.id);
  const previous = index >= 0 ? all[index] : undefined;
  if (index >= 0) all[index] = next; else all.push(next);

  // Persist to Firestore first. IndexedDB is a local cache, not the source of
  // truth for a cross-device document. If the authoritative save fails, roll
  // back the local cache so the UI cannot report a successful save that only
  // exists on this browser.
  try {
    const saved = options?.editActor
      ? await updateExistingSopInFirestore(next, options.editActor, previous?.sopNumber)
      : await saveSopToFirestore(next, { throwOnError: true, allocateOfficialNumber: options?.allocateOfficialNumber, reservationId: options?.reservationId });
    Object.assign(next, saved);
  } catch (err) {
    const rollback = all.filter((s) => s.id !== next.id);
    if (previous) rollback.push(previous);
    await idbPutSops(rollback);
    notifySopSubscribers();
    throw err;
  }

  await idbPutSops(all);
  notifySopSubscribers();
  return next;
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

export async function deleteSopFromLocal(id: string): Promise<'DELETED' | 'ARCHIVED'> {
  // Cloud/Firestore deletion is authoritative. Do not remove the local cache
  // first and then fire-and-forget the cloud delete; that can make one browser
  // appear deleted while another browser still sees the document.
  const result = await deleteSopFromFirestore(id);
  if (result === 'DELETED') await idbDeleteSop(id);
  notifySopSubscribers();
  return result;
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

export type { SopNumberReservation } from '../types';

/** Nomor Terbit is cloud-authoritative and shares the Firestore sequence ledger
 * with SPO Baru/Riviu. IndexedDB is no longer an allocator. */
export async function reserveNextSopNumber(params: {
  config: NumberingConfig;
  divisionCode: string;
  subHierarchyCode?: string;
  dateStr?: string;
  title?: string;
  reservedBy: string;
  purpose?: 'EXISTING_REPLACE_ONLY' | 'SYSTEM_DOCUMENT' | string;
}): Promise<SopNumberReservation> {
  return reserveNextSopNumberInFirestore(params);
}

async function getLegacyLocalNumberReservations(): Promise<SopNumberReservation[]> {
  const db = await openSopDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_NUMBER_RESERVATIONS_STORE, 'readonly');
    const request = tx.objectStore(IDB_NUMBER_RESERVATIONS_STORE).getAll();
    request.onsuccess = () => resolve((request.result || []) as SopNumberReservation[]);
    request.onerror = () => reject(request.error || new Error('Gagal membaca register nomor lokal lama.'));
    tx.oncomplete = () => db.close();
  });
}

async function clearLegacyLocalNumberReservations(): Promise<void> {
  const db = await openSopDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_NUMBER_RESERVATIONS_STORE, 'readwrite');
    tx.objectStore(IDB_NUMBER_RESERVATIONS_STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Gagal membersihkan register nomor lokal lama.')); };
  });
}

export async function getAllNumberReservations(): Promise<SopNumberReservation[]> {
  let cloud = await fetchSopNumberReservationsFromFirestore();
  const legacy = await getLegacyLocalNumberReservations().catch(() => [] as SopNumberReservation[]);
  if (legacy.length) {
    // One-time migration from the old per-browser register. The cloud restore
    // reconciles each slot against authoritative SOPs before accepting it.
    // If this account cannot migrate, keep the local copy intact for an Admin.
    try {
      await restoreSopNumberReservationsToFirestore(legacy);
      await clearLegacyLocalNumberReservations();
      cloud = await fetchSopNumberReservationsFromFirestore();
    } catch (error) {
      console.warn('[SPO numbering] Legacy reservation migration deferred:', error);
    }
  }
  return cloud;
}

export async function findNumberReservationBySopNumber(sopNumber: string): Promise<SopNumberReservation | undefined> {
  const target = String(sopNumber || '').trim().replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').toUpperCase();
  if (!target) return undefined;
  const reservations = await getAllNumberReservations();
  return reservations.find((r) => r.status === 'RESERVED' && (r.purpose === 'EXISTING_REPLACE_ONLY' || !r.purpose) && String(r.sopNumber || '').trim().replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').toUpperCase() === target);
}

export async function consumeNumberReservation(id: string, usedDocumentId?: string): Promise<void> {
  return consumeSopNumberReservationInFirestore(id, usedDocumentId);
}

export async function restoreNumberReservations(reservations: SopNumberReservation[]): Promise<void> {
  return restoreSopNumberReservationsToFirestore(reservations);
}


export async function registerSopAndNumberingToLocal(sop: SopDocument, config: NumberingConfig): Promise<SopDocument> {
  const saved = await saveSopToLocal(sop, { allocateOfficialNumber: config });
  const unitKey = `${saved.divisionCode}${saved.subHierarchyCode ? `:${saved.subHierarchyCode}` : ''}`;
  const nextConfig = {
    ...config,
    currentCounter: Math.max(config.currentCounter || 0, saved.sequenceNumber || 0),
    divisionCounters: {
      ...(config.divisionCounters || {}),
      [unitKey]: Math.max(config.divisionCounters?.[unitKey] || 0, saved.sequenceNumber || 0),
    },
  };
  await saveConfigToLocal(nextConfig);
  return saved;
}
