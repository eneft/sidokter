import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const candidates = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
let executablePath = candidates.find((p) => fs.existsSync(p));
let args = ['--no-sandbox', '--disable-setuid-sandbox'];
if (!executablePath) {
  const mod = await import('@sparticuz/chromium');
  const chromium = mod.default || mod;
  executablePath = await chromium.executablePath();
  args = chromium.args || args;
}
if (!executablePath) throw new Error('Chromium executable unavailable');

const browser = await puppeteer.launch({ executablePath, args, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 500, deviceScaleFactor: 1 });
  await page.emulateMediaType('print');
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;padding:0;background:#ddd}
    #printable-sop-official-document.pdf-export-document{width:700px;margin:20px}
    .sop-preview-page{width:700px;height:260px;padding:20px;box-sizing:border-box;overflow:hidden;background:#fff}
    .sop-a4-content-frame{height:100%;display:flex;flex-direction:column}
    table.sop-official-table{display:table;width:100%;table-layout:fixed;border-collapse:collapse;border-spacing:0;border:1px solid #000;background:#fff;margin:0;flex-shrink:0}
    table.sop-official-table td{border:1px solid #000;box-sizing:border-box;height:198px}
    table.sop-official-table.sop-continuation-page-table{border-bottom:0!important;box-shadow:0 1px 0 #000}
    table.sop-official-table tr[data-sop-suppress-bottom-border="true"]>td{border-bottom:0!important}
    [data-sop-page-continuation-fill="true"]{flex:1 1 auto;min-height:0;position:relative;box-sizing:border-box;background:#fff;border-left:1px solid #000;border-right:1px solid #000;border-bottom:1px solid #000}
    [data-sop-page-continuation-fill="true"] .divider{position:absolute;top:0;bottom:0;left:28%;border-left:1px solid #000}
    /* Exact raster-safe contract added by the patch. */
    #printable-sop-official-document.pdf-export-document [data-sop-page-continuation-fill="true"]{margin-top:-1px!important;position:relative!important;z-index:1!important;background:#fff!important;border-bottom:0!important;box-shadow:0 -1px 0 #fff!important}
    #printable-sop-official-document.pdf-export-document [data-sop-page-continuation-fill="true"]::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:#000;pointer-events:none;z-index:2}
  </style></head><body>
    <div id="printable-sop-official-document" class="pdf-export-document">
      <div class="sop-preview-page"><div class="sop-a4-content-frame">
        <table id="tail-table" class="sop-official-table sop-continuation-page-table"><colgroup><col style="width:28%"><col style="width:72%"></colgroup><tbody><tr data-sop-suppress-bottom-border="true"><td></td><td></td></tr></tbody></table>
        <div id="fill" data-sop-page-continuation-fill="true"><div class="divider"></div></div>
      </div></div>
    </div>
  </body></html>`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const geom = await page.evaluate(() => {
    const table = document.getElementById('tail-table').getBoundingClientRect();
    const fill = document.getElementById('fill').getBoundingClientRect();
    const page = document.querySelector('.sop-preview-page').getBoundingClientRect();
    return { tableBottom: table.bottom, fillTop: fill.top, fillBottom: fill.bottom, pageLeft: page.left, pageTop: page.top, pageWidth: page.width, pageHeight: page.height };
  });

  const clip = { x: geom.pageLeft, y: geom.pageTop, width: geom.pageWidth, height: geom.pageHeight };
  const png = await page.screenshot({ type: 'png', clip });
  const decoded = await loadImage(png);
  const canvas = createCanvas(decoded.width, decoded.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(decoded, 0, 0);
  const image = ctx.getImageData(0, 0, decoded.width, decoded.height).data;

  const darkCount = (y) => {
    y = Math.max(0, Math.min(decoded.height - 1, Math.round(y - geom.pageTop)));
    let count = 0;
    for (let x = 10; x < decoded.width - 10; x++) {
      const i = (y * decoded.width + x) * 4;
      if (image[i] < 80 && image[i+1] < 80 && image[i+2] < 80) count++;
    }
    return count;
  };

  const junction = darkCount(geom.tableBottom);
  const floor = darkCount(geom.fillBottom - 1);
  const belowFloor = darkCount(Math.min(geom.pageTop + geom.pageHeight - 1, geom.fillBottom + 1));
  console.log('PDF_RASTER_FLOOR', { geom, junction, floor, belowFloor, width: decoded.width });

  // At the table/filler junction only the 3 vertical rules may remain; there
  // must not be a page-wide horizontal rule. The canonical floor must be wide.
  if (junction > 40) throw new Error(`Rasterized junction line still visible: ${junction} dark pixels`);
  if (floor < decoded.width * 0.75) throw new Error(`Canonical floor missing/too short: ${floor} dark pixels`);
  if (belowFloor > 20) throw new Error(`Vertical stubs extend below canonical floor: ${belowFloor} dark pixels`);
} finally {
  await browser.close();
}
