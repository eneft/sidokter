import fs from 'node:fs';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const fixturePath = 'pagination-geometry-audit.html';
const port = 4177;

const fixture = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="/src/index.css" />
  <style>
    body { margin:0; padding:20px; background:#fff; }
    .audit-wrap { width:170mm; margin-bottom:20px; }
    .measure-host { position:absolute; visibility:hidden; left:-100000px; top:0; width:calc(116.4mm - 2px); height:auto; max-height:none; overflow:visible; box-sizing:border-box; font-family:'Bookman Old Style','URW Bookman',serif; font-size:12pt; line-height:1.5; padding:0; margin:0; border:none; }
  </style>
</head>
<body>
  <div id="preview" class="audit-wrap">
    <table class="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed">
      <colgroup><col style="width:28%"><col style="width:24%"><col style="width:24%"><col style="width:24%"></colgroup>
      <tbody>
        <tr id="preview-short-row"><td class="p-2.5 font-bold uppercase align-top text-black font-bookman sop-batang-tubuh-title" style="width:28%">KEBIJAKAN</td><td id="preview-short-cell" colspan="3" class="p-2.5 text-black align-top font-bookman sop-batang-tubuh-content"><div id="preview-short-content" class="font-bookman text-black rich-text-output rich-text-document-content"><p>Baris pendek kebijakan.</p></div></td></tr>
        <tr id="preview-empty-row"><td class="p-2.5 font-bold uppercase align-top text-black font-bookman sop-batang-tubuh-title" style="width:28%"><div>UNIT</div><div>TERKAIT</div></td><td colspan="3" class="p-2.5 text-black align-top font-bookman sop-batang-tubuh-content"><div class="font-bookman text-black rich-text-output rich-text-document-content">-</div></td></tr>
        <tr id="preview-long-row"><td class="p-2.5 font-bold uppercase align-top text-black font-bookman sop-batang-tubuh-title" style="width:28%">PROSEDUR</td><td colspan="3" class="p-2.5 text-black align-top font-bookman sop-batang-tubuh-content"><div class="font-bookman text-black rich-text-output rich-text-document-content"><p>Baris satu teks panjang untuk menguji tinggi canonical yang membungkus secara normal pada lebar batang tubuh dan harus sama di Live serta Preview.</p><p>Baris kedua memastikan ritme paragraf tetap identik.</p></div></td></tr>
        <tr id="preview-table-row"><td class="p-2.5 font-bold uppercase align-top text-black font-bookman sop-batang-tubuh-title" style="width:28%">PROSEDUR</td><td colspan="3" class="p-2.5 text-black align-top font-bookman sop-batang-tubuh-content"><div class="font-bookman text-black rich-text-output rich-text-document-content"><table data-editor-table="true"><tbody><tr><td>A1</td><td>B1</td></tr><tr><td>A2</td><td>B2</td></tr></tbody></table></div></td></tr>
      </tbody>
    </table>
  </div>

  <div id="live" class="audit-wrap">
    <table class="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed">
      <colgroup><col style="width:28%"><col style="width:24%"><col style="width:24%"><col style="width:24%"></colgroup>
      <tbody>
        <tr id="live-short-row"><td class="border border-black p-2.5 font-bold uppercase align-top text-black font-bookman sop-batang-tubuh-title whitespace-normal w-[28%]">KEBIJAKAN</td><td id="live-short-cell" colspan="3" class="border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content w-[72%] bg-white"><div class="relative w-full"><div id="live-short-content" class="rich-text-editor-content p-0 text-slate-900 font-bookman" style="min-height:24px"><p>Baris pendek kebijakan.</p></div></div></td></tr>
        <tr id="live-empty-row"><td class="border border-black p-2.5 font-bold uppercase align-top text-black font-bookman sop-batang-tubuh-title whitespace-normal w-[28%]"><div>UNIT</div><div>TERKAIT</div></td><td colspan="3" class="border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content w-[72%] bg-white"><div class="relative w-full"><div class="rich-text-editor-content p-0 text-slate-900 font-bookman" style="min-height:24px"></div></div></td></tr>
        <tr id="live-long-row"><td class="border border-black p-2.5 font-bold uppercase align-top text-black font-bookman sop-batang-tubuh-title whitespace-normal w-[28%]">PROSEDUR</td><td colspan="3" class="border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content w-[72%] bg-white"><div class="relative w-full"><div class="rich-text-editor-content p-0 text-slate-900 font-bookman" style="min-height:24px"><p>Baris satu teks panjang untuk menguji tinggi canonical yang membungkus secara normal pada lebar batang tubuh dan harus sama di Live serta Preview.</p><p>Baris kedua memastikan ritme paragraf tetap identik.</p></div></div></td></tr>
        <tr id="live-table-row"><td class="border border-black p-2.5 font-bold uppercase align-top text-black font-bookman sop-batang-tubuh-title whitespace-normal w-[28%]">PROSEDUR</td><td colspan="3" class="border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content w-[72%] bg-white"><div class="relative w-full"><div class="rich-text-editor-content p-0 text-slate-900 font-bookman" style="min-height:24px"><table data-editor-table="true"><tbody><tr><td>A1</td><td>B1</td></tr><tr><td>A2</td><td>B2</td></tr></tbody></table></div></div></td></tr>
      </tbody>
    </table>
  </div>

  <div id="measure-short" class="measure-host font-bookman text-black rich-text-output rich-text-document-content"><p>Baris pendek kebijakan.</p></div>
  <div id="measure-long" class="measure-host font-bookman text-black rich-text-output rich-text-document-content"><p>Baris satu teks panjang untuk menguji tinggi canonical yang membungkus secara normal pada lebar batang tubuh dan harus sama di Live serta Preview.</p><p>Baris kedua memastikan ritme paragraf tetap identik.</p></div>
  <div id="measure-table" class="measure-host font-bookman text-black rich-text-output rich-text-document-content"><table data-editor-table="true"><tbody><tr><td>A1</td><td>B1</td></tr><tr><td>A2</td><td>B2</td></tr></tbody></table></div>
</body>
</html>`;

fs.writeFileSync(fixturePath, fixture);
const vite = spawn('npm', ['exec', 'vite', '--', '--host', '127.0.0.1', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
let viteLog = '';
vite.stdout.on('data', (chunk) => { viteLog += chunk.toString(); });
vite.stderr.on('data', (chunk) => { viteLog += chunk.toString(); });

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/${fixturePath}`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not start.\n${viteLog}`);
}

async function chromePath() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return { executablePath: candidate, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  const mod = await import('@sparticuz/chromium');
  const chromium = mod.default || mod;
  return { executablePath: await chromium.executablePath(), args: chromium.args };
}

try {
  await waitForServer();
  const chrome = await chromePath();
  const browser = await puppeteer.launch({ ...chrome, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/${fixturePath}`, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
    const result = await page.evaluate(() => {
      const h = (id) => document.getElementById(id)?.getBoundingClientRect().height || 0;
      const w = (id) => document.getElementById(id)?.getBoundingClientRect().width || 0;
      const chrome = (6 * 96 / 25.4) + 1;
      return {
        previewShort: h('preview-short-row'), liveShort: h('live-short-row'), paginatorShort: Math.max(24, h('measure-short')) + chrome,
        previewEmpty: h('preview-empty-row'), liveEmpty: h('live-empty-row'),
        previewLong: h('preview-long-row'), liveLong: h('live-long-row'), paginatorLong: Math.max(24, h('measure-long')) + chrome,
        previewTable: h('preview-table-row'), liveTable: h('live-table-row'), paginatorTable: Math.max(24, h('measure-table')) + chrome,
        previewContentWidth: w('preview-short-content'), liveContentWidth: w('live-short-content'), measureWidth: w('measure-short'),
        chrome,
      };
    });
    console.log('LIVE_SPO_WYSIWYG_GEOMETRY', JSON.stringify(result, null, 2));
    const comparisons = [
      ['short live/preview', result.liveShort, result.previewShort, 1.1],
      ['short paginator/preview', result.paginatorShort, result.previewShort, 1.1],
      ['empty live/preview', result.liveEmpty, result.previewEmpty, 1.1],
      ['long live/preview', result.liveLong, result.previewLong, 1.1],
      ['long paginator/preview', result.paginatorLong, result.previewLong, 1.1],
      ['table live/preview', result.liveTable, result.previewTable, 1.1],
      ['table paginator/preview', result.paginatorTable, result.previewTable, 1.1],
      ['content width live/preview', result.liveContentWidth, result.previewContentWidth, 1.1],
      ['measure width/preview', result.measureWidth, result.previewContentWidth, 1.1],
    ];
    for (const [label, a, b, tolerance] of comparisons) {
      if (Math.abs(a - b) > tolerance) throw new Error(`${label} mismatch: ${a} vs ${b}`);
    }
  } finally {
    await browser.close();
  }
} finally {
  vite.kill('SIGTERM');
  try { fs.unlinkSync(fixturePath); } catch {}
}
