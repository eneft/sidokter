from pathlib import Path

# 1) Canonical block builder: keep Live editor structural sections by default,
#    but allow Preview/PDF to omit an empty optional ALUR section.
canon_path = Path('src/utils/canonicalA4Pagination.ts')
canon = canon_path.read_text()

old = """export interface CanonicalPaginationOptions {\n  headerHeightPx?: number;\n  publicationHeightPx?: number;\n  safetyBufferPx?: number;\n}\n"""
new = """export interface BuildOfficialBlocksOptions {\n  /** Output-only mode: ALUR/BAGAN ALIR is optional and must disappear when empty. */\n  omitEmptyAlur?: boolean;\n}\n\nexport interface CanonicalPaginationOptions {\n  headerHeightPx?: number;\n  publicationHeightPx?: number;\n  safetyBufferPx?: number;\n}\n"""
if canon.count(old) != 1:
    raise SystemExit(f'canonical options insertion target mismatch: {canon.count(old)}')
canon = canon.replace(old, new, 1)

old = """export function buildOfficialBlocks(\n  input: SopSectionsInput\n): OfficialBlock[] {\n"""
new = """export function buildOfficialBlocks(\n  input: SopSectionsInput,\n  options: BuildOfficialBlocksOptions = {}\n): OfficialBlock[] {\n"""
if canon.count(old) != 1:
    raise SystemExit(f'buildOfficialBlocks signature target mismatch: {canon.count(old)}')
canon = canon.replace(old, new, 1)

old = """      const extracted = extractProcedureBlocks(sec.html);\n      const units = extracted.length > 0 ? extracted : [''];\n"""
new = """      const extracted = extractProcedureBlocks(sec.html);\n      // ALUR / BAGAN ALIR is optional in the finalized document. Live/editor\n      // callers keep the empty structural row by default; Preview/PDF callers\n      // explicitly opt in to omitting it. This also treats editor-empty HTML\n      // such as <p><br></p> as empty because extractProcedureBlocks returns [].\n      if (sec.id === 'alur' && options.omitEmptyAlur && extracted.length === 0) {\n        return [];\n      }\n      const units = extracted.length > 0 ? extracted : [''];\n"""
if canon.count(old) != 1:
    raise SystemExit(f'empty section flow target mismatch: {canon.count(old)}')
canon = canon.replace(old, new, 1)
canon_path.write_text(canon)

# 2) Preview/PDF: opt into empty-ALUR omission and remove the A4 shell border
#    that visually appears as a stray bottom margin line between pages.
preview_path = Path('src/components/SopDetailModal.tsx')
preview = preview_path.read_text()

old = """    categoryName: sop?.categoryName\n  }) as OfficialBlock[];\n"""
new = """    categoryName: sop?.categoryName\n  }, { omitEmptyAlur: true }) as OfficialBlock[];\n"""
if preview.count(old) != 1:
    raise SystemExit(f'Preview buildOfficialBlocks call target mismatch: {preview.count(old)}')
preview = preview.replace(old, new, 1)

old = """                        boxShadow: '0 2px 12px rgba(0,0,0,.08)',\n                        border: '1px solid #e2e8f0',\n                        position: 'relative'\n"""
new = """                        boxShadow: '0 2px 12px rgba(0,0,0,.08)',\n                        border: 'none',\n                        position: 'relative'\n"""
if preview.count(old) != 1:
    raise SystemExit(f'preview A4 shell border target mismatch: {preview.count(old)}')
preview = preview.replace(old, new, 1)
preview_path.write_text(preview)

# 3) Regression coverage: default builder still keeps structural ALUR for Live,
#    output mode omits empty ALUR, preserves non-empty/media ALUR, and preview
#    no longer draws an outer page border.
test_path = Path('tests/live-sop-content-integrity.test.ts')
tests = test_path.read_text()
marker = "test('Preview/PDF omit an empty optional ALUR while Live keeps the structural editor row'"
if marker not in tests:
    tests += r'''\n\ntest('Preview/PDF omit an empty optional ALUR while Live keeps the structural editor row', () => {\n  const base = {\n    pengertian: '<p>Pengertian</p>',\n    tujuan: '<p>Tujuan</p>',\n    kebijakan: '<p>Kebijakan</p>',\n    prosedur: '<p>Prosedur</p>',\n    alur: '',\n    unitTerkait: '<p>Unit</p>',\n  };\n\n  const liveBlocks = buildOfficialBlocks(base);\n  assert.equal(liveBlocks.some((block) => block.section === 'ALUR / BAGAN ALIR'), true);\n\n  const outputBlocks = buildOfficialBlocks(base, { omitEmptyAlur: true });\n  assert.equal(outputBlocks.some((block) => block.section === 'ALUR / BAGAN ALIR'), false);\n  assert.equal(outputBlocks.some((block) => block.section === 'UNIT TERKAIT'), true);\n\n  const priorParser = (globalThis as any).DOMParser;\n  const priorNode = (globalThis as any).Node;\n  class BrowserLikeDOMParser {\n    parseFromString(source: string) {\n      return new LinkedomDOMParser().parseFromString(\n        `<!doctype html><html><body>${source}</body></html>`,\n        'text/html'\n      );\n    }\n  }\n  (globalThis as any).DOMParser = BrowserLikeDOMParser;\n  (globalThis as any).Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };\n  try {\n    const editorEmpty = buildOfficialBlocks(\n      { ...base, alur: '<p><br></p>' },\n      { omitEmptyAlur: true }\n    );\n    assert.equal(editorEmpty.some((block) => block.section === 'ALUR / BAGAN ALIR'), false);\n\n    const mediaAlur = buildOfficialBlocks(\n      { ...base, alur: '<figure><img src="data:image/png;base64,AA==" /></figure>' },\n      { omitEmptyAlur: true }\n    );\n    assert.equal(mediaAlur.some((block) => block.section === 'ALUR / BAGAN ALIR'), true);\n  } finally {\n    (globalThis as any).DOMParser = priorParser;\n    (globalThis as any).Node = priorNode;\n  }\n});\n\ntest('Preview/PDF explicitly opt out of empty ALUR and do not draw an outer A4 page border', () => {\n  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');\n  assert.match(preview, /omitEmptyAlur:\s*true/);\n  assert.match(preview, /boxShadow:\s*'0 2px 12px rgba\(0,0,0,\.08\)'[\s\S]{0,100}border:\s*'none'/);\n  assert.doesNotMatch(preview, /border:\s*'1px solid #e2e8f0'/);\n});\n'''

test_path.write_text(tests)
print('Preview empty-ALUR + page-border repair applied')
