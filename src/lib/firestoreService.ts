/**
 * FIRESTORE SERVICE - SIDOKTER SOEGIRI
 * Mengintegrasikan penyimpanan dan sinkronisasi data cloud real-time ke Firebase Firestore.
 */
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDocsFromServer,
  getDoc,
  getDocFromServer,
  onSnapshot,
  query,
  where,
  limit,
  Timestamp,
  serverTimestamp,
  deleteField,
  runTransaction
} from 'firebase/firestore';
import { db, auth, authPersistenceReady, functions } from './firebase';
import { httpsCallable } from 'firebase/functions';
import { SopDocument, LibraryDocument, UserAccount, NumberingConfig, UserSession, SopNumberReservation } from '../types';
import { getSopAccessKeys, getUserHierarchyAccessKeys } from '../utils/soegiriStructure';
import { generateSopNumber, getHighestSequenceForUnit, getNextLifecycleSequence, getNumberingSequenceScope, parseSopNumber } from '../utils/numbering';
import { assertCanEditExistingSop, preserveSopWorkflowIdentity } from './sopEditPolicy';

export interface FirebaseConnectionStatus {
  isConnected: boolean;
  isSyncing: boolean;
  lastSync: string | null;
  error: string | null;
}

let connectionStatus: FirebaseConnectionStatus = {
  isConnected: false,
  isSyncing: false,
  lastSync: null,
  error: null
};

const statusListeners = new Set<(status: FirebaseConnectionStatus) => void>();

function updateStatus(updates: Partial<FirebaseConnectionStatus>) {
  connectionStatus = { ...connectionStatus, ...updates };
  statusListeners.forEach((fn) => {
    try {
      fn(connectionStatus);
    } catch (e) {
      console.error('Error in status listener:', e);
    }
  });
}

export function subscribeToFirebaseStatus(callback: (status: FirebaseConnectionStatus) => void): () => void {
  callback(connectionStatus);
  statusListeners.add(callback);
  return () => {
    statusListeners.delete(callback);
  };
}

export function getFirebaseStatus(): FirebaseConnectionStatus {
  return connectionStatus;
}

export function getSopNumberUpdateError(error: any): Error {
  const code = String(error?.code || '');
  const rawMessage = String(error?.message || '').trim();
  if (code === 'functions/not-found' || code === 'functions/unimplemented') {
    return new Error('Layanan koreksi nomor SPO belum tersedia. Deploy function updateSopNumber lalu coba kembali.');
  }
  if (code === 'functions/permission-denied' || code === 'functions/unauthenticated') {
    return new Error('Sesi Admin tidak berwenang mengoreksi nomor SPO. Silakan masuk ulang.');
  }
  if (code === 'functions/failed-precondition' && rawMessage && !/^failed-precondition(?:\s*\[\d+\])?$/i.test(rawMessage)) {
    return new Error(rawMessage);
  }
  // Firebase callable transport sometimes reduces server errors to
  // "internal [0]". Never expose that opaque value in the Admin toast.
  return new Error('Koreksi nomor SPO gagal disimpan secara atomik. Muat ulang data dan coba kembali.');
}

/**
 * Filter out large fields (such as multi-megabyte base64 data URLs)
 * to prevent exceeding the Firestore 1MB document limit.
 */
function sanitizeForFirestore<T = any>(obj: T): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      item && typeof item === 'object' ? sanitizeForFirestore(item) : item
    );
  }
  const clean: Record<string, any> = {};

  for (const [key, val] of Object.entries(obj as Record<string, any>)) {
    if (val === undefined) continue;

    // Do not send huge data URLs to Firestore; Firebase Storage holds the durable binary.
    if (typeof val === 'string' && val.startsWith('data:') && val.length > 300000) {
      clean[key] = '[STORAGE_BINARY]';
      continue;
    }

    if (Array.isArray(val)) {
      clean[key] = val.map((item) =>
        item && typeof item === 'object' ? sanitizeForFirestore(item) : item
      );
    } else if (val !== null && typeof val === 'object' && !(val instanceof Date) && !(val instanceof Timestamp)) {
      clean[key] = sanitizeForFirestore(val);
    } else {
      clean[key] = val;
    }
  }

  return clean;
}

/* =========================================================================
   SOP (STANDAR PROSEDUR OPERASIONAL) FIRESTORE SYNC
 * ========================================================================= */

