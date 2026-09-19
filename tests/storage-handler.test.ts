import assert from 'node:assert/strict';
import test from 'node:test';
import { handleStorageDownloadBySop } from '../server/storageHandler';

test('proxies an authenticated SPO resolver request to Firebase storage', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return new Response('pdf', {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    });
  };

  let statusCode = 0;
  let sentBody: unknown;
  const responseHeaders = new Map<string, string>();
  const req = {
    method: 'GET',
    params: { sopId: 'sop-legacy_1' },
    query: {},
    body: undefined,
    header: (name: string) => name === 'authorization' ? 'Bearer session-token' : undefined,
  };
  const res = {
    setHeader: (name: string, value: string) => responseHeaders.set(name, value),
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    send: (body: unknown) => {
      sentBody = body;
      return res;
    },
    end: () => res,
    json: (body: unknown) => {
      sentBody = body;
      return res;
    },
  };

  try {
    await handleStorageDownloadBySop(req as any, res as any);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestedUrl, 'https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/storageApi/sop/sop-legacy_1');
  assert.equal(requestedInit?.method, 'GET');
  assert.equal((requestedInit?.headers as Headers).get('authorization'), 'Bearer session-token');
  assert.equal(statusCode, 200);
  assert.equal(responseHeaders.get('content-type'), 'application/pdf');
  assert.deepEqual(sentBody, Buffer.from('pdf'));
});

test('rejects malformed SPO IDs without contacting Firebase storage', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response();
  };

  let statusCode = 0;
  let sentBody: unknown;
  const req = { params: { sopId: '../secret' } };
  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (body: unknown) => {
      sentBody = body;
      return res;
    },
  };

  try {
    await handleStorageDownloadBySop(req as any, res as any);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(fetchCalled, false);
  assert.equal(statusCode, 400);
  assert.deepEqual(sentBody, { success: false, message: 'ID SPO tidak valid.' });
});
