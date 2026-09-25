'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSopActivationTransition } = require('./sopActivationPolicy');

const admin = { role: 'admin', name: 'Admin Tata Naskah' };
const baseDraft = {
  id: 'successor', status: 'DRAFT', jenis_spo: 'BARU', sopNumber: 'PEL / 1.1 / 002 / 2026',
  revisionNumber: '00', version: '00', title: 'SPO Baru',
};

test('Admin activates a standalone Draft through the trusted policy', () => {
  const result = buildSopActivationTransition({
    storedSuccessor: baseDraft,
    submitted: { ...baseDraft, activatedAt: '2026-09-24', activatedBy: 'Admin' },
    actor: admin,
  });
  assert.equal(result.successor.status, 'AKTIF');
  assert.equal(result.successor.everActivated, true);
  assert.equal(result.predecessor, null);
});

test('non-Admin activation is rejected', () => {
  assert.throws(() => buildSopActivationTransition({
    storedSuccessor: baseDraft,
    submitted: baseDraft,
    actor: { role: 'user' },
  }), /ADMIN_REQUIRED/);
});

test('internal Riviu activates successor and archives predecessor atomically', () => {
  const predecessor = {
    id: 'predecessor', status: 'AKTIF', sopNumber: 'PEL / 1.1 / 001 / 2025',
    revisionNumber: '01', version: '01', title: 'SPO Lama',
  };
  const successor = {
    ...baseDraft, jenis_spo: 'RIVIU', isReviewDocument: true, existingSopId: predecessor.id,
    previousRevisionNumber: '01', revisionNumber: '02', version: '02',
  };
  const result = buildSopActivationTransition({ storedSuccessor: successor, submitted: successor, predecessor, actor: admin });
  assert.equal(result.successor.status, 'AKTIF');
  assert.equal(result.successor.revisionNumber, '02');
  assert.equal(result.predecessor.status, 'DIARSIPKAN');
});

test('internal Riviu rejects a stale predecessor revision', () => {
  const predecessor = { id: 'predecessor', status: 'AKTIF', sopNumber: 'OLD', revisionNumber: '02' };
  const successor = {
    ...baseDraft, jenis_spo: 'RIVIU', existingSopId: predecessor.id,
    previousRevisionNumber: '01', revisionNumber: '02', version: '02',
  };
  assert.throws(() => buildSopActivationTransition({ storedSuccessor: successor, submitted: successor, predecessor, actor: admin }), /PREDECESSOR_REVISION_MISMATCH/);
});

test('external Riviu requires a durable official source PDF', () => {
  const successor = {
    ...baseDraft, jenis_spo: 'RIVIU', isReviewDocument: true, oldSopNumber: 'LEGACY / 01',
    reviewReason: 'Penyesuaian kebijakan', previousRevisionNumber: '01', revisionNumber: '02', version: '02',
  };
  assert.throws(() => buildSopActivationTransition({ storedSuccessor: successor, submitted: successor, actor: admin }), /EXTERNAL_PDF_REQUIRED/);
});

test('external Riviu repairs missing stored metadata from trusted activation payload', () => {
  const stored = {
    ...baseDraft,
    jenis_spo: 'RIVIU',
    isReviewDocument: true,
    sopNumber: 'PEN / 2.1.1 / 002 / 2026',
    revisionNumber: '02',
    version: '02',
  };
  const submitted = {
    ...stored,
    oldSopNumber: 'SOEGIRI-KEP / 001 / 568 / 2024',
    reviewReason: 'Penyesuaian prosedur dan pembaruan dokumen.',
    previousRevisionNumber: '01',
    oldFileName: 'spo-lama.pdf',
    oldFileType: 'application/pdf',
    oldFileSize: 4321,
    oldFileUrl: '/api/storage/files/successor_oldFile',
    oldStoragePath: 'sidokter/spo/successor_oldFile.pdf',
    externalReviewSignedConfirmed: true,
    activatedAt: '2026-09-25',
  };

  const result = buildSopActivationTransition({ storedSuccessor: stored, submitted, actor: admin });

  assert.equal(result.successor.status, 'AKTIF');
  assert.equal(result.successor.oldSopNumber, submitted.oldSopNumber);
  assert.equal(result.successor.previousSopNumber, submitted.oldSopNumber);
  assert.equal(result.successor.reviewReason, submitted.reviewReason);
  assert.equal(result.successor.previousRevisionNumber, '01');
  assert.equal(result.successor.revisionNumber, '02');
  assert.equal(result.successor.version, '02');
  assert.equal(result.successor.oldFileUrl, submitted.oldFileUrl);
  assert.equal(result.successor.oldStoragePath, submitted.oldStoragePath);
  assert.equal(result.successor.oldFileSize, 4321);
  assert.equal(result.successor.externalReviewSignedConfirmed, true);
});

