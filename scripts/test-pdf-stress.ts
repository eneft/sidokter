import fs from 'node:fs';
import { generatePdf } from '../server/pdfRenderer';

async function testStress() {
  console.log('Testing generatePdf sequentially and concurrently...');
  
  const sampleHtml = `
    <div id="printable-sop-official-document" class="pdf-export-document">
      <div class="sop-preview-page">
        <table class="sop-official-table">
          <thead>
            <tr>
              <th colspan="2"><img src="/logo_soegiri_transparent.png" /></th>
              <th colspan="4">RSUD DR SOEGIRI LAMONGAN<br>STANDAR PROSEDUR OPERASIONAL</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="6">
                <p>Pengertian: Standar Operasional Prosedur Pengamanan Barang Pasien...</p>
                <img src="/ttd_direktur.png" />
                <img src="/logo_soegiri_stamp.png" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  for (let i = 1; i <= 3; i++) {
    console.log(`\n--- Run ${i} ---`);
    const start = Date.now();
    try {
      const res = await generatePdf({
        html: sampleHtml,
        css: 'body { font-size: 12px; }',
        baseUrl: 'http://localhost:3000',
        title: `Test Dokumen ${i}`
      });
      console.log(`Run ${i} SUCCESS in ${Date.now() - start}ms:`, res.filename, 'size:', res.pdf.length);
    } catch (err: any) {
      console.error(`Run ${i} FAILED:`, err.message, err.stack);
    }
  }
}

testStress().catch(console.error);
