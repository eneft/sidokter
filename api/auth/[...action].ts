/**
 * Vercel auth proxy -> Firebase Cloud Function authApi
 *
 * IMPORTANT:
 * Jangan membaca req.body secara langsung.
 * Runtime Vercel dapat melempar "Invalid JSON" saat getter req.body
 * dipanggil. Proxy ini membaca raw request stream dan meneruskan
 * JSON mentah ke Firebase.
 */

const FIREBASE_AUTH_API =
  'https://authapi-n7zygxitla-et.a.run.app';

function readRawBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: any) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  const origin = req.headers?.origin || '*';

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,Accept,Authorization,X-Session-Id'
  );
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      message: 'Method tidak diizinkan.'
    });
  }

  try {
    /*
     * URL:
     * /api/auth/login
     * /api/auth/logout
     * /api/auth/me
     * dst.
     */
    const rawUrl = String(req.url || '');

    const match = rawUrl.match(
      /^\/api\/(?:auth|authApi)(?:\/([^?]+))?/i
    );

    const action = match?.[1]
      ? decodeURIComponent(match[1])
      : '';

    const target = action
      ? `${FIREBASE_AUTH_API}/${action}`
      : FIREBASE_AUTH_API;

    /*
     * Baca BODY RAW.
     *
     * Jangan gunakan req.body karena runtime Vercel bisa
     * melempar Invalid JSON sebelum handler kita selesai.
     */
    const rawBody = await readRawBody(req);

    /*
     * Validasi minimal supaya request kosong tidak dikirim
     * sebagai JSON rusak.
     */
    let body = rawBody;

    if (!body || !body.trim()) {
      body = '{}';
    }

    /*
     * Pastikan body memang JSON valid.
     * Kalau tidak valid, kembalikan 400 dari proxy.
     */
    try {
      JSON.parse(body);
    } catch {
      console.error(
        '[vercel-auth-proxy] Invalid incoming JSON:',
        body.slice(0, 500)
      );

      return res.status(400).json({
        message: 'Body JSON tidak valid.',
        code: 'INVALID_JSON'
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };

    const authorization = req.headers?.authorization;
    const sessionId = req.headers?.['x-session-id'];

    if (authorization) {
      headers.Authorization = String(authorization);
    }

    if (sessionId) {
      headers['X-Session-Id'] = String(sessionId);
    }

    console.log(
      `[vercel-auth-proxy] POST ${target} action=${action || '(root)'}`
    );

    const response = await fetch(target, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store'
    });

    const text = await response.text();

    let payload: any;

    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {
        message:
          text || 'Respons autentikasi tidak valid.'
      };
    }

    console.log(
      `[vercel-auth-proxy] Firebase response: ${response.status}`
    );

    return res.status(response.status).json(payload);

  } catch (error: any) {
    console.error(
      '[vercel-auth-proxy] Firebase auth request failed:',
      error
    );

    return res.status(503).json({
      message:
        'Gagal terhubung ke server autentikasi.',
      code: 'AUTH_BACKEND_UNAVAILABLE'
    });
  }
}