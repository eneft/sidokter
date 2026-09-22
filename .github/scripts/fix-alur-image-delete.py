from pathlib import Path

modal = Path('src/components/EditSopModal.tsx')
text = modal.read_text()
old = '      alur: normalizedAlur || undefined,\n'
new = '      // Empty ALUR is an intentional edit (for example after deleting the last bagan/image).\n      // Persist an explicit empty string so Firestore merge semantics clear the old HTML instead\n      // of silently retaining the previous image when an undefined field is omitted.\n      alur: normalizedAlur,\n'
if text.count(old) != 1:
    raise SystemExit(f'EditSopModal ALUR target mismatch: {text.count(old)}')
modal.write_text(text.replace(old, new, 1))

package = Path('package.json')
pkg = package.read_text()
old_script = '"test:sop-edit": "tsx --test tests/sop-edit-policy.test.ts && node --test functions/sopNumberUpdate.test.js functions/sopEditContentPolicy.test.js tests/sop-edit-trusted-boundary.test.cjs"'
new_script = '"test:sop-edit": "tsx --test tests/sop-edit-policy.test.ts && node --test functions/sopNumberUpdate.test.js functions/sopEditContentPolicy.test.js tests/sop-edit-trusted-boundary.test.cjs tests/sop-alur-image-delete.test.cjs"'
if pkg.count(old_script) != 1:
    raise SystemExit(f'package test:sop-edit target mismatch: {pkg.count(old_script)}')
package.write_text(pkg.replace(old_script, new_script, 1))

Path('tests/sop-alur-image-delete.test.cjs').write_text(r'''\
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildTrustedSopContentUpdate } = require('../functions/sopEditContentPolicy');

test('EditSopModal persists empty ALUR instead of omitting the field', () => {
  const source = fs.readFileSync('src/components/EditSopModal.tsx', 'utf8');
  assert.match(source, /alur:\s*normalizedAlur,/);
  assert.doesNotMatch(source, /alur:\s*normalizedAlur\s*\|\|\s*undefined/);
});

test('trusted SPO edit clears an old ALUR image when submitted ALUR is empty', () => {
  const stored = {
    id: 'sop-image-delete',
    status: 'DRAFT',
    sopNumber: 'PEN / 1.1 / 001 / 2026',
    sequenceNumber: 1,
    revisionNumber: '00',
    version: '00',
    jenis_spo: 'BARU',
    documentType: 'BARU',
    accessKeys: ['PEN', 'PEN|1', 'PEN|1.1'],
    alur: '<div class="figure-wrapper"><img src="data:image/png;base64,OLD_IMAGE"></div>',
  };
  const submitted = { ...stored, alur: '' };
  const next = buildTrustedSopContentUpdate({
    stored,
    submitted,
    actor: { role: 'admin' },
    hierarchyClaims: { hierarchyKeys: [], globalHierarchyAccess: true },
  });

  assert.equal(next.alur, '');
  assert.equal(next.alur.includes('OLD_IMAGE'), false);
});
''')

print('ALUR image delete persistence patch applied')
