'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const firestoreClient = fs.readFileSync('src/lib/firestoreService.ts', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const main = fs.readFileSync('functions/main.js', 'utf8');
const allocatorSource = fs.readFileSync('functions/sopNumberAllocator.js', 'utf8');
const allocator = require('../functions/sopNumberAllocator')._test;

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing start marker: ${startMarker}`);
  assert.ok(end > start, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('system_config sequence ledger remains fail-closed to ordinary clients', () => {
  assert.match(
    rules,
    /match \/system_config\/\{configId\}\s*\{\s*allow read:\s*if signedIn\(\);\s*allow write:\s*if isAdmin\(\);\s*\}/s
  );
});

test('Nomor Terbit uses trusted callable instead of browser transaction', () => {
  const block = between(
    firestoreClient,
    'export async function reserveNextSopNumberInFirestore',
    'export async function fetchSopNumberReservationsFromFirestore'
  );
  assert.match(block, /httpsCallable\(functions,\s*'allocateSopNumber'\)/);
  assert.match(block, /allocationMode:\s*'RESERVATION'/);
  assert.doesNotMatch(block, /runTransaction\s*\(/);
  assert.doesNotMatch(block, /system_config/);
});

test('SPO Baru/Riviu allocation uses the same trusted sequence boundary', () => {
  const block = between(
    firestoreClient,
    '// Handle official number allocation through the trusted backend.',
    '// Clean payload for backend and client sync'
  );
  assert.match(block, /httpsCallable\(functions,\s*'allocateSopNumber'\)/);
  assert.match(block, /allocationMode:\s*'DOCUMENT'/);
  assert.doesNotMatch(block, /getNextLifecycleSequence\s*\(/);
  assert.doesNotMatch(block, /getDocs\s*\(/);
});

test('trusted allocator is exported in asia-southeast2 and owns sequence writes', () => {
  assert.match(main, /exports\.allocateSopNumber\s*=\s*require\('\.\/sopNumberAllocator'\)\.allocateSopNumber/);
  assert.match(allocatorSource, /onCall\(\{\s*region:\s*'asia-southeast2'/);
  assert.match(allocatorSource, /collection\('system_config'\)\.doc\(`spo_sequence_\$\{sequenceKey\}`\)/);
  assert.match(allocatorSource, /transaction\.set\(sequenceRef,/);
});

test('allocator reuses only explicitly released unoccupied sequences', () => {
  assert.deepEqual(
    allocator.getNextLifecycleSequence(9, 9, [4, 6, 8], new Set([4, 8])),
    { sequenceNumber: 6, remainingReusable: [] }
  );
  assert.deepEqual(
    allocator.getNextLifecycleSequence(9, 11, [], new Set([12])),
    { sequenceNumber: 13, remainingReusable: [] }
  );
});

test('hierarchy authorization allows assigned branch descendants but rejects siblings', () => {
  const profile = {
    role: 'user',
    divisionCode: 'PEN',
    assignments: [{ divisionCode: 'PEN', hierarchyCode: '1.3' }],
  };
  assert.equal(allocator.profileHasHierarchyAccess(profile, 'PEN', '1.3.2', false), true);
  assert.equal(allocator.profileHasHierarchyAccess(profile, 'PEN', '1.4', false), false);
  assert.equal(allocator.profileHasHierarchyAccess(profile, 'PEL', '1.3', false), false);
});
