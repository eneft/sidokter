import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';

if (!process.env.AWS_EXECUTION_ENV) {
  process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
}

let chromiumPromise: Promise<any> | null = null;

async function getChromium() {
  if (!chromiumPromise) {
    chromiumPromise = (async () => {
      const mod: any = await import('@sparticuz/chromium');
      const chromium = mod.default || mod;

      const al2023Lib = path.join(tmpdir(), 'al2023', 'lib');
      const nsprPath = path.join(al2023Lib, 'libnspr4.so');

      if (!fs.existsSync(nsprPath) && typeof mod.inflate === 'function') {
        try {
          const binDirCandidates = [
            path.join(process.cwd(), 'node_modules', '@sparticuz', 'chromium', 'bin'),
            path.join(__dirname, '..', 'node_modules', '@sparticuz', 'chromium', 'bin'),
            path.join(__dirname, 'node_modules', '@sparticuz', 'chromium', 'bin'),
            '/var/task/node_modules/@sparticuz/chromium/bin'
          ];

          for (const binDir of binDirCandidates) {
            const al2023Tar = path.join(binDir, 'al2023.tar.br');
            if (fs.existsSync(al2023Tar)) {
              await mod.inflate(al2023Tar);
              break;
            }
          }
        } catch (err) {
          console.warn('[PDF] Failed to inflate AL2023:', err);
        }
      }

      if (typeof mod.setupLambdaEnvironment === 'function') {
        mod.setupLambdaEnvironment(al2023Lib);
      }

      const currentLd = process.env.LD_LIBRARY_PATH || '';

      const pathsToAdd = [
        al2023Lib,
        '/lib/x86_64-linux-gnu',
        '/usr/lib/x86_64-linux-gnu',
      ];

      process.env.LD_LIBRARY_PATH = [
        ...new Set([
          ...pathsToAdd,
          ...currentLd.split(':'),
        ]),
      ]
        .filter(Boolean)
        .join(':');

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
  const configured =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_BIN;

  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  try {
    const chromium = await getChromium();

    if (typeof chromium?.executablePath === 'function') {
      const executable = await chromium.executablePath();

      if (executable && fs.existsSync(executable)) {
        console.log(
          '[PDF] Chromium executable:',
          executable
        );

        return executable;
      }
    }
  } catch (error) {
    console.error(
      '[PDF] Chromium resolution failed:',
      error
    );
  }

  const systemCandidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
    '/usr/lib/chromium/chrome',
  ];

  return (
    systemCandidates.find((p) => fs.existsSync(p)) || ''
  );
}

let cachedBookmanCss: string | null = null;


function getAssetDirs(): string[] {
  return [
    path.resolve(process.cwd(), 'public'),
    path.resolve(__dirname, '..', 'public'),
    path.resolve(__dirname, 'public'),
    path.resolve(process.cwd(), 'functions', 'assets'),
    path.resolve(__dirname, '..', 'functions', 'assets'),
    path.resolve(__dirname, 'assets'),
    '/var/task/public',
    '/var/task/functions/assets'
  ];
}

function getFontDirs(): string[] {
  return [
    path.resolve(process.cwd(), 'public', 'fonts'),
    path.resolve(__dirname, '..', 'public', 'fonts'),
    path.resolve(__dirname, 'public', 'fonts'),
    path.resolve(process.cwd(), 'functions', 'fonts'),
    path.resolve(__dirname, '..', 'functions', 'fonts'),
    path.resolve(__dirname, 'fonts'),
    '/var/task/public/fonts',
    '/var/task/functions/fonts'
  ];
}

function inlineLocalPdfImages(documentHtml: string): string {
  // Chromium used by the PDF endpoint runs outside the browser session.
  // Public image URLs can therefore fail (auth/proxy/base-url issues), even
  // though the same images are visible in the web preview. Resolve the
  // official document assets from the deployed filesystem and inline ONLY
  // those small, known local assets server-side. This keeps the POST payload
  // small and avoids the previous 413 problem caused by client-side base64.
  const assetDirs = getAssetDirs();
  const allowedAssets = new Set([
    '/logo_soegiri_transparent.png',
    '/logo_soegiri_stamp.png',
    '/ttd_direktur.png',
  ]);

  return documentHtml.replace(/(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_m, prefix, src, suffix) => {
    const rawSrc = String(src || '').trim();
    if (!rawSrc || rawSrc.startsWith('data:') || rawSrc.startsWith('blob:')) {
      return `${prefix}${rawSrc}${suffix}`;
    }

    let pathname = rawSrc;
    try {
      pathname = new URL(rawSrc, 'http://pdf.local').pathname;
    } catch {
      // Keep the original source if it is not a valid URL.
    }

    if (!allowedAssets.has(pathname)) return `${prefix}${rawSrc}${suffix}`;

    const filename = pathname.slice(1);
    for (const dir of assetDirs) {
      const assetPath = path.join(dir, filename);
      if (fs.existsSync(assetPath)) {
        try {
          const ext = path.extname(assetPath).toLowerCase();
          const mime = ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.webp'
              ? 'image/webp'
              : 'image/png';
          const dataUri = `data:${mime};base64,${fs.readFileSync(assetPath).toString('base64')}`;
          return `${prefix}${dataUri}${suffix}`;
        } catch (err) {
          console.warn('[PDF] Failed to inline local image asset:', assetPath, err);
        }
      }
    }

    return `${prefix}${rawSrc}${suffix}`;
  });
}

function getBookmanFontFaceCss(): string {
  if (cachedBookmanCss) return cachedBookmanCss;
  try {
    const fontDirs = getFontDirs();
    const readBase64 = (filename: string) => {
      for (const dir of fontDirs) {
        const fullPath = path.join(dir, filename);
        if (fs.existsSync(fullPath)) {
          const buf = fs.readFileSync(fullPath);
          return `data:font/otf;base64,${buf.toString('base64')}`;
        }
      }
      return `/fonts/${filename}`;
    };

    const light = readBase64('URWBookman-Light.otf');
    const demi = readBase64('URWBookman-Demi.otf');
    const lightItalic = readBase64('URWBookman-LightItalic.otf');
    const demiItalic = readBase64('URWBookman-DemiItalic.otf');

    cachedBookmanCss = `
@font-face {
  font-family: "Bookman Old Style";
  src: url("${light}") format("opentype");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Bookman Old Style";
  src: url("${demi}") format("opentype");
  font-style: normal;
  font-weight: 700;
  font-display: swap;
}
@font-face {
  font-family: "Bookman Old Style";
  src: url("${lightItalic}") format("opentype");
  font-style: italic;
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Bookman Old Style";
  src: url("${demiItalic}") format("opentype");
  font-style: italic;
  font-weight: 700;
  font-display: swap;
}
`;
  } catch (err) {
    console.warn('[PDF] Could not read local font files as base64, falling back to URL:', err);
    cachedBookmanCss = `
@font-face {
  font-family: "Bookman Old Style";
  src: url("/fonts/URWBookman-Light.otf") format("opentype");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Bookman Old Style";
  src: url("/fonts/URWBookman-Demi.otf") format("opentype");
  font-style: normal;
  font-weight: 700;
  font-display: swap;
}
@font-face {
  font-family: "Bookman Old Style";
  src: url("/fonts/URWBookman-LightItalic.otf") format("opentype");
  font-style: italic;
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Bookman Old Style";
  src: url("/fonts/URWBookman-DemiItalic.otf") format("opentype");
  font-style: italic;
  font-weight: 700;
  font-display: swap;
}
`;
  }
  return cachedBookmanCss;
}

async function generatePdf(body: any) {
  const documentHtml = String(body?.html || '');
  const css = String(body?.css || '');

  if (!documentHtml) {
    throw new Error(
      'Dokumen SPO untuk PDF belum tersedia.'
    );
  }

  if (
    documentHtml.length > 15 * 1024 * 1024 ||
    css.length > 8 * 1024 * 1024
  ) {
    throw new Error(
      'Ukuran dokumen terlalu besar untuk dibuat PDF.'
    );
  }

  const baseUrl = String(
    body?.baseUrl || 'http://localhost:3000'
  ).replace(/\/$/, '');

  const bookmanCss = getBookmanFontFaceCss();
  const pdfDocumentHtml = inlineLocalPdfImages(documentHtml);
  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport"
content="width=210mm, initial-scale=1">

<base href="${baseUrl.replace(/"/g, '&quot;')}/">

<style>

${bookmanCss}
${css}

html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 210mm !important;
  background: #fff !important;
  color: #000 !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  font-family: "Bookman Old Style", "URW Bookman", serif !important;
}

