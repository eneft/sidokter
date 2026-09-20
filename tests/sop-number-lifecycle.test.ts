import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextLifecycleSequence, getNumberingSequenceScope } from '../src/utils/numbering';

test('deleted DRAFT slot is reused before high-water mark advances', () => {
  const result = getNextLifecycleSequence(9, 9, [8]);
  assert.equal(result.sequenceNumber, 8);
  assert.deepEqual(result.remainingReusable, []);
});

test('smallest reusable DRAFT slot wins deterministically', () => {
  const result = getNextLifecycleSequence(12, 12, [11, 8, 10, 8]);
  assert.equal(result.sequenceNumber, 8);
  assert.deepEqual(result.remainingReusable, [10, 11]);
});

test('without released DRAFT slot allocator remains monotonic', () => {
  assert.equal(getNextLifecycleSequence(8, 9, []).sequenceNumber, 10);
  assert.equal(getNextLifecycleSequence(12, 9, []).sequenceNumber, 13);
});

test('number lifecycle queue is isolated by year + division + hierarchy', () => {
  const a = getNumberingSequenceScope('2026', 'PEN', '1.3');
  const b = getNumberingSequenceScope('2026', 'PEN', '1.4');
  const c = getNumberingSequenceScope('2025', 'PEN', '1.3');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  // A released 008 in 1.3 is therefore stored in a different Firestore sequence
  // document from an occupied 008 in 1.4.
  assert.equal(getNextLifecycleSequence(9, 9, [8]).sequenceNumber, 8);
});

test('invalid reusable values cannot corrupt allocation', () => {
  const result = getNextLifecycleSequence(5, 5, [0, -1, 'x', 3, 3]);
  assert.equal(result.sequenceNumber, 3);
  assert.deepEqual(result.remainingReusable, []);
});

test('stale reusable slot that is still occupied is never reissued', () => {
  const result = getNextLifecycleSequence(9, 9, [8], [8]);
  assert.equal(result.sequenceNumber, 10);
  assert.deepEqual(result.remainingReusable, []);
});

test('allocator skips occupied reusable slot and takes next free released draft', () => {
  const result = getNextLifecycleSequence(12, 12, [8, 10, 11], [8, 11]);
  assert.equal(result.sequenceNumber, 10);
  assert.deepEqual(result.remainingReusable, []);
});

test('occupied high-water successor is skipped defensively', () => {
  const result = getNextLifecycleSequence(9, 9, [], [10, 11]);
  assert.equal(result.sequenceNumber, 12);
});
