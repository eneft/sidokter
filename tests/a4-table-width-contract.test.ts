import test from 'node:test';
import assert from 'node:assert/strict';
import { isFullContentWidthTable, normalizeStructuredTables } from '../src/utils/a4Layout';

type FakeStyle = Record<string, string>;

const fakeTable = (editorTable?: string, widths: string[] = []) => {
  const cols = widths.map((width) => ({
    style: { width } as FakeStyle,
    getAttribute: () => null,
    removeAttribute: () => undefined,
  }));
  const attributes = new Map<string, string>();
  const table = {
    dataset: editorTable ? { editorTable } : {},
    style: {} as FakeStyle,
    querySelectorAll: (selector: string) => selector === ':scope > colgroup > col' ? cols : [],
    getAttribute: (name: string) => attributes.get(name) || null,
    removeAttribute: (name: string) => attributes.delete(name),
  };
  return { table, cols };
};

test('manual 2x2 dan 5x5 memakai seluruh inner width Batang Tubuh', () => {
  for (const columns of [2, 5]) {
    const { table, cols } = fakeTable('true', Array(columns).fill(String(100 / columns)));
    normalizeStructuredTables({ querySelectorAll: () => [table] } as unknown as ParentNode);
    assert.equal(table.style.width, '100%');
    assert.equal(table.style.maxWidth, '100%');
    assert.equal(table.style.tableLayout, 'fixed');
    assert.deepEqual(cols.map((col) => col.style.width), Array(columns).fill(`${100 / columns}%`));
  }
});

test('unequal columns retain proportions, spans/content do not affect width normalization', () => {
  const { table, cols } = fakeTable('true', ['8', '41', '25', '26']);
  normalizeStructuredTables({ querySelectorAll: () => [table] } as unknown as ParentNode);
  assert.deepEqual(cols.map((col) => col.style.width), ['8%', '41%', '25%', '26%']);
  assert.equal(isFullContentWidthTable(table as unknown as HTMLTableElement), true);
});

test('narrow imported DOCX table keeps authored width instead of being expanded', () => {
  const { table } = fakeTable(undefined, ['30', '70']);
  table.style.width = '62.5%';
  normalizeStructuredTables({ querySelectorAll: () => [table] } as unknown as ParentNode);
  assert.equal(table.style.width, '62.5%');
  assert.equal(isFullContentWidthTable(table as unknown as HTMLTableElement), false);
});
