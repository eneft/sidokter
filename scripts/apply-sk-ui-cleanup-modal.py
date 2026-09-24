from pathlib import Path
p = Path('src/components/LibraryDocumentPage.tsx')
s = p.read_text(encoding='utf-8')
original = s

banner = '''              {/* Informative alert for SK Perubahan */}\n              {type === 'SK' && uploadMode === 'PERUBAHAN' && (\n                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/90 text-amber-950 text-xs space-y-1">\n                  <div className="flex items-center gap-2 font-black text-amber-900">\n                    <Scale className="w-4 h-4 text-amber-700 shrink-0" />\n                    <span>Dokumen SK Perubahan Kebijakan & Aturan</span>\n                  </div>\n                  <p className="text-[11px] text-amber-800 leading-relaxed">\n                    Gunakan opsi ini jika SK ini merevisi, mengubah klausul, mengganti susunan lampiran, atau menyesuaikan aturan dari SK terdahulu karena kebijakan baru atau regulasi Kemenkes.\n                  </p>\n                </div>\n              )}\n\n'''
if banner not in s:
    raise RuntimeError('informative SK perubahan banner not found')
s = s.replace(banner, '', 1)

chips = '''\n                    {/* Quick suggestion chips */}\n                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">\n                      <span className="text-slate-400 font-semibold mr-0.5">Saran Cepat:</span>\n                      {[\n                        'Penyesuaian Permenkes / Regulasi Baru',\n                        'Perubahan Struktur Organisasi & Tim',\n                        'Evaluasi SOP & Alur Pelayanan Klinis',\n                        'Pembaruan Ketentuan Tarif & Fasilitas',\n                        'Efisiensi & Rekomendasi Akreditasi RS'\n                      ].map((tag) => (\n                        <button\n                          key={tag}\n                          type="button"\n                          onClick={() => {\n                            setRevisionReason((prev) => (prev ? `${prev}; ${tag}` : tag));\n                          }}\n                          className="px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-amber-400 hover:text-amber-900 text-slate-600 transition-colors cursor-pointer"\n                        >\n                          + {tag}\n                        </button>\n                      ))}\n                    </div>'''
if chips not in s:
    raise RuntimeError('quick suggestion chips not found')
s = s.replace(chips, '', 1)

s = s.replace('placeholder="Jelaskan alasan perubahan, contoh: Penyesuaian Permenkes No. 24/2022 tentang Rekam Medis, perubahan alur rujukan, atau penyesuaian susunan tim..."', 'placeholder="Jelaskan dasar atau alasan perubahan SK secara singkat dan spesifik..."', 1)

p.write_text(s, encoding='utf-8')
print('changed=true' if s != original else 'changed=false')
