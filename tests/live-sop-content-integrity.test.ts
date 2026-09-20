import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildOfficialBlocks,
  LIVE_SOP_SECTION_MIN_HEIGHT_PX,
  shouldDeferWholeBlockToNextPage,
} from '../src/utils/canonicalA4Pagination';

const ORDER = [
  'PENGERTIAN',
  'TUJUAN',
  'KEBIJAKAN',
  'PROSEDUR',
  'ALUR / BAGAN ALIR',
  'UNIT TERKAIT',
] as const;

test('all official LiveSPO sections remain in canonical flow even when empty', () => {
  const blocks = buildOfficialBlocks({
    pengertian: '<p>PENGERTIAN PANJANG</p>'.repeat(500),
    tujuan: '',
    kebijakan: '',
    prosedur: '',
    alur: '',
    unitTerkait: '',
  });
  const firstSeen = [...new Set(blocks.map((b) => b.section))];
  assert.deepEqual(firstSeen, ORDER);
});

test('sections after a long Pengertian preserve content, order and uniqueness', () => {
  const markers = {
    tujuan: 'TEST TUJUAN',
    kebijakan: 'TEST KEBIJAKAN',
    prosedur: 'TEST PROSEDUR',
    alur: 'TEST ALUR',
    unitTerkait: 'TEST UNIT TERKAIT',
  };
  const blocks = buildOfficialBlocks({
    pengertian: '<p>PENGERTIAN PANJANG</p>'.repeat(500),
    ...Object.fromEntries(Object.entries(markers).map(([k, v]) => [k, `<p>${v}</p>`])),
  });
  const joined = blocks.map((b) => b.html).join('\n');
  for (const marker of Object.values(markers)) {
    assert.equal(joined.split(marker).length - 1, 1, `${marker} must occur exactly once`);
  }
  const firstSeen = [...new Set(blocks.map((b) => b.section))];
  assert.deepEqual(firstSeen, ORDER);
});

test('LiveSPO uses one compact minimum editor height for every section', () => {
  assert.equal(LIVE_SOP_SECTION_MIN_HEIGHT_PX, 40);
  assert.ok(LIVE_SOP_SECTION_MIN_HEIGHT_PX > 0);
});


test('short text/table/media flow units move intact when remaining page space is insufficient', () => {
  assert.equal(shouldDeferWholeBlockToNextPage(180, 100, 700), true);
  assert.equal(shouldDeferWholeBlockToNextPage(700, 100, 700), true);
  assert.equal(shouldDeferWholeBlockToNextPage(80, 100, 700), false);
});

test('oversized flow units still enter safe split path instead of being deferred forever', () => {
  assert.equal(shouldDeferWholeBlockToNextPage(701, 100, 700), false);
  assert.equal(shouldDeferWholeBlockToNextPage(1200, 0, 700), false);
});

test('LiveSPO production source does not inject a single-page-only section fallback', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/SopLiveTemplate.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /calculatedPages\.length === 1[\s\S]{0,500}standardSections/);
  assert.match(source, /overflow:\s*'hidden'/); // safety guard remains; paginator must prevent clipping.
});


test('LiveSPO table row floor is canonical across editor, measurement/preview output, and document output', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const canonicalRowFloor = /\.rich-text-editor-content table td,[\s\S]*?\.rich-text-document-content table td,[\s\S]*?\.rich-text-output table td,[\s\S]*?height:\s*1\.75em;[\s\S]*?min-height:\s*1\.75em;/;
  assert.match(css, canonicalRowFloor);
});

// Regression guard: LiveSPO pagination must measure the KOP/publication from its
// own scoped A4 shell, never from the first matching node in the global document.
test('LiveSPO canonical pagination uses scoped header/publication metrics', () => {
  const pagination = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');
  assert.equal(pagination.includes("document.querySelector<HTMLElement>(\n      '.sop-official-table thead"), false);
  assert.equal(pagination.includes("document.querySelector<HTMLElement>(\n      '.sop-first-page-only"), false);
  assert.match(live, /data-live-measure-header/);
  assert.match(live, /data-live-measure-publication/);
  assert.match(live, /if \(!livePageMetrics\) return \[\]/);
  assert.match(live, /computeCanonicalA4Pages\(debouncedBlocks, livePageMetrics\)/);
});

test('canonical pagination refuses guessed header/publication geometry', () => {
  const source = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');
  assert.match(source, /if \(!options \|\| !Number\.isFinite\(options\.headerHeightPx\)/);
  assert.doesNotMatch(source, /headerHeightPx\s*\?\?\s*148/);
  assert.doesNotMatch(source, /publicationHeightPx\s*\?\?\s*80/);
});

test('Preview delegates page boundaries to the same canonical paginator as LiveSPO', () => {
  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');
  assert.match(preview, /computeCanonicalA4Pages\(layoutBlocks/);
  assert.match(live, /computeCanonicalA4Pages\(debouncedBlocks/);
  assert.doesNotMatch(preview, /const bodyCapacity = Math\.max\(1, availableHeight - headerHeight - safety\)/);
});

test('Preview and LiveSPO build the same canonical ordered section flow', () => {
  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  assert.match(preview, /buildOfficialBlocks\(\{/);
  assert.doesNotMatch(preview, /\.filter\(\(sec\) => sec\.html\.trim\(\)\.length > 0\)/);
});


test('LiveSPO and Preview use matching canonical KOP/publication geometry tokens', () => {
  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');
  for (const token of [
    'w-[54px] h-[54px]',
    'border border-black p-3 text-center align-middle bg-white w-[28%] font-normal',
    'text-[10px] uppercase font-bookman text-black',
    'sop-document-type-label-inner text-black font-extrabold',
    'border border-black p-2 text-center align-top bg-white w-[24%]',
  ]) {
    assert.ok(live.includes(token), `LiveSPO missing canonical token: ${token}`);
    assert.ok(preview.includes(token), `Preview missing canonical token: ${token}`);
  }
});

test('LiveSPO does not render a fake one-page document before canonical metrics exist', () => {
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');
  assert.match(live, /if \(!livePageMetrics\) return \[\];/);
  assert.doesNotMatch(live, /if \(!livePageMetrics\) return \[debouncedBlocks\];/);
});


test('rich text gets a split opportunity before whole-block defer', () => {
  const source = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');
  const splitGate = source.indexOf('isSplittableTextFlowHtml(block.html)');
  const deferGate = source.indexOf('shouldDeferWholeBlockToNextPage(', splitGate);
  assert.ok(splitGate >= 0, 'rich-text split gate must exist');
  assert.ok(deferGate > splitGate, 'rich-text split must run before whole-block defer');
  assert.match(source, /remaining >= 40[\s\S]*isSplittableTextFlowHtml\(block\.html\)[\s\S]*splitHtmlForCapacity\(block\.html, remaining, null\)/);
});

test('table and image content are excluded from generic rich-text pre-splitting', () => {
  const source = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');
  assert.match(source, /querySelector\('table, img, figure'\)/);
});
