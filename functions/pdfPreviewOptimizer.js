'use strict';

const path = require('path');
const zlib = require('zlib');

const PREVIEW_VERSION = 1;
const MIN_SAVINGS_BYTES = 32 * 1024;
const MIN_SAVINGS_RATIO = 0.02;

function isPdfMeta(meta = {}, objectPath = '') {
  return String(meta.mimeType || '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(String(objectPath || ''));
}

function previewPathFor(objectPath) {
  const normalized = String(objectPath || '').replace(/^\/+/, '');
  return normalized ? `${normalized}.preview-v${PREVIEW_VERSION}.pdf.gz` : '';
}

function shouldUseCompressedPreview(originalSize, compressedSize) {
  const original = Number(originalSize || 0);
  const compressed = Number(compressedSize || 0);
  if (!original || !compressed || compressed >= original) return false;
  return (original - compressed) >= MIN_SAVINGS_BYTES || (compressed / original) <= (1 - MIN_SAVINGS_RATIO);
}

async function ensurePdfPreview({ bucket, metaRef, meta = {}, originalPath, force = false }) {
  const objectPath = String(originalPath || meta.objectPath || '').replace(/^\/+/, '');
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
