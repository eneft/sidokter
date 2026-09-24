from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

USER_LIBRARY = r'''import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit3,
  Eye,
  FileText,
  Lock,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { SopDocument, UserSession } from '../types';
import {
  SOEGIRI_MASTER_CATEGORIES,
  canUserActivateSop,
  isSopAccessibleByUser
} from '../utils/soegiriStructure';
import { canEditExistingSop } from '../lib/sopEditPolicy';

interface UserLibraryTabProps {
  sops: SopDocument[];
  userSession: UserSession;
  onViewDetail: (sop: SopDocument) => void;
  onSwitchToInputTab: () => void;
  onEditSop?: (sop: SopDocument) => void;
  onDeleteSop?: (sop: SopDocument) => void;
  onSwitchToArchiveTab?: () => void;
  onSwitchToListTab?: () => void;
  title?: string;
  isArchiveView?: boolean;
}

export const UserLibraryTab: React.FC<UserLibraryTabProps> = ({
  sops,
  userSession,
  onViewDetail,
  onSwitchToInputTab,
  onEditSop,
  onDeleteSop,
  onSwitchToArchiveTab,
  onSwitchToListTab,
  title = 'SPO',
  isArchiveView = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  const assignedDivCodes = Array.from(new Set(
    (Array.isArray(userSession.assignments) && userSession.assignments.length
      ? userSession.assignments.map((a) => a.divisionCode)
      : (Array.isArray(userSession.divisionCodes) ? userSession.divisionCodes : [userSession.divisionCode || 'PEL']))
      .filter(Boolean).map((c) => String(c).toUpperCase())
  ));
  const isRestricted = userSession.role !== 'admin' && !assignedDivCodes.includes('ALL');
  const assignedDivCode = assignedDivCodes[0] || 'PEL';

  const [selectedCategory, setSelectedCategory] = useState<string>(
    isRestricted && assignedDivCodes.length === 1 ? assignedDivCode : 'ALL'
  );

  useEffect(() => {
    setSelectedCategory(isRestricted && assignedDivCodes.length === 1 ? assignedDivCode : 'ALL');
  }, [isRestricted, assignedDivCodes.join('|'), assignedDivCode]);

  const assignmentCount = Array.isArray(userSession.assignments) && userSession.assignments.length
    ? userSession.assignments.length
    : assignedDivCodes.length;

  const accessibleSops = useMemo(
    () => sops.filter((sop) => (userSession.role === 'admin' || sop.status !== 'DIARSIPKAN') && isSopAccessibleByUser(sop, userSession)),
    [sops, userSession]
  );

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    accessibleSops.forEach((sop) => {
      const value = sop.effectiveDate || sop.createdAt;
      if (!value) return;
      const year = new Date(value).getFullYear();
      if (!Number.isNaN(year)) years.add(String(year));
    });
    return Array.from(years).sort().reverse();
  }, [accessibleSops]);

  const statusCounts = useMemo(() => ({
    total: accessibleSops.length,
    draft: accessibleSops.filter((s) => s.status === 'DRAFT').length,
    active: accessibleSops.filter((s) => s.status === 'AKTIF').length,
    archived: accessibleSops.filter((s) => s.status === 'DIARSIPKAN').length,
  }), [accessibleSops]);

  const filteredSops = useMemo(() => accessibleSops.filter((s) => {
    if (selectedCategory !== 'ALL' && String(s.divisionCode || '').trim().toUpperCase() !== String(selectedCategory).trim().toUpperCase()) return false;
    if (selectedStatus !== 'ALL' && s.status !== selectedStatus) return false;
    if (selectedYear !== 'ALL') {
      const dateValue = s.effectiveDate || s.createdAt;
      if (!dateValue || String(new Date(dateValue).getFullYear()) !== selectedYear) return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (s.title || '').toLowerCase().includes(q) || (s.sopNumber || '').toLowerCase().includes(q);
  }), [accessibleSops, searchQuery, selectedCategory, selectedStatus, selectedYear]);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black text-slate-900">{title}</h1>
              <span className="text-[11px] font-bold text-slate-500">{filteredSops.length} dokumen</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onSwitchToInputTab}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ SPO Baru</span>
            </button>

            {isArchiveView ? (
              onSwitchToListTab && (
                <button
                  type="button"
                  onClick={onSwitchToListTab}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors"
                >
                  Daftar SPO
                </button>
              )
            ) : (
              userSession.role === 'admin' && onSwitchToArchiveTab && (
                <button
                  type="button"
                  onClick={onSwitchToArchiveTab}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors"
                >
                  Arsip SPO
                </button>
              )
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nomor atau judul SPO..."
              className="w-full text-xs pl-9 pr-9 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!isArchiveView && (
            <div className="flex items-center gap-1 overflow-x-auto">
              {([
                { id: 'ALL', label: 'Semua', count: statusCounts.total },
                { id: 'DRAFT', label: 'Draft', count: statusCounts.draft },
                { id: 'AKTIF', label: 'Aktif', count: statusCounts.active },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedStatus(tab.id)}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                    selectedStatus === tab.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label} <span className="opacity-70">{tab.count}</span>
                </button>
              ))}
            </div>
          )}

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            disabled={isRestricted && assignedDivCodes.length <= 1}
            className={`w-full xl:w-auto xl:min-w-[190px] text-xs border rounded-lg px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              isRestricted && assignedDivCodes.length <= 1
                ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            <option value="ALL">Semua Kewenangan ({assignmentCount})</option>
            {assignedDivCodes.map((code) => {
              const cat = SOEGIRI_MASTER_CATEGORIES.find((c) => c.code === code);
              return <option key={code} value={code}>[{code}] {cat?.name || code}</option>;
            })}
          </select>

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

      {filteredSops.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
          <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2">
            {isRestricted ? <Lock className="w-5 h-5 text-amber-500" /> : <FileText className="w-5 h-5" />}
          </div>
          <h3 className="text-sm font-bold text-slate-800">Tidak ada dokumen SPO</h3>
          <p className="text-xs text-slate-500 mt-1">
            {searchQuery ? `Tidak ditemukan naskah dengan kata kunci "${searchQuery}".` : 'Belum ada naskah SPO yang dapat ditampilkan.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(190px,1.15fr)_minmax(280px,2fr)_minmax(130px,0.8fr)_110px_152px] items-center gap-3 bg-slate-50 border-b border-slate-200 px-4 py-2.5 text-[10px] uppercase tracking-wider font-black text-slate-500">
            <div>Nomor</div>
            <div>Judul SPO</div>
            <div>Status / Jenis</div>
            <div>Tanggal</div>
            <div className="text-right">Aksi</div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredSops.map((sop) => {
              const isReview = sop.documentType === 'REVIEW' || sop.documentType === 'RIVIU' || sop.jenis_spo === 'RIVIU';
              const isExisting = sop.documentType === 'LAMA' || sop.documentType === 'EKSISTING' || sop.jenis_spo === 'EXISTING' || sop.jenis_spo === 'EKSISTING';
              const dateValue = sop.effectiveDate || sop.createdAt;
              const formattedDate = dateValue
                ? new Date(dateValue).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
              const canEdit = Boolean(onEditSop && canEditExistingSop(sop, userSession));
              const canDelete = Boolean(onDeleteSop && (userSession.role === 'admin' || canUserActivateSop(sop, userSession)));

              return (
                <div key={sop.id} className="px-3.5 sm:px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(190px,1.15fr)_minmax(280px,2fr)_minmax(130px,0.8fr)_110px_152px] items-center gap-2 md:gap-3">
                    <div className="min-w-0 flex items-center justify-between gap-2 md:block">
                      <span className="font-mono text-xs font-black text-slate-700 break-all md:break-normal md:whitespace-normal">{sop.sopNumber || '—'}</span>
                      <span className={`md:hidden shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                        sop.status === 'AKTIF' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : sop.status === 'DRAFT' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {sop.status === 'DIARSIPKAN' ? 'Diarsipkan' : sop.status}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onViewDetail(sop)}
                        className="block max-w-full text-left text-[13px] font-semibold text-slate-900 hover:text-emerald-700 hover:underline underline-offset-2 leading-snug"
                      >
                        {sop.title || 'Tanpa Judul SPO'}
                      </button>
                      {(sop.hierarchyDescription || sop.divisionName) && (
                        <div className="mt-0.5 text-[10px] text-slate-500 truncate">{sop.hierarchyDescription || sop.divisionName}</div>
                      )}
                      <div className="md:hidden mt-1 text-[10px] text-slate-400">{formattedDate}</div>
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

                    <div className="hidden md:block text-[11px] text-slate-500">{formattedDate}</div>

                    <div className="flex items-center gap-1 md:justify-end">
                      <button type="button" onClick={() => onViewDetail(sop)} className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50" title="Buka SPO">
                        <Eye className="w-4 h-4" />
                      </button>
                      {canEdit && (
                        <button type="button" onClick={() => onEditSop?.(sop)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Edit SPO">
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" onClick={() => onDeleteSop?.(sop)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50" title={sop.status === 'AKTIF' ? 'Arsipkan / kelola SPO' : 'Hapus SPO'}>
                          <Trash2 className="w-4 h-4" />
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
    </div>
  );
};
'''

