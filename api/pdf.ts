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
          const binDir = path.join(
            process.cwd(),
            'node_modules',
            '@sparticuz',
            'chromium',
            'bin'
          );

          const al2023Tar = path.join(binDir, 'al2023.tar.br');

          if (fs.existsSync(al2023Tar)) {
            await mod.inflate(al2023Tar);
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


function inlineLocalPdfImages(documentHtml: string): string {
  // Chromium used by the PDF endpoint runs outside the browser session.
  // Public image URLs can therefore fail (auth/proxy/base-url issues), even
  // though the same images are visible in the web preview. Resolve the
  // official document assets from the deployed filesystem and inline ONLY
  // those small, known local assets server-side. This keeps the POST payload
  // small and avoids the previous 413 problem caused by client-side base64.
  const publicDir = path.resolve(process.cwd(), 'public');
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

    const assetPath = path.join(publicDir, pathname.slice(1));
    try {
      if (!fs.existsSync(assetPath)) {
        console.warn('[PDF] Local image asset not found:', assetPath);
        return `${prefix}${rawSrc}${suffix}`;
      }

      const ext = path.extname(assetPath).toLowerCase();
      const mime = ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png';
      const dataUri = `data:${mime};base64,${fs.readFileSync(assetPath).toString('base64')}`;
      return `${prefix}${dataUri}${suffix}`;
    } catch (err) {
      console.warn('[PDF] Failed to inline local image asset:', pathname, err);
      return `${prefix}${rawSrc}${suffix}`;
    }
  });
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

  padding:
    20mm
    20mm
    20mm
    30mm !important;

  box-sizing: border-box !important;

  overflow: hidden !important;

  break-inside: avoid !important;
  page-break-inside: avoid !important;

  break-after: page !important;
  page-break-after: always !important;
}

#printable-sop-official-document
.sop-preview-page:last-child {
  break-after: auto !important;
  page-break-after: auto !important;
}

#printable-sop-official-document
.pdf-export-document
table.sop-official-table {
  display: table !important;
  width: 100% !important;

  table-layout: fixed !important;

  border-collapse: collapse !important;
  border-spacing: 0 !important;

  border: 1px solid #000 !important;

  background: #fff !important;

  margin: 0 !important;
}

#printable-sop-official-document
.pdf-export-document
.sop-official-table > thead {
  display: table-header-group !important;
}

#printable-sop-official-document
.pdf-export-document
.sop-official-table > tbody {
  display: table-row-group !important;
}

/* FINAL: the STANDAR PROSEDUR OPERASIONAL cell must override the
   generic table-cell top alignment and center against the full header row. */
#printable-sop-official-document .pdf-export-document .sop-official-table td.sop-document-type-label,
#printable-sop-official-document .sop-official-table td.sop-document-type-label,
table.sop-official-table td.sop-document-type-label {
  vertical-align: middle !important;
}

#printable-sop-official-document
.pdf-export-document
.sop-official-table td,

#printable-sop-official-document
.pdf-export-document
.sop-official-table th {
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
        headless: 'shell'
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
  'https://asia-southeast2-gen-lang-client-0880840770.cloudfunctions.net/pdfApi';

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

  // 1. Try upstream dedicated PDF Cloud Services (Firebase Cloud Functions / Cloud Run)
  for (const upstreamUrl of UPSTREAM_PDF_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);

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

      // If upstream returned explicit auth/forbidden error, propagate it
      if (upstreamRes.status === 401 || upstreamRes.status === 403 || upstreamRes.status === 400) {
        const text = await upstreamRes.text().catch(() => '');
        try {
          const jsonPayload = JSON.parse(text);
          return res.status(upstreamRes.status).json(jsonPayload);
        } catch {
          return res.status(upstreamRes.status).send(text);
        }
      }

      console.warn(`[api/pdf] Upstream ${upstreamUrl} returned HTTP ${upstreamRes.status}`);
    } catch (err: any) {
      lastError = err;
      console.warn(`[api/pdf] Upstream ${upstreamUrl} failed:`, err?.message);
    }
  }

  // 2. Fallback to local Chromium renderer
  try {
    const { pdf, filename } = await generatePdf(bodyPayload);
    const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    if (pdfBuffer.length < 5 || pdfBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('PDF_RENDER_INVALID_OUTPUT');
    }

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
  } catch (localErr: any) {
    console.error('[api/pdf] Local PDF fallback failed:', localErr);
    const errCode = String(localErr?.message || lastError?.message || 'PDF_GENERATION_FAILED');
    return res.status(500).json({
      success: false,
      message: 'PDF gagal dibuat: ' + errCode,
      detail: errCode
    });
  }
}
