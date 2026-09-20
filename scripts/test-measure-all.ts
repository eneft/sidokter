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
    // Let's set up the exact measure root from SopDetailModal.tsx
    const container = document.createElement('div');
    container.className = 'sop-measure-root';
    container.style.position = 'absolute';
    container.style.left = '-100000px';
    container.style.top = '0';
    container.style.width = '210mm';
    
    // We have sections:
    // pengertian: ~40px
    // tujuan: ~40px
    // kebijakan: ~40px
    // prosedur block 0: A. PERSIAPAN...
    // prosedur block 1: C. INTERPRSTASI...
    // prosedur block 2: <table>...
    // unit terkait: ~30px
    
    const temp = document.createElement('div');
    temp.innerHTML = sourceHtml;
    const p1 = temp.children[0].outerHTML;
    const p2 = temp.children[1].outerHTML;
    const tableHtml = temp.children[2].outerHTML;
    
    const blocks = [
      { section: 'PENGERTIAN', html: 'Pemeriksaan crossmatch adalah uji silang serasi antara darah pasien dan darah donor.' },
      { section: 'TUJUAN', html: 'Sebagai acuan penerapan langkah-langkah untuk melakukan pemeriksaan crossmatch.' },
      { section: 'KEBIJAKAN', html: 'SK Direktur RSUD Dr. Soegiri Lamongan Nomor 188/SPO/DIR/2026' },
      { section: 'PROSEDUR', html: p1 },
      { section: 'PROSEDUR', html: p2 },
      { section: 'PROSEDUR', html: tableHtml },
      { section: 'UNIT TERKAIT', html: 'Instalasi Laboratorium, Bank Darah Rumah Sakit (BDRS)' }
    ];
    
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
          '<thead data-measure-header>' +
            '<tr><td colspan="4" style="height: 100px; border: 1px solid #000;">HEADER KOP RSUD</td></tr>' +
          '</thead>' +
          '<tbody>' +
            '<tr data-measure-publication><td colspan="4" style="height: 120px; border: 1px solid #000;">PUBLIKASI TANGGAL & DIREKTUR</td></tr>' +
            blocks.map((b, i) => makeRow(b.section, b.html, 'block-' + i)).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
    document.body.appendChild(container);
    
    const page = container.querySelector('[data-measure-page]') as HTMLElement;
    const header = container.querySelector('[data-measure-header]') as HTMLElement;
    const publication = container.querySelector('[data-measure-publication]') as HTMLElement;
    const measuredRows = Array.from(container.querySelectorAll('[data-measure-block-row]')) as HTMLElement[];
    
    const pageHeight = page.getBoundingClientRect().height;
    const availableHeight = pageHeight - 40 * (96 / 25.4); // 20mm top + 20mm bottom
    const headerHeight = header.getBoundingClientRect().height;
    const publicationHeight = publication.getBoundingClientRect().height;
    const safety = 4;
    const bodyCapacity = Math.max(1, availableHeight - headerHeight - safety);
    const firstCapacity = Math.max(1, bodyCapacity - publicationHeight);
    const normalCapacity = bodyCapacity;
    
    const measuredContent = measuredRows.map(r => r.querySelector('[data-measure-content]') as HTMLElement);
    const contentHeights = measuredRows.map((r, i) => (measuredContent[i] || r).getBoundingClientRect().height);
    const rowHeights = measuredRows.map(r => r.getBoundingClientRect().height);
    const rowChrome = measuredRows.map((r, i) => Math.max(0, rowHeights[i] - contentHeights[i]));
    
    return {
      availableHeight,
      headerHeight,
      publicationHeight,
      firstCapacity,
      normalCapacity,
      blocks: blocks.map((b, i) => ({
        index: i,
        section: b.section,
        contentHeight: contentHeights[i],
        rowHeight: rowHeights[i],
        chrome: rowChrome[i]
      }))
    };
  }).toString()})(${JSON.stringify(html)})`);
  
  console.log('MEASURE ALL RESULT:', JSON.stringify(result, null, 2));
  await browser.close();
}

run().catch(console.error);
