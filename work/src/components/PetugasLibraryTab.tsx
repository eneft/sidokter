import React, { useEffect, useMemo, useState } from 'react';
import { 
  BookOpen, 
  Search, 
  Eye, 
  Check, 
  Lock,
} from 'lucide-react';
import { SopDocument, UserSession } from '../types';
import { SOEGIRI_MASTER_CATEGORIES, isSopAccessibleByUser } from '../utils/soegiriStructure';
import { formatBytes } from '../utils/numbering';

interface PetugasLibraryTabProps {
  sops: SopDocument[];
  userSession: UserSession;
  onViewDetail: (sop: SopDocument) => void;
  onSwitchToInputTab: () => void;
}

export const PetugasLibraryTab: React.FC<PetugasLibraryTabProps> = ({
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
  const isRestricted = userSession.role !== 'admin' && !assignedDivCodes.includes('ALL');
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


  // 1. First enforce STRICT RBAC: Petugas can ONLY access SOPs within their locked account scope
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
      
      {/* Compact Library Header */}
      <div className="bg-white rounded-2xl border border-slate-200 px-4 sm:px-5 py-4 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 shrink-0"><BookOpen className="w-5 h-5" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900">Perpustakaan SPO</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Arsip Digital Resmi</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Dokumen SPO resmi sesuai kewenangan unit Anda.</p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-black text-slate-900">{filteredSops.length}</div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Dokumen</div>
          </div>
        </div>
      </div>

      {/* Multi-hierarchy access summary */}
      {isRestricted && assignmentSummary.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
            <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-xs">
              <Check className="w-4 h-4" />
              Akses: {assignmentSummary.length} hirarki unit kerja
            </div>
            <div className="flex flex-wrap gap-2">
              {assignmentSummary.map((a) => (
                <button
                  key={`${a.code}-${a.hierarchy}`}
                  type="button"
                  onClick={() => setSelectedCategory(a.code)}
                  className={`px-3 py-1.5 rounded-xl border text-[11px] font-extrabold transition-colors ${
                    selectedCategory === a.code
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                  }`}
                  title={a.label}
                >
                  {a.code} / {a.hierarchy}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1.5 rounded-xl border text-[11px] font-extrabold transition-colors ${
                  selectedCategory === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Semua Hirarki
              </button>
            </div>
          </div>
        </div>
      )}

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
              <option value="ALL">Semua Kewenangan ({assignmentSummary.length || assignedDivCodes.length})</option>
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

      {/* Main Content: Responsive Cards */}
      {filteredSops.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs space-y-4">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            {isRestricted ? <Lock className="w-8 h-8 text-amber-500" /> : <BookOpen className="w-8 h-8" />}
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
        /* GRID CARD VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredSops.map((sop) => (
            <div
              key={sop.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-black text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    {sop.sopNumber}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {sop.documentType === 'REVIEW' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-800 border border-violet-200">Riviu</span>
                    )}
                    {sop.documentType === 'LAMA' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-200">Existing</span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        sop.status === 'AKTIF'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : sop.status === 'DRAFT'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {sop.status === 'DRAFT' ? 'Draft' : sop.status === 'DIARSIPKAN' ? 'Diarsipkan' : 'Aktif'}
                    </span>
                  </div>
                </div>

                <h4 className="font-bold text-slate-900 text-sm leading-snug group-hover:text-emerald-800 transition-colors">
                  {sop.title}
                </h4>

                {sop.hierarchyDescription && (
                  <p className="text-[11px] text-slate-500 italic line-clamp-2">
                    {sop.hierarchyDescription}
                  </p>
                )}

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Tgl: {sop.effectiveDate || '-'}</span>
                  <span>Rev: {sop.revisionNumber || '00'}</span>
                </div>

              </div>

              {/* Card Actions — satu aksi utama */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onViewDetail(sop)}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Buka SPO</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};
