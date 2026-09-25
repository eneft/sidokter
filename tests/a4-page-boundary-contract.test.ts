import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');
const paginator = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');

test('physical A4 sheets are hard paint boundaries in Preview/PDF and Live', () => {
  assert.match(css, /#printable-sop-official-document \.sop-preview-page,[\s\S]*?\.sop-live-a4-page,[\s\S]*?overflow:\s*hidden !important;[\s\S]*?max-height:\s*297mm !important;[\s\S]*?contain:\s*paint;/);
  assert.doesNotMatch(css, /#printable-sop-official-document\s*,\s*#printable-sop-official-document \*\s*\{[^}]*overflow:\s*visible !important;/);
  assert.match(css, /\[data-sop-page-fit-block="true"\]\s*\{[^}]*overflow:\s*hidden !important;/);
});

test('canonical paginator reserves rounding room and has no intentional overflow escape', () => {
  assert.match(paginator, /MIN_A4_SAFETY_BUFFER_PX\s*=\s*8/);
  assert.match(paginator, /getCanonicalSectionLabelMinimumHeightPx/);
  assert.match(paginator, /fitOversizedBlockHtmlToPage/);
  assert.match(paginator, /data-sop-page-fit-block/);
  assert.doesNotMatch(paginator, /data-sop-unsplittable-overflow/);
});


test('mobile viewer scale never contaminates physical A4 pagination metrics', () => {
  const detail = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  assert.match(detail, /const measurementScale = Number\.isFinite\(calculatedPreviewScale\)/);
  assert.match(detail, /const layoutHeight = element\.offsetHeight;/);
  assert.match(detail, /getBoundingClientRect\(\)\.height \/ measurementScale/);
  assert.match(detail, /safetyBufferPx:\s*12/);
  assert.match(detail, /calculatedPreviewScale\]\);/);
});

test('physical A4 chrome is viewport-invariant in Preview and LiveSPO', () => {
  const detail = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');

  const detailStart = detail.indexOf('const renderOfficialHeader = (pageNumber: number, pageTotal: number)');
  const detailEnd = detail.indexOf('const pageGroups = officialPages;', detailStart);
  assert.ok(detailStart >= 0 && detailEnd > detailStart);
  assert.doesNotMatch(detail.slice(detailStart, detailEnd), /\bsm:/);

  const liveStart = live.indexOf('const renderOfficialHeader = (pageNumber: number, total: number)');
  const liveEnd = live.indexOf('// Helper to map OfficialSectionKey to active state and callbacks', liveStart);
  assert.ok(liveStart >= 0 && liveEnd > liveStart);
  assert.doesNotMatch(live.slice(liveStart, liveEnd), /\bsm:/);
});
