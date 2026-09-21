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
const results = {};
const failures = [];
const record = (name, ok, detail = undefined) => {
  results[name] = detail === undefined ? Boolean(ok) : { ok: Boolean(ok), detail };
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

async function procedureEditor(page) {
  const handle = await page.evaluateHandle(() => {
    const rows = [...document.querySelectorAll('.sop-live-a4-page tr')];
    const row = rows.find((r) => (r.querySelector('td:first-child')?.textContent || '').trim() === 'PROSEDUR');
    return row?.querySelector('.rich-text-editor-content') || null;
  });
  return handle.asElement();
}

async function selectProcedureRange(page, { collapsedEnd = false } = {}) {
  await page.evaluate(({ collapsedEnd }) => {
    const rows = [...document.querySelectorAll('.sop-live-a4-page tr')];
    const row = rows.find((r) => (r.querySelector('td:first-child')?.textContent || '').trim() === 'PROSEDUR');
    const editor = row?.querySelector('.rich-text-editor-content');
    if (!(editor instanceof HTMLElement)) throw new Error('PROSEDUR editor missing');
    editor.focus();
    const range = document.createRange();
    if (collapsedEnd) {
      range.selectNodeContents(editor);
      range.collapse(false);
    } else {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && (!(node.textContent || '').trim() || node.parentElement?.closest('b,strong'))) node = walker.nextNode();
      if (!node) throw new Error('selectable procedure text missing');
      range.setStart(node, 0);
      range.setEnd(node, Math.min(14, node.textContent?.length || 0));
    }
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, { collapsedEnd });
  await sleep(100);
}

async function clickFirstTableCell(page) {
  const cell = await page.$('.sop-live-a4-page .rich-text-editor-content table td, .sop-live-a4-page .rich-text-editor-content table th');
  if (!cell) throw new Error('table cell missing');
  await cell.click();
  await sleep(100);
}

async function selectImageContext(page) {
  const image = await page.$('.sop-live-a4-page .rich-text-editor-content img');
  if (!image) throw new Error('image missing');
  await image.click();
  await sleep(120);
  await page.click('button[aria-label="Mode Gambar"]');
  await sleep(100);
}

try {
  // TEXT — native history must still work after the 250ms pagination epoch advances.
  {
    const page = await freshPage();
    const marker = 'DELAYUNDO927';
    await selectProcedureRange(page, { collapsedEnd: true });
    await page.keyboard.type(marker);
    await sleep(900);
    const beforeUndo = await page.evaluate((token) => document.body.innerText.includes(token), marker);
    record('delayedTypingPersistsAfterPagination', beforeUndo);
    await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
    await sleep(180);
    const afterUndo = await page.evaluate((token) => !document.body.innerText.includes(token), marker);
    record('delayedCtrlZAfterPagination', afterUndo);
    await page.keyboard.down('Control'); await page.keyboard.press('y'); await page.keyboard.up('Control');
    await sleep(180);
    const afterRedo = await page.evaluate((token) => document.body.innerText.includes(token), marker);
    record('delayedCtrlYAfterPagination', afterRedo);
    await page.close();
  }

  // TEXT — additional shared-toolbar formatting controls.
  {
    const page = await freshPage();
    await selectProcedureRange(page);
    await page.click('button[aria-label="Miring"]');
    await sleep(500);
    record('italicPersists', await page.evaluate(() => Boolean(document.querySelector('.sop-live-a4-page .rich-text-editor-content i, .sop-live-a4-page .rich-text-editor-content em')) || document.queryCommandState('italic')));

    await selectProcedureRange(page);
    await page.click('button[aria-label="Garis bawah"]');
    await sleep(500);
    record('underlinePersists', await page.evaluate(() => Boolean(document.querySelector('.sop-live-a4-page .rich-text-editor-content u')) || document.queryCommandState('underline')));

    await selectProcedureRange(page);
    await page.click('button[aria-label="Rata tengah"]');
    await sleep(500);
    record('centerAlignmentPersists', await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.sop-live-a4-page tr')];
      const row = rows.find((r) => (r.querySelector('td:first-child')?.textContent || '').trim() === 'PROSEDUR');
      const editor = row?.querySelector('.rich-text-editor-content');
      return Boolean(editor?.querySelector('[style*="text-align: center"], [align="center"]'));
    }));

    await selectProcedureRange(page);
    await page.click('button[aria-label="Bullet"]');
    await sleep(500);
    record('bulletPersists', await page.evaluate(() => Boolean(document.querySelector('.sop-live-a4-page .rich-text-editor-content ul'))));
    await page.close();
  }

  // TABLE — exercise structural add/delete/merge/split/alignment/delete flows across repagination.
  {
    const page = await freshPage();
    await selectProcedureRange(page, { collapsedEnd: true });
    await page.click('button[aria-label="Sisipkan Tabel"]');
    const option2x2 = await page.$('.insert-menu-popover button');
    if (!option2x2) throw new Error('2x2 table option missing');
    await option2x2.click();
    await sleep(650);
    await clickFirstTableCell(page);
    await page.click('button[aria-label="Mode Tabel"]');
    await sleep(80);

    const initial = await page.evaluate(() => {
      const table = document.querySelector('.sop-live-a4-page .rich-text-editor-content table');
      return { rows: table?.rows.length || 0, cols: table?.rows[0]?.cells.length || 0 };
    });

    await page.click('button[aria-label="Tambah Kolom"]');
    await sleep(550);
    const afterAddCol = await page.evaluate(() => document.querySelector('.sop-live-a4-page .rich-text-editor-content table')?.rows[0]?.cells.length || 0);
    record('tableAddColumnPersists', afterAddCol === initial.cols + 1, { initial: initial.cols, afterAddCol });

    await clickFirstTableCell(page);
    await page.click('button[aria-label="Hapus Kolom"]');
    await sleep(550);
    const afterDeleteCol = await page.evaluate(() => document.querySelector('.sop-live-a4-page .rich-text-editor-content table')?.rows[0]?.cells.length || 0);
    record('tableDeleteColumnPersists', afterDeleteCol === initial.cols, { initial: initial.cols, afterDeleteCol });

    await clickFirstTableCell(page);
    await page.click('button[aria-label="Tambah Baris"]');
    await sleep(550);
    const afterAddRow = await page.evaluate(() => document.querySelector('.sop-live-a4-page .rich-text-editor-content table')?.rows.length || 0);
    record('tableAddRowExtendedPersists', afterAddRow === initial.rows + 1, { initial: initial.rows, afterAddRow });

    await clickFirstTableCell(page);
    await page.click('button[aria-label="Hapus Baris"]');
    await sleep(550);
    const afterDeleteRow = await page.evaluate(() => document.querySelector('.sop-live-a4-page .rich-text-editor-content table')?.rows.length || 0);
    record('tableDeleteRowPersists', afterDeleteRow === initial.rows, { initial: initial.rows, afterDeleteRow });

    await clickFirstTableCell(page);
    const merge = await page.$('button[aria-label="Gabung Sel"]');
    const mergeEnabled = merge ? await page.evaluate((el) => !el.hasAttribute('disabled'), merge) : false;
    record('tableMergeEnabled', mergeEnabled);
    if (merge && mergeEnabled) await merge.click();
    await sleep(550);
    const merged = await page.evaluate(() => (document.querySelector('.sop-live-a4-page .rich-text-editor-content table td')?.colSpan || 1) > 1);
    record('tableMergePersists', merged);

    const firstMerged = await page.$('.sop-live-a4-page .rich-text-editor-content table td');
    if (firstMerged) await firstMerged.click();
    await sleep(100);
    const split = await page.$('button[aria-label="Pisahkan Sel"]');
    const splitEnabled = split ? await page.evaluate((el) => !el.hasAttribute('disabled'), split) : false;
    record('tableSplitEnabled', splitEnabled);
    if (split && splitEnabled) await split.click();
    await sleep(550);
    const splitDone = await page.evaluate(() => (document.querySelector('.sop-live-a4-page .rich-text-editor-content table td')?.colSpan || 1) === 1);
    record('tableSplitPersists', splitDone);

    await clickFirstTableCell(page);
    await page.click('button[aria-label="Posisi Tabel"]');
    await sleep(80);
    const center = await page.$('button[aria-label="Posisi tengah"]');
    if (center) await center.click();
    await sleep(550);
    const tableCentered = await page.evaluate(() => document.querySelector('.sop-live-a4-page .rich-text-editor-content table')?.getAttribute('data-align') === 'center');
    record('tableAlignmentPersists', tableCentered);

    await clickFirstTableCell(page);
    await page.click('button[aria-label="Hapus Tabel"]');
    await sleep(550);
    const deleted = await page.evaluate(() => !document.querySelector('.sop-live-a4-page .rich-text-editor-content table'));
    record('tableDeletePersists', deleted);
    await page.close();
  }

  // IMAGE — object tools after canonical repagination/rehydration.
  {
    const page = await freshPage();
    await selectProcedureRange(page, { collapsedEnd: true });
    const input = await page.$('.live-spo-context-toolbar input[type=file]');
    if (!input) throw new Error('image input missing');
    await input.uploadFile('/tmp/toolbar-audit.png');
    await sleep(900);
    await selectImageContext(page);

    await page.click('button[aria-label="Lebar gambar 50%"]');
    await sleep(550);
    record('imageWidth50Persists', await page.evaluate(() => {
      const source = window.__auditState?.prosedur || '';
      return /data-width=["']50%["']/.test(source) && document.querySelectorAll('.sop-live-a4-page .rich-text-editor-content img').length === 1;
    }));

    await selectImageContext(page);
    await page.click('button[aria-label="Posisi gambar kiri"]');
    await sleep(550);
    record('imageAlignLeftPersists', await page.evaluate(() => {
      const source = window.__auditState?.prosedur || '';
      return /data-align=["']left["']/.test(source);
    }));

    await selectImageContext(page);
    await page.click('button[aria-label="Bungkus Teks pada Gambar"]');
    await sleep(550);
    record('imageWrapSquarePersists', await page.evaluate(() => /data-wrap=["']square["']/.test(window.__auditState?.prosedur || '')));

    await selectImageContext(page);
    await page.click('button[aria-label="Atur Ulang Gambar"]');
    await sleep(550);
    record('imageResetPersists', await page.evaluate(() => {
      const source = window.__auditState?.prosedur || '';
      return /data-width=["']75%["']/.test(source) && /data-wrap=["']top-bottom["']/.test(source) && /data-align=["']center["']/.test(source);
    }));

    await selectImageContext(page);
    await page.click('button[aria-label="Hapus Gambar"]');
    await sleep(650);
    record('imageDeletePersists', await page.evaluate(() => {
      const source = window.__auditState?.prosedur || '';
      return !/<img\b/i.test(source) && document.querySelectorAll('.sop-live-a4-page .rich-text-editor-content img').length === 0;
    }));
    await page.close();
  }

  console.log('TOOLBAR_EXTENDED_RESULT', JSON.stringify(results, null, 2));
  console.log('TOOLBAR_EXTENDED_FAILURES', JSON.stringify(failures));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