#printable-sop-official-document,
#printable-sop-official-document *,
.font-bookman,
.font-bookman *,
.sop-batang-tubuh-title,
.sop-batang-tubuh-content,
.sop-batang-tubuh-content *,
.rich-text-output,
.rich-text-output *,
.rich-text-document-content,
.rich-text-document-content * {
  font-family: "Bookman Old Style", "URW Bookman", serif !important;
}

@page {
  size: A4 portrait;
  margin: 0;
}

#printable-sop-official-document {
  width: 210mm !important;
  margin: 0 !important;
  padding: 0 !important;
}

#printable-sop-official-document .sop-preview-page {
  width: 210mm !important;
  height: 297mm !important;
  min-height: 297mm !important;
  max-height: 297mm !important;
  margin: 0 !important;
  padding: 20mm 20mm 20mm 20mm !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
  break-after: page !important;
  page-break-after: always !important;
}

#printable-sop-official-document .sop-preview-page:last-child {
  break-after: auto !important;
  page-break-after: auto !important;
}

#printable-sop-official-document.pdf-export-document table.sop-official-table {
  display: table !important;
  width: 100% !important;
  table-layout: fixed !important;
  border-collapse: collapse !important;
  border-spacing: 0 !important;
  border: 1px solid #000 !important;
  background: #fff !important;
  margin: 0 !important;
}

