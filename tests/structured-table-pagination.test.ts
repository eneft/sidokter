import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { largestFittingTablePrefix, safeTableRowBoundaries } from '../src/utils/structuredTablePagination';
import { SopLiveTemplate } from '../src/components/SopLiveTemplate';

const detailSource = readFileSync(new URL('../src/components/SopDetailModal.tsx', import.meta.url), 'utf8');
const docxSource = readFileSync(new URL('../src/utils/docxParser.ts', import.meta.url), 'utf8');
const tableSource = readFileSync(new URL('../src/utils/structuredTablePagination.ts', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../src/components/RichTextRenderer.tsx', import.meta.url), 'utf8');
const pdfSource = readFileSync(new URL('../server/pdfRenderer.ts', import.meta.url), 'utf8');
const geometrySource = readFileSync(new URL('../src/utils/docxTableGeometry.ts', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../src/components/RichTextEditor.tsx', import.meta.url), 'utf8');
const editorCommandsSource = readFileSync(new URL('../src/utils/editorTableCommands.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const a4Source = readFileSync(new URL('../src/utils/a4Layout.ts', import.meta.url), 'utf8');
const canonicalPaginationSource = readFileSync(new URL('../src/utils/canonicalA4Pagination.ts', import.meta.url), 'utf8');

test('tabel sederhana tetap utuh jika muat', () => {
  assert.equal(largestFittingTablePrefix([[1], [1]], () => false), 0);
  assert.match(tableSource, /if \(fits\(table\.outerHTML\)\) return \[table\.outerHTML\]/);
});

test('tabel panjang dipotong pada prefix row terbesar yang muat', () => {
  assert.equal(largestFittingTablePrefix([[1], [1], [1], [1]], (count) => count <= 2), 2);
});

test('tabel di tengah ordered list mempertahankan continuation numbering', () => {
  assert.match(canonicalPaginationSource, /nestedTable = item\.querySelector\('table'\)/);
  assert.match(canonicalPaginationSource, /wrapTable\(part, true\)/);
  assert.match(canonicalPaginationSource, /explicitStart \+ 1/);
});

test('beberapa tabel dalam satu section tetap menjadi flow block terstruktur', () => {
  assert.match(detailSource, /blocks\.push\(el\.outerHTML\)/);
  assert.match(canonicalPaginationSource, /splitStructuredTableV2\(/);
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
  assert.match(html, /font-size:8pt/);
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

test('pemilihan gambar mengaktifkan editor pemilik sebelum menerbitkan image context', () => {
  const selectionStart = editorSource.indexOf('const selectFigureElement');
  const ownerActivation = editorSource.indexOf('onFocus?.();', selectionStart);
  const contextPublication = editorSource.indexOf('setSelectedFigure(figure)', selectionStart);
  assert.ok(selectionStart >= 0);
  assert.ok(ownerActivation > selectionStart);
  assert.ok(contextPublication > ownerActivation);
});

test('klik langsung pada sel menerbitkan table context tanpa bergantung pada selection browser', () => {
  assert.match(editorSource, /onPointerDown=\{handleEditorPointerDown\}/);
  assert.match(editorSource, /target\?\.closest\('td,th'\)/);
  assert.match(editorSource, /context: 'table',[\s\S]{0,80}inTable: true/);
  assert.match(editorSource, /setSelectedTable\(activeTable\)/);
  assert.match(editorSource, /className="table-selection-overlay/);
});

test('toolbar production Live A4 desktop merender selector canonical 12/10/8 pt', () => {
  const noop = () => undefined;
  const html = renderToStaticMarkup(React.createElement(SopLiveTemplate, {
    title: 'SPO Uji', onTitleChange: noop, sopNumber: '001', version: '00',
    effectiveDate: '2026-01-01', onEffectiveDateChange: noop, approverName: 'Direktur',
    pengertian: '<p>Pengertian</p>', onPengertianChange: noop,
    tujuan: '<p>Tujuan</p>', onTujuanChange: noop,
    kebijakan: '<p>Kebijakan</p>', onKebijakanChange: noop,
    prosedur: '<table><tbody><tr><td><span style="font-size:10pt">Isi</span></td></tr></tbody></table>', onProsedurChange: noop,
    alur: '', onAlurChange: noop, unitTerkait: '<p>Unit</p>', onUnitTerkaitChange: noop,
  }));
  assert.match(html, /aria-label="Ukuran huruf"/);
  assert.match(html, /<option value="10pt">10 pt<\/option>/);
  assert.match(html, /<option value="12pt"(?: selected="")?>12 pt<\/option>/);
  assert.match(html, /<option value="8pt">8 pt<\/option>/);
  assert.ok(html.indexOf('12 pt</option>') < html.indexOf('10 pt</option>'));
  assert.ok(html.indexOf('10 pt</option>') < html.indexOf('8 pt</option>'));
  assert.doesNotMatch(html, /Campur/);
  assert.doesNotMatch(html, /Warna Teks|Insert ▾/);
  assert.match(html, /title="Sisipkan Gambar"/);
  assert.match(html, /title="Sisipkan Tabel"/);
  // RichTextEditor hydrates value.innerHTML in an effect; server rendering is
  // intentionally used here only to prove the production desktop toolbar JSX.
});

test('toolbar desktop memakai command bridge editor aktif, bukan execCommand kedua', () => {
  const liveTemplateSource = readFileSync(new URL('../src/components/SopLiveTemplate.tsx', import.meta.url), 'utf8');
  assert.match(liveTemplateSource, /getActiveEditor\(\)\?\.executeCommand/);
  assert.match(liveTemplateSource, /getActiveEditor\(\)\?\.insertCustomList/);
  assert.match(liveTemplateSource, /getActiveEditor\(\)\?\.applyFontSize/);
  assert.match(liveTemplateSource, /getActiveEditor\(\)\?\.insertImageFiles/);
  assert.doesNotMatch(liveTemplateSource, /document\.execCommand/);
});

test('font source DOCX dan output A4/PDF tidak dipaksa kembali ke 12pt', () => {
  assert.match(geometrySource, /explicitRunFontSize/);
  assert.match(geometrySource, /wrapTextInterval/);
  assert.doesNotMatch(cssSource, /\.sop-batang-tubuh-content \*,\s*#printable[\s\S]{0,180}font-size: 12pt !important/);
  assert.match(rendererSource, /'style', 'class', 'colspan', 'rowspan'/);
});

test('8pt bertahan apply, save, reload, LiveSPOEditor, Preview, dan penyerahan PDF', () => {
  const appliedInTable = '<table><tbody><tr><td><span style="font-size: 8pt;">Teks kecil</span></td></tr></tbody></table>';
  const saved = JSON.stringify({ prosedur: appliedInTable });
  const reloaded = JSON.parse(saved).prosedur as string;

  assert.match(editorSource, /export type LiveSopFontSize = '8pt' \| '10pt' \| '12pt'/);
  assert.match(editorSource, /applyFontSize: \(fontSize: LiveSopFontSize\)/);
  assert.match(editorSource, /\(points\[0\] === 8 \|\| points\[0\] === 10 \|\| points\[0\] === 12\)/);
  assert.match(reloaded, /font-size: 8pt/);

  // Preview passes the reloaded HTML through the structured renderer, whose
  // sanitizer explicitly retains inline style. PDF then embeds that Preview
  // document HTML without rewriting it.
  assert.match(rendererSource, /const raw = normalizeStructuredHtml\(content\.trim\(\)\)/);
  assert.match(rendererSource, /ALLOWED_ATTR:\s*\[[\s\S]{0,80}'style'/);
  const previewDocumentHtml = `<div class="rich-text-output">${reloaded}</div>`;
  assert.match(previewDocumentHtml, /font-size:\s*8pt/);
  assert.match(pdfSource, /const pdfDocumentHtml = inlineLocalPdfImages\(documentHtml\)/);
  assert.match(pdfSource, /<body>\$\{pdfDocumentHtml\}<\/body>/);
});

test('LiveSPOEditor menyediakan insert table semantic pada saved caret dan contextual tools', () => {
  const editor = readFileSync(new URL('../src/components/RichTextEditor.tsx', import.meta.url), 'utf8');
  const commands = readFileSync(new URL('../src/utils/editorTableCommands.ts', import.meta.url), 'utf8');
  assert.match(editor, /restoreSavedSelection\(\)[\s\S]{0,300}createSemanticTable/);
  assert.match(editor, /placeCaretInCell\(inserted\?\.rows\[0\]\?\.cells\[0\]/);
  assert.match(editor, /Insert ▾/);
  assert.match(editor, /activeFormatting\.inTable/);
  assert.match(commands, /createElement\('table'\)/);
  assert.match(commands, /createTBody\(\)/);
  assert.match(commands, /insertRow/);
  assert.match(commands, /insertCell/);
  assert.doesNotMatch(commands, /canvas|\|---/);
});

test('operasi table span-aware mencakup row, column, merge horizontal/vertical, split dan delete', () => {
  const commands = readFileSync(new URL('../src/utils/editorTableCommands.ts', import.meta.url), 'utf8');
  for (const command of ['add-row', 'add-column', 'delete-row', 'delete-column', 'merge-right', 'merge-down', 'split-cell', 'delete-table']) {
    assert.match(commands, new RegExp(command));
  }
  assert.match(commands, /tableGrid/);
  assert.match(commands, /cell\.colSpan \+=/);
  assert.match(commands, /cell\.rowSpan \+=/);
  assert.match(commands, /appendContent\(cell, other\.cell\)/);
  assert.match(commands, /cell\.rowSpan = 1; cell\.colSpan = 1/);
});

test('single context toolbar production minimal, selection-safe, dan terpisah dari text alignment', () => {
  const liveTemplateSource = readFileSync(new URL('../src/components/SopLiveTemplate.tsx', import.meta.url), 'utf8');
  for (const tooltip of ['Sesuaikan Lebar Tabel', 'Tambah Baris', 'Tambah Kolom', 'Gabung Sel', 'Pisahkan Sel', 'Posisi Tabel', 'Hapus Baris', 'Hapus Kolom', 'Hapus Tabel']) assert.ok(liveTemplateSource.includes(`title="${tooltip}"`));
  assert.match(liveTemplateSource, /handleTableAlignment\(alignment\)/);
  assert.match(liveTemplateSource, /onMouseDown=\{e\s*=>\s*e\.preventDefault\(\)\}/);
  assert.match(cssSource, /\.live-spo-context-toolbar/);
  assert.match(liveTemplateSource, /activeFormatting\.context\s*!==\s*'image'/);
  assert.match(liveTemplateSource, /aria-label="Mode toolbar"/);
  assert.match(liveTemplateSource, /setActiveToolMode\('text'\)/);
  assert.match(liveTemplateSource, /setActiveToolMode\('table'\)/);
  assert.match(liveTemplateSource, /setActiveToolMode\('image'\)/);
  assert.match(liveTemplateSource, /activeToolMode === 'text'/);
  assert.match(liveTemplateSource, /activeToolMode === 'table'/);
  assert.match(liveTemplateSource, /activeToolMode === 'image'/);
  assert.match(liveTemplateSource, /toggleTableAutoFit/);
  assert.doesNotMatch(liveTemplateSource, /AutoFit Tabel|Sel B\{|<summary[^>]*>⋯<\/summary>/);
  assert.match(liveTemplateSource, /aria-pressed=\{activeFormatting\.orderedList\}/);
  assert.match(liveTemplateSource, /activeFormatting\.tableAlign/);
  assert.match(cssSource, /\.toolbar-icon\.is-active/);
  const tableTools = liveTemplateSource.slice(liveTemplateSource.indexOf("activeToolMode === 'table'"), liveTemplateSource.indexOf("activeToolMode === 'image'"));
  assert.doesNotMatch(tableTools, /Ukuran huruf|Tebal|Miring|Garis bawah|Penomoran|Bullet/);
  assert.doesNotMatch(tableTools, /toolbar-text/);
});

test('mode toolbar hanya berubah lewat klik selector mode manual', () => {
  const liveTemplateSource = readFileSync(new URL('../src/components/SopLiveTemplate.tsx', import.meta.url), 'utf8');
  assert.equal((liveTemplateSource.match(/setActiveToolMode\(/g) || []).length, 3);
  assert.doesNotMatch(liveTemplateSource, /activeFormatting\.context[\s\S]{0,120}setActiveToolMode/);
  assert.doesNotMatch(liveTemplateSource, /insertTable[\s\S]{0,120}setActiveToolMode/);
  assert.doesNotMatch(liveTemplateSource, /insertImageFiles[\s\S]{0,120}setActiveToolMode/);
});

test('AutoFit menyesuaikan lebar tabel dengan teks tanpa melewati lebar dokumen', () => {
  assert.match(editorSource, /table\.dataset\.tableAutofit = 'true'/);
  assert.match(editorSource, /savedRangeRef\.current = cellRange/);
  assert.match(a4Source, /table\.dataset\.tableAutofit === 'true' \? 'auto' : 'fixed'/);
  assert.match(cssSource, /table\[data-table-autofit="true"\][\s\S]{0,300}width: fit-content !important;[\s\S]{0,100}max-width: 100% !important;[\s\S]{0,100}table-layout: auto !important;/);
  assert.match(cssSource, /table\[data-table-autofit="true"\] > colgroup > col[\s\S]{0,300}width: auto !important/);
  assert.match(editorSource, /selectedTable\.dataset\.tableWidth = String\(percent\)/);
  assert.match(cssSource, /\.table-selection-overlay[\s\S]{0,500}\.table-move-handle[\s\S]{0,500}\.table-resize-handle/);
});

test('Live A4, Preview, dan PDF memakai geometri fisik canonical yang sama', () => {
  for (const value of ['widthMm: 210', 'heightMm: 297', 'marginTopMm: 20', 'marginRightMm: 20', 'marginBottomMm: 20', 'marginLeftMm: 20', 'contentWidthMm: 170']) {
    assert.ok(a4Source.includes(value), value);
  }
  assert.match(cssSource, /--sop-a4-content-width: 170mm/);
  assert.match(cssSource, /\.sop-live-a4-document[\s\S]{0,180}var\(--sop-a4-content-width\)/);
  assert.match(pdfSource, /padding:20mm 20mm 20mm 20mm/);
});

test('normalisasi tabel canonical mempertahankan proporsi dan membatasi ke content cell', () => {
  assert.match(a4Source, /values\[index\][\s\S]{0,80}\/ total/);
  assert.match(a4Source, /table\.style\.maxWidth = '100%'/);
  assert.match(a4Source, /table\.style\.tableLayout = table\.dataset\.tableAutofit === 'true' \? 'auto' : 'fixed'/);
  assert.match(cssSource, /\.sop-batang-tubuh-content \.rich-text-document-content table,[\s\S]{0,120}\.sop-batang-tubuh-content \.rich-text-output table \{[\s\S]{0,180}table-layout: fixed !important/);
  assert.doesNotMatch(cssSource, /\.sop-batang-tubuh-content \.rich-text-output table \{[\s\S]{0,180}table-layout: auto !important/);
  assert.match(rendererSource, /normalizeStructuredHtml/);
  assert.match(editorSource, /normalizeStructuredTables\(editorRef\.current\)/);
  assert.match(a4Source, /isFullContentWidthTable\(table\)[\s\S]{0,80}table\.style\.width = '100%'/);
  assert.match(cssSource, /table\[data-editor-table="true"\][\s\S]{0,100}width: 100% !important/);
});

test('cell guides hanya di actual contentEditable dan tidak masuk preview atau PDF', () => {
  assert.match(cssSource, /\.rich-text-editor-content table td,[\s\S]{0,100}box-shadow: inset/);
  assert.match(cssSource, /\.rich-text-editor-content table td:empty::after/);
  assert.doesNotMatch(cssSource, /\.rich-text-document-content table td,[\s\S]{0,100}box-shadow: inset/);
  assert.doesNotMatch(cssSource, /#printable-sop-official-document table td,[\s\S]{0,100}box-shadow: inset/);
  assert.doesNotMatch(editorCommandsSource, /box-shadow|border:/);
});

test('mutasi table masuk native undo history tanpa mengubah DOM editor langsung', () => {
  assert.match(editorSource, /const clonedTable = table\.cloneNode\(true\)/);
  assert.match(editorSource, /mutateTable\(clonedCell, command\)/);
  assert.match(editorSource, /replacementRange\.selectNode\(table\)/);
  assert.match(editorSource, /document\.execCommand\('insertHTML', false, replacement\)/);
  assert.doesNotMatch(editorSource, /mutateTable\(cell, command\)/);
});

test('manual table memakai geometri proporsional canonical dan pipeline render yang sama', () => {
  const commands = readFileSync(new URL('../src/utils/editorTableCommands.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(commands, /table\.style\.width = '100%'/);
  assert.match(commands, /col\.style\.width = `\$\{100 \/ columns\}%`/);
  assert.match(css, /table\[data-editor-table="true"\][\s\S]{0,160}table-layout: fixed/);
  assert.match(rendererSource, /'table', 'colgroup', 'col'/);
});

test('Tab di list dalam cell mempertahankan nesting semantic dan tidak memindahkan td', () => {
  const editor = readFileSync(new URL('../src/components/RichTextEditor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /const inList = Boolean\(element\?\.closest\('li'\)\)/);
  assert.match(editor, /const inCell = Boolean\(element\?\.closest\('td,th'\)\)/);
  assert.match(editor, /if \(inList \|\| inCell\) e\.preventDefault\(\)/);
  assert.match(editor, /executeCommand\(e\.shiftKey \? 'outdent' : 'indent'\)/);
});

test('table-cell typography single-spaced sama di Live, Preview, dan PDF', () => {
  const typographyStart = cssSource.indexOf('/* Canonical table-cell typography shared');
  const typographyEnd = cssSource.indexOf('/* LiveSPOEditor', typographyStart);
  const typographyCss = cssSource.slice(typographyStart, typographyEnd);

  assert.ok(typographyStart >= 0);
  for (const surface of ['.rich-text-editor-content', '.rich-text-document-content', '.rich-text-output']) {
    assert.ok(typographyCss.includes(`${surface} table td`));
    assert.ok(typographyCss.includes(`${surface} table th`));
    assert.ok(typographyCss.includes(`${surface} table td *`));
    assert.ok(typographyCss.includes(`${surface} table th *`));
    assert.ok(typographyCss.includes(`${surface} table td p`));
    assert.ok(typographyCss.includes(`${surface} table th p`));
    assert.ok(typographyCss.includes(`${surface} table td li`));
    assert.ok(typographyCss.includes(`${surface} table th li`));
  }
  assert.match(typographyCss, /line-height: 1\.05 !important;/);
  assert.match(typographyCss, /margin-top: 0 !important;/);
  assert.match(typographyCss, /margin-bottom: 0 !important;/);
  assert.doesNotMatch(typographyCss, /\.sop-official-table/);
  assert.doesNotMatch(typographyCss, /(?:padding|width|table-layout|break-inside|page-break)\s*:/);
});
