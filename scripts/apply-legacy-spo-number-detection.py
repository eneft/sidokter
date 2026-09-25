from pathlib import Path
import re

# 1) Make legacy-number recognition explicit and predecessor comparison tolerant
p = Path('src/utils/riviuRevision.ts')
s = p.read_text()
s = s.replace(
    "import { getNextRevisionNumber, normalizeSopNumberInput } from './numbering';",
    "import { getNextRevisionNumber, normalizeSopNumberInput, isNewSopFormat } from './numbering';",
    1,
)
helper = r'''
const sopNumberComparisonKey = (value?: string | null): string =>
  normalizeSopNumberInput(value || '')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, '');

/**
 * Recognizes legacy/external SPO number shapes without forcing them into the
 * current SIDOKTER hierarchy format. Legacy numbers remain historical source
 * identifiers; they are never converted into a new-format document number.
 */
export const isRecognizedLegacySopNumber = (value?: string | null): boolean => {
  const normalized = normalizeSopNumberInput(value || '');
  if (!normalized || isNewSopFormat(normalized)) return false;

  const parts = normalized.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return false;

  const year = parts[parts.length - 1];
  if (!/^(?:19|20)\d{2}$/.test(year)) return false;

  // Historical formats vary (e.g. SOEGIRI-KEP / 001 / 568 / 2024 or
  // 440 / 102 / SPO / PEL / 2023), but they still carry a numeric identity.
  return parts.slice(0, -1).some((part) => /\d/.test(part));
};

'''
marker = 'export const findAuthoritativeRiviuPredecessor = ('
if 'export const isRecognizedLegacySopNumber' not in s:
    if marker not in s:
        raise RuntimeError('riviuRevision marker not found')
    s = s.replace(marker, helper + marker, 1)

old = """  const normalizedOldNumber = normalizeSopNumberInput(params.oldSopNumber || '');
  if (!normalizedOldNumber) return undefined;

  const matches = sops.filter((sop) =>
    normalizeSopNumberInput(sop.sopNumber || '') === normalizedOldNumber
    || normalizeSopNumberInput(sop.legacySopNumber || '') === normalizedOldNumber
  );
"""
new = """  const normalizedOldNumber = normalizeSopNumberInput(params.oldSopNumber || '');
  const oldNumberKey = sopNumberComparisonKey(normalizedOldNumber);
  if (!oldNumberKey) return undefined;

  const matches = sops.filter((sop) =>
    sopNumberComparisonKey(sop.sopNumber || '') === oldNumberKey
    || sopNumberComparisonKey(sop.legacySopNumber || '') === oldNumberKey
  );
"""
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError('riviuRevision predecessor block not found')
p.write_text(s)

# 2) Upload/Riviu form: distinguish recognized legacy format from merely not-found
p = Path('src/components/UploadSopModal.tsx')
s = p.read_text()
s = s.replace(
    "import { findAuthoritativeRiviuPredecessor, getAuthoritativeRiviuRevision } from '../utils/riviuRevision';",
    "import { findAuthoritativeRiviuPredecessor, getAuthoritativeRiviuRevision, isRecognizedLegacySopNumber } from '../utils/riviuRevision';",
    1,
)
old_fallback = '''                          ) : (\n                            <div className="mt-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-800">\n                              Nomor tidak ditemukan di register SIDOKTER — diperlakukan sebagai SPO legacy/eksternal. PDF SPO lama resmi + konfirmasi dokumen sumber wajib diunggah.\n                            </div>\n                          );'''
new_fallback = '''                          ) : isRecognizedLegacySopNumber(normalized) ? (\n                            <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">\n                              ✓ Terdeteksi sebagai format nomor SPO legacy/eksternal: {normalized}. PDF SPO lama resmi + konfirmasi dokumen sumber wajib diunggah.\n                            </div>\n                          ) : (\n                            <div className="mt-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-800">\n                              Nomor tidak ditemukan di register SIDOKTER dan format legacy belum dikenali secara otomatis. Nomor tetap dapat dipakai sebagai rujukan eksternal dengan PDF SPO lama resmi + konfirmasi dokumen sumber.\n                            </div>\n                          );'''
if old_fallback in s:
    s = s.replace(old_fallback, new_fallback, 1)
elif new_fallback not in s:
    raise RuntimeError('UploadSopModal legacy fallback block not found')
p.write_text(s)

