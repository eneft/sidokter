'use strict';

const { FieldValue } = require('firebase-admin/firestore');

function parseSopNumber(value) {
  const compact = String(value || '').replace(/\s+/g, '');
  const parts = compact.split('/').filter(Boolean);
  if (parts.length < 3) return null;
  const year = parts[parts.length - 1];
  const sequenceNumber = Number(parts[parts.length - 2]);
  if (!/^\d{4}$/.test(year) || !Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) return null;
  return { year, sequenceNumber };
}

function getScope(year, divisionCode, subHierarchyCode) {
  return `${year}|${String(divisionCode || '').trim().toUpperCase()}|${String(subHierarchyCode || '').trim() || 'ROOT'}`;
}

async function deleteSopAsAdmin(db, sopId) {
  const sopRef = db.collection('sops').doc(sopId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(sopRef);
    if (!snapshot.exists) return 'DELETED';

    const stored = { ...snapshot.data(), id: snapshot.id };
    const wasEverActive = stored.everActivated === true
      || stored.status === 'AKTIF'
      || stored.status === 'DIARSIPKAN'
      || Boolean(stored.activatedAt);

    if (wasEverActive) {
      tx.set(sopRef, {
        status: 'DIARSIPKAN',
        everActivated: true,
        archivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return 'ARCHIVED';
    }

    if (stored.status !== 'DRAFT') {
      const error = new Error('Hanya DRAFT yang belum pernah aktif yang dapat dihapus permanen.');
      error.code = 'SOP_DELETE_INVALID_STATUS';
      throw error;
    }

    const parsed = parseSopNumber(stored.sopNumber);
    const divisionCode = String(stored.divisionCode || '').trim().toUpperCase();
    const subHierarchyCode = String(stored.subHierarchyCode || '').trim();
    const year = String(stored.effectiveDate || parsed?.year || stored.createdAt || '').slice(0, 4);
    const sequenceNumber = Number(stored.sequenceNumber || parsed?.sequenceNumber || 0);

    if (!divisionCode || !/^\d{4}$/.test(year) || !Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) {
      const error = new Error('DRAFT tidak dapat dihapus karena identitas penomorannya tidak valid.');
      error.code = 'SOP_DELETE_INVALID_NUMBERING';
      throw error;
    }

    const sequenceKey = encodeURIComponent(getScope(year, divisionCode, subHierarchyCode));
    const sequenceRef = db.collection('system_config').doc(`spo_sequence_${sequenceKey}`);
    const reservationRef = db.collection('sop_number_reservations').doc(`sop-number-${sequenceKey}-${sequenceNumber}`);
    const [sequenceSnapshot, reservationSnapshot] = await Promise.all([
      tx.get(sequenceRef),
      tx.get(reservationRef),
    ]);

    const current = sequenceSnapshot.data() || {};
    const reusableSequences = Array.from(new Set([
      ...(Array.isArray(current.reusableSequences) ? current.reusableSequences : []),
      sequenceNumber,
    ].map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))).sort((a, b) => a - b);

    tx.set(sequenceRef, {
      id: sequenceRef.id,
      divisionCode,
      subHierarchyCode,
      year,
      lastSequence: Math.max(Number(current.lastSequence || 0), sequenceNumber),
      reusableSequences,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (reservationSnapshot.exists) {
      const reservation = reservationSnapshot.data() || {};
      if (reservation.status === 'USED' && String(reservation.usedDocumentId || '') === stored.id) {
        tx.delete(reservationRef);
      }
    }

    tx.delete(sopRef);
    return 'DELETED';
  });
}

module.exports = { deleteSopAsAdmin };
