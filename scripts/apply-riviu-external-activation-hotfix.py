from pathlib import Path
import subprocess

app = Path('src/App.tsx')
s = app.read_text()
old_import = "import { findAuthoritativeRiviuPredecessor, getAuthoritativeRiviuRevision } from './utils/riviuRevision';"
new_import = "import { findAuthoritativeRiviuPredecessor, getAuthoritativeRiviuRevision, hasDurableExternalRiviuSource } from './utils/riviuRevision';"
if old_import in s:
    s = s.replace(old_import, new_import, 1)

old_block = """    if (targetIsRiviu) {
      reviewedSource = findAuthoritativeRiviuPredecessor(sops, {
        existingSopId: target.existingSopId,
        oldSopNumber: target.oldSopNumber,
      });

      if (!reviewedSource || reviewedSource.status !== 'AKTIF') {
        addToast('error', 'Aktivasi Ditolak', 'SPO pendahulu Riviu tidak ditemukan atau tidak lagi AKTIF.');
        return;
      }
      try {
        const resolved = getAuthoritativeRiviuRevision(reviewedSource, target.previousRevisionNumber);
        reviewRevisionNumber = resolved.revisionNumber;
      } catch (error) {
        addToast('error', 'Aktivasi Ditolak', error instanceof Error ? error.message : 'Nomor revisi pendahulu tidak valid.');
        return;
      }
    }"""
new_block = """    if (targetIsRiviu) {
      reviewedSource = findAuthoritativeRiviuPredecessor(sops, {
        existingSopId: target.existingSopId,
        oldSopNumber: target.oldSopNumber,
      });

      if (reviewedSource && reviewedSource.status !== 'AKTIF') {
        addToast('error', 'Aktivasi Ditolak', 'SPO pendahulu Riviu tidak lagi AKTIF.');
        return;
      }
      if (!reviewedSource && !hasDurableExternalRiviuSource(target)) {
        addToast('error', 'Aktivasi Ditolak', 'SPO pendahulu Riviu tidak ditemukan dan PDF sumber Riviu belum tersimpan di Firebase Storage.');
        return;
      }
      try {
        const resolved = getAuthoritativeRiviuRevision(reviewedSource, target.previousRevisionNumber);
        if (!resolved.previousRevisionNumber || !resolved.revisionNumber) {
          throw new Error('Nomor revisi pendahulu wajib diisi untuk Riviu dari dokumen legacy/eksternal.');
        }
        reviewRevisionNumber = resolved.revisionNumber;
      } catch (error) {
        addToast('error', 'Aktivasi Ditolak', error instanceof Error ? error.message : 'Nomor revisi pendahulu tidak valid.');
        return;
      }
    }"""
if old_block in s:
    s = s.replace(old_block, new_block, 1)
elif new_block not in s:
    raise RuntimeError('Target activation block not found')
app.write_text(s)

util = Path('src/utils/riviuRevision.ts')
u = util.read_text()
marker = 'export const getAuthoritativeRiviuRevision = ('
helper = """export const hasDurableExternalRiviuSource = (sop?: Partial<SopDocument> | null): boolean => {
  if (!sop) return false;
  const name = String(sop.oldFileName || '').trim().toLowerCase();
  const type = String(sop.oldFileType || '').trim().toLowerCase();
  const isPdf = type === 'application/pdf' || name.endsWith('.pdf');
  return Boolean(isPdf && sop.oldFileUrl && sop.oldStoragePath);
};

"""
if 'export const hasDurableExternalRiviuSource' not in u:
    if marker not in u:
        raise RuntimeError('Riviu revision marker not found')
    u = u.replace(marker, helper + marker, 1)
util.write_text(u)

test = Path('tests/riviu-revision-authority.test.ts')
t = test.read_text()
old_test_import = "import { getAuthoritativeRiviuRevision, findAuthoritativeRiviuPredecessor } from '../src/utils/riviuRevision';"
new_test_import = "import { getAuthoritativeRiviuRevision, findAuthoritativeRiviuPredecessor, hasDurableExternalRiviuSource } from '../src/utils/riviuRevision';"
if old_test_import in t:
    t = t.replace(old_test_import, new_test_import, 1)
if 'Riviu activation accepts only durable external Riviu source metadata' not in t:
    t += """

test('Riviu activation accepts only durable external Riviu source metadata', () => {
  assert.equal(hasDurableExternalRiviuSource({
    oldFileName: 'spo-lama.pdf',
    oldFileType: 'application/pdf',
    oldFileUrl: '/api/storage/files/sop-oldFile',
    oldStoragePath: 'sidokter/spo/sop-oldFile.pdf',
  }), true);
  assert.equal(hasDurableExternalRiviuSource({
    oldFileName: 'spo-lama.pdf',
    oldFileType: 'application/pdf',
    oldFileUrl: '/api/storage/files/sop-oldFile',
  }), false);
  assert.equal(hasDurableExternalRiviuSource({
    oldFileName: 'spo-lama.docx',
    oldFileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    oldFileUrl: '/api/storage/files/sop-oldFile',
    oldStoragePath: 'sidokter/spo/sop-oldFile.docx',
  }), false);
});
"""
test.write_text(t)

changed = subprocess.run(['git', 'diff', '--quiet']).returncode != 0
print('changed=true' if changed else 'changed=false')