FINAL_LIBRARY = r'''import React, { useMemo, useState } from 'react';
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
              <h1 className="text-lg font-black text-slate-900">Arsip Digital</h1>
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
'''


def patch_user_view(path: Path) -> None:
    text = path.read_text()

    old = "  onViewDetail: (sop: SopDocument) => void;\n  onCopyNumber: (sopNumber: string) => void;"
    new = "  onViewDetail: (sop: SopDocument) => void;\n  onEditSop?: (sop: SopDocument) => void;\n  onDeleteSop?: (sop: SopDocument) => void;\n  onCopyNumber: (sopNumber: string) => void;"
    if old not in text:
        raise RuntimeError('UserView props marker not found')
    text = text.replace(old, new, 1)

    old = "  onViewDetail,\n  onCopyNumber,"
    new = "  onViewDetail,\n  onEditSop,\n  onDeleteSop,\n  onCopyNumber,"
    if old not in text:
        raise RuntimeError('UserView destructure marker not found')
    text = text.replace(old, new, 1)

    header_marker = '            {/* Sub-header / toggle */}\n            <div className="bg-white rounded-2xl border border-slate-200 px-4 sm:px-5 py-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">'
    if header_marker not in text:
        raise RuntimeError('SPO header start not found')
    text = text.replace(
        header_marker,
        '            {/* Input workflow keeps the original sub-header; list/archive use the SK-style register header. */}\n            {spoSubTab === \'input\' && (\n            <div className="bg-white rounded-2xl border border-slate-200 px-4 sm:px-5 py-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">',
        1
    )

    list_marker = '              </div>\n            </div>\n\n            {/* SubTab List: User Library Tab */}'
    header_pos = text.find("{spoSubTab === 'input' && (\n            <div className=\"bg-white rounded-2xl")
    list_pos = text.find(list_marker, header_pos)
    if header_pos < 0 or list_pos < 0:
        raise RuntimeError('SPO header end not found')
    text = text[:list_pos] + '              </div>\n            </div>\n            )}\n\n            {/* SubTab List: User Library Tab */}' + text[list_pos + len(list_marker):]

    old_list = '''            {spoSubTab === 'list' && (\n              <UserLibraryTab\n                sops={sops.filter((s) => s.status !== 'DIARSIPKAN')}\n                userSession={userSession}\n                onViewDetail={onViewDetail}\n                onSwitchToInputTab={() => setSpoSubTab('input')}\n              />\n            )}\n\n            {spoSubTab === 'archive' && userSession.role === 'admin' && (\n              <div className="space-y-3">\n                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">\n                  <h2 className="text-base font-black text-slate-900 flex items-center gap-2"><Archive className="w-4 h-4" /> Arsip SPO</h2>\n                  <p className="text-xs text-slate-500 mt-1">Riwayat dokumen yang pernah aktif. Nomor SPO pada arsip terkunci permanen dan tidak dapat digunakan kembali.</p>\n                </div>\n                <UserLibraryTab\n                  sops={sops.filter((s) => s.status === 'DIARSIPKAN')}\n                  userSession={userSession}\n                  onViewDetail={onViewDetail}\n                  onSwitchToInputTab={() => setSpoSubTab('input')}\n                />\n              </div>\n            )}'''
    new_list = '''            {spoSubTab === 'list' && (\n              <UserLibraryTab\n                title="SPO"\n                sops={sops.filter((s) => s.status !== 'DIARSIPKAN')}\n                userSession={userSession}\n                onViewDetail={onViewDetail}\n                onEditSop={onEditSop}\n                onDeleteSop={onDeleteSop}\n                onSwitchToInputTab={() => setSpoSubTab('input')}\n                onSwitchToArchiveTab={userSession.role === 'admin' ? () => setSpoSubTab('archive') : undefined}\n              />\n            )}\n\n            {spoSubTab === 'archive' && userSession.role === 'admin' && (\n              <UserLibraryTab\n                title="Arsip SPO"\n                isArchiveView\n                sops={sops.filter((s) => s.status === 'DIARSIPKAN')}\n                userSession={userSession}\n                onViewDetail={onViewDetail}\n                onEditSop={onEditSop}\n                onDeleteSop={onDeleteSop}\n                onSwitchToInputTab={() => setSpoSubTab('input')}\n                onSwitchToListTab={() => setSpoSubTab('list')}\n              />\n            )}'''
    if old_list not in text:
        raise RuntimeError('UserLibraryTab render block not found')
    text = text.replace(old_list, new_list, 1)
    path.write_text(text)


