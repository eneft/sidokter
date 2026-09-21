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

async function freshPage() {
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('BROWSER', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR', String(err)));
  await page.goto('http://127.0.0.1:4177/toolbar-audit.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelectorAll('.sop-live-a4-page').length >= 3, { timeout: 15000 });
  return page;
}

async function selectProcedureEnd(page) {
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.sop-live-a4-page tr')];
    const row = rows.find((r) => (r.querySelector('td:first-child')?.textContent || '').trim() === 'PROSEDUR');
    const editor = row?.querySelector('.rich-text-editor-content');
    if (!(editor instanceof HTMLElement)) throw new Error('PROSEDUR editor missing');
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await sleep(100);
}

async function insertTable(page) {
  await selectProcedureEnd(page);
  await page.click('button[aria-label="Sisipkan Tabel"]');
  const option = await page.$('.insert-menu-popover button');
  if (!option) throw new Error('table option missing');
  await option.click();
  await sleep(700);
}

async function clickFirstCell(page) {
  const cell = await page.$('.sop-live-a4-page .rich-text-editor-content table td, .sop-live-a4-page .rich-text-editor-content table th');
  if (!cell) throw new Error('table cell missing');
  await cell.click();
  await sleep(140);
}

async function tableSnapshot(page, label) {
  const data = await page.evaluate((label) => {
    const allTables = [...document.querySelectorAll('.sop-live-a4-page .rich-text-editor-content table')];
    const table = allTables[0];
    const cell = table?.querySelector('td,th');
    const editor = cell?.closest('.rich-text-editor-content');
    const pageEl = editor?.closest('.sop-live-a4-page');
    const sel = getSelection();
    const anchor = sel?.anchorNode;
    const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement;
    const anchorCell = anchorEl?.closest('td,th');
    const anchorEditor = anchorEl?.closest('.rich-text-editor-content');
    const active = document.activeElement;
    const activeEditor = active instanceof Element ? active.closest('.rich-text-editor-content') : null;
    const sourceHolder = document.createElement('div');
    sourceHolder.innerHTML = window.__auditState?.prosedur || '';
    const sourceTable = sourceHolder.querySelector('table');
    const buttonState = (name) => {
      const button = document.querySelector(`button[aria-label="${name}"]`);
      return button ? { disabled: button.hasAttribute('disabled'), pressed: button.getAttribute('aria-pressed') } : null;
    };
    return {
      label,
      domTables: allTables.length,
      domRows: table?.rows.length || 0,
      domCols: table?.rows[0]?.cells.length || 0,
      domAlign: table?.getAttribute('data-align') || table?.dataset?.align || null,
      sourceTables: sourceHolder.querySelectorAll('table').length,
      sourceRows: sourceTable?.rows.length || 0,
      sourceCols: sourceTable?.rows[0]?.cells.length || 0,
      sourceAlign: sourceTable?.getAttribute('data-align') || sourceTable?.dataset?.align || null,
      cellPage: pageEl?.getAttribute('data-page-index') || null,
      anchorInCell: Boolean(anchorCell),
      anchorPage: anchorEditor?.closest('.sop-live-a4-page')?.getAttribute('data-page-index') || null,
      activeIsEditor: Boolean(active instanceof HTMLElement && active.classList.contains('rich-text-editor-content')),
      activePage: activeEditor?.closest('.sop-live-a4-page')?.getAttribute('data-page-index') || null,
      addRow: buttonState('Tambah Baris'),
      deleteRow: buttonState('Hapus Baris'),
      addCol: buttonState('Tambah Kolom'),
      deleteCol: buttonState('Hapus Kolom'),
      deleteTable: buttonState('Hapus Tabel'),
    };
  }, label);
  console.log('TABLE_DIAG', JSON.stringify(data));
  return data;
}

async function selectImage(page) {
  const img = await page.$('.sop-live-a4-page .rich-text-editor-content img');
  if (!img) throw new Error('image missing');
  await img.click();
  await sleep(140);
  await page.click('button[aria-label="Mode Gambar"]');
  await sleep(80);
}

async function imageSnapshot(page, label) {
  const data = await page.evaluate((label) => {
    const figure = document.querySelector('.sop-live-a4-page .rich-text-editor-content .figure-wrapper, .sop-live-a4-page .rich-text-editor-content figure');
    const holder = document.createElement('div');
    holder.innerHTML = window.__auditState?.prosedur || '';
    const sourceFigure = holder.querySelector('.figure-wrapper, figure');
    return {
      label,
      domImages: document.querySelectorAll('.sop-live-a4-page .rich-text-editor-content img').length,
      domWidth: figure?.getAttribute('data-width') || null,
      domWrap: figure?.getAttribute('data-wrap') || null,
      domAlign: figure?.getAttribute('data-align') || null,
      sourceWidth: sourceFigure?.getAttribute('data-width') || null,
      sourceWrap: sourceFigure?.getAttribute('data-wrap') || null,
      sourceAlign: sourceFigure?.getAttribute('data-align') || null,
      sourceHtmlHasImg: /<img\b/i.test(window.__auditState?.prosedur || ''),
    };
  }, label);
  console.log('IMAGE_RESET_DIAG', JSON.stringify(data));
  return data;
}

try {
  // UNDO DIAGNOSTIC: prove whether canonical repagination rewrites/remounts the active editor.
  {
    const page = await freshPage();
    await selectProcedureEnd(page);
    await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.classList.contains('rich-text-editor-content')) throw new Error('active editor missing');
      window.__undoEditor = active;
      window.__innerHtmlWrites = [];
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      if (!descriptor?.get || !descriptor?.set || !descriptor.configurable) throw new Error('innerHTML descriptor unavailable');
      window.__innerHtmlDescriptor = descriptor;
      Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value) {
          if (this instanceof HTMLElement && this.classList.contains('rich-text-editor-content')) {
            window.__innerHtmlWrites.push({ at: performance.now(), length: String(value ?? '').length, page: this.closest('.sop-live-a4-page')?.getAttribute('data-page-index') || null });
          }
          return descriptor.set.call(this, value);
        },
      });
    });
    const marker = 'UNDO_EPOCH_DIAG_731';
    await page.keyboard.type(marker);
    await sleep(80);
    const immediate = await page.evaluate((marker) => {
      const oldEditor = window.__undoEditor;
      const editor = [...document.querySelectorAll('.rich-text-editor-content')].find((el) => el.textContent?.includes(marker));
      return {
        markerInDom: document.body.innerText.includes(marker),
        markerInSource: (window.__auditState?.prosedur || '').includes(marker),
        sameEditorNode: editor === oldEditor,
        innerHtmlWrites: window.__innerHtmlWrites.slice(),
        queryUndoEnabled: document.queryCommandEnabled?.('undo') ?? null,
      };
    }, marker);
    console.log('UNDO_DIAG_IMMEDIATE', JSON.stringify(immediate));
    await sleep(900);
    const settled = await page.evaluate((marker) => {
      const oldEditor = window.__undoEditor;
      const editor = [...document.querySelectorAll('.rich-text-editor-content')].find((el) => el.textContent?.includes(marker));
      const sel = getSelection();
      const anchor = sel?.anchorNode;
      const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement;
      return {
        markerInDom: document.body.innerText.includes(marker),
        markerInSource: (window.__auditState?.prosedur || '').includes(marker),
        sameEditorNode: editor === oldEditor,
        activeIsSameEditor: document.activeElement === oldEditor,
        selectionInSameEditor: Boolean(anchorEl && oldEditor?.contains(anchorEl)),
        innerHtmlWrites: window.__innerHtmlWrites.slice(),
        queryUndoEnabled: document.queryCommandEnabled?.('undo') ?? null,
      };
    }, marker);
    console.log('UNDO_DIAG_SETTLED', JSON.stringify(settled));
    await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
    await sleep(180);
    const afterUndo = await page.evaluate((marker) => ({
      markerInDom: document.body.innerText.includes(marker),
      markerInSource: (window.__auditState?.prosedur || '').includes(marker),
      writes: window.__innerHtmlWrites.slice(),
      queryRedoEnabled: document.queryCommandEnabled?.('redo') ?? null,
    }), marker);
    console.log('UNDO_DIAG_AFTER_CTRL_Z', JSON.stringify(afterUndo));
    await page.evaluate(() => {
      const descriptor = window.__innerHtmlDescriptor;
      if (descriptor) Object.defineProperty(Element.prototype, 'innerHTML', descriptor);
    });
    await page.close();
  }

  // TABLE DIAGNOSTIC: observe exact owner/selection after canonical repagination.
  {
    const page = await freshPage();
    await insertTable(page);
    await clickFirstCell(page);
    await page.click('button[aria-label="Mode Tabel"]');
    await sleep(100);
    await tableSnapshot(page, 'before-add-column');
    await page.click('button[aria-label="Tambah Kolom"]');
    await sleep(700);
    await tableSnapshot(page, 'after-add-column-settled');
    await clickFirstCell(page);
    await tableSnapshot(page, 'after-reclick-before-delete-column');
    await page.click('button[aria-label="Hapus Kolom"]');
    await sleep(120);
    await tableSnapshot(page, 'after-delete-column-immediate');
    await sleep(600);
    await tableSnapshot(page, 'after-delete-column-settled');
    await clickFirstCell(page);
    await tableSnapshot(page, 'after-reclick-before-add-row');
    await page.click('button[aria-label="Tambah Baris"]');
    await sleep(700);
    await tableSnapshot(page, 'after-add-row-settled');
    await clickFirstCell(page);
    await page.click('button[aria-label="Posisi Tabel"]');
    await sleep(80);
    const center = await page.$('button[aria-label="Posisi tengah"]');
    if (center) await center.click();
    await sleep(700);
    await tableSnapshot(page, 'after-align-center-settled');
    await clickFirstCell(page);
    await page.click('button[aria-label="Hapus Tabel"]');
    await sleep(700);
    await tableSnapshot(page, 'after-delete-table-settled');
    await page.close();
  }

  // IMAGE RESET DIAGNOSTIC: capture the stale-width overwrite sequence.
  {
    const page = await freshPage();
    await selectProcedureEnd(page);
    const input = await page.$('.live-spo-context-toolbar input[type=file]');
    if (!input) throw new Error('image input missing');
    await input.uploadFile('/tmp/toolbar-audit.png');
    await sleep(900);
    await selectImage(page);
    await page.click('button[aria-label="Lebar gambar 50%"]');
    await sleep(650);
    await selectImage(page);
    await page.click('button[aria-label="Posisi gambar kiri"]');
    await sleep(650);
    await selectImage(page);
    await page.click('button[aria-label="Bungkus Teks pada Gambar"]');
    await sleep(650);
    await selectImage(page);
    await imageSnapshot(page, 'before-reset');
    await page.click('button[aria-label="Atur Ulang Gambar"]');
    await sleep(80);
    await imageSnapshot(page, 'after-reset-immediate');
    await sleep(650);
    await imageSnapshot(page, 'after-reset-settled');
    await page.close();
  }
} finally {
  await browser.close();
}
