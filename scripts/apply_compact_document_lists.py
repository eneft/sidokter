from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a = text.find(start)
    if a < 0:
        raise RuntimeError(f'{label}: start marker not found')
    b = text.find(end, a)
    if b < 0:
        raise RuntimeError(f'{label}: end marker not found')
    return text[:a] + replacement + text[b:]


def patch_library_document_page() -> None:
    path = ROOT / 'src/components/LibraryDocumentPage.tsx'
    text = path.read_text()

    header_start = '  return (\n    <section className="space-y-5 animate-in fade-in duration-200">\n      {/* Top Banner / Header */}'
    header_end = '      {/* Documents Grid */}'
    header = '''  return (
    <section className="space-y-3 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors shrink-0"
                title="Kembali"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-black text-slate-900">
                  {type === 'SK' ? 'Surat Keputusan (SK)' : 'MOU / PKS'}
                </h1>
                <span className="text-[11px] font-bold text-slate-500">{filtered.length} dokumen</span>
              </div>
            </div>
          </div>

          {canUpload && (
            <button
              type="button"
              onClick={() => openUpload('POKOK')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{type === 'SK' ? 'Upload SK' : 'Upload MOU / PKS'}</span>
            </button>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={type === 'SK' ? 'Cari nomor atau judul SK...' : 'Cari nomor, judul, atau mitra...'}
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {type === 'SK' && (
            <div className="flex items-center gap-1 overflow-x-auto">
              {([
                { id: 'ALL' as const, label: 'Semua', count: skCounts.total },
                { id: 'POKOK' as const, label: 'SK Pokok', count: skCounts.pokok },
                { id: 'PERUBAHAN' as const, label: 'SK Perubahan', count: skCounts.perubahan },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSkCategoryFilter(tab.id)}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                    skCategoryFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label} <span className="opacity-70">{tab.count}</span>
                </button>
              ))}
            </div>
          )}

          {availableYears.length > 0 && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full lg:w-auto px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Semua Tahun</option>
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          )}
        </div>
      </div>

'''
    text = replace_between(text, header_start, header_end, header, 'LibraryDocumentPage header')

    list_start = '      {/* Documents Grid */}'
    list_end = '      {/* Upload Modal (Admin & User) */}'
    list_block = '''      {/* Compact document register */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">
            {search ? 'Tidak ada dokumen yang sesuai pencarian' : `Belum ada dokumen ${type}`}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {search ? 'Coba kata kunci lain atau ubah filter.' : 'Belum ada dokumen yang terdaftar.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(190px,1.15fr)_minmax(280px,2fr)_minmax(130px,0.8fr)_110px_152px] items-center gap-3 bg-slate-50 border-b border-slate-200 px-4 py-2.5 text-[10px] uppercase tracking-wider font-black text-slate-500">
            <div>Nomor</div>
            <div>{type === 'SK' ? 'Judul SK' : 'Judul / Mitra'}</div>
            <div>{type === 'SK' ? 'Kategori' : 'Masa Berlaku'}</div>
            <div>Tanggal</div>
            <div className="text-right">Aksi</div>
          </div>

          <div className="divide-y divide-slate-100">
            {filtered.map((doc) => {
              const formattedDate = new Date(doc.effectiveDate || doc.createdAt).toLocaleDateString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric'
              });
              const expiryLabel = doc.expiryDate
                ? new Date(doc.expiryDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
              const isPerubahan = type === 'SK' && (doc.isRevisionSK || doc.skCategory === 'PERUBAHAN');
              const revisionsForDoc = getRevisionsForDoc(doc);
              const originalDoc = isPerubahan ? getOriginalDoc(doc) : undefined;

              return (
                <div key={doc.id} className="px-3.5 sm:px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(190px,1.15fr)_minmax(280px,2fr)_minmax(130px,0.8fr)_110px_152px] items-center gap-2 md:gap-3">
                    <div className="min-w-0 flex items-center justify-between gap-2 md:block">
                      <span className="font-mono text-xs font-black text-slate-700 break-all md:break-normal md:whitespace-normal">
                        {doc.documentNumber || '—'}
                      </span>
                      <span className={`md:hidden shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        isPerubahan ? 'bg-amber-50 text-amber-800 border border-amber-200' : type === 'SK' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {isPerubahan ? 'Perubahan' : type === 'SK' ? 'SK Pokok' : 'MOU'}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => resolveAndSetViewer(doc)}
                        className="block text-left text-[13px] font-semibold text-slate-900 hover:text-emerald-700 hover:underline underline-offset-2 leading-snug"
                      >
                        {doc.title}
                      </button>
                      {type === 'MOU' && doc.partnerName && (
                        <div className="mt-0.5 text-[11px] text-slate-500 truncate">{doc.partnerName}</div>
                      )}
                      {isPerubahan && (
                        <div className="mt-0.5 text-[10px] text-amber-800 flex flex-wrap items-center gap-1">
                          <span>Merevisi:</span>
                          {originalDoc ? (
                            <button type="button" onClick={() => resolveAndSetViewer(originalDoc)} className="font-bold hover:underline">
                              {doc.originalSkNumber || doc.originalSkTitle || 'SK terdahulu'}
                            </button>
                          ) : (
                            <span className="font-bold">{doc.originalSkNumber || doc.originalSkTitle || 'SK terdahulu'}</span>
                          )}
                        </div>
                      )}
                      {!isPerubahan && revisionsForDoc.length > 0 && (
                        <div className="mt-0.5 text-[10px] text-amber-700 flex flex-wrap items-center gap-1">
                          <span>Perubahan:</span>
                          {revisionsForDoc.map((rev, index) => (
                            <React.Fragment key={rev.id}>
                              {index > 0 && <span>·</span>}
                              <button type="button" onClick={() => resolveAndSetViewer(rev)} className="font-bold hover:underline">
                                {rev.documentNumber || rev.title}
                              </button>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                      <div className="md:hidden mt-1 text-[10px] text-slate-400 flex items-center gap-2">
                        <span>{formattedDate}</span>
                        {type === 'MOU' && doc.expiryDate && <span>• s.d. {expiryLabel}</span>}
                      </div>
                    </div>

                    <div className="hidden md:flex items-center">
                      {type === 'SK' ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isPerubahan
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {isPerubahan ? 'SK Perubahan' : 'SK Pokok'}
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-600">{expiryLabel}</span>
                      )}
                    </div>

                    <div className="hidden md:block text-[11px] text-slate-500">{formattedDate}</div>

                    <div className="flex items-center gap-1 md:justify-end">
                      <button type="button" onClick={() => resolveAndSetViewer(doc)} className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50" title="Lihat PDF">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => downloadLibraryDoc(doc)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Download PDF">
                        <Download className="w-4 h-4" />
                      </button>
                      {isAdmin && (
                        <>
                          <button type="button" onClick={() => handleOpenEdit(doc)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Edit dokumen">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => setDeleteConfirmDoc(doc)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50" title="Hapus dokumen">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

'''
    text = replace_between(text, list_start, list_end, list_block, 'LibraryDocumentPage list')
    path.write_text(text)


