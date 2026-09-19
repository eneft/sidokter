import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  extractCanonicalTableGeometry,
  getCanonicalColumnWidths,
  getLogicalColumnCount,
  buildLogicalGrid,
  safeTableRowBoundariesV2,
  splitStructuredTableV2,
  paginateStructuredTableV2,
  parseCssWidthToUnits,
} from '../src/utils/structuredTablePaginationV2';

function createDocument(html: string) {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return document;
}

test('V2 Table Paginator: Produksi C. INTERPRETASI HASIL dengan 5 kolom, lebar berbeda, rowspan, colspan, dan teks panjang', () => {
  const productionTableHtml = `
  <div id="container">
    <p><strong>C. INTERPRETASI HASIL</strong></p>
    <table style="width: 95%; table-layout: fixed;">
      <colgroup>
        <col style="width: 15%;" />
        <col style="width: 15%;" />
        <col style="width: 10%;" />
        <col style="width: 10%;" />
        <col style="width: 50%;" />
      </colgroup>
      <thead>
        <tr>
          <th>Mayor</th>
          <th>Minor</th>
          <th>AC</th>
          <th>DCT</th>
          <th>Kesimpulan</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td rowspan="2">Reaksi Positif Mayor</td>
          <td>Inkompatibilitas minor fase I</td>
          <td>Negatif</td>
          <td>Negatif</td>
          <td>Darah tidak boleh dikeluarkan kepada pasien karena terjadi aglutinasi inkompatibilitas mayor yang berisiko tinggi menyebabkan reaksi transfusi hemolitik akut.</td>
        </tr>
        <tr>
          <td>Inkompatibilitas minor fase II</td>
          <td>Positif lemah</td>
          <td>Negatif</td>
          <td>Lakukan konfirmasi ulang spesifisitas aloantibodi terhadap serum donor dan resipien dengan metode gel test.</td>
        </tr>
        <tr>
          <td>Reaksi Negatif</td>
          <td>Negatif</td>
          <td>Negatif</td>
          <td>Negatif</td>
          <td>Darah kompatibel dan aman untuk ditransfusikan sesuai dengan indikasi klinis dokter penanggung jawab pelayanan (DPJP).</td>
        </tr>
        <tr>
          <td colspan="2">Inkompatibel Autokontrol (AC)</td>
          <td>Positif</td>
          <td>Positif</td>
          <td>Curigai adanya autoantibodi atau Direct Antiglobulin Test (DAT) positif pada resipien; konsultasikan dengan dokter spesialis patologi klinik.</td>
        </tr>
        <tr>
          <td>Reaksi Inkompatibel DCT</td>
          <td>Negatif</td>
          <td>Negatif</td>
          <td>Positif</td>
          <td>Terdapat sensitisasi eritrosit in vivo; lakukan penelusuran riwayat transfusi sebelumnya dan pemeriksaan elusi antibodi.</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5">Catatan: Seluruh hasil uji silang serasi harus diverifikasi oleh Petugas Bank Darah RSUD Dr. Soegiri.</td>
        </tr>
      </tfoot>
    </table>
  </div>
  `.trim();

  const doc = createDocument(productionTableHtml);
  const sourceTable = doc.querySelector('table') as unknown as HTMLTableElement;
  assert.ok(sourceTable, 'Source table must exist');

  // Verify source geometry
  const initialGeom = extractCanonicalTableGeometry(sourceTable);
  assert.equal(initialGeom.logicalColumnCount, 5, 'Logical column count must be 5');
  assert.deepEqual(
    initialGeom.columnWidths,
    [15, 15, 10, 10, 50],
    'Canonical column widths must match source specification'
  );
  assert.equal(initialGeom.tableWidth, '95%');
  assert.equal(initialGeom.tableLayout, 'fixed');

  // Row boundaries: rows 0 and 1 are bound by rowspan="2" on Mayor cell.
  // Boundary 0 (between row 0 and 1) is unsafe. Boundary 1 (after row 1) is safe.
  const bodyRows = Array.from(sourceTable.querySelectorAll('tbody tr')) as unknown as HTMLTableRowElement[];
  const safeBoundaries = safeTableRowBoundariesV2(bodyRows);
  assert.equal(safeBoundaries[0], false, 'Rowspan="2" must forbid splitting after row 0');
  assert.equal(safeBoundaries[1], true, 'Boundary after row 1 must be safe');

  // Simulate page break near bottom: only rows up to row 2 (first 2 rows) fit on page 1.
  // Row 3+ must be fragmented onto page 2.
  const fits = (html: string): boolean => {
    const d = createDocument(html);
    const rows = d.querySelectorAll('tbody tr');
    // Only at most 2 rows fit in remaining space of page 1
    return rows.length <= 2;
  };

  const fragments = splitStructuredTableV2(sourceTable, fits);
  assert.equal(fragments.length, 2, 'Table must fragment into exactly 2 parts');

  // Parse both fragments
  const docFrag1 = createDocument(fragments[0]);
  const docFrag2 = createDocument(fragments[1]);
  const fragTable1 = docFrag1.querySelector('table') as unknown as HTMLTableElement;
  const fragTable2 = docFrag2.querySelector('table') as unknown as HTMLTableElement;

  assert.ok(fragTable1, 'Fragment 1 must contain a table');
  assert.ok(fragTable2, 'Fragment 2 must contain a table');

  // ASSERT 1: canonical column widths fragment pertama === canonical column widths fragment kedua
  const widthsFrag1 = getCanonicalColumnWidths(fragTable1);
  const widthsFrag2 = getCanonicalColumnWidths(fragTable2);
  assert.deepEqual(
    widthsFrag1,
    widthsFrag2,
    'Canonical column widths fragment 1 MUST equal canonical column widths fragment 2'
  );
  assert.deepEqual(widthsFrag1, [15, 15, 10, 10, 50]);

  // ASSERT 2: logical column grid fragment pertama === logical column grid fragment kedua
  const colCountFrag1 = getLogicalColumnCount(fragTable1);
  const colCountFrag2 = getLogicalColumnCount(fragTable2);
  assert.equal(
    colCountFrag1,
    colCountFrag2,
    'Logical column count fragment 1 MUST equal logical column count fragment 2'
  );
  assert.equal(colCountFrag1, 5);

  const grid1 = buildLogicalGrid(fragTable1);
  const grid2 = buildLogicalGrid(fragTable2);
  assert.equal(grid1.colCount, grid2.colCount, 'Logical grid colCount must match');
  assert.equal(grid1.colCount, 5);

  // ASSERT 3: table width fragment pertama === table width fragment kedua
  assert.equal(
    fragTable1.style.width,
    fragTable2.style.width,
    'Table width fragment 1 MUST equal table width fragment 2'
  );
  assert.equal(fragTable1.style.width, '95%');

  // ASSERT 4: Tidak boleh ada nested table akibat pagination
  assert.equal(fragTable1.querySelectorAll('table').length, 0, 'No nested table inside fragment 1');
  assert.equal(fragTable2.querySelectorAll('table').length, 0, 'No nested table inside fragment 2');

  // ASSERT 5: Header repeated on continuation, footer only on final fragment
  assert.ok(fragTable1.querySelector('thead'), 'Fragment 1 must have thead');
  assert.ok(fragTable2.querySelector('thead'), 'Fragment 2 must have thead repeated');
  assert.equal(fragTable1.querySelector('tfoot'), null, 'Fragment 1 must NOT have tfoot');
  assert.ok(fragTable2.querySelector('tfoot'), 'Fragment 2 must have tfoot');

  // ASSERT 6: AutoFit disabled on paginated fragments
  assert.equal(fragTable1.dataset.tableAutofit, undefined);
  assert.equal(fragTable2.dataset.tableAutofit, undefined);
  assert.equal(fragTable1.getAttribute('data-paginated-fragment'), 'true');
  assert.equal(fragTable2.getAttribute('data-paginated-fragment'), 'true');

  // ASSERT 7: Row content verification
  const rowsFrag1 = docFrag1.querySelectorAll('tbody tr');
  const rowsFrag2 = docFrag2.querySelectorAll('tbody tr');
  assert.equal(rowsFrag1.length, 2, 'Fragment 1 must contain rows 0 and 1 due to rowspan="2"');
  assert.equal(rowsFrag2.length, 3, 'Fragment 2 must contain remaining rows');
  assert.match(rowsFrag1[0].textContent || '', /Reaksi Positif Mayor/);
  assert.match(rowsFrag2[1].textContent || '', /Inkompatibel Autokontrol/);
});

