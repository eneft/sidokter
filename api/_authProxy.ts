/**
 * Shared Vercel Serverless Auth Proxy
 * Bridges Vercel Deployments <-> Firebase Cloud Functions (authApi)
 */

const UPSTREAM_URLS = [
  process.env.FIREBASE_AUTH_API,
  process.env.UPSTREAM_AUTH_API_URL,
  'https://authapi-n7zygxitla-et.a.run.app',
  'https://asia-southeast2-gen-lang-client-0880840770.cloudfunctions.net/authApi'
].filter(Boolean) as string[];

function readRawBody(req: any): Promise<string> {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (req.body && typeof req.body === 'object') return Promise.resolve(JSON.stringify(req.body));
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

export async function handleVercelAuthProxy(req: any, res: any) {
  const origin = req.headers?.origin || '*';

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,Accept,Authorization,X-Session-Id,X-Soegiri-Auth-Uid,X-User-Username'
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
    // 1. Determine action
    let action = '';
    const queryAction = req.query?.action;
    if (Array.isArray(queryAction)) {
      action = queryAction.filter(Boolean).join('/');
    } else if (typeof queryAction === 'string') {
      action = queryAction.trim();
    }

    if (!action) {
      const rawUrl = String(req.url || '');
      const match = rawUrl.match(/^\/api\/(?:auth|authApi)(?:\/([^?]+))?/i);
      if (match?.[1]) {
        action = decodeURIComponent(match[1]);
      }
    }

    // 2. Parse body
    const rawBody = await readRawBody(req);
    let parsedBody: Record<string, any> = {};
    if (rawBody && rawBody.trim()) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        return res.status(400).json({
          message: 'Body JSON tidak valid.',
          code: 'INVALID_JSON'
        });
      }
    }

    if (!action && parsedBody.action) {
      action = String(parsedBody.action).trim();
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

    // 3. Try upstream endpoints with fallback
    let lastError: any = null;
    const timeoutMs = action === 'user-list' ? 45000 : 25000;
    for (const upstreamBase of UPSTREAM_URLS) {
      const targetUrl = action
        ? `${upstreamBase.replace(/\/$/, '')}/${action}`
        : upstreamBase;

      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: forwardHeaders,
          body: bodyString,
          cache: 'no-store',
          signal: AbortSignal.timeout(timeoutMs)
        });

        const text = await response.text();
        let payload: any;
        try {
          payload = text ? JSON.parse(text) : {};
        } catch {
          payload = { message: text || 'Respons autentikasi tidak valid.' };
        }

        return res.status(response.status).json(payload);
      } catch (err: any) {
        lastError = err;
        console.warn(`[vercel-auth-proxy] Failed connecting to ${targetUrl}:`, err?.message);
      }
    }

    console.error('[vercel-auth-proxy] All Firebase auth upstreams failed:', lastError);
    return res.status(503).json({
      message: 'Gagal terhubung ke server autentikasi Firebase.',
      code: 'AUTH_BACKEND_UNAVAILABLE'
    });
  } catch (error: any) {
    console.error('[vercel-auth-proxy] Unexpected error:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan internal pada proxy autentikasi.',
      code: 'PROXY_INTERNAL_ERROR'
    });
  }
}

export default handleVercelAuthProxy;
