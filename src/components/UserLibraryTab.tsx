import React, { useEffect, useMemo, useState } from 'react';
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