test('V2 Table Paginator: Table without colgroup still produces identical canonical geometry in both fragments', () => {
  const tableWithoutColgroup = `
    <table style="width: 80%;">
      <thead>
        <tr>
          <th style="width: 20%;">A</th>
          <th style="width: 20%;">B</th>
          <th style="width: 60%;">C</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>2</td><td>3</td></tr>
        <tr><td>4</td><td>5</td><td>6</td></tr>
        <tr><td>7</td><td>8</td><td>9</td></tr>
      </tbody>
    </table>
  `.trim();

  const doc = createDocument(tableWithoutColgroup);
  const table = doc.querySelector('table') as unknown as HTMLTableElement;

  const fits = (html: string) => {
    const d = createDocument(html);
    return d.querySelectorAll('tbody tr').length <= 1;
  };

  const fragments = splitStructuredTableV2(table, fits);
  assert.equal(fragments.length, 2);

  const doc1 = createDocument(fragments[0]);
  const doc2 = createDocument(fragments[1]);
  const t1 = doc1.querySelector('table') as unknown as HTMLTableElement;
  const t2 = doc2.querySelector('table') as unknown as HTMLTableElement;

  assert.deepEqual(getCanonicalColumnWidths(t1), getCanonicalColumnWidths(t2));
  assert.equal(getLogicalColumnCount(t1), getLogicalColumnCount(t2));
  assert.equal(t1.style.width, t2.style.width);
  assert.equal(t1.querySelectorAll('table').length, 0);
  assert.equal(t2.querySelectorAll('table').length, 0);
});

