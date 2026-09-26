'use strict';

const { initializeApp, getApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

const FIRESTORE_DATABASE_ID = 'ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3';
const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
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

function cleanString(value) {
  return String(value ?? '').trim();
}

function cleanDivision(value) {
  return cleanString(value).toUpperCase();
}

function getSequenceScope(year, divisionCode, subHierarchyCode) {
  return `${cleanString(year)}|${cleanDivision(divisionCode)}|${cleanString(subHierarchyCode) || 'ROOT'}`;
}

function parseSequenceFromSopNumber(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  const parts = raw
    .replace(/[-_]/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 4 && /^\d{4}$/.test(parts[3]) && /^\d{1,6}$/.test(parts[2])) {
    return { divisionCode: parts[0].toUpperCase(), subHierarchyCode: parts[1], sequenceNumber: Number(parts[2]), year: parts[3] };
  }
  if (parts.length === 3 && /^\d{4}$/.test(parts[2]) && /^\d{1,6}$/.test(parts[1])) {
    return { divisionCode: parts[0].toUpperCase(), subHierarchyCode: '', sequenceNumber: Number(parts[1]), year: parts[2] };
  }
  return null;
}

function getRecordYear(record) {
  const effective = cleanString(record?.effectiveDate);
  if (/^\d{4}/.test(effective)) return effective.slice(0, 4);
  const parsed = parseSequenceFromSopNumber(record?.sopNumber);
  if (parsed?.year) return parsed.year;
  const created = cleanString(record?.createdAt);
  if (/^\d{4}/.test(created)) return created.slice(0, 4);
  return '';
}

function getRecordSequence(record) {
  const direct = Number(record?.sequenceNumber || 0);
  if (Number.isSafeInteger(direct) && direct > 0) return direct;
  const parsed = parseSequenceFromSopNumber(record?.sopNumber);
  return Number.isSafeInteger(parsed?.sequenceNumber) && parsed.sequenceNumber > 0 ? parsed.sequenceNumber : 0;
}

function getNextLifecycleSequence(storedCounter, highestExisting, reusableSequences, occupiedSequences) {
  const occupied = new Set(
    Array.from(occupiedSequences || [])
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value) && value > 0)
  );
  const reusable = Array.from(new Set(
    (Array.isArray(reusableSequences) ? reusableSequences : [])
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value) && value > 0)
  )).sort((a, b) => a - b);

  const reusableSequence = reusable.find((value) => !occupied.has(value));
  if (reusableSequence !== undefined) {
    return {
      sequenceNumber: reusableSequence,
      remainingReusable: reusable.filter((value) => value > reusableSequence && !occupied.has(value)),
    };
  }

  let next = Math.max(Number(storedCounter) || 0, Number(highestExisting) || 0) + 1;
  while (occupied.has(next)) next += 1;
  return { sequenceNumber: next, remainingReusable: [] };
}

