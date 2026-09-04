/**
 * SPO SERVICE
 * Service khusus dokumen SPO dan konfigurasi penomoran SPO.
 */
import { SopDocument, NumberingConfig, SopStatus } from '../types';
import { DEFAULT_NUMBERING_CONFIG, generateSopNumber } from '../utils/numbering';
import { saveSopToFirestore, deleteSopFromFirestore, saveSystemConfigToFirestore, subscribeToFirestoreSops, fetchSopsFromFirestore } from './firestoreService';
import { uploadFileToCloudStorage } from './cloudStorageService';
import { collection, doc, getDocs, runTransaction, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const KEYS = {
  sops: 'soegiri_offline_sops_v1',
  config: 'soegiri_offline_numbering_v1',
};

const IDB_NAME = 'SoegiriOfflineDB';
const IDB_VERSION = 2;
const IDB_SOPS_STORE = 'sops';
const IDB_NUMBER_RESERVATIONS_STORE = 'sopNumberReservations';

const subscribers = new Map<string, Set<() => void>>();
let firestoreSopSyncInitialized = false;

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

  // One-time migration from the old localStorage implementation.
  // After a successful migration, remove the old key so it can no longer
  // consume localStorage quota.
  if (!stored.length) {
    try {
      const raw = localStorage.getItem(KEYS.sops);
      if (raw) {
        const legacy = JSON.parse(raw) as SopDocument[];
        if (Array.isArray(legacy) && legacy.length) {
          const normalized = legacy.map(normalizeSop);
          await idbPutSops(normalized);
          localStorage.removeItem(KEYS.sops);
          return normalized;
        }
      }
      if (raw !== null) localStorage.removeItem(KEYS.sops);
    } catch {
      // Do not let a malformed/oversized legacy value break the offline app.
      try { localStorage.removeItem(KEYS.sops); } catch {}
    }
  }

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


function initFirestoreSopSync() {
  if (firestoreSopSyncInitialized) return;
  firestoreSopSyncInitialized = true;

  // Initial fetch from Firestore
  void fetchSopsFromFirestore().then(async (cloudSops) => {
    if (!cloudSops || !cloudSops.length) return;
    const local = await idbGetAllSops();
    const map = new Map<string, SopDocument>();
    local.forEach((s) => map.set(s.id, s));
    cloudSops.forEach((s) => {
      const exist = map.get(s.id);
      const merged = { ...exist, ...s };
      if (merged.fileDataUrl === '[LOCAL_STORAGE_BINARY]') {
        merged.fileDataUrl = exist?.fileDataUrl || undefined;
      }
      if (merged.signedScanDataUrl === '[LOCAL_STORAGE_BINARY]') {
        merged.signedScanDataUrl = exist?.signedScanDataUrl || undefined;
      }
      if (merged.oldFileDataUrl === '[LOCAL_STORAGE_BINARY]') {
        merged.oldFileDataUrl = exist?.oldFileDataUrl || undefined;
      }
      map.set(s.id, merged);
    });
    await idbPutSops(Array.from(map.values()));
    notifySopSubscribers();
  });

  // Real-time Firestore listener
  subscribeToFirestoreSops(async (cloudSops) => {
    if (!cloudSops || !cloudSops.length) return;
    const local = await idbGetAllSops();
    const map = new Map<string, SopDocument>();
    local.forEach((s) => map.set(s.id, s));
    cloudSops.forEach((s) => {
      const exist = map.get(s.id);
      const merged = { ...exist, ...s };
      if (merged.fileDataUrl === '[LOCAL_STORAGE_BINARY]') {
        merged.fileDataUrl = exist?.fileDataUrl || undefined;
      }
      if (merged.signedScanDataUrl === '[LOCAL_STORAGE_BINARY]') {
        merged.signedScanDataUrl = exist?.signedScanDataUrl || undefined;
      }
      if (merged.oldFileDataUrl === '[LOCAL_STORAGE_BINARY]') {
        merged.oldFileDataUrl = exist?.oldFileDataUrl || undefined;
      }
      map.set(s.id, merged);
    });
    await idbPutSops(Array.from(map.values()));
    notifySopSubscribers();
  });
}

export function subscribeToSops(onData: (sops: SopDocument[]) => void, onError?: (err: any) => void, divisionCodes?: string | string[]) {
  initFirestoreSopSync();
  const emit = async () => {
    try {
      const normalized = Array.from(new Set((Array.isArray(divisionCodes) ? divisionCodes : [divisionCodes]).filter(Boolean).map(String)));
      const effective = normalized.filter((c) => c.toUpperCase() !== 'ALL').map((c) => c.toUpperCase());
      let sops = await getSops();
      if (effective.length) sops = sops.filter((s) => effective.includes(String(s.divisionCode || '').toUpperCase()));
      sops.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      onData(sops);
    } catch (e) { onError?.(e); }
  };

  const listener = () => { void emit(); };
  if (!subscribers.has(KEYS.sops)) subscribers.set(KEYS.sops, new Set());
  subscribers.get(KEYS.sops)!.add(listener);
  void emit();

  return () => subscribers.get(KEYS.sops)?.delete(listener);
}

export async function getAllSopsFromLocal(): Promise<SopDocument[]> { return getSops(); }

export async function saveSopToLocal(sop: SopDocument): Promise<void> {
  if ((sop as any).isNumberReservation) return;
  const all = await getSops();
  const next = normalizeSop(sop);

  // Auto-upload binary attachments to cloud storage so they are accessible from all devices
  if (next.fileDataUrl && next.fileDataUrl.startsWith('data:')) {
    void uploadFileToCloudStorage(next.fileDataUrl, `${next.sopNumber || next.id}.pdf`, `${next.id}_file`).then((res) => {
      next.fileUrl = res.url;
    }).catch(() => {});
  }
  if (next.signedScanDataUrl && next.signedScanDataUrl.startsWith('data:')) {
    void uploadFileToCloudStorage(next.signedScanDataUrl, `${next.sopNumber || next.id}_scan.pdf`, `${next.id}_signedScan`).then((res) => {
      next.signedScanUrl = res.url;
    }).catch(() => {});
  }
  if (next.oldFileDataUrl && next.oldFileDataUrl.startsWith('data:')) {
    void uploadFileToCloudStorage(next.oldFileDataUrl, `${next.sopNumber || next.id}_legacy.pdf`, `${next.id}_oldFile`).then((res) => {
      next.oldFileUrl = res.url;
    }).catch(() => {});
  }

  const index = all.findIndex((s) => s.id === next.id);
  if (index >= 0) all[index] = next; else all.push(next);
  await idbPutSops(all);
  notifySopSubscribers();
  void saveSopToFirestore(next);
}

export async function restoreSopsToLocal(sops: SopDocument[]): Promise<void> {
  const normalized = sops.filter((s) => !(s as any).isNumberReservation).map(normalizeSop);
  await idbPutSops(normalized);
  notifySopSubscribers();
  for (const item of normalized) {
    void saveSopToFirestore(item);
  }
}

export async function deleteSopFromLocal(id: string): Promise<void> {
  await idbDeleteSop(id);
  notifySopSubscribers();
  void deleteSopFromFirestore(id);
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
  const { config, divisionCode, subHierarchyCode = '', dateStr, reservedBy, title, purpose } = params;
  const cleanDiv = (divisionCode || 'PEL').trim().toUpperCase();
  const cleanSub = (subHierarchyCode || '').trim();
  const year = dateStr ? new Date(dateStr).getFullYear().toString() : new Date().getFullYear().toString();
  const counterId = `sop-number-counter-${year}-${cleanDiv}-${cleanSub || 'ROOT'}`.replace(/[^A-Za-z0-9_-]/g, '_');

  // Read the current cloud documents once so an existing installation with
  // historical numbers can safely seed the counter. The atomic transaction
  // below is the final authority for concurrent devices.
  let existingMax = 0;
  try {
    const snap = await getDocs(collection(db, 'sops'));
    snap.forEach((d) => {
      const sop: any = d.data();
      if (sop?.isNumberReservation || sop?.isLegacySop) return;
      if (String(sop?.divisionCode || '').trim().toUpperCase() !== cleanDiv) return;
      if (String(sop?.subHierarchyCode || '').trim() !== cleanSub) return;
      const sopYear = String(sop?.sopNumber || '').match(/\/(\d{4})\s*$/)?.[1] || String(sop?.effectiveDate || '').slice(0, 4);
      if (sopYear !== year) return;
      const seq = Number(sop?.sequenceNumber || parseInt(String(sop?.sopNumber || '').match(/(?:^|\/)\s*(\d{1,4})\s*\/\s*\d{4}$/)?.[1] || '0', 10));
      if (Number.isFinite(seq) && seq > existingMax) existingMax = seq;
    });
  } catch (error) {
    console.warn('Cloud SOP numbering reconciliation warning:', error);
  }

  const counterRef = doc(db, 'system_config', 'sop_number_counters', 'counters', counterId);
  const reservationId = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const currentNext = counterSnap.exists() ? Number(counterSnap.data()?.nextSequence || 1) : 1;
    let sequenceNumber = Math.max(1, currentNext, existingMax + 1);
    let finalId = '';
    let finalRef: any;
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      finalId = `sop-number-${year}-${cleanDiv}-${cleanSub || 'ROOT'}-${sequenceNumber}`.replace(/[^A-Za-z0-9_-]/g, '_');
      finalRef = doc(db, 'sop_number_reservations', finalId);
      const reservationSnap = await tx.get(finalRef);
      if (!reservationSnap.exists()) break;
      sequenceNumber += 1;
      if (attempt === 999) throw new Error('NUMBER_RESERVATION_CONFLICT');
    }

    tx.set(counterRef, {
      nextSequence: sequenceNumber + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: reservedBy || 'User'
    }, { merge: true });
    tx.set(finalRef, {
      id: finalId,
      divisionCode: cleanDiv,
      subHierarchyCode: cleanSub,
      sequenceNumber,
      year,
      reservedBy: reservedBy || 'User',
      reservedAt: new Date().toISOString(),
      status: 'RESERVED',
      purpose: purpose || 'SYSTEM_DOCUMENT',
      title: title || ''
    });
    return finalId;
  });

  const sequenceNumber = Number(reservationId.split('-').pop());
  const generatedNumber = generateSopNumber({
    config,
    divisionCode: cleanDiv,
    subHierarchyCode: cleanSub || undefined,
    dateStr: dateStr || `${year}-01-01`,
    sequenceNum: sequenceNumber
  });
  const sopNumber = generatedNumber.sopNumber;

  const result: SopNumberReservation = {
    id: reservationId,
    divisionCode: cleanDiv,
    subHierarchyCode: cleanSub,
    sequenceNumber,
    sopNumber,
    year,
    title,
    reservedBy: reservedBy || 'User',
    reservedAt: new Date().toISOString(),
    status: 'RESERVED',
    purpose: purpose || 'SYSTEM_DOCUMENT'
  };

  // Keep a local read cache for the existing UI/backup flows, but cloud is authoritative.
  const localDb = await openSopDb();
  await new Promise<void>((resolve, reject) => {
    const tx = localDb.transaction(IDB_NUMBER_RESERVATIONS_STORE, 'readwrite');
    tx.objectStore(IDB_NUMBER_RESERVATIONS_STORE).put(result);
    tx.oncomplete = () => { localDb.close(); resolve(); };
    tx.onerror = () => { localDb.close(); reject(tx.error || new Error('Gagal menyimpan cache reservation nomor SPO.')); };
  });
  return result;
}

