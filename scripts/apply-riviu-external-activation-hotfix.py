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

modal = Path('src/components/UploadSopModal.tsx')
m = modal.read_text()
old_validation = """      const reviewNumber = normalizeSopNumberInput(oldSopNumber);
      const referenced = findAuthoritativeRiviuPredecessor(sops, { oldSopNumber });
      const hasExternalSignedPdf = Boolean(selectedOldFile && (selectedOldFile.type === 'application/pdf' || selectedOldFile.name.toLowerCase().endsWith('.pdf')) && externalReviewSignedConfirmed);
      if (!referenced) {
        alert(`SPO rujukan \"${reviewNumber}\" harus merupakan SPO terdaftar yang berstatus AKTIF.`);
        return;
      }
      if (referenced && referenced.status !== 'AKTIF') {
        alert(`SPO rujukan \"${reviewNumber}\" harus berstatus AKTIF.`);
        return;
      }
      const isNewFormat = isNewSopFormat(reviewNumber);"""
new_validation = """      const reviewNumber = normalizeSopNumberInput(oldSopNumber);
      const referenced = findAuthoritativeRiviuPredecessor(sops, { oldSopNumber: reviewNumber });
      const hasExternalSignedPdf = Boolean(
        selectedOldFile
        && (selectedOldFile.type === 'application/pdf' || selectedOldFile.name.toLowerCase().endsWith('.pdf'))
        && oldFileDataUrl
        && externalReviewSignedConfirmed
      );
      if (referenced && referenced.status !== 'AKTIF') {
        alert(`SPO rujukan \"${reviewNumber}\" harus berstatus AKTIF.`);
        return;
      }
      if (!referenced && !hasExternalSignedPdf) {
        alert(`Nomor SPO legacy/eksternal \"${reviewNumber}\" belum terdaftar di SIDOKTER. Unggah PDF SPO lama yang resmi dan centang konfirmasi dokumen sumber untuk melanjutkan Riviu.`);
        return;
      }
      if (!previousRevisionNumber.trim()) {
        alert('Nomor revisi dokumen lama wajib diisi untuk proses Riviu.');
        return;
      }
      const resolvedManualRevision = getAuthoritativeRiviuRevision(referenced, previousRevisionNumber);
      if (!resolvedManualRevision.previousRevisionNumber || !resolvedManualRevision.revisionNumber) {
        alert('Nomor revisi dokumen lama tidak valid.');
        return;
      }
      const isNewFormat = isNewSopFormat(reviewNumber);"""
if old_validation in m:
    m = m.replace(old_validation, new_validation, 1)
elif new_validation not in m:
    raise RuntimeError('Riviu input validation block not found')

old_input = """                        <input
                          type=\"text\"
                          required={documentType === 'REVIEW'}
                          value={oldSopNumber}
                          onChange={(e) => setOldSopNumber(e.target.value)}
                          placeholder=\"Contoh: PEL / 1.1.3 / 015 / 2023 - SPO Pelayanan Rekam Jantung EKG\"
                          className=\"w-full text-xs sm:text-sm border border-amber-300 rounded-xl px-3.5 py-2 text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 font-medium\"
                        />"""
new_input = """                        <input
                          type=\"text\"
                          required={documentType === 'REVIEW'}
                          value={oldSopNumber}
                          onChange={(e) => setOldSopNumber(e.target.value.toUpperCase())}
                          onBlur={() => {
                            if (oldSopNumber.trim()) setOldSopNumber(normalizeSopNumberInput(oldSopNumber));
                          }}
                          placeholder=\"Contoh: PEL / 1.1.3 / 015 / 2023 atau SOEGIRI-KEP / 001 / 568 / 2024\"
                          className=\"w-full text-xs sm:text-sm border border-amber-300 rounded-xl px-3.5 py-2 text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 font-medium\"
                        />
                        {oldSopNumber.trim() && (() => {
                          const normalized = normalizeSopNumberInput(oldSopNumber);
                          const detected = findAuthoritativeRiviuPredecessor(sops, { oldSopNumber: normalized });
                          return detected ? (
                            <div className=\"mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800\">
                              ✓ Terdeteksi sebagai SPO SIDOKTER: {detected.sopNumber} — status {detected.status}.
                            </div>
                          ) : (
                            <div className=\"mt-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-800\">
                              Nomor tidak ditemukan di register SIDOKTER — diperlakukan sebagai SPO legacy/eksternal. PDF SPO lama resmi + konfirmasi dokumen sumber wajib diunggah.
                            </div>
                          );
                        })()}"""
if old_input in m:
    m = m.replace(old_input, new_input, 1)
elif new_input not in m:
    raise RuntimeError('Riviu old-number input block not found')
modal.write_text(m)

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
