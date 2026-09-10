import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

async function getChromium() {
  process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
  const mod = await import('@sparticuz/chromium');
  return mod.default || mod;
}

async function run() {
  const chromium = await getChromium();
  const execPath = await chromium.executablePath();
  const rawArgs = Array.isArray(chromium.args) ? chromium.args : [];
  const safeArgs = rawArgs.filter(a => !a.includes('single-process') && !a.includes('in-process-gpu'));
  
  const browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    executablePath: execPath,
    args: safeArgs
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));
  page.on('response', async res => {
    if (res.url().includes('/api/pdf')) {
      console.log('PDF API RESPONSE STATUS:', res.status(), res.statusText());
      const body = await res.text();
      console.log('PDF API RESPONSE BODY:', body.slice(0, 1000));
    }
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  console.log('Page loaded');

  // Let's inspect session in localStorage
  const localStorageData = await page.evaluate(() => {
    return { ...localStorage };
  });
  console.log('LocalStorage keys:', Object.keys(localStorageData));

  // Check if we need to login
  const hasLoginForm = await page.$('input[type="password"]');
  if (hasLoginForm) {
    console.log('Found login form, entering credentials...');
    await page.type('input[type="text"]', 'admin');
    await page.type('input[type="password"]', 'Admin123456');
    await page.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2000));
  }

  // Now we should be logged in. Let's find an SOP row or link to open SopDetailModal
  console.log('Searching for SOP item to click...');
  await new Promise(r => setTimeout(r, 2000));

  // Find any SOP title or view button
  const clicked = await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll('button, tr, div, a'));
    const viewBtn = allButtons.find(b => b.textContent?.includes('Pengamanan') || b.textContent?.includes('SPO') || b.textContent?.includes('Lihat') || b.textContent?.includes('Detail'));
    if (viewBtn) {
      (viewBtn as HTMLElement).click();
      return viewBtn.textContent?.trim().slice(0, 50);
    }
    return null;
  });
  console.log('Clicked element:', clicked);

  await new Promise(r => setTimeout(r, 3000));

  // Now check if SopDetailModal is open and look for Download PDF button
  const downloadBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const pdfBtn = btns.find(b => b.textContent?.toLowerCase().includes('pdf') || b.getAttribute('title')?.toLowerCase().includes('pdf') || b.textContent?.toLowerCase().includes('unduh') || b.textContent?.toLowerCase().includes('download'));
    if (pdfBtn) {
      console.log('Clicking PDF button:', pdfBtn.textContent?.trim());
      (pdfBtn as HTMLElement).click();
      return pdfBtn.textContent?.trim();
    }
    return null;
  });
  console.log('Found and clicked download button:', downloadBtn);

  // Wait for network response
  await new Promise(r => setTimeout(r, 10000));

  await browser.close();
}

run().catch(console.error);
