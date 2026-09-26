'use strict';

const crypto = require('crypto');
const { initializeApp, getApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const {
  cleanString,
  buildSequentialSyncPlan,
  canonicalReservationId,
} = require('./sopNumberSyncPolicy');

const FIRESTORE_DATABASE_ID = 'ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3';
const LOCK_ID = 'spo_number_sync_lock';
const LOCK_TTL_MS = 2 * 60 * 1000;
let _db = null;

function ensureInitialized() {
  try {
    return getApp();
  } catch (error) {
    if (error?.code !== 'app/no-app') throw error;
    return initializeApp({
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'sidokter-soegiri.firebasestorage.app'
    });
  }
}

function getDb() {
  if (!_db) {
    ensureInitialized();
    _db = getFirestore(FIRESTORE_DATABASE_ID);
  }
  return _db;
}

async function resolveAdmin(request) {
  const uid = cleanString(request.auth?.uid);
  if (!uid) throw new HttpsError('unauthenticated', 'Sesi Firebase tidak valid. Silakan login kembali.');

  const db = getDb();
  const token = request.auth?.token || {};
  const profileSnapshot = await db.collection('users').doc(uid).get();
  const profile = profileSnapshot.exists ? (profileSnapshot.data() || {}) : {};
  let isAdmin = token.role === 'admin' || token.admin === true || cleanString(profile.role).toLowerCase() === 'admin';
  if (!isAdmin) {
    const adminSnapshot = await db.collection('admins').doc(uid).get();
    isAdmin = adminSnapshot.exists;
  }
  if (!isAdmin) throw new HttpsError('permission-denied', 'Hanya Administrator yang dapat menjalankan Sinkronisasi Nomor SPO.');

  return {
    uid,
    username: cleanString(profile.username || token.username || token.email || uid),
    name: cleanString(profile.name || token.name || profile.username || token.username || token.email || uid),
  };
}

function lockIsActive(data) {
  if (!data?.active) return false;
  const expiresAtMs = Number(data.expiresAtMs || 0);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

async function acquireLock(db, actor) {
  const ref = db.collection('system_config').doc(LOCK_ID);
  const runId = `sync-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? (snapshot.data() || {}) : {};
    if (lockIsActive(current)) {
      throw new HttpsError('aborted', 'Sinkronisasi nomor lain sedang berjalan. Tunggu proses tersebut selesai lalu coba kembali.');
    }
    const now = Date.now();
    transaction.set(ref, {
      id: LOCK_ID,
      active: true,
      runId,
      ownerUid: actor.uid,
      ownerName: actor.name,
      startedAt: new Date(now).toISOString(),
      expiresAtMs: now + LOCK_TTL_MS,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { ref, runId };
}

async function refreshLock(lock, actor) {
  const now = Date.now();
  await lock.ref.set({
    active: true,
    runId: lock.runId,
    ownerUid: actor.uid,
    ownerName: actor.name,
    expiresAtMs: now + LOCK_TTL_MS,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function releaseLock(lock) {
  if (!lock?.ref) return;
  try {
    await getDb().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(lock.ref);
      if (!snapshot.exists) return;
      const current = snapshot.data() || {};
      if (cleanString(current.runId) !== cleanString(lock.runId)) return;
      transaction.set(lock.ref, {
        active: false,
        finishedAt: new Date().toISOString(),
        expiresAtMs: 0,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } catch (error) {
    console.warn('[SPO number sync] Failed releasing lock:', error?.message || error);
  }
}

function snapshotData(snapshot) {
  return { id: snapshot.id, ...(snapshot.data() || {}) };
}

function buildMetadataMaps(storageSnapshot, notificationSnapshots) {
  const storageBySopId = new Map();
  for (const item of storageSnapshot.docs) {
    const sopId = cleanString(item.data()?.sopId);
    if (!sopId) continue;
    if (!storageBySopId.has(sopId)) storageBySopId.set(sopId, []);
    storageBySopId.get(sopId).push(item.ref);
  }

  const notificationsByDocumentId = new Map();
  for (const snapshot of notificationSnapshots) {
    for (const item of snapshot.docs) {
      const documentId = cleanString(item.data()?.documentId);
      if (!documentId) continue;
      if (!notificationsByDocumentId.has(documentId)) notificationsByDocumentId.set(documentId, []);
      notificationsByDocumentId.get(documentId).push(item.ref);
    }
  }
  return { storageBySopId, notificationsByDocumentId };
}

function getScopesNeedingReconciliation(preflight) {
  const warnings = Array.isArray(preflight?.warnings) ? preflight.warnings : [];
  const staleScopeKeys = new Set(
    warnings
      .filter((row) => row?.type === 'STALE_USED_RESERVATION')
      .map((row) => cleanString(row?.scopeKey))
      .filter(Boolean)
  );
  return (Array.isArray(preflight?.scopes) ? preflight.scopes : []).filter((scope) =>
    Number(scope?.changedCount || 0) > 0 || staleScopeKeys.has(cleanString(scope?.scopeKey))
  );
}

function blockedScopeFromError(scopeKey, error) {
  const code = error instanceof HttpsError ? cleanString(error.code) : 'internal';
  const reason = cleanString(error?.message) || 'Scope gagal diproses.';
  return { scopeKey: cleanString(scopeKey), code, reason };
}

exports.synchronizeSopNumbers = onCall({ region: 'asia-southeast2', timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  const actor = await resolveAdmin(request);
  const db = getDb();
  const lock = await acquireLock(db, actor);

  try {
    const [sopSnapshot, reservationSnapshot, storageSnapshot, notificationOwners] = await Promise.all([
      db.collection('sops').get(),
      db.collection('sop_number_reservations').get(),
      db.collection('storage_files').get(),
      db.collection('notifications').listDocuments(),
    ]);
    const notificationSnapshots = await Promise.all(notificationOwners.map((owner) => owner.collection('items').get()));
    const metadataMaps = buildMetadataMaps(storageSnapshot, notificationSnapshots);
    const allSops = sopSnapshot.docs.map(snapshotData);
    const allReservations = reservationSnapshot.docs.map(snapshotData);
    const allDocumentIds = new Set(allSops.map((row) => cleanString(row.id)).filter(Boolean));
    const preflight = buildSequentialSyncPlan(allSops, allReservations);

    // IMPORTANT: synchronization is scope-isolated. A conflict in an unrelated
    // unit/year must not prevent a valid scope (for example UPH / 1.1 / 2026)
    // from being repaired. Only scopes that actually need a document change or
    // stale reservation cleanup are executed.
    const scopesToProcess = getScopesNeedingReconciliation(preflight);
    const totalChanges = [];
    const blockedScopes = [];
    let reconciledScopes = 0;
    let duplicateCount = preflight.duplicateCount;
    let cleanedReservationCount = 0;

    for (const preScope of scopesToProcess) {
      try {
        await refreshLock(lock, actor);
        const sopRefs = preScope.docs.map((row) => db.collection('sops').doc(String(row.id)));
        const reservationRefs = preScope.reservations.map((row) => db.collection('sop_number_reservations').doc(String(row.id)));
        const sequenceRef = db.collection('system_config').doc(`spo_sequence_${encodeURIComponent(preScope.scopeKey)}`);
        const auditRef = db.collection('audit_logs').doc();

        const scopeResult = await db.runTransaction(async (transaction) => {
          const sequenceSnapshot = await transaction.get(sequenceRef);
          const allRefs = [...sopRefs, ...reservationRefs];
          const snapshots = allRefs.length ? await transaction.getAll(...allRefs) : [];
          const currentSops = [];
          const currentReservations = [];
          for (const snapshot of snapshots) {
            if (!snapshot.exists) continue;
            if (snapshot.ref.parent.id === 'sops') currentSops.push(snapshotData(snapshot));
            if (snapshot.ref.parent.id === 'sop_number_reservations') currentReservations.push(snapshotData(snapshot));
          }

          // Preserve awareness of documents outside this scope (legacy/Existing or
          // another scope) so a USED claim that still references a real document is
          // not mistaken for stale metadata.
          const policySops = [
            ...currentSops,
            ...Array.from(allDocumentIds)
              .filter((id) => !currentSops.some((row) => cleanString(row.id) === id))
              .map((id) => ({ id, isLegacySop: true })),
          ];
          const currentPlan = buildSequentialSyncPlan(policySops, currentReservations);
          const scope = currentPlan.scopes.find((row) => row.scopeKey === preScope.scopeKey);
          if (!scope) return { changes: [], duplicateCount: 0, cleanedReservationCount: 0 };
          if (currentPlan.lockedConflictCount > 0) {
            throw new HttpsError('failed-precondition', `Scope ${preScope.scopeKey} memiliki konflik nomor terkunci.`);
          }

          const staleReservationIds = new Set(
            currentPlan.warnings
              .filter((row) => row?.type === 'STALE_USED_RESERVATION' && cleanString(row?.scopeKey) === preScope.scopeKey)
              .map((row) => cleanString(row?.reservationId))
              .filter(Boolean)
          );
          const desiredReservationIds = new Set(scope.desiredReservations.map((row) => row.id));
          const standardDocumentIds = new Set(scope.finalDocuments.map((row) => cleanString(row.id)));
          const changedById = new Map(scope.finalDocuments.filter((row) => row.changed).map((row) => [cleanString(row.id), row]));

          let writeEstimate = 2 + scope.desiredReservations.length;
          for (const row of currentReservations) {
            const reservationId = cleanString(row.id);
            const status = cleanString(row.status).toUpperCase();
            const isUsedForStandardDoc = status === 'USED' && standardDocumentIds.has(cleanString(row.usedDocumentId));
            const isStaleUsed = status === 'USED' && staleReservationIds.has(reservationId);
            if ((isUsedForStandardDoc || isStaleUsed) && !desiredReservationIds.has(reservationId)) {
              writeEstimate += 1;
            }
          }
          for (const [documentId] of changedById) {
            writeEstimate += 1;
            writeEstimate += (metadataMaps.storageBySopId.get(documentId) || []).length;
            writeEstimate += (metadataMaps.notificationsByDocumentId.get(documentId) || []).length;
          }
          if (writeEstimate > 450) {
            throw new HttpsError('resource-exhausted', `Scope ${preScope.scopeKey} terlalu besar untuk disinkronkan dalam satu transaksi (${writeEstimate} operasi).`);
          }

          const nowIso = new Date().toISOString();
          for (const [documentId, row] of changedById) {
            transaction.set(db.collection('sops').doc(documentId), {
              sopNumber: row.newNumber,
              sequenceNumber: row.sequenceNumber,
              updatedAt: nowIso,
              _syncedAt: nowIso,
            }, { merge: true });
            for (const ref of metadataMaps.storageBySopId.get(documentId) || []) {
              transaction.set(ref, { documentNumber: row.newNumber }, { merge: true });
            }
            for (const ref of metadataMaps.notificationsByDocumentId.get(documentId) || []) {
              transaction.set(ref, { documentNumber: row.newNumber }, { merge: true });
            }
          }

          const cleanedStaleIds = new Set();
          for (const row of currentReservations) {
            const reservationId = cleanString(row.id);
            const status = cleanString(row.status).toUpperCase();
            const isUsedForStandardDoc = status === 'USED' && standardDocumentIds.has(cleanString(row.usedDocumentId));
            const isStaleUsed = status === 'USED' && staleReservationIds.has(reservationId);
            if ((isUsedForStandardDoc || isStaleUsed) && !desiredReservationIds.has(reservationId)) {
              transaction.delete(db.collection('sop_number_reservations').doc(String(row.id)));
              if (isStaleUsed) cleanedStaleIds.add(reservationId);
            }
          }

          for (const desired of scope.desiredReservations) {
            if (staleReservationIds.has(cleanString(desired.id))) cleanedStaleIds.add(cleanString(desired.id));
            const sourceDocument = scope.finalDocuments.find((row) => cleanString(row.id) === cleanString(desired.usedDocumentId));
            transaction.set(db.collection('sop_number_reservations').doc(desired.id), {
              ...desired,
              reservedAt: desired.reservedAt && desired.reservedAt !== new Date(0).toISOString() ? desired.reservedAt : nowIso,
              usedAt: desired.usedAt && desired.usedAt !== new Date(0).toISOString() ? desired.usedAt : nowIso,
              title: desired.title || sourceDocument?.title || '',
              effectiveDate: desired.effectiveDate || sourceDocument?.effectiveDate || `${scope.year}-01-01`,
              reservedBy: desired.reservedBy || actor.name,
              updatedAt: nowIso,
            }, { merge: false });
          }

          const currentSequence = sequenceSnapshot.exists ? (sequenceSnapshot.data() || {}) : {};
          transaction.set(sequenceRef, {
            id: sequenceRef.id,
            divisionCode: scope.divisionCode,
            subHierarchyCode: scope.subHierarchyCode,
            year: scope.year,
            lastSequence: scope.lastSequence,
            reusableSequences: scope.reusableSequences,
            synchronizedAt: nowIso,
            synchronizedBy: actor.name,
            previousLastSequence: Number(currentSequence.lastSequence || 0),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          transaction.set(auditRef, {
            id: auditRef.id,
            action: 'SOP_NUMBER_SEQUENCE_SYNCHRONIZED',
            actorUid: actor.uid,
            actorUsername: actor.username,
            actorName: actor.name,
            scopeKey: scope.scopeKey,
            changedCount: changedById.size,
            duplicateCount: currentPlan.duplicateCount,
            staleReservationCleanupCount: cleanedStaleIds.size,
            archivedLockedCount: scope.archivedCount,
            reusableSequences: scope.reusableSequences,
            changes: Array.from(changedById.values()).slice(0, 50).map((row) => ({
              documentId: row.id,
              oldNumber: row.oldNumber,
              newNumber: row.newNumber,
            })),
            timestamp: nowIso,
          }, { merge: false });

          return {
            changes: Array.from(changedById.values()).map((row) => ({
              id: row.id,
              title: row.title || '',
              status: row.status || 'DRAFT',
              oldNumber: row.oldNumber || '-',
              newNumber: row.newNumber,
              sequenceNumber: row.sequenceNumber,
              scopeKey: scope.scopeKey,
            })),
            duplicateCount: currentPlan.duplicateCount,
            cleanedReservationCount: cleanedStaleIds.size,
          };
        });

        reconciledScopes += 1;
        totalChanges.push(...scopeResult.changes);
        duplicateCount = Math.max(duplicateCount, scopeResult.duplicateCount);
        cleanedReservationCount += Number(scopeResult.cleanedReservationCount || 0);
      } catch (error) {
        const blocked = blockedScopeFromError(preScope.scopeKey, error);
        blockedScopes.push(blocked);
        console.warn(`[SPO number sync] Scope ${preScope.scopeKey} skipped:`, blocked.reason);
      }
    }

    // If every scope that needed work was blocked, surface the real scope and
    // reason to the Admin instead of returning a misleading "nothing to sync".
    if (totalChanges.length === 0 && cleanedReservationCount === 0 && blockedScopes.length > 0) {
      const details = blockedScopes
        .slice(0, 3)
        .map((row) => `${row.scopeKey}: ${row.reason}`)
        .join(' | ');
      throw new HttpsError(
        'failed-precondition',
        `Sinkronisasi gagal pada ${blockedScopes.length} scope. ${details}`
      );
    }

    return {
      ok: blockedScopes.length === 0,
      changedCount: totalChanges.length,
      duplicateCount,
      cleanedReservationCount,
      reconciledScopes,
      changes: totalChanges,
      blockedScopes,
      warnings: [
        ...preflight.warnings,
        ...blockedScopes.map((row) => ({ type: 'BLOCKED_SCOPE', ...row })),
      ],
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('[SPO number sync] Failed:', error);
    throw new HttpsError('internal', error?.message || 'Sinkronisasi nomor SPO gagal.');
  } finally {
    await releaseLock(lock);
  }
});

module.exports.lockIsActive = lockIsActive;
module.exports.getScopesNeedingReconciliation = getScopesNeedingReconciliation;
