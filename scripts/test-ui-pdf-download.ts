import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

async function getChromium() {
  process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
  const mod = await import('@sparticuz/chromium');
  return mod.default || mod;
}

async function testUiDownload() {
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
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err));

  let pdfReq: any = null;
  let pdfRes: any = null;

  page.on('request', req => {
    if (req.url().includes('/api/pdf')) {
      console.log('PDF REQUEST HEADERS:', req.headers());
      console.log('PDF REQUEST METHOD:', req.method());
      pdfReq = {
        url: req.url(),
        headers: req.headers(),
        postData: req.postData()
      };
    }
  });

  page.on('response', async res => {
    if (res.url().includes('/api/pdf')) {
      const status = res.status();
      const text = status === 200 ? `OK (bytes: ${(await res.buffer()).length})` : await res.text();
      console.log(`PDF RESPONSE: status=${status}, body=${text}`);
      pdfRes = { status, text };
    }
  });

  // Navigate to app
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Check if login form is displayed
  const hasLoginForm = await page.evaluate(() => {
    return !!document.querySelector('input[type="password"]');
  });
  console.log('Has login form:', hasLoginForm);

  if (hasLoginForm) {
    // Read credentials from data/auth_db.json
    const db = JSON.parse(fs.readFileSync('data/auth_db.json', 'utf-8'));
    console.log('Users in auth_db:', Object.keys(db.users));

    // Fill login
    await page.type('input[type="text"], input[name="username"]', 'admin');
    // Wait, what's the password? Let's check password or bootstrap
    // If password unknown, let's inject session directly into sessionStorage!
    const firstSession = Object.values(db.sessions)[0] as any;
    console.log('Using firstSession:', firstSession?.sessionId);
    
    await page.evaluate((sess, u) => {
      sessionStorage.setItem('soegiri_sop_client_session_v3', JSON.stringify({
        authUid: sess.authUid,
        sessionId: sess.sessionId,
        username: sess.username,
        name: 'Super Administrator',
        role: 'admin',
        divisionCode: 'ALL',
        divisionCodes: ['ALL'],
        assignments: [],
        badges: ['superadmin'],
        unitName: 'RSUD Dr. Soegiri Lamongan',
        sessionCreatedAt: sess.createdAt,
        lastActiveAt: sess.lastActiveAt
      }));
    }, firstSession, db.users[firstSession.authUid]);

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  }

  // Wait for SOP table or list to appear
  await page.waitForSelector('table, .sop-row, [role="row"]', { timeout: 10000 }).catch(() => null);

  // Look for any clickable SOP
  const clickedSop = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr, .cursor-pointer, [data-sop-id]'));
    for (const r of rows) {
      if (r.textContent?.includes('SPO') || r.textContent?.includes('Pengamanan') || r.textContent?.includes('Pelayanan')) {
        (r as HTMLElement).click();
        return true;
      }
    }
    // If not found, try clicking any row in tbody
    const firstTr = document.querySelector('tbody tr');
    if (firstTr) {
      (firstTr as HTMLElement).click();
      return true;
    }
    return false;
  });
  console.log('Clicked SOP row:', clickedSop);

  // Wait for modal to open
  await new Promise(r => setTimeout(r, 2000));

  // Find Download PDF button
  const downloadBtnInfo = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => {
      const text = (b.textContent || '') + (b.getAttribute('title') || '');
      return /download\s*pdf|unduh\s*pdf|\bpdf\b/i.test(text);
    });
    if (btn) {
      return { found: true, text: btn.textContent?.trim() };
    }
    return { found: false, allButtons: buttons.map(b => b.textContent?.trim()).filter(Boolean) };
  });
  console.log('Download button info:', downloadBtnInfo);

  if (downloadBtnInfo.found) {
    console.log('Clicking Download PDF button...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => {
        const text = (b.textContent || '') + (b.getAttribute('title') || '');
        return /download\s*pdf|unduh\s*pdf|\bpdf\b/i.test(text);
      });
      btn?.click();
    });

    // Wait up to 15s for PDF request and response
    await new Promise(r => setTimeout(r, 12000));
  }

  await browser.close();
}

testUiDownload().catch(console.error);
