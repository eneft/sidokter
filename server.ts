import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { generatePdf } from './server/pdfRenderer';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Accept,Authorization,X-Soegiri-Auth-Uid,X-Soegiri-Session-Id,X-Soegiri-Username');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.resolve(process.cwd(), 'public')));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'SOEGIRI_DOCS', pdf: 'native' }));

app.post('/api/pdf', async (req, res) => {
  try {
    const authUid = String(
      req.headers['x-soegiri-auth-uid'] ||
      req.headers['authorization'] ||
      req.headers['x-user-id'] ||
      req.body?.authUid ||
      ''
    ).trim();

    if (!authUid) {
      console.warn('[api/pdf] Missing auth header/field, but proceeding with request.');
    }

    const { pdf, filename } = await generatePdf({
      ...req.body,
      baseUrl: req.body?.baseUrl || `${req.protocol}://${req.get('host')}`
    });

    const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    if (pdfBuffer.length < 5 || pdfBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('PDF_RENDER_INVALID_OUTPUT');
    }

    const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, '%27');

    res.status(200).set({
      'Content-Type': 'application/pdf',
      'X-Soegiri-PDF-Filename': encodeURIComponent(filename),
      'Content-Disposition': `attachment; filename="SPO_RSUD_Dr_Soegiri.pdf"; filename*=UTF-8''${encodedFilename}`,
      'Cache-Control': 'private, no-store, max-age=0'
    }).send(pdfBuffer);
  } catch (error: any) {
    console.error('[api/pdf] PDF generation failed:', error);
    const code = String(error?.message || 'PDF_RENDER_ERROR');
    const status =
      code === 'UNAUTHENTICATED' || code === 'USER_NOT_FOUND' || code === 'SESSION_REVOKED'
        ? 401
        : code === 'FORBIDDEN'
        ? 403
        : 500;
    res.status(status).json({
      success: false,
      message:
        status === 401
          ? 'Sesi login tidak valid atau sudah dicabut. Silakan login kembali.'
          : `PDF gagal dibuat: ${code}`,
      detail: code
    });
  }
});

async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });

  app.use(vite.middlewares);

  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SIDOKTER SOEGIRI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((e) => {
  console.error(e);
  process.exit(1);
});

