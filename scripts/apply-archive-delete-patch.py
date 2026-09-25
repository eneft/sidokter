from pathlib import Path
import re
import textwrap


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# App: explicit archive-delete intent + dependency warning metadata.
# ---------------------------------------------------------------------------
app_path = Path('src/App.tsx')
app = app_path.read_text(encoding='utf-8')
app = replace_once(
    app,
    "import { findAuthoritativeRiviuPredecessor, getAuthoritativeRiviuRevision, hasDurableExternalRiviuSource } from './utils/riviuRevision';\n",
    "import { findAuthoritativeRiviuPredecessor, getAuthoritativeRiviuRevision, hasDurableExternalRiviuSource } from './utils/riviuRevision';\nimport { findArchivedSopRelations } from './utils/sopArchiveRelations';\n",
    'App archive relation import',
)
app = replace_once(
    app,
    "  const [sopToDelete, setSopToDelete] = useState<{ id: string; title: string; sopNumber: string } | null>(null);",
    textwrap.dedent("""\
      const [sopToDelete, setSopToDelete] = useState<{
        id: string;
        title: string;
        sopNumber: string;
        status: SopStatus;
        relatedDocuments: Array<{ id: string; sopNumber: string; title: string }>;
      } | null>(null);"""),
    'App delete modal state',
)

delete_start = app.find('  // Delete SOP Handler (Opens Custom Confirm Modal)')
delete_end = app.find('  const handleResetCountersToZero = () => {', delete_start)
if delete_start < 0 or delete_end <= delete_start:
    raise SystemExit('App delete handler boundaries not found')
new_delete_handlers = textwrap.dedent("""\
  // Delete SOP Handler (Opens Custom Confirm Modal)
  const handleDeleteSop = (id: string, title: string) => {
    const target = sops.find((s) => s.id === id);
    if (!target) return;

    // Permanent deletion of an archive is an Admin-only destructive action.
    // The backend enforces this again; this guard only prevents exposing an
    // impossible action in stale/non-admin UI state.
    if (target.status === 'DIARSIPKAN' && userSession?.role !== 'admin') {
      addToast('error', 'Akses Ditolak', 'Hanya Administrator yang dapat menghapus permanen SPO arsip.');
      return;
    }

    const relatedDocuments = target.status === 'DIARSIPKAN'
      ? findArchivedSopRelations(target, sops).map((item) => ({
          id: item.id,
          sopNumber: item.sopNumber,
          title: item.title,
        }))
      : [];

    setSopToDelete({
      id,
      title: target.title || title,
      sopNumber: target.sopNumber || id,
      status: target.status,
      relatedDocuments,
    });
  };

  const confirmDeleteSop = async () => {
    if (!sopToDelete) return;
    const { id, title, status } = sopToDelete;
    const permanentArchived = status === 'DIARSIPKAN';

    if (permanentArchived && userSession?.role !== 'admin') {
      addToast('error', 'Akses Ditolak', 'Hanya Administrator yang dapat menghapus permanen SPO arsip.');
      setSopToDelete(null);
      return;
    }

    try {
      // Permanent archive deletion is opt-in. Active SPO and ordinary
      // DRAFT deletion keep their existing lifecycle behavior.
      const deleteResult = await deleteSopFromLocal(id, { permanentArchived });
      if (deleteResult === 'DELETED') deleteFileFromLocalCache(id);

      if (deleteResult === 'ARCHIVED') {
        // Keep the archived record in local state immediately. This avoids
        // a transient disappearance while the Firestore realtime snapshot
        // catches up and does not change the authoritative server state.
        setSops((prev) => prev.map((s) => s.id === id ? {
          ...s,
          status: 'DIARSIPKAN' as const,
          everActivated: true,
          archivedAt: s.archivedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } : s));
      } else {
        setSops((prev) => prev.filter((s) => s.id !== id));
      }

      if (permanentArchived && deleteResult === 'DELETED') {
        addToast(
          'info',
          'Arsip SPO Dihapus Permanen',
          `Arsip "${title}" telah dihapus. Referensi historis pada SPO lain tidak diubah dan nomor resmi tidak dikembalikan ke antrean.`
        );
      } else {
        addToast(
          'info',
          deleteResult === 'ARCHIVED' ? 'SPO Diarsipkan' : 'Draft Dihapus',
          deleteResult === 'ARCHIVED'
            ? `SPO "${title}" dipindahkan ke Arsip SPO. Nomornya tetap terkunci permanen.`
            : `Draft "${title}" dihapus. Nomornya tersedia kembali pada hirarki dan tahun yang sama.`
        );
      }

      if (selectedSopForDetail?.id === id) setSelectedSopForDetail(null);
      if (selectedSopForEdit?.id === id) setSelectedSopForEdit(null);
      setSopToDelete(null);
    } catch (error) {
      console.error('Error deleting SOP from local database:', error);
      addToast(
        'error',
        'Penghapusan Gagal',
        error instanceof Error ? error.message : 'Dokumen tidak dihapus karena perubahan belum berhasil disimpan ke server.'
      );
    }
  };

""")
app = app[:delete_start] + new_delete_handlers + app[delete_end:]

