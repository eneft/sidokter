import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createPdfBlob, responseToPdfBlob } from '../src/utils/pdfBinary';

const require = createRequire(import.meta.url);
const { sendPdf } = require('../functions/pdfBinary.js') as {
  sendPdf: (res: FakeResponse, value: Uint8Array, filename: string) => FakeResponse;
};

const rawPdf = new TextEncoder().encode('%PDF-1.7\nraw binary \u0000\u00ff payload\n%%EOF\n');

class FakeResponse {
  statusCode = 0;
  headers = new Map<string, string>();
  body: unknown;

  status(code: number) { this.statusCode = code; return this; }
  set(name: string, value: string) { this.headers.set(name.toLowerCase(), value); return this; }
  send(body: unknown) { this.body = body; return this; }
}

test('pdfApi response sends Puppeteer Uint8Array as an HTTP PDF Buffer', () => {
  const response = sendPdf(new FakeResponse(), rawPdf, 'SPO.pdf');

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.ok(Buffer.isBuffer(response.body), 'Express must receive a Buffer, not a Uint8Array object');
  const bytes = response.body as Buffer;
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(bytes.includes(Buffer.from('%%EOF')));
  assert.notEqual(bytes.subarray(0, 5).toString('ascii'), '{"0":');
  assert.deepEqual(bytes, Buffer.from(rawPdf));
});

test('frontend response parser and Blob download preserve raw bytes', async () => {
  const response = new Response(rawPdf, {
    status: 200,
    headers: { 'Content-Type': 'application/pdf; charset=binary' }
  });
  const blob = await responseToPdfBlob(response);

  assert.equal(response.status, 200);
  assert.equal(blob.type, 'application/pdf');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), rawPdf);
});

test('frontend rejects JSON-serialized numeric-key objects and incomplete PDFs', () => {
  assert.throws(() => createPdfBlob(new TextEncoder().encode('{"0":37,"1":80}')), /bukan PDF/);
  assert.throws(() => createPdfBlob(new TextEncoder().encode('%PDF-1.7\n')), /tidak lengkap/);
});