def patch_user_library_tab() -> None:
    path = ROOT / 'src/components/UserLibraryTab.tsx'
    text = path.read_text()
    start = '  return (\n    <div className="space-y-6 animate-fade-in">'
    end = '  );\n};'
    body = '''  return (
    <div className="space-y-3 animate-fade-in">
      <div className="bg-white rounded-xl p-3 border border-slate-200 flex flex-col lg:flex-row lg:items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari judul atau nomor SPO..."
            className="w-full text-xs pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          disabled={isRestricted && assignedDivCodes.length <= 1}
          className={`w-full lg:w-auto lg:min-w-[210px] text-xs border rounded-lg px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
            isRestricted && assignedDivCodes.length <= 1
              ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
              : 'bg-white border-slate-200 text-slate-700'
          }`}
        >
          <option value="ALL">Semua Kewenangan ({assignmentSummary.length || assignedDivCodes.length})</option>
          {assignedDivCodes.map((code) => {
            const cat = SOEGIRI_MASTER_CATEGORIES.find((c) => c.code === code);
            return <option key={code} value={code}>[{code}] {cat?.name || code}</option>;
          })}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="w-full lg:w-auto text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="ALL">Semua Status</option>
          <option value="DRAFT">Draft</option>
          <option value="AKTIF">Aktif</option>
          {userSession.role === 'admin' && <option value="DIARSIPKAN">Diarsipkan</option>}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-slate-500">
        <span><strong className="text-slate-700">{filteredSops.length} SPO</strong> ditampilkan</span>
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} className="text-emerald-700 font-semibold hover:underline">Reset pencarian</button>
        )}
      </div>

      {filteredSops.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
          <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2">
            {isRestricted ? <Lock className="w-5 h-5 text-amber-500" /> : <FileText className="w-5 h-5" />}
          </div>
          <h3 className="text-sm font-bold text-slate-800">Tidak ada dokumen SPO</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {searchQuery ? `Tidak ditemukan naskah dengan kata kunci "${searchQuery}".` : 'Belum ada naskah SPO yang dapat ditampilkan.'}
          </p>
          {!searchQuery && (
            <button type="button" onClick={onSwitchToInputTab} className="mt-3 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1.5">
              <PlusCircle className="w-3.5 h-3.5" /> Input SPO Baru
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(185px,1fr)_minmax(280px,2fr)_minmax(125px,0.8fr)_70px] bg-slate-50 border-b border-slate-200 px-4 py-2.5 text-[10px] uppercase tracking-wider font-black text-slate-500">
            <div>Nomor SPO</div>
            <div>Judul SPO</div>
            <div>Status</div>
            <div className="text-right">Aksi</div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredSops.map((sop) => {
              const isReview = sop.documentType === 'REVIEW' || sop.jenis_spo === 'RIVIU';
              const isExisting = sop.documentType === 'LAMA' || sop.jenis_spo === 'EXISTING';
              return (
                <div key={sop.id} className="px-3.5 sm:px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(185px,1fr)_minmax(280px,2fr)_minmax(125px,0.8fr)_70px] items-center gap-2 md:gap-3">
                    <div className="min-w-0 flex items-center justify-between gap-2 md:block">
                      <span className="font-mono text-xs font-black text-emerald-800 break-words md:whitespace-normal">{sop.sopNumber || '—'}</span>
                      <span className={`md:hidden px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                        sop.status === 'AKTIF' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : sop.status === 'DRAFT' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {sop.status === 'DIARSIPKAN' ? 'Diarsipkan' : sop.status}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <button type="button" onClick={() => onViewDetail(sop)} className="block max-w-full text-left font-semibold text-[13px] text-slate-900 hover:text-emerald-700 hover:underline underline-offset-2 leading-snug">
                        {sop.title || 'Tanpa Judul SPO'}
                      </button>
                      <div className="mt-0.5 text-[10px] text-slate-400 md:hidden">
                        {[isReview ? 'Riviu' : null, isExisting ? 'Existing' : null].filter(Boolean).join(' · ')}
                      </div>
                    </div>

                    <div className="hidden md:flex flex-wrap items-center gap-1">
                      {isReview && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-violet-50 text-violet-700 border border-violet-200">Riviu</span>}
                      {isExisting && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-sky-50 text-sky-700 border border-sky-200">Existing</span>}
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                        sop.status === 'AKTIF' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : sop.status === 'DRAFT' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {sop.status === 'DIARSIPKAN' ? 'Diarsipkan' : sop.status}
                      </span>
                    </div>

                    <div className="flex md:justify-end">
                      <button type="button" onClick={() => onViewDetail(sop)} className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50" title="Buka SPO">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
'''
    text = replace_between(text, start, end, body, 'UserLibraryTab return')
    path.write_text(text)