modal_pattern = re.compile(r'(?m)^(\s*)title=\{sopToDelete\?\.title\}\s*$')

def add_modal_props(match: re.Match) -> str:
    indent = match.group(1)
    return (
        f"{indent}title={{sopToDelete?.title}}\n"
        f"{indent}isArchived={{sopToDelete?.status === 'DIARSIPKAN'}}\n"
        f"{indent}relatedDocuments={{sopToDelete?.relatedDocuments || []}}"
    )

app, modal_count = modal_pattern.subn(add_modal_props, app)
if modal_count < 1:
    raise SystemExit('App DeleteConfirmModal wiring not found')
app_path.write_text(app, encoding='utf-8')


# ---------------------------------------------------------------------------
# Local service: propagate an explicit permanent-archive option.
# ---------------------------------------------------------------------------
service_path = Path('src/lib/sopService.ts')
service = service_path.read_text(encoding='utf-8')
service = replace_once(
    service,
    "export async function deleteSopFromLocal(id: string): Promise<'DELETED' | 'ARCHIVED'> {\n",
    "export async function deleteSopFromLocal(id: string, options?: { permanentArchived?: boolean }): Promise<'DELETED' | 'ARCHIVED'> {\n",
    'sopService delete signature',
)
service = replace_once(
    service,
    "  const result = await deleteSopFromFirestore(id);\n",
    "  const result = await deleteSopFromFirestore(id, options);\n",
    'sopService delete options forwarding',
)
service_path.write_text(service, encoding='utf-8')


# ---------------------------------------------------------------------------
# Firestore client: archive hard-delete MUST use trusted backend.
# Existing DRAFT delete and ACTIVE->ARCHIVE transaction stays intact.
# ---------------------------------------------------------------------------
firestore_path = Path('src/lib/firestoreService.ts')
firestore = firestore_path.read_text(encoding='utf-8')
firestore = replace_once(
    firestore,
    "export async function deleteSopFromFirestore(id: string): Promise<'DELETED' | 'ARCHIVED'> {\n",
    "export async function deleteSopFromFirestore(id: string, options?: { permanentArchived?: boolean }): Promise<'DELETED' | 'ARCHIVED'> {\n",
    'firestore delete signature',
)
delete_fn_start = firestore.find("export async function deleteSopFromFirestore(id: string, options?: { permanentArchived?: boolean })")
direct_marker = firestore.find('    // 1. Authoritative direct Firestore transaction', delete_fn_start)
if delete_fn_start < 0 or direct_marker < 0:
    raise SystemExit('firestore delete function marker not found')
prefix = firestore[delete_fn_start:direct_marker]
status_marker = "    updateStatus({ isSyncing: true });\n\n"
if status_marker not in prefix:
    raise SystemExit('firestore delete status marker not found')
