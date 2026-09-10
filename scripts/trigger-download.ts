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

  // Let's launch puppeteer and load an actual SOP in the browser
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
  
  // Set localStorage session so user is logged in
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

  // Click on the first SOP row to open SopDetailModal
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr, .cursor-pointer'));
    for (const r of rows) {
      if (r.textContent?.includes('SPO') || r.textContent?.includes('Pengamanan') || r.textContent?.includes('Barang')) {
        (r as HTMLElement).click();
        return;
      }
    }
  });

  await new Promise(r => setTimeout(r, 2000));

  // Now let's trigger handleDownloadDirectPdf or capture the request sent to /api/pdf!
  let interceptedRequest: any = null;
  let interceptedResponse: any = null;

  page.on('request', req => {
    if (req.url().includes('/api/pdf')) {
      interceptedRequest = {
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
        postData: req.postData()
      };
    }
  });

  page.on('response', async res => {
    if (res.url().includes('/api/pdf')) {
      interceptedResponse = {
        status: res.status(),
        statusText: res.statusText(),
        headers: res.headers(),
        text: res.status() !== 200 ? await res.text() : `(PDF OK, length=${(await res.buffer()).length})`
      };
    }
  });

  // Click Download PDF button
  const clickResult = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const pdfBtn = buttons.find(b => {
      const txt = (b.textContent || '') + (b.getAttribute('title') || '');
      return /download\s*pdf|unduh\s*pdf|\bpdf\b/i.test(txt);
    });
    if (pdfBtn) {
      pdfBtn.click();
      return { success: true, text: pdfBtn.textContent };
    }
    return { success: false, buttons: buttons.map(b => b.textContent?.trim()).filter(Boolean) };
  });

  console.log('Click result:', clickResult);

  // Wait for response
  for (let i = 0; i < 20; i++) {
    if (interceptedResponse) break;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('Intercepted request headers:', interceptedRequest?.headers);
  console.log('Intercepted response:', interceptedResponse);

  await browser.close();
}
run().catch(console.error);
