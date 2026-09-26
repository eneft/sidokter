from pathlib import Path
import json
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# 1. Client numbering preview: compact every normal gap while preserving
#    DIARSIPKAN and active reservation slots.
# ---------------------------------------------------------------------------
path = 'src/utils/numbering.ts'
text = read(path)
text = replace_once(
    text,
    "import { NumberingConfig, SopDocument, SopStatus } from '../types';",
    "import { NumberingConfig, SopDocument, SopStatus, SopNumberReservation } from '../types';",
    'numbering import',
)
marker = 'export function standardizeAllSops(sops: SopDocument[]): {'
start = text.find(marker)
if start < 0:
    raise SystemExit('standardizeAllSops marker not found')
new_tail = r'''export function standardizeAllSops(
  sops: SopDocument[],
  reservations: SopNumberReservation[] = []
): {
  updatedSops: SopDocument[];
  changedCount: number;
  changes: Array<{ oldNumber: string; newNumber: string; title: string }>;
  duplicateCount: number;
} {
  const changes: Array<{ oldNumber: string; newNumber: string; title: string }> = [];
  let duplicateCount = 0;

  if (!Array.isArray(sops)) {
    return { updatedSops: [], changedCount: 0, changes: [], duplicateCount: 0 };
  }

  const getYear = (sop: SopDocument): string => {
    const effectiveYear = String(sop.effectiveDate || '').slice(0, 4);
    if (/^\d{4}$/.test(effectiveYear)) return effectiveYear;
    const parsed = sop.sopNumber ? parseSopNumber(sop.sopNumber) : null;
    if (parsed?.year && /^\d{4}$/.test(parsed.year)) return parsed.year;
    const createdYear = String(sop.createdAt || '').slice(0, 4);
    if (/^\d{4}$/.test(createdYear)) return createdYear;
    return SOEGIRI_HOSPITAL_INFO.year || '2026';
  };

  const getSequence = (sop: SopDocument): number => {
    const direct = Number(sop.sequenceNumber || 0);
    if (Number.isSafeInteger(direct) && direct > 0) return direct;
    const parsed = sop.sopNumber ? parseSopNumber(sop.sopNumber) : null;
    return parsed?.sequenceNumber && parsed.sequenceNumber > 0 ? parsed.sequenceNumber : 0;
  };

  const preserved = new Map<string, SopDocument>();
  const standard: SopDocument[] = [];
  for (const original of sops) {
    if (original.isLegacySop || original.documentType === 'LAMA' || original.jenis_spo === 'EKSISTING' || (original as any).isNumberReservation) {
      preserved.set(original.id, original);
      continue;
    }
    standard.push(standardizeSopDocument(original));
  }

  type Group = {
    divisionCode: string;
    subHierarchyCode: string;
    year: string;
    docs: SopDocument[];
    reservations: SopNumberReservation[];
  };
  const groups = new Map<string, Group>();
  const ensureGroup = (divisionCode: string, subHierarchyCode: string, year: string): Group => {
    const cleanDiv = String(divisionCode || 'PEL').trim().toUpperCase();
    const cleanSub = String(subHierarchyCode || '').trim();
    const key = `${year}|${cleanDiv}|${cleanSub || 'ROOT'}`;
    let group = groups.get(key);
    if (!group) {
      group = { divisionCode: cleanDiv, subHierarchyCode: cleanSub, year, docs: [], reservations: [] };
      groups.set(key, group);
    }
    return group;
  };

  for (const sop of standard) {
    ensureGroup(sop.divisionCode || 'PEL', sop.subHierarchyCode || '', getYear(sop)).docs.push(sop);
  }
  for (const reservation of Array.isArray(reservations) ? reservations : []) {
    const year = String(reservation.year || '').trim();
    const divisionCode = String(reservation.divisionCode || '').trim().toUpperCase();
    const sequenceNumber = Number(reservation.sequenceNumber || 0);
    if (!/^\d{4}$/.test(year) || !divisionCode || !Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) continue;
    ensureGroup(divisionCode, reservation.subHierarchyCode || '', year).reservations.push(reservation);
  }

  const processed = new Map<string, SopDocument>();

  for (const group of groups.values()) {
    const docById = new Map(group.docs.map((doc) => [doc.id, doc]));
    const mutableIds = new Set(group.docs.filter((doc) => doc.status !== 'DIARSIPKAN').map((doc) => doc.id));
    const locked = new Set<number>();
    const lockedOwners = new Map<number, string>();
    const addLocked = (seq: number, owner: string) => {
      if (!Number.isSafeInteger(seq) || seq <= 0) return;
      if (lockedOwners.has(seq) && lockedOwners.get(seq) !== owner) duplicateCount += 1;
      else lockedOwners.set(seq, owner);
      locked.add(seq);
    };

    for (const doc of group.docs.filter((doc) => doc.status === 'DIARSIPKAN')) {
      addLocked(getSequence(doc), `ARCHIVED:${doc.id}`);
    }

    for (const reservation of group.reservations) {
      const status = String(reservation.status || '').toUpperCase();
      const usedDocumentId = String(reservation.usedDocumentId || '').trim();
      // A USED claim that still points to a document follows that document.
      // Only RESERVED slots and orphan USED claims independently lock a slot.
      if (status === 'USED' && usedDocumentId && docById.has(usedDocumentId)) continue;
      if (status === 'RESERVED' || status === 'USED') {
        addLocked(Number(reservation.sequenceNumber || 0), `${status}:${reservation.id}`);
      }
    }

    const seen = new Set<number>();
    for (const doc of group.docs) {
      const seq = getSequence(doc);
      if (!(seq > 0)) continue;
      if (seen.has(seq)) duplicateCount += 1;
      seen.add(seq);
    }
    for (const reservation of group.reservations.filter((row) => row.status === 'RESERVED')) {
      const seq = Number(reservation.sequenceNumber || 0);
      if (!(seq > 0)) continue;
      if (seen.has(seq)) duplicateCount += 1;
      seen.add(seq);
    }

    const mutable = group.docs
      .filter((doc) => mutableIds.has(doc.id))
      .sort((a, b) => {
        const aSeq = getSequence(a) || Number.MAX_SAFE_INTEGER;
        const bSeq = getSequence(b) || Number.MAX_SAFE_INTEGER;
        if (aSeq !== bSeq) return aSeq - bSeq;
        const aTime = Date.parse(a.createdAt || a.effectiveDate || '') || 0;
        const bTime = Date.parse(b.createdAt || b.effectiveDate || '') || 0;
        if (aTime !== bTime) return aTime - bTime;
        const titleOrder = String(a.title || '').localeCompare(String(b.title || ''));
        return titleOrder || String(a.id || '').localeCompare(String(b.id || ''));
      });

    const assigned = new Set<number>();
    let candidate = 1;
    for (const sop of mutable) {
      while (locked.has(candidate) || assigned.has(candidate)) candidate += 1;
      const targetSeq = candidate;
      assigned.add(targetSeq);
      candidate += 1;
      const padded = getPaddedNumber(targetSeq, 3);
      const newNumber = group.subHierarchyCode
        ? `${group.divisionCode} / ${group.subHierarchyCode} / ${padded} / ${group.year}`
        : `${group.divisionCode} / ${padded} / ${group.year}`;
      const oldNumber = String(sop.sopNumber || '').trim();
      if (getSequence(sop) !== targetSeq || oldNumber !== newNumber) {
        changes.push({ oldNumber: oldNumber || '-', newNumber, title: sop.title });
      }
      processed.set(sop.id, {
        ...sop,
        sequenceNumber: targetSeq,
        sopNumber: newNumber,
      });
    }

    for (const archived of group.docs.filter((doc) => doc.status === 'DIARSIPKAN')) {
      // Arsip is historical: never renumber or rewrite its canonical number.
      processed.set(archived.id, archived);
    }
  }

  for (const [id, sop] of preserved) processed.set(id, sop);
  const updatedSops = sops.map((original) => processed.get(original.id) || original);
  return {
    updatedSops,
    changedCount: changes.length,
    changes,
    duplicateCount,
  };
}
'''
text = text[:start] + new_tail
write(path, text)

