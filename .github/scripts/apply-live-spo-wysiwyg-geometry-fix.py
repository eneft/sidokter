from pathlib import Path

pagination_path = Path('src/utils/canonicalA4Pagination.ts')
editor_path = Path('src/components/RichTextEditor.tsx')
live_path = Path('src/components/SopLiveTemplate.tsx')
test_path = Path('tests/live-sop-content-integrity.test.ts')

pagination = pagination_path.read_text()
editor = editor_path.read_text()
live = live_path.read_text()
tests = test_path.read_text()

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)

pagination = replace_once(
    pagination,
    """/**
 * Empty/short LiveSPO sections keep one compact editable line. The same value
 * is used by the paginator and SopLiveTemplate so no section gets a special
 * fixed height (PROSEDUR included). Content taller than this remains fully
 * content-driven.
 */
export const LIVE_SOP_SECTION_MIN_HEIGHT_PX = 40;
""",
    """/**
 * Empty/short LiveSPO sections keep exactly one canonical 12pt / 1.5 line.
 * Cell inset/border are page-row chrome and are accounted separately so Live,
 * Preview/PDF and the paginator use the same physical geometry.
 */
export const LIVE_SOP_SECTION_MIN_HEIGHT_PX = 24;

/** Canonical Batang Tubuh content-cell inset used by Preview/PDF and Live A4. */
export const SOP_SECTION_CELL_PADDING_MM = 3;
const CSS_PX_PER_MM = 96 / 25.4;

/** 3mm top + 3mm bottom + the collapsed official-table border. */
export function getCanonicalSectionRowChromePx(): number {
  return SOP_SECTION_CELL_PADDING_MM * 2 * CSS_PX_PER_MM + 1;
}
""",
    'canonical section floor/constants',
)

pagination = replace_once(
    pagination,
    """/**
 * Returns the incremental rendered content height contributed by one flow unit.
 * The 40px editor minimum belongs to the whole section fragment on a page, not
 * to every extracted paragraph/list/table block inside that section.
 */
""",
    """/**
 * Returns the incremental rendered content height contributed by one flow unit.
 * The one-line editor minimum belongs to the whole section fragment on a page,
 * not to every extracted paragraph/list/table block inside that section.
 */
""",
    'section floor comment',
)

pagination = replace_once(
    pagination,
    """/**
 * Calculates the exact canonical width (in px) of the Batang Tubuh content cell.
 * A4 width = 210mm, Left/Right margin = 20mm each.
 * Effective content width = 170mm.
 * Batang Tubuh right column = 72% of 170mm = 122.4mm.
 * At 96 DPI: 122.4 * 96 / 25.4 = 462.61px.
 * Minus cell padding (0.625rem = 10px each side = 20px) = 442.6px.
 */
export function getCanonicalContentWidthPx(): number {
  const contentWidthMm = SPO_A4.contentWidthMm; // 170mm
  const colRatio = (SPO_A4.sectionContentPercent || 72) / 100; // 0.72
  const cellWidthMm = contentWidthMm * colRatio; // 122.4mm
  const cellWidthPx = (cellWidthMm * 96) / 25.4; // 462.61px
  return Math.round((cellWidthPx - 20) * 10) / 10; // ~442.6px
}
""",
    """/**
 * Calculates the exact canonical authored-content width (in px) inside the
 * Batang Tubuh content cell. The official cell is 72% of 170mm = 122.4mm and
 * Preview/PDF apply 3mm inset on both sides, leaving 116.4mm for authored HTML.
 */
export function getCanonicalContentWidthPx(): number {
  const contentWidthMm = SPO_A4.contentWidthMm;
  const colRatio = (SPO_A4.sectionContentPercent || 72) / 100;
  const cellWidthMm = contentWidthMm * colRatio;
  const innerWidthMm = cellWidthMm - SOP_SECTION_CELL_PADDING_MM * 2;
  const innerWidthPx = innerWidthMm * CSS_PX_PER_MM;
  return Math.round(innerWidthPx * 10) / 10;
}
""",
    'canonical authored content width',
)

pagination = replace_once(
    pagination,
    """  // Apply classes so compact table rules and typography match Preview and PDF identically
  host.className =
    'sop-batang-tubuh-content font-bookman text-black rich-text-output rich-text-document-content break-words [overflow-wrap:break-word] [word-break:normal] [hyphens:none]';
""",
    """  // Measure authored HTML only. The official 3mm cell inset belongs to the
  // section row and is counted once by getCanonicalSectionRowChromePx(). If
  // this host carries sop-batang-tubuh-content, CSS adds 3mm here and every
  // extracted paragraph/list/table block gets the inset again.
  host.className =
    'font-bookman text-black rich-text-output rich-text-document-content break-words [overflow-wrap:break-word] [word-break:normal] [hyphens:none]';
""",
    'content-only measurement host',
)

pagination = replace_once(
    pagination,
    """  // Content cell padding is 20px (10px top + 10px bottom)
  const baseRowPadding = 20;
""",
    """  // Official Batang Tubuh row chrome is 3mm top/bottom plus collapsed border.
  // Count it once when a section fragment starts; authored content is measured
  // separately by the content-only measurement host above.
  const baseRowPadding = getCanonicalSectionRowChromePx();
""",
    'row chrome single-count',
)

