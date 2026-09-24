'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'functions', 'index.js');
const routingPath = path.join(root, 'functions', 'storageRouting.js');
const viewerPath = path.join(root, 'src', 'components', 'DocumentViewer.tsx');
const optimizerPath = path.join(root, 'functions', 'pdfPreviewOptimizer.js');
const testPath = path.join(root, 'functions', 'pdfPreviewOptimizer.test.js');

function replaceOnce(source, needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly 1 match, found ${count}`);
  return source.replace(needle, replacement);
}

const optimizerSource = `'use strict';

const path = require('path');
const zlib = require('zlib');

const PREVIEW_VERSION = 1;
const MIN_SAVINGS_BYTES = 32 * 1024;
const MIN_SAVINGS_RATIO = 0.02;

function isPdfMeta(meta = {}, objectPath = '') {
  return String(meta.mimeType || '').toLowerCase() === 'application/pdf' || /\\.pdf$/i.test(String(objectPath || ''));
}

function previewPathFor(objectPath) {
  const normalized = String(objectPath || '').replace(/^\\/+/, '');
  return normalized ? \\`\\${normalized}.preview-v\\${PREVIEW_VERSION}.pdf.gz\\` : '';
}

function shouldUseCompressedPreview(originalSize, compressedSize) {
  const original = Number(originalSize || 0);
  const compressed = Number(compressedSize || 0);
  if (!original || !compressed || compressed >= original) return false;
  return (original - compressed) >= MIN_SAVINGS_BYTES || (compressed / original) <= (1 - MIN_SAVINGS_RATIO);
}

async function ensurePdfPreview({ bucket, metaRef, meta = {}, originalPath, force = false }) {
  const objectPath = String(originalPath || meta.objectPath || '').replace(/^\\/+/, '');
  if (!bucket || !objectPath || !isPdfMeta(meta, objectPath)) return { previewStatus: 'NOT_APPLICABLE' };

  if (!force && meta.previewVersion === PREVIEW_VERSION && ['READY', 'SKIPPED'].includes(String(meta.previewStatus || ''))) {
    return {
      previewVersion: meta.previewVersion,
      previewStatus: meta.previewStatus,
      previewObjectPath: meta.previewObjectPath || '',
      previewEncoding: meta.previewEncoding || '',
      previewOriginalSize: Number(meta.previewOriginalSize || meta.size || 0),
      previewStoredSize: Number(meta.previewStoredSize || 0),
      previewOptimizedAt: meta.previewOptimizedAt || ''
    };
  }

  const originalFile = bucket.file(objectPath);
  const [exists] = await originalFile.exists();
  if (!exists) return { previewStatus: 'MISSING_ORIGINAL' };

  const [metadata] = await originalFile.getMetadata();
  const originalSize = Number(metadata.size || meta.size || 0);
  const [buffer] = await originalFile.download();
  const compressed = zlib.gzipSync(buffer, { level: 6 });
  const previewObjectPath = previewPathFor(objectPath);
  const now = new Date().toISOString();

  let update;
  if (shouldUseCompressedPreview(buffer.length || originalSize, compressed.length)) {
    await bucket.file(previewObjectPath).save(compressed, {
      resumable: false,
      metadata: {
        contentType: 'application/octet-stream',
        cacheControl: 'private, max-age=3600',
        metadata: {
          previewOf: objectPath,
          previewVersion: String(PREVIEW_VERSION),
          transportEncoding: 'gzip'
        }
      }
    });
    update = {
      previewVersion: PREVIEW_VERSION,
      previewStatus: 'READY',
      previewObjectPath,
      previewEncoding: 'gzip',
      previewOriginalSize: buffer.length || originalSize,
      previewStoredSize: compressed.length,
      previewOptimizedAt: now
    };
  } else {
    try { await bucket.file(previewObjectPath).delete({ ignoreNotFound: true }); } catch {}
    update = {
      previewVersion: PREVIEW_VERSION,
      previewStatus: 'SKIPPED',
      previewObjectPath: '',
      previewEncoding: '',
      previewOriginalSize: buffer.length || originalSize,
      previewStoredSize: buffer.length || originalSize,
      previewOptimizedAt: now
    };
  }

  if (metaRef && typeof metaRef.set === 'function') await metaRef.set(update, { merge: true });
  return update;
}

module.exports = {
  PREVIEW_VERSION,
  previewPathFor,
  shouldUseCompressedPreview,
  ensurePdfPreview
};
`;

const testSource = `'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { previewPathFor, shouldUseCompressedPreview } = require('./pdfPreviewOptimizer');

test('preview path never replaces the authoritative original object', () => {
  assert.equal(
    previewPathFor('sidokter/spo/sop-123_file.pdf'),
    'sidokter/spo/sop-123_file.pdf.preview-v1.pdf.gz'
  );
});

test('preview is kept only when transport compression has useful savings', () => {
  assert.equal(shouldUseCompressedPreview(1_000_000, 900_000), true);
  assert.equal(shouldUseCompressedPreview(1_000_000, 995_000), false);
  assert.equal(shouldUseCompressedPreview(100_000, 99_000), false);
});
`;

fs.writeFileSync(optimizerPath, optimizerSource);
fs.writeFileSync(testPath, testSource);

let routing = fs.readFileSync(routingPath, 'utf8');
routing = replaceOnce(
  routing,
  "  if (normalizedMethod === 'POST' && (\n    normalizedPath === '/upload' ||\n    normalizedPath === '/storageapi/upload' ||\n    normalizedPath.endsWith('/upload')\n  )) return 'upload';\n",
  "  if (normalizedMethod === 'POST' && (\n    normalizedPath === '/upload' ||\n    normalizedPath === '/storageapi/upload' ||\n    normalizedPath.endsWith('/upload')\n  )) return 'upload';\n\n  if (normalizedMethod === 'POST' && (\n    normalizedPath === '/optimize' ||\n    normalizedPath === '/storageapi/optimize' ||\n    normalizedPath.endsWith('/optimize')\n  )) return 'optimize';\n",
  'storage routing optimize endpoint'
);
fs.writeFileSync(routingPath, routing);

let index = fs.readFileSync(indexPath, 'utf8');
index = replaceOnce(
  index,
  "const { classifyStorageRequest } = require('./storageRouting');\n",
  "const { classifyStorageRequest } = require('./storageRouting');\nconst { ensurePdfPreview } = require('./pdfPreviewOptimizer');\n",
  'optimizer import'
);

index = replaceOnce(
  index,
  "  await db.collection(STORAGE_COLLECTION).doc(id).set(meta, { merge:true });\n  return json(res, 200, { success:true, fileId:id, url:\`/api/storage/files/\${id}\`, storagePath:objectPath, fileName:safeName, fileSize:buffer.length, mimeType:mime });\n}",
  "  const metaRef = db.collection(STORAGE_COLLECTION).doc(id);\n  await metaRef.set(meta, { merge:true });\n  let previewMeta = {};\n  if (mime === 'application/pdf') {\n    try {\n      previewMeta = await ensurePdfPreview({ bucket:getStorageBucket(), metaRef, meta, originalPath:objectPath });\n    } catch (previewError) {\n      console.warn('[storage] PDF preview optimization failed:', previewError?.message || previewError);\n      previewMeta = { previewStatus:'FAILED' };\n      await metaRef.set({ previewStatus:'FAILED', previewOptimizedAt:new Date().toISOString() }, { merge:true });\n    }\n  }\n  return json(res, 200, { success:true, fileId:id, url:\`/api/storage/files/\${id}\`, storagePath:objectPath, fileName:safeName, fileSize:buffer.length, mimeType:mime, previewStatus:previewMeta.previewStatus || undefined });\n}",
  'optimize newly uploaded PDF'
);

const oldStream = `async function streamStorageObject(req, res, file, fallbackMeta = {}) {
  const [exists] = await file.exists();
  if (!exists) return false;

  const [fm] = await file.getMetadata();
  res.set('Content-Type', fm.contentType || fallbackMeta.mimeType || 'application/pdf');
  res.set('Content-Length', String(fm.size || fallbackMeta.size || 0));
  res.set('Content-Disposition', \\`inline; filename="\\${encodeURIComponent(fallbackMeta.originalName || path.basename(file.name || 'dokumen.pdf'))}"\\`);
  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.set('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') {
    res.status(200).end();
    return true;
  }
  file.createReadStream().on('error', err => {
    console.error('[storage] stream error', err);
    if (!res.headersSent) res.status(500);
  }).pipe(res);
  return true;
}`;

const newStream = `function wantsOptimizedPreview(req) {
  const raw = String(req.query?.preview || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

async function resolvePreviewStreamTarget(req, objectPath, meta, metaRef) {
  if (!wantsOptimizedPreview(req) || String(meta?.mimeType || '').toLowerCase() !== 'application/pdf') {
    return { file:getStorageBucket().file(objectPath), meta };
  }
  try {
    const preview = await ensurePdfPreview({ bucket:getStorageBucket(), metaRef, meta, originalPath:objectPath });
    if (preview.previewStatus === 'READY' && preview.previewObjectPath) {
      return {
        file:getStorageBucket().file(preview.previewObjectPath),
        meta:{ ...meta, ...preview, mimeType:'application/pdf', size:preview.previewStoredSize, transportEncoding:preview.previewEncoding, isOptimizedPreview:true }
      };
    }
  } catch (error) {
    console.warn('[storage] on-demand preview optimization failed:', error?.message || error);
    if (metaRef) await metaRef.set({ previewStatus:'FAILED', previewOptimizedAt:new Date().toISOString() }, { merge:true }).catch(() => {});
  }
  return { file:getStorageBucket().file(objectPath), meta };
}

async function streamStorageObject(req, res, file, fallbackMeta = {}) {
  const [exists] = await file.exists();
  if (!exists) return false;

  const [fm] = await file.getMetadata();
  const totalSize = Number(fm.size || fallbackMeta.size || 0);
  const isGzipPreview = fallbackMeta.transportEncoding === 'gzip';
  const contentType = isGzipPreview ? 'application/pdf' : (fm.contentType || fallbackMeta.mimeType || 'application/pdf');
  res.set('Content-Type', contentType);
  res.set('Content-Disposition', \\`inline; filename="\\${encodeURIComponent(fallbackMeta.originalName || path.basename(file.name || 'dokumen.pdf'))}"\\`);
  res.set('Cache-Control', fallbackMeta.isOptimizedPreview ? 'private, max-age=3600' : 'private, max-age=900');
  res.set('X-Content-Type-Options', 'nosniff');
  if (isGzipPreview) res.set('Content-Encoding', 'gzip');
  else res.set('Accept-Ranges', 'bytes');

  const range = !isGzipPreview ? String(req.headers.range || '') : '';
  const match = range.match(/^bytes=(\\d*)-(\\d*)$/i);
  if (match && totalSize > 0) {
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : totalSize - 1;
    if (!match[1] && match[2]) {
      const suffix = Number(match[2]);
      start = Math.max(0, totalSize - suffix);
      end = totalSize - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= totalSize) {
      res.status(416).set('Content-Range', \\`bytes */\\${totalSize}\\`).end();
      return true;
    }
    end = Math.min(end, totalSize - 1);
    res.status(206);
    res.set('Content-Range', \\`bytes \\${start}-\\${end}/\\${totalSize}\\`);
    res.set('Content-Length', String(end - start + 1));
    if (req.method === 'HEAD') return res.end(), true;
    file.createReadStream({ start, end }).on('error', err => {
      console.error('[storage] range stream error', err);
      if (!res.headersSent) res.status(500);
    }).pipe(res);
    return true;
  }

  if (totalSize > 0) res.set('Content-Length', String(totalSize));
  if (req.method === 'HEAD') {
    res.status(200).end();
    return true;
  }
  file.createReadStream().on('error', err => {
    console.error('[storage] stream error', err);
    if (!res.headersSent) res.status(500);
  }).pipe(res);
  return true;
}`;
index = replaceOnce(index, oldStream, newStream, 'range/cached storage streaming');

index = replaceOnce(
  index,
  "    const served = await streamStorageObject(req, res, getStorageBucket().file(objectPath), meta);\n",
  "    const target = await resolvePreviewStreamTarget(req, objectPath, meta, snap.ref);\n    const served = await streamStorageObject(req, res, target.file, target.meta);\n",
  'file download preview target'
);

index = replaceOnce(
  index,
  "    const served = await streamStorageObject(req, res, getStorageBucket().file(objectPath), meta);\n    if (served) return;\n    return json(res, 404, { success:false, message:'File metadata tidak ditemukan di Firebase Storage.' });\n",
  "    const metaRef = db.collection(STORAGE_COLLECTION).doc(meta.id);\n    const target = await resolvePreviewStreamTarget(req, objectPath, meta, metaRef);\n    const served = await streamStorageObject(req, res, target.file, target.meta);\n    if (served) return;\n    return json(res, 404, { success:false, message:'File metadata tidak ditemukan di Firebase Storage.' });\n",
  'SOP download preview target'
);

index = replaceOnce(
  index,
  "    const served = await streamStorageObject(req, res, getStorageBucket().file(metadataObjectPath), meta);\n",
  "    const target = await resolvePreviewStreamTarget(req, metadataObjectPath, meta, metaDoc.ref);\n    const served = await streamStorageObject(req, res, target.file, target.meta);\n",
  'path download preview target'
);

const optimizeFunction = `
async function storageOptimize(req, res) {
  const context = await requireStorageAuth(req);
  if (normalizeRole(context.user.role) !== 'admin') {
    return json(res, 403, { success:false, message:'Optimasi massal PDF hanya dapat dijalankan Admin.' });
  }
  const requestedLimit = Number(req.body?.limit || 10);
  const limit = Math.max(1, Math.min(20, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 10));
  const force = req.body?.force === true;
  const snap = await db.collection(STORAGE_COLLECTION).where('mimeType', '==', 'application/pdf').limit(Math.max(limit * 3, limit)).get();
  const result = { processed:0, ready:0, skipped:0, failed:0 };
  for (const doc of snap.docs) {
    if (result.processed >= limit) break;
    const meta = doc.data() || {};
    if (!force && meta.previewVersion === 1 && ['READY', 'SKIPPED'].includes(String(meta.previewStatus || ''))) continue;
    const objectPath = resolveStorageObjectPath(meta);
    if (!objectPath) continue;
    result.processed += 1;
    try {
      const preview = await ensurePdfPreview({ bucket:getStorageBucket(), metaRef:doc.ref, meta, originalPath:objectPath, force });
      if (preview.previewStatus === 'READY') result.ready += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      await doc.ref.set({ previewStatus:'FAILED', previewOptimizedAt:new Date().toISOString() }, { merge:true }).catch(() => {});
      console.warn('[storage] batch PDF optimization failed:', doc.id, error?.message || error);
    }
  }
  return json(res, 200, { success:true, ...result });
}
`;
index = replaceOnce(index, "\nasync function storageDelete(req, res) {", optimizeFunction + "\nasync function storageDelete(req, res) {", 'batch optimize handler');

index = replaceOnce(
  index,
  "    if (storageRoute === 'upload') {\n      return await storageUpload(req, res);\n    }\n",
  "    if (storageRoute === 'upload') {\n      return await storageUpload(req, res);\n    }\n\n    if (storageRoute === 'optimize') {\n      return await storageOptimize(req, res);\n    }\n",
  'storage optimize route handler'
);

fs.writeFileSync(indexPath, index);

let viewer = fs.readFileSync(viewerPath, 'utf8');
viewer = replaceOnce(
  viewer,
  "function requiresProtectedHeaders(url: string): boolean {\n  return url.startsWith('/api/storage/files/') ||\n    url.startsWith('/api/storage/path') ||\n    url.startsWith('/api/storage/sop/');\n}\n",
  "function requiresProtectedHeaders(url: string): boolean {\n  return url.startsWith('/api/storage/files/') ||\n    url.startsWith('/api/storage/path') ||\n    url.startsWith('/api/storage/sop/');\n}\n\nfunction withOptimizedPreviewIntent(url: string, fileName: string): string {\n  if (!requiresProtectedHeaders(url) || documentTypeFor(fileName) !== 'pdf') return url;\n  const separator = url.includes('?') ? '&' : '?';\n  return \`${url}${separator}preview=1\`;\n}\n",
  'viewer preview helper'
);
viewer = replaceOnce(
  viewer,
  "            const headers = requiresProtectedHeaders(resolvedUrl)\n              ? await getProtectedStorageHeaders()\n              : undefined;\n            const response = await fetch(resolvedUrl, { headers });\n",
  "            const previewRequestUrl = withOptimizedPreviewIntent(resolvedUrl, effectiveFileName);\n            const headers = requiresProtectedHeaders(resolvedUrl)\n              ? await getProtectedStorageHeaders()\n              : undefined;\n            const response = await fetch(previewRequestUrl, { headers, cache: 'default' });\n",
  'viewer optimized preview fetch'
);
fs.writeFileSync(viewerPath, viewer);

console.log('PDF preview optimization patch applied successfully.');
