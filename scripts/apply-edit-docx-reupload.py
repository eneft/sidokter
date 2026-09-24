from pathlib import Path
import subprocess

app = Path('src/components/EditSopModal.tsx')
s = app.read_text(encoding='utf-8')

# 1) React ref support + reuse the canonical DOCX parser used by SPO creation.
s = s.replace("import React, { useState, useEffect } from 'react';", "import React, { useState, useEffect, useRef } from 'react';", 1)
parser_import = "import { parseSopFromDocx } from '../utils/docxParser';"
if parser_import not in s:
    marker = "import { findAuthoritativeRiviuPredecessor, getAuthoritativeRiviuRevision } from '../utils/riviuRevision';\n"
    if marker not in s:
        raise RuntimeError('riviuRevision import marker not found')
    s = s.replace(marker, marker + parser_import + "\n", 1)

# 2) Add edit-time body-only DOCX re-import. Metadata is intentionally not changed.
state_marker = """  const [unitTerkait, setUnitTerkait] = useState(\n    sop.unitTerkait ||\n      (sop.divisionName ? `${sop.divisionName}${sop.categoryName ? `, ${sop.categoryName}` : ''}` : '')\n  );\n\n  // =========================================================\n  // NOMOR SPO & UNIT\n"""
state_block = """  const [unitTerkait, setUnitTerkait] = useState(\n    sop.unitTerkait ||\n      (sop.divisionName ? `${sop.divisionName}${sop.categoryName ? `, ${sop.categoryName}` : ''}` : '')\n  );\n\n  // Upload ulang Word saat Edit Batang Tubuh. File Word hanya dipakai untuk\n  // ekstraksi ulang isi Live SPO; binary DOCX tidak disimpan sebagai dokumen.\n  const [isReimportingBodyDocx, setIsReimportingBodyDocx] = useState(false);\n  const [bodyDocxImportSummary, setBodyDocxImportSummary] = useState<{ fileName: string; fields: string[] } | null>(null);\n  const bodyDocxInputRef = useRef<HTMLInputElement>(null);\n\n  const handleBodyDocxReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {\n    const file = e.target.files?.[0];\n    if (!file) return;\n\n    if (!file.name.toLowerCase().endsWith('.docx')) {\n      setValidationMessage(['Upload Word ulang hanya mendukung format .docx.']);\n      e.target.value = '';\n      return;\n    }\n\n    try {\n      setIsReimportingBodyDocx(true);\n      setValidationMessage([]);\n      const parsed = await parseSopFromDocx(file);\n      const updatedFields: string[] = [];\n\n      // Hanya batang tubuh yang diganti. Judul, tanggal, nomor, hirarki, status,\n      // revisi, dan identitas workflow tetap berasal dari dokumen yang sedang diedit.\n      if (parsed.pengertian) { setPengertian(parsed.pengertian); updatedFields.push('PENGERTIAN'); }\n      if (parsed.tujuan) { setTujuan(parsed.tujuan); updatedFields.push('TUJUAN'); }\n      if (parsed.kebijakan) { setKebijakan(parsed.kebijakan); updatedFields.push('KEBIJAKAN'); }\n      if (parsed.prosedur) { setProsedur(parsed.prosedur); updatedFields.push('PROSEDUR'); }\n      if (parsed.alur) { setAlur(parsed.alur); updatedFields.push('ALUR'); }\n      if (parsed.unitTerkait) { setUnitTerkait(parsed.unitTerkait); updatedFields.push('UNIT TERKAIT'); }\n\n      if (updatedFields.length === 0) {\n        throw new Error('Batang tubuh SPO tidak terdeteksi pada file Word tersebut. Pastikan dokumen memiliki bagian Pengertian, Tujuan, Kebijakan, Prosedur, Alur, atau Unit Terkait.');\n      }\n\n      setBodyDocxImportSummary({ fileName: file.name, fields: updatedFields });\n    } catch (error) {\n      console.error('Error re-importing DOCX body:', error);\n      setValidationMessage([error instanceof Error ? error.message : 'Gagal membaca ulang batang tubuh dari file Word.']);\n    } finally {\n      setIsReimportingBodyDocx(false);\n      if (e.target) e.target.value = '';\n    }\n  };\n\n  // =========================================================\n  // NOMOR SPO & UNIT\n"""
if 'handleBodyDocxReupload' not in s:
    if state_marker not in s:
        raise RuntimeError('body state marker not found')
    s = s.replace(state_marker, state_block, 1)

# 3) Reset per-document import UI state.
reset_marker = """    setValidationMessage([]);\n\n    // Reset upload states\n"""
reset_block = """    setValidationMessage([]);\n    setIsReimportingBodyDocx(false);\n    setBodyDocxImportSummary(null);\n\n    // Reset upload states\n"""
if reset_block not in s:
    if reset_marker not in s:
        raise RuntimeError('reset marker not found')
    s = s.replace(reset_marker, reset_block, 1)

