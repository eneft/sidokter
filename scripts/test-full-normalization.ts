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
  await page.setContent(`<!DOCTYPE html><html><head><script>window.__name = function(f, n) { return f; };</script><style>${css}</style></head><body><div id="measure-container"></div></body></html>`);
  
  const result = await page.evaluate(`(${((procedureHtml: string) => {
    // 1. Normalize table in procedureHtml
    const doc = new DOMParser().parseFromString(procedureHtml, 'text/html');
    
    // Check tables
    doc.querySelectorAll('table').forEach(table => {
      table.style.width = '100%';
      table.style.maxWidth = '100%';
      table.style.boxSizing = 'border-box';
      table.style.tableLayout = 'auto';
      
      // Compute column widths from cells
      const firstRowCells = Array.from(table.rows[0]?.cells || []);
      const cellWidths = firstRowCells.map(c => {
        const raw = c.getAttribute('width') || c.style.width || '';
        const num = parseFloat(raw);
        return isNaN(num) ? 0 : num;
      });
      const totalW = cellWidths.reduce((a, b) => a + b, 0);
      let colgroup = table.querySelector('colgroup');
      if (!colgroup) {
        colgroup = doc.createElement('colgroup');
        table.insertBefore(colgroup, table.firstChild);
      }
      colgroup.innerHTML = '';
      if (totalW > 0) {
        cellWidths.forEach(w => {
          const col = doc.createElement('col');
          col.style.width = ((w / totalW) * 100).toFixed(2) + '%';
          colgroup.appendChild(col);
        });
      }
    });
    
    const normalizedHtml = doc.body.innerHTML;
    
    // Now simulate measure host in container
    const container = document.getElementById('measure-container')!;
    const host = document.createElement('div');
    host.className = 'sop-batang-tubuh-content font-bookman text-black rich-text-output';
    host.style.width = '443px';
    container.appendChild(host);
    
    host.innerHTML = normalizedHtml;
    const totalHeight = host.getBoundingClientRect().height;
    
    // Measure individual procedure blocks
    const p1 = doc.body.children[0]?.outerHTML || '';
    const p2 = doc.body.children[1]?.outerHTML || '';
    const tbl = doc.body.children[2]?.outerHTML || '';
    
    host.innerHTML = p1;
    const h1 = host.getBoundingClientRect().height;
    host.innerHTML = p2;
    const h2 = host.getBoundingClientRect().height;
    host.innerHTML = tbl;
    const hTbl = host.getBoundingClientRect().height;
    
    return {
      totalHeight,
      h1,
      h2,
      hTbl
    };
  }).toString()})(${JSON.stringify(html)})`);
  
  console.log('FULL NORMALIZATION RESULT:', result);
  await browser.close();
}

run().catch(console.error);
