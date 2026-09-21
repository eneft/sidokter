from pathlib import Path

editor_path = Path('src/components/RichTextEditor.tsx')
template_path = Path('src/components/SopLiveTemplate.tsx')
test_path = Path('tests/live-editor-toolbar-regression.test.ts')
editor = editor_path.read_text()
template = template_path.read_text()
tests = test_path.read_text()

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

editor = replace_once(
    editor,
    "  deleteImage: () => void;\n  focus: () => void;\n",
    "  deleteImage: () => void;\n  /** Capture the current editor selection before an external/native toolbar control takes focus. */\n  captureSelection: () => boolean;\n  focus: () => void;\n",
    'handle captureSelection interface',
)

editor = replace_once(
    editor,
    "    deleteImage: deleteSelectedFigure,\n    focus: () => editorRef.current?.focus(),\n",
    "    deleteImage: deleteSelectedFigure,\n    captureSelection: () => {\n      const editor = editorRef.current;\n      const selection = window.getSelection();\n      if (editor && selection?.rangeCount && selection.anchorNode && editor.contains(selection.anchorNode)) {\n        savedRangeRef.current = selection.getRangeAt(0).cloneRange();\n        return true;\n      }\n      const saved = savedRangeRef.current;\n      return Boolean(editor && saved && editor.contains(saved.commonAncestorContainer));\n    },\n    focus: () => editorRef.current?.focus(),\n",
    'imperative captureSelection implementation',
)

template = replace_once(
    template,
    """                                  if (activeEditorKeyRef.current === editorKey) {
                                    activeEditorKeyRef.current = null;
                                    activeEditorRef.current = editorRefs.current[cfg.id] || null;
                                  }
""",
    """                                  if (activeEditorKeyRef.current === editorKey) {
                                    // Callback refs are recreated on every parent toolbar render,
                                    // so React transiently calls the previous ref with null before
                                    // attaching the new handle. Preserve the ownership key across
                                    // that detach/attach pair; the fallback handle is temporary.
                                    activeEditorRef.current = editorRefs.current[cfg.id] || null;
                                  }
""",
    'preserve active editor key across callback ref churn',
)

template = replace_once(
    template,
    """            <select
              aria-label=\"Ukuran huruf\"
              value={activeFormatting.fontSize || '12pt'}
              onChange={(e) => getActiveEditor()?.applyFontSize(e.target.value as LiveSopFontSize)}
""",
    """            <select
              aria-label=\"Ukuran huruf\"
              value={activeFormatting.fontSize || '12pt'}
              onMouseDown={() => getActiveEditor()?.captureSelection()}
              onChange={(e) => getActiveEditor()?.applyFontSize(e.target.value as LiveSopFontSize)}
""",
    'shared font selection capture',
)

template = replace_once(
    template,
    """              <button type=\"button\" onMouseDown={(e) => e.preventDefault()} onClick={() => { if (tableFileInputRef.current) { tableFileInputRef.current.value = ''; tableFileInputRef.current.click(); } }} className=\"toolbar-icon\" title=\"Sisipkan Gambar\" aria-label=\"Sisipkan Gambar\"><ImagePlus /></button>
""",
    """              <button type=\"button\" onMouseDown={(e) => { e.preventDefault(); getActiveEditor()?.captureSelection(); }} onClick={() => { if (tableFileInputRef.current) { tableFileInputRef.current.value = ''; tableFileInputRef.current.click(); } }} className=\"toolbar-icon\" title=\"Sisipkan Gambar\" aria-label=\"Sisipkan Gambar\"><ImagePlus /></button>
""",
    'shared image insertion capture',
)

template = replace_once(
    template,
    """                <button type=\"button\" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowInsertMenu((v) => !v)} className=\"toolbar-icon\" title=\"Sisipkan Tabel\" aria-label=\"Sisipkan Tabel\" aria-expanded={showInsertMenu}><Table2 /></button>
""",
    """                <button type=\"button\" onMouseDown={(e) => { e.preventDefault(); getActiveEditor()?.captureSelection(); }} onClick={() => setShowInsertMenu((v) => !v)} className=\"toolbar-icon\" title=\"Sisipkan Tabel\" aria-label=\"Sisipkan Tabel\" aria-expanded={showInsertMenu}><Table2 /></button>
""",
    'shared table insertion capture',
)

marker = 'shared toolbar preserves fragment ownership across callback-ref churn'
if marker in tests:
    raise SystemExit('candidate2 regression tests already present')
tests += r'''

test('shared toolbar preserves fragment ownership across callback-ref churn', () => {
  assert.doesNotMatch(template, /activeEditorKeyRef\.current === editorKey[\s\S]{0,120}activeEditorKeyRef\.current = null/);
  assert.match(template, /Preserve the ownership key across/);
});

test('shared native controls capture the active editor selection before focus leaves contentEditable', () => {
  assert.match(editor, /captureSelection:\s*\(\) => boolean/);
  assert.match(editor, /captureSelection:\s*\(\) => \{/);
  assert.match(template, /aria-label="Ukuran huruf"[\s\S]{0,180}onMouseDown=\{\(\) => getActiveEditor\(\)\?\.captureSelection\(\)\}/);
  assert.match(template, /aria-label="Sisipkan Tabel"[\s\S]{0,220}captureSelection/);
  assert.match(template, /aria-label="Sisipkan Gambar"[\s\S]{0,220}captureSelection/);
});
'''

editor_path.write_text(editor)
template_path.write_text(template)
test_path.write_text(tests)
