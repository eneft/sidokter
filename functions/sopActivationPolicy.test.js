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

test('unresolved revision workflow blocks activation', () => {
  assert.throws(() => buildSopActivationTransition({
    storedSuccessor: { ...baseDraft, reviewState: 'REVISION_REQUESTED' },
    submitted: baseDraft,
    actor: admin,
  }), /REVIEW_NOT_COMPLETE/);
});