function generateSopNumber(configInput, divisionCode, subHierarchyCode, effectiveDate, sequenceNumber) {
  const config = configInput && typeof configInput === 'object' ? configInput : {};
  const dateText = /^\d{4}-\d{2}-\d{2}/.test(cleanString(effectiveDate))
    ? cleanString(effectiveDate).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const [year, month = '01', day = '01'] = dateText.split('-');
  const monthIndex = Math.min(11, Math.max(0, Number(month) - 1));
  const monthRoman = ROMAN_MONTHS[monthIndex] || 'I';
  const padding = Number.isSafeInteger(Number(config.numberPadding))
    ? Math.min(8, Math.max(1, Number(config.numberPadding)))
    : 3;
  const paddedNumber = String(sequenceNumber).padStart(padding, '0');
  const cleanSub = cleanString(subHierarchyCode);
  const separator = typeof config.separator === 'string' && config.separator.length <= 8
    ? config.separator
    : ' / ';
  const template = typeof config.template === 'string' ? config.template : '';
  const mode = cleanString(config.mode);

  if (mode === 'soegiri_standard' || !template || template.includes('{KODE_UTAMA}')) {
    const parts = [divisionCode];
    if (cleanSub) parts.push(cleanSub);
    parts.push(paddedNumber, year);
    return parts.join(separator);
  }

  return template
    .replaceAll('{KODE_UTAMA}', divisionCode)
    .replaceAll('{KODE_TAMBAHAN}', cleanSub)
    .replaceAll('{PREFIX}', cleanString(config.prefix) || 'SOP')
    .replaceAll('{DIVISI}', divisionCode)
    .replaceAll('{KATEGORI}', divisionCode)
    .replaceAll('{BULAN_ROMAWI}', monthRoman)
    .replaceAll('{BULAN}', config.useRomanMonth ? monthRoman : month)
    .replaceAll('{BULAN_ANGKA}', month)
    .replaceAll('{TAHUN}', year)
    .replaceAll('{TANGGAL}', day)
    .replaceAll('{NOMOR}', paddedNumber)
    .replace(/\/\s*\/\s*/g, '/ ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function assignmentPath(assignment) {
  const explicit = cleanString(assignment?.hierarchyCode);
  if (explicit) return explicit;
  return [assignment?.subCode, assignment?.instCode, assignment?.poliCode, assignment?.subUnitCode]
    .map(cleanString)
    .filter(Boolean)
    .join('.');
}

function profileHasHierarchyAccess(profile, divisionCode, subHierarchyCode, globalClaim = false) {
  if (!profile || typeof profile !== 'object') return false;
  const assignments = Array.isArray(profile.assignments) ? profile.assignments : [];
  const divisionCodes = new Set([
    cleanDivision(profile.divisionCode),
    ...(Array.isArray(profile.divisionCodes) ? profile.divisionCodes.map(cleanDivision) : []),
    ...assignments.map((assignment) => cleanDivision(assignment?.divisionCode)),
  ].filter(Boolean));

  const hasAll = globalClaim || divisionCodes.has('ALL');
  if (hasAll) return true;
  if (!divisionCodes.has(divisionCode)) return false;

  const scopedAssignments = assignments.filter((assignment) => cleanDivision(assignment?.divisionCode) === divisionCode);
  if (!scopedAssignments.length) return true;
  const specificPaths = scopedAssignments.map(assignmentPath).filter(Boolean);
  if (!specificPaths.length) return true;

  const target = cleanString(subHierarchyCode);
  return specificPaths.some((base) => target === base || target.startsWith(`${base}.`));
}

async function resolveActor(request) {
  const uid = cleanString(request.auth?.uid);
  if (!uid) throw new HttpsError('unauthenticated', 'Sesi Firebase tidak valid. Silakan login kembali.');

  const db = getDb();
  const token = request.auth?.token || {};
  const profileSnapshot = await db.collection('users').doc(uid).get();
  const profile = profileSnapshot.exists ? (profileSnapshot.data() || {}) : {};
  let isAdmin = token.email === 'gelapgulita3@gmail.com' || token.role === 'admin' || token.admin === true || cleanString(profile.role).toLowerCase() === 'admin';
  if (!isAdmin) {
    const adminSnapshot = await db.collection('admins').doc(uid).get();
    isAdmin = adminSnapshot.exists;
  }

  return {
    uid,
    token,
    profile,
    isAdmin,
    username: cleanString(profile.username || token.username || token.email || uid),
    name: cleanString(profile.name || token.name || profile.username || token.username || token.email || uid),
  };
}

function reservationFromData(id, data) {
  return {
    id,
    divisionCode: cleanDivision(data.divisionCode),
    subHierarchyCode: cleanString(data.subHierarchyCode),
    sequenceNumber: Number(data.sequenceNumber || 0),
    sopNumber: cleanString(data.sopNumber),
    year: cleanString(data.year),
    title: data.title ? cleanString(data.title) : undefined,
    effectiveDate: data.effectiveDate ? cleanString(data.effectiveDate) : undefined,
    reservedBy: cleanString(data.reservedBy),
    reservedAt: cleanString(data.reservedAt),
    status: data.status === 'USED' ? 'USED' : 'RESERVED',
    purpose: data.purpose ? cleanString(data.purpose) : undefined,
    usedAt: data.usedAt ? cleanString(data.usedAt) : undefined,
    usedDocumentId: data.usedDocumentId ? cleanString(data.usedDocumentId) : undefined,
  };
}

exports.allocateSopNumber = onCall({ region: 'asia-southeast2', timeoutSeconds: 60 }, async (request) => {
  const actor = await resolveActor(request);
  const data = request.data && typeof request.data === 'object' ? request.data : {};
  const allocationMode = cleanString(data.allocationMode || 'RESERVATION').toUpperCase();
  if (!['RESERVATION', 'DOCUMENT'].includes(allocationMode)) {
    throw new HttpsError('invalid-argument', 'Mode alokasi nomor SPO tidak valid.');
  }
  if (allocationMode === 'RESERVATION' && !actor.isAdmin) {
    throw new HttpsError('permission-denied', 'Hanya Administrator yang dapat menerbitkan Nomor Terbit.');
  }

  const divisionCode = cleanDivision(data.divisionCode);
  const subHierarchyCode = cleanString(data.subHierarchyCode);
  const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(cleanString(data.dateStr))
    ? cleanString(data.dateStr)
    : new Date().toISOString().slice(0, 10);
  const year = effectiveDate.slice(0, 4);
  const documentId = cleanString(data.documentId);
  if (!divisionCode || divisionCode === 'ALL' || !/^\d{4}$/.test(year)) {
    throw new HttpsError('invalid-argument', 'Hirarki atau tahun penomoran SPO tidak valid.');
  }
  if (allocationMode === 'DOCUMENT' && !documentId) {
    throw new HttpsError('invalid-argument', 'ID dokumen wajib diisi untuk alokasi nomor SPO.');
  }

  const globalClaim = actor.isAdmin || actor.token.globalHierarchyAccess === true;
  if (allocationMode === 'DOCUMENT' && !actor.isAdmin && !profileHasHierarchyAccess(actor.profile, divisionCode, subHierarchyCode, globalClaim)) {
    throw new HttpsError('permission-denied', 'Anda tidak memiliki akses untuk menerbitkan nomor pada hirarki SPO ini.');
  }

  const db = getDb();
  const syncLockRef = db.collection('system_config').doc('spo_number_sync_lock');
  const syncLockSnapshot = await syncLockRef.get();
  const syncLockData = syncLockSnapshot.exists ? (syncLockSnapshot.data() || {}) : {};
  if (syncLockData.active === true && Number(syncLockData.expiresAtMs || 0) > Date.now()) {
    throw new HttpsError('aborted', 'Sinkronisasi nomor SPO sedang berjalan. Coba kembali setelah proses selesai.');
  }
  const scopeKey = getSequenceScope(year, divisionCode, subHierarchyCode);
  const sequenceKey = encodeURIComponent(scopeKey);
  const sequenceRef = db.collection('system_config').doc(`spo_sequence_${sequenceKey}`);
  const reservationsRef = db.collection('sop_number_reservations');

  if (allocationMode === 'DOCUMENT') {
    const existingDocument = await db.collection('sops').doc(documentId).get();
    if (existingDocument.exists) {
      const existing = existingDocument.data() || {};
      const existingSequence = getRecordSequence(existing);
      const existingYear = getRecordYear(existing);
      if (existingSequence > 0 && cleanString(existing.sopNumber) && cleanDivision(existing.divisionCode) === divisionCode && cleanString(existing.subHierarchyCode) === subHierarchyCode && existingYear === year) {
        return {
          id: `existing-${documentId}`,
          divisionCode,
          subHierarchyCode,
          sequenceNumber: existingSequence,
          sopNumber: cleanString(existing.sopNumber),
          year,
          title: cleanString(existing.title || data.title) || undefined,
          effectiveDate,
          reservedBy: actor.name,
          reservedAt: cleanString(existing.createdAt) || new Date().toISOString(),
          status: 'USED',
          purpose: 'SYSTEM_DOCUMENT',
          usedDocumentId: documentId,
        };
      }
    }

    const priorClaimSnapshot = await reservationsRef.where('usedDocumentId', '==', documentId).get();
    const priorClaim = priorClaimSnapshot.docs
      .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() || {}) }))
      .find((row) => row.status === 'USED' && row.purpose === 'SYSTEM_DOCUMENT' && row.scopeKey === scopeKey);
    if (priorClaim) return reservationFromData(priorClaim.id, priorClaim);
  }

  const [sopSnapshot, reservationSnapshot] = await Promise.all([
    db.collection('sops').get(),
    reservationsRef.where('scopeKey', '==', scopeKey).get(),
  ]);

  const occupied = new Set();
  for (const snapshot of sopSnapshot.docs) {
    const sop = snapshot.data() || {};
    if (sop.isLegacySop || sop.documentType === 'LAMA') continue;
    if (cleanDivision(sop.divisionCode) !== divisionCode) continue;
    if (cleanString(sop.subHierarchyCode) !== subHierarchyCode) continue;
    if (getRecordYear(sop) !== year) continue;
    const sequence = getRecordSequence(sop);
    if (sequence > 0) occupied.add(sequence);
  }
  for (const snapshot of reservationSnapshot.docs) {
    const sequence = Number(snapshot.data()?.sequenceNumber || 0);
    if (Number.isSafeInteger(sequence) && sequence > 0) occupied.add(sequence);
  }
  const highestExisting = Math.max(0, ...Array.from(occupied));

  return db.runTransaction(async (transaction) => {
    const [lockSnapshot, sequenceSnapshot] = await Promise.all([
      transaction.get(syncLockRef),
      transaction.get(sequenceRef),
    ]);
    const lockData = lockSnapshot.exists ? (lockSnapshot.data() || {}) : {};
    if (lockData.active === true && Number(lockData.expiresAtMs || 0) > Date.now()) {
      throw new HttpsError('aborted', 'Sinkronisasi nomor SPO sedang berjalan. Coba kembali setelah proses selesai.');
    }
    const sequenceData = sequenceSnapshot.exists ? (sequenceSnapshot.data() || {}) : {};
    const storedCounter = Number(sequenceData.lastSequence || 0);
    const allocation = getNextLifecycleSequence(storedCounter, highestExisting, sequenceData.reusableSequences, occupied);
    const sequenceNumber = allocation.sequenceNumber;
    const sopNumber = generateSopNumber(data.config, divisionCode, subHierarchyCode, effectiveDate, sequenceNumber);
    const reservationId = `sop-number-${sequenceKey}-${sequenceNumber}`;
    const reservationRef = reservationsRef.doc(reservationId);
    const existingReservation = await transaction.get(reservationRef);
    if (existingReservation.exists) {
      throw new HttpsError('already-exists', `Nomor SPO ${sopNumber} sudah memiliki register penomoran.`);
    }

    const now = new Date().toISOString();
    const isDocumentAllocation = allocationMode === 'DOCUMENT';
    const reservation = {
      id: reservationId,
      divisionCode,
      subHierarchyCode,
      sequenceNumber,
      sopNumber,
      year,
      title: cleanString(data.title) || undefined,
      effectiveDate,
      reservedBy: cleanString(data.reservedBy) || actor.name || actor.username,
      reservedAt: now,
      status: isDocumentAllocation ? 'USED' : 'RESERVED',
      purpose: isDocumentAllocation ? 'SYSTEM_DOCUMENT' : (cleanString(data.purpose) || 'EXISTING_REPLACE_ONLY'),
      ...(isDocumentAllocation ? { usedAt: now, usedDocumentId: documentId } : {}),
    };

    transaction.set(sequenceRef, {
      id: sequenceRef.id,
      divisionCode,
      subHierarchyCode,
      year,
      lastSequence: Math.max(storedCounter, highestExisting, sequenceNumber),
      reusableSequences: allocation.remainingReusable,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(reservationRef, {
      ...reservation,
      scopeKey,
      updatedAt: now,
    }, { merge: false });

    return reservation;
  });
});

exports._test = {
  getSequenceScope,
  getNextLifecycleSequence,
  generateSopNumber,
  profileHasHierarchyAccess,
};
