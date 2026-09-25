const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('archived SPO permanent delete is explicit and trusted-backend only', () => {
  const firestore = readFileSync('src/lib/firestoreService.ts', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  const backend = readFileSync('functions/index.js', 'utf8');
  assert.match(firestore, /intent:\s*'PERMANENT_ARCHIVE_DELETE'/);
  assert.match(app, /permanentArchived = status === 'DIARSIPKAN'/);
  assert.match(backend, /deleteDecision === 'DELETE_ARCHIVE'/);
  assert.match(backend, /action:\s*'SOP_ARCHIVE_DELETED'/);
  assert.match(backend, /referencesPreserved:\s*true/);
  assert.match(backend, /numberRecycled:\s*false/);
});

test('archive dependency UI is warning-only and does not cascade', () => {
  const modal = readFileSync('src/components/DeleteConfirmModal.tsx', 'utf8');
  const backend = readFileSync('functions/index.js', 'utf8');
  assert.match(modal, /Penghapusan tetap dapat dilanjutkan/);
  assert.match(modal, /metadata referensi historisnya tetap dipertahankan/);
  assert.doesNotMatch(backend, /transaction\.delete\([^)]*(successor|related|dependent)/i);
});
