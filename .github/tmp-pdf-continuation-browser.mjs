import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const candidates = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

let executablePath = candidates.find((candidate) => fs.existsSync(candidate));
let args = ['--no-sandbox', '--disable-setuid-sandbox'];
if (!executablePath) {
  const mod = await import('@sparticuz/chromium');
  const chromium = mod.default || mod;
  executablePath = await chromium.executablePath();
  args = chromium.args || args;
}
if (!executablePath) throw new Error('Chromium executable not found');

const html = `<!doctype html><html><head><style>
#printable-sop-official-document.pdf-export-document table.sop-official-table {
  border-collapse: collapse !important;
  border: 1px solid #000 !important;
}
#printable-sop-official-document.pdf-export-document .sop-official-table > tbody > tr > td,
#printable-sop-official-document.pdf-export-document .sop-official-table > tbody > tr > th {
  border: 1px solid #000 !important;
}
/* Must be final, exactly like both server PDF renderers after this patch. */
#printable-sop-official-document.pdf-export-document table.sop-official-table.sop-continuation-page-table {
  border-bottom: 0 !important;
}
#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"] > td,
#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"] > th {
  border-bottom: 0 !important;
}
</style></head><body>
<div id="printable-sop-official-document" class="pdf-export-document">
  <div style="width:170mm;height:257mm;display:flex;flex-direction:column">
    <table id="table" class="sop-official-table sop-continuation-page-table" style="width:100%;flex-shrink:0">
      <tbody><tr data-sop-suppress-bottom-border="true"><td id="left">PROSEDUR</td><td id="right">konten</td></tr></tbody>
    </table>
    <div id="floor" style="flex:1 1 auto;min-height:0;border-left:1px solid #000;border-right:1px solid #000;border-bottom:1px solid #000"></div>
  </div>
</div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath, args, headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.emulateMediaType('print');
  const result = await page.evaluate(() => {
    const width = (id) => getComputedStyle(document.getElementById(id)).borderBottomWidth;
    return {
      tableBottom: width('table'),
      leftBottom: width('left'),
      rightBottom: width('right'),
      floorBottom: width('floor'),
    };
  });
  console.log('PDF_CONTINUATION_BORDER_CASCADE', result);
  if (result.tableBottom !== '0px') throw new Error(`PDF continuation table bottom is ${result.tableBottom}`);
  if (result.leftBottom !== '0px' || result.rightBottom !== '0px') {
    throw new Error(`PDF continuation tail cells are ${result.leftBottom}/${result.rightBottom}`);
  }
  if (result.floorBottom !== '1px') throw new Error(`PDF canonical floor is ${result.floorBottom}`);
} finally {
  await browser.close();
}
