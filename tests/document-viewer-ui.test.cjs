const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('SPO Existing PDF uses fixed native viewer instead of singleScroll stretching', () => {
  const source = fs.readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  const marker = source.indexOf('fileUrl={legacyFileUrl}');
  assert.ok(marker >= 0);
  const block = source.slice(marker - 100, marker + 550);
  assert.match(block, /heightClass="h-\[70vh\] min-h-\[420px\] sm:min-h-\[520px\]"/);
  assert.match(block, /showPdfDownloadAction=\{false\}/);
  assert.doesNotMatch(block, /singleScroll/);
});

test('DocumentViewer can hide only the inline PDF download action', () => {
  const source = fs.readFileSync('src/components/DocumentViewer.tsx', 'utf8');
  assert.match(source, /showPdfDownloadAction\?: boolean/);
  assert.match(source, /showPdfDownloadAction = true/);
  assert.match(source, /\{showPdfDownloadAction && \(\s*<button[^>]*title="Unduh dokumen"/);
  assert.match(source, /<span>Unduh Dokumen<\/span>/);
  assert.match(source, /<span>Unduh Berkas Asli \(\{effectiveFileName\}\)<\/span>/);
});

test('SK/MOU primary PDF viewer hides duplicate inline Unduh because header owns Download PDF', () => {
  const source = fs.readFileSync('src/components/LibraryDocumentPage.tsx', 'utf8');
  assert.match(source, /<span className="hidden sm:inline">Download PDF<\/span>/);
  const marker = source.lastIndexOf('<DocumentViewer');
  assert.ok(marker >= 0);
  const block = source.slice(marker, marker + 420);
  assert.match(block, /showPdfDownloadAction=\{false\}/);
});