#printable-sop-official-document.pdf-export-document .sop-official-table > thead {
  display: table-header-group !important;
}

#printable-sop-official-document.pdf-export-document .sop-official-table > tbody {
  display: table-row-group !important;
}

#printable-sop-official-document .pdf-export-document .sop-official-table td.sop-document-type-label,
#printable-sop-official-document .sop-official-table td.sop-document-type-label,
table.sop-official-table td.sop-document-type-label {
  vertical-align: middle !important;
}

#printable-sop-official-document.pdf-export-document .sop-official-table td,
#printable-sop-official-document.pdf-export-document .sop-official-table th {
  display: table-cell !important;
  border: 1px solid #000 !important;
  box-sizing: border-box !important;
  vertical-align: top !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
  word-wrap: break-word !important;
  hyphens: none !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table,
#printable-sop-official-document.pdf-export-document .rich-text-output table,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table {
  width: auto;
  border-collapse: collapse !important;
}

#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table:not([data-table-autofit="true"]),
#printable-sop-official-document.pdf-export-document .rich-text-output table:not([data-table-autofit="true"]),
#printable-sop-official-document.pdf-export-document .rich-text-document-content table:not([data-table-autofit="true"]) {
  table-layout: fixed;
}

#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table[data-table-autofit="true"],
#printable-sop-official-document.pdf-export-document .rich-text-output table[data-table-autofit="true"],
#printable-sop-official-document.pdf-export-document .rich-text-document-content table[data-table-autofit="true"] {
  width: fit-content !important;
  max-width: 100% !important;
  table-layout: auto !important;
}

#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table[data-table-autofit="true"] > colgroup > col,
#printable-sop-official-document.pdf-export-document .rich-text-output table[data-table-autofit="true"] > colgroup > col,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table[data-table-autofit="true"] > colgroup > col {
  width: auto !important;
}

