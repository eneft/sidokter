import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthoritativeRiviuRevision, findAuthoritativeRiviuPredecessor } from '../src/utils/riviuRevision';
import { SopDocument } from '../src/types';

test('Riviu revision mandatory case: 00 -> 01', () => {
  const result = getAuthoritativeRiviuRevision({
    revisionNumber: '00',
  } as SopDocument);

  assert.equal(result.previousRevisionNumber, '00');
  assert.equal(result.revisionNumber, '01');
});

test('Riviu revision mandatory case: 01 -> 02', () => {
  const result = getAuthoritativeRiviuRevision({
    revisionNumber: '01',
  } as SopDocument);

  assert.equal(result.previousRevisionNumber, '01');
  assert.equal(result.revisionNumber, '02');
});

test('Riviu revision mandatory case: 09 -> 10', () => {
  const result = getAuthoritativeRiviuRevision({
    revisionNumber: '09',
  } as SopDocument);

  assert.equal(result.previousRevisionNumber, '09');
  assert.equal(result.revisionNumber, '10');
});

test('Riviu revision ignores stale form state and uses predecessor as authority', () => {
  const result = getAuthoritativeRiviuRevision({
    revisionNumber: '01',
    version: '01',
  } as SopDocument, '99'); // Stale fallback '99' should be ignored

  assert.equal(result.previousRevisionNumber, '01');
  assert.equal(result.revisionNumber, '02');
});

test('Riviu revision falls back to predecessor version when revisionNumber missing', () => {
  const result = getAuthoritativeRiviuRevision({ version: '02' } as SopDocument, '00');

  assert.equal(result.previousRevisionNumber, '02');
  assert.equal(result.revisionNumber, '03');
});

test('Riviu predecessor lookup finds by existingSopId first', () => {
  const sops = [
    { id: 'sop-1', sopNumber: 'PEL/1.1.3/001/2026', status: 'AKTIF', revisionNumber: '00' },
    { id: 'sop-2', sopNumber: 'PEL/1.1.3/002/2026', status: 'AKTIF', revisionNumber: '01' },
  ] as SopDocument[];

  const found = findAuthoritativeRiviuPredecessor(sops, { existingSopId: 'sop-2' });
  assert.equal(found?.id, 'sop-2');
  assert.equal(found?.revisionNumber, '01');
});

test('Riviu predecessor lookup falls back to oldSopNumber with normalization and prefers AKTIF', () => {
  const sops = [
    { id: 'sop-archived', sopNumber: 'PEL / 1.1.3 / 001 / 2026', status: 'DIARSIPKAN', revisionNumber: '00' },
    { id: 'sop-active', sopNumber: 'PEL/1.1.3/001/2026', status: 'AKTIF', revisionNumber: '01' },
  ] as SopDocument[];

  const found = findAuthoritativeRiviuPredecessor(sops, { oldSopNumber: 'PEL / 1.1.3 / 001 / 2026' });
  assert.equal(found?.id, 'sop-active');
  assert.equal(found?.revisionNumber, '01');
});

test('Riviu manual input: calculates revision when predecessor is null or undefined', () => {
  const res00 = getAuthoritativeRiviuRevision(null, '00');
  assert.equal(res00.previousRevisionNumber, '00');
  assert.equal(res00.revisionNumber, '01');

  const res01 = getAuthoritativeRiviuRevision(undefined, '01');
  assert.equal(res01.previousRevisionNumber, '01');
  assert.equal(res01.revisionNumber, '02');

  const resEmpty = getAuthoritativeRiviuRevision(null, '');
  assert.equal(resEmpty.previousRevisionNumber, '');
  assert.equal(resEmpty.revisionNumber, '');
});
