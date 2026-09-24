'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');

test('existing SPO content edit uses trusted SIDOKTER session boundary', () => {
  const source = read('src/lib/firestoreService.ts');
  assert.match(source, /import \{ callAuthenticatedAuthApi \} from ['"]\.\/authService['"]/);
  assert.match(source, /callAuthenticatedAuthApi\(['"]sop-edit['"],\s*\{\s*sop:/s);

  const start = source.indexOf('export async function updateExistingSopInFirestore');
  const end = source.indexOf('/** Authoritative, all-or-nothing lifecycle transition for a Riviu.', start);
  assert.ok(start >= 0 && end > start, 'updateExistingSopInFirestore function must be present');
  const editBoundary = source.slice(start, end);
  assert.doesNotMatch(editBoundary, /runTransaction\(db/);
});

test('trusted authApi exposes server-side sop-edit action', () => {
  const source = read('functions/index.js');
  assert.match(source, /require\(['"]\.\/sopEditContentPolicy['"]\)/);
  assert.match(source, /if \(action === ['"]sop-edit['"]\)/);
  assert.match(source, /buildTrustedSopContentUpdate/);
  assert.match(source, /SOP_EDITED/);
});

test('edit path retains previous number for dedicated number-correction routing', () => {
  const source = read('src/lib/sopService.ts');
  assert.match(source, /updateExistingSopInFirestore\(next, options\.editActor, previous\?\.sopNumber\)/);
});

test('initial Firestore DRAFT persists Riviu identity and never hides a failed authoritative save', () => {
  const source = read('src/lib/firestoreService.ts');
  const start = source.indexOf('const draftPayload = sanitizeForFirestore({');
  const end = source.indexOf('await setDoc(docRef, draftPayload', start);
  assert.ok(start >= 0 && end > start, 'initial draft payload must be present');
  const payload = source.slice(start, end);
  for (const field of [
    'isReviewDocument', 'existingSopId', 'oldSopNumber', 'previousSopNumber',
    'previousRevisionNumber', 'reviewReason', 'externalReviewSignedConfirmed',
    'oldFileUrl', 'oldStoragePath', 'supportingEvidence',
  ]) {
    assert.match(payload, new RegExp(field), `${field} must be persisted in the first DRAFT write`);
  }
  assert.match(source, /if \(options\?\.throwOnError\) \{\s*throw apiErr/s);
});

test('Edit Draft Riviu exposes required identity and missing external source controls', () => {
  const source = read('src/components/EditSopModal.tsx');
  assert.match(source, /Identitas &amp; Kelengkapan Wajib Riviu/);
  assert.match(source, /Nomor SPO Lama/);
  assert.match(source, /Alasan Riviu &amp; Catatan Perubahan/);
  assert.match(source, /PDF sumber SPO lama wajib diunggah/);
  assert.match(source, /requiresExternalReviewPdf/);
  assert.match(source, /isReview && reuploadOldDataUrl/);
});

test('activation uses a dedicated lifecycle transaction after Draft metadata is persisted', () => {
  const app = read('src/App.tsx');
  const firestore = read('src/lib/firestoreService.ts');
  assert.match(app, /const preparedDraft = await saveSopToLocal/);
  assert.match(app, /activateStandaloneSopInFirestore/);
  assert.match(firestore, /export async function activateStandaloneSopInFirestore/);
  assert.match(firestore, /if \(isExternalRiviu\)/);
  assert.match(firestore, /PDF sumber Riviu eksternal belum tersimpan di Firebase Storage/);
});