#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table[data-table-width],
#printable-sop-official-document.pdf-export-document .rich-text-output table[data-table-width],
#printable-sop-official-document.pdf-export-document .rich-text-document-content table[data-table-width] {
  width: var(--table-width) !important;
  max-width: 100% !important;
}

#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table thead,
#printable-sop-official-document.pdf-export-document .rich-text-output table thead,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table thead {
  display: table-header-group !important;
}

#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th,
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td,
#printable-sop-official-document.pdf-export-document .rich-text-output table th,
#printable-sop-official-document.pdf-export-document .rich-text-output table td,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table th,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table td,
#printable-sop-official-document .sop-batang-tubuh-content table th,
#printable-sop-official-document .sop-batang-tubuh-content table td,
#printable-sop-official-document .rich-text-output table th,
#printable-sop-official-document .rich-text-output table td,
#printable-sop-official-document .rich-text-document-content table th,
#printable-sop-official-document .rich-text-document-content table td {
  border: 1px solid #000 !important;
  padding: .5px 2mm !important;
  padding-top: .5px !important;
  padding-bottom: .5px !important;
  padding-left: 2mm !important;
  padding-right: 2mm !important;
  vertical-align: top !important;
  line-height: 1.05 !important;
  letter-spacing: normal !important;
}

#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td *,
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th *,
#printable-sop-official-document.pdf-export-document .rich-text-output table td *,
#printable-sop-official-document.pdf-export-document .rich-text-output table th *,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table td *,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table th *,
#printable-sop-official-document .sop-batang-tubuh-content table td *,
#printable-sop-official-document .sop-batang-tubuh-content table th *,
#printable-sop-official-document .rich-text-output table td *,
#printable-sop-official-document .rich-text-output table th *,
#printable-sop-official-document .rich-text-document-content table td *,
#printable-sop-official-document .rich-text-document-content table th * {
  line-height: 1.05 !important;
}

#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td p,
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th p,
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td div,
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th div,
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td ul,
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th ul,
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td ol,
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th ol,
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td li,
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th li,
#printable-sop-official-document.pdf-export-document .rich-text-output table td p,
#printable-sop-official-document.pdf-export-document .rich-text-output table th p,
#printable-sop-official-document.pdf-export-document .rich-text-output table td div,
#printable-sop-official-document.pdf-export-document .rich-text-output table th div,
#printable-sop-official-document.pdf-export-document .rich-text-output table td ul,
#printable-sop-official-document.pdf-export-document .rich-text-output table th ul,
#printable-sop-official-document.pdf-export-document .rich-text-output table td ol,
#printable-sop-official-document.pdf-export-document .rich-text-output table th ol,
#printable-sop-official-document.pdf-export-document .rich-text-output table td li,
#printable-sop-official-document.pdf-export-document .rich-text-output table th li,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table td p,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table th p,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table td div,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table th div,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table td ul,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table th ul,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table td ol,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table th ol,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table td li,
#printable-sop-official-document.pdf-export-document .rich-text-document-content table th li,
#printable-sop-official-document .sop-batang-tubuh-content table td p,
#printable-sop-official-document .sop-batang-tubuh-content table th p,
#printable-sop-official-document .sop-batang-tubuh-content table td div,
#printable-sop-official-document .sop-batang-tubuh-content table th div,
#printable-sop-official-document .sop-batang-tubuh-content table td ul,
#printable-sop-official-document .sop-batang-tubuh-content table th ul,
#printable-sop-official-document .sop-batang-tubuh-content table td ol,
#printable-sop-official-document .sop-batang-tubuh-content table th ol,
#printable-sop-official-document .sop-batang-tubuh-content table td li,
#printable-sop-official-document .sop-batang-tubuh-content table th li,
#printable-sop-official-document .rich-text-output table td p,
#printable-sop-official-document .rich-text-output table th p,
#printable-sop-official-document .rich-text-output table td div,
#printable-sop-official-document .rich-text-output table th div,
#printable-sop-official-document .rich-text-output table td ul,
#printable-sop-official-document .rich-text-output table th ul,
#printable-sop-official-document .rich-text-output table td ol,
#printable-sop-official-document .rich-text-output table td ol,
#printable-sop-official-document .rich-text-output table td li,
#printable-sop-official-document .rich-text-output table th li,
#printable-sop-official-document .rich-text-document-content table td p,
#printable-sop-official-document .rich-text-document-content table th p,
#printable-sop-official-document .rich-text-document-content table td div,
#printable-sop-official-document .rich-text-document-content table th div,
#printable-sop-official-document .rich-text-document-content table td ul,
#printable-sop-official-document .rich-text-document-content table th ul,
#printable-sop-official-document .rich-text-document-content table td ol,
#printable-sop-official-document .rich-text-document-content table th ol,
#printable-sop-official-document .rich-text-document-content table td li,
#printable-sop-official-document .rich-text-document-content table th li {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  line-height: 1.05 !important;
}