trusted_archive = textwrap.dedent("""\
    // Permanent deletion of DIARSIPKAN is intentionally routed through the
    // trusted session boundary. Firestore rules continue to deny client-side
    // deletion of official history, so no security rule is weakened.
    if (options?.permanentArchived) {
      const apiRes = await callAuthenticatedAuthApi('sop-delete', {
        id,
        intent: 'PERMANENT_ARCHIVE_DELETE',
      });
      if (!apiRes?.success) {
        throw new Error(apiRes?.message || 'SPO arsip gagal dihapus permanen.');
      }
      const result = apiRes.result === 'ARCHIVED' ? 'ARCHIVED' : 'DELETED';
      updateStatus({
        isConnected: true,
        isSyncing: false,
        lastSync: new Date().toISOString(),
        error: null,
      });
      return result;
    }

""")
prefix = prefix.replace(status_marker, status_marker + trusted_archive, 1)
firestore = firestore[:delete_fn_start] + prefix + firestore[direct_marker:]
firestore_path.write_text(firestore, encoding='utf-8')


# ---------------------------------------------------------------------------
# Backend: explicit policy, no cascade, archive-only storage cleanup.
# ---------------------------------------------------------------------------
fn_path = Path('functions/index.js')
fn = fn_path.read_text(encoding='utf-8')
fn = replace_once(
    fn,
    "const { buildSopActivationTransition } = require('./sopActivationPolicy');\n",
    "const { buildSopActivationTransition } = require('./sopActivationPolicy');\nconst { decideSopDeleteAction } = require('./sopDeletePolicy');\n",
    'functions delete policy import',
)

action_start = fn.find("    if (action === 'sop-delete') {")
action_end = fn.find("    if (action === 'migrate-sop-access') {", action_start)
if action_start < 0 or action_end <= action_start:
    raise SystemExit('trusted sop-delete block boundaries not found')
block = fn[action_start:action_end]
block = replace_once(
    block,
    "      if (!sopId) return json(res, 400, { success: false, code: 'INVALID_SOP_ID', message: 'ID SPO wajib diisi.' });\n\n      const sopRef = db.collection('sops').doc(sopId);\n      let deletionResult = 'DELETED';\n",
    textwrap.dedent("""\
          if (!sopId) return json(res, 400, { success: false, code: 'INVALID_SOP_ID', message: 'ID SPO wajib diisi.' });
          const permanentArchiveDeleteRequested = String(req.body?.intent || '').trim().toUpperCase() === 'PERMANENT_ARCHIVE_DELETE';

          const sopRef = db.collection('sops').doc(sopId);
          let deletionResult = 'DELETED';
          let deletionKind = 'DRAFT';
          let permanentlyDeletedArchive = null;
          let storageCleanup = null;
"""),
    'trusted delete intent variables',
)

policy_start = block.find('          const wasEverActive =')
draft_start = block.find('          const divisionCode = String(stored.divisionCode', policy_start)
if policy_start < 0 or draft_start <= policy_start:
    raise SystemExit('trusted delete lifecycle section not found')