test('V2 Table Paginator: Table that fits completely is not split', () => {
  const shortTable = `
    <table>
      <thead><tr><th>A</th><th>B</th></tr></thead>
      <tbody><tr><td>1</td><td>2</td></tr></tbody>
    </table>
  `.trim();

  const doc = createDocument(shortTable);
  const table = doc.querySelector('table') as unknown as HTMLTableElement;

  const fitsAlways = () => true;
  const parts = splitStructuredTableV2(table, fitsAlways);
  assert.equal(parts.length, 1);
  assert.equal(parts[0], table.outerHTML);
});

test('V2 Table Paginator: 3-page and 5-page iterative pagination with identical canonical geometry and 100% body text integrity', () => {
  // Construct a long table with 12 rows, unequal columns, rowspan, width: 80%, thead and tfoot
  const longTableHtml = `
    <table style="width: 80%; table-layout: fixed;">
      <colgroup>
        <col style="width: 15%;" />
        <col style="width: 25%;" />
        <col style="width: 35%;" />
        <col style="width: 25%;" />
      </colgroup>
      <thead>
        <tr>
          <th>No</th>
          <th>Kode</th>
          <th>Nama Uji</th>
          <th>Keterangan</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>KD-01</td><td>Pemeriksaan Golongan Darah ABO</td><td>Serum grouping</td></tr>
        <tr><td>2</td><td>KD-02</td><td>Pemeriksaan Rhesus D</td><td>Metode Tabung</td></tr>
        <tr><td rowspan="2">3</td><td>KD-03-A</td><td>Crossmatch Mayor</td><td>Fase I Albumin</td></tr>
        <tr><td>KD-03-B</td><td>Crossmatch Minor</td><td>Fase II Coombs</td></tr>
        <tr><td>4</td><td>KD-04</td><td>Direct Antiglobulin Test</td><td>Anti-IgG + Anti-C3d</td></tr>
        <tr><td>5</td><td>KD-05</td><td>Indirect Antiglobulin Test</td><td>Skrining antibodi</td></tr>
        <tr><td>6</td><td>KD-06</td><td>Identifikasi Antibodi</td><td>11 Panel Sel Komersial</td></tr>
        <tr><td rowspan="2">7</td><td>KD-07-A</td><td>Titer Antibodi Lengkap</td><td>Serial Dilution 1:1 - 1:1024</td></tr>
        <tr><td>KD-07-B</td><td>Elusi Antibodi Acid</td><td>Metode Acid Elution</td></tr>
        <tr><td>8</td><td>KD-08</td><td>Adsorpsi Autologus</td><td>Menghilangkan autoantibodi</td></tr>
        <tr><td>9</td><td>KD-09</td><td>Pemeriksaan Hemoglobin Rutin</td><td>Metode SLS-Hb</td></tr>
        <tr><td>10</td><td>KD-10</td><td>Hematokrit Mikro</td><td>Sentrifugasi kapiler</td></tr>
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4">Catatan: Validasi hasil wajib disetujui dokter penanggung jawab laboratorium.</td>
        </tr>
      </tfoot>
    </table>
  `.trim();

  const docSource = createDocument(longTableHtml);
  const sourceTable = docSource.querySelector('table') as unknown as HTMLTableElement;
  const sourceCanonical = extractCanonicalTableGeometry(sourceTable);

  // Extract source body rows text
  const sourceBodyRowTexts = Array.from(sourceTable.querySelectorAll('tbody tr')).map(
    (tr) => (tr.textContent || '').replace(/\s+/g, ' ').trim()
  );

  // --- 3-PAGE TEST SCENARIO ---
  // Page 1: 4 rows (1, 2, 3 [rowspan 2])
  // Page 2: 4 rows (4, 5, 6, 7 [rowspan 2]) -> wait, row 7 is 2 rows, so 4,5,6,7-A,7-B is 5 rows
  // Capacity: <= 4 rows per page
  const fragments3 = paginateStructuredTableV2(sourceTable, (html, pageIdx) => {
    const d = createDocument(html);
    const rowCount = d.querySelectorAll('tbody tr').length;
    if (pageIdx === 0) return rowCount <= 4;
    if (pageIdx === 1) return rowCount <= 4;
    return true;
  });

  assert.ok(fragments3.length >= 3, `Expected at least 3 fragments, got ${fragments3.length}`);

  // Check canonical geometry & textContent across all fragments in 3-page scenario
  const aggregatedRowTexts3: string[] = [];
  fragments3.forEach((fragHtml, idx) => {
    const fDoc = createDocument(fragHtml);
    const fTable = fDoc.querySelector('table') as unknown as HTMLTableElement;

    // Colgroup and canonical widths must be identical
    assert.deepEqual(
      getCanonicalColumnWidths(fTable),
      sourceCanonical.columnWidths,
      `Fragment ${idx + 1} column widths must match canonical source`
    );
    assert.equal(getLogicalColumnCount(fTable), sourceCanonical.logicalColumnCount);
    assert.equal(fTable.style.width, sourceCanonical.tableWidth);
    assert.equal(fTable.style.tableLayout, 'fixed');
    assert.equal(fTable.querySelectorAll('table').length, 0, 'No nested tables');

    // thead must repeat on every fragment
    const thead = fDoc.querySelector('thead');
    assert.ok(thead !== null, `Fragment ${idx + 1} must have repeated <thead>`);

    // tfoot must only be on the final fragment
    const tfoot = fDoc.querySelector('tfoot');
    if (idx === fragments3.length - 1) {
      assert.ok(tfoot !== null, 'Final fragment must have <tfoot>');
    } else {
      assert.equal(tfoot, null, `Fragment ${idx + 1} must NOT have <tfoot>`);
    }

    // Collect body row text
    const rows = Array.from(fDoc.querySelectorAll('tbody tr'));
    rows.forEach((tr) => {
      aggregatedRowTexts3.push((tr.textContent || '').replace(/\s+/g, ' ').trim());
    });
  });

  // ACCEPTANCE CRITERIA:
  // Gabungkan textContent seluruh BODY ROW dari semua fragment dan assert hasilnya identik dengan source body rows.
  assert.deepEqual(
    aggregatedRowTexts3,
    sourceBodyRowTexts,
    'Combined textContent of all body rows in 3-page split must match source body rows'
  );

  // --- 5-PAGE TEST SCENARIO ---
  // Fit <= 2 or 3 rows per page
  const fragments5 = paginateStructuredTableV2(sourceTable, (html, pageIdx) => {
    const d = createDocument(html);
    const rowCount = d.querySelectorAll('tbody tr').length;
    if (pageIdx < 4) return rowCount <= 2;
    return true;
  });

  assert.ok(fragments5.length >= 5, `Expected at least 5 fragments, got ${fragments5.length}`);

  const aggregatedRowTexts5: string[] = [];
  fragments5.forEach((fragHtml, idx) => {
    const fDoc = createDocument(fragHtml);
    const fTable = fDoc.querySelector('table') as unknown as HTMLTableElement;

    assert.deepEqual(
      getCanonicalColumnWidths(fTable),
      sourceCanonical.columnWidths,
      `Fragment ${idx + 1} (5-page) column widths must match canonical source`
    );
    assert.equal(fTable.style.width, sourceCanonical.tableWidth);
    assert.equal(fTable.querySelectorAll('table').length, 0);

    const thead = fDoc.querySelector('thead');
    assert.ok(thead !== null, `Fragment ${idx + 1} in 5-page split must have <thead>`);

    const tfoot = fDoc.querySelector('tfoot');
    if (idx === fragments5.length - 1) {
      assert.ok(tfoot !== null, 'Final fragment in 5-page split must have <tfoot>');
    } else {
      assert.equal(tfoot, null, `Fragment ${idx + 1} in 5-page split must NOT have <tfoot>`);
    }

    const rows = Array.from(fDoc.querySelectorAll('tbody tr'));
    rows.forEach((tr) => {
      aggregatedRowTexts5.push((tr.textContent || '').replace(/\s+/g, ' ').trim());
    });
  });

  assert.deepEqual(
    aggregatedRowTexts5,
    sourceBodyRowTexts,
    'Combined textContent of all body rows in 5-page split must match source body rows'
  );
});

