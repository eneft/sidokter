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
    // 1. In measure page table
    const container = document.createElement('div');
    container.className = 'sop-measure-root';
    container.style.position = 'absolute';
    container.style.left = '-100000px';
    container.style.top = '0';
    container.style.width = '210mm';
    
    const temp = document.createElement('div');
    temp.innerHTML = sourceHtml;
    const tableHtml = temp.children[2].outerHTML;
    
    container.innerHTML = 
      '<div data-measure-page class="bg-white printable-paper font-bookman" style="width: 210mm; min-height: 297mm; height: 297mm; max-height: 297mm; padding: 20mm 20mm 20mm 20mm; box-sizing: border-box; background-color: #ffffff; overflow: hidden;">' +
        '<table data-measure-table class="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed" style="border: 1px solid #000000; border-collapse: collapse; width: 100%;">' +
          '<colgroup>' +
            '<col style="width: 28%;" />' +
            '<col style="width: 24%;" />' +
            '<col style="width: 24%;" />' +
            '<col style="width: 24%;" />' +
          '</colgroup>' +
          '<tbody>' +
            '<tr>' +
              '<td style="width: 28%; vertical-align: top; border: 1px solid #000; padding: 10px; font-weight: bold;">PROSEDUR</td>' +
              '<td colspan="3" style="width: 72%; vertical-align: top; border: 1px solid #000; padding: 10px; font-size: 12pt; line-height: 1.5;">' +
                '<div id="in-measure-page" class="sop-batang-tubuh-content font-bookman text-black rich-text-output rich-text-document-content break-words" style="overflow: visible; max-height: none;">' +
                  tableHtml +
                '</div>' +
              '</td>' +
            '</tr>' +
          '</tbody>' +
        '</table>' +
      '</div>';
    document.body.appendChild(container);
    
    // 2. In createMeasureHost
    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.visibility = 'hidden';
    host.style.pointerEvents = 'none';
    host.style.height = 'auto';
    host.style.maxHeight = 'none';
    host.style.overflow = 'visible';
    host.style.boxSizing = 'border-box';
    host.style.fontFamily = 'Bookman Old Style, Bookman, Georgia, serif';
    host.style.fontSize = '12pt';
    host.style.lineHeight = '1.5';
    host.style.padding = '0';
    host.style.margin = '0';
    host.style.border = 'none';
    host.style.width = '443px';
    host.className = 'sop-batang-tubuh-content font-bookman text-black rich-text-output rich-text-document-content break-words [overflow-wrap:break-word] [word-break:normal] [hyphens:none]';
    host.innerHTML = tableHtml;
    document.body.appendChild(host);
    
    const row2InPage = container.querySelectorAll('tr')[1]; // In the nested table, row 2
    const nestedTableInPage = container.querySelector('#in-measure-page table') as HTMLTableElement;
    const r2InPage = nestedTableInPage.rows[2];
    const r2LastCellInPage = r2InPage.cells[r2InPage.cells.length - 1];
    
    const nestedTableInHost = host.querySelector('table') as HTMLTableElement;
    const r2InHost = nestedTableInHost.rows[2];
    const r2LastCellInHost = r2InHost.cells[r2InHost.cells.length - 1];
    
    return {
      inPage: {
        tableWidth: nestedTableInPage.getBoundingClientRect().width,
        r2Height: r2InPage.getBoundingClientRect().height,
        lastCellWidth: r2LastCellInPage.getBoundingClientRect().width,
        lastCellFontSize: window.getComputedStyle(r2LastCellInPage).fontSize,
        lastCellLineHeight: window.getComputedStyle(r2LastCellInPage).lineHeight,
        lastCellPadding: window.getComputedStyle(r2LastCellInPage).padding
      },
      inHost: {
        tableWidth: nestedTableInHost.getBoundingClientRect().width,
        r2Height: r2InHost.getBoundingClientRect().height,
        lastCellWidth: r2LastCellInHost.getBoundingClientRect().width,
        lastCellFontSize: window.getComputedStyle(r2LastCellInHost).fontSize,
        lastCellLineHeight: window.getComputedStyle(r2LastCellInHost).lineHeight,
        lastCellPadding: window.getComputedStyle(r2LastCellInHost).padding
      }
    };
  }).toString()})(${JSON.stringify(html)})`);
  
  console.log('COMPARISON:', JSON.stringify(result, null, 2));
  await browser.close();
}

run().catch(console.error);
