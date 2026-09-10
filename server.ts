import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { generatePdf } from './server/pdfRenderer';
import { handleAuthApi, verifyServerSession } from './server/authHandler';
import { handleStorageUpload, handleStorageDownload, handleStorageDelete } from './server/storageHandler';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use((req, res, next) => {
  const origin = String(req.headers.origin || '');
  const allowedOrigin = String(process.env.AUTH_ALLOWED_ORIGIN || '');
  if (origin && (origin === allowedOrigin || !allowedOrigin || origin.startsWith('http://localhost:') || origin.includes('.run.app'))) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Accept,Authorization,X-Soegiri-Auth-Uid,X-Session-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.resolve(process.cwd(), 'public')));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'SOEGIRI_DOCS', pdf: 'native', auth: 'internal' }));

// Dedicated internal auth endpoints: /api/auth and /api/authApi
app.all(['/api/auth', '/api/authApi', '/api/auth/:action', '/api/authApi/:action'], handleAuthApi);

// File storage endpoints for document uploads & secure streaming
app.post('/api/storage/upload', handleStorageUpload);
app.get(['/api/storage/files/:id', '/api/storage/:id'], handleStorageDownload);
app.delete(['/api/storage/files/:id', '/api/storage/:id'], handleStorageDelete);


app.post('/api/pdf', async (req, res) => {
  try {
    let authUid = 'anonymous_user';
    try {
      const verifiedSession = await verifyServerSession(req);
      authUid = verifiedSession.authUid;
    } catch (authErr: any) {
      console.warn('[api/pdf] Auth verification warning:', authErr?.message);
      // If auth token is explicitly rejected, return 401
      const code = String(authErr?.message || 'UNAUTHENTICATED');
      if (code === 'SESSION_REVOKED' || code === 'UNAUTHENTICATED' || code === 'USER_NOT_FOUND') {
        return res.status(401).json({
          success: false,
          message: 'Sesi login tidak valid atau sudah kedaluwarsa. Silakan login kembali.',
          detail: code
        });
      }
      // Otherwise fallback to client-provided authUid if available
      authUid = (req.body?.authUid as string) || 'authenticated_user';
    }

    const host = req.get('host');
    const computedBase = host ? `${req.protocol}://${host}` : 'http://localhost:3000';
    const { pdf, filename } = await generatePdf({
      ...req.body,
      authUid,
      baseUrl: req.body?.baseUrl || computedBase
    });

    const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    if (pdfBuffer.length < 5 || pdfBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('PDF_RENDER_INVALID_OUTPUT');
    }

    const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, '%27');

    res.status(200).set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdfBuffer.length),
      'X-Soegiri-PDF-Filename': encodeURIComponent(filename),
      'Content-Disposition': `attachment; filename="SPO_RSUD_Dr_Soegiri.pdf"; filename*=UTF-8''${encodedFilename}`,
      'Cache-Control': 'private, no-store, max-age=0'
    }).send(pdfBuffer);
  } catch (error: any) {
    console.error('[api/pdf] PDF generation failed:', error);
    const code = String(error?.message || 'PDF_RENDER_ERROR');
    const status =
      code === 'UNAUTHENTICATED' || code === 'USER_NOT_FOUND' || code === 'SESSION_REVOKED' || code === 'SESSION_REQUIRED'
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

// Explicit error handler to guarantee clean JSON response on any server or body-parser error
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error Middleware]:', err);
  const status = Number(err?.status || err?.statusCode || 500);
  res.status(status).json({
    success: false,
    message: err?.message || 'Terjadi kesalahan pada server saat memproses permintaan.',
    detail: String(err?.code || err?.message || 'INTERNAL_SERVER_ERROR')
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa'
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SIDOKTER SOEGIRI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((e) => {
  console.error(e);
  process.exit(1);
});