export async function saveSopToFirestore(
  sop: SopDocument,
  options?: { throwOnError?: boolean; allocateOfficialNumber?: NumberingConfig; editExisting?: boolean; reservationId?: string },
): Promise<SopDocument> {
  try {
    if (!sop || !sop.id) return;
    updateStatus({ isSyncing: true });
    const sopAccessKeys = getSopAccessKeys(sop);
    // Keep the read index on each SOP aligned with the currently authenticated
    // user's scope. The server also reconciles this index on session/user-save,
    // while this ensures a newly-created draft is immediately visible to its owner.
    const currentUid = auth.currentUser?.uid;
    const currentSessionRaw = (() => {
      try { return JSON.parse(sessionStorage.getItem('soegiri_sop_client_session_v3') || 'null'); } catch { return null; }
    })();
    const currentKeys = getUserHierarchyAccessKeys(currentSessionRaw);
    const currentGlobal = currentSessionRaw?.role === 'admin' || currentSessionRaw?.assignments?.some((a:any) => String(a?.divisionCode || '').trim().toUpperCase() === 'ALL') || String(currentSessionRaw?.divisionCode || '').trim().toUpperCase() === 'ALL';

    // Build a UID read index for the saved SOP. Firestore Rules can safely
    // authorize `where(authorizedUids array-contains request.auth.uid)` because
    // the query predicate directly matches the rule predicate. This avoids the
    // non-provable dynamic hierarchy-array rule that caused mobile permission
    // failures. Existing users are reconciled again by the backend session.
    let authorizedUids: string[] = [];
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      for (const userSnap of usersSnapshot.docs) {
        const userData: any = userSnap.data() || {};
        const role = String(userData.role || '').trim().toLowerCase();
        const isGlobal = role === 'admin' || String(userData.divisionCode || '').trim().toUpperCase() === 'ALL' ||
          (Array.isArray(userData.divisionCodes) && userData.divisionCodes.some((v:any) => String(v || '').trim().toUpperCase() === 'ALL')) ||
          (Array.isArray(userData.assignments) && userData.assignments.some((a:any) => String(a?.divisionCode || '').trim().toUpperCase() === 'ALL'));
        const userKeys = getUserHierarchyAccessKeys({ ...userData, role: role === 'admin' ? 'admin' : 'user' });
        if (isGlobal || sopAccessKeys.some((k) => userKeys.includes(k))) authorizedUids.push(String(userSnap.id));
      }
    } catch (indexError) {
      console.warn('[SPO] Failed to build authorized UID index; falling back to current session owner only:', indexError);
      if (currentUid && (currentGlobal || sopAccessKeys.some((k) => currentKeys.includes(k)))) authorizedUids = [currentUid];
    }
    authorizedUids = Array.from(new Set(authorizedUids));
    // SPO binary payloads are never authoritative Firestore data. They must
    // live in Firebase Cloud Storage. Explicitly delete legacy DataURL fields
    // even when setDoc uses merge:true, otherwise an old browser-local payload
    // can remain in Firestore forever and be mistaken for the real file.
    let authoritativeSop = sop;
    if (options?.editExisting) {
      const currentSnapshot = await getDocFromServer(doc(db, 'sops', sop.id));
      if (!currentSnapshot.exists()) throw new Error('SPO yang akan diedit tidak ditemukan.');
      const current = { ...currentSnapshot.data(), id: currentSnapshot.id } as SopDocument;
      assertCanEditExistingSop(current, currentSessionRaw as UserSession);
      authoritativeSop = preserveSopWorkflowIdentity(current, sop);
      Object.assign(sop, authoritativeSop);
    }
    const cleanSop = sanitizeForFirestore({
      ...authoritativeSop,
      ...(authoritativeSop.status === 'AKTIF' || authoritativeSop.status === 'DIARSIPKAN' || authoritativeSop.everActivated ? { everActivated: true } : {}),
      fileDataUrl: deleteField(),
      signedScanDataUrl: deleteField(),
      oldFileDataUrl: deleteField(),
      accessKeys: sopAccessKeys,
      ...(authorizedUids.length ? { authorizedUids } : {}),
      _syncedAt: new Date().toISOString()
    });
    const docRef = doc(db, 'sops', sop.id);
    // Activation must honor the server's current verification state, not a
    // potentially stale client copy. Documents that never entered this flow
    // remain activatable (NONE/undefined).
    if (sop.status === 'AKTIF' && !options?.allocateOfficialNumber) {
      const activationSnapshot = await getDocFromServer(docRef);
      const serverReviewState = activationSnapshot.exists() ? String(activationSnapshot.data()?.reviewState || 'NONE') : 'NONE';
      if (serverReviewState === 'REVISION_REQUESTED' || serverReviewState === 'REVISION_SUBMITTED') {
        throw new Error('Aktivasi ditolak. Alur perbaikan SPO belum diselesaikan.');
      }
    }
    if (options?.reservationId) {
      const reservationRef = doc(db, 'sop_number_reservations', options.reservationId);
      await runTransaction(db, async (transaction) => {
        const [reservationSnapshot, existingDocument] = await Promise.all([
          transaction.get(reservationRef),
          transaction.get(docRef),
        ]);
        if (!reservationSnapshot.exists()) throw new Error('Nomor Terbit tidak ditemukan di register cloud.');
        const reservation = reservationSnapshot.data() as any;
        if (reservation.status !== 'RESERVED') throw new Error('Nomor Terbit sudah digunakan atau tidak lagi tersedia.');
        if (existingDocument.exists()) throw new Error('Dokumen dengan ID ini sudah ada; reservation hanya dapat dipakai untuk registrasi baru.');
        const normalizeNumber = (value: unknown) => String(value || '').replace(/\s+/g, '').toUpperCase();
        if (normalizeNumber(reservation.sopNumber) !== normalizeNumber(authoritativeSop.sopNumber)
          || Number(reservation.sequenceNumber || 0) !== Number(authoritativeSop.sequenceNumber || 0)
          || String(reservation.divisionCode || '').trim().toUpperCase() !== String(authoritativeSop.divisionCode || '').trim().toUpperCase()
          || String(reservation.subHierarchyCode || '').trim() !== String(authoritativeSop.subHierarchyCode || '').trim()) {
          throw new Error('Identitas Nomor Terbit tidak sesuai dengan dokumen yang akan diregistrasi.');
        }
        transaction.set(docRef, cleanSop, { merge: false });
        transaction.set(reservationRef, {
          status: 'USED',
          usedAt: new Date().toISOString(),
          usedDocumentId: authoritativeSop.id,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      });
    } else if (options?.allocateOfficialNumber) {
      const divisionCode = String(sop.divisionCode || '').trim().toUpperCase();
      const subHierarchyCode = String(sop.subHierarchyCode || '').trim();
      const effectiveDate = sop.effectiveDate || new Date().toISOString().slice(0, 10);
      const year = effectiveDate.slice(0, 4);
      if (!divisionCode || !/^\d{4}$/.test(year)) throw new Error('Hirarki atau tahun penomoran SPO tidak valid.');

      // Bootstrap a sequence document from authoritative Firestore data. Once it
      // exists, every Baru/Riviu creation contends on this one unit/year document.
      // Firestore retries the transaction when another submitter updates it.
      const scopeKey = getNumberingSequenceScope(year, divisionCode, subHierarchyCode);
      const [serverSops, serverReservations] = await Promise.all([
        getDocsFromServer(collection(db, 'sops')),
        getDocsFromServer(query(collection(db, 'sop_number_reservations'), where('scopeKey', '==', scopeKey))),
      ]);
      const existingSops = serverSops.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id } as SopDocument));
      const highestExisting = getHighestSequenceForUnit(existingSops, divisionCode, subHierarchyCode, year);
      const occupiedSequences = new Set<number>();
      for (const existing of existingSops) {
        if (existing.isLegacySop || existing.documentType === 'LAMA') continue;
        const parsed = parseSopNumber(existing.sopNumber);
        const existingYear = String(existing.effectiveDate || parsed?.year || existing.createdAt || '').slice(0, 4);
        if (String(existing.divisionCode || '').trim().toUpperCase() !== divisionCode || String(existing.subHierarchyCode || '').trim() !== subHierarchyCode || existingYear !== year) continue;
        const sequence = Number(existing.sequenceNumber || parsed?.sequenceNumber || 0);
        if (Number.isSafeInteger(sequence) && sequence > 0) occupiedSequences.add(sequence);
      }
      for (const reservation of serverReservations.docs) {
        const sequence = Number(reservation.data()?.sequenceNumber || 0);
        if (Number.isSafeInteger(sequence) && sequence > 0) occupiedSequences.add(sequence);
      }
      const sequenceKey = encodeURIComponent(scopeKey);
      const sequenceRef = doc(db, 'system_config', `spo_sequence_${sequenceKey}`);
      const isRiviu = sop.jenis_spo === 'RIVIU' || sop.documentType === 'RIVIU' || sop.documentType === 'REVIEW' || sop.isReviewDocument === true;

      await runTransaction(db, async (transaction) => {
        const sequenceSnapshot = await transaction.get(sequenceRef);
        const predecessorRef = isRiviu && sop.existingSopId ? doc(db, 'sops', sop.existingSopId) : null;
        const predecessorSnapshot = predecessorRef ? await transaction.get(predecessorRef) : null;

        if (isRiviu) {
          if (predecessorRef && !predecessorSnapshot?.exists()) throw new Error('SPO pendahulu Riviu tidak ditemukan.');
          const predecessor = predecessorSnapshot?.exists() ? predecessorSnapshot.data() as SopDocument : null;
          if (predecessor && predecessor.status !== 'AKTIF') throw new Error('SPO pendahulu Riviu tidak lagi berstatus AKTIF.');
          if (predecessor && (
            String(predecessor.divisionCode || '').trim().toUpperCase() !== divisionCode
            || String(predecessor.subHierarchyCode || '').trim().toUpperCase() !== subHierarchyCode.toUpperCase()
          )) throw new Error('SPO pendahulu Riviu tidak berasal dari hirarki yang dipilih.');
          if (!predecessor && !(sop.oldFileUrl && sop.oldStoragePath)) throw new Error('Unggah PDF SPO yang diriviu.');
          const submittedPrevious = String(sop.previousRevisionNumber || '').trim();
          if (!/^\d+$/.test(submittedPrevious)) throw new Error('Nomor revisi lama Riviu wajib berupa angka non-negatif.');
          const expectedNext = String(Number(submittedPrevious) + 1).padStart(2, '0');
          if (sop.revisionNumber !== expectedNext) throw new Error(`Nomor revisi penerus harus ${expectedNext}.`);
        }

        const storedCounter = Number(sequenceSnapshot.data()?.lastSequence || 0);
        const allocation = getNextLifecycleSequence(
          storedCounter,
          highestExisting,
          sequenceSnapshot.data()?.reusableSequences,
          occupiedSequences,
        );
        const sequenceNumber = allocation.sequenceNumber;
        const generated = generateSopNumber({
          config: options.allocateOfficialNumber!,
          divisionCode,
          subHierarchyCode: subHierarchyCode || undefined,
          dateStr: effectiveDate,
          sequenceNum: sequenceNumber,
        });
        if (existingSops.some((existing) => existing.id !== sop.id && String(existing.sopNumber || '').replace(/\s+/g, '').toUpperCase() === generated.sopNumber.replace(/\s+/g, '').toUpperCase())) {
          throw new Error(`Nomor SPO ${generated.sopNumber} sudah digunakan; muat ulang data lalu coba lagi.`);
        }

        sop.sequenceNumber = sequenceNumber;
        sop.sopNumber = generated.sopNumber;
        cleanSop.sequenceNumber = sequenceNumber;
        cleanSop.sopNumber = generated.sopNumber;
        transaction.set(sequenceRef, {
          id: sequenceRef.id,
          divisionCode,
          subHierarchyCode,
          year,
          // High-water mark never moves backwards. A released DRAFT slot is
          // carried separately in reusableSequences.
          lastSequence: Math.max(storedCounter, highestExisting, sequenceNumber),
          reusableSequences: allocation.remainingReusable,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        transaction.set(docRef, cleanSop, { merge: false });
      });
    } else {
      await setDoc(docRef, cleanSop, { merge: true });
    }
    updateStatus({
      isConnected: true,
      isSyncing: false,
      lastSync: new Date().toISOString(),
      error: null
    });
    return sop;
  } catch (err: any) {
    console.warn('Firebase sync warning (SOP):', err?.message || err);
    updateStatus({
      isSyncing: false,
      error: err?.message || 'Gagal sinkronisasi SPO ke Firestore'
    });
    if (options?.throwOnError) throw err instanceof Error ? err : new Error(String(err));
    return sop;
  }
}

