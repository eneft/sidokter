/**
 * SPO SERVICE
 * Service khusus dokumen SPO dan konfigurasi penomoran SPO.
 */
import { SopDocument, NumberingConfig, SopStatus } from '../types';
import { DEFAULT_NUMBERING_CONFIG, generateSopNumber } from '../utils/numbering';

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

  return stored.map(normalizeSop);
}

function notifySopSubscribers(): void {
  subscribers.get(KEYS.sops)?.forEach((fn) => fn());
}

function normalizeSop(sop: SopDocument): SopDocument {
  const rawStatus = String((sop as any).status || '');
  let status: SopStatus = 'MENUNGGU_PENGESAHAN';
  if (rawStatus === 'AKTIF') {
    status = 'AKTIF';
  } else if (rawStatus === 'TIDAK_AKTIF') {
    status = 'TIDAK_AKTIF';
  } else if (rawStatus === 'DRAFT' || rawStatus === 'BELUM_UPLOAD' || (sop as any).isNumberReservation) {
    status = 'DRAFT';
  } else if (rawStatus === 'MENUNGGU_PENGESAHAN') {
    status = 'MENUNGGU_PENGESAHAN';
  } else {
    status = (sop as any).isNumberReservation ? 'DRAFT' : 'MENUNGGU_PENGESAHAN';
  }
  return { ...sop, status };
}


export function subscribeToSops(onData: (sops: SopDocument[]) => void, onError?: (err: any) => void, divisionCodes?: string | string[]) {
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
  const all = await getSops();
  const next = normalizeSop(sop);
  const index = all.findIndex((s) => s.id === next.id);
  if (index >= 0) all[index] = next; else all.push(next);
  await idbPutSops(all);
  notifySopSubscribers();
}

export async function restoreSopsToLocal(sops: SopDocument[]): Promise<void> {
  await idbPutSops(sops.map(normalizeSop));
  notifySopSubscribers();
}

export async function deleteSopFromLocal(id: string): Promise<void> {
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
export async function saveConfigToLocal(config: NumberingConfig): Promise<void> { write(KEYS.config, config); }

export interface SopNumberReservation {
  id: string;
  divisionCode: string;
  subHierarchyCode: string;
  sequenceNumber: number;
  sopNumber: string;
  year: string;
  reservedBy: string;
  reservedAt: string;
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
  reservedBy: string;
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
          reservedBy,
          reservedAt: new Date().toISOString()
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
export async function registerSopAndNumberingToLocal(sop: SopDocument, config: NumberingConfig): Promise<void> {
  await saveSopToLocal(sop); await saveConfigToLocal(config);
}
