const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeNumber, validateNumberCorrection, buildAdminNumberUpdate } = require('./sopNumberUpdate');

const stored = {
  id: 'sop-1', sopNumber: 'PEL / 001 / 2026', sequenceNumber: 1, status: 'AKTIF',
  documentType: 'BARU', revisionNumber: '02', version: '02', oldSopNumber: 'PEL / 099 / 2023',
  previousSopNumber: 'PEL / 099 / 2023', revisionHistory: [{ id: 'historical' }],
};

test('admin correction changes canonical number but preserves historical workflow metadata', () => {
  const submitted = { ...stored, sopNumber: 'PEL / 002 / 2026', sequenceNumber: 2, status: 'DRAFT', oldSopNumber: 'MUTATED', revisionHistory: [] };
  const number = validateNumberCorrection(stored, submitted, [stored]);
  const result = buildAdminNumberUpdate(stored, submitted, number);
  assert.equal(result.sopNumber, 'PEL / 002 / 2026');
  assert.equal(result.sequenceNumber, 2);
  assert.equal(result.status, 'AKTIF');
  assert.equal(result.oldSopNumber, 'PEL / 099 / 2023');
  assert.equal(result.previousSopNumber, 'PEL / 099 / 2023');
  assert.deepEqual(result.revisionHistory, [{ id: 'historical' }]);
});

test('normalization rejects duplicate and invalid current numbers', () => {
  assert.equal(normalizeNumber(' pel / 002 / 2026 '), 'PEL/002/2026');
  assert.throws(() => validateNumberCorrection(stored, { ...stored, sopNumber: ' pel/002/2026 ', sequenceNumber: 2 }, [{ id: 'other', sopNumber: 'PEL / 002 / 2026' }]), /sudah digunakan/);
  assert.throws(() => validateNumberCorrection(stored, { ...stored, sopNumber: 'INVALID', sequenceNumber: 2 }, [stored]), /Format nomor/);
});
