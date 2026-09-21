from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    assert count == 1, f"{label}: expected exactly one match, found {count}"
    return text.replace(old, new, 1)

editor_path = Path('src/components/RichTextEditor.tsx')
test_path = Path('tests/live-editor-toolbar-regression.test.ts')
editor = editor_path.read_text()
test = test_path.read_text()

old_clear = """  const clearFigureSelection = useCallback(() => {
    setSelectedFigure(null);
    setFigureRect(null);
    setShowWrapTextMenu(false);
    if (editorRef.current) {
      editorRef.current.querySelectorAll('.figure-wrapper, figure').forEach((f) => f.classList.remove('figure-selected'));
    }
    setActiveFormatting(current => ({
    ...current,
    context: 'text',
    inTable: false,
    imageWidth: undefined,
    imageAlign: undefined,
    imageWrap: undefined,
  }));
  }, []);
"""
new_clear = """  const clearFigureSelection = useCallback((preserveFormatting = false) => {
    setSelectedFigure(null);
    setFigureRect(null);
    setShowWrapTextMenu(false);
    if (editorRef.current) {
      editorRef.current.querySelectorAll('.figure-wrapper, figure').forEach((f) => f.classList.remove('figure-selected'));
    }
    // A table-cell click is handled first by the native image capture listener
    // and then by React's table pointer handler. Do not let the later native
    // click event demote the freshly published table context back to text.
    if (!preserveFormatting) {
      setActiveFormatting(current => ({
        ...current,
        context: 'text',
        inTable: false,
        imageWidth: undefined,
        imageAlign: undefined,
        imageWrap: undefined,
      }));
    }
  }, []);
"""
editor = replace_once(editor, old_clear, new_clear, 'clearFigureSelection')

old_native = """      } else if (!target.closest('.figure-wrapper') && !target.closest('figure') && !target.closest('img') && !target.closest('.figure-control-overlay') && !target.closest('.figure-context-menu') && !target.closest('.figure-quick-toolbar')) {
        clearFigureSelection();
        setContextMenu(null);
      }
"""
new_native = """      } else if (!target.closest('.figure-wrapper') && !target.closest('figure') && !target.closest('img') && !target.closest('.figure-control-overlay') && !target.closest('.figure-context-menu') && !target.closest('.figure-quick-toolbar')) {
        const tableCell = target.closest('td,th');
        const preserveFormatting = Boolean(tableCell && editor.contains(tableCell));
        clearFigureSelection(preserveFormatting);
        setContextMenu(null);
      }
"""
editor = replace_once(editor, old_native, new_native, 'native non-image context')

old_sync = "const sync = editor.slice(editor.indexOf('// Sync value from prop'), editor.indexOf('// Recalculate overlay'));"
new_sync = "const sync = editor.slice(editor.indexOf('// Sync a genuinely new canonical fragment'), editor.indexOf('// Recalculate overlay'));"
test = replace_once(test, old_sync, new_sync, 'pagination regression slice')

old_table_capture = "assert.match(template, /aria-label=\"Sisipkan Tabel\"[\\s\\S]{0,220}captureSelection/);"
new_table_capture = "assert.match(template, /captureSelection\\(\\)[\\s\\S]{0,220}aria-label=\"Sisipkan Tabel\"/);"
test = replace_once(test, old_table_capture, new_table_capture, 'table capture regression')

old_image_capture = "assert.match(template, /aria-label=\"Sisipkan Gambar\"[\\s\\S]{0,220}captureSelection/);"
new_image_capture = "assert.match(template, /captureSelection\\(\\)[\\s\\S]{0,220}aria-label=\"Sisipkan Gambar\"/);"
test = replace_once(test, old_image_capture, new_image_capture, 'image capture regression')

anchor = """test('shared multi-page history is logical-section scoped and table clicks reclaim toolbar ownership', () => {
"""
addition = """test('native image deselection cannot demote a table-cell click back to text context', () => {
  const clear = editor.slice(editor.indexOf('const clearFigureSelection'), editor.indexOf('// Direct native capture listener'));
  const nativePointer = editor.slice(editor.indexOf('const handleNativePointerDown'), editor.indexOf('const handleNativeContextMenu'));
  assert.match(clear, /preserveFormatting = false/);
  assert.match(clear, /if \\(!preserveFormatting\\)/);
  assert.match(nativePointer, /const tableCell = target\\.closest\\('td,th'\\)/);
  assert.match(nativePointer, /clearFigureSelection\\(preserveFormatting\\)/);
});

test('shared multi-page history is logical-section scoped and table clicks reclaim toolbar ownership', () => {
"""
assert "native image deselection cannot demote" not in test
test = replace_once(test, anchor, addition, 'new table click regression')

editor_path.write_text(editor)
test_path.write_text(test)
print('Applied table-click context fix with exact-match guards.')
