'use strict';

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
