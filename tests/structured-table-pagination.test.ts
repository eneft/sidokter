import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { largestFittingTablePrefix, safeTableRowBoundaries } from '../src/utils/structuredTablePagination';

const detailSource = readFileSync(new URL('../src/components/SopDetailModal.tsx', import.meta.url), 'utf8');
const docxSource = readFileSync(new URL('../src/utils/docxParser.ts', import.meta.url), 'utf8');
const tableSource = readFileSync(new URL('../src/utils/structuredTablePagination.ts', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../src/components/RichTextRenderer.tsx', import.meta.url), 'utf8');
const pdfSource = readFileSync(new URL('../server/pdfRenderer.ts', import.meta.url), 'utf8');
const geometrySource = readFileSync(new URL('../src/utils/docxTableGeometry.ts', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../src/components/RichTextEditor.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

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
  for (const tag of ['table', 'colgroup', 'col', 'thead', 'tbody', 'tr', 'th', 'td']) assert.ok(docxSource.includes(`'${tag}'`));
  assert.match(docxSource, /preserveDocxTableGeometry\(arrayBuffer/);
  assert.match(docxSource, /const cellHtmls = cells\.map\(c => c\.innerHTML\.trim\(\)\)/);
});

test('DOCX geometry menjadi satu representasi tabel terstruktur untuk Live SPO', () => {
  assert.match(geometrySource, /getElementsByTagNameNS\(WORD_NS, 'tbl'\)/);
  assert.match(geometrySource, /direct\(properties!, 'tblW'\)/);
  assert.match(geometrySource, /direct\(properties!, 'tblInd'\)/);
  assert.match(geometrySource, /localName === 'gridCol'/);
  assert.match(geometrySource, /direct\(cellProperties!, 'tcW'\)/);
  assert.match(geometrySource, /gridWidth \/ gridTotal \* 100/);
  assert.match(geometrySource, /vertical-align/);
  assert.match(geometrySource, /paragraphAlignment === 'both' \? 'justify'/);
  assert.match(geometrySource, /tblBorders/);
  assert.match(geometrySource, /tblCellMar/);
  assert.match(editorSource, /'table', 'colgroup', 'col', 'thead'/);
});

test('fixture PROSEDUR memuat width, indent, unequal grid, rowspan, dan colspan', () => {
  const xml = readFileSync(new URL('./fixtures/prosedur-unequal-table.xml', import.meta.url), 'utf8');
  assert.match(xml, /<w:t>PROSEDUR<\/w:t>/);
  assert.match(xml, /<w:tblW w:w="6000" w:type="dxa"\/>/);
  assert.match(xml, /<w:tblInd w:w="360" w:type="dxa"\/>/);
  const nestedGridXml = xml.match(/<w:tblGrid><w:gridCol w:w="576"\/>[\s\S]*?<\/w:tblGrid>/)?.[0] || '';
  const nestedGrid = [...nestedGridXml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) => Number(match[1]));
  assert.deepEqual(nestedGrid, [576, 2952, 1800, 1872]);
  assert.deepEqual(nestedGrid.map((width) => width / 7200 * 100), [8, 41, 25, 26]);
  assert.match(xml, /<w:vMerge w:val="restart"\/>/);
  assert.match(xml, /<w:gridSpan w:val="2"\/>/);
});

test('Live SPO dan A4 tidak memaksa tabel isi DOCX menjadi full-width', () => {
  assert.doesNotMatch(cssSource, /\.rich-text-editor-content table \{\s*width: 100% !important/);
  assert.doesNotMatch(cssSource, /\.rich-text-document-content table,[\s\S]{0,160}width: 100% !important/);
  assert.match(cssSource, /\.rich-text-editor-content table \{\s*width: auto/);
});

test('Preview dan PDF menggunakan DOM A4 terpaginate yang sama', () => {
  assert.match(detailSource, /clonedRoot\.outerHTML/);
  assert.match(detailSource, /officialPages\.length/);
  assert.match(pdfSource, /const documentHtml = String\(body\?\.html/);
  assert.match(pdfSource, /table-header-group/);
});

test('fixture round-trip terstruktur mencakup kasus produksi tanpa binary DOCX', () => {
  const html = readFileSync(new URL('./fixtures/structured-spo-content.html', import.meta.url), 'utf8');
  assert.equal((html.match(/<table\b/g) || []).length, 2);
  assert.match(html, /<ol>[\s\S]*<li>[\s\S]*<table/);
  assert.match(html, /<ol start="5">/);
  assert.match(html, /rowspan="2"/);
  assert.match(html, /colspan="2"/);
  assert.match(html, /font-size:10pt/);
  assert.match(html, /font-size:12pt/);
  assert.match(html, /<strong>1<\/strong>/);
  assert.match(html, /text-align:center/);
  assert.match(html, /<tfoot>/);
  assert.ok((html.match(/<tbody>/g) || []).length >= 2);
});

test('section extraction tidak memasukkan nested table cells sebagai sibling outer cells', () => {
  assert.match(docxSource, /Array\.from\(table\.rows\)\.filter/);
  assert.match(docxSource, /Array\.from\(tr\.cells\)\.filter/);
  assert.doesNotMatch(docxSource, /tr\.querySelectorAll\('td, th'\)/);
});

test('toolbar mempertahankan selection dan menyediakan formatting context-aware', () => {
  for (const command of [
    'undo', 'redo', 'bold', 'italic', 'underline', 'justifyLeft', 'justifyCenter',
    'justifyRight', 'justifyFull', 'outdent', 'indent', 'insertUnorderedList', 'removeFormat'
  ]) assert.ok(editorSource.includes(`executeCommand('${command}')`), command);
  assert.match(editorSource, /restoreSavedSelection\(\)/);
  assert.match(editorSource, /document\.execCommand\('fontSize', false, '7'\)/);
  assert.match(editorSource, /font\.replaceWith\(span\)/);
  assert.match(editorSource, /activeFormatting\.fontSize/);
  assert.match(editorSource, /range\.intersectsNode\(textNode\)/);
  assert.match(editorSource, /processAndInsertImageFiles\(files\)/);
});

test('font source DOCX dan output A4/PDF tidak dipaksa kembali ke 12pt', () => {
  assert.match(geometrySource, /explicitRunFontSize/);
  assert.match(geometrySource, /wrapTextInterval/);
  assert.doesNotMatch(cssSource, /\.sop-batang-tubuh-content \*,\s*#printable[\s\S]{0,180}font-size: 12pt !important/);
  assert.match(rendererSource, /'style', 'class', 'colspan', 'rowspan'/);
});