.figure-wrapper {
  position: relative !important;
  box-sizing: border-box !important;
  max-width: 100% !important;
}

.figure-wrapper img {
  width: 100% !important;
  height: auto !important;
  display: block !important;
  border-radius: 2px !important;
}

.figure-wrapper[data-wrap="top-bottom"] {
  display: block !important;
  clear: both !important;
  float: none !important;
  margin-top: 10px !important;
  margin-bottom: 10px !important;
}

.figure-wrapper[data-wrap="top-bottom"][data-align="left"] {
  margin-left: 0 !important;
  margin-right: auto !important;
  text-align: left !important;
}

.figure-wrapper[data-wrap="top-bottom"][data-align="center"] {
  margin-left: auto !important;
  margin-right: auto !important;
  text-align: center !important;
}

.figure-wrapper[data-wrap="top-bottom"][data-align="right"] {
  margin-left: auto !important;
  margin-right: 0 !important;
  text-align: right !important;
}

.figure-wrapper[data-wrap="square"][data-align="left"],
.figure-wrapper[data-wrap="square"]:not([data-align="right"]):not([data-align="center"]) {
  float: left !important;
  margin: 4px 18px 10px 0 !important;
  clear: none !important;
}

.figure-wrapper[data-wrap="square"][data-align="right"] {
  float: right !important;
  margin: 4px 0 10px 18px !important;
  clear: none !important;
}

.figure-wrapper[data-wrap="inline"] {
  display: inline-block !important;
  vertical-align: middle !important;
  float: none !important;
  clear: none !important;
  margin: 2px 6px !important;
}

.rich-text-document-content::after,
.rich-text-output::after {
  content: "";
  display: table;
  clear: both;
}

/* Final PDF cascade guard: continuation pages have one authoritative bottom
   rule, drawn by the continuation filler at the canonical page floor. Keep
   this AFTER the generic PDF table/cell border rules above. */
#printable-sop-official-document.pdf-export-document table.sop-official-table.sop-continuation-page-table {
  border-bottom: 0 !important;
}

#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"] > td,
#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"] > th {
  border-bottom: 0 !important;
}

.no-print {
  display: none !important;
}

</style>
</head>

