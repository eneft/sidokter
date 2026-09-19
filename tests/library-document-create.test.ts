import assert from 'node:assert/strict';
import test from 'node:test';
import { LibraryDocument } from '../src/types';
import {
  createSingleFlightGuard,
  upsertLibraryDocumentById
} from '../src/lib/libraryDocumentCreatePolicy';

function document(id: string, type: 'SK' | 'MOU', title: string): LibraryDocument {
  return {
    id,
    type,
    title,
    fileName: `${id}.pdf`,
    fileSize: 100,
    fileType: 'application/pdf',
    storagePath: `sidokter/${type.toLowerCase()}/${id}.pdf`,
    downloadUrl: `/api/storage/files/${id}`,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z'
  };
}

for (const type of ['SK', 'MOU'] as const) {
  test(`single ${type} create remains one card when snapshot wins the race`, () => {
    const created = document(`library-${type.toLowerCase()}-1`, type, `${type} pertama`);
    const snapshotState = [created];

    const reconciled = upsertLibraryDocumentById(snapshotState, created);

    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0].id, created.id);
  });
}

test('canonical Firestore ID preserves a genuinely different second document', () => {
  const first = document('library-sk-1', 'SK', 'Judul sama');
  const second = document('library-sk-2', 'SK', 'Judul sama');

  const reconciled = upsertLibraryDocumentById([first], second);

  assert.deepEqual(reconciled.map((item) => item.id), [first.id, second.id]);
});

test('rapid submit is rejected while create is in flight and retry opens after failure', () => {
  const guard = createSingleFlightGuard();

  assert.equal(guard.tryStart(), true);
  assert.equal(guard.tryStart(), false);
  guard.finish();
  assert.equal(guard.tryStart(), true);
});
