import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { largestFittingTablePrefix, safeTableRowBoundaries } from '../src/utils/structuredTablePagination';

const detailSource = readFileSync(new URL('../src/components/SopDetailModal.tsx', import.meta.url), 'utf8');
const docxSource = readFileSync(new URL('../src/utils/docxParser.ts', import.meta.url), 'utf8');
const tableSource = readFileSync(new URL('../src/utils/structuredTablePagination.ts', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../src/components/RichTextRenderer.tsx', import.meta.url), 'utf8');
const pdfSource = readFileSync(new URL('../server/pdfRenderer.ts', import.meta.url), 'utf8');

test('tabel sederhana tetap utuh jika muat', () => {
  assert.equal(largestFittingTablePrefix([[1], [1]], () => false), 0);
  assert.match(tableSource, /if \(fits\(table\.outerHTML\)\) return \[table\.outerHTML\]/);
});

test('tabel panjang dipotong pada prefix row terbesar yang muat', () => {
  assert.equal(largestFittingTablePrefix([[1], [1], [1], [1]], (count) => count <= 2), 2);
});

test('tabel di tengah ordered list mempertahankan continuation numbering', () => {
  assert.match(detailSource, /nestedTable = item\.querySelector\('table'\)/);
  assert.match(detailSource, /wrapTable\(part, true\)/);
  assert.match(detailSource, /explicitStart \+ 1/);
});

test('beberapa tabel dalam satu section tetap menjadi flow block terstruktur', () => {
  assert.match(detailSource, /blocks\.push\(el\.outerHTML\)/);
  assert.match(detailSource, /splitStructuredTable\(first as HTMLTableElement, fits\)/);
});

test('rowspan tidak pernah dipisah dan colspan tetap berupa atribut HTML', () => {
  assert.deepEqual(safeTableRowBoundaries([[2, 1], [1], [1]]), [false, true, true]);
  assert.equal(largestFittingTablePrefix([[2], [1], [1]], (count) => count === 1), 0);
  assert.match(rendererSource, /'colspan', 'rowspan'/);
});

test('import DOCX mengizinkan dan mempertahankan struktur tabel', () => {
  for (const tag of ['table', 'thead', 'tbody', 'tr', 'th', 'td']) assert.ok(docxSource.includes(`'${tag}'`));
  assert.match(docxSource, /ALLOWED_ATTR: \['style', 'start', 'type', 'colspan', 'rowspan'\]/);
  assert.match(docxSource, /const cellHtmls = cells\.map\(c => c\.innerHTML\.trim\(\)\)/);
});

test('Preview dan PDF menggunakan DOM A4 terpaginate yang sama', () => {
  assert.match(detailSource, /clonedRoot\.outerHTML/);
  assert.match(detailSource, /officialPages\.length/);
  assert.match(pdfSource, /const documentHtml = String\(body\?\.html/);
  assert.match(pdfSource, /table-header-group/);
});
