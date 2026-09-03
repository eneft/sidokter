import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';

// Ensure runtime environment is set before importing @sparticuz/chromium
if (!process.env.AWS_EXECUTION_ENV) {
  process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
}

let chromiumPromise: Promise<any> | null = null;

async function getChromium() {
  if (!chromiumPromise) {
    chromiumPromise = (async () => {
      if (!process.env.AWS_EXECUTION_ENV) {
        process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
      }
      const mod: any = await import('@sparticuz/chromium');
      const chromium = mod.default || mod;

      const al2023Lib = path.join(tmpdir(), 'al2023', 'lib');
      const nsprPath = path.join(al2023Lib, 'libnspr4.so');

      // Check if al2023 shared libraries (libnspr4.so, etc.) need explicit inflation
      if (!fs.existsSync(nsprPath) && typeof mod.inflate === 'function') {
        try {
          const binDir = path.join(process.cwd(), 'node_modules', '@sparticuz/chromium', 'bin');
          const al2023Tar = path.join(binDir, 'al2023.tar.br');
          if (fs.existsSync(al2023Tar)) {
            console.log('[PDF] Inflating AL2023 libraries for Linux...');
            await mod.inflate(al2023Tar);
            console.log('[PDF] AL2023 libraries inflated successfully.');
          }
        } catch (err) {
          console.warn('[PDF] Failed to manually inflate al2023:', err);
        }
      }

      // Configure environment paths
      if (typeof mod.setupLambdaEnvironment === 'function') {
        mod.setupLambdaEnvironment(al2023Lib);
      }

      // Ensure LD_LIBRARY_PATH has al2023Lib and standard Linux library paths
      const currentLd = process.env.LD_LIBRARY_PATH || '';
      const pathsToAdd = [al2023Lib, '/lib/x86_64-linux-gnu', '/usr/lib/x86_64-linux-gnu'];
      const combinedLd = [...new Set([...pathsToAdd, ...currentLd.split(':')])].filter(Boolean).join(':');
      process.env.LD_LIBRARY_PATH = combinedLd;
      console.log('[PDF] Configured LD_LIBRARY_PATH:', process.env.LD_LIBRARY_PATH);

      return chromium;
    })();
  }
  return chromiumPromise;
}

function safePdfFilename(value: unknown) {
  const raw = String(value ?? '').trim();
  const base = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 180);
  return `${base || 'SPO_RSUD_Dr_Soegiri'}.pdf`;
}

async function resolveExecutable(): Promise<string> {
  const configured = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
  if (configured && fs.existsSync(configured)) return configured;

  try {
    const chromium = await getChromium();
    if (typeof chromium?.executablePath === 'function') {
      const p = await chromium.executablePath();
      if (p && fs.existsSync(p)) {
        console.log('[PDF] Chromium executable resolved from @sparticuz/chromium:', p);
        return p;
      }
    }
  } catch (e) {
    console.error('[PDF] Chromium resolution from package failed:', e);
  }

  const systemCandidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
    '/usr/lib/chromium/chrome'
  ];

  const found = systemCandidates.find((p) => fs.existsSync(p));
  if (found) {
    console.log('[PDF] Using system Chrome/Chromium:', found);
    return found;
  }

  return '';
}

let cachedBookmanCss: string | null = null;

/**
 * PDF-only font normalization. Stored rich-text may contain inline font-family
 * declarations (including !important) from pasted Word/browser content. Those
 * inline declarations can outrank the PDF stylesheet and cause mixed fonts.
 * Remove explicit source font declarations before rendering, then the PDF
 * stylesheet below becomes the single authority: Bookman Old Style.
 */