editor = replace_once(
    editor,
    """          className={`rich-text-editor-content p-2 sm:p-2.5 text-xs sm:text-[13px] text-slate-900 focus:outline-none font-bookman leading-normal empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none [word-break:normal] [overflow-wrap:break-word] [word-wrap:break-word] [hyphens:none] ${isFullscreen ? \"flex-1 min-h-0\" : \"\"}`}
""",
    """          className={`rich-text-editor-content ${variant === 'seamless' ? 'p-0' : 'p-2 sm:p-2.5'} text-xs sm:text-[13px] text-slate-900 focus:outline-none font-bookman leading-normal empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none [word-break:normal] [overflow-wrap:break-word] [word-wrap:break-word] [hyphens:none] ${isFullscreen ? \"flex-1 min-h-0\" : \"\"}`}
""",
    'seamless editor inner padding',
)

live = replace_once(
    live,
    """                        // Check if this section already had content on an earlier page
                        const isContinuedFromEarlierPage =
                          pageIndex > 0 &&
                          calculatedPages
                            .slice(0, pageIndex)
                            .some((earlierPage) => earlierPage.some((b) => b.section === group.section));

""",
    """,
    'remove in-flow continuation helper state',
)

live = replace_once(
    live,
    """                            <td
                              className=\"border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word] w-[28%] text-black\"
                              style={{ borderBottom: extendToPageBottom ? '0' : undefined }}
                            >
                              <div className=\"flex flex-col gap-0.5\">
                                <span className={cfg.isMissing ? 'text-rose-700' : 'text-black'}>
                                  {group.section}
                                </span>
                                {group.section === 'ALUR / BAGAN ALIR' && (
                                  <span className=\"text-[9px] font-normal text-slate-500 tracking-normal normal-case\">
                                    (Opsional)
                                  </span>
                                )}
                                {isContinuedFromEarlierPage && (
                                  <span className=\"text-[9px] font-semibold text-indigo-700 normal-case tracking-normal\">
                                    (Lanjutan)
                                  </span>
                                )}
                              </div>
                            </td>
""",
    """                            <td
                              className={`border border-black p-2.5 font-bold uppercase align-top text-black font-bookman sop-batang-tubuh-title whitespace-normal [word-break:normal] [overflow-wrap:break-word] w-[28%] ${cfg.isMissing ? 'text-rose-700' : 'text-black'}`}
                              style={{ borderBottom: extendToPageBottom ? '0' : undefined }}
                            >
                              {group.section === 'ALUR / BAGAN ALIR' ? (
                                <><div>ALUR /</div><div>BAGAN ALIR</div></>
                              ) : group.section === 'UNIT TERKAIT' ? (
                                <><div>UNIT</div><div>TERKAIT</div></>
                              ) : (
                                group.section
                              )}
                            </td>
""",
    'Live section label geometry parity',
)

tests = replace_once(
    tests,
    """  LIVE_SOP_SECTION_MIN_HEIGHT_PX,
  sectionFlowContributionPx,
  shouldDeferWholeBlockToNextPage,
""",
    """  LIVE_SOP_SECTION_MIN_HEIGHT_PX,
  getCanonicalContentWidthPx,
  getCanonicalSectionRowChromePx,
  sectionFlowContributionPx,
  shouldDeferWholeBlockToNextPage,
""",
    'geometry helper imports',
)

tests = replace_once(
    tests,
    """test('LiveSPO uses one compact minimum editor height for every section', () => {
  assert.equal(LIVE_SOP_SECTION_MIN_HEIGHT_PX, 40);
  assert.ok(LIVE_SOP_SECTION_MIN_HEIGHT_PX > 0);
});
""",
    """test('LiveSPO canonical minimum is exactly one 12pt / 1.5 content line', () => {
  assert.equal(LIVE_SOP_SECTION_MIN_HEIGHT_PX, 24);
  assert.ok(LIVE_SOP_SECTION_MIN_HEIGHT_PX > 0);
});
""",
    'section floor regression',
)

tests = replace_once(
    tests,
    """test('pack-first section measurement is not inflated per extracted block', () => {
  assert.equal(sectionFlowContributionPx(0, 18, true), 40);
  assert.equal(sectionFlowContributionPx(18, 18, false), 0);
  assert.equal(sectionFlowContributionPx(36, 18, false), 14);
  assert.equal(
    sectionFlowContributionPx(0, 18, true) +
      sectionFlowContributionPx(18, 18, false) +
      sectionFlowContributionPx(36, 18, false),
    54
  );
});
""",
    """test('pack-first section measurement is not inflated per extracted block', () => {
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
""",
    'pack-first floor math',
)

marker = "canonical WYSIWYG body geometry counts official cell chrome exactly once"
if marker in tests:
    raise SystemExit('WYSIWYG geometry regression tests already present unexpectedly')

tests += """

test('canonical WYSIWYG body geometry counts official cell chrome exactly once', () => {
  const source = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');
  const expectedInnerWidth = (116.4 * 96) / 25.4;
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
"""

pagination_path.write_text(pagination)
editor_path.write_text(editor)
live_path.write_text(live)
test_path.write_text(tests)

print('Fail-closed WYSIWYG geometry patch applied in working tree.')