/**
 * Authoritative boundary for editing an existing SPO. The current record is
 * reread inside a transaction, preventing a stale DRAFT editor from saving
 * after another actor activates it.
 */
export async function updateExistingSopInFirestore(submitted: SopDocument, actor: UserSession): Promise<SopDocument> {
  if (!submitted?.id) throw new Error('Dokumen SPO tidak valid.');
  // A number correction has dependent metadata and must cross the backend
  // transaction boundary. Content-only edits retain the existing direct path.
  if (actor.role === 'admin') {
    const currentSnapshot = await getDocFromServer(doc(db, 'sops', submitted.id));
    if (!currentSnapshot.exists()) throw new Error('SPO tidak ditemukan atau sudah dihapus.');
    const stored = { ...currentSnapshot.data(), id: currentSnapshot.id } as SopDocument;
    if (String(stored.sopNumber || '').trim() !== String(submitted.sopNumber || '').trim()) {
      try {
        const callable = httpsCallable(functions, 'updateSopNumber');
        const result = await callable({ sop: sanitizeForFirestore(submitted) });
        const data = result.data as { sop?: SopDocument };
        if (!data?.sop) throw new Error('Respons koreksi nomor SPO tidak valid.');
        return data.sop;
      } catch (error: any) {
        throw getSopNumberUpdateError(error);
      }
    }
  }
  const sopRef = doc(db, 'sops', submitted.id);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(sopRef);
    if (!snapshot.exists()) throw new Error('SPO tidak ditemukan atau sudah dihapus.');
    const stored = { ...snapshot.data(), id: snapshot.id } as SopDocument;
    assertCanEditExistingSop(stored, actor);

    const next = preserveSopWorkflowIdentity(stored, submitted, actor);
    const clean = sanitizeForFirestore({
      ...next,
      fileDataUrl: deleteField(),
      signedScanDataUrl: deleteField(),
      oldFileDataUrl: deleteField(),
      accessKeys: getSopAccessKeys(next),
      authorizedUids: (stored as any).authorizedUids,
      _syncedAt: new Date().toISOString(),
    });
    transaction.set(sopRef, clean, { merge: true });

    const auditRef = doc(collection(db, 'audit_logs'));
    transaction.set(auditRef, {
      id: auditRef.id,
      action: 'SOP_EDITED',
      documentId: stored.id,
      documentNumber: stored.sopNumber,
      documentStatus: stored.status,
      actorUid: auth.currentUser?.uid || actor.authUid || actor.id || '',
      actorName: actor.name,
      actorUsername: actor.username,
      actorRole: actor.role,
      timestamp: serverTimestamp(),
    });
    return next;
  });
}

