import type { Request, Response } from 'express';

/**
 * App Hosting / Express bridge for protected document storage.
 *
 * Persistent SIDOKTER binaries have exactly one authoritative implementation:
 * the storageApi Cloud Function in the sidokter-soegiri Firebase project. This
 * server must never persist documents on its local (ephemeral) filesystem.
 */
const FIREBASE_STORAGE_API =
  'https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/storageApi';

const REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'origin',
  'x-session-id',
  'x-soegiri-session-id',
  'x-soegiri-auth-uid',
  'x-user-username',
] as const;

const RESPONSE_HEADERS = [
  'cache-control',
  'content-disposition',
  'content-length',
  'content-type',
  'etag',
  'last-modified',
  'x-content-type-options',
] as const;

function firstQueryValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '');
  return typeof value === 'string' ? value : '';
}

function buildForwardHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = req.header(name);
    if (value) headers.set(name, value);
  }

  // Preserve compatibility with existing protected download links while still
  // letting storageApi perform the authoritative authentication/authorization.
  if (!headers.has('authorization')) {
    const token = firstQueryValue(req.query.token);
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  if (!headers.has('x-session-id')) {
    const sessionId = firstQueryValue(req.query.sessionId);
    if (sessionId) headers.set('x-session-id', sessionId);
  }
  if (!headers.has('x-soegiri-auth-uid')) {
    const uid = firstQueryValue(req.query.uid);
    if (uid) headers.set('x-soegiri-auth-uid', uid);
  }
  if (!headers.has('x-user-username')) {
    const username = firstQueryValue(req.query.username);
    if (username) headers.set('x-user-username', username);
  }

  return headers;
}

async function forwardToFirebaseStorage(
  req: Request,
  res: Response,
  storagePath: string,
): Promise<void> {
  const upstreamUrl = `${FIREBASE_STORAGE_API}${storagePath}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: buildForwardHeaders(req),
      body: req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : JSON.stringify(req.body ?? {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(65_000),
    });

    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    res.status(upstream.status);
    if (req.method === 'HEAD' || upstream.status === 204) {
      res.end();
      return;
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.send(body);
  } catch (error) {
    console.error('[storageProxy] Firebase Storage API unavailable:', error);
    res.status(502).json({
      success: false,
      code: 'FIREBASE_STORAGE_UNAVAILABLE',
      message: 'Firebase Storage tidak dapat diakses. Dokumen tidak disimpan.',
    });
  }
}

export async function handleStorageUpload(req: Request, res: Response): Promise<void> {
  await forwardToFirebaseStorage(req, res, '/upload');
}

export async function handleStorageDownloadByPath(req: Request, res: Response): Promise<void> {
  const storagePath = String(req.params.storagePath || '').replace(/^\/+/, '');
  if (!storagePath || storagePath.includes('..')) {
    res.status(400).json({ success: false, message: 'Storage path tidak valid.' });
    return;
  }
  await forwardToFirebaseStorage(req, res, `/path/${encodeURIComponent(storagePath)}`);
}

export async function handleStorageDownload(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ success: false, message: 'File ID tidak valid.' });
    return;
  }
  await forwardToFirebaseStorage(req, res, `/files/${encodeURIComponent(id)}`);
}

export async function handleStorageDownloadBySop(req: Request, res: Response): Promise<void> {
  const sopId = String(req.params.sopId || '').trim();
  if (!/^sop-[a-zA-Z0-9_-]+$/.test(sopId)) {
    res.status(400).json({ success: false, message: 'ID SPO tidak valid.' });
    return;
  }
  await forwardToFirebaseStorage(req, res, `/sop/${encodeURIComponent(sopId)}`);
}

export async function handleStorageDelete(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ success: false, message: 'File ID tidak valid.' });
    return;
  }
  await forwardToFirebaseStorage(req, res, `/files/${encodeURIComponent(id)}`);
}
