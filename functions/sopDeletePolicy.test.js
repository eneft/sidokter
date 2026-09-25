'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decideSopDeleteAction } = require('./sopDeletePolicy');

test('Admin may permanently delete an archived SPO only with explicit intent', () => {
  const stored = { status: 'DIARSIPKAN', everActivated: true, activatedAt: '2026-01-01' };
  assert.equal(decideSopDeleteAction({ stored, isAdmin: true, isCreator: false }), 'ARCHIVE');
  assert.equal(decideSopDeleteAction({
    stored,
    isAdmin: true,
    isCreator: false,
    permanentArchiveDeleteRequested: true,
  }), 'DELETE_ARCHIVE');
});

test('non-admin can never permanently delete an archived SPO', () => {
  assert.throws(
    () => decideSopDeleteAction({
      stored: { status: 'DIARSIPKAN', everActivated: true },
      isAdmin: false,
      isCreator: true,
      permanentArchiveDeleteRequested: true,
    }),
    (error) => error?.sopDeleteStatus === 403 && error?.sopDeleteCode === 'PERMISSION_DENIED'
  );
});

test('active official SPO remains archive-only', () => {
  assert.equal(decideSopDeleteAction({
    stored: { status: 'AKTIF', everActivated: true },
    isAdmin: true,
    isCreator: false,
    permanentArchiveDeleteRequested: true,
  }), 'ARCHIVE');
});

test('draft delete permissions and lifecycle remain unchanged', () => {
  const draft = { status: 'DRAFT', everActivated: false };
  assert.equal(decideSopDeleteAction({ stored: draft, isAdmin: true, isCreator: false }), 'DELETE_DRAFT');
  assert.equal(decideSopDeleteAction({ stored: draft, isAdmin: false, isCreator: true }), 'DELETE_DRAFT');
  assert.throws(
    () => decideSopDeleteAction({ stored: draft, isAdmin: false, isCreator: false }),
    (error) => error?.sopDeleteStatus === 403
  );
});