/** Authoritative, all-or-nothing lifecycle transition for a Riviu. */
export async function activateRiviuInFirestore(
  successor: SopDocument,
  predecessorId: string,
  expectedPreviousRevision: string,
): Promise<{ successor: SopDocument; predecessor: SopDocument }> {
  const successorRef = doc(db, 'sops', successor.id);
  const predecessorRef = doc(db, 'sops', predecessorId);
  return runTransaction(db, async (transaction) => {
    const [successorSnapshot, predecessorSnapshot] = await Promise.all([
      transaction.get(successorRef),
      transaction.get(predecessorRef),
    ]);
    if (!successorSnapshot.exists()) throw new Error('Draft Riviu tidak ditemukan.');
    if (!predecessorSnapshot.exists()) throw new Error('SPO pendahulu tidak ditemukan.');

    const storedSuccessor = { ...successorSnapshot.data(), id: successorSnapshot.id } as SopDocument;
    const predecessor = { ...predecessorSnapshot.data(), id: predecessorSnapshot.id } as SopDocument;
    if (predecessor.status !== 'AKTIF') throw new Error('SPO pendahulu tidak lagi berstatus AKTIF.');
    if (storedSuccessor.status !== 'DRAFT') throw new Error('Dokumen penerus bukan draft Riviu yang dapat diaktifkan.');
    if (storedSuccessor.reviewState === 'REVISION_REQUESTED' || storedSuccessor.reviewState === 'REVISION_SUBMITTED') {
      throw new Error('Aktivasi ditolak. Alur perbaikan SPO belum diselesaikan.');
    }
    if (storedSuccessor.jenis_spo !== 'RIVIU' || storedSuccessor.existingSopId !== predecessor.id) {
      throw new Error('Referensi pendahulu pada draft Riviu tidak valid.');
    }
    const previous = String(storedSuccessor.previousRevisionNumber || '').trim();
    if (previous !== expectedPreviousRevision || !/^\d+$/.test(previous)) {
      throw new Error('Nomor revisi pendahulu pada draft Riviu tidak valid.');
    }
    const expectedNext = String(Number(previous) + 1).padStart(2, '0');
    if (storedSuccessor.revisionNumber !== expectedNext || successor.revisionNumber !== expectedNext) {
      throw new Error('Nomor revisi penerus tidak sesuai dengan revisi pendahulu + 1.');
    }
    if (!storedSuccessor.sopNumber || storedSuccessor.sopNumber === predecessor.sopNumber) {
      throw new Error('Riviu wajib memiliki nomor SPO baru yang valid.');
    }

    const archived = sanitizeForFirestore({ ...predecessor, status: 'DIARSIPKAN', everActivated: true, archivedAt: successor.updatedAt, updatedAt: successor.updatedAt });
    const activated = sanitizeForFirestore({
      ...storedSuccessor,
      status: 'AKTIF',
      everActivated: true,
      updatedAt: successor.updatedAt,
      activatedAt: successor.activatedAt,
      activatedBy: successor.activatedBy,
      activationNotes: successor.activationNotes,
      signedScanFileName: successor.signedScanFileName,
      signedScanFileSize: successor.signedScanFileSize,
      signedScanFileType: successor.signedScanFileType,
      signedScanUrl: successor.signedScanUrl,
      signedScanStoragePath: successor.signedScanStoragePath,
    });
    transaction.set(predecessorRef, archived, { merge: true });
    transaction.set(successorRef, activated, { merge: true });
    return { successor: { ...successor, status: 'AKTIF' }, predecessor: { ...predecessor, status: 'DIARSIPKAN', updatedAt: successor.updatedAt } };
  });
}


export interface ReserveSopNumberParams {
  config: NumberingConfig;
  divisionCode: string;
  subHierarchyCode?: string;
  dateStr?: string;
  title?: string;
  reservedBy: string;
  purpose?: 'EXISTING_REPLACE_ONLY' | 'SYSTEM_DOCUMENT' | string;
}

/** Cloud-authoritative Nomor Terbit allocator. It contends on the exact same
 * year+division+hierarchy sequence document used by SPO Baru/Riviu. */
