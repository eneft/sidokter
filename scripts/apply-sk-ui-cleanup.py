from pathlib import Path
import subprocess

p = Path('src/components/LibraryDocumentPage.tsx')
s = p.read_text(encoding='utf-8')
original = s

# 1. Header lebih ringkas: jumlah sudah tersedia pada tab kategori.
s = s.replace('''              <div className="flex items-center gap-2">\n                <h1 className="text-xl sm:text-2xl font-black text-slate-900">\n                  {type === 'SK' ? 'Dokumen Surat Keputusan (SK)' : 'Dokumen Kerja Sama (MOU / PKS)'}\n                </h1>\n                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">\n                  {filtered.length} Dokumen\n                </span>\n              </div>\n              <p className="text-xs text-slate-500 mt-1">\n                {type === 'SK'\n                  ? 'Surat Keputusan Direktur RSUD Dr. Soegiri Lamongan yang sah dan aktif.'\n                  : 'Perjanjian Kerja Sama & Nota Kesepahaman RSUD Dr. Soegiri dengan instansi mitra.'}\n              </p>''', '''              <h1 className="text-xl sm:text-2xl font-black text-slate-900">\n                {type === 'SK' ? 'Surat Keputusan (SK)' : 'Dokumen Kerja Sama (MOU / PKS)'}\n              </h1>\n              <p className="text-xs text-slate-500 mt-1">\n                {type === 'SK'\n                  ? 'Arsip Surat Keputusan Direktur RSUD Dr. Soegiri Lamongan.'\n                  : 'Perjanjian Kerja Sama & Nota Kesepahaman RSUD Dr. Soegiri dengan instansi mitra.'}\n              </p>''')

# 2. Satu tombol upload saja. Pemilihan SK Pokok/Perubahan sudah tersedia di modal.
old_upload = '''          {/* Upload Trigger: Admin & User */}\n          {canUpload ? (\n            <div className="flex flex-wrap items-center gap-2 shrink-0">\n              {type === 'SK' && (\n                <AdminTooltip\n                  title="Upload SK Perubahan"\n                  content="Unggah SK revisi karena perubahan kebijakan, regulasi Kemenkes, atau ketentuan operasional rumah sakit."\n                >\n                  <button\n                    type="button"\n                    onClick={() => openUpload('PERUBAHAN')}\n                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 text-xs font-black shadow-sm shadow-amber-200 transition-all cursor-pointer border border-amber-400"\n                  >\n                    <RefreshCw className="w-4 h-4 text-slate-950" />\n                    <span>Upload SK Perubahan</span>\n                  </button>\n                </AdminTooltip>\n              )}\n\n              <AdminTooltip\n                title={type === 'SK' ? 'Upload SK Pokok' : `Upload ${type} Baru`}\n                content={type === 'SK' ? 'Unggah SK penetapan awal baru ke dalam sistem tata naskah.' : `Unggah berkas ${type} resmi baru.`}\n              >\n                <button\n                  type="button"\n                  onClick={() => openUpload('POKOK')}\n                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold shadow-sm shadow-emerald-200 transition-all cursor-pointer"\n                >\n                  <Plus className="w-4 h-4" />\n                  <span>{type === 'SK' ? 'Upload SK Baru' : `Upload ${type} Baru`}</span>\n                </button>\n              </AdminTooltip>\n            </div>\n          ) : (\n            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium shrink-0">\n              <CheckCircle2 className="w-4 h-4 text-emerald-600" />\n              <span>Akses User: Lihat & Download</span>\n            </div>\n          )}'''
new_upload = '''          {/* Satu entry point upload; tipe SK dipilih di dalam modal agar header tetap ringkas. */}\n          {canUpload && (\n            <AdminTooltip\n              title={type === 'SK' ? 'Upload Surat Keputusan' : `Upload ${type} Baru`}\n              content={type === 'SK' ? 'Unggah SK Pokok atau SK Perubahan.' : `Unggah berkas ${type} resmi baru.`}\n            >\n              <button\n                type="button"\n                onClick={() => openUpload('POKOK')}\n                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-all cursor-pointer shrink-0"\n              >\n                <Plus className="w-4 h-4" />\n                <span>{type === 'SK' ? 'Upload SK' : `Upload ${type} Baru`}</span>\n              </button>\n            </AdminTooltip>\n          )}'''
if old_upload not in s:
    raise RuntimeError('upload header block not found')
s = s.replace(old_upload, new_upload, 1)

# 3. Label kategori dibuat singkat; konteks penetapan/revisi sudah jelas di dokumen.
s = s.replace('<span>Semua SK</span>', '<span>Semua</span>', 1)
s = s.replace('<span>SK Pokok / Penetapan Awal</span>', '<span>SK Pokok</span>', 1)
s = s.replace('<span>SK Perubahan (Revisi Kebijakan)</span>', '<span>SK Perubahan</span>', 1)

# 4. Pencarian lebih singkat dan fokus pada identitas dokumen.
s = s.replace("'Cari judul SK, nomor SK, SK terdahulu, alasan perubahan, atau file...'", "'Cari nomor atau judul SK...'", 1)

# 5. Empty state mengikuti tombol baru.
s = s.replace('''? `Klik tombol "Upload ${type} Baru" di atas untuk menambahkan berkas PDF resmi.`''', '''? `Klik tombol "Upload ${type}" di atas untuk menambahkan berkas PDF resmi.`''')

# 6. SK memakai dua kolom maksimum agar nomor/judul dan relasi perubahan lebih mudah dipindai.
s = s.replace('''        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">''', '''        <div className={`grid grid-cols-1 ${type === 'SK' ? 'xl:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'} gap-4`}>''', 1)

# 7. Bentuk permukaan sedikit lebih tenang.
s = s.replace('''      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs">''', '''      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">''', 1)
s = s.replace('''                className={`bg-white rounded-3xl border p-5 flex flex-col justify-between shadow-2xs hover:shadow-md transition-all group ${''', '''                className={`bg-white rounded-2xl border p-5 flex flex-col justify-between shadow-2xs hover:shadow-sm transition-all group ${''', 1)

# 8. Nama file/ukuran adalah detail teknis; jangan tampilkan di kartu SK utama. Tetap untuk MOU.
old_fileinfo = '''                  {/* File info */}\n                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">\n                    <span className="truncate max-w-[170px]">{doc.fileName}</span>\n                    <span className="font-semibold">{formatBytes(doc.fileSize)}</span>\n                  </div>'''
new_fileinfo = '''                  {/* Detail nama file/ukuran tidak diperlukan pada register SK utama. */}\n                  {type === 'MOU' && (\n                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">\n                      <span className="truncate max-w-[170px]">{doc.fileName}</span>\n                      <span className="font-semibold">{formatBytes(doc.fileSize)}</span>\n                    </div>\n                  )}'''
if old_fileinfo not in s:
    raise RuntimeError('file info block not found')
s = s.replace(old_fileinfo, new_fileinfo, 1)

# 9. revisionType adalah metadata sekunder dan sering bernilai default; alasan perubahan sudah cukup di kartu.
old_revtype = '''                      {doc.revisionType && (\n                        <div className="pt-0.5">\n                          <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300/70">\n                            {doc.revisionType}\n                          </span>\n                        </div>\n                      )}'''
if old_revtype not in s:
    raise RuntimeError('revisionType card block not found')
s = s.replace(old_revtype, '', 1)

p.write_text(s, encoding='utf-8')
print('changed=true' if s != original else 'changed=false')
