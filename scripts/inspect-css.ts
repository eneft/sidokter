import puppeteer from 'puppeteer-core';

async function getChromium() {
  process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
  const mod = await import('@sparticuz/chromium');
  return mod.default || mod;
}

async function run() {
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
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  
  const cssStats = await page.evaluate(() => {
    const cssParts: string[] = [];
    for (const style of Array.from(document.querySelectorAll<HTMLStyleElement>('style'))) {
      if (style.textContent) cssParts.push(style.textContent);
    }
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from((sheet as CSSStyleSheet).cssRules || []);
        if (rules.length) cssParts.push(rules.map(rule => rule.cssText).join('\n'));
      } catch (e: any) {
        // ignore
      }
    }
    const fullCss = cssParts.join('\n');
    return {
      styleTagsCount: document.querySelectorAll('style').length,
      styleSheetsCount: document.styleSheets.length,
      fullCssLength: fullCss.length,
      sample: fullCss.slice(0, 200)
    };
  });
  console.log('CSS stats in browser:', cssStats);
  await browser.close();
}
run().catch(console.error);