# ---------------------------------------------------------------------------
# 2. Client callable for authoritative server synchronization.
# ---------------------------------------------------------------------------
path = 'src/lib/firestoreService.ts'
text = read(path)
insert_marker = 'export async function consumeSopNumberReservationInFirestore(id: string, usedDocumentId?: string): Promise<void> {'
if insert_marker not in text:
    raise SystemExit('firestore sync insert marker not found')
sync_client = r'''export interface SopNumberSynchronizationResult {
  ok: boolean;
  changedCount: number;
  duplicateCount: number;
  reconciledScopes: number;
  changes: Array<{
    id: string;
    title: string;
    status: string;
    oldNumber: string;
    newNumber: string;
    sequenceNumber: number;
    scopeKey: string;
  }>;
  warnings?: Array<Record<string, unknown>>;
}

export async function synchronizeSopNumbersInFirestore(): Promise<SopNumberSynchronizationResult> {
  await ensureFirebaseAuthSession();
  try {
    const callable = httpsCallable(functions, 'synchronizeSopNumbers');
    const result = await callable({});
    const data = result.data as Partial<SopNumberSynchronizationResult>;
    return {
      ok: data.ok === true,
      changedCount: Number(data.changedCount || 0),
      duplicateCount: Number(data.duplicateCount || 0),
      reconciledScopes: Number(data.reconciledScopes || 0),
      changes: Array.isArray(data.changes) ? data.changes : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
    };
  } catch (error: any) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').trim();
    if (code === 'functions/unauthenticated') {
      throw new Error('Sesi Admin tidak valid. Silakan login kembali sebelum menjalankan sinkronisasi nomor.');
    }
    if (code === 'functions/permission-denied') {
      throw new Error(message || 'Hanya Administrator yang dapat menjalankan Sinkronisasi Nomor SPO.');
    }
    if (code === 'functions/aborted') {
      throw new Error(message || 'Sinkronisasi nomor lain sedang berjalan. Coba kembali beberapa saat lagi.');
    }
    if (code === 'functions/failed-precondition' || code === 'functions/resource-exhausted') {
      throw new Error(message || 'Sinkronisasi nomor dihentikan karena terdapat konflik nomor terkunci.');
    }
    throw new Error(message || 'Sinkronisasi nomor SPO gagal disimpan ke server.');
  }
}

'''
text = text.replace(insert_marker, sync_client + insert_marker, 1)
write(path, text)