def patch_app(path: Path) -> None:
    text = path.read_text()
    old = "            onViewDetail={(sop) => setSelectedSopForDetail(sop)}\n            onCopyNumber={handleCopyNumber}"
    new = "            onViewDetail={(sop) => setSelectedSopForDetail(sop)}\n            onEditSop={(sop) => setSelectedSopForEdit(sop)}\n            onDeleteSop={(sop) => handleDeleteSop(sop.id, sop.title)}\n            onCopyNumber={handleCopyNumber}"
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'User App UserView marker count expected 1, got {count}')
    text = text.replace(old, new, 1)

    old = "        onViewDetail={(sop) => setSelectedSopForDetail(sop)}\n        onCopyNumber={handleCopyNumber}"
    new = "        onViewDetail={(sop) => setSelectedSopForDetail(sop)}\n        onEditSop={(sop) => setSelectedSopForEdit(sop)}\n        onDeleteSop={(sop) => handleDeleteSop(sop.id, sop.title)}\n        onCopyNumber={handleCopyNumber}"
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'Admin App UserView marker count expected 1, got {count}')
    text = text.replace(old, new, 1)
    path.write_text(text)


def main() -> None:
    (ROOT / 'src/components/UserLibraryTab.tsx').write_text(USER_LIBRARY)
    (ROOT / 'src/components/FinalLibraryPage.tsx').write_text(FINAL_LIBRARY)
    patch_user_view(ROOT / 'src/components/UserView.tsx')
    patch_app(ROOT / 'src/App.tsx')


if __name__ == '__main__':
    main()