new_policy_section = textwrap.dedent("""\
          const deleteDecision = decideSopDeleteAction({
            stored,
            isAdmin,
            isCreator,
            permanentArchiveDeleteRequested,
          });

          if (deleteDecision === 'DELETE_ARCHIVE') {
            // Historical relationships live on successor documents (existingSopId,
            // oldSopNumber, previousSopNumber). Delete only this archive record;
            // never cascade or rewrite a successor.
            transaction.delete(sopRef);

            const auditRef = db.collection('audit_logs').doc();
            transaction.set(auditRef, {
              id: auditRef.id,
              action: 'SOP_ARCHIVE_DELETED',
              documentId: stored.id,
              documentNumber: stored.sopNumber || '',
              documentTitle: stored.title || '',
              documentStatus: 'DIARSIPKAN',
              permanent: true,
              referencesPreserved: true,
              numberRecycled: false,
              actorUid: context.decoded?.uid || userUid || 'unknown',
              actorName: context.user?.name || context.user?.username || 'Administrator',
              actorUsername: context.user?.username || '',
              actorRole: context.user?.role || 'admin',
              timestamp: FieldValue.serverTimestamp(),
              boundary: 'trusted-session',
            });

            permanentlyDeletedArchive = stored;
            deletionResult = 'DELETED';
            deletionKind = 'ARCHIVE';
            return;
          }

          if (deleteDecision === 'ARCHIVE') {
            transaction.set(sopRef, {
              ...stored,
              status: 'DIARSIPKAN',
              everActivated: true,
              archivedAt: stored.archivedAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }, { merge: true });

            const auditRef = db.collection('audit_logs').doc();
            transaction.set(auditRef, {
              id: auditRef.id,
              action: 'SOP_ARCHIVED',
              documentId: stored.id,
              documentNumber: stored.sopNumber || '',
              documentStatus: 'DIARSIPKAN',
              actorUid: context.decoded?.uid || userUid || 'unknown',
              actorName: context.user?.name || context.user?.username || 'Pengguna SIDOKTER',
              actorUsername: context.user?.username || '',
              actorRole: context.user?.role || 'user',
              timestamp: FieldValue.serverTimestamp(),
              boundary: 'trusted-session',
            });

            deletionResult = 'ARCHIVED';
            deletionKind = 'OFFICIAL';
            return;
          }

          // DELETE_DRAFT falls through to the existing sequence/reservation
          // recycling logic below. Official archived numbers never reach it.

""")
# Keep indentation appropriate for the transaction body.
new_policy_section = textwrap.indent(new_policy_section, '          ')
block = block[:policy_start] + new_policy_section + block[draft_start:]

transaction_end_marker = '        });\n      } catch (err) {'
transaction_end = block.find(transaction_end_marker)
if transaction_end < 0:
    raise SystemExit('trusted delete transaction end not found')
cleanup_after_tx = textwrap.dedent("""\
        });

        if (permanentlyDeletedArchive) {
          try {
            storageCleanup = await deleteArchivedSopStorageArtifacts(permanentlyDeletedArchive);
          } catch (cleanupError) {
            // Firestore deletion + audit are already committed. A storage cleanup
            // failure must not resurrect or partially rewrite other SPO records.
            storageCleanup = { failed: true, message: cleanupError?.message || String(cleanupError) };
            console.warn('[SPO archive delete] storage cleanup warning', {
              sopId,
              error: cleanupError?.message || cleanupError,
            });
          }
        }
      } catch (err) {""")
cleanup_after_tx = textwrap.indent(cleanup_after_tx, '      ')
# indent() also indents the closing catch, so normalize to the original level.
cleanup_after_tx = cleanup_after_tx.replace('            } catch (err) {', '      } catch (err) {')
block = block[:transaction_end] + cleanup_after_tx + block[transaction_end + len(transaction_end_marker):]

old_response = "      return json(res, 200, { success: true, result: deletionResult, message: deletionResult === 'ARCHIVED' ? 'SPO resmi telah diarsipkan.' : 'Draft SPO berhasil dihapus.' });\n"
new_response = textwrap.dedent("""\
      const successMessage = deletionResult === 'ARCHIVED'
        ? 'SPO resmi telah diarsipkan.'
        : deletionKind === 'ARCHIVE'
          ? 'SPO arsip berhasil dihapus permanen.'
          : 'Draft SPO berhasil dihapus.';
      return json(res, 200, {
        success: true,
        result: deletionResult,
        deletedKind: deletionKind,
        storageCleanup,
        message: successMessage,
      });
""")
new_response = textwrap.indent(new_response, '      ')
block = replace_once(block, old_response, new_response, 'trusted delete response')
fn = fn[:action_start] + block + fn[action_end:]

