import { strict as assert } from 'node:assert';
import { getNextRevisionNumber } from '../src/utils/numbering';

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
