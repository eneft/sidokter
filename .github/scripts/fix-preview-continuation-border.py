from pathlib import Path

preview_path = Path('src/components/SopDetailModal.tsx')
preview = preview_path.read_text()
old = """                            borderLeft: '1px solid #000000',\n                            borderRight: '1px solid #000000',\n                            borderBottom: 0\n"""
new = """                            borderLeft: '1px solid #000000',\n                            borderRight: '1px solid #000000',\n                            borderBottom: '1px solid #000000'\n"""
if preview.count(old) != 1:
    raise SystemExit(f'preview continuation fill target mismatch: {preview.count(old)}')
preview = preview.replace(old, new, 1)
preview_path.write_text(preview)

test_path = Path('tests/live-sop-content-integrity.test.ts')
tests = test_path.read_text()
old = """  assert.match(live, /borderBottom: '1px solid #000000'/);\n  assert.match(preview, /borderBottom: 0/);\n"""
new = """  assert.match(live, /borderBottom: '1px solid #000000'/);\n  assert.match(preview, /borderBottom: '1px solid #000000'/);\n"""
if tests.count(old) != 1:
    raise SystemExit(f'continuation regression target mismatch: {tests.count(old)}')
tests = tests.replace(old, new, 1)

test_name = "test('Preview continuation fill closes the Batang Tubuh boundary without restoring the outer A4 shell border'"
if test_name not in tests:
    tests += """\n\ntest('Preview continuation fill closes the Batang Tubuh boundary without restoring the outer A4 shell border', () => {\n  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');\n  assert.match(preview, /data-sop-page-continuation-fill=\"true\"[\\s\\S]{0,500}borderBottom:\\s*'1px solid #000000'/);\n  assert.match(preview, /boxShadow:\\s*'0 2px 12px rgba\\(0,0,0,\\.08\\)'[\\s\\S]{0,100}border:\\s*'none'/);\n  assert.doesNotMatch(preview, /border:\\s*'1px solid #e2e8f0'/);\n});\n"""

test_path.write_text(tests)
print('Preview continuation bottom boundary restored without outer A4 border')
