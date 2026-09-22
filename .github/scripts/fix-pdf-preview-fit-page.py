from pathlib import Path

# 1) DocumentViewer: make the inline PDF download action optional without
# changing non-PDF fallback download controls.
viewer_path = Path('src/components/DocumentViewer.tsx')
viewer = viewer_path.read_text()
old = """  /** Let the parent own vertical scrolling by expanding a PDF to all pages. */\n  singleScroll?: boolean;\n}\n"""
new = """  /** Let the parent own vertical scrolling by expanding a PDF to all pages. */\n  singleScroll?: boolean;\n  /** Hide the inline PDF download action when the parent already provides one. */\n  showPdfDownloadAction?: boolean;\n}\n"""
if viewer.count(old) != 1:
    raise SystemExit(f'DocumentViewer prop target mismatch: {viewer.count(old)}')
viewer = viewer.replace(old, new, 1)

old = """  className = '',\n  heightClass = 'h-[500px]',\n  singleScroll = false\n}) => {\n"""
new = """  className = '',\n  heightClass = 'h-[500px]',\n  singleScroll = false,\n  showPdfDownloadAction = true\n}) => {\n"""
if viewer.count(old) != 1:
    raise SystemExit(f'DocumentViewer destructure target mismatch: {viewer.count(old)}')
viewer = viewer.replace(old, new, 1)

old = """          <button type=\"button\" onClick={handleDownload} className=\"inline-flex items-center gap-1 h-6 px-2 rounded-md border border-slate-200 text-[10px] font-semibold text-slate-600 hover:bg-slate-50\" title=\"Unduh dokumen\">\n            <Download className=\"w-3 h-3\" />\n            <span>Unduh</span>\n          </button>\n"""
new = """          {showPdfDownloadAction && (\n            <button type=\"button\" onClick={handleDownload} className=\"inline-flex items-center gap-1 h-6 px-2 rounded-md border border-slate-200 text-[10px] font-semibold text-slate-600 hover:bg-slate-50\" title=\"Unduh dokumen\">\n              <Download className=\"w-3 h-3\" />\n              <span>Unduh</span>\n            </button>\n          )}\n"""
if viewer.count(old) != 1:
    raise SystemExit(f'DocumentViewer PDF download button target mismatch: {viewer.count(old)}')
viewer = viewer.replace(old, new, 1)
viewer_path.write_text(viewer)

# 2) SPO Existing PDF: use the same fixed native PDF viewport behavior as SK/MOU
# instead of singleScroll, which stretches the iframe to document height.
sop_path = Path('src/components/SopDetailModal.tsx')
sop = sop_path.read_text()
old = """                  <DocumentViewer fileUrl={legacyFileUrl} fileName={legacyFileName} storagePath={resolvedLegacySource?.storagePath} className=\"w-full\" singleScroll />\n"""
new = """                  <DocumentViewer\n                    fileUrl={legacyFileUrl}\n                    fileName={legacyFileName}\n                    storagePath={resolvedLegacySource?.storagePath}\n                    className=\"w-full\"\n                    heightClass=\"h-[70vh] min-h-[420px] sm:min-h-[520px]\"\n                    showPdfDownloadAction={false}\n                  />\n"""
if sop.count(old) != 1:
    raise SystemExit(f'SopDetailModal Existing PDF viewer target mismatch: {sop.count(old)}')
sop = sop.replace(old, new, 1)
sop_path.write_text(sop)

# 3) SK/MOU modal already owns the Download PDF action in its header; remove the
# duplicate inline PDF download button there as requested.
library_path = Path('src/components/LibraryDocumentPage.tsx')
library = library_path.read_text()
old = """                heightClass=\"h-full w-full\"\n              />\n"""
new = """                heightClass=\"h-full w-full\"\n                showPdfDownloadAction={false}\n              />\n"""
if library.count(old) != 1:
    raise SystemExit(f'LibraryDocumentPage viewer target mismatch: {library.count(old)}')
library = library.replace(old, new, 1)
library_path.write_text(library)

# 4) Focused regression guard. Keep this small and source-oriented because the
# browser-native PDF plugin itself is not deterministic in jsdom.
test_path = Path('tests/document-viewer-ui.test.cjs')
test_path.write_text("""const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\n\ntest('SPO Existing PDF uses fixed native viewer instead of singleScroll stretching', () => {\n  const source = fs.readFileSync('src/components/SopDetailModal.tsx', 'utf8');\n  const marker = source.indexOf('fileUrl={legacyFileUrl}');\n  assert.ok(marker >= 0);\n  const block = source.slice(marker - 100, marker + 550);\n  assert.match(block, /heightClass=\"h-\\[70vh\\] min-h-\\[420px\\] sm:min-h-\\[520px\\]\"/);\n  assert.match(block, /showPdfDownloadAction=\\{false\\}/);\n  assert.doesNotMatch(block, /singleScroll/);\n});\n\ntest('DocumentViewer can hide only the inline PDF download action', () => {\n  const source = fs.readFileSync('src/components/DocumentViewer.tsx', 'utf8');\n  assert.match(source, /showPdfDownloadAction\\?: boolean/);\n  assert.match(source, /showPdfDownloadAction = true/);\n  assert.match(source, /\\{showPdfDownloadAction && \\(\\s*<button[^>]*title=\"Unduh dokumen\"/);\n  assert.match(source, /<span>Unduh Dokumen<\\/span>/);\n  assert.match(source, /<span>Unduh Berkas Asli \\(\\{effectiveFileName\\}\\)<\\/span>/);\n});\n\ntest('SK/MOU primary PDF viewer hides duplicate inline Unduh because header owns Download PDF', () => {\n  const source = fs.readFileSync('src/components/LibraryDocumentPage.tsx', 'utf8');\n  assert.match(source, /<span className=\"hidden sm:inline\">Download PDF<\\/span>/);\n  const marker = source.lastIndexOf('<DocumentViewer');\n  assert.ok(marker >= 0);\n  const block = source.slice(marker, marker + 420);\n  assert.match(block, /showPdfDownloadAction=\\{false\\}/);\n});\n""")

print('PDF preview viewport aligned with SK/MOU viewer and duplicate inline download action suppressed')