test('external Riviu accepts previousSopNumber as legacy alias and canonicalizes oldSopNumber', () => {
  const stored = {
    ...baseDraft,
    jenis_spo: 'RIVIU',
    isReviewDocument: true,
    sopNumber: 'PEN / 2.1.1 / 002 / 2026',
    revisionNumber: '01',
    version: '01',
    previousSopNumber: 'SOEGIRI-KEP / 001 / 568 / 2024',
    reviewReason: 'UMUR DOKUMEN HABIS',
    previousRevisionNumber: '00',
    oldFileName: 'legacy.pdf',
    oldFileType: 'application/pdf',
    oldFileUrl: '/api/storage/files/legacy',
    oldStoragePath: 'sidokter/spo/legacy.pdf',
  };

  const result = buildSopActivationTransition({ storedSuccessor: stored, submitted: stored, actor: admin });

  assert.equal(result.successor.status, 'AKTIF');
  assert.equal(result.successor.oldSopNumber, stored.previousSopNumber);
  assert.equal(result.successor.previousSopNumber, stored.previousSopNumber);
  assert.equal(result.successor.previousRevisionNumber, '00');
  assert.equal(result.successor.revisionNumber, '01');
});

test('external Riviu keeps stored source metadata authoritative when submitted values differ', () => {
  const stored = {
    ...baseDraft,
    jenis_spo: 'RIVIU',
    isReviewDocument: true,
    revisionNumber: '02',
    version: '02',
    oldSopNumber: 'LEGACY / ORIGINAL',
    reviewReason: 'Alasan tersimpan',
    previousRevisionNumber: '01',
    oldFileName: 'original.pdf',
    oldFileType: 'application/pdf',
    oldFileSize: 100,
    oldFileUrl: '/api/storage/files/original',
    oldStoragePath: 'sidokter/spo/original.pdf',
  };
  const submitted = {
    ...stored,
    oldSopNumber: 'LEGACY / CHANGED',
    reviewReason: 'Alasan diganti',
    previousRevisionNumber: '99',
    oldFileName: 'changed.pdf',
    oldFileUrl: '/api/storage/files/changed',
    oldStoragePath: 'sidokter/spo/changed.pdf',
    oldFileSize: 999,
  };

  const result = buildSopActivationTransition({ storedSuccessor: stored, submitted, actor: admin });

  assert.equal(result.successor.oldSopNumber, stored.oldSopNumber);
  assert.equal(result.successor.reviewReason, stored.reviewReason);
  assert.equal(result.successor.previousRevisionNumber, '01');
  assert.equal(result.successor.oldFileName, stored.oldFileName);
  assert.equal(result.successor.oldFileUrl, stored.oldFileUrl);
  assert.equal(result.successor.oldStoragePath, stored.oldStoragePath);
  assert.equal(result.successor.oldFileSize, 100);
});

test('external Riviu still rejects activation when required metadata is absent from both stored and submitted data', () => {
  const stored = {
    ...baseDraft,
    jenis_spo: 'RIVIU',
    isReviewDocument: true,
    revisionNumber: '02',
    version: '02',
    oldFileName: 'legacy.pdf',
    oldFileType: 'application/pdf',
    oldFileUrl: '/api/storage/files/legacy',
    oldStoragePath: 'sidokter/spo/legacy.pdf',
  };
  assert.throws(() => buildSopActivationTransition({
    storedSuccessor: stored,
    submitted: stored,
    actor: admin,
  }), /EXTERNAL_METADATA_REQUIRED/);
});

test('unresolved revision workflow blocks activation', () => {
  assert.throws(() => buildSopActivationTransition({
    storedSuccessor: { ...baseDraft, reviewState: 'REVISION_REQUESTED' },
    submitted: baseDraft,
    actor: admin,
  }), /REVIEW_NOT_COMPLETE/);
});


test('activation carries durable uploaded scan metadata without DataURL', () => {
  const result = buildSopActivationTransition({
    storedSuccessor: baseDraft,
    submitted: {
      ...baseDraft,
      activatedAt: '2026-09-24',
      signedScanFileName: 'scan-final.pdf',
      signedScanFileType: 'application/pdf',
      signedScanFileSize: 1234,
      signedScanUrl: '/api/storage/files/successor_signedScan',
      signedScanStoragePath: 'sidokter/spo/successor_signedScan.pdf',
      signedScanDataUrl: 'data:application/pdf;base64,AAAA',
    },
    actor: admin,
  });
  assert.equal(result.successor.signedScanFileName, 'scan-final.pdf');
  assert.equal(result.successor.signedScanFileSize, 1234);
  assert.equal(result.successor.signedScanUrl, '/api/storage/files/successor_signedScan');
  assert.equal(result.successor.signedScanStoragePath, 'sidokter/spo/successor_signedScan.pdf');
  assert.equal(Object.prototype.hasOwnProperty.call(result.successor, 'signedScanDataUrl'), false);
});