export async function getAllNumberReservations(): Promise<SopNumberReservation[]> {
  try {
    const snap = await getDocs(collection(db, 'sop_number_reservations'));
    if (!snap.empty) {
      const cloud = snap.docs.map((d) => ({ ...d.data(), id: d.id })) as SopNumberReservation[];
      const dbLocal = await openSopDb();
      await new Promise<void>((resolve) => {
        const tx = dbLocal.transaction(IDB_NUMBER_RESERVATIONS_STORE, 'readwrite');
        const store = tx.objectStore(IDB_NUMBER_RESERVATIONS_STORE);
        cloud.forEach((r) => store.put(r));
        tx.oncomplete = () => { dbLocal.close(); resolve(); };
        tx.onerror = () => { dbLocal.close(); resolve(); };
      });
      return cloud;
    }
  } catch (error) {
    console.warn('Cloud reservation read warning:', error);
  }

  const dbLocal = await openSopDb();
  return new Promise((resolve, reject) => {
    const tx = dbLocal.transaction(IDB_NUMBER_RESERVATIONS_STORE, 'readonly');
    const request = tx.objectStore(IDB_NUMBER_RESERVATIONS_STORE).getAll();
    request.onsuccess = async () => {
      const local = (request.result || []) as SopNumberReservation[];
      try {
        const batchWrites = local.map((r) => setDoc(doc(db, 'sop_number_reservations', r.id), r, { merge: true }));
        await Promise.all(batchWrites);
      } catch {}
      resolve(local.map((r: any) => ({ ...r, status: r.status === 'USED' ? 'USED' : 'RESERVED' })));
    };
    request.onerror = () => reject(request.error || new Error('Gagal membaca register reservation nomor SPO.'));
    tx.oncomplete = () => dbLocal.close();
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
  try {
    await setDoc(doc(db, 'sop_number_reservations', id), {
      status: 'USED',
      usedAt: new Date().toISOString(),
      usedDocumentId: usedDocumentId || ''
    }, { merge: true });
  } catch (error) {
    console.warn('Cloud reservation consume warning:', error);
  }
  const dbLocal = await openSopDb();
  return new Promise((resolve, reject) => {
    const tx = dbLocal.transaction(IDB_NUMBER_RESERVATIONS_STORE, 'readwrite');
    const store = tx.objectStore(IDB_NUMBER_RESERVATIONS_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result as SopNumberReservation | undefined;
      if (current) store.put({ ...current, status: 'USED', usedAt: new Date().toISOString(), usedDocumentId: usedDocumentId || current.usedDocumentId });
    };
    request.onerror = () => reject(request.error || new Error('Gagal membaca reservation nomor SPO.'));
    tx.oncomplete = () => { dbLocal.close(); resolve(); };
    tx.onerror = () => { dbLocal.close(); reject(tx.error || new Error('Gagal mengubah reservation menjadi nomor terpakai.')); };
    tx.onabort = () => { dbLocal.close(); reject(tx.error || new Error('Konsumsi reservation nomor dibatalkan.')); };
  });
}

export async function restoreNumberReservations(reservations: SopNumberReservation[]): Promise<void> {
  const dbLocal = await openSopDb();
  await new Promise<void>((resolve, reject) => {
    const tx = dbLocal.transaction(IDB_NUMBER_RESERVATIONS_STORE, 'readwrite');
    const store = tx.objectStore(IDB_NUMBER_RESERVATIONS_STORE);
    store.clear();
    for (const reservation of reservations || []) store.put(reservation);
    tx.oncomplete = () => { dbLocal.close(); resolve(); };
    tx.onerror = () => { dbLocal.close(); reject(tx.error || new Error('Gagal memulihkan register reservation nomor SPO.')); };
    tx.onabort = () => { dbLocal.close(); reject(tx.error || new Error('Pemulihan reservation nomor dibatalkan.')); };
  });
  try {
    await Promise.all((reservations || []).map((r) => setDoc(doc(db, 'sop_number_reservations', r.id), r, { merge: true })));
  } catch (error) {
    console.warn('Cloud reservation restore warning:', error);
  }
}

export async function registerSopAndNumberingToLocal(sop: SopDocument, config: NumberingConfig): Promise<void> {
  await saveSopToLocal(sop); await saveConfigToLocal(config);
}
