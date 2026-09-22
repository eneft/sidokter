from pathlib import Path
import re

path = Path('src/components/SopDetailModal.tsx')
text = path.read_text()

replacements = [
    (
        "  Maximize2,\n  Minimize2,\n",
        "",
        1,
        "fullscreen icon imports",
    ),
    (
        "  }, [isOpen, isMaximized]);\n",
        "  }, [isOpen]);\n",
        1,
        "preview width observer dependency",
    ),
    (
        "    <div className={`fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex items-center justify-center ${isMaximized ? 'p-0' : 'p-0 sm:p-3 sm:py-2'} printable-modal-active`}>\n      <div className={`bg-white w-full ${isMaximized ? 'h-full max-w-full rounded-none border-0 shadow-none' : 'sm:max-w-[96vw] h-full sm:h-[95vh] rounded-none sm:rounded-xl shadow-2xl border-0 sm:border border-slate-200'} overflow-hidden flex flex-col printable-modal-overlay`}>\n",
        "    <div className=\"fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 printable-modal-active\">\n      <div className=\"bg-white w-full h-full sm:h-[94vh] sm:max-w-[1120px] rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-slate-200 overflow-hidden flex flex-col printable-modal-overlay\">\n",
        1,
        "compact modal shell",
    ),
    (
        "          {isExistingPdf ? (\n            <div className=\"space-y-4\">\n",
        "          {isExistingPdf ? (\n            <div className=\"space-y-4 w-full max-w-[920px] mx-auto\">\n",
        1,
        "existing PDF width cap",
    ),
    (
        "                            borderBottom: '1px solid #000000'\n",
        "                            borderBottom: 0\n",
        1,
        "preview continuation bottom border",
    ),
]

for old, new, expected, label in replacements:
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{label} target mismatch: expected {expected}, found {count}')
    text = text.replace(old, new, expected)

state_pattern = re.compile(
    r"  // Canonical A4 visual scale viewer \(identik across desktop, tablet, and mobile\)\n"
    r"  const \[isMaximized, setIsMaximized\] = useState<boolean>\(\(\) => \{[\s\S]*?\n  \}\);\n"
)
text, count = state_pattern.subn(
    "  // Canonical A4 visual scale viewer (identik across desktop, tablet, and mobile)\n",
    text,
    count=1,
)
if count != 1:
    raise SystemExit(f'fullscreen state block mismatch: {count}')

button_pattern = re.compile(
    r"\n\s*<AdminTooltip\n\s*title=\{isMaximized \? \"Perkecil Tampilan\" : \"Maksimalkan Tampilan\"\}[\s\S]*?</AdminTooltip>\n",
)
text, count = button_pattern.subn("\n", text, count=1)
if count != 1:
    raise SystemExit(f'fullscreen button block mismatch: {count}')

if 'isMaximized' in text or 'setIsMaximized' in text or 'sop_modal_maximized' in text:
    raise SystemExit('fullscreen state residue remains')

path.write_text(text)

test_path = Path('tests/live-sop-content-integrity.test.ts')
test_text = test_path.read_text()
old_test = """test('non-final Live and Preview pages extend Batang Tubuh to canonical bottom only', () => {\n  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');\n  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');\n  for (const source of [live, preview]) {\n    assert.match(source, /data-sop-page-continuation-fill=\"true\"/);\n    assert.match(source, /isContinuationPage/);\n    assert.match(source, /flex: '1 1 auto'/);\n    assert.match(source, /left: '28%'/);\n    assert.match(source, /borderBottom: '1px solid #000000'/);\n  }\n  assert.match(live, /pageIndex < totalPages - 1/);\n  assert.match(preview, /pageIndex < calculatedTotalPages - 1/);\n});\n"""
new_test = """test('non-final Live and Preview pages extend Batang Tubuh without a stray preview bottom-margin rule', () => {\n  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');\n  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');\n  for (const source of [live, preview]) {\n    assert.match(source, /data-sop-page-continuation-fill=\"true\"/);\n    assert.match(source, /isContinuationPage/);\n    assert.match(source, /flex: '1 1 auto'/);\n    assert.match(source, /left: '28%'/);\n  }\n  assert.match(live, /borderBottom: '1px solid #000000'/);\n  assert.match(preview, /borderBottom: 0/);\n  assert.match(live, /pageIndex < totalPages - 1/);\n  assert.match(preview, /pageIndex < calculatedTotalPages - 1/);\n});\n\ntest('SPO preview uses a compact fixed desktop shell with no fullscreen control and caps Existing PDF width', () => {\n  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');\n  assert.match(preview, /sm:max-w-\[1120px\]/);\n  assert.match(preview, /max-w-\[920px\] mx-auto/);\n  assert.doesNotMatch(preview, /isMaximized|setIsMaximized|sop_modal_maximized|Maximize2|Minimize2/);\n});\n"""
if test_text.count(old_test) != 1:
    raise SystemExit(f'preview continuation regression test target mismatch: {test_text.count(old_test)}')
test_path.write_text(test_text.replace(old_test, new_test, 1))

print('SPO preview compact cleanup applied')
