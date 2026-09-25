import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser as LinkedomDOMParser } from 'linkedom';
import {
  buildOfficialBlocks,
  extractProcedureBlocks,
  isAtomicMediaHtml,
  LIVE_SOP_SECTION_MIN_HEIGHT_PX,
  getCanonicalContentWidthPx,
  getCanonicalSectionRowChromePx,
  sectionFlowContributionPx,
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

test('LiveSPO canonical minimum is exactly one 12pt / 1.5 content line', () => {
  assert.equal(LIVE_SOP_SECTION_MIN_HEIGHT_PX, 24);
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

test('text page split preserves the exact inter-chunk boundary instead of dropping whitespace', () => {
  const source = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');
  assert.match(source, /const previous = ranges\[startWord - 1\];[\s\S]*range\.setStart\(previous\.node, previous\.end\)/);
  assert.match(source, /range\.setStart\(element, 0\)/);
  assert.match(source, /range\.setEnd\(element, element\.childNodes\.length\)/);
  assert.doesNotMatch(source, /range\.setStart\(ranges\[startWord\]\.node, ranges\[startWord\]\.start\)/);
});


test('LiveSPO multi-page toolbar ownership is fragment-scoped', () => {
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');
  assert.match(live, /activeEditorKeyRef/);
  assert.match(live, /activeEditorKeyRef\.current = editorKey/);
  assert.match(live, /activeEditorKeyRef\.current === editorKey/);
  assert.match(live, /Only the focused owner may drive the shared toolbar/);
  assert.doesNotMatch(live, /!editorRefs\.current\[cfg\.id\] \|\| isSectionActive/);
  assert.match(live, /onChange=\{\(e\) => scrollToSection\(e\.target\.value as typeof activeTableSection\)\}/);
});

test('structured table gets safe-row split chance before whole-block defer', () => {
  const source = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');
  const tableGate = source.indexOf('hasStructuredTableFlowHtml(block.html)');
  const tableSplit = source.indexOf('splitHtmlForCapacity(block.html, remaining, null)', tableGate);
  const deferGate = source.indexOf('shouldDeferWholeBlockToNextPage(', tableGate);
  assert.ok(tableGate >= 0, 'table flow classifier must be used in overflow path');
  assert.ok(tableSplit > tableGate, 'table safe split must be attempted');
  assert.ok(deferGate > tableSplit, 'whole-block defer must run only after table safe split');
  assert.match(source, /table-fit-1/);
  assert.match(source, /splitStructuredTableV2/);
});

test('non-final Live and Preview pages extend Batang Tubuh without a stray preview bottom-margin rule', () => {
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');
  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  for (const source of [live, preview]) {
    assert.match(source, /data-sop-page-continuation-fill="true"/);
    assert.match(source, /isContinuationPage/);
    assert.match(source, /flex: '1 1 auto'/);
    assert.match(source, /left: '28%'/);
  }
  assert.match(live, /borderBottom: '1px solid #000000'/);
  assert.match(preview, /borderBottom: '1px solid #000000'/);
  assert.match(live, /pageIndex < totalPages - 1/);
  assert.match(preview, /pageIndex < calculatedTotalPages - 1/);
});

test('SPO preview uses a compact fixed desktop shell with no fullscreen control and caps Existing PDF width', () => {
  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  assert.match(preview, /sm:max-w-\[1120px\]/);
  assert.match(preview, /max-w-\[920px\] mx-auto/);
  assert.doesNotMatch(preview, /isMaximized|setIsMaximized|sop_modal_maximized|Maximize2|Minimize2/);
});


test('pack-first section measurement is not inflated per extracted block', () => {
  assert.equal(sectionFlowContributionPx(0, 18, true), 24);
  assert.equal(sectionFlowContributionPx(18, 18, false), 12);
  assert.equal(sectionFlowContributionPx(36, 18, false), 18);
  assert.equal(
    sectionFlowContributionPx(0, 18, true) +
      sectionFlowContributionPx(18, 18, false) +
      sectionFlowContributionPx(36, 18, false),
    54
  );
});

test('canonical paginator measures raw flow blocks and applies the editor floor once per section fragment', () => {
  const source = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');
  assert.match(source, /let currentSectionRawHeight = 0/);
  assert.match(source, /const contentContribution = sectionFlowContributionPx/);
  assert.match(source, /currentSectionRawHeight = startsNewSectionRow/);
  assert.doesNotMatch(source, /const measuredHeights = blocks\.map\([\s\S]{0,260}Math\.max\(\s*LIVE_SOP_SECTION_MIN_HEIGHT_PX/);
});

test('ordered and bullet lists split only at whole list-item boundaries', () => {
  const source = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');
  const wholeItems = source.indexOf('if (fitCount > 0 && fitCount < items.length)');
  const fallback = source.indexOf('const firstPart = makeList(prefixItemHtmls, 0);', wholeItems);
  assert.ok(wholeItems >= 0);
  assert.ok(fallback > wholeItems, 'whole list items must be the pagination boundary');
  assert.doesNotMatch(source, /const partialNextItem = splitElementPreservingMarkup/);
  assert.match(source, /A list item is a semantic unit/);
});


test('canonical WYSIWYG body geometry counts official cell chrome exactly once', () => {
  const source = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');
  const expectedInnerWidth = (116.4 * 96) / 25.4 - 2;
  const expectedChrome = (6 * 96) / 25.4 + 1;
  assert.ok(Math.abs(getCanonicalContentWidthPx() - expectedInnerWidth) < 0.1);
  assert.ok(Math.abs(getCanonicalSectionRowChromePx() - expectedChrome) < 0.001);
  assert.doesNotMatch(source, /host\.className\s*=\s*[\s\S]{0,180}sop-batang-tubuh-content/);
  assert.match(source, /const baseRowPadding = getCanonicalSectionRowChromePx\(\)/);
  assert.doesNotMatch(source, /const baseRowPadding = 20/);
});

test('Live seamless editor has no second inner padding layer', () => {
  const editor = readFileSync('src/components/RichTextEditor.tsx', 'utf8');
  assert.match(editor, /variant === 'seamless' \? 'p-0' : 'p-2 sm:p-2\.5'/);
});

test('Live A4 section-label flow matches Preview geometry and contains no layout helper text', () => {
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');
  assert.match(live, /p-2\.5 font-bold uppercase align-top text-black font-bookman sop-batang-tubuh-title/);
  assert.match(live, /<><div>ALUR \/<\/div><div>BAGAN ALIR<\/div><\/\>/);
  assert.match(live, /<><div>UNIT<\/div><div>TERKAIT<\/div><\/\>/);
  assert.doesNotMatch(live, /isContinuedFromEarlierPage/);
  assert.doesNotMatch(live, /\(Lanjutan\)/);
});


test('continuation pages suppress the duplicate table/tail-row bottom rule', () => {
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');
  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  const css = readFileSync('src/index.css', 'utf8');
  assert.match(live, /sop-continuation-page-table/);
  assert.match(live, /data-sop-suppress-bottom-border=\{extendToPageBottom \? 'true' : undefined\}/);
  assert.match(preview, /sop-continuation-page-table/);
  assert.match(preview, /data-sop-suppress-bottom-border=\{!lastInSection \? 'true' : undefined\}/);
  assert.match(css, /table\.sop-official-table\.sop-continuation-page-table[\s\S]{0,220}border-bottom:\s*0 !important/);
  assert.match(css, /tr\[data-sop-suppress-bottom-border="true"\]\s*>\s*td[\s\S]{0,240}border-bottom:\s*0 !important/);
});


test('canonical image flow preserves Live editor wrapper width/alignment as atomic media', () => {
  const priorParser = (globalThis as any).DOMParser;
  const priorNode = (globalThis as any).Node;

  class BrowserLikeDOMParser {
    parseFromString(source: string) {
      return new LinkedomDOMParser().parseFromString(
        `<!doctype html><html><body>${source}</body></html>`,
        'text/html'
      );
    }
  }

  (globalThis as any).DOMParser = BrowserLikeDOMParser;
  (globalThis as any).Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };

  try {
    for (const width of [25, 50, 75, 100]) {
      const authored = [
        `<div class="my-3 figure-wrapper figure-wrap-top-bottom" data-wrap="top-bottom" data-width="${width}%" data-align="left"`,
        ` style="display:block;max-width:${width}%;width:${width}%;margin:12px auto 12px 0">`,
        '<img src="data:image/png;base64,iVBORw0KGgo=" style="width:100%;height:auto;display:inline-block">',
        '</div><p><br></p>',
      ].join('');

      const blocks = extractProcedureBlocks(authored);
      assert.equal(blocks.length, 1, `${width}% image must remain one flow unit`);
      assert.match(blocks[0], /figure-wrapper/);
      assert.match(blocks[0], new RegExp(`data-width="${width}%"`));
      assert.match(blocks[0], /data-align="left"/);
      assert.match(blocks[0], new RegExp(`max-width:${width}%`));
      assert.equal(isAtomicMediaHtml(blocks[0]), true);
    }
  } finally {
    (globalThis as any).DOMParser = priorParser;
    (globalThis as any).Node = priorNode;
  }
});


test('Preview/PDF omit an empty optional ALUR while Live keeps the structural editor row', () => {
  const base = {
    pengertian: '<p>Pengertian</p>',
    tujuan: '<p>Tujuan</p>',
    kebijakan: '<p>Kebijakan</p>',
    prosedur: '<p>Prosedur</p>',
    alur: '',
    unitTerkait: '<p>Unit</p>',
  };

  const liveBlocks = buildOfficialBlocks(base);
  assert.equal(liveBlocks.some((block) => block.section === 'ALUR / BAGAN ALIR'), true);

  const outputBlocks = buildOfficialBlocks(base, { omitEmptyAlur: true });
  assert.equal(outputBlocks.some((block) => block.section === 'ALUR / BAGAN ALIR'), false);
  assert.equal(outputBlocks.some((block) => block.section === 'UNIT TERKAIT'), true);

  const priorParser = (globalThis as any).DOMParser;
  const priorNode = (globalThis as any).Node;
  class BrowserLikeDOMParser {
    parseFromString(source: string) {
      return new LinkedomDOMParser().parseFromString(
        `<!doctype html><html><body>${source}</body></html>`,
        'text/html'
      );
    }
  }
  (globalThis as any).DOMParser = BrowserLikeDOMParser;
  (globalThis as any).Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
  try {
    const editorEmpty = buildOfficialBlocks(
      { ...base, alur: '<p><br></p>' },
      { omitEmptyAlur: true }
    );
    assert.equal(editorEmpty.some((block) => block.section === 'ALUR / BAGAN ALIR'), false);

    const mediaAlur = buildOfficialBlocks(
      { ...base, alur: '<figure><img src="data:image/png;base64,AA==" /></figure>' },
      { omitEmptyAlur: true }
    );
    assert.equal(mediaAlur.some((block) => block.section === 'ALUR / BAGAN ALIR'), true);
  } finally {
    (globalThis as any).DOMParser = priorParser;
    (globalThis as any).Node = priorNode;
  }
});

test('Preview/PDF explicitly opt out of empty ALUR and do not draw an outer A4 page border', () => {
  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  assert.match(preview, /omitEmptyAlur:\s*true/);
  assert.match(preview, /boxShadow:\s*'0 2px 12px rgba\(0,0,0,\.08\)'[\s\S]{0,100}border:\s*'none'/);
  assert.doesNotMatch(preview, /border:\s*'1px solid #e2e8f0'/);
});


test('Preview continuation fill closes the Batang Tubuh boundary without restoring the outer A4 shell border', () => {
  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  assert.match(preview, /data-sop-page-continuation-fill="true"[\s\S]{0,500}borderBottom:\s*'1px solid #000000'/);
  assert.match(preview, /boxShadow:\s*'0 2px 12px rgba\(0,0,0,\.08\)'[\s\S]{0,100}border:\s*'none'/);
  assert.doesNotMatch(preview, /border:\s*'1px solid #e2e8f0'/);
});


test('Preview/PDF numbering continues across an inserted table but resets after meaningful prose', () => {
  const priorParser = (globalThis as any).DOMParser;
  const priorNode = (globalThis as any).Node;
  class BrowserLikeDOMParser {
    parseFromString(source: string) {
      return new LinkedomDOMParser().parseFromString(
        `<!doctype html><html><body>${source}</body></html>`,
        'text/html'
      );
    }
  }
  (globalThis as any).DOMParser = BrowserLikeDOMParser;
  (globalThis as any).Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };

  try {
    const interrupted = extractProcedureBlocks(
      '<ol><li>Satu</li><li>Dua</li></ol>' +
      '<table><tbody><tr><td>Tabel</td></tr></tbody></table>' +
      '<p><br></p>' +
      '<ol><li>Tiga</li><li>Empat</li></ol>'
    );
    const ordered = interrupted.filter((block) => /^<ol\b/i.test(block));
    assert.equal(ordered.length, 2);
    const second = new LinkedomDOMParser().parseFromString(
      `<!doctype html><html><body>${ordered[1]}</body></html>`,
      'text/html'
    ).body.querySelector('ol');
    assert.equal(second?.getAttribute('start'), '3');
    assert.equal(second?.style.getPropertyValue('--sop-start-offset'), '2');

    const separateLists = extractProcedureBlocks(
      '<ol><li>Pertama</li></ol>' +
      '<p>Paragraf baru yang memutus daftar.</p>' +
      '<table><tbody><tr><td>Tabel</td></tr></tbody></table>' +
      '<ol><li>Daftar baru</li></ol>'
    );
    const separateOrdered = separateLists.filter((block) => /^<ol\b/i.test(block));
    const reset = new LinkedomDOMParser().parseFromString(
      `<!doctype html><html><body>${separateOrdered[1]}</body></html>`,
      'text/html'
    ).body.querySelector('ol');
    assert.equal(reset?.getAttribute('start'), null);
    assert.equal(reset?.style.getPropertyValue('--sop-start-offset'), '0');
  } finally {
    (globalThis as any).DOMParser = priorParser;
    (globalThis as any).Node = priorNode;
  }
});
