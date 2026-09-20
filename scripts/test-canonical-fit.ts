import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

async function getChromium() {
  process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
  const mod = await import('@sparticuz/chromium');
  return mod.default || mod;
}

async function run() {
  const html = fs.readFileSync('crossmatch_prosedur.html', 'utf-8');
  const css = fs.readFileSync('src/index.css', 'utf-8');
  
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
  await page.setViewport({ width: 1280, height: 900 });
  await page.setContent(`<!DOCTYPE html><html><head><script>window.__name = function(f, n) { return f; };</script><style>${css}</style></head><body></body></html>`);
  
  const result = await page.evaluate(`(${((sourceHtml: string) => {
    // Test what happens when table column widths are normalized to canonical widths
    const temp = document.createElement('div');
    temp.innerHTML = sourceHtml;
    const table = temp.querySelector('table') as HTMLTableElement;
    
    // Canonical widths for this table based on cells: 14%, 14%, 10%, 12%, 50%
    const colgroup = table.querySelector('colgroup');
    if (colgroup) {
      colgroup.innerHTML = '<col style="width: 14%"><col style="width: 14%"><col style="width: 10%"><col style="width: 12%"><col style="width: 50%">';
    }
    
    const host = document.createElement('div');
    host.className = 'sop-batang-tubuh-content';
    host.style.width = '443px';
    document.body.appendChild(host);
    
    host.appendChild(table);
    const tableHeight = table.getBoundingClientRect().height;
    
    return {
      tableHeight,
      fitsIn450: tableHeight <= 450
    };
  }).toString()})(${JSON.stringify(html)})`);
  
  console.log('TEST CANONICAL FIT RESULT:', result);
  await browser.close();
}

run().catch(console.error);
