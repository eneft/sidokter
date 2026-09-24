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

# Activation permission hotfix: preparation may upload final scan/assets, but it
# must not make a separate Draft Firestore write before the authoritative
# sop-activate transaction. This removes the client/trusted-edit permission
# boundary from activation while keeping binary uploads durable.
sop_service = Path('src/lib/sopService.ts')
ss = sop_service.read_text()
old_prep_boundary = """  if (next.fileUrl) delete next.fileDataUrl;
  if (next.signedScanUrl) delete next.signedScanDataUrl;
  if (next.oldFileUrl) delete next.oldFileDataUrl;

  const index = all.findIndex((s) => s.id === next.id);"""
new_prep_boundary = """  if (next.fileUrl) delete next.fileDataUrl;
  if (next.signedScanUrl) delete next.signedScanDataUrl;
  if (next.oldFileUrl) delete next.oldFileDataUrl;

  // Activation preparation is asset-only. The DRAFT -> AKTIF lifecycle and
  // activation metadata are committed by the trusted sop-activate transaction.
  // Do not perform a separate sop-edit/Firestore write here: that extra boundary
  // can fail independently and must never block an otherwise valid activation.
  const isActivationPreparation = Boolean(
    options?.editActor &&
    next.status === 'DRAFT' &&
    next.activatedAt &&
    (next.activatedBy || next.activationNotes)
  );
  if (isActivationPreparation) {
    return next;
  }

  const index = all.findIndex((s) => s.id === next.id);"""
if old_prep_boundary in ss:
    ss = ss.replace(old_prep_boundary, new_prep_boundary, 1)
elif new_prep_boundary not in ss:
    raise RuntimeError('SPO activation preparation boundary not found')
sop_service.write_text(ss)

policy = Path('functions/sopActivationPolicy.js')
p = policy.read_text()
old_activation_fields = """  const activationFields = {
    status: 'AKTIF',
    everActivated: true,
    updatedAt,
    activatedAt: submitted.activatedAt || updatedAt.slice(0, 10),
    activatedBy: String(submitted.activatedBy || actor?.name || actor?.username || 'Administrator').trim(),
    activationNotes: String(submitted.activationNotes || '').trim(),
  };

  const riviu = isRiviu(storedSuccessor);"""
new_activation_fields = """  const activationFields = {
    status: 'AKTIF',
    everActivated: true,
    updatedAt,
    activatedAt: submitted.activatedAt || updatedAt.slice(0, 10),
    activatedBy: String(submitted.activatedBy || actor?.name || actor?.username || 'Administrator').trim(),
    activationNotes: String(submitted.activationNotes || '').trim(),
  };

  // Asset upload happens before this transaction. Carry only durable file
  // metadata into the authoritative activation write; never carry DataURLs.
  const durableStringFields = [
    'fileName', 'fileType', 'fileUrl', 'storagePath',
    'signedScanFileName', 'signedScanFileType', 'signedScanUrl', 'signedScanStoragePath',
    'oldFileName', 'oldFileType', 'oldFileUrl', 'oldStoragePath',
    'existingSourceFormat',
  ];
  for (const key of durableStringFields) {
    const value = String(submitted?.[key] || '').trim();
    if (value) activationFields[key] = value;
  }
  for (const key of ['fileSize', 'signedScanFileSize', 'oldFileSize']) {
    const value = Number(submitted?.[key]);
    if (Number.isFinite(value) && value >= 0) activationFields[key] = value;
  }
  if (Array.isArray(submitted?.supportingEvidence)) {
    activationFields.supportingEvidence = submitted.supportingEvidence;
  }

  const riviu = isRiviu(storedSuccessor);"""
if old_activation_fields in p:
    p = p.replace(old_activation_fields, new_activation_fields, 1)
elif new_activation_fields not in p:
    raise RuntimeError('Trusted activation metadata block not found')
policy.write_text(p)

policy_test = Path('functions/sopActivationPolicy.test.js')
pt = policy_test.read_text()
if 'activation carries durable uploaded scan metadata without DataURL' not in pt:
    pt += """

test('activation carries durable uploaded scan metadata without DataURL', () => {
  const result = buildSopActivationTransition({
    storedSuccessor: baseDraft,
    submitted: {
      ...baseDraft,
      activatedAt: '2026-09-24',
      signedScanFileName: 'scan-final.pdf',
      signedScanFileType: 'application/pdf',
      signedScanFileSize: 1234,
      signedScanUrl: '/api/storage/files/successor_signedScan',
      signedScanStoragePath: 'sidokter/spo/successor_signedScan.pdf',
      signedScanDataUrl: 'data:application/pdf;base64,AAAA',
    },
    actor: admin,
  });
  assert.equal(result.successor.signedScanFileName, 'scan-final.pdf');
  assert.equal(result.successor.signedScanFileSize, 1234);
  assert.equal(result.successor.signedScanUrl, '/api/storage/files/successor_signedScan');
  assert.equal(result.successor.signedScanStoragePath, 'sidokter/spo/successor_signedScan.pdf');
  assert.equal(Object.prototype.hasOwnProperty.call(result.successor, 'signedScanDataUrl'), false);
});
"""
policy_test.write_text(pt)

regression = Path('tests/sop-mutation-regression.test.cjs')
r = regression.read_text()
old_sources = """const indexSource = fs.readFileSync('functions/index.js', 'utf8');
const rulesSource = fs.readFileSync('firestore.rules', 'utf8');
const mainSource = fs.readFileSync('src/main.tsx', 'utf8');"""
new_sources = """const indexSource = fs.readFileSync('functions/index.js', 'utf8');
const rulesSource = fs.readFileSync('firestore.rules', 'utf8');
const mainSource = fs.readFileSync('src/main.tsx', 'utf8');
const sopServiceSource = fs.readFileSync('src/lib/sopService.ts', 'utf8');"""
if old_sources in r:
    r = r.replace(old_sources, new_sources, 1)
elif new_sources not in r:
    raise RuntimeError('SOP mutation regression source block not found')
if 'activation preparation is asset-only before trusted lifecycle commit' not in r:
    r += """

test('activation preparation is asset-only before trusted lifecycle commit', () => {
  assert.match(sopServiceSource, /const isActivationPreparation = Boolean\(/);
  assert.match(sopServiceSource, /if \(isActivationPreparation\) \{\s*return next;\s*\}/);
  const prepIndex = sopServiceSource.indexOf('const isActivationPreparation');
  const authoritativeSaveIndex = sopServiceSource.indexOf('const saved = options?.editActor', prepIndex);
  assert.ok(prepIndex >= 0 && authoritativeSaveIndex > prepIndex, 'activation preparation must return before authoritative edit save');
});
"""
regression.write_text(r)

changed = subprocess.run(['git', 'diff', '--quiet']).returncode != 0
print('changed=true' if changed else 'changed=false')
