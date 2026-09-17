import { strict as assert } from 'node:assert';
import { getNextRevisionNumber, getNextTransactionalSequence, getNumberingSequenceScope } from '../src/utils/numbering';

const validCases: Array<[string, string]> = [
  ['00', '01'], ['01', '02'], ['02', '03'], ['08', '09'],
  ['09', '10'], ['10', '11'], ['11', '12'], ['99', '100'],
];

for (const [current, expected] of validCases) {
  assert.equal(getNextRevisionNumber(current), expected, `${current} should increment to ${expected}`);
}

for (const invalid of ['', ' ', 'A', 'A1', '-1']) {
  assert.throws(() => getNextRevisionNumber(invalid), /wajib berupa angka/, `${JSON.stringify(invalid)} should be rejected`);
}

console.log('Revision tests passed:', validCases.length, 'valid and 5 invalid cases.');

// Model Firestore's retry: request B must recompute after request A commits 101.
const requestA = getNextTransactionalSequence(100, 100);
const requestBAfterRetry = getNextTransactionalSequence(requestA, 100);
assert.equal(requestA, 101);
assert.equal(requestBAfterRetry, 102);
assert.notEqual(getNumberingSequenceScope('2026', 'PEL', '1.1'), getNumberingSequenceScope('2026', 'PEL', '1.2'));
assert.notEqual(getNumberingSequenceScope('2026', 'PEL', '1.1'), getNumberingSequenceScope('2027', 'PEL', '1.1'));
console.log('Transactional numbering tests passed: retry increment and hierarchy/year isolation.');
