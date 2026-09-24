import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Download,
  Eye,
  Search,
  ShieldAlert,
  X
} from 'lucide-react';
import { DocumentViewer } from './DocumentViewer';
import { LibraryDocument, SopDocument, UserSession } from '../types';
import { getLibraryDocumentUrl } from '../lib/documentLibraryService';
import { isSopAccessibleByUser } from '../utils/soegiriStructure';
import { triggerFileDownload } from '../utils/fileStorage';

interface FinalLibraryPageProps {
  sops: SopDocument[];
  documents: LibraryDocument[];
  userSession: UserSession;
  onViewSop?: (sop: SopDocument) => void;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

type FinalDocTypeFilter = 'ALL' | 'SPO' | 'SK' | 'MOU';

type CombinedRow = {
  id: string;
  type: 'SPO' | 'SK' | 'MOU';
  number: string;
  title: string;
  secondary: string;
  categoryLabel: string;
  date: string;
  fileName: string;
  sopData?: SopDocument;
  libraryDoc?: LibraryDocument;
};

export const FinalLibraryPage: React.FC<FinalLibraryPageProps> = ({
  sops,
  documents,
  userSession,
  onViewSop,
  onShowToast
}) => {
  const hasStructuralBadge = Array.isArray(userSession.badges) && userSession.badges.some((b) => String(b).toUpperCase() === 'STRUKTURAL');
  const canAccessProtectedDocs = userSession.role === 'admin' || hasStructuralBadge;
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FinalDocTypeFilter>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [viewer, setViewer] = useState<{
    id: string;
    type: 'SK' | 'MOU';
    title: string;
    documentNumber?: string;
    fileName: string;
    url: string;
    storagePath?: string;
  } | null>(null);

  const activeSops = useMemo(
    () => sops.filter((s) => s.status === 'AKTIF' && isSopAccessibleByUser(s, userSession)),
    [sops, userSession]
  );
  const skDocs = useMemo(() => documents.filter((d) => d.type === 'SK'), [documents]);
  const mouDocs = useMemo(() => documents.filter((d) => d.type === 'MOU'), [documents]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    [...activeSops, ...documents].forEach((item: any) => {
      const value = item.effectiveDate || item.createdAt;
      if (!value) return;
      const year = new Date(value).getFullYear();
      if (!Number.isNaN(year)) years.add(String(year));
    });
    return Array.from(years).sort().reverse();
  }, [activeSops, documents]);

  const q = search.trim().toLowerCase();

  const filteredSops = useMemo(() => {
    if (filterType !== 'ALL' && filterType !== 'SPO') return [];
    return activeSops.filter((s) => {
      if (selectedYear !== 'ALL') {
        const value = s.effectiveDate || s.createdAt;
        if (!value || String(new Date(value).getFullYear()) !== selectedYear) return false;
      }
      if (!q) return true;
      return (
        (s.title || '').toLowerCase().includes(q) ||
        (s.sopNumber || '').toLowerCase().includes(q) ||
        (s.divisionName || '').toLowerCase().includes(q) ||
        (s.hierarchyDescription || '').toLowerCase().includes(q)
      );
    });
  }, [activeSops, filterType, q, selectedYear]);

  const filteredLibraryDocs = useMemo(() => documents.filter((doc) => {
    if (!canAccessProtectedDocs && (doc.type === 'SK' || doc.type === 'MOU')) return false;
    if (filterType !== 'ALL' && doc.type !== filterType) return false;
    if (selectedYear !== 'ALL') {
      const value = doc.effectiveDate || doc.createdAt;
      if (!value || String(new Date(value).getFullYear()) !== selectedYear) return false;
    }
    if (!q) return true;
    return (
      (doc.title || '').toLowerCase().includes(q) ||
      (doc.documentNumber || '').toLowerCase().includes(q) ||
      (doc.partnerName || '').toLowerCase().includes(q) ||
      (doc.originalSkNumber || '').toLowerCase().includes(q) ||
      (doc.originalSkTitle || '').toLowerCase().includes(q)
    );
  }), [documents, filterType, selectedYear, q, canAccessProtectedDocs]);

