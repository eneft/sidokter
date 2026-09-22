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
