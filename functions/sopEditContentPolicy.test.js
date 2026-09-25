'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertTrustedSopEditAllowed,
  buildTrustedSopContentUpdate,
} = require('./sopEditContentPolicy');

const base = {
  id: 'sop-1',
  status: 'DRAFT',
  sopNumber: 'PEN / 2.1.1 / 001 / 2026',
  sequenceNumber: 1,
  revisionNumber: '00',
  version: '00',
  jenis_spo: 'BARU',
  documentType: 'BARU',
  title: 'Judul lama',
  accessKeys: ['PEN', 'PEN|2', 'PEN|2.1', 'PEN|2.1.1'],
  authorizedUids: ['old-user'],
  reviewState: 'NONE',
  reviewHistory: [],
  everActivated: false,
};

test('admin can edit content of an active SPO while workflow identity stays immutable', () => {
  const stored = { ...base, status: 'AKTIF', everActivated: true, activatedAt: '2026-09-01', activatedBy: 'Direktur' };
  const submitted = { ...stored, title: 'Judul baru', reviewState: 'REVISION_REQUESTED', authorizedUids: [] };
  const next = buildTrustedSopContentUpdate({
    stored,
    submitted,
    actor: { role: 'admin' },
    hierarchyClaims: { hierarchyKeys: [], globalHierarchyAccess: true },
  });
  assert.equal(next.title, 'Judul baru');
  assert.equal(next.status, 'AKTIF');
  assert.equal(next.reviewState, 'NONE');
  assert.deepEqual(next.authorizedUids, ['old-user']);
  assert.equal(next.activatedAt, '2026-09-01');
});

test('newly granted hierarchy can edit a DRAFT even when authorizedUids index is stale', () => {
  assert.doesNotThrow(() => assertTrustedSopEditAllowed({
    stored: base,
    actor: { role: 'user' },
    hierarchyClaims: { hierarchyKeys: ['PEN', 'PEN|2', 'PEN|2.1', 'PEN|2.1.1'], globalHierarchyAccess: false },
  }));
});

test('unrelated user cannot edit a DRAFT', () => {
  assert.throws(() => assertTrustedSopEditAllowed({
    stored: base,
    actor: { role: 'user' },
    hierarchyClaims: { hierarchyKeys: ['PEL', 'PEL|1'], globalHierarchyAccess: false },
  }), /HIERARCHY_DENIED/);
});

test('normal user cannot edit ACTIVE SPO', () => {
  assert.throws(() => assertTrustedSopEditAllowed({
    stored: { ...base, status: 'AKTIF' },
    actor: { role: 'user' },
    hierarchyClaims: { hierarchyKeys: ['PEN|2.1.1'], globalHierarchyAccess: false },
  }), /DRAFT_REQUIRED/);
});

test('content edit cannot change registered number', () => {
  assert.throws(() => buildTrustedSopContentUpdate({
    stored: base,
    submitted: { ...base, sopNumber: 'PEN / 2.1.1 / 999 / 2026' },
    actor: { role: 'admin' },
    hierarchyClaims: { hierarchyKeys: [], globalHierarchyAccess: true },
  }), /NUMBER_CHANGE_REQUIRES_CORRECTION/);
});

test('trusted edit can repair absent identity on a legacy DRAFT Riviu but cannot overwrite it later', () => {
  const legacyDraft = {
    ...base,
    jenis_spo: 'RIVIU',
    documentType: 'RIVIU',
    isReviewDocument: true,
  };
  const submitted = {
    ...legacyDraft,
    oldSopNumber: 'PEN / 2.1.1 / 099 / 2024',
    previousSopNumber: 'PEN / 2.1.1 / 099 / 2024',
    previousRevisionNumber: '01',
    revisionNumber: '02',
    version: '02',
  };
  const repaired = buildTrustedSopContentUpdate({
    stored: legacyDraft,
    submitted,
    actor: { role: 'user' },
    hierarchyClaims: { hierarchyKeys: ['PEN|2.1.1'], globalHierarchyAccess: false },
  });
  assert.equal(repaired.oldSopNumber, submitted.oldSopNumber);
  assert.equal(repaired.previousRevisionNumber, '01');
  assert.equal(repaired.revisionNumber, '02');

  const immutable = buildTrustedSopContentUpdate({
    stored: repaired,
    submitted: { ...repaired, oldSopNumber: 'MUTATED', previousRevisionNumber: '99', revisionNumber: '100' },
    actor: { role: 'user' },
    hierarchyClaims: { hierarchyKeys: ['PEN|2.1.1'], globalHierarchyAccess: false },
  });
  assert.equal(immutable.oldSopNumber, submitted.oldSopNumber);
  assert.equal(immutable.previousRevisionNumber, '01');
  assert.equal(immutable.revisionNumber, '02');
});

test('trusted edit repairs legacy Riviu identity when Firestore keys exist but are blank', () => {
  const legacyDraft = {
    ...base,
    jenis_spo: 'RIVIU',
    documentType: 'RIVIU',
    isReviewDocument: true,
    oldSopNumber: '',
    previousSopNumber: '',
    previousRevisionNumber: '',
  };
  const submitted = {
    ...legacyDraft,
    oldSopNumber: 'SOEGIRI-KEP / 001 / 568 / 2024',
    previousSopNumber: 'SOEGIRI-KEP / 001 / 568 / 2024',
    previousRevisionNumber: '00',
    revisionNumber: '01',
    version: '01',
    reviewReason: 'Umur dokumen habis',
  };

  const repaired = buildTrustedSopContentUpdate({
    stored: legacyDraft,
    submitted,
    actor: { role: 'user' },
    hierarchyClaims: { hierarchyKeys: ['PEN|2.1.1'], globalHierarchyAccess: false },
  });

  assert.equal(repaired.oldSopNumber, 'SOEGIRI-KEP / 001 / 568 / 2024');
  assert.equal(repaired.previousSopNumber, 'SOEGIRI-KEP / 001 / 568 / 2024');
  assert.equal(repaired.previousRevisionNumber, '00');
  assert.equal(repaired.revisionNumber, '01');
  assert.equal(repaired.version, '01');
  assert.equal(repaired.reviewReason, 'Umur dokumen habis');
});