export async function reserveNextSopNumberInFirestore(params: ReserveSopNumberParams): Promise<SopNumberReservation> {
  const cleanDiv = String(params.divisionCode || '').trim().toUpperCase();
  const cleanSub = String(params.subHierarchyCode || '').trim();
  const effectiveDate = params.dateStr || new Date().toISOString().slice(0, 10);
  const year = effectiveDate.slice(0, 4);
  if (!cleanDiv || cleanDiv === 'ALL' || !/^\d{4}$/.test(year)) throw new Error('Hirarki atau tahun reservation SPO tidak valid.');

  const scopeKey = getNumberingSequenceScope(year, cleanDiv, cleanSub);
  const sequenceKey = encodeURIComponent(scopeKey);
  const sequenceRef = doc(db, 'system_config', `spo_sequence_${sequenceKey}`);

  // Bootstrap/repair evidence comes from authoritative cloud data. Concurrent
  // allocators still serialize on sequenceRef inside the transaction below.
  const [sopSnapshot, reservationSnapshot] = await Promise.all([
    getDocsFromServer(collection(db, 'sops')),
    getDocsFromServer(query(collection(db, 'sop_number_reservations'), where('scopeKey', '==', scopeKey))),
  ]);
  const scopedSops = sopSnapshot.docs
    .map((snapshot) => ({ ...snapshot.data(), id: snapshot.id } as SopDocument))
    .filter((sop) => {
      if (sop.isLegacySop || sop.documentType === 'LAMA') return false;
      const parsed = parseSopNumber(sop.sopNumber);
      const sopYear = String(sop.effectiveDate || parsed?.year || sop.createdAt || '').slice(0, 4);
      return String(sop.divisionCode || '').trim().toUpperCase() === cleanDiv
        && String(sop.subHierarchyCode || '').trim() === cleanSub
        && sopYear === year;
    });
  const occupied = new Set<number>();
  for (const sop of scopedSops) {
    const parsed = parseSopNumber(sop.sopNumber);
    const seq = Number(sop.sequenceNumber || parsed?.sequenceNumber || 0);
    if (Number.isSafeInteger(seq) && seq > 0) occupied.add(seq);
  }
  for (const snapshot of reservationSnapshot.docs) {
    const seq = Number(snapshot.data()?.sequenceNumber || 0);
    if (Number.isSafeInteger(seq) && seq > 0) occupied.add(seq);
  }
  const highestExisting = Math.max(0, ...Array.from(occupied));

  return runTransaction(db, async (transaction) => {
    const sequenceSnapshot = await transaction.get(sequenceRef);
    const storedCounter = Number(sequenceSnapshot.data()?.lastSequence || 0);
    const allocation = getNextLifecycleSequence(
      storedCounter,
      highestExisting,
      sequenceSnapshot.data()?.reusableSequences,
      occupied,
    );
    const sequenceNumber = allocation.sequenceNumber;
    const generated = generateSopNumber({
      config: params.config,
      divisionCode: cleanDiv,
      subHierarchyCode: cleanSub || undefined,
      dateStr: effectiveDate,
      sequenceNum: sequenceNumber,
    });
    const reservationId = `sop-number-${sequenceKey}-${sequenceNumber}`;
    const reservationRef = doc(db, 'sop_number_reservations', reservationId);
    const reservationSnapshotInTx = await transaction.get(reservationRef);
    if (reservationSnapshotInTx.exists()) throw new Error(`Nomor SPO ${generated.sopNumber} sudah memiliki register reservation.`);

    const reservation: SopNumberReservation = {
      id: reservationId,
      divisionCode: cleanDiv,
      subHierarchyCode: cleanSub,
      sequenceNumber,
      sopNumber: generated.sopNumber,
      year,
      title: params.title?.trim() || undefined,
      effectiveDate,
      reservedBy: params.reservedBy,
      reservedAt: new Date().toISOString(),
      status: 'RESERVED',
      purpose: params.purpose || 'SYSTEM_DOCUMENT',
    };
    transaction.set(sequenceRef, {
      id: sequenceRef.id,
      divisionCode: cleanDiv,
      subHierarchyCode: cleanSub,
      year,
      lastSequence: Math.max(storedCounter, highestExisting, sequenceNumber),
      reusableSequences: allocation.remainingReusable,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    transaction.set(reservationRef, sanitizeForFirestore({ ...reservation, scopeKey, updatedAt: new Date().toISOString() }), { merge: false });
    return reservation;
  });
}

export async function fetchSopNumberReservationsFromFirestore(): Promise<SopNumberReservation[]> {
  const snapshot = await getDocsFromServer(collection(db, 'sop_number_reservations'));
  return snapshot.docs.map((item) => {
    const data = item.data() as any;
    return {
      id: item.id,
      divisionCode: String(data.divisionCode || '').trim().toUpperCase(),
      subHierarchyCode: String(data.subHierarchyCode || '').trim(),
      sequenceNumber: Number(data.sequenceNumber || 0),
      sopNumber: String(data.sopNumber || ''),
      year: String(data.year || ''),
      title: data.title ? String(data.title) : undefined,
      effectiveDate: data.effectiveDate ? String(data.effectiveDate) : undefined,
      reservedBy: String(data.reservedBy || ''),
      reservedAt: String(data.reservedAt || ''),
      status: data.status === 'USED' ? 'USED' : 'RESERVED',
      purpose: data.purpose ? String(data.purpose) : undefined,
      usedAt: data.usedAt ? String(data.usedAt) : undefined,
      usedDocumentId: data.usedDocumentId ? String(data.usedDocumentId) : undefined,
    } satisfies SopNumberReservation;
  });
}

export async function consumeSopNumberReservationInFirestore(id: string, usedDocumentId?: string): Promise<void> {
  if (!id) return;
  const reservationRef = doc(db, 'sop_number_reservations', id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reservationRef);
    if (!snapshot.exists()) throw new Error('Reservation nomor SPO tidak ditemukan di register cloud.');
    const current = snapshot.data() as any;
    if (current.status === 'USED') {
      if (usedDocumentId && current.usedDocumentId && current.usedDocumentId !== usedDocumentId) {
        throw new Error('Reservation nomor SPO sudah digunakan oleh dokumen lain.');
      }
      return;
    }
    if (current.status !== 'RESERVED') throw new Error('Status reservation nomor SPO tidak valid.');
    transaction.set(reservationRef, {
      status: 'USED',
      usedAt: new Date().toISOString(),
      usedDocumentId: usedDocumentId || current.usedDocumentId || '',
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  });
}

/** Restore only missing reservation records and advance their sequence scopes.
 * Existing cloud records are never overwritten by a backup. */
export async function restoreSopNumberReservationsToFirestore(reservations: SopNumberReservation[]): Promise<void> {
  for (const sourceReservation of reservations || []) {
    const cleanDiv = String(sourceReservation.divisionCode || '').trim().toUpperCase();
    const cleanSub = String(sourceReservation.subHierarchyCode || '').trim();
    const year = String(sourceReservation.year || '').trim();
    const sequenceNumber = Number(sourceReservation.sequenceNumber || 0);
    if (!cleanDiv || !/^\d{4}$/.test(year) || !Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) {
      throw new Error('Reservation backup tidak memiliki identitas penomoran yang valid.');
    }
    const scopeKey = getNumberingSequenceScope(year, cleanDiv, cleanSub);
    const canonicalId = `sop-number-${encodeURIComponent(scopeKey)}-${sequenceNumber}`;
    const sequenceRef = doc(db, 'system_config', `spo_sequence_${encodeURIComponent(scopeKey)}`);
    const reservationRef = doc(db, 'sop_number_reservations', canonicalId);

    // Reconcile old browser-local reservation state against authoritative SOPs.
    const sopSnapshot = await getDocsFromServer(collection(db, 'sops'));
    const matchingSop = sopSnapshot.docs
      .map((item) => ({ ...item.data(), id: item.id } as SopDocument))
      .find((sop) => {
        if (sop.isLegacySop || sop.documentType === 'LAMA') return false;
        const parsed = parseSopNumber(sop.sopNumber);
        const sopYear = String(sop.effectiveDate || parsed?.year || sop.createdAt || '').slice(0, 4);
        const seq = Number(sop.sequenceNumber || parsed?.sequenceNumber || 0);
        return String(sop.divisionCode || '').trim().toUpperCase() === cleanDiv
          && String(sop.subHierarchyCode || '').trim() === cleanSub
          && sopYear === year
          && seq === sequenceNumber;
      });

    const normalized: SopNumberReservation = {
      ...sourceReservation,
      id: canonicalId,
      divisionCode: cleanDiv,
      subHierarchyCode: cleanSub,
      year,
      sequenceNumber,
      status: matchingSop ? 'USED' : sourceReservation.status === 'USED' ? 'USED' : 'RESERVED',
      usedDocumentId: matchingSop?.id || sourceReservation.usedDocumentId,
      usedAt: matchingSop ? (sourceReservation.usedAt || matchingSop.updatedAt || new Date().toISOString()) : sourceReservation.usedAt,
    };

    await runTransaction(db, async (transaction) => {
      const [sequenceSnapshot, existingReservation] = await Promise.all([
        transaction.get(sequenceRef),
        transaction.get(reservationRef),
      ]);
      if (existingReservation.exists()) return;
      const current = sequenceSnapshot.data() || {};
      const reusable = (Array.isArray(current.reusableSequences) ? current.reusableSequences : [])
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isSafeInteger(value) && value > 0 && value !== sequenceNumber);
      transaction.set(sequenceRef, {
        id: sequenceRef.id,
        divisionCode: cleanDiv,
        subHierarchyCode: cleanSub,
        year,
        lastSequence: Math.max(Number(current.lastSequence || 0), sequenceNumber),
        reusableSequences: Array.from(new Set(reusable)).sort((a, b) => a - b),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      transaction.set(reservationRef, sanitizeForFirestore({ ...normalized, scopeKey, updatedAt: new Date().toISOString() }), { merge: false });
    });
  }
}

export async function deleteSopFromFirestore(id: string): Promise<'DELETED' | 'ARCHIVED'> {
  try {
    if (!id) throw new Error('ID SPO tidak valid.');
    updateStatus({ isSyncing: true });
    const sopRef = doc(db, 'sops', id);
    const result = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(sopRef);
      if (!snapshot.exists()) return 'DELETED' as const;
      const stored = { ...snapshot.data(), id: snapshot.id } as SopDocument;
      const wasEverActive = stored.everActivated === true || stored.status === 'AKTIF' || stored.status === 'DIARSIPKAN' || Boolean(stored.activatedAt);

      // Official documents are historical records. "Delete" means archive.
      if (wasEverActive) {
        transaction.set(sopRef, sanitizeForFirestore({
          ...stored,
          status: 'DIARSIPKAN',
          everActivated: true,
          archivedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }), { merge: true });
        return 'ARCHIVED' as const;
      }

      if (stored.status !== 'DRAFT') throw new Error('Hanya DRAFT yang belum pernah aktif yang dapat dihapus permanen.');
      const divisionCode = String(stored.divisionCode || '').trim().toUpperCase();
      const subHierarchyCode = String(stored.subHierarchyCode || '').trim();
      const parsedNumber = parseSopNumber(stored.sopNumber);
      const year = String(stored.effectiveDate || parsedNumber?.year || stored.createdAt || '').slice(0, 4);
      const sequenceNumber = Number(stored.sequenceNumber || parsedNumber?.sequenceNumber || 0);
      if (!divisionCode || !/^\d{4}$/.test(year) || !Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) {
        throw new Error('DRAFT tidak dapat dihapus karena identitas penomorannya tidak valid.');
      }

      const sequenceKey = encodeURIComponent(getNumberingSequenceScope(year, divisionCode, subHierarchyCode));
      const sequenceRef = doc(db, 'system_config', `spo_sequence_${sequenceKey}`);
      const reservationRef = doc(db, 'sop_number_reservations', `sop-number-${sequenceKey}-${sequenceNumber}`);
      const [sequenceSnapshot, reservationSnapshot] = await Promise.all([
        transaction.get(sequenceRef),
        transaction.get(reservationRef),
      ]);
      const current = sequenceSnapshot.data() || {};
      const reusable = Array.from(new Set(
        [...(Array.isArray(current.reusableSequences) ? current.reusableSequences : []), sequenceNumber]
          .map((value) => Number(value))
          .filter((value) => Number.isSafeInteger(value) && value > 0)
      )).sort((a, b) => a - b);

      // The queue belongs to exactly one year+division+hierarchy scope. This is
      // what makes PEN/1.3/008 independent from PEN/1.4/008.
      transaction.set(sequenceRef, {
        id: sequenceRef.id, divisionCode, subHierarchyCode, year,
        lastSequence: Math.max(Number(current.lastSequence || 0), sequenceNumber),
        reusableSequences: reusable,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      // A reservation consumed by this still-DRAFT document is released with
      // the draft. Reservations belonging to another document are never touched.
      if (reservationSnapshot.exists()) {
        const reservation = reservationSnapshot.data() as any;
        if (reservation.status === 'USED' && String(reservation.usedDocumentId || '') === stored.id) {
          transaction.delete(reservationRef);
        }
      }
      transaction.delete(sopRef);
      return 'DELETED' as const;
    });
    updateStatus({ isConnected: true, isSyncing: false, lastSync: new Date().toISOString() });
    return result;
  } catch (err: any) {
    console.warn('Firebase delete warning (SOP):', err?.message || err);
    updateStatus({ isSyncing: false });
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function fetchSopsFromFirestore(accessKeys?: string[], globalAccess = false): Promise<SopDocument[]> {
  await authPersistenceReady;
  if (!auth.currentUser && typeof (auth as any).authStateReady === 'function') {
    try {
      await (auth as any).authStateReady();
    } catch {}
  }

  const colRef = collection(db, 'sops');
  try {
    const source = globalAccess ? colRef : query(colRef, where('status', 'in', ['DRAFT', 'AKTIF']));
    const snapshot = await getDocs(source);
    const byId = new Map<string, SopDocument>();
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && (data.id || docSnap.id)) {
        const id = String(data.id || docSnap.id);
        byId.set(id, { ...data, id } as SopDocument);
      }
    });

    updateStatus({ isConnected: true, error: null, lastSync: new Date().toISOString() });
    return Array.from(byId.values());
  } catch (err: any) {
    const message = String(err?.message || err || '');
    updateStatus({ isConnected: false, error: message || 'Gagal membaca SPO dari Firestore' });
    console.warn('Firestore SOP sync unavailable; preserving local cache.', message || err);
    // IMPORTANT: propagate read failures. The caller must distinguish
    // "successful empty snapshot" from "cloud read failed".
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export function subscribeToFirestoreSops(
  callback: (sops: SopDocument[]) => void,
  onError?: (err: any) => void,
  accessKeys?: string[],
  globalAccess = false
): () => void {
  const colRef = collection(db, 'sops');
  const source = globalAccess ? colRef : query(colRef, where('status', 'in', ['DRAFT', 'AKTIF']));
  let closed = false;

  try {
    const unsubscribe = onSnapshot(
      source,
      (snapshot) => {
        if (closed) return;
        const items: SopDocument[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data && (data.id || docSnap.id)) {
            items.push({ ...data, id: data.id || docSnap.id } as SopDocument);
          }
        });
        updateStatus({ isConnected: true, error: null, lastSync: new Date().toISOString() });
        callback(items);
      },
      (err) => {
        if (closed) return;
        updateStatus({ isConnected: false, error: err?.message || 'Realtime Firestore error' });
        console.warn('Firestore SOP realtime sync notice; local cache remains active.', err?.message || err);
        onError?.(err);
      }
    );

    return () => {
      closed = true;
      try { unsubscribe(); } catch { /* noop */ }
    };
  } catch (err: any) {
    onError?.(err);
    return () => {};
  }
}

/* =========================================================================
   LIBRARY DOCUMENTS (SK & MOU) FIRESTORE SYNC
 * ========================================================================= */

export async function saveLibraryDocToFirestore(document: LibraryDocument, options?: { throwOnError?: boolean }): Promise<void> {
  try {
    if (!document || !document.id) return;
    updateStatus({ isSyncing: true });
    const cleanDoc = sanitizeForFirestore({
      ...document,
      _syncedAt: new Date().toISOString()
    });
    const docRef = doc(db, 'library_documents', document.id);
    await setDoc(docRef, cleanDoc, { merge: true });
    updateStatus({
      isConnected: true,
      isSyncing: false,
      lastSync: new Date().toISOString(),
      error: null
    });
  } catch (err: any) {
    console.warn('Firebase sync warning (Library):', err?.message || err);
    updateStatus({
      isSyncing: false,
      error: err?.message || 'Gagal sinkronisasi SK/MOU ke Firestore'
    });
    if (options?.throwOnError) throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function deleteLibraryDocFromFirestore(id: string): Promise<void> {
  try {
    if (!id) return;
    updateStatus({ isSyncing: true });
    const docRef = doc(db, 'library_documents', id);
    await deleteDoc(docRef);
    updateStatus({
      isConnected: true,
      isSyncing: false,
      lastSync: new Date().toISOString()
    });
  } catch (err: any) {
    console.warn('Firebase delete warning (Library):', err?.message || err);
    updateStatus({ isSyncing: false });
  }
}

export async function fetchLibraryDocsFromFirestore(): Promise<LibraryDocument[] | null> {
  try {
    const colRef = collection(db, 'library_documents');
    const snapshot = await getDocs(colRef);
    const docs: LibraryDocument[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && (data.id || docSnap.id)) {
        docs.push({
          ...data,
          id: data.id || docSnap.id
        } as LibraryDocument);
      }
    });
    return docs;
  } catch (err: any) {
    console.warn('Failed to fetch Library Docs from Firestore:', err?.message || err);
    return null;
  }
}

export function subscribeToFirestoreLibraryDocs(
  callback: (docs: LibraryDocument[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const colRef = collection(db, 'library_documents');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const docs: LibraryDocument[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data && (data.id || docSnap.id)) {
            docs.push({
              ...data,
              id: data.id || docSnap.id
            } as LibraryDocument);
          }
        });
        updateStatus({ isConnected: true, lastSync: new Date().toISOString() });
        callback(docs);
      },
      (err) => {
        if (err?.code !== 'permission-denied') console.info('Firestore library_documents realtime sync unavailable; local cache remains active.');
        onError?.(err);
      }
    );
  } catch (err) {
    console.info('Firestore library_documents listener unavailable; local cache remains active.');
    return () => {};
  }
}

