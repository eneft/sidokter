import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
let executablePath = candidates.find((candidate) => fs.existsSync(candidate));
let args = ['--no-sandbox', '--disable-setuid-sandbox'];
if (!executablePath) {
  const mod = await import('@sparticuz/chromium');
  const chromium = mod.default || mod;
  executablePath = await chromium.executablePath();
  args = chromium.args || args;
}
if (!executablePath) throw new Error('Chromium not found');

const browser = await puppeteer.launch({ executablePath, args, headless: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const results = {};

const record = (name, ok, detail) => {
  results[name] = { ok: Boolean(ok), detail };
  if (!ok) failures.push(name);
};

async function freshPage() {
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('BROWSER', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR', String(err)));
  await page.goto('http://127.0.0.1:4177/toolbar-audit.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelectorAll('.sop-live-a4-page').length >= 3, { timeout: 15000 });
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  return page;
}

async function placeProcedureCaretAtEnd(page) {
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.sop-live-a4-page tr')];
    const row = rows.find((r) => (r.querySelector('td:first-child')?.textContent || '').trim() === 'PROSEDUR');
    const editor = row?.querySelector('.rich-text-editor-content');
    if (!(editor instanceof HTMLElement)) throw new Error('PROSEDUR editor missing');
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await sleep(100);
}

try {
  // Image must exist exactly once in authoritative section data and once in the rendered pages.
  {
    const page = await freshPage();
    await placeProcedureCaretAtEnd(page);
    const input = await page.$('.live-spo-context-toolbar input[type=file]');
    if (!input) throw new Error('image input missing');
    await input.uploadFile('/tmp/toolbar-audit.png');
    await sleep(180);
    const immediate = await page.evaluate(() => ({
      sourceImages: (window.__auditState?.prosedur?.match(/<img\b/gi) || []).length,
      domImages: document.querySelectorAll('.sop-live-a4-page .rich-text-editor-content img').length,
    }));
    record('imageSingleImmediately', immediate.sourceImages === 1 && immediate.domImages === 1, immediate);

    await sleep(2200);
    const settled = await page.evaluate(() => ({
      sourceImages: (window.__auditState?.prosedur?.match(/<img\b/gi) || []).length,
      sourceFigures: (window.__auditState?.prosedur?.match(/<figure\b/gi) || []).length,
      domImages: document.querySelectorAll('.sop-live-a4-page .rich-text-editor-content img').length,
      selectedFigures: document.querySelectorAll('.sop-live-a4-page .figure-selected').length,
    }));
    record('imageSingleAfterRepagination', settled.sourceImages === 1 && settled.domImages === 1, settled);

    const img = await page.$('.sop-live-a4-page .rich-text-editor-content img');
    if (img) await img.click();
    await sleep(100);
    await page.click('button[aria-label="Mode Gambar"]');
    await sleep(80);
    const widthButton = await page.$('button[aria-label="Lebar gambar 25%"]');
    const enabled = widthButton ? await page.evaluate((el) => !el.hasAttribute('disabled'), widthButton) : false;
    record('imageContextSettled', enabled, { enabled });
    if (widthButton && enabled) await widthButton.click();
    await sleep(180);
    const widthImmediate = await page.evaluate(() => ({
      source25: /data-width=["']25%["']/.test(window.__auditState?.prosedur || ''),
      dom25: [...document.querySelectorAll('.sop-live-a4-page .rich-text-editor-content figure')].some((el) => el.getAttribute('data-width') === '25%'),
    }));
    record('imageWidth25Immediately', widthImmediate.source25 && widthImmediate.dom25, widthImmediate);
    await sleep(2200);
    const widthSettled = await page.evaluate(() => ({
      sourceImages: (window.__auditState?.prosedur?.match(/<img\b/gi) || []).length,
      source25: /data-width=["']25%["']/.test(window.__auditState?.prosedur || ''),
      domImages: document.querySelectorAll('.sop-live-a4-page .rich-text-editor-content img').length,
      dom25: [...document.querySelectorAll('.sop-live-a4-page .rich-text-editor-content figure')].some((el) => el.getAttribute('data-width') === '25%'),
    }));
    record('imageWidth25AfterRepagination', widthSettled.sourceImages === 1 && widthSettled.domImages === 1 && widthSettled.source25 && widthSettled.dom25, widthSettled);
    await page.close();
  }

  // A single inserted semantic table must remain one table in authoritative data.
  // Rendered table fragments may be >1 because canonical pagination can split rows safely.
  {
    const page = await freshPage();
    await placeProcedureCaretAtEnd(page);
    await page.click('button[aria-label="Sisipkan Tabel"]');
    await page.click('.insert-menu-popover button');
    await sleep(180);
    const immediate = await page.evaluate(() => ({
      sourceTables: (window.__auditState?.prosedur?.match(/<table\b/gi) || []).length,
      sourceRows: (window.__auditState?.prosedur?.match(/<tr\b/gi) || []).length,
      domTables: document.querySelectorAll('.sop-live-a4-page .rich-text-editor-content table').length,
    }));
    record('tableSingleInSourceImmediately', immediate.sourceTables === 1, immediate);
    await sleep(2200);
    const settled = await page.evaluate(() => ({
      sourceTables: (window.__auditState?.prosedur?.match(/<table\b/gi) || []).length,
      sourceRows: (window.__auditState?.prosedur?.match(/<tr\b/gi) || []).length,
      domTables: document.querySelectorAll('.sop-live-a4-page .rich-text-editor-content table').length,
    }));
    record('tableSingleInSourceAfterRepagination', settled.sourceTables === 1, settled);
    await page.close();
  }

  console.log('TOOLBAR_INTEGRITY_RESULT', JSON.stringify(results, null, 2));
  console.log('TOOLBAR_INTEGRITY_FAILURES', JSON.stringify(failures));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
