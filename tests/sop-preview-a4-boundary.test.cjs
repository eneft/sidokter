const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('src/components/SopDetailModal.tsx', 'utf8');

test('A4 preview treats the 20mm inner frame as a hard page boundary', () => {
  assert.match(source, /data-sop-a4-safe-area="20mm"/);
  assert.match(source, /frame\.scrollHeight\s*-\s*frame\.clientHeight/);
  assert.match(source, /rect\.bottom\s*-\s*frameRect\.bottom/);
});

test('painted descendant overflow is converted back to canonical layout pixels', () => {
  assert.match(source, /maxVisualOverflow\s*\/\s*visualScale/);
  assert.match(source, /calculatedPreviewScale/);
  assert.match(source, /paginationSafetyBufferPx\s*<\s*320/);
});

test('invalid A4 page is repaginated before it can stabilize', () => {
  assert.match(source, /setIsPaginatingOfficial\(true\)/);
  assert.match(source, /setPaginationSafetyBufferPx\(nextSafety\)/);
  assert.match(source, /requestAnimationFrame\(auditPhysicalA4Boundary\)/);
});