test('V2 Table Paginator: Canonical width extraction preserves physical units (px, pt, mm, cm, %) without naive stripping', () => {
  // Test unit parser directly
  assert.deepEqual(parseCssWidthToUnits('100px'), { value: 100, unit: 'px' });
  assert.deepEqual(parseCssWidthToUnits('25.5%'), { value: 25.5, unit: '%' });
  assert.deepEqual(parseCssWidthToUnits('14.2pt'), { value: 14.2, unit: 'pt' });
  assert.deepEqual(parseCssWidthToUnits('30mm'), { value: 30, unit: 'mm' });
  assert.deepEqual(parseCssWidthToUnits('5cm'), { value: 5, unit: 'cm' });
  assert.deepEqual(parseCssWidthToUnits('40'), { value: 40, unit: 'px' }); // default px
  assert.equal(parseCssWidthToUnits(''), null);
  assert.equal(parseCssWidthToUnits('auto'), null);
  assert.equal(parseCssWidthToUnits('-10px'), null);

  // Table with explicit mm and cm colgroup
  const tableMm = `
    <table style="width: 150mm;">
      <colgroup>
        <col style="width: 30mm;" />
        <col style="width: 60mm;" />
        <col style="width: 60mm;" />
      </colgroup>
      <tbody>
        <tr><td>A</td><td>B</td><td>C</td></tr>
      </tbody>
    </table>
  `.trim();

  const docMm = createDocument(tableMm);
  const tMm = docMm.querySelector('table') as unknown as HTMLTableElement;
  const geomMm = extractCanonicalTableGeometry(tMm);

  // 30 / 150 = 20%, 60 / 150 = 40%, 60 / 150 = 40%
  assert.deepEqual(geomMm.columnWidths, [20, 40, 40]);
  assert.equal(geomMm.tableWidth, '150mm');

  // Table with explicit pt colgroup
  const tablePt = `
    <table>
      <colgroup>
        <col style="width: 72pt;" />
        <col style="width: 144pt;" />
        <col style="width: 72pt;" />
      </colgroup>
      <tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody>
    </table>
  `.trim();
  const docPt = createDocument(tablePt);
  const tPt = docPt.querySelector('table') as unknown as HTMLTableElement;
  const geomPt = extractCanonicalTableGeometry(tPt);

  // 72 / 288 = 25%, 144 / 288 = 50%, 72 / 288 = 25%
  assert.deepEqual(geomPt.columnWidths, [25, 50, 25]);
});