<body>
${pdfDocumentHtml}
</body>
</html>`;

  let browser: any;

  try {
    const executablePath =
      await resolveExecutable();

    if (!executablePath) {
      throw new Error(
        'Engine PDF Chromium tidak tersedia.'
      );
    }

    const chromium =
      await getChromium();

    browser =
      await puppeteer.launch({
        args: chromium?.args || [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote'
        ],
        defaultViewport:
          chromium?.defaultViewport ||
          {
            width: 1280,
            height: 900,
          },
        executablePath,
        headless: true
      });

    const page =
      await browser.newPage();

    await page.setViewport({
      width: 794,
      height: 1123,
      deviceScaleFactor: 1,
    });

    await page.emulateMediaType(
      'print'
    );

    await page.setContent(
      html,
      {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      }
    );

    try {
      await page.evaluate(
        async () => {
          if (document.fonts?.ready) {
            await Promise.race([
              document.fonts.ready,
              new Promise(
                (resolve) =>
                  setTimeout(
                    resolve,
                    3000
                  )
              ),
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

          const imgPromises =
            Array.from(
              document.images || []
            ).map((img) => {
              if (img.complete) {
                return Promise.resolve();
              }

              return new Promise<void>(
                (resolve) => {
                  img.addEventListener(
                    'load',
                    () => resolve(),
                    { once: true }
                  );

                  img.addEventListener(
                    'error',
                    () => resolve(),
                    { once: true }
                  );

                  setTimeout(
                    resolve,
                    1500
                  );
                }
              );
            });

          await Promise.allSettled(
            imgPromises
          );
        }
      );
    } catch (error) {
      console.warn(
        '[PDF] Page wait warning:',
        error
      );
    }

    try {
      await page.evaluate(
        () =>
          new Promise<void>(
            (resolve) =>
              requestAnimationFrame(
                () =>
                  requestAnimationFrame(
                    () => resolve()
                  )
              )
          )
      );
    } catch (error) {
      console.warn(
        '[PDF] RAF warning:',
        error
      );
    }

    const pdfBytes =
      await page.pdf({
        format: 'A4',

        printBackground: true,

        preferCSSPageSize: true,

        margin: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        },
      });

    const pdf =
      Buffer.from(pdfBytes);

    if (
      pdf.length < 5 ||
      pdf
        .subarray(0, 5)
        .toString('ascii') !== '%PDF-'
    ) {
      throw new Error(
        'PDF_RENDER_INVALID_OUTPUT'
      );
    }

    const title =
      body?.title ??
      body?.judul ??
      body?.documentTitle ??
      body?.filename ??
      body?.sopNumber;

    return {
      pdf,
      filename:
        safePdfFilename(title),
    };

  } finally {
    if (browser) {
      await browser
        .close()
        .catch(() => undefined);
    }
  }
}

const CANONICAL_FIREBASE_PDF_API =
  'https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/pdfApi';

const PRIMARY_CLOUD_PDF_API_URL = 'https://pdfapi-n7zygxitla-et.a.run.app';

const UPSTREAM_PDF_URLS = Array.from(new Set([
  CANONICAL_FIREBASE_PDF_API,
  PRIMARY_CLOUD_PDF_API_URL,
  process.env.FIREBASE_PDF_API,
  process.env.PDF_API_URL,
  process.env.UPSTREAM_PDF_API_URL,
  process.env.VITE_PDF_API_URL
].filter(u => typeof u === 'string' && u.startsWith('http')) as string[]));

async function parseRequestBody(req: any): Promise<Record<string, any>> {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (req.readableEnded || req.complete || typeof req.on !== 'function') {
    return {};
  }
  return new Promise((resolve) => {
    const chunks: any[] = [];
    const timer = setTimeout(() => resolve({}), 4000);

    req.on('data', (chunk: any) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      clearTimeout(timer);
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => {
      clearTimeout(timer);
      resolve({});
    });
  });
}

export default async function handler(req: any, res: any) {
  const origin = String(req.headers?.origin || '*');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,Accept,Authorization,X-Session-Id,X-Soegiri-Session-Id,X-Soegiri-Auth-Uid,X-User-Username'
  );
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method Not Allowed'
    });
  }

  let body: Record<string, any> = {};
  try {
    body = await parseRequestBody(req);
  } catch {
    body = {};
  }

  const forwardHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/pdf, application/json'
  };
  if (req.headers?.authorization) forwardHeaders.Authorization = String(req.headers.authorization);
  if (req.headers?.['x-session-id']) {
    forwardHeaders['X-Session-Id'] = String(req.headers['x-session-id']);
    forwardHeaders['X-Soegiri-Session-Id'] = String(req.headers['x-session-id']);
  }
  if (req.headers?.['x-soegiri-session-id']) {
    forwardHeaders['X-Soegiri-Session-Id'] = String(req.headers['x-soegiri-session-id']);
    if (!forwardHeaders['X-Session-Id']) forwardHeaders['X-Session-Id'] = String(req.headers['x-soegiri-session-id']);
  }
  if (req.headers?.['x-soegiri-auth-uid']) forwardHeaders['X-Soegiri-Auth-Uid'] = String(req.headers['x-soegiri-auth-uid']);
  if (req.headers?.['x-user-id']) forwardHeaders['X-Soegiri-Auth-Uid'] = String(req.headers['x-user-id']);
  if (req.headers?.['x-user-username']) forwardHeaders['X-User-Username'] = String(req.headers['x-user-username']);
  if (req.headers?.['user-agent']) forwardHeaders['User-Agent'] = String(req.headers['user-agent']);

  const protocol = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers?.host || '').trim();
  const baseUrl = body.baseUrl || (host ? `${protocol}://${host}` : '');
  const bodyPayload = { ...body, baseUrl };
  const bodyJson = JSON.stringify(bodyPayload);

  let lastError: any = null;

  // 1. Prefer local Chromium renderer for 100% parity with development preview
  try {
    const { pdf, filename } = await generatePdf(bodyPayload);
    const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    if (pdfBuffer.length >= 5 && pdfBuffer.subarray(0, 5).toString('ascii') === '%PDF-') {
      const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, '%27');
      res.status(200);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="SPO_RSUD_Dr_Soegiri.pdf"; filename*=UTF-8''${encodedFilename}`
      );
      res.setHeader('X-Soegiri-PDF-Filename', encodeURIComponent(filename));
      res.setHeader('Content-Length', String(pdfBuffer.length));
      return res.send(pdfBuffer);
    }
  } catch (localErr: any) {
    console.warn('[api/pdf] Local PDF generation failed, falling back to upstream cloud services:', localErr?.message);
    lastError = localErr;
  }

  // 2. Fallback to upstream dedicated PDF Cloud Services (Firebase Cloud Functions / Cloud Run)
  for (const upstreamUrl of UPSTREAM_PDF_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const upstreamRes = await fetch(upstreamUrl, {
        method: 'POST',
        headers: forwardHeaders,
        body: bodyJson,
        signal: controller.signal
      }).finally(() => clearTimeout(timer));

      const contentType = String(upstreamRes.headers.get('content-type') || '');
      if (upstreamRes.ok && (contentType.includes('application/pdf') || contentType.includes('octet-stream'))) {
        const arrayBuf = await upstreamRes.arrayBuffer();
        const pdfBuf = Buffer.from(arrayBuf);
        if (pdfBuf.length >= 5 && pdfBuf.subarray(0, 5).toString('ascii') === '%PDF-') {
          const upstreamDisp = upstreamRes.headers.get('content-disposition');
          const upstreamPdfName = upstreamRes.headers.get('x-soegiri-pdf-filename');
          const filename = safePdfFilename(body.filename || body.title || body.sopNumber);
          const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, '%27');

          res.status(200);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader(
            'Content-Disposition',
            upstreamDisp || `attachment; filename="SPO_RSUD_Dr_Soegiri.pdf"; filename*=UTF-8''${encodedFilename}`
          );
          if (upstreamPdfName) res.setHeader('X-Soegiri-PDF-Filename', upstreamPdfName);
          res.setHeader('Content-Length', String(pdfBuf.length));
          return res.send(pdfBuf);
        }
      }

      console.warn(`[api/pdf] Upstream ${upstreamUrl} returned HTTP ${upstreamRes.status}`);
    } catch (err: any) {
      lastError = err;
      console.warn(`[api/pdf] Upstream ${upstreamUrl} failed:`, err?.message);
    }
  }

  console.error('[api/pdf] All PDF generation methods failed:', lastError);
  const errCode = String(lastError?.message || 'PDF_GENERATION_FAILED');
  return res.status(500).json({
    success: false,
    message: 'PDF gagal dibuat: ' + errCode,
    detail: errCode
  });
}
