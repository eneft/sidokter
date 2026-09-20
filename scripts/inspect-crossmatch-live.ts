import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

async function getChromium() {
  process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
  const mod = await import('@sparticuz/chromium');
  return mod.default || mod;
}

async function run() {
  const db = JSON.parse(fs.readFileSync('data/auth_db.json', 'utf-8'));
  const firstSession = Object.values(db.sessions)[0] as any;

  const chromium: any = await getChromium();
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
  await page.setViewport({ width: 1440, height: 900 });
  
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.evaluate((sess) => {
    localStorage.setItem('soegiri_auth_session', JSON.stringify(sess));
    localStorage.setItem('soegiri_user', JSON.stringify({
      id: sess.authUid,
      username: sess.username || 'admin',
      role: 'admin',
      fullName: 'Super Administrator',
      badges: ['superadmin'],
      assignments: []
    }));
  }, firstSession);

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // Find all SOP titles
  const sopList = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('tr, .cursor-pointer'));
    return items.map(el => el.textContent?.replace(/\s+/g, ' ').trim()).filter(Boolean);
  });
  console.log('Found items count:', sopList.length);

  // Click on Crossmatch or search for it
  const clicked = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    for (const el of all) {
      if (el.textContent && el.textContent.includes('CROSSMATCH') && (el as HTMLElement).click) {
        (el as HTMLElement).click();
        return el.textContent.slice(0, 50);
      }
    }
    return null;
  });
  console.log('Clicked element:', clicked);

  await new Promise(r => setTimeout(r, 2000));

  // Inspect the rendered pages in the modal
  const modalInfo = await page.evaluate(() => {
    const modal = document.querySelector('.sop-preview-page, #printable-sop-official-document');
    if (!modal) return { open: false };
    const pages = Array.from(document.querySelectorAll('.sop-preview-page'));
    return {
      open: true,
      pageCount: pages.length,
      pages: pages.map((p, idx) => {
        const text = p.textContent?.replace(/\s+/g, ' ').slice(0, 100);
        const tables = p.querySelectorAll('table');
        const rows = p.querySelectorAll('tr');
        return {
          page: idx + 1,
          text,
          tablesCount: tables.length,
          rowsCount: rows.length,
          height: (p as HTMLElement).offsetHeight
        };
      })
    };
  });

  console.log('Modal Info:', JSON.stringify(modalInfo, null, 2));
  await browser.close();
}

run().catch(console.error);