# 4) Add the Upload Word Ulang control at the top of Edit Batang Tubuh.
ui_marker = """          {activeTab === 'konten' && !isExisting && (\n            <div className=\"space-y-3\">\n              <div className=\"bg-teal-50/80 border border-teal-200/90 rounded-xl p-3 text-xs text-teal-950 flex items-center gap-2\">\n"""
ui_block = """          {activeTab === 'konten' && !isExisting && (\n            <div className=\"space-y-3\">\n              <div className=\"bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-2xs\">\n                <div className=\"flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3\">\n                  <div className=\"min-w-0\">\n                    <div className=\"flex items-center gap-2 text-xs font-extrabold text-slate-900\">\n                      <FileUp className=\"w-4 h-4 text-teal-700\" />\n                      <span>Perbarui Batang Tubuh dari Word</span>\n                    </div>\n                    <p className=\"mt-1 text-[11px] leading-relaxed text-slate-500\">\n                      Upload ulang DOCX untuk mendeteksi kembali isi batang tubuh. Hanya bagian yang terdeteksi yang diganti; nomor SPO, hirarki, status, judul, tanggal, dan metadata lainnya tetap.\n                    </p>\n                  </div>\n\n                  <input\n                    ref={bodyDocxInputRef}\n                    type=\"file\"\n                    accept=\".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document\"\n                    onChange={handleBodyDocxReupload}\n                    className=\"hidden\"\n                  />\n                  <button\n                    type=\"button\"\n                    onClick={() => bodyDocxInputRef.current?.click()}\n                    disabled={isReimportingBodyDocx}\n                    className=\"inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-teal-200 bg-teal-50 text-teal-800 text-xs font-bold hover:bg-teal-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shrink-0\"\n                  >\n                    {isReimportingBodyDocx ? <Loader2 className=\"w-4 h-4 animate-spin\" /> : <Upload className=\"w-4 h-4\" />}\n                    {isReimportingBodyDocx ? 'Mendeteksi...' : 'Upload Word Ulang'}\n                  </button>\n                </div>\n\n                {bodyDocxImportSummary && (\n                  <div className=\"mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900\">\n                    <div className=\"flex items-center gap-1.5 font-bold\">\n                      <CheckCircle2 className=\"w-3.5 h-3.5\" />\n                      <span>{bodyDocxImportSummary.fileName}</span>\n                    </div>\n                    <div className=\"mt-1 text-emerald-800\">\n                      Bagian diperbarui: {bodyDocxImportSummary.fields.join(', ')}. Bagian yang tidak terdeteksi tetap menggunakan isi sebelumnya.\n                    </div>\n                  </div>\n                )}\n              </div>\n\n              <div className=\"bg-teal-50/80 border border-teal-200/90 rounded-xl p-3 text-xs text-teal-950 flex items-center gap-2\">\n"""
if 'Perbarui Batang Tubuh dari Word' not in s:
    if ui_marker not in s:
        raise RuntimeError('konten UI marker not found')
    s = s.replace(ui_marker, ui_block, 1)

app.write_text(s, encoding='utf-8')

# 5) Permanent regression coverage in the existing CI suite.
test_file = Path('tests/sop-mutation-regression.test.cjs')
t = test_file.read_text(encoding='utf-8')
if "const editSopModalSource = fs.readFileSync('src/components/EditSopModal.tsx', 'utf8');" not in t:
    marker = "const sopServiceSource = fs.readFileSync('src/lib/sopService.ts', 'utf8');\n"
    if marker not in t:
        raise RuntimeError('test declaration marker not found')
    t = t.replace(marker, marker + "const editSopModalSource = fs.readFileSync('src/components/EditSopModal.tsx', 'utf8');\n", 1)

if "edit body supports safe DOCX re-import" not in t:
    t += """\n\ntest('edit body supports safe DOCX re-import without replacing document metadata', () => {\n  assert.match(editSopModalSource, /parseSopFromDocx/);\n  assert.match(editSopModalSource, /handleBodyDocxReupload/);\n  assert.match(editSopModalSource, /Upload Word Ulang/);\n  assert.match(editSopModalSource, /if \(parsed\.pengertian\).*setPengertian/);\n  assert.match(editSopModalSource, /if \(parsed\.prosedur\).*setProsedur/);\n  assert.match(editSopModalSource, /if \(parsed\.unitTerkait\).*setUnitTerkait/);\n  const start = editSopModalSource.indexOf('const handleBodyDocxReupload');\n  const end = editSopModalSource.indexOf('// =========================================================\\n  // NOMOR SPO & UNIT', start);\n  const block = editSopModalSource.slice(start, end);\n  assert.doesNotMatch(block, /setSopNumber\(/);\n  assert.doesNotMatch(block, /setDivisionCode\(/);\n  assert.doesNotMatch(block, /setEffectiveDate\(/);\n  assert.doesNotMatch(block, /setTitle\(/);\n});\n"""

test_file.write_text(t, encoding='utf-8')

changed = subprocess.run(['git', 'diff', '--quiet']).returncode != 0
print('changed=true' if changed else 'changed=false')