# ---------------------------------------------------------------------------
# 3. Administrator UI receives the active reservation register for accurate
#    preview metrics and wording.
# ---------------------------------------------------------------------------
path = 'src/components/AdminHubPage.tsx'
text = read(path)
text = replace_once(
    text,
    "import { UserSession, UserAccount, SopDocument } from '../types';",
    "import { UserSession, UserAccount, SopDocument, SopNumberReservation } from '../types';",
    'AdminHub type import',
)
text = replace_once(text, '  sops?: SopDocument[];\n', '  sops?: SopDocument[];\n  numberReservations?: SopNumberReservation[];\n', 'AdminHub reservations prop')
text = replace_once(text, '  sops = [],\n', '  sops = [],\n  numberReservations = [],\n', 'AdminHub reservations default')
text = replace_once(text, '    const res = standardizeAllSops(sops);', '    const res = standardizeAllSops(sops, numberReservations);', 'AdminHub sync analysis')
text = replace_once(text, '  }, [sops]);\n', '  }, [sops, numberReservations]);\n', 'AdminHub sync dependency')
old_rules = '                  SPO Baru dan SPO Riviu dinomori urut per unit kerja (dimulai dari 001). \n                  Dokumen <strong>SPO Eksisting (Lama)</strong> tetap dipertahankan nomor aslinya dan tidak akan diubah atau digenerate baru.'
new_rules = '                  SPO Baru dan SPO Riviu wajib berurutan tanpa loncatan mulai 001. Nomor <strong>DIARSIPKAN</strong> tetap terkunci sebagai histori, dan <strong>Nomor Terbit RESERVED</strong> tetap mengunci slot sampai digunakan. Dokumen <strong>SPO Eksisting (Lama)</strong> tetap mempertahankan nomor aslinya.'
text = replace_once(text, old_rules, new_rules, 'AdminHub rules text')
write(path, text)

# ---------------------------------------------------------------------------
# 4. UserView passes its live Nomor Terbit register into Administrator panel.
# ---------------------------------------------------------------------------
path = 'src/components/UserView.tsx'
text = read(path)
text = replace_once(
    text,
    '            sops={sops}\n            onOpenUserManagement={onOpenUserManagement}',
    '            sops={sops}\n            numberReservations={issuedNumberRegister}\n            onOpenUserManagement={onOpenUserManagement}',
    'UserView AdminHub reservations',
)
write(path, text)

