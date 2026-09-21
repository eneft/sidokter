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
const results = {};
const failures = [];

const record = (name, value, detail = undefined) => {
  results[name] = detail === undefined ? Boolean(value) : { ok: Boolean(value), detail };
  if (!value) failures.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freshPage() {
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('BROWSER', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR', String(err)));
  await page.goto('http://127.0.0.1:4177/toolbar-audit.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelectorAll('.sop-live-a4-page').length >= 3, { timeout: 15000 });
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  return page;
}

async function selectProcedureText(page, { nonBold = true, collapsedEnd = false } = {}) {
  await page.evaluate(({ nonBold, collapsedEnd }) => {
    const rows = [...document.querySelectorAll('.sop-live-a4-page tr')];
    const row = rows.find(r => (r.querySelector('td:first-child')?.textContent || '').trim() === 'PROSEDUR');
    const ed = row?.querySelector('.rich-text-editor-content');
    if (!(ed instanceof HTMLElement)) throw new Error('PROSEDUR editor not found');
    ed.focus();
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n = walker.nextNode();
    while (n) { if ((n.textContent || '').trim()) nodes.push(n); n = walker.nextNode(); }
    let node = nodes.find((textNode) => {
      if (!nonBold) return true;
      const parent = textNode.parentElement;
      return !parent?.closest('strong,b,[style*="font-weight"]');
    }) || nodes[0];
    if (!node) throw new Error('No selectable text node');
    const range = document.createRange();
    if (collapsedEnd) {
      range.selectNodeContents(ed); range.collapse(false);
    } else {
      const len = node.textContent?.length || 0;
      range.setStart(node, 0); range.setEnd(node, Math.min(12, len));
    }
    const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, { nonBold, collapsedEnd });
  await sleep(100);
}

try {
  // SESSION 1 — section selector + toolbar mode switch.
  {
    const page = await freshPage();
    await page.select('.live-spo-context-toolbar select', 'prosedur');
    await sleep(100);
    const selectorFocus = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active instanceof HTMLElement && active.classList.contains('rich-text-editor-content') && active.closest('tr')?.querySelector('td:first-child')?.textContent?.trim() === 'PROSEDUR');
    });
    record('sectionSelectorFocusesProcedure', selectorFocus);
    await page.click('button[aria-label="Mode Tabel"]');
    record('tableModeSwitch', Boolean(await page.$('button[aria-label="Tambah Baris"]')));
    await page.click('button[aria-label="Mode Gambar"]');
    record('imageModeSwitch', Boolean(await page.$('button[aria-label="Lebar gambar 25%"]')));
    await page.close();
  }

  // SESSION 2 — text formatting + keyboard/toolbar history.
  {
    const page = await freshPage();
    await selectProcedureText(page, { nonBold: true });
    await page.click('button[aria-label="Tebal"]');
    const boldImmediate = await page.evaluate(() => {
      const sel = getSelection(); const node = sel?.anchorNode; const el = node instanceof Element ? node : node?.parentElement;
      return Boolean(el?.closest('b,strong,[style*="font-weight"]')) || document.queryCommandState('bold');
    });
    await sleep(450);
    const boldLater = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.sop-live-a4-page tr')];
      const row = rows.find(r => (r.querySelector('td:first-child')?.textContent || '').trim() === 'PROSEDUR');
      return Boolean(row?.querySelector('.rich-text-editor-content b, .rich-text-editor-content strong'));
    });
    record('boldImmediate', boldImmediate);
    record('boldPersistsAfterDebounce', boldLater);

    await selectProcedureText(page, { nonBold: true });
    const fontSelect = await page.$('.live-spo-context-toolbar select[aria-label="Ukuran huruf"]');
    if (fontSelect) {
      await fontSelect.click();
      await page.select('.live-spo-context-toolbar select[aria-label="Ukuran huruf"]', '10pt');
    }
    await sleep(80);
    const fontImmediate = await page.evaluate(() => Boolean(document.querySelector('.sop-live-a4-page .rich-text-editor-content [style*="font-size: 10pt"]')));
    await sleep(450);
    const fontLater = await page.evaluate(() => Boolean(document.querySelector('.sop-live-a4-page .rich-text-editor-content [style*="font-size: 10pt"]')));
    record('fontSizeImmediate', fontImmediate);
    record('fontSizePersistsAfterDebounce', fontLater);

    // Fresh caret, one-character transaction for deterministic native undo.
    await selectProcedureText(page, { collapsedEnd: true });
    await page.keyboard.type('Z');
    await sleep(80);
    const typed = await page.evaluate(() => document.body.innerText.includes('Z'));
    record('typingSingleChar', typed);
    await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
    await sleep(120);
    const ctrlZ = await page.evaluate(() => !document.body.innerText.includes('Z'));
    record('ctrlZSingleChar', ctrlZ);
    await page.keyboard.down('Control'); await page.keyboard.press('y'); await page.keyboard.up('Control');
    await sleep(120);
    const ctrlY = await page.evaluate(() => document.body.innerText.includes('Z'));
    record('ctrlYSingleChar', ctrlY);

    await page.click('button[aria-label="Batalkan"]');
    await sleep(120);
    const toolbarUndo = await page.evaluate(() => !document.body.innerText.includes('Z'));
    record('toolbarUndoSingleChar', toolbarUndo);
    await page.click('button[aria-label="Ulangi"]');
    await sleep(120);
    const toolbarRedo = await page.evaluate(() => document.body.innerText.includes('Z'));
    record('toolbarRedoSingleChar', toolbarRedo);
    await page.close();
  }

  // SESSION 3 — insert table and table command bridge, fresh page.
  {
    const page = await freshPage();
    await selectProcedureText(page, { collapsedEnd: true });
    await page.click('button[aria-label="Sisipkan Tabel"]');
    await page.click('.insert-menu-popover button');
    await sleep(60);
    const immediateTableCount = await page.$$eval('.sop-live-a4-page .rich-text-editor-content table', els => els.length);
    record('insertTableImmediate', immediateTableCount > 0, { count: immediateTableCount });
    await sleep(450);
    const laterTableCount = await page.$$eval('.sop-live-a4-page .rich-text-editor-content table', els => els.length);
    record('insertTablePersists', laterTableCount > 0, { count: laterTableCount });
    const cell = await page.$('.sop-live-a4-page .rich-text-editor-content table td');
    if (cell) await cell.click();
    await sleep(100);
    await page.click('button[aria-label="Mode Tabel"]');
    await sleep(100);
    const tableEnabled = await page.evaluate(() => {
      const b = document.querySelector('button[aria-label="Tambah Baris"]');
      return Boolean(b && !b.hasAttribute('disabled'));
    });
    record('tableContextEnablesCommands', tableEnabled);
    const before = await page.$$eval('.sop-live-a4-page .rich-text-editor-content table tr', els => els.length);
    const addRow = await page.$('button[aria-label="Tambah Baris"]'); if (addRow && tableEnabled) await addRow.click();
    await sleep(80);
    const afterImmediate = await page.$$eval('.sop-live-a4-page .rich-text-editor-content table tr', els => els.length);
    await sleep(450);
    const afterLater = await page.$$eval('.sop-live-a4-page .rich-text-editor-content table tr', els => els.length);
    record('tableAddRowImmediate', afterImmediate > before, { before, afterImmediate });
    record('tableAddRowPersists', afterLater > before, { before, afterLater });
    await page.close();
  }

  // SESSION 4 — image insertion/object context, fresh page.
  {
    const page = await freshPage();
    await selectProcedureText(page, { collapsedEnd: true });
    const input = await page.$('.live-spo-context-toolbar input[type=file]');
    if (input) await input.uploadFile('/tmp/toolbar-audit.png');
    await sleep(120);
    const immediateImageCount = await page.$$eval('.sop-live-a4-page .rich-text-editor-content img', els => els.length);
    record('insertImageImmediate', immediateImageCount > 0, { count: immediateImageCount });
    await sleep(600);
    const laterImageCount = await page.$$eval('.sop-live-a4-page .rich-text-editor-content img', els => els.length);
    record('insertImagePersists', laterImageCount > 0, { count: laterImageCount });
    const img = await page.$('.sop-live-a4-page .rich-text-editor-content img'); if (img) await img.click();
    await sleep(150);
    await page.click('button[aria-label="Mode Gambar"]');
    await sleep(100);
    const imageEnabled = await page.evaluate(() => {
      const b = document.querySelector('button[aria-label="Lebar gambar 25%"]'); return Boolean(b && !b.hasAttribute('disabled'));
    });
    record('imageContextEnablesCommands', imageEnabled);
    const width25 = await page.$('button[aria-label="Lebar gambar 25%"]'); if (width25 && imageEnabled) await width25.click();
    await sleep(100);
    const widthImmediate = await page.evaluate(() => document.querySelector('.sop-live-a4-page .rich-text-editor-content figure')?.getAttribute('data-width') === '25%');
    await sleep(450);
    const widthLater = await page.evaluate(() => document.querySelector('.sop-live-a4-page .rich-text-editor-content figure')?.getAttribute('data-width') === '25%');
    record('imageWidthImmediate', widthImmediate);
    record('imageWidthPersists', widthLater);
    await page.close();
  }

  console.log('ISOLATED_TOOLBAR_AUDIT_RESULT', JSON.stringify(results, null, 2));
  console.log('ISOLATED_TOOLBAR_AUDIT_FAILURES', JSON.stringify(failures));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
