import test from 'node:test';
import assert from 'node:assert/strict';
import type { SopDocument } from '../src/types';
import { findArchivedSopRelations } from '../src/utils/sopArchiveRelations';

const base = (overrides: Partial<SopDocument>): SopDocument => ({
  id: 'sop-base',
  sopNumber: 'PEN / 1.3 / 001 / 2026',
  sequenceNumber: 1,
  title: 'SPO Base',
  divisionId: 'PEN',
  divisionCode: 'PEN',
  divisionName: 'PEN',
  categoryId: 'PEN',
  categoryName: 'PEN',
  version: '00',
  status: 'DIARSIPKAN',
  effectiveDate: '2026-01-01',
  reviewPeriodMonths: 12,
  nextReviewDate: '2027-01-01',
  creatorName: 'Admin',
  summary: '',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  revisionHistory: [],
  confidentialityLevel: 'Internal',
  ...overrides,
});

test('finds successors linked by canonical predecessor id', () => {
  const target = base({ id: 'sop-100' });
  const successor = base({
    id: 'sop-200',
    sopNumber: 'PEN / 1.3 / 002 / 2026',
    title: 'Hasil Riviu',
    status: 'AKTIF',
    existingSopId: 'sop-100',
  });
  const result = findArchivedSopRelations(target, [target, successor]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].reasons, ['existingSopId']);
});

test('detects legacy number references without mutating successors', () => {
  const target = base({ id: 'sop-100', sopNumber: 'PEN / 1.3 / 001 / 2026' });
  const successor = base({
    id: 'sop-201',
    sopNumber: 'PEN / 1.3 / 003 / 2026',
    status: 'DRAFT',
    oldSopNumber: 'PEN/1.3/001/2026',
    previousSopNumber: 'PEN / 1.3 / 001 / 2026',
  });
  const before = structuredClone(successor);
  const result = findArchivedSopRelations(target, [target, successor]);
  assert.equal(result.length, 1);
  assert.deepEqual(new Set(result[0].reasons), new Set(['oldSopNumber', 'previousSopNumber']));
  assert.deepEqual(successor, before);
});

test('unrelated SPOs do not trigger a warning', () => {
  const target = base({ id: 'sop-100' });
  const other = base({ id: 'sop-300', sopNumber: 'PEN / 1.3 / 009 / 2026', status: 'AKTIF' });
  assert.deepEqual(findArchivedSopRelations(target, [target, other]), []);
});
