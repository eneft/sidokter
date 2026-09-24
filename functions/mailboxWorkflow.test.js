"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveSopMailboxEvents, TOMBSTONE_RETENTION_MS } = require('./mailboxWorkflow');

test('proposal event is emitted only when activation request timestamp changes', () => {
  assert.deepEqual(deriveSopMailboxEvents(
    { status: 'DRAFT', activationRequestedAt: '' },
    { status: 'DRAFT', activationRequestedAt: '2026-09-25T01:00:00.000Z' }
  ), ['SOP_ACTIVATION_REQUESTED']);
  assert.deepEqual(deriveSopMailboxEvents(
    { status: 'DRAFT', activationRequestedAt: 'same' },
    { status: 'DRAFT', activationRequestedAt: 'same' }
  ), []);
});

test('activation and review transitions emit specific workflow event types', () => {
  assert.deepEqual(deriveSopMailboxEvents(
    { status: 'DRAFT', reviewState: 'REVISION_SUBMITTED' },
    { status: 'AKTIF', reviewState: 'VERIFIED', activatedAt: '2026-09-25T02:00:00.000Z' }
  ), ['SOP_ACTIVATED', 'SOP_VERIFIED']);
});

test('tombstone retention is finite', () => {
  assert.equal(TOMBSTONE_RETENTION_MS, 90 * 24 * 60 * 60 * 1000);
});