cleanup_marker = 'async function storageDelete(req, res) {'
cleanup_pos = fn.find(cleanup_marker)
if cleanup_pos < 0:
    raise SystemExit('storageDelete marker not found')
cleanup_helper = """function collectSopStoragePaths(sop = {}) {
  const paths = new Set();
  const add = value => {
    const clean = String(value || '').trim().replace(/^\\/+/, '');
    // Archive hard-delete owns only SPO-domain files. Never touch SK/MOU or
    // arbitrary paths even when stale metadata is present.
    if (clean.startsWith('sidokter/spo/')) paths.add(clean);
  };
  add(sop.storagePath);
  add(sop.signedScanStoragePath);
  add(sop.oldStoragePath);
  for (const evidence of Array.isArray(sop.supportingEvidence) ? sop.supportingEvidence : []) {
    add(evidence?.storagePath);
  }
  return paths;
}

function collectSopStorageMetadataIds(sop = {}) {
  const safe = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const sopId = String(sop.id || '').trim();
  if (!sopId) return new Set();
  const ids = new Set([
    safe(`${sopId}_file`),
    safe(`${sopId}_signedScan`),
    safe(`${sopId}_oldFile`),
  ]);
  for (const evidence of Array.isArray(sop.supportingEvidence) ? sop.supportingEvidence : []) {
    if (evidence?.id) ids.add(safe(`${sopId}_evidence_${evidence.id}`));
  }
  return ids;
}

function collectReferencedStorageMetadataIds(sop = {}) {
  const ids = new Set();
  const add = value => {
    const raw = String(value || '');
    const match = raw.match(/\\/api\\/storage\\/files\\/([^/?#]+)/i);
    if (match?.[1]) {
      try { ids.add(decodeURIComponent(match[1])); } catch { ids.add(match[1]); }
    }
  };
  add(sop.fileUrl);
  add(sop.signedScanUrl);
  add(sop.oldFileUrl);
  for (const evidence of Array.isArray(sop.supportingEvidence) ? sop.supportingEvidence : []) {
    add(evidence?.fileUrl);
  }
  return ids;
}

async function deleteArchivedSopStorageArtifacts(stored) {
  const sopId = String(stored?.id || '').trim();
  if (!sopId) return { deletedObjects: 0, deletedMetadata: 0, skippedShared: 0 };

  const candidatePaths = collectSopStoragePaths(stored);
  const candidateMeta = new Map();
  const candidateIds = collectSopStorageMetadataIds(stored);

  // Modern uploads carry sopId. Explicit IDs cover legacy metadata written
  // before that index existed.
  try {
    const indexed = await db.collection(STORAGE_COLLECTION).where('sopId', '==', sopId).get();
    indexed.docs.forEach(docSnap => candidateMeta.set(docSnap.id, docSnap));
  } catch (error) {
    console.warn('[SPO archive delete] storage index lookup warning', error?.message || error);
  }
  for (const id of candidateIds) {
    if (candidateMeta.has(id)) continue;
    const snap = await db.collection(STORAGE_COLLECTION).doc(id).get();
    if (snap.exists) candidateMeta.set(id, snap);
  }

  for (const snap of candidateMeta.values()) {
    const meta = snap.data() || {};
    const objectPath = resolveStorageObjectPath(meta);
    if (objectPath) candidatePaths.add(String(objectPath).replace(/^\\/+/, ''));
    if (meta.previewObjectPath) candidatePaths.add(String(meta.previewObjectPath).replace(/^\\/+/, ''));
  }

  // Protect any binary still referenced by another SPO. Relationship metadata
  // survives archive deletion; shared binaries must survive as well.
  const retainedPaths = new Set();
  const retainedMetaIds = new Set();
  const remaining = await db.collection('sops').get();
  for (const docSnap of remaining.docs) {
    if (docSnap.id === sopId) continue;
    const other = { id: docSnap.id, ...docSnap.data() };
    collectSopStoragePaths(other).forEach(value => retainedPaths.add(value));
    collectReferencedStorageMetadataIds(other).forEach(value => retainedMetaIds.add(value));
  }

  let deletedObjects = 0;
  let deletedMetadata = 0;
  let skippedShared = 0;
  const bucket = getStorageBucket();
  for (const objectPath of candidatePaths) {
    if (!String(objectPath).startsWith('sidokter/spo/')) continue;
    if (retainedPaths.has(objectPath)) {
      skippedShared += 1;
      continue;
    }
    try {
      await bucket.file(objectPath).delete({ ignoreNotFound: true });
      deletedObjects += 1;
    } catch (error) {
      console.warn('[SPO archive delete] object cleanup warning', objectPath, error?.message || error);
    }
  }

  for (const [id, snap] of candidateMeta.entries()) {
    const meta = snap.data() || {};
    const objectPath = String(resolveStorageObjectPath(meta) || '').replace(/^\\/+/, '');
    if (retainedMetaIds.has(id) || (objectPath && retainedPaths.has(objectPath))) {
      skippedShared += 1;
      continue;
    }
    await snap.ref.delete();
    deletedMetadata += 1;
  }

  return { deletedObjects, deletedMetadata, skippedShared };
}

"""
fn = fn[:cleanup_pos] + cleanup_helper + fn[cleanup_pos:]
fn_path.write_text(fn, encoding='utf-8')


