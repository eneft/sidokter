const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSequentialSyncPlan } = require('./sopNumberSyncPolicy');

const base = {
  divisionCode: 'PEL',
  subHierarchyCode: '1.1',
  effectiveDate: '2026-01-01',
  documentType: 'BARU',
  jenis_spo: 'BARU',
  status: 'AKTIF',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function sop(id, sequenceNumber, status = 'AKTIF') {
  return {
    ...base,
    id,
    title: id,
    status,
    sequenceNumber,
    sopNumber: `PEL / 1.1 / ${String(sequenceNumber).padStart(3, '0')} / 2026`,
  };
}

function reservation(sequenceNumber) {
  return {
    id: `sop-number-${sequenceNumber}`,
    divisionCode: 'PEL',
    subHierarchyCode: '1.1',
    sequenceNumber,
    sopNumber: `PEL / 1.1 / ${String(sequenceNumber).padStart(3, '0')} / 2026`,
    year: '2026',
    status: 'RESERVED',
    reservedAt: '2026-01-01T00:00:00.000Z',
    reservedBy: 'Admin',
  };
}

function staleUsedReservation(sequenceNumber, usedDocumentId = 'deleted-draft') {
  return {
    id: `stale-used-${sequenceNumber}`,
    divisionCode: 'PEL',
    subHierarchyCode: '1.1',
    sequenceNumber,
    sopNumber: `PEL / 1.1 / ${String(sequenceNumber).padStart(3, '0')} / 2026`,
    year: '2026',
    status: 'USED',
    purpose: 'SYSTEM_DOCUMENT',
    usedDocumentId,
    reservedAt: '2026-01-01T00:00:00.000Z',
    reservedBy: 'Admin',
  };
}

test('fills ordinary numbering gaps sequentially', () => {
  const plan = buildSequentialSyncPlan([sop('a', 1), sop('b', 3), sop('c', 4)], []);
  assert.equal(plan.changedCount, 2);
  assert.deepEqual(plan.changes.map((row) => row.newNumber), [
    'PEL / 1.1 / 002 / 2026',
    'PEL / 1.1 / 003 / 2026',
  ]);
});

test('archived number locks its historical slot', () => {
  const plan = buildSequentialSyncPlan([
    sop('a', 1),
    sop('archived', 2, 'DIARSIPKAN'),
    sop('c', 4),
  ], []);
  assert.equal(plan.lockedConflictCount, 0);
  assert.equal(plan.changedCount, 1);
  assert.equal(plan.changes[0].newNumber, 'PEL / 1.1 / 003 / 2026');
  assert.deepEqual(plan.scopes[0].lockedSequences, [2]);
});

test('reserved number also locks its slot while awaiting use', () => {
  const plan = buildSequentialSyncPlan([sop('a', 1), sop('c', 4)], [reservation(2)]);
  assert.equal(plan.changedCount, 1);
  assert.equal(plan.changes[0].newNumber, 'PEL / 1.1 / 003 / 2026');
  assert.deepEqual(plan.scopes[0].lockedSequences, [2]);
});

test('stale USED claim from deleted draft does not lock a numbering gap', () => {
  const plan = buildSequentialSyncPlan(
    [sop('a', 1), sop('c', 3)],
    [staleUsedReservation(2)]
  );
  assert.equal(plan.lockedConflictCount, 0);
  assert.equal(plan.changedCount, 1);
  assert.equal(plan.changes[0].id, 'c');
  assert.equal(plan.changes[0].newNumber, 'PEL / 1.1 / 002 / 2026');
  assert.deepEqual(plan.scopes[0].lockedSequences, []);
  assert.ok(plan.warnings.some((row) => row.type === 'STALE_USED_RESERVATION' && row.reservationId === 'stale-used-2'));
});

test('USED claim that still points to a real document follows that document and does not lock independently', () => {
  const docs = [sop('a', 1), sop('c', 3)];
  const usedClaim = staleUsedReservation(3, 'c');
  usedClaim.id = 'used-c';
  const plan = buildSequentialSyncPlan(docs, [usedClaim]);
  assert.equal(plan.changedCount, 1);
  assert.equal(plan.changes[0].newNumber, 'PEL / 1.1 / 002 / 2026');
  assert.ok(!plan.warnings.some((row) => row.type === 'STALE_USED_RESERVATION'));
});

test('locked conflict is detected instead of mutating historical slots', () => {
  const plan = buildSequentialSyncPlan([
    sop('archived-a', 2, 'DIARSIPKAN'),
    sop('archived-b', 2, 'DIARSIPKAN'),
  ], []);
  assert.equal(plan.lockedConflictCount, 1);
});

test('legacy/existing SPO is excluded from standard renumbering', () => {
  const legacy = {
    ...sop('legacy', 99),
    documentType: 'LAMA',
    jenis_spo: 'EKSISTING',
    isLegacySop: true,
    sopNumber: 'SOEGIRI-KEP / 001 / 568 / 2024',
  };
  const plan = buildSequentialSyncPlan([legacy, sop('a', 3)], []);
  assert.equal(plan.changedCount, 1);
  assert.equal(plan.changes[0].id, 'a');
  assert.equal(plan.changes[0].newNumber, 'PEL / 1.1 / 001 / 2026');
});

test('reusable ledger contains free slots below a higher archived number', () => {
  const plan = buildSequentialSyncPlan([
    sop('a', 1),
    sop('archived', 5, 'DIARSIPKAN'),
  ], []);
  assert.deepEqual(plan.scopes[0].reusableSequences, [2, 3, 4]);
  assert.equal(plan.scopes[0].lastSequence, 5);
});
