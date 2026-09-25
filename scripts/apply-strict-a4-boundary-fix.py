from pathlib import Path

path = Path('src/components/SopDetailModal.tsx')
text = path.read_text(encoding='utf-8')

text = text.replace(
    'const [paginationSafetyBufferPx, setPaginationSafetyBufferPx] = useState(8);',
    'const [paginationSafetyBufferPx, setPaginationSafetyBufferPx] = useState(12);',
    1,
)
text = text.replace(
    '    setPaginationSafetyBufferPx(8);',
    '    setPaginationSafetyBufferPx(12);',
    1,
)

start_marker = "  useEffect(() => {\n    if (\n      !isOpen ||\n      isExistingPdf ||\n      isPaginatingOfficial ||\n      !officialPages.length ||\n      (isReviewDoc && riviuPreviewTab !== 'document')\n    ) return;"
end_marker = "  useEffect(() => {\n    let cancelled = false;\n    if (!isOpen || !sop || isExisting || isPaginatingOfficial || !officialPages.length) {"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('strict A4 overflow guard anchors not found')

guard = '''  useEffect(() => {
    if (
      !isOpen ||
      isExistingPdf ||
      isPaginatingOfficial ||
      !officialPages.length ||
      (isReviewDoc && riviuPreviewTab !== 'document')
    ) return;

    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;

    const auditPhysicalA4Boundary = () => {
      if (cancelled) return;
      const viewport = previewViewportRef.current;
      if (!viewport) return;

      // Compare against the INNER physical A4 content frame. The page already
      // owns 20 mm padding, so content entering the bottom margin is overflow.
      const pageNodes = Array.from(viewport.querySelectorAll<HTMLElement>('.sop-preview-page'));
      const visualScale = Math.max(
        0.01,
        Number.isFinite(calculatedPreviewScale) ? calculatedPreviewScale : 1
      );
      let maxOverflowLayoutPx = 0;

      pageNodes.forEach((pageNode) => {
        const frame = pageNode.querySelector<HTMLElement>('.sop-a4-content-frame');
        const table = frame?.querySelector<HTMLElement>('.sop-official-table');
        if (!frame || !table || frame.clientHeight <= 0) return;

        const scrollOverflow = Math.max(
          0,
          table.scrollHeight - frame.clientHeight,
          frame.scrollHeight - frame.clientHeight
        );

        // iOS Safari may paint descendants outside a cell without increasing
        // the table scrollHeight. Audit actual painted descendant bottoms too.
        const frameRect = frame.getBoundingClientRect();
        const contentNodes: HTMLElement[] = [
          table,
          ...Array.from(
            frame.querySelectorAll<HTMLElement>(
              'tr,td,th,.rich-text-output,.rich-text-document-content,p,li,ol,ul,table,img,figure,.figure-wrapper'
            )
          )
        ];
        let maxVisualOverflow = 0;
        contentNodes.forEach((node) => {
          const rect = node.getBoundingClientRect();
          if (rect.height <= 0 || rect.width <= 0) return;
          maxVisualOverflow = Math.max(maxVisualOverflow, rect.bottom - frameRect.bottom);
        });

        // Convert transformed visual pixels back to canonical A4 layout pixels.
        const rectOverflowLayout = Math.max(0, maxVisualOverflow / visualScale);
        maxOverflowLayoutPx = Math.max(
          maxOverflowLayoutPx,
          scrollOverflow,
          rectOverflowLayout
        );
      });

      if (maxOverflowLayoutPx > 0.75 && paginationSafetyBufferPx < 320) {
        const nextSafety = Math.min(
          320,
          Math.max(
            paginationSafetyBufferPx + 6,
            paginationSafetyBufferPx + Math.ceil(maxOverflowLayoutPx) + 6
          )
        );
        // An invalid page may never stabilize or be used for PDF generation.
        setIsPaginatingOfficial(true);
        setPaginationSafetyBufferPx(nextSafety);
      }
    };

    // Wait two frames so React/table/Safari layout has settled before auditing.
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(auditPhysicalA4Boundary);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [
    isOpen,
    sop?.id,
    isExistingPdf,
    isPaginatingOfficial,
    officialPages,
    paginationSafetyBufferPx,
    isReviewDoc,
    riviuPreviewTab,
    calculatedPreviewScale
  ]);

'''
text = text[:start] + guard + text[end:]

old_frame = 'data-sop-a4-content-frame="true"\n                        style={{ height: \'100%\', display: \'flex\', flexDirection: \'column\' }}'
new_frame = 'data-sop-a4-content-frame="true"\n                        data-sop-a4-safe-area="20mm"\n                        style={{ height: \'100%\', display: \'flex\', flexDirection: \'column\' }}'
if old_frame not in text:
    raise SystemExit('safe frame marker not found')
text = text.replace(old_frame, new_frame, 1)

path.write_text(text, encoding='utf-8')

test = Path('tests/sop-preview-a4-boundary.test.cjs')
test.write_text('''const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('src/components/SopDetailModal.tsx', 'utf8');

test('A4 preview treats the 20mm inner frame as a hard page boundary', () => {
  assert.match(source, /data-sop-a4-safe-area="20mm"/);
  assert.match(source, /frame\\.scrollHeight\\s*-\\s*frame\\.clientHeight/);
  assert.match(source, /rect\\.bottom\\s*-\\s*frameRect\\.bottom/);
});

test('painted descendant overflow is converted back to canonical layout pixels', () => {
  assert.match(source, /maxVisualOverflow\\s*\\/\\s*visualScale/);
  assert.match(source, /calculatedPreviewScale/);
  assert.match(source, /paginationSafetyBufferPx\\s*<\\s*320/);
});

test('invalid A4 page is repaginated before it can stabilize', () => {
  assert.match(source, /setIsPaginatingOfficial\\(true\\)/);
  assert.match(source, /setPaginationSafetyBufferPx\\(nextSafety\\)/);
  assert.match(source, /requestAnimationFrame\\(auditPhysicalA4Boundary\\)/);
});
''', encoding='utf-8')