# ---------------------------------------------------------------------------
# Keep regression tests in the ordinary CI path.
# ---------------------------------------------------------------------------
package_path = Path('package.json')
package = package_path.read_text(encoding='utf-8')
package = replace_once(
    package,
    'tsx --test tests/sop-edit-policy.test.ts && node --test',
    'tsx --test tests/sop-edit-policy.test.ts tests/sop-archive-relations.test.ts && node --test',
    'package relation regression',
)
package = replace_once(
    package,
    'functions/sopActivationPolicy.test.js tests/sop-edit-trusted-boundary.test.cjs',
    'functions/sopActivationPolicy.test.js functions/sopDeletePolicy.test.js tests/sop-edit-trusted-boundary.test.cjs',
    'package delete policy regression',
)
package = replace_once(
    package,
    'tests/sop-edit-trusted-boundary.test.cjs tests/sop-alur-image-delete.test.cjs',
    'tests/sop-edit-trusted-boundary.test.cjs tests/sop-archive-delete-boundary.test.cjs tests/sop-alur-image-delete.test.cjs',
    'package boundary contract regression',
)
package_path.write_text(package, encoding='utf-8')

contract = Path('tests/sop-archive-delete-boundary.test.cjs')
contract.write_text(textwrap.dedent("""\
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('archived SPO permanent delete is explicit and trusted-backend only', () => {
  const firestore = readFileSync('src/lib/firestoreService.ts', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  const backend = readFileSync('functions/index.js', 'utf8');
  assert.match(firestore, /intent:\\s*'PERMANENT_ARCHIVE_DELETE'/);
  assert.match(app, /permanentArchived = status === 'DIARSIPKAN'/);
  assert.match(backend, /deleteDecision === 'DELETE_ARCHIVE'/);
  assert.match(backend, /action:\\s*'SOP_ARCHIVE_DELETED'/);
  assert.match(backend, /referencesPreserved:\\s*true/);
  assert.match(backend, /numberRecycled:\\s*false/);
});

test('archive dependency UI is warning-only and does not cascade', () => {
  const modal = readFileSync('src/components/DeleteConfirmModal.tsx', 'utf8');
  const backend = readFileSync('functions/index.js', 'utf8');
  assert.match(modal, /Penghapusan tetap dapat dilanjutkan/);
  assert.match(modal, /metadata referensi historisnya tetap dipertahankan/);
  assert.doesNotMatch(backend, /transaction\\.delete\\([^)]*(successor|related|dependent)/i);
});
"""), encoding='utf-8')

print('Archive delete patch applied successfully.')
