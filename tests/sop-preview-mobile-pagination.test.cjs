const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('src/components/SopDetailModal.tsx', 'utf8');

test('mobile preview measures physical A4 outside visual transform', () => {
  const measureRef = source.indexOf('ref={measureRootRef}');
  const viewportRef = source.indexOf('ref={previewViewportRef}');
  const visualTransform = source.indexOf('transform: calculatedPreviewScale');
  assert.ok(measureRef >= 0, 'physical measurement shell must exist');
  assert.ok(viewportRef >= 0, 'preview viewport must exist');
  assert.ok(visualTransform >= 0, 'visual fit transform must exist');
  assert.ok(measureRef < viewportRef, 'measurement shell must be rendered before/outside the transformed viewport');
  assert.ok(measureRef < visualTransform, 'measurement shell must not inherit fit-to-screen transform');
});

test('pagination uses untransformed layout metrics', () => {
  assert.match(source, /header\.offsetHeight\s*\|\|\s*header\.getBoundingClientRect\(\)\.height/);
  assert.match(source, /publication\.offsetHeight\s*\|\|\s*publication\.getBoundingClientRect\(\)\.height/);
  assert.match(source, /safetyBufferPx:\s*paginationSafetyBufferPx/);
});

test('rendered A4 pages self-correct overflow before PDF generation', () => {
  assert.match(source, /table\.scrollHeight\s*-\s*frame\.clientHeight/);
  assert.match(source, /setPaginationSafetyBufferPx\(nextSafety\)/);
  assert.match(source, /setIsPaginatingOfficial\(true\)/);
  assert.match(source, /data-sop-a4-content-frame="true"/);
});
