import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
let executablePath = candidates.find((candidate) => fs.existsSync(candidate));
let args = ['--no-sandbox', '--disable-setuid-sandbox'];
if (!executablePath) { const mod = await import('@sparticuz/chromium'); const chromium = mod.default || mod; executablePath = await chromium.executablePath(); args = chromium.args || args; }
const browser = await puppeteer.launch({ executablePath, args, headless: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  page.on('console', m => console.log('BROWSER', m.type(), m.text()));
  await page.goto('http://127.0.0.1:4177/toolbar-audit.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelectorAll('.sop-live-a4-page').length >= 3, { timeout: 15000 });
  await page.evaluate(() => {
    window.__imageEventDebug = [];
    document.addEventListener('pointerdown', (e) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.tagName === 'IMG') window.__imageEventDebug.push({ type: 'pointerdown', cls: target.className, parent: target.parentElement?.className || target.parentElement?.tagName });
    }, true);
    document.addEventListener('click', (e) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.tagName === 'IMG') window.__imageEventDebug.push({ type: 'click', cls: target.className, parent: target.parentElement?.className || target.parentElement?.tagName });
    }, true);
    const rows = [...document.querySelectorAll('.sop-live-a4-page tr')];
    const row = rows.find(r => (r.querySelector('td:first-child')?.textContent || '').trim() === 'PROSEDUR');
    const ed = row?.querySelector('.rich-text-editor-content');
    if (!(ed instanceof HTMLElement)) throw new Error('editor missing');
    ed.focus(); const range = document.createRange(); range.selectNodeContents(ed); range.collapse(false); const s = getSelection(); s?.removeAllRanges(); s?.addRange(range); document.dispatchEvent(new Event('selectionchange'));
  });
  const input = await page.$('.live-spo-context-toolbar input[type=file]');
  if (!input) throw new Error('file input missing');
  await input.uploadFile('/tmp/toolbar-audit.png');
  await sleep(2200);
  const images = await page.$$('.sop-live-a4-page .rich-text-editor-content img');
  console.log('IMAGE_COUNT_BEFORE_CLICK', images.length);
  console.log('IMAGE_DOM_BEFORE_CLICK', await page.evaluate(() => {
    const img = document.querySelector('.sop-live-a4-page .rich-text-editor-content img');
    if (!(img instanceof HTMLElement)) return null;
    const chain = [];
    let el = img;
    for (let i = 0; el && i < 6; i += 1, el = el.parentElement) {
      chain.push({ tag: el.tagName, cls: el.className, width: el.getAttribute('data-width'), wrap: el.getAttribute('data-wrap'), ce: el.getAttribute('contenteditable') });
    }
    return { chain, source: window.__auditState?.prosedur?.slice(-1400) || '' };
  }));
  if (!images[0]) throw new Error('inserted image missing');
  await images[0].click();
  await sleep(120);
  console.log('AFTER_IMAGE_CLICK', await page.evaluate(() => ({
    events: window.__imageEventDebug,
    selectedFigures: document.querySelectorAll('.rich-text-editor-content .figure-selected').length,
    selectedFigureData: [...document.querySelectorAll('.rich-text-editor-content .figure-selected')].map(el => ({ width: el.getAttribute('data-width'), wrap: el.getAttribute('data-wrap') })),
    wrappers: document.querySelectorAll('.rich-text-editor-content .figure-wrapper').length,
    activeElement: document.activeElement?.className || document.activeElement?.tagName,
    textModePressed: document.querySelector('button[aria-label="Mode Teks"]')?.getAttribute('aria-pressed'),
  })));
  await page.click('button[aria-label="Mode Gambar"]');
  await sleep(100);
  console.log('AFTER_MODE_IMAGE', await page.evaluate(() => ({
    selectedFigures: document.querySelectorAll('.rich-text-editor-content .figure-selected').length,
    width25Disabled: document.querySelector('button[aria-label="Lebar gambar 25%"]')?.hasAttribute('disabled'),
    width50Disabled: document.querySelector('button[aria-label="Lebar gambar 50%"]')?.hasAttribute('disabled'),
  })));
} finally { await browser.close(); }
