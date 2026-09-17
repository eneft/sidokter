'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveStorageObjectPath } = require('./storageMetadata');
const { classifyStorageRequest } = require('./storageRouting');

test('uses the current Firebase objectPath as the authoritative path', () => {
  const verifiedCurrentRecord = {
    id: 'sop-1789624975867_signedScan',
    objectPath: 'sidokter/spo/sop-1789624975867_signedScan.pdf',
    originalName: 'SOEGIRI__223___2025_scan.pdf',
    mimeType: 'application/pdf',
    size: 661053,
    resourceType: 'SPO',
    ownerUid: 'admin-root',
    accessKeys: ['ALL']
  };

  assert.equal(
    resolveStorageObjectPath(verifiedCurrentRecord),
    'sidokter/spo/sop-1789624975867_signedScan.pdf'
  );
});

test('accepts a legacy storagePath without changing persistence', () => {
  assert.equal(resolveStorageObjectPath({ storagePath: '/sidokter/spo/sop-2_signedScan.pdf' }), 'sidokter/spo/sop-2_signedScan.pdf');
});

test('maps a proven legacy filename only within a known Firebase namespace', () => {
  assert.equal(resolveStorageObjectPath({ filename: 'sop-3_file.pdf', resourceType: 'SPO' }), 'sidokter/spo/sop-3_file.pdf');
});

test('rejects missing and malformed legacy metadata', () => {
  assert.equal(resolveStorageObjectPath({ originalName: 'Parkiran RSUD.pdf' }), null);
  assert.equal(resolveStorageObjectPath({ objectPath: '../secret.pdf' }), null);
  assert.equal(resolveStorageObjectPath({ filename: '../secret.pdf', resourceType: 'SPO' }), null);
  assert.equal(resolveStorageObjectPath({ filename: 'unknown.pdf', resourceType: 'OTHER' }), null);
});

test('routes the verified current file through GET and HEAD without path initialization errors', () => {
  const pathName = '/files/sop-1789624975867_signedScan';
  assert.equal(classifyStorageRequest('GET', pathName), 'download-file');
  assert.equal(classifyStorageRequest('HEAD', pathName), 'download-file');
});

test('does not route unsafe object paths around storage path validation', () => {
  assert.equal(classifyStorageRequest('GET', '/path/..%2Fsecret.pdf'), 'download-path');
  assert.equal(resolveStorageObjectPath({ objectPath: '../secret.pdf' }), null);
});