# ---------------------------------------------------------------------------
# 5. App connects the button and executes the trusted server callable instead
#    of writing an IndexedDB-only bulk snapshot.
# ---------------------------------------------------------------------------
path = 'src/App.tsx'
text = read(path)
text = replace_once(
    text,
    "import { activateRiviuInFirestore, activateStandaloneSopInFirestore } from './lib/firestoreService';",
    "import { activateRiviuInFirestore, activateStandaloneSopInFirestore, synchronizeSopNumbersInFirestore } from './lib/firestoreService';",
    'App firestore import',
)
text = text.replace('  bulkUpdateSops,\n', '', 1)
pattern = re.compile(r"  // Standardize All SOP Numbers manually \(Admin Trigger\)\n  const handleStandardizeAllSopNumbers = async \(\) => \{.*?\n  \};", re.S)
replacement = r'''  // Standardize All SOP Numbers manually (Admin Trigger).
  // The preview is calculated locally, but the mutation itself is performed by
  // an Admin-only Cloud Function that also reconciles reservations and ledgers.
  const handleStandardizeAllSopNumbers = async () => {
    if (userSession?.role !== 'admin') {
      addToast('error', 'Akses Ditolak', 'Hanya Administrator yang dapat menjalankan sinkronisasi nomor SPO.');
      return;
    }

    try {
      const reservations = await getAllNumberReservations();
      const preview = standardizeAllSops(sops, reservations);
      const result = await synchronizeSopNumbersInFirestore();

      if (result.changes.length > 0) {
        const changesById = new Map(result.changes.map((change) => [change.id, change]));
        setSops((current) => current.map((sop) => {
          const change = changesById.get(sop.id);
          return change
            ? { ...sop, sopNumber: change.newNumber, sequenceNumber: change.sequenceNumber, updatedAt: new Date().toISOString() }
            : sop;
        }));
      }

      if (result.changedCount === 0) {
        addToast(
          'info',
          'Penomoran Sudah Sinkron',
          `${result.reconciledScopes} scope penomoran telah dicek. Tidak ada gap yang perlu diperbaiki; nomor arsip dan Nomor Terbit tetap terkunci.`
        );
        return;
      }

      const summaryList = result.changes
        .slice(0, 4)
        .map((change) => `• ${change.oldNumber} ➔ ${change.newNumber}`)
        .join('\n');
      const remaining = result.changes.length > 4
        ? `\n...dan ${result.changes.length - 4} dokumen lainnya.`
        : '';
      const previewNote = preview.changedCount !== result.changedCount
        ? '\nData cloud berubah setelah pratinjau; hasil akhir mengikuti data authoritative Firebase.'
        : '';

      addToast(
        'success',
        `${result.changedCount} Nomor SPO Berhasil Disinkronkan`,
        `${result.duplicateCount > 0 ? `Ditemukan ${result.duplicateCount} konflik/duplikasi yang dirapikan.\n` : ''}Urutan kini kontinu per KODE + HIRARKI + TAHUN; slot DIARSIPKAN dan RESERVED tetap dikunci.\n${summaryList}${remaining}${previewNote}`,
        { duration: 10000 }
      );
    } catch (error) {
      console.error('SPO number synchronization failed:', error);
      addToast(
        'error',
        'Sinkronisasi Nomor Gagal',
        error instanceof Error ? error.message : 'Nomor SPO tidak diubah karena sinkronisasi authoritative gagal.'
      );
    }
  };'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'App handler replacement expected 1 match, got {count}')
text = replace_once(
    text,
    '        onOpenMaintenance={() => setIsMaintenanceModalOpen(true)}\n      />',
    '        onOpenMaintenance={() => setIsMaintenanceModalOpen(true)}\n        onStandardizeAllNumbers={handleStandardizeAllSopNumbers}\n      />',
    'App admin callback wiring',
)
write(path, text)

# ---------------------------------------------------------------------------
# 6. Allocator respects the short synchronization lock so a new number cannot
#    be issued while the ledger is being compacted/reconciled.
# ---------------------------------------------------------------------------
path = 'functions/sopNumberAllocator.js'
text = read(path)
text = replace_once(
    text,
    "  const db = getDb();\n  const scopeKey = getSequenceScope(year, divisionCode, subHierarchyCode);",
    "  const db = getDb();\n  const syncLockRef = db.collection('system_config').doc('spo_number_sync_lock');\n  const syncLockSnapshot = await syncLockRef.get();\n  const syncLockData = syncLockSnapshot.exists ? (syncLockSnapshot.data() || {}) : {};\n  if (syncLockData.active === true && Number(syncLockData.expiresAtMs || 0) > Date.now()) {\n    throw new HttpsError('aborted', 'Sinkronisasi nomor SPO sedang berjalan. Coba kembali setelah proses selesai.');\n  }\n  const scopeKey = getSequenceScope(year, divisionCode, subHierarchyCode);",
    'allocator lock preflight',
)
text = replace_once(
    text,
    "  return db.runTransaction(async (transaction) => {\n    const sequenceSnapshot = await transaction.get(sequenceRef);\n    const sequenceData = sequenceSnapshot.exists ? (sequenceSnapshot.data() || {}) : {};",
    "  return db.runTransaction(async (transaction) => {\n    const [lockSnapshot, sequenceSnapshot] = await Promise.all([\n      transaction.get(syncLockRef),\n      transaction.get(sequenceRef),\n    ]);\n    const lockData = lockSnapshot.exists ? (lockSnapshot.data() || {}) : {};\n    if (lockData.active === true && Number(lockData.expiresAtMs || 0) > Date.now()) {\n      throw new HttpsError('aborted', 'Sinkronisasi nomor SPO sedang berjalan. Coba kembali setelah proses selesai.');\n    }\n    const sequenceData = sequenceSnapshot.exists ? (sequenceSnapshot.data() || {}) : {};",
    'allocator lock transaction',
)
write(path, text)

# ---------------------------------------------------------------------------
# 7. Fix policy: a USED reservation linked to any current document follows that
#    document, including an archived document, and must not double-lock its slot.
# ---------------------------------------------------------------------------
path = 'functions/sopNumberSyncPolicy.js'
text = read(path)
old = "      const isMutableDocumentClaim = status === 'USED' && usedDocumentId && mutableDocIds.has(usedDocumentId);\n      if (isMutableDocumentClaim) continue;"
new = "      const isDocumentClaim = status === 'USED' && usedDocumentId && docById.has(usedDocumentId);\n      if (isDocumentClaim) continue;"
text = replace_once(text, old, new, 'sync policy used claim')
write(path, text)

# ---------------------------------------------------------------------------
# 8. Export the new callable without rewriting the legacy Functions index.
# ---------------------------------------------------------------------------
path = 'functions/main.js'
text = read(path)
text = replace_once(
    text,
    "exports.allocateSopNumber = require('./sopNumberAllocator').allocateSopNumber;",
    "exports.allocateSopNumber = require('./sopNumberAllocator').allocateSopNumber;\nexports.synchronizeSopNumbers = require('./sopNumberSync').synchronizeSopNumbers;",
    'functions main export',
)
write(path, text)

# ---------------------------------------------------------------------------
# 9. Make CI syntax-check and test both server and client rules.
# ---------------------------------------------------------------------------
path = 'package.json'
data = json.loads(read(path))
verify = data['scripts']['verify:functions']
if 'functions/sopNumberSync.js' not in verify:
    verify = verify.replace('node --check functions/sopNumberAllocator.js', 'node --check functions/sopNumberAllocator.js && node --check functions/sopNumberSyncPolicy.js && node --check functions/sopNumberSync.js')
data['scripts']['verify:functions'] = verify
numbering_test = data['scripts']['test:numbering-lifecycle']
if 'tests/sop-number-sync.test.ts' not in numbering_test:
    numbering_test = numbering_test.replace('tests/sop-number-lifecycle.test.ts', 'tests/sop-number-lifecycle.test.ts tests/sop-number-sync.test.ts')
if 'functions/sopNumberSync.test.js' not in numbering_test:
    numbering_test += ' && node --test functions/sopNumberSync.test.js'
data['scripts']['test:numbering-lifecycle'] = numbering_test
write(path, json.dumps(data, indent=2, ensure_ascii=False) + '\n')

print('Administrator sequential number sync patch applied successfully.')
