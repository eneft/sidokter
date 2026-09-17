import assert from 'node:assert/strict';
import test from 'node:test';
import { getExistingPdfSources } from '../src/lib/existingPdfSource';

test('keeps Existing PDF protected URLs paired with their authoritative paths', () => {
  const sources = getExistingPdfSources({
    id: 'sop-1',
    fileUrl: '/api/storage/files/sop-1_file',
    storagePath: 'sidokter/spo/original.pdf',
    signedScanStoragePath: 'sidokter/spo/scan.pdf'
  } as any);

  assert.deepEqual(sources, [
    { url: undefined, storagePath: 'sidokter/spo/scan.pdf', slot: 'signedScan' },
    { url: '/api/storage/files/sop-1_file', storagePath: 'sidokter/spo/original.pdf', slot: 'file' }
  ]);
});

test('supports historical old-file metadata without changing its storage slot', () => {
  const sources = getExistingPdfSources({
    id: 'sop-legacy',
    oldFileUrl: '/api/storage/files/sop-legacy_oldFile',
    oldStoragePath: 'sidokter/spo/legacy.pdf'
  } as any);

  assert.deepEqual(sources[0], {
    url: '/api/storage/files/sop-legacy_oldFile',
    storagePath: 'sidokter/spo/legacy.pdf',
    slot: 'oldFile'
  });
});
