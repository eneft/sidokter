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

async function generatePdf(body: any) {
  const documentHtml = String(body?.html || '');
  const css = String(body?.css || '');

  if (!documentHtml) {
    throw new Error(
      'Dokumen SPO untuk PDF belum tersedia.'
    );
  }

  if (
    documentHtml.length > 12 * 1024 * 1024 ||
    css.length > 8 * 1024 * 1024
  ) {
    throw new Error(
      'Ukuran dokumen terlalu besar untuk dibuat PDF.'
    );
  }

  const baseUrl = String(
    body?.baseUrl || ''
  ).replace(/\/$/, '');

  if (!baseUrl) {
    throw new Error(
      'Alamat aplikasi untuk aset dokumen tidak tersedia.'
    );
  }

  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport"
content="width=210mm, initial-scale=1">

<base href="${baseUrl.replace(/"/g, '&quot;')}/">

<style>

${css}

html,
body {
  margin: 0 !important;
  padding: 0 !important;
  width: 210mm !important;
  background: #fff !important;
  color: #000 !important;

  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;

  font-family:
    "Times New Roman",
    Times,
    "Liberation Serif",
    Georgia,
    serif !important;
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
  font-family:
    "Times New Roman",
    Times,
    "Liberation Serif",
    Georgia,
    serif !important;
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
${documentHtml}
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

    const rawChromiumArgs =
      Array.isArray(chromium?.args)
        ? chromium.args
        : [];

    const safeChromiumArgs =
      rawChromiumArgs.filter(
        (arg: string) =>
          !arg.includes('single-process')
      );

    browser =
      await puppeteer.launch({
        headless: 'shell',

        executablePath,

        defaultViewport:
          chromium?.defaultViewport ||
          {
            width: 1280,
            height: 900,
          },

        args: [
          ...safeChromiumArgs,

          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--disable-extensions',
          '--font-render-hinting=none',
        ],
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
                    2000
                  )
              ),
            ]);
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

          await Promise.all(
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

export default async function handler(
  req: any,
  res: any
) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method Not Allowed',
    });
  }

  try {
    const body =
      req.body || {};

    const protocol =
      String(
        req.headers[
          'x-forwarded-proto'
        ] || 'https'
      )
        .split(',')[0]
        .trim();

    const host =
      String(
        req.headers.host || ''
      ).trim();

    const baseUrl =
      body.baseUrl ||
      (
        host
          ? `${protocol}://${host}`
          : ''
      );

    const {
      pdf,
      filename,
    } =
      await generatePdf({
        ...body,
        baseUrl,
      });

    const encodedFilename =
      encodeURIComponent(
        filename
      ).replace(
        /['()]/g,
        '%27'
      );

    res.status(200);

    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="SPO_RSUD_Dr_Soegiri.pdf"; filename*=UTF-8''${encodedFilename}`
    );

    res.setHeader(
      'X-Soegiri-PDF-Filename',
      encodeURIComponent(
        filename
      )
    );

    res.setHeader(
      'Cache-Control',
      'private, no-store, max-age=0'
    );

    return res.send(pdf);

  } catch (error: any) {
    console.error(
      '[api/pdf] PDF generation failed:',
      error
    );

    const code =
      String(
        error?.message ||
        'PDF_RENDER_ERROR'
      );

    const status =
      code === 'UNAUTHENTICATED' ||
      code === 'USER_NOT_FOUND' ||
      code === 'SESSION_REVOKED'
        ? 401
        : code === 'FORBIDDEN'
          ? 403
          : 500;

    return res.status(
      status
    ).json({
      success: false,

      message:
        status === 401
          ? 'Sesi login tidak valid atau sudah dicabut. Silakan login kembali.'
          : `PDF gagal dibuat: ${code}`,

      detail: code,
    });
  }
}
