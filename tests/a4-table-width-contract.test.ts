import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { isFullContentWidthTable, normalizeStructuredTables } from '../src/utils/a4Layout';

const makeTable = (editorTable?: string, widths: string[] = []) => {
  const cols = widths.map((width) => `<col style="width:${width}">`).join('');
  const editorAttr = editorTable ? ` data-editor-table="${editorTable}"` : '';
  const { document } = parseHTML(
    `<html><body><div id="root"><table${editorAttr}><colgroup>${cols}</colgroup><tbody></tbody></table></div></body></html>`
  );
  const root = document.querySelector('#root') as unknown as ParentNode;
  const table = document.querySelector('table') as unknown as HTMLTableElement;
  return { root, table };
};

const columnPercents = (table: HTMLTableElement): number[] =>
  Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'))
    .map((col) => Number.parseFloat(col.style.width));

const assertPercentsClose = (actual: number[], expected: number[]) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) < 0.011, `column ${index} expected ${expected[index]}%, got ${value}%`);
  });
};

test('manual 2x2 dan 5x5 memakai seluruh inner width Batang Tubuh', () => {
  for (const columns of [2, 5]) {
    const { root, table } = makeTable('true', Array(columns).fill(String(100 / columns)));
    normalizeStructuredTables(root);
    assert.equal(table.style.width, '100%');
    assert.equal(table.style.maxWidth, '100%');
    assert.equal(table.style.tableLayout, 'fixed');
    assertPercentsClose(columnPercents(table), Array(columns).fill(100 / columns));
  }
});

test('unequal columns retain proportions, spans/content do not affect width normalization', () => {
  const { root, table } = makeTable('true', ['8', '41', '25', '26']);
  normalizeStructuredTables(root);
  assertPercentsClose(columnPercents(table), [8, 41, 25, 26]);
  assert.equal(isFullContentWidthTable(table), true);
});

test('narrow imported DOCX table keeps authored width instead of being expanded', () => {
  const { root, table } = makeTable(undefined, ['30', '70']);
  table.style.width = '62.5%';
  normalizeStructuredTables(root);
  assert.equal(table.style.width, '62.5%');
  assert.equal(isFullContentWidthTable(table), false);
});
