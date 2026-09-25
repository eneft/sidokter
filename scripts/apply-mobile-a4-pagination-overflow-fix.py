from pathlib import Path

path = Path('src/components/SopDetailModal.tsx')
text = path.read_text(encoding='utf-8')

old_state = "  const [officialPages, setOfficialPages] = useState<OfficialBlock[][]>([]);\n  const [layoutBlocks, setLayoutBlocks] = useState<OfficialBlock[]>([]);"
new_state = "  const [officialPages, setOfficialPages] = useState<OfficialBlock[][]>([]);\n  const [paginationSafetyBufferPx, setPaginationSafetyBufferPx] = useState(8);\n  const [layoutBlocks, setLayoutBlocks] = useState<OfficialBlock[]>([]);"
if old_state not in text:
    raise SystemExit('officialPages state anchor not found')
text = text.replace(old_state, new_state, 1)

reset_anchor = "  useEffect(() => {\n    setShowReviewEvidencePreview(false);"
reset_block = "  useEffect(() => {\n    setPaginationSafetyBufferPx(8);\n  }, [sop?.id, isOpen]);\n\n"
if reset_anchor not in text:
    raise SystemExit('preview reset anchor not found')
text = text.replace(reset_anchor, reset_block + reset_anchor, 1)

old_metrics = "        const headerHeightPx = header.getBoundingClientRect().height;\n        const publicationHeightPx = publication.getBoundingClientRect().height;"
new_metrics = "        // offsetHeight is a layout-space measurement and is NOT affected by\n        // the mobile preview transform. getBoundingClientRect() is transformed,\n        // which previously made the header look much shorter on iPhone and\n        // let too much body content be packed into a physical A4 page.\n        const headerHeightPx = header.offsetHeight || header.getBoundingClientRect().height;\n        const publicationHeightPx = publication.offsetHeight || publication.getBoundingClientRect().height;"
if old_metrics not in text:
    raise SystemExit('header/publication metric anchor not found')
text = text.replace(old_metrics, new_metrics, 1)

old_safety = "          safetyBufferPx: 4\n        });"
new_safety = "          safetyBufferPx: paginationSafetyBufferPx\n        });"
if old_safety not in text:
    raise SystemExit('pagination safety anchor not found')
text = text.replace(old_safety, new_safety, 1)

old_deps = "  }, [isOpen, sop?.id, activeTab, layoutBlocks, isExistingPdf]);"
new_deps = "  }, [isOpen, sop?.id, activeTab, layoutBlocks, isExistingPdf, paginationSafetyBufferPx]);"
if old_deps not in text:
    raise SystemExit('pagination dependency anchor not found')
text = text.replace(old_deps, new_deps, 1)

measure_start_marker = "                {/* ==========================================================\n                    MEASUREMENT CANVAS"
measure_end_marker = "                {isPaginatingOfficial && officialPages.length === 0 && ("
measure_start = text.find(measure_start_marker)
if measure_start < 0:
    raise SystemExit('measurement canvas start not found')
measure_end = text.find(measure_end_marker, measure_start)
if measure_end < 0:
    raise SystemExit('measurement canvas end not found')
measure_block = text[measure_start:measure_end]
text = text[:measure_start] + text[measure_end:]

toolbar_anchor = "              {/* Canonical A4 Preview Zoom Toolbar (No-Print) */}"
toolbar_pos = text.find(toolbar_anchor)
if toolbar_pos < 0:
    raise SystemExit('preview toolbar anchor not found')
detached_measure_comment = "              {/* Canonical physical measurement shell. IMPORTANT: this must stay OUTSIDE\n                  the visually transformed preview tree so mobile fit-to-screen scaling\n                  can never change pagination metrics. */}\n"
text = text[:toolbar_pos] + detached_measure_comment + measure_block + "\n" + text[toolbar_pos:]

guard_anchor = "  useEffect(() => {\n    let cancelled = false;\n    if (!isOpen || !sop || isExisting || isPaginatingOfficial || !officialPages.length) {"
guard = """  useEffect(() => {
    if (
      !isOpen ||
      isExistingPdf ||
      isPaginatingOfficial ||
      !officialPages.length ||
      (isReviewDoc && riviuPreviewTab !== 'document')
    ) return;

    const viewport = previewViewportRef.current;
    if (!viewport) return;

    // clientHeight/scrollHeight are layout-space metrics and ignore CSS transform
    // scaling, so this check is stable on desktop, Android and iOS Safari.
    const pageNodes = Array.from(viewport.querySelectorAll<HTMLElement>('.sop-preview-page'));
    let maxOverflowPx = 0;
    pageNodes.forEach((pageNode) => {
      const frame = pageNode.querySelector<HTMLElement>('.sop-a4-content-frame');
      const table = frame?.querySelector<HTMLElement>('.sop-official-table');
      if (!frame || !table || frame.clientHeight <= 0) return;
      maxOverflowPx = Math.max(maxOverflowPx, table.scrollHeight - frame.clientHeight);
    });

    if (maxOverflowPx > 1 && paginationSafetyBufferPx < 192) {
      const nextSafety = Math.min(
        192,
        Math.max(
          paginationSafetyBufferPx + 4,
          paginationSafetyBufferPx + Math.ceil(maxOverflowPx) + 4
        )
      );
      setIsPaginatingOfficial(true);
      setPaginationSafetyBufferPx(nextSafety);
    }
  }, [
    isOpen,
    sop?.id,
    isExistingPdf,
    isPaginatingOfficial,
    officialPages,
    paginationSafetyBufferPx,
    isReviewDoc,
    riviuPreviewTab
  ]);

"""
if guard_anchor not in text:
    raise SystemExit('PDF generation effect anchor not found')
text = text.replace(guard_anchor, guard + guard_anchor, 1)

old_frame = 'className="sop-a4-content-frame"\n                        style={{ height: \'100%\', display: \'flex\', flexDirection: \'column\' }}'
new_frame = 'className="sop-a4-content-frame"\n                        data-sop-a4-content-frame="true"\n                        style={{ height: \'100%\', display: \'flex\', flexDirection: \'column\' }}'
if old_frame not in text:
    raise SystemExit('A4 content frame anchor not found')
text = text.replace(old_frame, new_frame, 1)

path.write_text(text, encoding='utf-8')

test = Path('tests/sop-preview-mobile-pagination.test.cjs')
test.write_text("""const test = require('node:test');
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
  assert.match(source, /header\\.offsetHeight\\s*\\|\\|\\s*header\\.getBoundingClientRect\\(\\)\\.height/);
  assert.match(source, /publication\\.offsetHeight\\s*\\|\\|\\s*publication\\.getBoundingClientRect\\(\\)\\.height/);
  assert.match(source, /safetyBufferPx:\\s*paginationSafetyBufferPx/);
});

test('rendered A4 pages self-correct overflow before PDF generation', () => {
  assert.match(source, /table\\.scrollHeight\\s*-\\s*frame\\.clientHeight/);
  assert.match(source, /setPaginationSafetyBufferPx\\(nextSafety\\)/);
  assert.match(source, /setIsPaginatingOfficial\\(true\\)/);
  assert.match(source, /data-sop-a4-content-frame=\"true\"/);
});
""", encoding='utf-8')
