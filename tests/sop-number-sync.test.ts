import test from 'node:test';
import assert from 'node:assert/strict';
import { standardizeAllSops } from '../src/utils/numbering';
import type { SopDocument, SopNumberReservation } from '../src/types';

const makeSop = (id: string, seq: number, status: SopDocument['status'] = 'AKTIF'): SopDocument => ({
  id,
  sopNumber: `PEL / 1.1 / ${String(seq).padStart(3, '0')} / 2026`,
  sequenceNumber: seq,
  title: id,
  divisionId: 'PEL',
  divisionCode: 'PEL',
  divisionName: 'Pelayanan',
  categoryId: 'PEL',
  categoryName: 'Pelayanan',
  version: '00',
  status,
  effectiveDate: '2026-01-01',
  reviewPeriodMonths: 12,
  nextReviewDate: '2027-01-01',
  creatorName: 'Tester',
  summary: '',
  tags: [],
  subHierarchyCode: '1.1',
  createdAt: `2026-01-0${Math.min(seq, 9)}T00:00:00.000Z`,
  updatedAt: '2026-01-01T00:00:00.000Z',
  revisionHistory: [],
  confidentialityLevel: 'Internal',
  documentType: 'BARU',
  jenis_spo: 'BARU',
});

const reserved = (seq: number): SopNumberReservation => ({
  id: `r-${seq}`,
  divisionCode: 'PEL',
  subHierarchyCode: '1.1',
  sequenceNumber: seq,
  sopNumber: `PEL / 1.1 / ${String(seq).padStart(3, '0')} / 2026`,
  year: '2026',
  reservedBy: 'Admin',
  reservedAt: '2026-01-01T00:00:00.000Z',
  status: 'RESERVED',
});

const staleUsed = (seq: number): SopNumberReservation => ({
  id: `stale-${seq}`,
  divisionCode: 'PEL',
  subHierarchyCode: '1.1',
  sequenceNumber: seq,
  sopNumber: `PEL / 1.1 / ${String(seq).padStart(3, '0')} / 2026`,
  year: '2026',
  reservedBy: 'Admin',
  reservedAt: '2026-01-01T00:00:00.000Z',
  status: 'USED',
  purpose: 'SYSTEM_DOCUMENT',
  usedDocumentId: 'deleted-draft',
});

test('preview compacts 001,003,004 into 001,002,003', () => {
  const result = standardizeAllSops([makeSop('a', 1), makeSop('b', 3), makeSop('c', 4)]);
  assert.equal(result.changedCount, 2);
  assert.deepEqual(result.updatedSops.map((row) => row.sequenceNumber), [1, 2, 3]);
});

test('preview keeps archived slot locked', () => {
  const result = standardizeAllSops([
    makeSop('a', 1),
    makeSop('archived', 2, 'DIARSIPKAN'),
    makeSop('c', 4),
  ]);
  const byId = new Map(result.updatedSops.map((row) => [row.id, row]));
  assert.equal(byId.get('archived')?.sequenceNumber, 2);
  assert.equal(byId.get('c')?.sequenceNumber, 3);
});

test('preview skips an active Nomor Terbit reservation', () => {
  const result = standardizeAllSops([makeSop('a', 1), makeSop('c', 4)], [reserved(2)]);
  const byId = new Map(result.updatedSops.map((row) => [row.id, row]));
  assert.equal(byId.get('c')?.sequenceNumber, 3);
});

test('preview does not let stale USED claim block deleted-draft gap', () => {
  const result = standardizeAllSops([makeSop('a', 1), makeSop('c', 3)], [staleUsed(2)]);
  const byId = new Map(result.updatedSops.map((row) => [row.id, row]));
  assert.equal(result.changedCount, 1);
  assert.equal(byId.get('c')?.sequenceNumber, 2);
  assert.equal(byId.get('c')?.sopNumber, 'PEL / 1.1 / 002 / 2026');
});