  const combinedRows = useMemo<CombinedRow[]>(() => {
    const sopRows: CombinedRow[] = filteredSops.map((sop) => {
      const isReview = sop.documentType === 'REVIEW' || sop.documentType === 'RIVIU' || sop.jenis_spo === 'RIVIU';
      const isExisting = sop.documentType === 'LAMA' || sop.documentType === 'EKSISTING' || sop.jenis_spo === 'EXISTING' || sop.jenis_spo === 'EKSISTING';
      return {
        id: sop.id,
        type: 'SPO',
        number: sop.sopNumber || '',
        title: sop.title || 'Tanpa Judul SPO',
        secondary: sop.hierarchyDescription || sop.divisionName || '',
        categoryLabel: isReview ? 'SPO Riviu' : isExisting ? 'SPO Existing' : 'SPO',
        date: sop.effectiveDate || sop.createdAt || '',
        fileName: sop.fileName || `${sop.sopNumber || 'SPO'}.pdf`,
        sopData: sop,
      };
    });

    const libraryRows: CombinedRow[] = filteredLibraryDocs.map((doc) => {
      const isRevision = doc.type === 'SK' && Boolean(doc.isRevisionSK || doc.skCategory === 'PERUBAHAN');
      return {
        id: doc.id,
        type: doc.type,
        number: doc.documentNumber || '',
        title: doc.title || 'Tanpa Judul',
        secondary: doc.type === 'MOU'
          ? (doc.partnerName || '')
          : isRevision
            ? `Merevisi: ${doc.originalSkNumber || doc.originalSkTitle || 'SK terdahulu'}`
            : '',
        categoryLabel: doc.type === 'MOU' ? 'MOU / PKS' : isRevision ? 'SK Perubahan' : 'SK Pokok',
        date: doc.effectiveDate || doc.createdAt || '',
        fileName: doc.fileName,
        libraryDoc: doc,
      };
    });

    return [...sopRows, ...libraryRows].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [filteredSops, filteredLibraryDocs]);

  const grandTotal = activeSops.length + (canAccessProtectedDocs ? skDocs.length + mouDocs.length : 0);

  const openRow = async (row: CombinedRow) => {
    if (row.type === 'SPO' && row.sopData && onViewSop) {
      onViewSop(row.sopData);
      return;
    }
    if (!row.libraryDoc) return;
    try {
      const url = await getLibraryDocumentUrl(row.libraryDoc);
      if (!url) {
        onShowToast?.('error', 'File PDF Tidak Ditemukan', `File ${row.fileName || 'dokumen'} tidak tersedia.`);
        return;
      }
      setViewer({
        id: row.id,
        type: row.type as 'SK' | 'MOU',
        title: row.title,
        documentNumber: row.number,
        fileName: row.fileName,
        url,
        storagePath: row.libraryDoc.storagePath,
      });
    } catch (error: any) {
      onShowToast?.('error', 'Gagal Membuka Dokumen', error?.message || 'Dokumen tidak dapat dibuka.');
    }
  };

  const downloadLibraryDoc = async (doc: LibraryDocument) => {
    try {
      const url = await getLibraryDocumentUrl(doc);
      if (!url) {
        onShowToast?.('error', 'File PDF Tidak Ditemukan', `File ${doc.fileName || 'dokumen'} tidak tersedia.`);
        return;
      }
      triggerFileDownload(url, doc.fileName, doc.storagePath);
    } catch (error: any) {
      onShowToast?.('error', 'Download Gagal', error?.message || 'Dokumen tidak dapat diunduh.');
    }
  };

  return (
    <section className="space-y-3 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black text-slate-900">Dokumen Digital Soegiri</h1>
              <span className="text-[11px] font-bold text-slate-500">{combinedRows.length} dokumen</span>
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
              placeholder="Cari nomor atau judul dokumen..."
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
                  { id: 'ALL' as const, label: 'Semua', count: grandTotal },
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
                className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                  filterType === tab.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label} <span className="opacity-70">{tab.count}</span>
              </button>
            ))}
          </div>

          {availableYears.length > 0 && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full xl:w-auto px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Semua Tahun</option>
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          )}
        </div>
      </div>

      {combinedRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <BookOpen className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">Tidak ada dokumen yang ditemukan</h3>
          <p className="text-xs text-slate-500 mt-1">Coba kata kunci atau filter yang lain.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(190px,1.15fr)_minmax(280px,2fr)_minmax(130px,0.8fr)_110px_152px] items-center gap-3 bg-slate-50 border-b border-slate-200 px-4 py-2.5 text-[10px] uppercase tracking-wider font-black text-slate-500">
            <div>Nomor</div>
            <div>Judul</div>
            <div>Kategori</div>
            <div>Tanggal</div>
            <div className="text-right">Aksi</div>
          </div>

          <div className="divide-y divide-slate-100">
            {combinedRows.map((row) => {
              const formattedDate = row.date
                ? new Date(row.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
              const badgeClass = row.type === 'SPO'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : row.type === 'SK'
                  ? (row.categoryLabel === 'SK Perubahan' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                  : 'bg-blue-50 text-blue-700 border-blue-200';

              return (
                <div key={`${row.type}-${row.id}`} className="px-3.5 sm:px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(190px,1.15fr)_minmax(280px,2fr)_minmax(130px,0.8fr)_110px_152px] items-center gap-2 md:gap-3">
                    <div className="min-w-0 flex items-center justify-between gap-2 md:block">
                      <span className="font-mono text-xs font-black text-slate-700 break-all md:break-normal md:whitespace-normal">{row.number || '—'}</span>
                      <span className={`md:hidden shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black border ${badgeClass}`}>{row.categoryLabel}</span>
                    </div>

                    <div className="min-w-0">
                      <button type="button" onClick={() => openRow(row)} className="block text-left text-[13px] font-semibold text-slate-900 hover:text-emerald-700 hover:underline underline-offset-2 leading-snug">
                        {row.title}
                      </button>
                      {row.secondary && <div className="mt-0.5 text-[10px] text-slate-500 truncate">{row.secondary}</div>}
                      <div className="md:hidden mt-1 text-[10px] text-slate-400">{formattedDate}</div>
                    </div>

                    <div className="hidden md:flex items-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}`}>{row.categoryLabel}</span>
                    </div>

                    <div className="hidden md:block text-[11px] text-slate-500">{formattedDate}</div>

                    <div className="flex items-center gap-1 md:justify-end">
                      <button type="button" onClick={() => openRow(row)} className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50" title="Buka dokumen">
                        <Eye className="w-4 h-4" />
                      </button>
                      {row.libraryDoc && (
                        <button type="button" onClick={() => downloadLibraryDoc(row.libraryDoc!)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Download PDF">
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

      {viewer && (
        <div className="fixed inset-0 z-[90] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
          <div className="w-full h-full max-w-6xl bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-slate-200">
            <div className="h-16 shrink-0 px-5 sm:px-6 border-b border-slate-200 flex items-center justify-between gap-3 bg-white">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${viewer.type === 'SK' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>{viewer.type}</span>
                  {viewer.documentNumber && <span className="text-xs font-mono font-bold text-slate-600 truncate">{viewer.documentNumber}</span>}
                </div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 truncate mt-0.5">{viewer.title}</h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const doc = documents.find((d) => d.id === viewer.id);
                    if (doc) void downloadLibraryDoc(doc);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Download PDF</span>
                </button>
                <button type="button" onClick={() => setViewer(null)} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 bg-white">
              <DocumentViewer
                fileUrl={viewer.url}
                fileName={viewer.fileName}
                storagePath={viewer.storagePath}
                heightClass="h-full w-full"
                showPdfDownloadAction={false}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
