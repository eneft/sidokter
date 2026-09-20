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
    // Let's import the exact logic of SopDetailModal pagination
    // First, define extractProcedureBlocks
    function extractProcedureBlocks(source: string): string[] {
      if (!source || !source.trim()) return [];
      const parser = new DOMParser();
      const doc = parser.parseFromString(source, 'text/html');
      const blocks: string[] = [];
      let inlineBuffer = '';

      const pushInlineBuffer = () => {
        const trimmed = inlineBuffer.trim();
        if (trimmed) {
          if (/^<(p|div|h[1-6]|table|ol|ul|blockquote)/i.test(trimmed)) {
            blocks.push(trimmed);
          } else {
            blocks.push('<p>' + trimmed + '</p>');
          }
        }
        inlineBuffer = '';
      };

      const hasBlockDescendant = (el: Element) => {
        return Boolean(
          el.querySelector('p, ol, ul, table, blockquote, pre, h1, h2, h3, h4, h5, h6, section, article, div, figure, hr')
        );
      };

      const processNode = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          if ((node.textContent || '').length > 0) inlineBuffer += node.textContent || '';
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();

        if (/^(ol|ul)$/i.test(tag)) {
          pushInlineBuffer();
          blocks.push(el.outerHTML);
          return;
        }

        if (/^(table|img|figure|blockquote|pre|h1|h2|h3|h4|h5|h6|hr)$/i.test(tag)) {
          pushInlineBuffer();
          blocks.push(el.outerHTML);
          return;
        }

        if (tag === 'p') {
          if (hasBlockDescendant(el)) {
            pushInlineBuffer();
            Array.from(el.childNodes).forEach(processNode);
            pushInlineBuffer();
            return;
          }
          pushInlineBuffer();
          const innerHtml = el.innerHTML;
          if (innerHtml.includes('<br><br>') || innerHtml.includes('<br/><br/>') || innerHtml.includes('<br /><br />')) {
            const parts = innerHtml.split(/<br\s*\/?>\s*<br\s*\/?>/i);
            parts.forEach((part) => {
              if (part.trim()) {
                blocks.push('<p>' + part.trim() + '</p>');
              }
            });
            return;
          }
          blocks.push(el.outerHTML);
          return;
        }

        if (tag === 'div') {
          pushInlineBuffer();
          Array.from(el.childNodes).forEach(processNode);
          pushInlineBuffer();
          return;
        }

        inlineBuffer += el.outerHTML;
      };

      Array.from(doc.body.childNodes).forEach(processNode);
      pushInlineBuffer();
      return blocks;
    }

    // Now define extractCanonicalTableGeometry & splitStructuredTableV2
    function splitStructuredTableV2(table: HTMLTableElement, fits: (candidateHtml: string) => boolean): string[] {
      if (fits(table.outerHTML)) return [table.outerHTML];
      
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length < 2) return [table.outerHTML];
      
      const headerRow = rows[0];
      const bodyRows = rows.slice(1);
      
      const buildFragment = (start: number, end: number, isFinal: boolean): string => {
        const clone = table.cloneNode(false) as HTMLTableElement;
        clone.removeAttribute('id');
        const thead = document.createElement('thead');
        thead.appendChild(headerRow.cloneNode(true));
        clone.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (let i = start; i < end; i++) {
          tbody.appendChild(bodyRows[i].cloneNode(true));
        }
        clone.appendChild(tbody);
        return clone.outerHTML;
      };
      
      let largestFittingCount = 0;
      for (let count = 1; count < bodyRows.length; count++) {
        const candidate = buildFragment(0, count, false);
        if (fits(candidate)) {
          largestFittingCount = count;
        } else {
          break;
        }
      }
      
      if (largestFittingCount === 0) {
        return [table.outerHTML];
      }
      
      return [
        buildFragment(0, largestFittingCount, false),
        buildFragment(largestFittingCount, bodyRows.length, true)
      ];
    }

    const procedureBlocks = extractProcedureBlocks(sourceHtml);
    
    // Construct layoutBlocks like in SopDetailModal
    const layoutBlocks = [
      { id: 'pengertian', section: 'PENGERTIAN', html: 'Pemeriksaan crossmatch adalah uji silang serasi antara darah pasien dan darah donor.' },
      { id: 'tujuan', section: 'TUJUAN', html: 'Sebagai acuan penerapan langkah-langkah untuk melakukan pemeriksaan crossmatch.' },
      { id: 'kebijakan', section: 'KEBIJAKAN', html: 'SK Direktur RSUD Dr. Soegiri Lamongan Nomor 188/SPO/DIR/2026' },
      ...procedureBlocks.map((b, i) => ({
        id: 'prosedur-' + i,
        section: 'PROSEDUR',
        html: b
      })),
      { id: 'unit_terkait', section: 'UNIT TERKAIT', html: 'Instalasi Laboratorium, Bank Darah Rumah Sakit (BDRS)' }
    ];
    
    return {
      procedureBlocksCount: procedureBlocks.length,
      procedureBlocks: procedureBlocks.map((b, i) => ({ index: i, length: b.length, preview: b.slice(0, 80) })),
      layoutBlocksCount: layoutBlocks.length
    };
  }).toString()})(${JSON.stringify(html)})`);
  
  console.log('EXACT PAGINATOR CHECK:', JSON.stringify(result, null, 2));
  await browser.close();
}

run().catch(console.error);