def patch_final_library_page() -> None:
    path = ROOT / 'src/components/FinalLibraryPage.tsx'
    text = path.read_text()

    old_counts = "  const totalCount = (filterType === 'ALL' || filterType === 'SPO' ? filteredSops.length : 0) + filteredLibraryDocs.length;\n  const grandTotalFinalDocs = activeSops.length + documents.length;\n"
    new_counts = '''  const combinedRows = useMemo(() => {
    const sopRows = filteredSops.map((sop) => ({
      id: sop.id,
      type: 'SPO' as const,
      number: sop.sopNumber || '',
      title: sop.title || 'Tanpa Judul SPO',
      meta: sop.divisionName || sop.hierarchyDescription || '',
      date: sop.effectiveDate || sop.createdAt || '',
      fileName: sop.fileName || `${sop.sopNumber || 'SPO'}.pdf`,
      sopData: sop,
      libraryDoc: undefined as LibraryDocument | undefined,
    }));
    const libraryRows = filteredLibraryDocs.map((doc) => ({
      id: doc.id,
      type: doc.type,
      number: doc.documentNumber || '',
      title: doc.title || 'Tanpa Judul',
      meta: doc.type === 'MOU' ? (doc.partnerName || '') : ((doc.isRevisionSK || doc.skCategory === 'PERUBAHAN') ? 'SK Perubahan' : 'SK Pokok'),
      date: doc.effectiveDate || doc.createdAt || '',
      fileName: doc.fileName,
      sopData: undefined as SopDocument | undefined,
      libraryDoc: doc,
    }));
    return [...sopRows, ...libraryRows].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [filteredSops, filteredLibraryDocs]);

  const totalCount = combinedRows.length;
  const grandTotalFinalDocs = activeSops.length + (canAccessProtectedDocs ? skDocs.length + mouDocs.length : 0);
'''
    if old_counts not in text:
        raise RuntimeError('FinalLibraryPage counts marker not found')
    text = text.replace(old_counts, new_counts, 1)

    start = '  return (\n    <section className="space-y-5 animate-in fade-in duration-200">\n      {/* Header Banner */}'
    end = '      {/* Viewer Modal */}'
    body = '''  return (
    <section className="space-y-3 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black text-slate-900">Arsip Digital</h1>
              <span className="text-[11px] font-bold text-slate-500">{grandTotalFinalDocs} dokumen</span>
            </div>
          </div>
        </div>

        {!canAccessProtectedDocs && (
          <div className="mt-2.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>SK dan MOU memerlukan badge STRUKTURAL.</span>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor, judul, unit, atau mitra..."
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            {(canAccessProtectedDocs
              ? [
                  { id: 'ALL' as const, label: 'Semua', count: grandTotalFinalDocs },
                  { id: 'SPO' as const, label: 'SPO', count: activeSops.length },
                  { id: 'SK' as const, label: 'SK', count: skDocs.length },
                  { id: 'MOU' as const, label: 'MOU', count: mouDocs.length },
                ]
              : [
                  { id: 'ALL' as const, label: 'Semua', count: activeSops.length },
                  { id: 'SPO' as const, label: 'SPO', count: activeSops.length },
                ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${filterType === tab.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {tab.label} <span className="opacity-70">{tab.count}</span>
              </button>
            ))}
          </div>

          {availableYears.length > 0 && (
            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full xl:w-auto px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="ALL">Semua Tahun</option>
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          )}
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <BookOpen className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">Tidak ada dokumen yang ditemukan</h3>
          <p className="text-xs text-slate-500 mt-1">Coba kata kunci atau filter yang lain.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[92px_minmax(180px,1.15fr)_minmax(280px,2fr)_minmax(150px,1fr)_110px_92px] items-center gap-3 bg-slate-50 border-b border-slate-200 px-4 py-2.5 text-[10px] uppercase tracking-wider font-black text-slate-500">
            <div>Jenis</div>
            <div>Nomor</div>
            <div>Judul</div>
            <div>Unit / Mitra</div>
            <div>Tanggal</div>
            <div className="text-right">Aksi</div>
          </div>

          <div className="divide-y divide-slate-100">
            {combinedRows.map((row) => {
              const formattedDate = row.date
                ? new Date(row.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
              const openRow = () => handleOpenDocViewer({
                id: row.id,
                type: row.type,
                title: row.title,
                documentNumber: row.number,
                fileName: row.fileName,
                url: row.libraryDoc?.downloadUrl,
                storagePath: row.libraryDoc?.storagePath,
                sopData: row.sopData,
              });

              return (
                <div key={`${row.type}-${row.id}`} className="px-3.5 sm:px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                  <div className="grid grid-cols-1 md:grid-cols-[92px_minmax(180px,1.15fr)_minmax(280px,2fr)_minmax(150px,1fr)_110px_92px] items-center gap-2 md:gap-3">
                    <div className="flex items-center justify-between gap-2 md:block">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                        row.type === 'SPO' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : row.type === 'SK' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-violet-50 text-violet-700 border-violet-200'
                      }`}>
                        {row.type}
                      </span>
                      <span className="md:hidden text-[10px] text-slate-400">{formattedDate}</span>
                    </div>

                    <div className="font-mono text-xs font-black text-slate-700 break-all md:break-normal md:whitespace-normal">{row.number || '—'}</div>

                    <div className="min-w-0">
                      <button type="button" onClick={openRow} className="block text-left text-[13px] font-semibold text-slate-900 hover:text-emerald-700 hover:underline underline-offset-2 leading-snug">
                        {row.title}
                      </button>
                      {row.meta && <div className="md:hidden mt-0.5 text-[10px] text-slate-500 truncate">{row.meta}</div>}
                    </div>

                    <div className="hidden md:block text-[11px] text-slate-500 truncate">{row.meta || '—'}</div>
                    <div className="hidden md:block text-[11px] text-slate-500">{formattedDate}</div>

                    <div className="flex items-center gap-1 md:justify-end">
                      <button type="button" onClick={openRow} className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50" title="Buka dokumen">
                        <Eye className="w-4 h-4" />
                      </button>
                      {row.libraryDoc && (
                        <button type="button" onClick={() => handleDownloadLibraryDoc(row.libraryDoc!)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Download PDF">
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

'''
    text = replace_between(text, start, end, body, 'FinalLibraryPage return')
    path.write_text(text)


patch_library_document_page()
patch_user_library_tab()
patch_final_library_page()
print('Compact document list UI patch applied.')
