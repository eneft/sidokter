'use strict';

const PDF_HEADER = Buffer.from('%PDF-', 'ascii');
const PDF_EOF = Buffer.from('%%EOF', 'ascii');

function toPdfBuffer(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (buffer.length < PDF_HEADER.length || !buffer.subarray(0, PDF_HEADER.length).equals(PDF_HEADER)) {
    throw new Error('PDF_RENDER_INVALID_OUTPUT');
  }
  if (buffer.lastIndexOf(PDF_EOF) < 0) throw new Error('PDF_RENDER_INCOMPLETE_OUTPUT');
  return buffer;
}

function sendPdf(res, value, filename) {
  const buffer = toPdfBuffer(value);
  res.status(200);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.set('Content-Length', String(buffer.length));
  res.set('Cache-Control', 'private, no-store, max-age=0');
  // Puppeteer returns Uint8Array in current releases. Express treats a plain
  // Uint8Array as an object and JSON-serializes its numeric keys; Buffer forces
  // the binary response path and preserves every byte.
  return res.send(buffer);
}

module.exports = { sendPdf, toPdfBuffer };
