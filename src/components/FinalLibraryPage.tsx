import React, { useMemo, useState } from 'react';
import { 
  BookOpen, 
  Download, 
  Eye, 
  FileText, 
  FileCheck, 
  Handshake, 
  Search, 
  X, 
  Calendar, 
  Building2, 
  CheckCircle2,
  FileDown,
  ExternalLink,
  Layers,
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { DocumentViewer } from './DocumentViewer';
import { LibraryDocument, SopDocument, UserSession } from '../types';
import { formatBytes } from '../utils/numbering';
import { getLibraryDocumentUrl } from '../lib/documentLibraryService';
import { authenticatedFetch } from '../lib/authService';

interface FinalLibraryPageProps {
  sops: SopDocument[];
  documents: LibraryDocument[];
  userSession: UserSession;
  onViewSop?: (sop: SopDocument) => void;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

type FinalDocTypeFilter = 'ALL' | 'SPO' | 'SK' | 'MOU';

export const FinalLibraryPage: React.FC<FinalLibraryPageProps> = ({ 
  sops, 
  documents, 
  userSession, 
  onViewSop,
  onShowToast
}) => {
  const isAdmin = userSession.role === 'admin';
  const hasStructuralBadge = Array.isArray(userSession.badges) && userSession.badges.some((b) => String(b).toUpperCase() === 'STRUKTURAL');
  const canAccessProtectedDocs = isAdmin || hasStructuralBadge;
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FinalDocTypeFilter>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [viewer, setViewer] = useState<{
    id: string;
    type: 'SPO' | 'SK' | 'MOU';
    title: string;
    documentNumber?: string;
    fileName: string;
    url?: string;
    sopData?: SopDocument;
  } | null>(null);

  // 1. Final Active SOPs (hanya status AKTIF)
  const activeSops = useMemo(() => {
    return sops.filter((s) => s.status === 'AKTIF');
  }, [sops]);

  // 2. Final SK and MOU Documents
  const skDocs = useMemo(() => documents.filter((d) => d.type === 'SK'), [documents]);
  const mouDocs = useMemo(() => documents.filter((d) => d.type === 'MOU'), [documents]);

  // Combined available years for filtering
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    activeSops.forEach((s) => {
      const d = s.effectiveDate || s.createdAt;
      if (d) {
        const y = new Date(d).getFullYear();
        if (!isNaN(y)) years.add(y.toString());
      }
    });
    documents.forEach((d) => {
      const dt = d.effectiveDate || d.createdAt;
      if (dt) {
        const y = new Date(dt).getFullYear();
        if (!isNaN(y)) years.add(y.toString());
      }
    });
    return Array.from(years).sort().reverse();
  }, [activeSops, documents]);

  // Filtered lists based on search & year
  const q = search.trim().toLowerCase();

  const filteredSops = useMemo(() => {
    if (filterType !== 'ALL' && filterType !== 'SPO') return [];
    return activeSops.filter((s) => {
      if (selectedYear !== 'ALL') {
        const d = s.effectiveDate || s.createdAt;
        if (d && new Date(d).getFullYear().toString() !== selectedYear) return false;
      }
      if (!q) return true;
      return (
        (s.title || '').toLowerCase().includes(q) ||
        (s.sopNumber || '').toLowerCase().includes(q) ||
        (s.divisionName || '').toLowerCase().includes(q) ||
        (s.categoryName || '').toLowerCase().includes(q)
      );
    });
  }, [activeSops, filterType, selectedYear, q]);

  const filteredLibraryDocs = useMemo(() => {
    return documents.filter((d) => {
      if (!canAccessProtectedDocs && (d.type === 'SK' || d.type === 'MOU')) return false;
      if (filterType !== 'ALL' && d.type !== filterType) return false;
      if (selectedYear !== 'ALL') {
        const dt = d.effectiveDate || d.createdAt;
        if (dt && new Date(dt).getFullYear().toString() !== selectedYear) return false;
      }
      if (!q) return true;
      return (
        (d.title || '').toLowerCase().includes(q) ||
        (d.documentNumber || '').toLowerCase().includes(q) ||
        (d.partnerName || '').toLowerCase().includes(q) ||
        (d.fileName || '').toLowerCase().includes(q)
      );
    });
  }, [documents, filterType, selectedYear, q, canAccessProtectedDocs]);

  const totalCount = (filterType === 'ALL' || filterType === 'SPO' ? filteredSops.length : 0) + filteredLibraryDocs.length;
  const grandTotalFinalDocs = activeSops.length + documents.length;

  const handleOpenDocViewer = async (item: {
    id: string; type: 'SPO' | 'SK' | 'MOU'; title: string; documentNumber?: string; fileName: string; url?: string; sopData?: SopDocument;
  }) => {
    if (item.type === 'SPO' && item.sopData && onViewSop) { onViewSop(item.sopData); return; }
    const libraryDoc = documents.find((d) => d.id === item.id);
    const url = libraryDoc ? await getLibraryDocumentUrl(libraryDoc) : item.url;
    if (url) setViewer({ ...item, url });
  };

  const handleDownloadLibraryDoc = async (doc: LibraryDocument) => {
    const url = await getLibraryDocumentUrl(doc);
    if (!url) return;
    if (url.startsWith('/api/storage/')) {
      const response = await authenticatedFetch(url);
      if (!response.ok) throw new Error(`Gagal mengunduh file (HTTP ${response.status}).`);
      const blobUrl = URL.createObjectURL(await response.blob());
      const a = document.createElement('a'); a.href = blobUrl; a.download = doc.fileName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      return;
    }
    const a = document.createElement('a'); a.href = url; a.download = doc.fileName; a.click();
  };

  return (
    <section className="space-y-5 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                  Library Dokumen Final
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-200">
                  {grandTotalFinalDocs} Dokumen Sah
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Repository arsip resmi seluruh dokumen regulasi (SPO Aktif, SK Direktur, MOU) yang telah disahkan dan berlaku di RSUD Dr. Soegiri.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Hanya Dokumen Final & Sah</span>
            </div>
          </div>
        </div>

        {!canAccessProtectedDocs && (
          <div className="mt-4 flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Anda tidak punya akses ke dokumen SK dan MOU. Akses tersebut memerlukan badge STRUKTURAL.</span>
          </div>
        )}

        {/* Filter Bar & Search */}
        <div className="mt-5 space-y-3">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari semua dokumen final berdasarkan judul, nomor SK/MOU/SPO, atau unit..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Type Filter Buttons */}
            <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              {(canAccessProtectedDocs
                ? [
                    { id: 'ALL' as const, label: 'Semua Dokumen', count: grandTotalFinalDocs },
                    { id: 'SPO' as const, label: 'SPO Final', count: activeSops.length },
                    { id: 'SK' as const, label: 'SK Direktur', count: skDocs.length },
                    { id: 'MOU' as const, label: 'MOU / PKS', count: mouDocs.length },
                  ]
                : [
                    { id: 'ALL' as const, label: 'Dokumen SPO', count: activeSops.length },
                    { id: 'SPO' as const, label: 'SPO Final', count: activeSops.length },
                  ]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                    filterType === tab.id
                      ? 'bg-emerald-600 text-white shadow-xs font-black'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-extrabold ${
                    filterType === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Year Filter */}
          {availableYears.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
              <span className="text-[11px] font-bold text-slate-500 shrink-0">Tahun Terbit:</span>
              <button
                type="button"
                onClick={() => setSelectedYear('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  selectedYear === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua
              </button>
              {availableYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setSelectedYear(y)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    selectedYear === y
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Results */}
      {totalCount === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-800">
            Tidak ada dokumen final yang ditemukan
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search
              ? 'Silakan gunakan kata kunci pencarian yang lain atau sesuaikan filter kategori dan tahun.'
              : 'Belum ada dokumen final yang berstatus aktif di dalam library sistem.'}
          </p>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSelectedYear('ALL'); }}
              className="mt-4 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
            >
              Reset Pencarian
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. SECTION SPO FINAL */}
          {filteredSops.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-900">
                      Standar Prosedur Operasional (SPO Final & Disahkan)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Dokumen SPO yang telah bertanda tangan Direktur dan berstatus AKTIF
                    </p>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  {filteredSops.length} SPO
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredSops.map((sop) => {
                  const hasAttachment = Boolean(
                    sop.fileDataUrl || sop.signedScanDataUrl || sop.fileName
                  );
                  return (
                    <div
                      key={sop.id}
                      className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="font-mono text-[11px] font-black text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                            {sop.sopNumber || 'Tanpa Nomor'}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                            {sop.divisionName}
                          </span>
                          {sop.effectiveDate && (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(sop.effectiveDate).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm font-bold text-slate-900 leading-snug">
                          {sop.title}
                        </h3>

                        {sop.hierarchyDescription && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                            {sop.hierarchyDescription}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenDocViewer({
                            id: sop.id,
                            type: 'SPO',
                            title: sop.title,
                            documentNumber: sop.sopNumber,
                            fileName: sop.fileName || `${sop.sopNumber}.pdf`,
                            sopData: sop,
                          })}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Buka SPO</span>
                        </button>

                        {(sop.signedScanDataUrl || sop.fileDataUrl) && (
                          <a
                            href={sop.signedScanDataUrl || sop.fileDataUrl}
                            download={sop.signedScanFileName || sop.fileName || `${sop.sopNumber}.pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                            title="Download Berkas SPO"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download PDF</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. SECTION SK & MOU FINAL */}
          {filteredLibraryDocs.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-600" />
                  <span>Dokumen SK & MOU Resmi</span>
                </h2>
                <span className="text-xs font-bold text-slate-500">
                  {filteredLibraryDocs.length} Berkas PDF
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLibraryDocs.map((doc) => {
                  const formattedDate = doc.effectiveDate
                    ? new Date(doc.effectiveDate).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : new Date(doc.createdAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      });

                  return (
                    <div
                      key={doc.id}
                      className="bg-white rounded-3xl border border-slate-200 p-5 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-emerald-200 transition-all group"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                              doc.type === 'SK'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {doc.type}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {formattedDate}
                          </span>
                        </div>

                        {doc.documentNumber && (
                          <div className="mt-2.5 font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50/60 px-2 py-0.5 rounded border border-emerald-100 inline-block max-w-full truncate">
                            {doc.documentNumber}
                          </div>
                        )}

                        {doc.partnerName && (
                          <div className="mt-2 flex items-center gap-1 text-xs font-bold text-slate-700">
                            <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">{doc.partnerName}</span>
                          </div>
                        )}

                        <h3 className="mt-2 text-sm font-black text-slate-900 leading-snug line-clamp-2 group-hover:text-emerald-800 transition-colors">
                          {doc.title}
                        </h3>

                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                          <span className="truncate max-w-[170px]">{doc.fileName}</span>
                          <span className="font-semibold">{formatBytes(doc.fileSize)}</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenDocViewer({
                            id: doc.id,
                            type: doc.type,
                            title: doc.title,
                            documentNumber: doc.documentNumber,
                            fileName: doc.fileName,
                            url: doc.downloadUrl,
                          })}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Lihat PDF</span>
                        </button>

                        <a
                          href={doc.downloadUrl}
                          onClick={async (e) => { e.preventDefault(); await handleDownloadLibraryDoc(doc); }}
                          download={doc.fileName}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Viewer Modal */}
      {viewer && viewer.url && (
        <div className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
          <div className="w-full h-full max-w-6xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-slate-200">
            <div className="h-16 shrink-0 px-5 sm:px-6 border-b border-slate-200 flex items-center justify-between gap-3 bg-white">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-800">
                    {viewer.type}
                  </span>
                  {viewer.documentNumber && (
                    <span className="text-xs font-mono font-bold text-slate-600 truncate">
                      {viewer.documentNumber}
                    </span>
                  )}
                </div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 truncate mt-0.5">
                  {viewer.title}
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={viewer.url}
                  download={viewer.fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  <span className="hidden sm:inline">Download PDF</span>
                </a>

                <button
                  type="button"
                  onClick={() => setViewer(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 bg-slate-100">
              <DocumentViewer
                fileUrl={viewer.url}
                fileName={viewer.fileName}
                heightClass="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