function normalizePdfFonts(html: string, css: string): { html: string; css: string } {
  const normalizedHtml = html
    .replace(/font-family\s*:[^;"}]+;?/gi, '')
    .replace(/\s+face\s*=\s*["'][^"']*["']/gi, '');

  const normalizedCss = css.replace(
    /font-family\s*:[^;}{]+;?/gi,
    'font-family: "Bookman Old Style", "URW Bookman", serif !important;'
  );

  return { html: normalizedHtml, css: normalizedCss };
}


function getBookmanFontFaceCss(): string {
  if (cachedBookmanCss) return cachedBookmanCss;
  try {
    const fontsDir = path.resolve(process.cwd(), 'public', 'fonts');
    const readBase64 = (filename: string) => {
      const fullPath = path.join(fontsDir, filename);
      if (fs.existsSync(fullPath)) {
        const buf = fs.readFileSync(fullPath);
        return `data:font/otf;base64,${buf.toString('base64')}`;
      }
      return `/fonts/${filename}`;
    };

    const light = readBase64('URWBookman-Light.otf');
    const demi = readBase64('URWBookman-Demi.otf');
    const lightItalic = readBase64('URWBookman-LightItalic.otf');
    const demiItalic = readBase64('URWBookman-DemiItalic.otf');

    cachedBookmanCss = `
@font-face{font-family:"Bookman Old Style";src:url("${light}") format("opentype");font-style:normal;font-weight:400;font-display:swap;}
@font-face{font-family:"Bookman Old Style";src:url("${demi}") format("opentype");font-style:normal;font-weight:700;font-display:swap;}
@font-face{font-family:"Bookman Old Style";src:url("${lightItalic}") format("opentype");font-style:italic;font-weight:400;font-display:swap;}
@font-face{font-family:"Bookman Old Style";src:url("${demiItalic}") format("opentype");font-style:italic;font-weight:700;font-display:swap;}
`;
  } catch (err) {
    console.warn('[PDF] Could not read local font files as base64, falling back to URL:', err);
    cachedBookmanCss = `
@font-face{font-family:"Bookman Old Style";src:url("/fonts/URWBookman-Light.otf") format("opentype");font-style:normal;font-weight:400;font-display:swap;}
@font-face{font-family:"Bookman Old Style";src:url("/fonts/URWBookman-Demi.otf") format("opentype");font-style:normal;font-weight:700;font-display:swap;}
@font-face{font-family:"Bookman Old Style";src:url("/fonts/URWBookman-LightItalic.otf") format("opentype");font-style:italic;font-weight:400;font-display:swap;}
@font-face{font-family:"Bookman Old Style";src:url("/fonts/URWBookman-DemiItalic.otf") format("opentype");font-style:italic;font-weight:700;font-display:swap;}
`;
  }
  return cachedBookmanCss;
}

export async function generatePdf(body: any) {
  const rawDocumentHtml = String(body?.html || '');
  const rawCss = String(body?.css || '');
  const normalizedPdf = normalizePdfFonts(rawDocumentHtml, rawCss);
  const documentHtml = normalizedPdf.html;
  const css = normalizedPdf.css;
  if (!documentHtml) throw new Error('Dokumen SPO untuk PDF belum tersedia.');
  if (documentHtml.length > 12 * 1024 * 1024 || css.length > 8 * 1024 * 1024) {
    throw new Error('Ukuran dokumen terlalu besar untuk dibuat PDF.');
  }

  const baseUrl = String(body?.baseUrl || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('Alamat aplikasi untuk aset dokumen tidak tersedia.');

  const bookmanCss = getBookmanFontFaceCss();
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=210mm, initial-scale=1"><base href="${baseUrl.replace(/"/g, '&quot;')}/"><style>
${bookmanCss}
${css}
html,body{margin:0!important;padding:0!important;width:210mm!important;background:#fff!important;color:#000!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;font-family:"Bookman Old Style","URW Bookman",serif!important;}
#printable-sop-official-document,#printable-sop-official-document *,.font-bookman,.font-bookman *,.sop-batang-tubuh-title,.sop-batang-tubuh-content,.sop-batang-tubuh-content *,.rich-text-output,.rich-text-output *,.rich-text-document-content,.rich-text-document-content *{font-family:"Bookman Old Style","URW Bookman",serif!important;}

@page{size:A4 portrait;margin:0}
#printable-sop-official-document{width:210mm!important;margin:0!important;padding:0!important}
#printable-sop-official-document .sop-preview-page{width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;margin:0!important;padding:20mm 20mm 20mm 30mm!important;box-sizing:border-box!important;overflow:hidden!important;break-inside:avoid!important;page-break-inside:avoid!important;break-after:page!important;page-break-after:always!important}
#printable-sop-official-document .sop-preview-page:last-child{break-after:auto!important;page-break-after:auto!important}
#printable-sop-official-document.pdf-export-document table.sop-official-table{display:table!important;width:100%!important;table-layout:fixed!important;border-collapse:collapse!important;border-spacing:0!important;border:1px solid #000!important;background:#fff!important;margin:0!important}
#printable-sop-official-document.pdf-export-document .sop-official-table>thead{display:table-header-group!important}
#printable-sop-official-document.pdf-export-document .sop-official-table>tbody{display:table-row-group!important}
#printable-sop-official-document.pdf-export-document .sop-official-table td,#printable-sop-official-document.pdf-export-document .sop-official-table th{display:table-cell!important;border:1px solid #000!important;box-sizing:border-box!important;vertical-align:top!important;word-break:normal!important;overflow-wrap:break-word!important;word-wrap:break-word!important;hyphens:none!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
.no-print{display:none!important}
</style></head><body>${documentHtml}</body></html>`;

  let browser: any;
  try {
    const executablePath = await resolveExecutable();
    if (!executablePath) throw new Error('Engine PDF Chromium tidak tersedia.');

    console.log('[PDF] Launching Chromium:', executablePath);
    const chromium = await getChromium();
    const rawChromiumArgs = Array.isArray(chromium?.args) ? chromium.args : [];
    // CRITICAL: --single-process causes renderer crash / "Target closed" in Puppeteer container environments
    const safeChromiumArgs = rawChromiumArgs.filter(
      (arg: string) => !arg.includes('single-process')
    );

    browser = await puppeteer.launch({
      headless: 'shell',
      executablePath,
      defaultViewport: chromium?.defaultViewport || { width: 1280, height: 900 },
      args: [
        ...safeChromiumArgs,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--font-render-hinting=none'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.emulateMediaType('print');
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });

    try {
      await page.evaluate(async () => {
        if (document.fonts?.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 3000))
          ]).catch(() => undefined);
        }
        if (document.fonts?.load) {
          try {
            await Promise.allSettled([
              document.fonts.load('400 12px "Bookman Old Style"'),
              document.fonts.load('700 12px "Bookman Old Style"'),
              document.fonts.load('italic 400 12px "Bookman Old Style"'),
              document.fonts.load('italic 700 12px "Bookman Old Style"')
            ]);
          } catch {
            // Non-fatal font load fallback
          }
        }
        const probe = document.querySelector('#printable-sop-official-document') as HTMLElement | null;
        if (probe) console.log('[PDF] Resolved font:', getComputedStyle(probe).fontFamily);

        const imgPromises = Array.from(document.images || []).map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
            setTimeout(resolve, 1500); // 1.5s max wait per image
          });
        });
        await Promise.allSettled(imgPromises);
      });
    } catch (evalErr) {
      console.warn('[PDF] Non-fatal evaluate warning:', evalErr);
    }

    try {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
    } catch (rafErr) {
      console.warn('[PDF] Non-fatal RAF wait warning:', rafErr);
    }

    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    const pdf = Buffer.from(pdfBytes);
    if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('PDF_RENDER_INVALID_OUTPUT');
    }

    const title =
      body?.title ??
      body?.judul ??
      body?.documentTitle ??
      body?.filename ??
      body?.sopNumber;

    console.log('[PDF] PDF rendered successfully. Size:', pdf.length, 'bytes');
    return { pdf, filename: safePdfFilename(title) };
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
