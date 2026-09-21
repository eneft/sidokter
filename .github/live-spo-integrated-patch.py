from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(path: str, old: str, new: str, label: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    write(path, text.replace(old, new, 1))


live = 'src/components/SopLiveTemplate.tsx'
canonical = 'src/utils/canonicalA4Pagination.ts'
preview = 'src/components/SopDetailModal.tsx'
testfile = 'tests/live-sop-content-integrity.test.ts'

# 1) Fragment-scoped shared toolbar ownership.
replace_once(
    live,
    """  // Maintain active editor references
  const editorRefs = useRef<{ [key: string]: RichTextEditorHandle | null }>({});
  const activeEditorRef = useRef<RichTextEditorHandle | null>(null);
""",
    """  // Maintain active editor references. Multi-page sections can mount more than
  // one RichTextEditor, so toolbar ownership must be tied to the fragment that
  // the user actually focused instead of whichever fragment mounted last.
  const editorRefs = useRef<{ [key: string]: RichTextEditorHandle | null }>({});
  const activeEditorRef = useRef<RichTextEditorHandle | null>(null);
  const activeEditorKeyRef = useRef<string | null>(null);
""",
    'live active editor refs',
)

replace_once(
    live,
    """  const getActiveEditor = (): RichTextEditorHandle | null => {
    return activeEditorRef.current || editorRefs.current[activeTableSection] || null;
  };
""",
    """  const getActiveEditor = (): RichTextEditorHandle | null => {
    const activeKey = activeEditorKeyRef.current;
    if (activeKey) {
      const focusedFragment = editorRefs.current[activeKey];
      if (focusedFragment) return focusedFragment;
    }
    return activeEditorRef.current || editorRefs.current[activeTableSection] || null;
  };
""",
    'live active editor getter',
)

replace_once(
    live,
    """  const scrollToSection = (sectionKey: typeof activeTableSection) => {
    setActiveTableSection(sectionKey);
    const target = editorRefs.current[sectionKey];
    if (target) {
      target.focus();
    }
  };
""",
    """  const scrollToSection = (sectionKey: typeof activeTableSection) => {
    setActiveTableSection(sectionKey);
    const target = editorRefs.current[sectionKey];
    if (target) {
      // focus() will publish the exact page-fragment key through onFocus. Keep
      // this fallback only for the tiny interval before that focus event fires.
      activeEditorRef.current = target;
      target.focus();
    }
  };
""",
    'live section focus bridge',
)

replace_once(
    live,
    "onChange={(e) => setActiveTableSection(e.target.value as typeof activeTableSection)}",
    "onChange={(e) => scrollToSection(e.target.value as typeof activeTableSection)}",
    'live toolbar section selector',
)

old_ref = """                                ref={(el) => {
                                  if (el) {
                                    editorRefs.current[editorKey] = el;
                                    if (!editorRefs.current[cfg.id] || isSectionActive) {
                                      editorRefs.current[cfg.id] = el;
                                      activeEditorRef.current = el;
                                    }
                                  }
                                }}
"""
new_ref = """                                ref={(el) => {
                                  const previous = editorRefs.current[editorKey];
                                  if (el) {
                                    editorRefs.current[editorKey] = el;
                                    // The section alias is only a navigation fallback. It must
                                    // never steal toolbar ownership from a focused fragment.
                                    if (!editorRefs.current[cfg.id]) {
                                      editorRefs.current[cfg.id] = el;
                                    }
                                    if (activeEditorKeyRef.current === editorKey) {
                                      activeEditorRef.current = el;
                                    }
                                    return;
                                  }

                                  delete editorRefs.current[editorKey];
                                  if (editorRefs.current[cfg.id] === previous) {
                                    const replacementKey = Object.keys(editorRefs.current).find(
                                      (key) => key.endsWith(`-${cfg.id}`) && Boolean(editorRefs.current[key])
                                    );
                                    editorRefs.current[cfg.id] = replacementKey
                                      ? editorRefs.current[replacementKey]
                                      : null;
                                  }
                                  if (activeEditorKeyRef.current === editorKey) {
                                    activeEditorKeyRef.current = null;
                                    activeEditorRef.current = editorRefs.current[cfg.id] || null;
                                  }
                                }}
"""
replace_once(live, old_ref, new_ref, 'live fragment ref ownership')

old_focus = """                                onFocus={() => {
                                  setActiveTableSection(cfg.id);
                                  const currentEl = editorRefs.current[editorKey] || editorRefs.current[cfg.id];
                                  if (currentEl) {
                                    activeEditorRef.current = currentEl;
                                  }
                                }}
                                onFormattingChange={setActiveFormatting}
"""
new_focus = """                                onFocus={() => {
                                  setActiveTableSection(cfg.id);
                                  activeEditorKeyRef.current = editorKey;
                                  const currentEl = editorRefs.current[editorKey] || editorRefs.current[cfg.id];
                                  if (currentEl) {
                                    activeEditorRef.current = currentEl;
                                  }
                                }}
                                onFormattingChange={(formatting) => {
                                  // Inactive fragments still emit formatting while pagination
                                  // remounts. Only the focused owner may drive the shared toolbar.
                                  if (activeEditorKeyRef.current === editorKey) {
                                    setActiveFormatting(formatting);
                                  }
                                }}
"""
replace_once(live, old_focus, new_focus, 'live formatting ownership')

# 2) Non-final physical pages extend Batang Tubuh to canonical bottom.
replace_once(
    live,
    """          {calculatedPages.map((pageBlocks, pageIndex) => {
            const isFirstPage = pageIndex === 0;
""",
    """          {calculatedPages.map((pageBlocks, pageIndex) => {
            const isFirstPage = pageIndex === 0;
            const isContinuationPage = pageIndex < totalPages - 1;
""",
    'live continuation page flag',
)

replace_once(
    live,
    """                >
                  <table
                    className="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed"
                    style={{ border: '1px solid #000000', borderCollapse: 'collapse', width: '100%' }}
                  >
""",
    """                >
                  <div
                    className="sop-a4-content-frame"
                    style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                  >
                  <table
                    className="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed"
                    style={{
                      border: '1px solid #000000',
                      borderBottom: isContinuationPage ? '0' : '1px solid #000000',
                      borderCollapse: 'collapse',
                      width: '100%',
                      flexShrink: 0
                    }}
                  >
""",
    'live content frame start',
)

replace_once(
    live,
    """                        const editorKey = `${pageIndex}-${cfg.id}`;

                        return (
""",
    """                        const editorKey = `${pageIndex}-${cfg.id}`;
                        const extendToPageBottom =
                          isContinuationPage && groupIdx === pageSectionGroups.length - 1;

                        return (
""",
    'live last row continuation state',
)

replace_once(
    live,
    """                            <td className="border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word] w-[28%] text-black">
""",
    """                            <td
                              className="border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word] w-[28%] text-black"
                              style={{ borderBottom: extendToPageBottom ? '0' : undefined }}
                            >
""",
    'live title cell bottom continuation',
)

replace_once(
    live,
    """                            <td
                              colSpan={3}
                              className={`border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content w-[72%] ${
                                isSectionActive ? 'bg-indigo-50/10' : 'bg-white'
                              }`}
                            >
""",
    """                            <td
                              colSpan={3}
                              className={`border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content w-[72%] ${
                                isSectionActive ? 'bg-indigo-50/10' : 'bg-white'
                              }`}
                              style={{ borderBottom: extendToPageBottom ? '0' : undefined }}
                            >
""",
    'live content cell bottom continuation',
)

replace_once(
    live,
    """                    </tbody>
                  </table>
                </div>
              </React.Fragment>
""",
    """                    </tbody>
                  </table>
                  {isContinuationPage && (
                    <div
                      aria-hidden="true"
                      data-sop-page-continuation-fill="true"
                      style={{
                        flex: '1 1 auto',
                        minHeight: 0,
                        position: 'relative',
                        boxSizing: 'border-box',
                        backgroundColor: '#ffffff',
                        borderLeft: '1px solid #000000',
                        borderRight: '1px solid #000000',
                        borderBottom: '1px solid #000000'
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute', top: 0, bottom: 0, left: '28%',
                          borderLeft: '1px solid #000000'
                        }}
                      />
                    </div>
                  )}
                  </div>
                </div>
              </React.Fragment>
""",
    'live continuation filler',
)

# 3) Structured tables get a safe-row split chance before whole-block defer.
helper_anchor = """export function isSplittableTextFlowHtml(html: string): boolean {
  if (!html || typeof DOMParser === 'undefined') return false;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (doc.body.querySelector('table, img, figure')) return false;
    const first = doc.body.firstElementChild;
    if (!first) return Boolean((doc.body.textContent || '').trim());
    return /^(p|div|blockquote|h[1-6]|ol|ul)$/i.test(first.tagName);
  } catch {
    return false;
  }
}

"""
helper_new = helper_anchor + """/** True when this flow unit contains a table that may split at safe row boundaries. */
export function hasStructuredTableFlowHtml(html: string): boolean {
  if (!html || typeof DOMParser === 'undefined') return false;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Boolean(doc.body.querySelector('table'));
  } catch {
    return false;
  }
}

"""
replace_once(canonical, helper_anchor, helper_new, 'canonical table flow classifier')

defer_anchor = """      // A complete unit that fits on a fresh page moves there intact only after
      // rich text has had a chance to use the current page. This remains the
      // correct behavior for tables/media and short unsplittable text.
      if (
        currentPageBlocks.length > 0 &&
        shouldDeferWholeBlockToNextPage(
"""

table_split = """      // Structured tables are continuous row flow. Before considering a whole-
      // block defer, let the V2 table paginator consume every safe row that fits
      // in the remaining page space. If no body row can fit, the normal defer
      // rule below still moves the table intact to the next page.
      if (
        currentPageBlocks.length > 0 &&
        remaining >= 24 &&
        hasStructuredTableFlowHtml(block.html)
      ) {
        const tableParts = splitHtmlForCapacity(block.html, remaining, null);
        if (tableParts.length > 1) {
          const firstPart = tableParts[0];
          const restParts = tableParts.slice(1);
          const firstHeight = measureFlowPart(firstPart);
          const firstNeeded = firstHeight + chrome;
          if (firstHeight > 0 && used + firstNeeded <= capacity) {
            const fittedFirstBlock: OfficialBlock = {
              ...block,
              id: `${block.id}-table-fit-1`,
              html: forceLogicalListMetadata(firstPart, block)
            };
            const continuationBlocks: OfficialBlock[] = restParts.map(
              (html, partIndex) => ({
                ...block,
                id: `${block.id}-table-fit-${partIndex + 2}`,
                html: forceLogicalListMetadata(html, block)
              })
            );
            const continuationHeights = continuationBlocks.map((part) =>
              measureFlowPart(part.html)
            );

            flowBlocks[index] = fittedFirstBlock;
            flowHeights[index] = firstHeight;
            flowBlocks.splice(index + 1, 0, ...continuationBlocks);
            flowHeights.splice(index + 1, 0, ...continuationHeights);

            currentPageBlocks.push(fittedFirstBlock);
            used += firstNeeded;
            currentSection = block.section;
            index += 1;
            continue;
          }
        }
      }

      // A complete unit that fits on a fresh page moves there intact only after
      // rich text and structured tables have had a chance to consume the current
      // page. Images/media and genuinely unsplittable units remain atomic.
      if (
        currentPageBlocks.length > 0 &&
        shouldDeferWholeBlockToNextPage(
"""
replace_once(canonical, defer_anchor, table_split, 'canonical table split before defer')

# 4) Preview/PDF use the same non-final-page continuation frame.
replace_once(
    preview,
    """                {pageGroups.map((pageBlocks, pageIndex) => {
                  if (!pageBlocks.length) return null;

                  const pageElement = (
""",
    """                {pageGroups.map((pageBlocks, pageIndex) => {
                  if (!pageBlocks.length) return null;
                  const isContinuationPage = pageIndex < calculatedTotalPages - 1;

                  const pageElement = (
""",
    'preview continuation page flag',
)

replace_once(
    preview,
    """                    >
                      <table
                        className="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed"
                        style={{ border: '1px solid #000000', borderCollapse: 'collapse', width: '100%' }}
                      >
""",
    """                    >
                      <div
                        className="sop-a4-content-frame"
                        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                      >
                      <table
                        className="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed"
                        style={{
                          border: '1px solid #000000',
                          borderBottom: isContinuationPage ? '0' : '1px solid #000000',
                          borderCollapse: 'collapse',
                          width: '100%',
                          flexShrink: 0
                        }}
                      >
""",
    'preview content frame start',
)

replace_once(
    preview,
    """                                false,
                                true
                              )
""",
    """                                false,
                                !(isContinuationPage && groupIndex === groups.length - 1)
                              )
""",
    'preview final visible row bottom border',
)

replace_once(
    preview,
    """                        </tbody>
                      </table>
                    </div>
                  );
""",
    """                        </tbody>
                      </table>
                      {isContinuationPage && (
                        <div
                          aria-hidden="true"
                          data-sop-page-continuation-fill="true"
                          style={{
                            flex: '1 1 auto',
                            minHeight: 0,
                            position: 'relative',
                            boxSizing: 'border-box',
                            backgroundColor: '#ffffff',
                            borderLeft: '1px solid #000000',
                            borderRight: '1px solid #000000',
                            borderBottom: '1px solid #000000'
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute', top: 0, bottom: 0, left: '28%',
                              borderLeft: '1px solid #000000'
                            }}
                          />
                        </div>
                      )}
                      </div>
                    </div>
                  );
""",
    'preview continuation filler',
)

# 5) Regression locks.
tests = read(testfile)
marker = 'LiveSPO multi-page toolbar ownership is fragment-scoped'
if marker in tests:
    raise SystemExit('regression tests already appended unexpectedly')

tests += r'''

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

test('non-final Live and Preview pages extend Batang Tubuh to canonical bottom only', () => {
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');
  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  for (const source of [live, preview]) {
    assert.match(source, /data-sop-page-continuation-fill="true"/);
    assert.match(source, /isContinuationPage/);
    assert.match(source, /flex: '1 1 auto'/);
    assert.match(source, /left: '28%'/);
    assert.match(source, /borderBottom: '1px solid #000000'/);
  }
  assert.match(live, /pageIndex < totalPages - 1/);
  assert.match(preview, /pageIndex < calculatedTotalPages - 1/);
});
'''
write(testfile, tests)

print('Integrated patch applied fail-closed.')
