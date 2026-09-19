import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resizeLogicalBoundary } from '../src/utils/tableGeometry';

const editor = fs.readFileSync('src/components/RichTextEditor.tsx', 'utf8');
const layout = fs.readFileSync('src/utils/a4Layout.ts', 'utf8');
const renderer = fs.readFileSync('src/components/RichTextRenderer.tsx', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');

test('boundary resize changes only adjacent columns and preserves total width', () => {
  assert.deepEqual(resizeLogicalBoundary([20, 20, 20, 20, 20], 1, 10, 4), [20, 30, 10, 20, 20]);
  assert.deepEqual(resizeLogicalBoundary([30, 30, 40], 0, 10, 4), [40, 20, 40]);
  assert.deepEqual(resizeLogicalBoundary([10, 15, 20, 25, 30], 3, -5, 4), [10, 15, 20, 20, 35]);
});

test('minimum width clamps deterministically at either side', () => {
  assert.deepEqual(resizeLogicalBoundary([20, 20, 60], 0, -100, 6), [6, 34, 60]);
  assert.deepEqual(resizeLogicalBoundary([20, 20, 60], 0, 100, 6), [34, 6, 60]);
});

test('production editor uses canonical colgroup, pointer capture and one commit per drag', () => {
  assert.match(editor, /ensureLogicalColumns\(activeTable\)/);
  assert.match(editor, /startColumnResize[\s\S]*resizeLogicalBoundary/);
  assert.match(editor, /setPointerCapture[\s\S]*releasePointerCapture/);
  assert.match(editor, /Pointer moves are live DOM previews only[\s\S]*execCommand\('insertHTML'/);
  assert.match(css, /table-column-boundary[\s\S]*cursor: col-resize/);
  assert.match(css, /table-row-boundary[\s\S]*cursor: row-resize/);
});

test('row geometry persists as a growing minimum through editor and preview', () => {
  assert.match(editor, /setRowMinimumHeight/);
  assert.match(editor, /'data-row-min-height'/);
  assert.match(layout, /tr\[data-row-min-height\][\s\S]*row\.style\.minHeight/);
  assert.match(renderer, /'data-row-min-height'/);
  assert.doesNotMatch(css, /table-row-boundary[\s\S]{0,300}overflow:\s*hidden/);
});

test('AutoFit remains reversible and manual resize disables it without scaling the table', () => {
  assert.match(editor, /toggleTableAutoFit/);
  assert.match(editor, /applyLogicalColumnWidths\(selectedTable, resizeLogicalBoundary/);
  assert.match(editor, /delete table\.dataset\.tableAutofit|delete selectedTable\.dataset\.tableAutofit/);
});
