'use strict';

const PROTECTED_WORKFLOW_FIELDS = [
  'id', 'status', 'revisionNumber', 'version', 'jenis_spo', 'documentType',
  'isReviewDocument', 'isLegacySop', 'existingSopId', 'previousRevisionNumber',
  'previousSopNumber', 'oldSopNumber', 'legacySopNumber', 'reviewState', 'reviewHistory',
  'revisionHistory', 'currentReviewRequesterUid', 'reviewUpdatedAt', 'authorizedUids',
];

function normalizeNumber(value) {
  return String(value || '').trim().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').toUpperCase();
}

function validateNumberCorrection(stored, submitted, allSops) {
  const newNumber = String(submitted?.sopNumber || '').trim();
  if (!newNumber || newNumber.length > 200) throw new Error('Nomor SPO wajib diisi dan maksimal 200 karakter.');
  const normalized = normalizeNumber(newNumber);
  const duplicate = allSops.find(row => row.id !== stored.id && normalizeNumber(row.sopNumber) === normalized);
  if (duplicate) throw new Error(`Nomor SPO ${newNumber} sudah digunakan oleh dokumen lain.`);

  const isLegacy = stored.isLegacySop || stored.documentType === 'LAMA' || stored.jenis_spo === 'EKSISTING';
  if (!isLegacy) {
    const parts = newNumber.split('/').map(part => part.trim()).filter(Boolean);
    if (parts.length < 3 || !/^\d+$/.test(parts.at(-2) || '') || !/^\d{4}$/.test(parts.at(-1) || '')) {
      throw new Error('Format nomor SPO tidak valid. Gunakan format penomoran SIDOKTER yang berlaku.');
    }
    const sequence = Number(parts.at(-2));
    if (!(sequence > 0) || Number(submitted.sequenceNumber) !== sequence) {
      throw new Error('Nomor urut SPO tidak sesuai dengan nomor dokumen.');
    }
  }
  return newNumber;
}

function buildAdminNumberUpdate(stored, submitted, newNumber) {
  const next = { ...stored, ...submitted, id: stored.id, sopNumber: newNumber };
  for (const field of PROTECTED_WORKFLOW_FIELDS) next[field] = stored[field];
  // Never materialize documentNumber on an SOP: sopNumber is canonical.
  delete next.documentNumber;
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || (typeof value === 'string' && value.startsWith('data:'))) delete next[key];
  }
  return next;
}

module.exports = { normalizeNumber, validateNumberCorrection, buildAdminNumberUpdate, PROTECTED_WORKFLOW_FIELDS };
