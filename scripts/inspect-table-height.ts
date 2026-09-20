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
    const container = document.createElement('div');
    container.className = 'sop-measure-root';
    container.style.position = 'absolute';
    container.style.left = '-100000px';
    container.style.top = '0';
    container.style.width = '210mm';
    
    const temp = document.createElement('div');
    temp.innerHTML = sourceHtml;
    const tableHtml = temp.children[2].outerHTML;
    
    const makeRow = (sec: string, contentHtml: string, id: string) => {
      return '<tr data-measure-block-row="' + id + '">' +
        '<td style="width: 28%; vertical-align: top; border: 1px solid #000; padding: 10px; font-weight: bold; font-size: 12px; line-height: 1.4;">' + sec + '</td>' +
        '<td colspan="3" style="width: 72%; vertical-align: top; border: 1px solid #000; padding: 10px; font-size: 12pt; line-height: 1.5;">' +
          '<div data-measure-content="' + id + '" class="sop-batang-tubuh-content font-bookman text-black rich-text-output rich-text-document-content break-words" style="overflow: visible; max-height: none;">' +
            contentHtml +
          '</div>' +
        '</td>' +
      '</tr>';
    };
    
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
            makeRow('PROSEDUR', tableHtml, 'block-table') +
          '</tbody>' +
        '</table>' +
      '</div>';
    document.body.appendChild(container);
    
    const contentDiv = container.querySelector('[data-measure-content="block-table"]') as HTMLElement;
    const tableEl = contentDiv.querySelector('table') as HTMLTableElement;
    
    const tableRows = Array.from(tableEl.querySelectorAll('tr')).map((r, i) => {
      const computed = window.getComputedStyle(r);
      return {
        row: i,
        text: r.textContent?.replace(/\\s+/g, ' ').slice(0, 30),
        height: r.getBoundingClientRect().height,
        offsetHeight: (r as HTMLElement).offsetHeight,
        styleMinHeight: r.style.minHeight,
        styleHeight: r.style.height,
        computedHeight: computed.height,
        computedLineHeight: computed.lineHeight
      };
    });
    
    return {
      contentDivHeight: contentDiv.getBoundingClientRect().height,
      tableElHeight: tableEl.getBoundingClientRect().height,
      contentDivWidth: contentDiv.getBoundingClientRect().width,
      tableRows
    };
  }).toString()})(${JSON.stringify(html)})`);
  
  console.log('TABLE INSPECTION RESULT:', JSON.stringify(result, null, 2));
  await browser.close();
}

run().catch(console.error);
