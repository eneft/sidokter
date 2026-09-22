import test from 'node:test';
import assert from 'node:assert/strict';
import { canMergeCell, mutateTable, tableGrid } from '../src/utils/editorTableCommands';
import { makeTestTable } from './table-dom-test-utils';

const makeTable = (markup: string) => {
  const { document, table } = makeTestTable(markup);
  assert.ok(table, 'fixture must contain a table');
  return { document, table };
};

const widths = (table: HTMLTableElement) =>
  Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'))
    .map((col) => Number.parseFloat(col.style.width));

const assertWidths = (actual: number[], expected: number[]) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) < 0.02, `column ${index}: expected ${expected[index]}, got ${value}`);
  });
  assert.ok(Math.abs(actual.reduce((sum, value) => sum + value, 0) - 100) < 0.03);
};

test('merge-right preserves image-only and figure-only cell content', () => {
  const { table } = makeTable(`
    <table><tbody><tr>
      <td>Target</td>
      <td><figure data-width="40%"><img src="data:image/png;base64,AA==" alt="diagram"></figure></td>
    </tr></tbody></table>`);
  const target = table.rows[0].cells[0];
  assert.equal(canMergeCell(target, 'right'), true);
  mutateTable(target, 'merge-right');
  assert.equal(table.rows[0].cells.length, 1);
  assert.equal(target.colSpan, 2);
  assert.ok(target.querySelector('figure'));
  assert.ok(target.querySelector('img[alt="diagram"]'));
});

test('merge into an empty placeholder removes placeholder instead of losing rich content', () => {
  const { table } = makeTable(`
    <table><tbody><tr><td><br></td><td><strong>Isi</strong><img src="data:image/png;base64,AA=="></td></tr></tbody></table>`);
  const target = table.rows[0].cells[0];
  mutateTable(target, 'merge-right');
  assert.equal(target.querySelectorAll('br').length, 0);
  assert.equal(target.querySelector('strong')?.textContent, 'Isi');
  assert.ok(target.querySelector('img'));
});

test('add-column splits only the adjacent authored column width and preserves all other proportions', () => {
  const { table } = makeTable(`
    <table><colgroup>
      <col style="width:10%"><col style="width:20%"><col style="width:30%"><col style="width:40%">
    </colgroup><tbody><tr><td>A</td><td>B</td><td>C</td><td>D</td></tr></tbody></table>`);
  mutateTable(table.rows[0].cells[1], 'add-column');
  assert.equal(tableGrid(table)[0].length, 5);
  assertWidths(widths(table), [10, 10, 10, 30, 40]);
});

test('delete-column transfers deleted authored width to a neighbour instead of equalizing every column', () => {
  const { table } = makeTable(`
    <table><colgroup>
      <col style="width:10%"><col style="width:20%"><col style="width:30%"><col style="width:40%">
    </colgroup><tbody><tr><td>A</td><td>B</td><td>C</td><td>D</td></tr></tbody></table>`);
  mutateTable(table.rows[0].cells[1], 'delete-column');
  assert.equal(tableGrid(table)[0].length, 3);
  assertWidths(widths(table), [30, 30, 40]);
});

test('adding a row inside an existing rowspan extends the spanning cell exactly once', () => {
  const { table } = makeTable(`
    <table><tbody>
      <tr><td rowspan="2">A</td><td>B</td></tr>
      <tr><td>C</td></tr>
    </tbody></table>`);
  const spanning = table.rows[0].cells[0];
  mutateTable(table.rows[0].cells[1], 'add-row');
  assert.equal(spanning.rowSpan, 3);
  assert.equal(table.rows.length, 3);
  assert.equal(table.rows[1].cells.length, 1, 'new row must not create a cell under the rowspan');
  assert.equal(tableGrid(table)[1].length, 2);
});

test('merge commands reject incompatible rowspan/colspan geometry', () => {
  const { table } = makeTable(`
    <table><tbody>
      <tr><td rowspan="2">A</td><td>B</td></tr>
      <tr><td>C</td></tr>
    </tbody></table>`);
  const spanning = table.rows[0].cells[0];
  assert.equal(canMergeCell(spanning, 'right'), false);
  const before = table.outerHTML;
  mutateTable(spanning, 'merge-right');
  assert.equal(table.outerHTML, before);
});

test('split-cell recreates the complete logical grid without duplicating original content', () => {
  const { table } = makeTable(`
    <table><tbody>
      <tr><td rowspan="2" colspan="2"><strong>KEEP</strong></td></tr>
      <tr></tr>
    </tbody></table>`);
  const merged = table.rows[0].cells[0];
  mutateTable(merged, 'split-cell');
  const grid = tableGrid(table);
  assert.equal(grid.length, 2);
  assert.equal(grid[0].length, 2);
  assert.equal(grid[1].length, 2);
  assert.equal(table.querySelectorAll('strong').length, 1);
  assert.equal(table.textContent?.trim(), 'KEEP');
});