/* =========================================================================
   SYSTEM CONFIG & NUMBERING
 * ========================================================================= */

export async function saveSystemConfigToFirestore(key: string, value: any): Promise<void> {
  try {
    if (!key) return;
    const docRef = doc(db, 'system_config', key);
    await setDoc(
      docRef,
      {
        id: key,
        value: sanitizeForFirestore(value),
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    updateStatus({ isConnected: true });
  } catch (err: any) {
    console.warn('Firebase config sync warning:', err?.message || err);
  }
}

/* Normalize legacy badge nomenclature: badge ADMIN was the old name for VERIFIKATOR.
   Role 'admin' remains reserved for Admin Root and is never renamed. */
function normalizeUserBadges(value: unknown): UserAccount['badges'] {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((badge) => String(badge).trim().toUpperCase())
    .map((badge) => badge === 'ADMIN' ? 'VERIFIKATOR' : badge)
    .filter((badge) => badge === 'STRUKTURAL' || badge === 'VERIFIKATOR');
  return Array.from(new Set(normalized)) as UserAccount['badges'];
}

/* =========================================================================
   USERS SYNC
 * ========================================================================= */

export async function saveUserToFirestore(user: UserAccount): Promise<void> {
  try {
    const docId = user.id || `usr-${user.username}`;
    const rawPayload: any = {
      id: docId,
      username: (user.username || '').toLowerCase().trim(),
      name: user.name || user.username,
      role: String(user.role || '').toLowerCase() === 'admin' ? 'admin' : 'user',
      unitName: user.unitName || '',
      divisionCode: user.divisionCode || 'ALL',
      divisionCodes: Array.isArray(user.divisionCodes) ? user.divisionCodes : (user.divisionCode ? [user.divisionCode] : ['ALL']),
      assignments: Array.isArray(user.assignments) ? user.assignments : [],
      badges: normalizeUserBadges(user.badges) || [],
      subCode: user.subCode || null,
      instCode: user.instCode || null,
      poliCode: user.poliCode || null,
      subUnitCode: user.subUnitCode || null,
      credentialStatus: user.credentialStatus || 'ACTIVE',
      createdAt: user.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const cleanPayload = JSON.parse(JSON.stringify(rawPayload));
    await setDoc(doc(db, 'users', docId), cleanPayload, { merge: true });
  } catch (err) {
    console.warn('[firestoreService] saveUserToFirestore notice:', err);
  }
}

export async function fetchUsersFromFirestore(): Promise<UserAccount[]> {
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    const users: UserAccount[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && (data.id || docSnap.id) && data.username) {
        users.push({
          id: data.id || docSnap.id,
          username: data.username,
          name: data.name || data.username,
          role: String(data.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
          unitName: data.unitName,
          divisionCode: data.divisionCode,
          divisionCodes: data.divisionCodes || (data.divisionCode ? [data.divisionCode] : undefined),
          assignments: data.assignments,
          badges: normalizeUserBadges(data.badges),
          subCode: data.subCode,
          instCode: data.instCode,
          poliCode: data.poliCode,
          subUnitCode: data.subUnitCode,
          credentialStatus: data.credentialStatus,
          createdAt: data.createdAt || '',
          updatedAt: data.updatedAt
        });
      }
    });
    return users;
  } catch (err: any) {
    console.warn('Failed to fetch users from Firestore:', err?.message || err);
    return [];
  }
}

export async function fetchUserByUsernameFromFirestore(username: string): Promise<UserAccount | null> {
  const cleanUser = username.trim().toLowerCase();
  try {
    const users = await fetchUsersFromFirestore();
    return users.find((u) => u.username.toLowerCase() === cleanUser) || null;
  } catch {
    return null;
  }
}

export function subscribeToFirestoreUsers(callback: (users: UserAccount[]) => void): () => void {
  try {
    const colRef = collection(db, 'users');
    return onSnapshot(colRef, (snapshot) => {
      const users: UserAccount[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && (data.id || docSnap.id) && data.username) {
          users.push({
            id: data.id || docSnap.id,
            username: data.username,
            name: data.name || data.username,
            role: String(data.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
            unitName: data.unitName, divisionCode: data.divisionCode,
            divisionCodes: data.divisionCodes || (data.divisionCode ? [data.divisionCode] : undefined),
            assignments: data.assignments, badges: normalizeUserBadges(data.badges),
            subCode: data.subCode, instCode: data.instCode, poliCode: data.poliCode, subUnitCode: data.subUnitCode,
            credentialStatus: data.credentialStatus, createdAt: data.createdAt || '', updatedAt: data.updatedAt
          });
        }
      });
      callback(users);
    }, (err) => {
      if (err?.code !== 'permission-denied') console.info('Firestore users realtime sync unavailable; local cache remains active.');
    });
  } catch (err) {
    console.info('Firestore users listener unavailable; local cache remains active.');
    return () => {};
  }
}

