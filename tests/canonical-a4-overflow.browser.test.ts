import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';

async function chromiumExecutable(): Promise<{ executablePath: string; args: string[] }> {
  process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
  const chromiumModule = await import('@sparticuz/chromium');
  const chromium = chromiumModule.default;
  return {
    executablePath: await chromium.executablePath(),
    args: chromium.args.filter((arg) => !arg.includes('single-process') && !arg.includes('in-process-gpu')),
  };
}

const paginatorBundle = buildSync({
  entryPoints: ['src/utils/canonicalA4Pagination.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'CanonicalPaginator',
}).outputFiles[0].text;

const css = readFileSync('src/index.css', 'utf8');
const fixtureUnit = readFileSync('tests/fixtures/cryotherapy-long-spo.html', 'utf8');
const fixture = Array.from({ length: 7 }, (_, index) =>
  `<p><strong>Bagian ${index + 1}</strong></p>${fixtureUnit}`
).join('');

test('canonical A4 pages are content-safe and identical on desktop, iPhone-like, and PDF', async () => {
  const chromium = await chromiumExecutable();
  const browser = await puppeteer.launch({ headless: true, pipe: true, ...chromium });
  try {
    const logicalResults: Array<{ count: number; text: string }> = [];
    let desktopPage: Awaited<ReturnType<typeof browser.newPage>> | undefined;

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage();
      if (viewport.width === 1440) desktopPage = page;
      await page.setViewport(viewport);
      await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>html{min-width:210mm;-webkit-text-size-adjust:none}${css}</style><script>${paginatorBundle}</script><main id="pages"></main>`);

      const result = await page.evaluate((source) => {
        const api = (window as any).CanonicalPaginator;
        const sourceBlocks = api.buildOfficialBlocks({
          pengertian: '<p>Pelayanan cryotherapy untuk lesi kulit sesuai indikasi klinis.</p>',
          tujuan: '<p>Menjamin tindakan aman, konsisten, terdokumentasi, dan dapat ditelusuri.</p>',
          kebijakan: '<p>Tindakan dilaksanakan oleh tenaga yang memiliki kewenangan klinis.</p>',
          prosedur: source,
          alur: '<ol><li>Asesmen</li><li>Persiapan</li><li>Tindakan</li><li>Evaluasi</li></ol>',
          unitTerkait: '<p>Rawat Jalan, Farmasi, Rekam Medis.</p>',
        });
        const options = { headerHeightPx: 150, publicationHeightPx: 58, safetyBufferPx: 4 };
        const pages = api.computeCanonicalA4Pages(sourceBlocks, options);
        const repeated = api.computeCanonicalA4Pages(sourceBlocks, options);
        if (pages.length !== repeated.length) throw new Error('unstable page count');

        const root = document.querySelector('#pages')!;
        pages.forEach((blocks: any[], pageIndex: number) => {
          const page = document.createElement('section');
          page.className = 'sop-preview-page';
          page.style.cssText = 'padding:20mm;box-sizing:border-box;position:relative';
          const frame = document.createElement('div');
          frame.className = 'sop-a4-content-frame';
          frame.style.cssText = 'height:100%;display:flex;flex-direction:column';
          const table = document.createElement('table');
          table.className = 'sop-official-table';
          table.innerHTML = `<colgroup><col style="width:28%"><col style="width:72%"></colgroup><thead><tr style="height:150px"><th colspan="2">KOP SPO</th></tr></thead><tbody>${pageIndex === 0 ? '<tr style="height:58px"><td colspan="2">PENERBITAN</td></tr>' : ''}</tbody>`;
          const tbody = table.tBodies[0];
          const groups: any[][] = [];
          blocks.forEach((block) => {
            const last = groups.at(-1);
            if (last?.[0].section === block.section) last.push(block);
            else groups.push([block]);
          });
          groups.forEach((group) => {
            const row = tbody.insertRow();
            row.className = 'sop-section-row';
            row.innerHTML = `<td class="sop-batang-tubuh-title" style="font-size:12px;line-height:1.4;vertical-align:top">${group[0].section}</td><td class="sop-batang-tubuh-content" style="font-size:12pt;line-height:1.5;vertical-align:top"><div class="font-bookman text-black rich-text-output rich-text-document-content">${group.map((block) => block.html).join('')}</div></td>`;
          });
          frame.append(table);
          page.append(frame);
          root.append(page);
        });

        const pageMetrics = Array.from(document.querySelectorAll<HTMLElement>('.sop-preview-page')).map((page) => {
          const frame = page.querySelector<HTMLElement>('.sop-a4-content-frame')!;
          const table = frame.querySelector<HTMLElement>('table')!;
          return { overflow: Math.max(0, frame.scrollHeight - frame.clientHeight), tableHeight: table.getBoundingClientRect().height, frameHeight: frame.clientHeight, rows: Array.from(table.querySelectorAll('tr')).map((row) => row.getBoundingClientRect().height) };
        });
        const text = pages.flat().map((block: any) => {
          const node = document.createElement('div');
          node.innerHTML = block.html;
          return (node.textContent || '').replace(/\s+/g, ' ').trim();
        }).join(' ');
        return { count: pages.length, repeatedCount: repeated.length, pageMetrics, text };
      }, fixture);

      assert.ok(result.count > 2, 'fixture must exercise multiple A4 continuations');
      assert.equal(result.repeatedCount, result.count);
      assert.deepEqual(result.pageMetrics.map((metric) => metric.overflow), Array(result.count).fill(0), JSON.stringify(result));
      logicalResults.push({ count: result.count, text: result.text });
    }

    assert.deepEqual(logicalResults[1], logicalResults[0], 'viewport must not alter logical pagination');
    assert.match(logicalResults[0].text, /Catatan akhir hanya ditampilkan/);
    assert.equal((logicalResults[0].text.match(/Dokumentasi tindakan memuat/g) || []).length, 7);

    const pdfBytes = await desktopPage!.pdf({ format: 'A4', printBackground: true });
    const pdf = await PDFDocument.load(pdfBytes);
    assert.equal(pdf.getPageCount(), logicalResults[0].count);
  } finally {
    await browser.close();
  }
});
