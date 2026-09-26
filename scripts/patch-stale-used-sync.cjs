'use strict';
const fs = require('fs');

function patch(path, from, to, label) {
  const text = fs.readFileSync(path, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`);
  fs.writeFileSync(path, text.replace(from, to));
}

patch(
  'src/utils/numbering.ts',
`    const docById = new Map(group.docs.map((doc) => [doc.id, doc]));
    const mutableIds = new Set(group.docs.filter((doc) => doc.status !== 'DIARSIPKAN').map((doc) => doc.id));`,
`    const mutableIds = new Set(group.docs.filter((doc) => doc.status !== 'DIARSIPKAN').map((doc) => doc.id));`,
  'remove unused docById'
);

patch(
  'src/utils/numbering.ts',
`    for (const reservation of group.reservations) {
      const status = String(reservation.status || '').toUpperCase();
      const usedDocumentId = String(reservation.usedDocumentId || '').trim();
      // A USED claim that still points to a document follows that document.
      // Only RESERVED slots and orphan USED claims independently lock a slot.
      if (status === 'USED' && usedDocumentId && docById.has(usedDocumentId)) continue;
      if (status === 'RESERVED' || status === 'USED') {
        addLocked(Number(reservation.sequenceNumber || 0), \`${'${status}'}:${'${reservation.id}'}\`);
      }
    }`,
`    for (const reservation of group.reservations) {
      const status = String(reservation.status || '').toUpperCase();
      // Only an active Nomor Terbit (RESERVED) locks a slot. USED claims follow
      // their document; orphan USED claims are stale metadata and must not keep
      // a deleted-DRAFT gap permanently occupied.
      if (status === 'RESERVED') {
        addLocked(Number(reservation.sequenceNumber || 0), \`RESERVED:${'${reservation.id}'}\`);
      }
    }`,
  'client reservation locking'
);

patch(
  'src/lib/firestoreService.ts',
`export interface SopNumberSynchronizationResult {
  ok: boolean;
  changedCount: number;
  duplicateCount: number;
  reconciledScopes: number;`,
`export interface SopNumberSynchronizationResult {
  ok: boolean;
  changedCount: number;
  duplicateCount: number;
  cleanedReservationCount: number;
  reconciledScopes: number;`,
  'sync result interface'
);

patch(
  'src/lib/firestoreService.ts',
`      changedCount: Number(data.changedCount || 0),
      duplicateCount: Number(data.duplicateCount || 0),
      reconciledScopes: Number(data.reconciledScopes || 0),`,
`      changedCount: Number(data.changedCount || 0),
      duplicateCount: Number(data.duplicateCount || 0),
      cleanedReservationCount: Number(data.cleanedReservationCount || 0),
      reconciledScopes: Number(data.reconciledScopes || 0),`,
  'sync result mapping'
);

patch(
  'src/App.tsx',
`      if (result.changedCount === 0) {
        addToast(
          'info',
          'Penomoran Sudah Sinkron',
          \`${'${result.reconciledScopes}'} scope penomoran telah dicek. Tidak ada gap yang perlu diperbaiki; nomor arsip dan Nomor Terbit tetap terkunci.\`
        );
        return;
      }`,
`      if (result.changedCount === 0) {
        if (result.cleanedReservationCount > 0) {
          addToast(
            'success',
            'Register Nomor Berhasil Dibersihkan',
            \`${'${result.cleanedReservationCount}'} register USED lama dari Draft yang sudah tidak ada telah dibersihkan. Tidak ada dokumen lain yang perlu dinomori ulang.\`
          );
        } else {
          addToast(
            'info',
            'Penomoran Sudah Sinkron',
            \`${'${result.reconciledScopes}'} scope penomoran telah diproses. Tidak ada gap yang dapat dirapatkan; nomor DIARSIPKAN dan Nomor Terbit RESERVED tetap terkunci.\`
          );
        }
        return;
      }`,
  'App zero-change result'
);

console.log('Client stale USED sync patch applied.');
