import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthoritativeRiviuRevision } from '../src/utils/riviuRevision';

test('Riviu revision uses predecessor revisionNumber as authority', () => {
  const result = getAuthoritativeRiviuRevision({
    revisionNumber: '01',
    version: '00',
  } as any, '00');

  assert.equal(result.previousRevisionNumber, '01');
  assert.equal(result.revisionNumber, '02');
});

test('Riviu revision falls back to predecessor version', () => {
  const result = getAuthoritativeRiviuRevision({ version: '02' } as any, '00');

  assert.equal(result.previousRevisionNumber, '02');
  assert.equal(result.revisionNumber, '03');
});
