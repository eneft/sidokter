import React, { useEffect, useMemo, useState } from 'react';
import { 
  FileText, 
  Search, 
  Eye, 
  Check, 
  Lock,
} from 'lucide-react';
import { SopDocument, UserSession } from '../types';
import { SOEGIRI_MASTER_CATEGORIES, isSopAccessibleByUser } from '../utils/soegiriStructure';

interface UserLibraryTabProps {
  sops: SopDocument[];
  userSession: UserSession;
  onViewDetail: (sop: SopDocument) => void;
  onSwitchToInputTab: () => void;
}

export const UserLibraryTab: React.FC<UserLibraryTabProps> = ({
  sops,
  userSession,
  onViewDetail,
  onSwitchToInputTab,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Check if account is locked to a specific unit / division
  const assignedDivCodes = Array.from(new Set(
    (Array.isArray(userSession.assignments) && userSession.assignments.length
      ? userSession.assignments.map((a) => a.divisionCode)
      : (Array.isArray(userSession.divisionCodes) ? userSession.divisionCodes : [userSession.divisionCode || 'PEL']))
      .filter(Boolean).map((c) => String(c).toUpperCase())
  ));
  const hasStructuralBadge = userSession.role === 'user' && Array.isArray(userSession.badges) && userSession.badges.some((b) => String(b).toUpperCase() === 'STRUKTURAL');
  const isRestricted = userSession.role !== 'admin' && !hasStructuralBadge && !assignedDivCodes.includes('ALL');
  const assignedDivCode = assignedDivCodes[0] || 'PEL';

  // A multi-hierarchy account must see the combined library by default.
  // The category filter is only a UI filter; the authoritative access check
  // remains isSopAccessibleByUser below.
  const [selectedCategory, setSelectedCategory] = useState<string>(
    isRestricted && assignedDivCodes.length === 1 ? assignedDivCode : 'ALL'
  );

  useEffect(() => {
    setSelectedCategory(isRestricted && assignedDivCodes.length === 1 ? assignedDivCode : 'ALL');
  }, [isRestricted, assignedDivCodes.join('|'), assignedDivCode]);

  const assignmentSummary = useMemo(() => {
    const assignments = Array.isArray(userSession.assignments) && userSession.assignments.length
      ? userSession.assignments
      : [];
    return assignments.map((a) => ({
      code: String(a.divisionCode || '').toUpperCase(),
      hierarchy: a.hierarchyCode || 'Semua hirarki',
      label: a.label || a.unitName || ''
    }));
  }, [userSession.assignments]);

  // Resolve user's locked hierarchy names for display
  const assignedCatObj = SOEGIRI_MASTER_CATEGORIES.find((c) => c.code === assignedDivCode);
  const assignedSubObj = assignedCatObj?.subs?.find((s) => s.code === userSession.subCode);
  const assignedInstObj = assignedSubObj?.instalasis?.find((i) => i.code === userSession.instCode);
  const assignedPoliObj = assignedInstObj?.polis?.find((p) => p.code === userSession.poliCode);

  const lockedPathLabels = (Array.isArray(userSession.assignments) && userSession.assignments.length
    ? userSession.assignments.map((a) => `${a.divisionCode}${a.hierarchyCode ? ` / ${a.hierarchyCode}` : ''}`).join(' + ')
    : [
        assignedCatObj ? `[${assignedCatObj.code}] ${assignedCatObj.name}` : assignedDivCode,
        assignedSubObj ? `Sub ${assignedSubObj.code}: ${assignedSubObj.name}` : null,
        assignedInstObj ? `Inst. ${assignedInstObj.name}` : null,
        assignedPoliObj ? `Unit ${assignedPoliObj.name}` : null,
      ].filter(Boolean).join(' → '));


  // 1. First enforce STRICT RBAC: User can ONLY access SOPs within their locked account scope
  const accessibleSops = sops.filter((sop) => isSopAccessibleByUser(sop, userSession));

  // 2. Secondary UI filters (Search, Status, and Category if admin/ALL)
  const filteredSops = accessibleSops.filter((s) => {
    // Category filter
    if (selectedCategory !== 'ALL' && s.divisionCode !== selectedCategory) {
      return false;
    }
    // Status filter
    if (selectedStatus !== 'ALL' && s.status !== selectedStatus) {
      return false;
    }
    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (s.title || '').toLowerCase().includes(q) || (s.sopNumber || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
        {/* Search Field */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari judul atau nomor SPO..."
            className="w-full text-xs pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Kewenangan Filter - multi-hierarchy aware */}
          <div className="relative min-w-[240px]">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={isRestricted && assignedDivCodes.length <= 1}
              className={`w-full text-xs border rounded-xl px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                isRestricted && assignedDivCodes.length <= 1
                  ? 'bg-slate-100 border-slate-300 text-slate-600 cursor-not-allowed'
                  : 'bg-white border-slate-300 text-slate-700'
              }`}
            >
              <option value="ALL">Semua Kewenangan{hasStructuralBadge ? ' (Badge Struktural)' : ` (${assignmentSummary.length || assignedDivCodes.length})`}</option>
              {assignedDivCodes.map((code) => {
                const cat = SOEGIRI_MASTER_CATEGORIES.find((c) => c.code === code);
                return (
                  <option key={code} value={code}>
                    [{code}] {cat?.name || code}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs border border-slate-300 rounded-xl px-3 py-2 text-slate-700 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">Semua Status</option>
            <option value="DRAFT">Draft</option>
            <option value="AKTIF">Aktif</option>
            <option value="DIARSIPKAN">Diarsipkan</option>
          </select>

        </div>
      </div>

      {/* Results Counter & Access Summary */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1 flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <span>
            <strong>{filteredSops.length} Dokumen SPO</strong> yang dapat diakses oleh akun Anda
          </span>
          {isRestricted && (
            <span className="text-[11px] text-slate-400">
              (Total dalam database: {sops.length} dokumen)
            </span>
          )}
        </div>

        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-emerald-700 hover:underline font-medium cursor-pointer"
          >
            Reset Pencarian
          </button>
        )}
      </div>

      {/* Main Content: Baseline SPO Table */}
      {filteredSops.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs space-y-4">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            {isRestricted ? <Lock className="w-8 h-8 text-amber-500" /> : <FileText className="w-8 h-8" />}
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">Tidak ada dokumen SPO yang dapat ditampilkan</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              {searchQuery
                ? `Tidak ditemukan naskah dengan kata kunci "${searchQuery}" di unit Anda. Coba kata kunci lain atau ubah filter.`
                : isRestricted
                ? `Belum ada naskah SPO yang dapat diakses dari seluruh kewenangan akun Anda (${lockedPathLabels}). Sistem hanya menampilkan dokumen sesuai hirarki yang ditugaskan.`
                : 'Belum ada naskah SPO yang terdaftar dalam sistem.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitchToInputTab}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <span>Input SPO Baru Sekarang</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="hidden md:grid grid-cols-[minmax(190px,1.1fr)_minmax(260px,2fr)_minmax(150px,1.15fr)_150px] bg-slate-50 border-b border-slate-200 px-5 py-3 text-[10px] uppercase tracking-wider font-black text-slate-500">
            <div>Nomor SPO</div>
            <div>Judul SPO</div>
            <div>Jenis / Status</div>
            <div className="text-right">Aksi</div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredSops.map((sop) => {
              const isReview = sop.documentType === 'REVIEW' || sop.jenis_spo === 'RIVIU';
              const isExisting = sop.documentType === 'LAMA' || sop.jenis_spo === 'EXISTING';
              return (
                <div
                  key={sop.id}
                  className="px-4 sm:px-5 py-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(190px,1.1fr)_minmax(260px,2fr)_minmax(150px,1.15fr)_150px] items-center gap-3 md:gap-4">
                    <div className="min-w-0">
                      <div className="font-mono text-xs sm:text-sm font-black text-emerald-800 whitespace-nowrap overflow-visible">
                        {sop.sopNumber || '-'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        {sop.effectiveDate || '-'} · Rev {sop.revisionNumber || '00'}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate md:whitespace-normal">
                        {sop.title || 'Tanpa Judul SPO'}
                      </div>
                      {sop.hierarchyDescription && (
                        <div className="text-[11px] text-slate-500 mt-1 truncate md:whitespace-normal">
                          {sop.hierarchyDescription}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {isReview && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-50 text-violet-700 border border-violet-200">Riviu</span>
                      )}
                      {isExisting && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200">Existing</span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        sop.status === 'AKTIF'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : sop.status === 'DRAFT'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {sop.status === 'DRAFT' ? 'Draft' : sop.status === 'DIARSIPKAN' ? 'Diarsipkan' : 'Aktif'}
                      </span>
                    </div>

                    <div className="flex md:justify-end">
                      <button
                        type="button"
                        onClick={() => onViewDetail(sop)}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs w-full md:w-auto"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Buka SPO</span>
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
  );
};
