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
  await page.setContent(`<!DOCTYPE html><html><head><style>${css}</style></head><body></body></html>`);
  
  const result = await page.evaluate(`(${((sourceHtml: string) => {
    const container = document.createElement('div');
    container.className = 'sop-measure-root';
    container.style.position = 'absolute';
    container.style.left = '-100000px';
    container.style.top = '0';
    container.style.width = '210mm';
    
    container.innerHTML = `
      <div data-measure-page class="bg-white printable-paper font-bookman" style="width: 210mm; min-height: 297mm; height: 297mm; max-height: 297mm; padding: 20mm 20mm 20mm 20mm; box-sizing: border-box; background-color: #ffffff;">
        <table data-measure-table class="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed" style="border: 1px solid #000000; border-collapse: collapse; width: 100%;">
          <colgroup>
            <col style="width: 28%;" />
            <col style="width: 24%;" />
            <col style="width: 24%;" />
            <col style="width: 24%;" />
          </colgroup>
          <tbody>
            <tr data-measure-block-row>
              <td class="sop-official-cell-title" style="vertical-align: top; border: 1px solid #000; padding: 8px; width: 28%; font-weight: bold;">PROSEDUR</td>
              <td colspan="3" class="sop-official-cell-content" style="vertical-align: top; border: 1px solid #000; padding: 10px; width: 72%;">
                <div data-measure-content class="sop-batang-tubuh-content font-bookman text-black rich-text-output rich-text-document-content break-words"></div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    document.body.appendChild(container);
    
    const pageEl = container.querySelector('[data-measure-page]') as HTMLElement;
    const contentEl = container.querySelector('[data-measure-content]') as HTMLElement;
    
    const pageHeight = pageEl.getBoundingClientRect().height;
    const pageStyle = getComputedStyle(pageEl);
    const availableHeight = pageHeight - parseFloat(pageStyle.paddingTop || '0') - parseFloat(pageStyle.paddingBottom || '0');
    const headerHeight = 100;
    const safety = 4;
    const normalCapacity = Math.max(1, availableHeight - headerHeight - safety);
    
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
    contentEl.parentElement!.appendChild(host);
    
    // Parse sourceHtml
    const temp = document.createElement('div');
    temp.innerHTML = sourceHtml;
    const elements = Array.from(temp.children) as HTMLElement[];
    
    const p1 = elements[0]; // <p>A. PERSIAPAN... B. PROSEDUR...</p>
    const p2 = elements[1]; // <p>C. INTERPRSTASI HASIL</p>
    const table = elements[2] as HTMLTableElement; // <table>...</table>
    
    // Let's measure p1
    host.innerHTML = p1 ? p1.outerHTML : '';
    const p1Height = host.getBoundingClientRect().height;
    
    // Let's measure p2
    host.innerHTML = p2 ? p2.outerHTML : '';
    const p2Height = host.getBoundingClientRect().height;
    
    // Let's measure table rows
    const rows = Array.from(table.querySelectorAll('tr'));
    const rowsInfo = rows.map((r, i) => {
      host.innerHTML = `<table><tbody>${r.outerHTML}</tbody></table>`;
      return {
        row: i,
        text: r.textContent?.replace(/\\s+/g, ' ').slice(0, 40),
        height: host.getBoundingClientRect().height
      };
    });
    
    // Cumulative table heights with header (row 0) + rows 1..N
    const cumulative: any[] = [];
    for (let c = 1; c < rows.length; c++) {
      let candidateTableHtml = `<table><thead>${rows[0].outerHTML}</thead><tbody>`;
      for (let j = 1; j <= c; j++) {
        candidateTableHtml += rows[j].outerHTML;
      }
      candidateTableHtml += `</tbody></table>`;
      host.innerHTML = candidateTableHtml;
      cumulative.push({
        rowCount: c,
        height: host.getBoundingClientRect().height
      });
    }
    
    return {
      availableHeight,
      normalCapacity,
      p1Height,
      p2Height,
      rowsInfo,
      cumulative
    };
  }).toString()})(${JSON.stringify(html)})`);
  
  console.log('RESULT:', JSON.stringify(result, null, 2));
  await browser.close();
}

run().catch(console.error);
