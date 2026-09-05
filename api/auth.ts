/**
 * Vercel Serverless Function: /api/auth
 * Proxies auth requests from Vercel deployments to backend Firebase Auth Cloud Run / Cloud Functions
 */

const UPSTREAM_URLS = [
  process.env.AUTH_API_URL,
  process.env.VITE_AUTH_API_URL,
  process.env.UPSTREAM_AUTH_API_URL,
  process.env.FIREBASE_AUTH_API,
  'https://authapi-n7zygxitla-et.a.run.app',
  'https://asia-southeast2-gen-lang-client-0880840770.cloudfunctions.net/authApi'
].filter(u => typeof u === 'string' && u.startsWith('http')) as string[];

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
    return (AbortSignal as any).timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

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
    const timer = setTimeout(() => resolve({}), 2000);

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
  const origin = req.headers?.origin || '*';

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,Accept,Authorization,X-Session-Id,X-Soegiri-Auth-Uid,X-User-Username'
  );
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method tidak diizinkan.'
    });
  }

  try {
    const parsedBody = await parseRequestBody(req);

    // Determine action: prioritize action declared in body
    let action = '';
    if (parsedBody && typeof parsedBody.action === 'string' && parsedBody.action.trim()) {
      action = parsedBody.action.trim();
    }
    if (!action) {
      const queryAction = req.query?.action || req.query?.path;
      const candidate = Array.isArray(queryAction)
        ? queryAction.filter(Boolean).join('/')
        : (typeof queryAction === 'string' ? queryAction.trim() : '');
      if (candidate && candidate !== 'index') {
        action = candidate;
      }
    }
    if (!action) {
      const rawUrl = String(req.url || '');
      const match = rawUrl.match(/^\/api\/(?:auth|authApi)(?:\/([^?]+))?/i);
      if (match?.[1] && match[1] !== 'index') {
        action = decodeURIComponent(match[1]);
      }
    }

    const payloadToSend = { ...parsedBody };
    if (action) {
      payloadToSend.action = action;
    }

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };

    if (req.headers?.authorization) {
      forwardHeaders.Authorization = String(req.headers.authorization);
    }
    if (req.headers?.['x-session-id']) {
      forwardHeaders['X-Session-Id'] = String(req.headers['x-session-id']);
    }
    if (req.headers?.['x-soegiri-auth-uid']) {
      forwardHeaders['X-Soegiri-Auth-Uid'] = String(req.headers['x-soegiri-auth-uid']);
    }
    if (req.headers?.['x-user-username']) {
      forwardHeaders['X-User-Username'] = String(req.headers['x-user-username']);
    }
    if (req.headers?.['user-agent']) {
      forwardHeaders['User-Agent'] = String(req.headers['user-agent']);
    }

    const bodyString = JSON.stringify(payloadToSend);
    const timeoutMs = action === 'user-list' ? 45000 : 25000;

    let lastError: any = null;

    for (const upstreamBase of UPSTREAM_URLS) {
      try {
        const response = await fetch(upstreamBase, {
          method: 'POST',
          headers: forwardHeaders,
          body: bodyString,
          cache: 'no-store',
          signal: createTimeoutSignal(timeoutMs)
        });

        const text = await response.text();
        let payload: any;
        try {
          payload = text ? JSON.parse(text) : {};
        } catch {
          payload = { message: text || 'Respons autentikasi tidak valid.' };
        }

        if (response.status >= 400 && !payload.message) {
          payload.message = payload.error || payload.details || `Layanan autentikasi gagal (HTTP ${response.status}).`;
        }

        return res.status(response.status).json(payload);
      } catch (err: any) {
        lastError = err;
        console.warn(`[api/auth] Upstream ${upstreamBase} failed:`, err?.message);
      }
    }

    console.error('[api/auth] All upstreams failed:', lastError);
    return res.status(503).json({
      success: false,
      message: 'Gagal terhubung ke server autentikasi Firebase. Silakan coba beberapa saat lagi.',
      code: 'AUTH_BACKEND_UNAVAILABLE'
    });
  } catch (error: any) {
    console.error('[api/auth] Unexpected serverless error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message ? `Kesalahan sistem autentikasi: ${error.message}` : 'Terjadi kesalahan internal pada proxy autentikasi.',
      code: 'PROXY_INTERNAL_ERROR'
    });
  }
}
