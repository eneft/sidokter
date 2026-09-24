import React, { useEffect, useMemo, useState } from 'react';
import { 
  FileText, 
  Search, 
  Eye, 
  Check, 
  Lock,
  PlusCircle,
  HelpCircle
} from 'lucide-react';
import { SopDocument, UserSession } from '../types';
import { SOEGIRI_MASTER_CATEGORIES, isSopAccessibleByUser } from '../utils/soegiriStructure';
import { AdminTooltip } from './AdminTooltip';

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
  // Catatan: Badge STRUKTURAL memberikan akses untuk SK & MOU.
  // Untuk arsip SPO, tampilan tetap dibatasi sesuai kewenangan hirarki pengguna.
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


  // 1. First enforce STRICT RBAC: User can ONLY access SOPs within their locked account scope
  const accessibleSops = sops.filter((sop) => (userSession.role === 'admin' || sop.status !== 'DIARSIPKAN') && isSopAccessibleByUser(sop, userSession));

  // 2. Secondary UI filters (Search, Status, and Category if admin/ALL)
  const filteredSops = accessibleSops.filter((s) => {
    // Category filter
    if (selectedCategory !== 'ALL' && String(s.divisionCode || '').trim().toUpperCase() !== String(selectedCategory || '').trim().toUpperCase()) {
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
  );
};
