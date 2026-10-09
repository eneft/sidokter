import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync('src/components/RichTextEditor.tsx', 'utf8');
const template = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');

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

test('active Live SPO fragment ignores only same-epoch stale echoes and accepts canonical repagination', () => {
  const sync = editor.slice(editor.indexOf('// Sync a genuinely new canonical fragment'), editor.indexOf('// Recalculate overlay'));
  assert.match(editor, /paginationEpoch\?: object/);
  assert.match(editor, /lastPaginationEpochRef/);
  assert.match(sync, /const epochChanged = paginationEpoch !== lastPaginationEpochRef\.current/);
  assert.match(sync, /!epochChanged/);
  assert.match(sync, /incoming === previousIncoming/);
  assert.match(sync, /lastPaginationEpochRef\.current = paginationEpoch/);
  assert.doesNotMatch(editor, /localMutationUntilRef/);
});


test('shared toolbar preserves fragment ownership across callback-ref churn', () => {
  assert.doesNotMatch(template, /activeEditorKeyRef\.current === editorKey[\s\S]{0,120}activeEditorKeyRef\.current = null/);
  assert.match(template, /Preserve the ownership key across/);
});

test('shared native controls capture the active editor selection before focus leaves contentEditable', () => {
  assert.match(editor, /captureSelection:\s*\(\) => boolean/);
  assert.match(editor, /captureSelection:\s*\(\) => \{/);
  assert.match(template, /aria-label="Ukuran huruf"[\s\S]{0,180}onMouseDown=\{\(\) => getActiveEditor\(\)\?\.captureSelection\(\)\}/);
  assert.match(template, /captureSelection\(\)[\s\S]{0,220}aria-label="Sisipkan Tabel"/);
  assert.match(template, /captureSelection\(\)[\s\S]{0,220}aria-label="Sisipkan Gambar"/);
});


test('native image deselection cannot demote a table-cell click back to text context', () => {
  const clear = editor.slice(editor.indexOf('const clearFigureSelection'), editor.indexOf('// Direct native capture listener'));
  const nativePointer = editor.slice(editor.indexOf('const handleNativePointerDown'), editor.indexOf('const handleNativeContextMenu'));
  assert.match(clear, /preserveFormatting = false/);
  assert.match(clear, /if \(!preserveFormatting\)/);
  assert.match(nativePointer, /const tableCell = target\.closest\('td,th'\)/);
  assert.match(nativePointer, /clearFigureSelection\(preserveFormatting\)/);
});

test('shared multi-page history is logical-section scoped and table clicks reclaim toolbar ownership', () => {
  assert.match(editor, /onHistoryCommand\?: \(command: RichTextHistoryCommand\) => boolean/);
  assert.match(editor, /isHistoryCommand && onHistoryCommand\?\.\(command as RichTextHistoryCommand\)/);
  assert.match(editor, /onFocus\?\.\(\);[\s\S]*const activeTable = activeCell\.closest\('table'\)/);
  assert.match(editor, /onFormattingChange\?\.\(next\)/);
  assert.match(template, /const handleSectionHistory = \(section: LiveSectionId, command: 'undo' \| 'redo'\)/);
  assert.match(template, /setDebouncedBlocks\(buildOfficialBlocks\(nextSections\)\)/);
  assert.match(template, /onHistoryCommand=\{\(command\) => handleSectionHistory\(cfg\.id, command\)\}/);
});

test('image selection publishes shared toolbar context synchronously without parent update inside state updater', () => {
  const selectFigure = editor.slice(editor.indexOf('const selectFigureElement'), editor.indexOf('const clearFigureSelection'));
  assert.match(selectFigure, /onFocus\?\.\(\)/);
  assert.match(selectFigure, /const next:\s*RichTextFormattingState/);
  assert.match(selectFigure, /setActiveFormatting\(next\)/);
  assert.match(selectFigure, /onFormattingChange\?\.\(next\)/);
  assert.match(selectFigure, /context:\s*'image'/);
  assert.doesNotMatch(selectFigure, /setActiveFormatting\(current\s*=>[\s\S]*onFormattingChange/);
});

test('typed numbering prefixes stay literal and five explicit list styles are selectable', () => {
  const keydown = editor.slice(editor.indexOf('const handleEditorKeyDown'), editor.indexOf('const handleApplyColor'));
  assert.doesNotMatch(keydown, /insertOrderedList|insertUnorderedList/);
  assert.doesNotMatch(keydown, /numMatch|alphaMatch|romanMatch|bulletMatch/);
  const list = editor.slice(editor.indexOf('const insertCustomList'), editor.indexOf('const applyFontSize'));
  assert.match(list, /if \(!sameKind\)/);
  assert.match(list, /data-sop-list-format/);
  assert.match(list, /data-sop-bullet/);
  for (const marker of ['A', '1', 'a', 'disc', 'square']) {
    assert.ok(editor.includes(`value="${marker}"`), `Missing internal editor marker ${marker}`);
    assert.ok(template.includes(`value: '${marker}'`), `Missing visible Live SPO marker ${marker}`);
  }
  for (const removed of ['a)', '1)', 'bullet']) {
    assert.ok(!template.includes(`value="${removed}"`), `Legacy extra marker ${removed} should not appear`);
  }
});

test('A4 fragment reconciliation preserves focused selection and caret after canonical refresh', () => {
  assert.match(editor, /const ownsSelection = document\.activeElement === editor/);
  assert.match(editor, /textOffsetBefore\(activeSelection\.anchorNode, activeSelection\.anchorOffset\)/);
  assert.match(editor, /textOffsetBefore\(activeSelection\.focusNode, activeSelection\.focusOffset\)/);
  assert.match(editor, /activeSelection\.setBaseAndExtent\(/);
});

test('selected marker CSS persists for every listed SPO surface and square bullets', () => {
  const css = readFileSync('src/index.css', 'utf8');
  assert.match(css, /ol\[data-sop-list-format="a"\] > li::before/);
  assert.match(css, /ol\[data-sop-list-format="A"\] > li::before/);
  assert.match(css, /ol\[data-sop-list-format="1"\] > li::before/);
  assert.match(css, /ol\[data-sop-list-format\] > li/);
  assert.match(css, /ul\[data-sop-bullet="square"\] > li/);
  assert.match(css, /list-style-type: square !important/);
});

test('Live SPO manual overrides still use semantic LI values without the old manual toolbar', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const pagination = readFileSync('src/utils/canonicalA4Pagination.ts', 'utf8');
  const markerUtility = readFileSync('src/utils/editableListMarkers.ts', 'utf8');
  assert.match(editor, /setListItemNumber: \(numberOrLetter: string \| null\) => boolean/);
  assert.match(editor, /item\.setAttribute\('value', String\(number\)\)/);
  assert.match(markerUtility, /export function applyInlineMarker/);
  assert.match(markerUtility, /item\.setAttribute\('data-sop-manual-number'/);
  assert.match(editor, /const handleInlineMarkerClick/);
  assert.match(css, /counter-set: sop-list var\(--sop-manual-number\) !important/);
  assert.match(pagination, /orderedListItemNumbers\(items, explicitStart\)/);
  assert.match(pagination, /const number = continuationNumber \?\? numberAtIndex\(startIndex\)/);
});

test('Live SPO has separate Bullet and Numbering icon split controls with icon-only galleries', () => {
  assert.match(template, /kind: 'bullets', label: 'Bullets', Icon: List, defaultStyle: 'disc'/);
  assert.match(template, /kind: 'numbering', label: 'Numbering', Icon: ListOrdered, defaultStyle: '1'/);
  assert.match(template, /aria-label=\{kind === 'bullets' \? 'Pilih gaya bullet' : 'Pilih gaya numbering'\}/);
  assert.match(template, /aria-expanded=\{openListMenu === kind\}/);
  assert.match(template, /<ChevronDown/);
  assert.match(template, /<Icon \s*\/>/);
  assert.match(template, /<ListMarkerPreview styleType=\{value\} \s*\/>/);
  assert.match(template, /aria-hidden="true" className="flex flex-col gap-\[3px\]"/);
  assert.match(template, /onClick=\{\(\) => handleInsertList\(defaultStyle\)\}/);
  assert.match(template, /onClick=\{\(\) => \{\s*handleInsertList\(value\);\s*setOpenListMenu\(null\);/);
  assert.match(template, /getActiveEditor\(\)\?\.captureSelection\(\)/);
  assert.match(template, /document.addEventListener\('pointerdown', closeOnOutsideClick\)/);
  assert.match(template, /document.addEventListener\('keydown', closeOnEscape\)/);
  for (const marker of ['A', '1', 'a', 'disc', 'square']) {
    assert.ok(template.includes(`value: '${marker}'`), `Missing list style ${marker}`);
  }
  for (const removed of [
    'Daftar ▾', 'Nomor…', 'Nomor item terpilih', 'Kembali otomatis',
    'showManualNumberMenu', 'applyManualListNumber', 'manualNumberInput',
    'showNumberingMenu', 'setShowNumberingMenu',
  ]) {
    assert.ok(!template.includes(removed), `Old toolbar UI remains: ${removed}`);
  }
  const controls = template.indexOf('ref={listMenusRef}');
  const pages = template.indexOf('calculatedPages.map((pageBlocks, pageIndex)');
  assert.ok(controls >= 0 && pages > controls, 'List controls must be shared between all A4 pages');
  assert.match(template, /const focusedFragment = editorRefs\.current\[activeKey\]/);
  assert.match(template, /editorRefs\.current\[editorKey\] = el/);
});
