import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resizeLogicalBoundary, tableOuterEdgeAtPoint } from '../src/utils/tableGeometry';

const editor = fs.readFileSync('src/components/RichTextEditor.tsx', 'utf8');
const geometry = fs.readFileSync('src/utils/tableGeometry.ts', 'utf8');
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

test('outer border hit testing exposes all four table edges', () => {
  const rect = { left: 100, right: 500, top: 200, bottom: 600 };
  assert.equal(tableOuterEdgeAtPoint(rect as DOMRect, 102, 350, 7), 'left');
  assert.equal(tableOuterEdgeAtPoint(rect as DOMRect, 498, 350, 7), 'right');
  assert.equal(tableOuterEdgeAtPoint(rect as DOMRect, 300, 202, 7), 'top');
  assert.equal(tableOuterEdgeAtPoint(rect as DOMRect, 300, 598, 7), 'bottom');
  assert.equal(tableOuterEdgeAtPoint(rect as DOMRect, 300, 350, 7), null);
});

test('production editor uses canonical colgroup, pointer capture and one commit per drag', () => {
  assert.match(editor, /ensureLogicalColumns\(activeTable\)/);
  assert.match(editor, /startColumnResize[\s\S]*resizeLogicalBoundary/);
  assert.match(editor, /setPointerCapture[\s\S]*releasePointerCapture/);
  assert.match(editor, /Pointer moves are live DOM previews only[\s\S]*execCommand\('insertHTML'/);
  assert.match(css, /table-column-boundary[\s\S]*cursor: col-resize/);
  assert.match(css, /table-row-boundary[\s\S]*cursor: row-resize/);
});

test('column guides are derived from rendered cell borders, not only colgroup percentages', () => {
  assert.match(geometry, /renderedLogicalColumnWidths/);
  assert.match(geometry, /leftCell\.getBoundingClientRect\(\)/);
  assert.match(geometry, /cellRect\.right\s*-\s*tableRect\.left/);
  assert.match(geometry, /logicalColumnWidths[\s\S]*renderedLogicalColumnWidths/);
});

test('actual outer table borders are draggable and committed as one document edit', () => {
  assert.match(geometry, /tableOuterEdgeAtPoint/);
  assert.match(geometry, /'left'[\s\S]*'right'[\s\S]*'top'[\s\S]*'bottom'/);
  assert.match(geometry, /pointerdown[\s\S]*pointermove[\s\S]*pointerup/);
  assert.match(geometry, /setPointerCapture[\s\S]*releasePointerCapture/);
  assert.match(geometry, /commitOuterResizeAsNativeEdit[\s\S]*execCommand\?\.\('insertHTML'/);
  assert.match(geometry, /data-outer-geometry-marker|outerGeometryMarker/);
});

test('manual left/right outer geometry persists through preview and PDF normalization', () => {
  assert.match(geometry, /dataset\.tableLeft/);
  assert.match(geometry, /dataset\.tableWidth/);
  assert.match(layout, /applyExplicitTableLeft/);
  assert.match(layout, /dataset\.tableLeft/);
  assert.match(layout, /marginLeft\s*=\s*`\$\{left\}%`/);
  assert.match(renderer, /ALLOW_DATA_ATTR:\s*true/);
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
  assert.match(geometry, /delete table\.dataset\.tableAutofit/);
});
