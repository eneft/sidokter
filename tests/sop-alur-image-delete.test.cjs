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
