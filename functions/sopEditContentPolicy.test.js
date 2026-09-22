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
