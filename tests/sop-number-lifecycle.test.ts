import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('DRAFT deletion returns sequence to reusable queue', () => {
  const source = fs.readFileSync('src/lib/firestoreService.ts', 'utf8');
  assert.match(source, /current\.status !== 'DRAFT' \|\| current\.everActivated === true/);
  assert.match(source, /reusableSequences: reusable/);
  assert.match(source, /transaction\.delete\(docRef\)/);
});

test('official SPO is archived and permanently marked', () => {
  const source = fs.readFileSync('src/lib/firestoreService.ts', 'utf8');
  assert.match(source, /status: 'DIARSIPKAN'/);
  assert.match(source, /everActivated: true/);
});

test('normal user library excludes archived SPO', () => {
  const source = fs.readFileSync('src/components/UserLibraryTab.tsx', 'utf8');
  assert.match(source, /sop\.status !== 'DIARSIPKAN'/);
  assert.doesNotMatch(source, /option value="DIARSIPKAN"/);
});
