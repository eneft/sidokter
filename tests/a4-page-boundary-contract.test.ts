import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measureCanonicalA4RowHeight } from '../src/utils/canonicalA4Pagination';

const css = readFileSync('src/index.css', 'utf8');
const paginator = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');

test('physical A4 sheets are hard paint boundaries in Preview/PDF and Live', () => {
  assert.match(css, /#printable-sop-official-document \.sop-preview-page,[\s\S]*?\.sop-live-a4-page,[\s\S]*?overflow:\s*hidden !important;[\s\S]*?max-height:\s*297mm !important;[\s\S]*?contain:\s*paint;/);
  assert.doesNotMatch(css, /#printable-sop-official-document\s*,\s*#printable-sop-official-document \*\s*\{[^}]*overflow:\s*visible !important;/);
  assert.match(css, /\[data-sop-page-fit-block="true"\]\s*\{[^}]*overflow:\s*hidden !important;/);
});

test('canonical paginator reserves rounding room and has no intentional overflow escape', () => {
  assert.match(paginator, /CANONICAL_A4_SAFETY_BUFFER_PX\s*=\s*24/);
  assert.match(paginator, /MIN_A4_SAFETY_BUFFER_PX\s*=\s*CANONICAL_A4_SAFETY_BUFFER_PX/);
  assert.match(paginator, /getCanonicalSectionLabelMinimumHeightPx/);
  assert.match(paginator, /fitOversizedBlockHtmlToPage/);
  assert.match(paginator, /data-sop-page-fit-block/);
  assert.doesNotMatch(paginator, /data-sop-unsplittable-overflow/);
});


test('mobile viewer scale never contaminates physical A4 pagination metrics', () => {
  const detail = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  assert.match(detail, /const measurementScale = Number\.isFinite\(calculatedPreviewScale\)/);
  assert.match(paginator, /const layoutHeight = element\.offsetHeight;/);
  assert.match(paginator, /element\.getBoundingClientRect\(\)\.height/);
  assert.match(detail, /measureCanonicalA4RowHeight\(header, measurementScale\)/);
  assert.match(detail, /measureCanonicalA4RowHeight\(publication, measurementScale\)/);
  assert.match(detail, /safetyBufferPx:\s*CANONICAL_A4_SAFETY_BUFFER_PX/);
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

test('Live editor, readonly Preview and paginator use the same A4 text/height budget', () => {
  const detail = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');
  const editor = readFileSync('src/components/RichTextEditor.tsx', 'utf8');
  const renderer = readFileSync('src/components/RichTextRenderer.tsx', 'utf8');

  assert.match(detail, /measureCanonicalA4RowHeight\(header, measurementScale\)/);
  assert.match(live, /measureCanonicalA4RowHeight\(header\)/);
  assert.match(live, /measureCanonicalA4RowHeight\(publication\)/);
  assert.match(live, /safetyBufferPx: CANONICAL_A4_SAFETY_BUFFER_PX/);
  assert.match(detail, /safetyBufferPx: CANONICAL_A4_SAFETY_BUFFER_PX/);
  assert.match(editor, /variant === 'seamless' \? 'sop-a4-rich-body p-0'/);
  assert.match(detail, /<RichTextRenderer content=\{html\} fallback="-" className="sop-a4-rich-body" \/>/);
  assert.match(paginator, /sop-a4-rich-body rich-text-output rich-text-document-content/);
  assert.match(renderer, /className=\{\`font-bookman text-black rich-text-output/);
  assert.match(css, /\.sop-a4-rich-body \{[\s\S]*font-size: 12pt !important;/);
});

test('physical row height ignores preview zoom and supports fallback', () => {
  const measured = {
    offsetHeight: 187,
    getBoundingClientRect: () => ({ height: 93.5 })
  } as unknown as HTMLElement;
  assert.equal(measureCanonicalA4RowHeight(measured, 0.5), 187);

  const fallback = {
    offsetHeight: 0,
    getBoundingClientRect: () => ({ height: 93.5 })
  } as unknown as HTMLElement;
  assert.equal(measureCanonicalA4RowHeight(fallback, 0.5), 187);
  assert.equal(measureCanonicalA4RowHeight(fallback, Number.NaN), 93.5);
});

test('Live header measurement uses the actual first-page KOP identity', () => {
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');
  assert.match(live, /renderOfficialHeader\(1, 1\), \{ 'data-live-measure-header': true \}/);
  assert.doesNotMatch(live, /renderOfficialHeader\(2, 2\), \{ 'data-live-measure-header': true \}/);
});