# 3) Edit form: show the same detection for drafts being repaired/edited
p = Path('src/components/EditSopModal.tsx')
s = p.read_text()
s = s.replace(
    "import { findAuthoritativeRiviuPredecessor, getAuthoritativeRiviuRevision } from '../utils/riviuRevision';",
    "import { findAuthoritativeRiviuPredecessor, getAuthoritativeRiviuRevision, isRecognizedLegacySopNumber } from '../utils/riviuRevision';",
    1,
)
needle = "  const requiresExternalReviewPdf = isReview && !matchedReviewSource;\n"
addition = needle + "  const isLegacyReviewNumber = isReview && isRecognizedLegacySopNumber(normalizedOldSopNumber);\n"
if 'const isLegacyReviewNumber' not in s:
    if needle not in s:
        raise RuntimeError('EditSopModal review source marker not found')
    s = s.replace(needle, addition, 1)

input_pattern = re.compile(
    r'(<input\s+type="text"\s+value=\{oldSopNumber\}\s+readOnly=\{sop\.status !== \'DRAFT\' \|\| Boolean\(sop\.oldSopNumber\)\}\s+onChange=\{\(e\) => setOldSopNumber\(e\.target\.value\)\}\s+onBlur=\{\(\) => setOldSopNumber\(normalizeSopNumberInput\(oldSopNumber\)\)\}\s+placeholder="Contoh: PEL / 1\.1\.3 / 015 / 2023"\s+className="[^"]+"\s*/>)',
    re.S,
)
status_ui = r'''\1
                      {normalizedOldSopNumber && (
                        matchedReviewSource ? (
                          <div className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800">
                            ✓ Terdeteksi sebagai SPO SIDOKTER: {matchedReviewSource.sopNumber || matchedReviewSource.legacySopNumber} — status {matchedReviewSource.status}.
                          </div>
                        ) : isLegacyReviewNumber ? (
                          <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
                            ✓ Terdeteksi sebagai format nomor SPO legacy/eksternal: {normalizedOldSopNumber}.
                          </div>
                        ) : (
                          <div className="mt-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-800">
                            Nomor belum ditemukan di register dan format legacy belum dikenali otomatis. Jika ini dokumen lama resmi, lengkapi PDF sumber pada tab Berkas.
                          </div>
                        )
                      )}'''
if 'Terdeteksi sebagai format nomor SPO legacy/eksternal: {normalizedOldSopNumber}' not in s:
    s2, count = input_pattern.subn(status_ui, s, count=1)
    if count != 1:
        raise RuntimeError(f'EditSopModal old number input patch count={count}')
    s = s2
p.write_text(s)

# 4) Regression tests
p = Path('tests/riviu-revision-authority.test.ts')
s = p.read_text()
s = s.replace(
    "import { getAuthoritativeRiviuRevision, findAuthoritativeRiviuPredecessor, hasDurableExternalRiviuSource } from '../src/utils/riviuRevision';",
    "import { getAuthoritativeRiviuRevision, findAuthoritativeRiviuPredecessor, hasDurableExternalRiviuSource, isRecognizedLegacySopNumber } from '../src/utils/riviuRevision';",
    1,
)
if "recognizes historical legacy SPO number formats" not in s:
    s += r'''

test('recognizes historical legacy SPO number formats without treating current SIDOKTER numbers as legacy', () => {
  assert.equal(isRecognizedLegacySopNumber('SOEGIRI-KEP / 001 / 568 / 2024'), true);
  assert.equal(isRecognizedLegacySopNumber('440/102/SPO/PEL/2023'), true);
  assert.equal(isRecognizedLegacySopNumber('PEL / 1.1.3 / 001 / 2026'), false);
});

test('Riviu predecessor lookup detects a registered legacySopNumber and tolerates unicode dash variants', () => {
  const sops = [
    {
      id: 'legacy-existing',
      sopNumber: 'PEN / 2.1.1 / 001 / 2026',
      legacySopNumber: 'SOEGIRI-KEP / 001 / 568 / 2024',
      status: 'AKTIF',
      revisionNumber: '01',
    },
  ] as SopDocument[];

  const found = findAuthoritativeRiviuPredecessor(sops, {
    oldSopNumber: 'SOEGIRI–KEP/001/568/2024',
  });
  assert.equal(found?.id, 'legacy-existing');
});
'''
p.write_text(s)

print('legacy SPO number detection patch applied')