/* =========================================================================
   AUDIT LOGS
 * ========================================================================= */

export async function logAuditToFirestore(audit: {
  action: string;
  actorName?: string;
  actorRole?: string;
  details?: string;
}): Promise<void> {
  try {
    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const docRef = doc(db, 'audit_logs', id);
    await setDoc(docRef, {
      id,
      ...audit,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    // Non-critical, fail silently in background
  }
}

/* =========================================================================
   INITIALIZATION & HEALTH CHECK
 * ========================================================================= */

export async function checkFirebaseConnection(): Promise<boolean> {
  try {
    updateStatus({ isSyncing: true });
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch {
      const cfgSnap = await getDoc(doc(db, 'system_config', 'maintenance'));
      if (!cfgSnap.exists()) {
        await getDoc(doc(db, 'test', 'connection'));
      }
    }
    updateStatus({
      isConnected: true,
      isSyncing: false,
      lastSync: new Date().toISOString(),
      error: null
    });
    return true;
  } catch (err: any) {
    if (err?.code !== 'permission-denied') console.info('Firestore connection check unavailable; local cache remains active.');
    updateStatus({
      isConnected: false,
      isSyncing: false,
      error: err?.message || 'Tidak dapat menghubungi Firestore'
    });
    return false;
  }
}
