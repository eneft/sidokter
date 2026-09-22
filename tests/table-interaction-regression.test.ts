import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';
import { logicalColumnWidths, restoreTableSnapshot, tableOuterEdgeAtPoint } from '../src/utils/tableGeometry';

const editorSource = fs.readFileSync('src/components/RichTextEditor.tsx', 'utf8');

const makeTwoColumnTable = () => {
  const { document } = parseHTML('<html><body><table><tbody><tr><td>A</td><td>B</td></tr></tbody></table></body></html>');
  const table = document.querySelector('table') as unknown as HTMLTableElement;
  const left = table.rows[0].cells[0] as any;
  const right = table.rows[0].cells[1] as any;
  (table as any).getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20 });
  left.getBoundingClientRect = () => ({ left: 0, right: 40, top: 0, bottom: 20, width: 40, height: 20 });
  right.getBoundingClientRect = () => ({ left: 40, right: 100, top: 0, bottom: 20, width: 60, height: 20 });
  return table;
};

test('render-only logical width measurement never creates or rewrites a colgroup', () => {
  const table = makeTwoColumnTable();
  assert.equal(table.querySelector('colgroup'), null);
  assert.deepEqual(logicalColumnWidths(table, false), [40, 60]);
  assert.equal(table.querySelector('colgroup'), null, 'measurement must be pure');
});

test('outer table resize hit testing is horizontal-only; row height owns vertical boundaries', () => {
  const rect = { left: 100, right: 500, top: 200, bottom: 600 } as DOMRect;
  assert.equal(tableOuterEdgeAtPoint(rect, 102, 350, 7), 'left');
  assert.equal(tableOuterEdgeAtPoint(rect, 498, 350, 7), 'right');
  assert.equal(tableOuterEdgeAtPoint(rect, 300, 202, 7), null);
  assert.equal(tableOuterEdgeAtPoint(rect, 300, 598, 7), null);
});

test('cancel restore keeps the same table DOM node while restoring saved geometry and content', () => {
  const { document } = parseHTML('<html><body><table data-table-width="60" style="margin-left:10%"><tbody><tr><td>A</td></tr></tbody></table></body></html>');
  const table = document.querySelector('table') as unknown as HTMLTableElement;
  const identity = table;
  const snapshot = table.outerHTML;
  table.dataset.tableWidth = '90';
  table.style.marginLeft = '0%';
  table.rows[0].cells[0].textContent = 'CHANGED';
  assert.equal(restoreTableSnapshot(table, snapshot), true);
  assert.equal(table, identity);
  assert.equal(table.dataset.tableWidth, '60');
  assert.equal(table.style.marginLeft, '10%');
  assert.equal(table.rows[0].cells[0].textContent, 'A');
});

test('editor table click enables border interaction without normalizing columns', () => {
  const pointerDown = editorSource.slice(
    editorSource.indexOf('const handleEditorPointerDown'),
    editorSource.indexOf('const handleEditorPointerUp'),
  );
  assert.match(pointerDown, /enableTableBorderResize\(activeTable\)/);
  assert.doesNotMatch(pointerDown, /ensureLogicalColumns\(activeTable\)/);
});

test('editor render path uses pure logical-width measurement', () => {
  assert.match(editorSource, /logicalColumnWidths\(selectedTable, false\)/);
});

test('grid pointer cancellation has a rollback path distinct from commit', () => {
  assert.match(editorSource, /const cancelGridResize[\s\S]*restoreTableSnapshot/);
  const cancelBindings = editorSource.match(/onPointerCancel=\{cancelGridResize\}/g) || [];
  assert.equal(cancelBindings.length, 2);
});

test('grid resize native transaction has an explicit fallback when execCommand fails', () => {
  const finish = editorSource.slice(
    editorSource.indexOf('const finishGridResize'),
    editorSource.indexOf('const cancelGridResize'),
  );
  assert.match(finish, /let committed = false/);
  assert.match(finish, /Boolean\(document\.execCommand\('insertHTML'/);
  assert.match(finish, /if \(!committed\) original\.outerHTML = finalHtml/);
  assert.match(finish, /enableTableBorderResize\(next\)/);
});

test('ambiguous drag-align and duplicate corner width controls are removed from table overlay', () => {
  const overlay = editorSource.slice(
    editorSource.indexOf('Persistent table selection chrome'),
    editorSource.indexOf('DRAG-AND-DROP FILE OVERLAY'),
  );
  assert.doesNotMatch(overlay, /table-move-handle/);
  assert.doesNotMatch(overlay, /table-resize-handle/);
  assert.doesNotMatch(editorSource, /const handleTableMoveStart/);
  assert.doesNotMatch(editorSource, /const handleTableResizeStart/);
});

test('AutoFit exits explicit left/width geometry before switching to content sizing', () => {
  const autoFit = editorSource.slice(
    editorSource.indexOf('const toggleTableAutoFit'),
    editorSource.indexOf('const finishGridResize'),
  );
  assert.match(autoFit, /delete table\.dataset\.tableWidth/);
  assert.match(autoFit, /applyTableAlignment\(table, currentAlign\)/);
  assert.match(autoFit, /table\.style\.tableLayout = 'auto'/);
  assert.match(autoFit, /ensureLogicalColumns\(table\)/);
});