test('V2 Table Paginator: Produksi PEMERIKSAAN CROSSMATCH tanpa thead mengulang header Mayor|Minor|AC|DCT|Kesimpulan dan mempertahankan geometri/lebar Kesimpulan', () => {
  const crossmatchTableHtml = `
  <table width="473" data-align="center" style="text-align: left; color: rgb(0, 0, 0); max-width: 100%; box-sizing: border-box; table-layout: auto; margin-left: auto; margin-right: auto;" data-table-autofit="true">
    <colgroup>
      <col style="width: 20%;">
      <col style="width: 20%;">
      <col style="width: 20%;">
      <col style="width: 20%;">
      <col style="width: 20%;">
    </colgroup>
    <tbody>
      <tr>
        <td width="66"><div style="text-align: center;"><b><span style="font-size: 8pt;">Mayor</span></b></div></td>
        <td width="66"><div style="text-align: center;"><b><span style="font-size: 8pt;">Minor</span></b></div></td>
        <td width="47"><div style="text-align: center;"><b><span style="font-size: 8pt;">AC</span></b></div></td>
        <td width="57"><div style="text-align: center;"><b><span style="font-size: 8pt;">DCT</span></b></div></td>
        <td width="236"><div style="text-align: center;"><b><span style="font-size: 8pt;">Kesimpulan</span></b></div></td>
      </tr>
      <tr>
        <td width="66"><div style="text-align: center;"><span style="font-size: 8pt;">Neg</span></div></td>
        <td width="66"><div style="text-align: center;"><span style="font-size: 8pt;">Neg</span></div></td>
        <td width="47"><div style="text-align: center;"><span style="font-size: 8pt;">Neg</span></div></td>
        <td width="57"><p><span style="font-size: 8pt;"><br></span></p></td>
        <td width="236"><ul><li><span style="font-size: 8pt;">Kompatibel bisa dikelurakan</span></li></ul></td>
      </tr>
      <tr>
        <td width="66"><div style="text-align: center;"><span style="font-size: 8pt;">Pos</span></div></td>
        <td width="66"><div style="text-align: center;"><span style="font-size: 8pt;">Neg</span></div></td>
        <td width="47"><div style="text-align: center;"><span style="font-size: 8pt;">Neg</span></div></td>
        <td width="57"><p><span style="font-size: 8pt;"><br></span></p></td>
        <td width="236"><ul><li><span style="font-size: 8pt;">lakukan pemeriksan golda ulang pada sampel pasien</span></li><li><span style="font-size: 8pt;">jika hasil golda pasien sama dengan golda donor artinya ada irregular antibody pada darah pasien</span></li><li><span style="font-size: 8pt;">ganti darah donor lakukan crosmatch ulang sampai dapat hasil mayor negative</span></li><li><span style="font-size: 8pt;">jika tidak ditemukan maka rujuk pada UTD Pembina terdekat</span></li></ul></td>
      </tr>
      <tr>
        <td width="66"><div style="text-align: center;"><span style="font-size: 8pt;">Neg</span></div></td>
        <td width="66"><div style="text-align: center;"><span style="font-size: 8pt;">Pos</span></div></td>
        <td width="47"><div style="text-align: center;"><span style="font-size: 8pt;">Neg</span></div></td>
        <td width="57"><p><span style="font-size: 8pt;"><br></span></p></td>
        <td width="236"><ul><li><span style="font-size: 8pt;">ganti dengan darah donor dan lakukan crosmatch ulang</span></li></ul></td>
      </tr>
      <tr>
        <td width="66"><div style="text-align: center;"><span style="font-size: 8pt;">Neg</span></div></td>
        <td width="66"><div style="text-align: center;"><span style="font-size: 8pt;">Pos</span></div></td>
        <td width="47"><div style="text-align: center;"><span style="font-size: 8pt;">Pos</span></div></td>
        <td width="57"><p><span style="font-size: 8pt;"><br></span></p></td>
        <td width="236"><ul><li><span style="font-size: 8pt;">lakukan pemeruksaan DCT pada sampel pasien</span></li></ul></td>
      </tr>
      <tr data-row-min-height="62" style="min-height: 62px; height: 62px;">
        <td width="66"><div style="text-align: center;"><span style="font-size: 8pt;">Neg</span></div></td>
        <td width="66"><div style="text-align: center;"><span style="font-size: 8pt;">Pos</span></div></td>
        <td width="47"><div style="text-align: center;"><span style="font-size: 8pt;">Pos</span></div></td>
        <td width="57"><div style="text-align: center;"><span style="font-size: 8pt;">Pos</span></div></td>
        <td width="236"><ul><li><span style="font-size: 8pt;">apa bila drajat positif pada &nbsp;DCT ≥ pada Minor/AC boleh dikeluarkan</span></li></ul></td>
      </tr>
      <tr data-row-min-height="12" style="min-height: 12px; height: 12px;">
        <td width="66"><div style="text-align: center;"><span style="font-size: 8pt;">Pos</span></div></td>
        <td width="66"><div style="text-align: center;"><span style="font-size: 8pt;">Pos</span></div></td>
        <td width="47"><div style="text-align: center;"><span style="font-size: 8pt;">Pos</span></div></td>
        <td width="57"><div style="text-align: center;"><span style="font-size: 8pt;">Pos</span></div></td>
        <td width="236"><ul><li><span style="font-size: 8pt;">harus dirujuk</span></li></ul></td>
      </tr>
    </tbody>
  </table>
  `.trim();

  const doc = createDocument(crossmatchTableHtml);
  const sourceTable = doc.querySelector('table') as unknown as HTMLTableElement;
  assert.ok(sourceTable, 'Source table must exist');

  // Verify canonical geometry extraction preserves table width, table-layout auto, and logical column count
  const geom = extractCanonicalTableGeometry(sourceTable);
  assert.equal(geom.tableWidth, '473px');
  assert.equal(geom.tableLayout, 'auto');
  assert.equal(sourceTable.dataset.tableAutofit, 'true');
  assert.equal(geom.logicalColumnCount, 5);

  // Split simulation where Page 1 can accommodate 3 body rows
  const fitsSim = (candidateHtml: string) => {
    const candidateDoc = createDocument(candidateHtml);
    const tbodyRows = candidateDoc.querySelectorAll('tbody tr');
    return tbodyRows.length <= 3;
  };

  const fragments = splitStructuredTableV2(sourceTable, fitsSim);
  assert.equal(fragments.length, 2, 'Should split into exactly 2 fragments');

  // Verify Page 1 fragment
  const doc1 = createDocument(fragments[0]);
  const table1 = doc1.querySelector('table') as unknown as HTMLTableElement;
  assert.equal(table1.getAttribute('width'), '473', 'Table width 473 must be preserved');
  assert.equal(table1.style.tableLayout, 'auto', 'Table layout auto must be preserved');
  assert.equal(table1.dataset.tableAutofit, 'true', 'Autofit attribute must be preserved');

  const thead1 = table1.querySelector('thead');
  assert.ok(thead1, 'Header must be present in Page 1 fragment');
  const thead1Text = Array.from(thead1.querySelectorAll('th, td')).map(c => c.textContent?.trim()).join(' | ');
  assert.equal(thead1Text, 'Mayor | Minor | AC | DCT | Kesimpulan', 'Header titles must match exactly');

  const tbody1Rows = table1.querySelectorAll('tbody tr');
  assert.equal(tbody1Rows.length, 3, 'Page 1 must contain 3 body rows');

  // Verify Page 2 fragment (continuation page)
  const doc2 = createDocument(fragments[1]);
  const table2 = doc2.querySelector('table') as unknown as HTMLTableElement;
  assert.equal(table2.getAttribute('width'), '473', 'Table width 473 must be preserved on continuation page');
  assert.equal(table2.style.tableLayout, 'auto', 'Table layout auto must be preserved on continuation page');
  assert.equal(table2.dataset.tableAutofit, 'true', 'Autofit attribute must be preserved on continuation page');

  const thead2 = table2.querySelector('thead');
  assert.ok(thead2, 'Header must REPEAT on continuation page break');
  const thead2Text = Array.from(thead2.querySelectorAll('th, td')).map(c => c.textContent?.trim()).join(' | ');
  assert.equal(thead2Text, 'Mayor | Minor | AC | DCT | Kesimpulan', 'Header titles Mayor | Minor | AC | DCT | Kesimpulan must appear on continuation page');

  const tbody2Rows = table2.querySelectorAll('tbody tr');
  assert.equal(tbody2Rows.length, 3, 'Page 2 must contain remaining 3 body rows');

  // Verify Kesimpulan column cell width is preserved at 236 on both pages
  const kesimpulan1Cells = Array.from(table1.querySelectorAll('tbody tr td:last-child'));
  kesimpulan1Cells.forEach(cell => {
    assert.equal(cell.getAttribute('width'), '236', 'Kesimpulan width 236 must be preserved');
    assert.ok(cell.innerHTML.includes('font-size: 8pt'), '8pt font size must be preserved');
  });

  const kesimpulan2Cells = Array.from(table2.querySelectorAll('tbody tr td:last-child'));
  kesimpulan2Cells.forEach(cell => {
    assert.equal(cell.getAttribute('width'), '236', 'Kesimpulan width 236 must be preserved on continuation page');
    assert.ok(cell.innerHTML.includes('font-size: 8pt'), '8pt font size must be preserved on continuation page');
  });

  // Zero rows lost and zero rows duplicated
  assert.ok(fragments[0].includes('Kompatibel bisa dikelurakan'));
  assert.ok(fragments[1].includes('harus dirujuk'));
  assert.ok(!fragments[0].includes('harus dirujuk'));
  assert.ok(!fragments[1].includes('Kompatibel bisa dikelurakan'));
});

