import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync('src/components/RichTextEditor.tsx', 'utf8');

test('image selection invalidates stale text range and pointer-up cannot demote image context', () => {
  const selectFigure = editor.slice(editor.indexOf('const selectFigureElement'), editor.indexOf('const clearFigureSelection'));
  assert.match(selectFigure, /savedRangeRef\.current = null/);
  assert.match(selectFigure, /removeAllRanges\(\)/);

  const pointerUp = editor.slice(editor.indexOf('const handleEditorPointerUp'), editor.indexOf('useEffect\(\(\) => \{\n    const handleSelectionChange'));
  assert.match(pointerUp, /closest\(['"]\.figure-wrapper, figure['"]\)/);
  assert.match(pointerUp, /return;/);
});

test('text commands never reuse an image-era stale range', () => {
  const execute = editor.slice(editor.indexOf('const executeCommand'), editor.indexOf('const insertCustomList'));
  assert.match(execute, /selectedFigure/);
  assert.match(execute, /restoreSavedSelection\(\)/);
  assert.match(execute, /return;/);

  const fontSize = editor.slice(editor.indexOf('const applyFontSize'), editor.indexOf('const handleEditorKeyDown'));
  assert.match(fontSize, /selectedFigure/);
  assert.match(fontSize, /restoreSavedSelection\(\)/);
});

test('table insertion observes current image state and immediately selects the inserted table', () => {
  const insertTable = editor.slice(editor.indexOf('const insertTable = useCallback'), editor.indexOf('const alignTable'));
  assert.match(insertTable, /selectedFigure/);
  assert.match(insertTable, /\[[^\]]*selectedFigure[^\]]*\]/);
  assert.match(insertTable, /setSelectedTable\(inserted\)/);
  assert.match(insertTable, /updateTableRect\(inserted\)/);
});

test('table structural commands rebind selectedTable to the replacement DOM table', () => {
  const executeTable = editor.slice(editor.indexOf('const executeTableCommand'), editor.indexOf('const toggleTableAutoFit'));
  assert.match(executeTable, /if \(!restoreSavedSelection\(\)\) return/);
  assert.match(executeTable, /const insertedTable = insertedCell\?\.closest\('table'\)/);
  assert.match(executeTable, /setSelectedTable\(insertedTable\)/);
  assert.match(executeTable, /updateTableRect\(insertedTable\)/);
});

test('table geometry resize restores caret to the same logical cell after native insertHTML replacement', () => {
  const finish = editor.slice(editor.indexOf('const finishGridResize'), editor.indexOf('const startColumnResize'));
  assert.match(finish, /data-table-geometry-caret/);
  assert.match(finish, /placeCaretInCell/);
  assert.match(finish, /querySelector<HTMLTableCellElement>/);
});

test('image width and wrap commands publish their new state back to the shared toolbar', () => {
  const wrap = editor.slice(editor.indexOf('const applyWordWrapMode'), editor.indexOf('const applyFigurePercentWidth'));
  assert.match(wrap, /imageWrap:\s*mode/);
  assert.match(wrap, /imageAlign:\s*appliedAlign/);
  assert.match(wrap, /context:\s*'image'/);

  const width = editor.slice(editor.indexOf('const applyFigurePercentWidth'), editor.indexOf('const applyFigureRotation'));
  assert.match(width, /imageWidth:\s*clamped/);
  assert.match(width, /context:\s*'image'/);
});

test('clearing or deleting an image clears image formatting context', () => {
  const clear = editor.slice(editor.indexOf('const clearFigureSelection'), editor.indexOf('// Direct native capture listener'));
  assert.match(clear, /context:\s*'text'/);
  assert.match(clear, /imageWidth:\s*undefined/);
  assert.match(clear, /imageWrap:\s*undefined/);

  const remove = editor.slice(editor.indexOf('const deleteSelectedFigure'), editor.indexOf('// Text formatting commands'));
  assert.match(remove, /context:\s*'text'/);
  assert.match(remove, /imageWidth:\s*undefined/);
  assert.match(remove, /imageWrap:\s*undefined/);
});

test('active Live SPO fragment ignores stale paginated prop echoes during local mutation', () => {
  const sync = editor.slice(editor.indexOf('// Sync value from prop'), editor.indexOf('// Recalculate overlay'));
  const input = editor.slice(editor.indexOf('const handleInput'), editor.indexOf('// Helper to reliably select'));
  assert.match(sync, /Date\.now\(\) < localMutationUntilRef\.current/);
  assert.match(sync, /ownsInteraction/);
  assert.match(sync, /return;/);
  assert.match(input, /localMutationUntilRef\.current = Date\.now\(\) \+ 1500/);
});


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


test('image selection publishes shared toolbar context synchronously after claiming ownership', () => {
  const selectFigure = editor.slice(editor.indexOf('const selectFigureElement'), editor.indexOf('const clearFigureSelection'));
  assert.match(selectFigure, /onFocus\?\.\(\)/);
  assert.match(selectFigure, /onFormattingChange\?\.\(next\)/);
  assert.match(selectFigure, /context:\s*'image'/);
});
