import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCanEditExistingSop, canEditExistingSop, preserveSopWorkflowIdentity } from '../src/lib/sopEditPolicy';
import type { SopDocument, UserSession } from '../src/types';

const sop = (status: SopDocument['status']): SopDocument => ({
  id: 'spo-1', sopNumber: 'PEL / 001 / 2026', sequenceNumber: 1, title: 'Test',
  divisionId: 'pel', divisionCode: 'PEL', divisionName: 'Pelayanan', categoryId: 'pel',
  categoryName: 'Pelayanan', version: '00', revisionNumber: '00', status,
  effectiveDate: '2026-01-01', reviewPeriodMonths: 12, nextReviewDate: '2027-01-01',
  creatorName: 'Petugas', summary: '', tags: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  revisionHistory: [], confidentialityLevel: 'Internal',
});
const actor = (role: UserSession['role'], extras: Partial<UserSession> = {}): UserSession => ({
  username: role, name: role, role, sessionId: 'session', sessionCreatedAt: 1, lastActiveAt: 1,
  divisionCode: 'PEL', ...extras,
});

test('authorized user can edit only DRAFT', () => {
  assert.equal(canEditExistingSop(sop('DRAFT'), actor('user')), true);
  assert.equal(canEditExistingSop(sop('AKTIF'), actor('user')), false);
  assert.equal(canEditExistingSop(sop('DIARSIPKAN'), actor('user')), false);
});

test('STRUKTURAL and ALL do not become Admin for active edits', () => {
  assert.equal(canEditExistingSop(sop('AKTIF'), actor('user', { badges: ['STRUKTURAL'] })), false);
  assert.equal(canEditExistingSop(sop('AKTIF'), actor('user', { divisionCode: 'ALL' })), false);
});

test('stale Petugas save is rejected after the current document becomes active', () => {
  const staleEditorCopy = sop('DRAFT');
  assert.equal(canEditExistingSop(staleEditorCopy, actor('user')), true);
  assert.throws(
    () => assertCanEditExistingSop({ ...staleEditorCopy, status: 'AKTIF' }, actor('user')),
    /hanya dapat mengedit SPO berstatus DRAFT/,
  );
});

test('Admin can edit every status, correct current number, and preserve historical identity', () => {
  for (const status of ['DRAFT', 'AKTIF', 'DIARSIPKAN'] as const) {
    assert.equal(canEditExistingSop(sop(status), actor('admin')), true);
  }
  const stored = { ...sop('AKTIF'), jenis_spo: 'BARU' as const };
  const result = preserveSopWorkflowIdentity(stored, {
    ...stored, title: 'Changed', status: 'DRAFT', sopNumber: 'CHANGED', sequenceNumber: 99,
    revisionNumber: '01', version: '01', jenis_spo: 'RIVIU', existingSopId: 'other',
  }, actor('admin'));
  assert.equal(result.title, 'Changed');
  assert.deepEqual(
    [result.id, result.sopNumber, result.sequenceNumber, result.revisionNumber, result.version, result.status, result.jenis_spo, result.existingSopId],
    ['spo-1', 'CHANGED', 99, '00', '00', 'AKTIF', 'BARU', undefined],
  );
});

test('ordinary user cannot change canonical or historical numbers', () => {
  const stored = { ...sop('DRAFT'), oldSopNumber: 'OLD', previousSopNumber: 'PREVIOUS' };
  const result = preserveSopWorkflowIdentity(stored, {
    ...stored, sopNumber: 'CHANGED', sequenceNumber: 99, oldSopNumber: 'MUTATED', previousSopNumber: 'MUTATED',
  }, actor('user'));
  assert.equal(result.sopNumber, stored.sopNumber);
  assert.equal(result.sequenceNumber, stored.sequenceNumber);
  assert.equal(result.oldSopNumber, 'OLD');
  assert.equal(result.previousSopNumber, 'PREVIOUS');
});
