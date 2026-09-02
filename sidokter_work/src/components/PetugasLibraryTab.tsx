import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, Eye, Check, Lock, Copy, X, CalendarDays } from 'lucide-react';
import { SopDocument, UserSession, getStandardJenisSpo } from '../types';
import { SOEGIRI_MASTER_CATEGORIES, isSopAccessibleByUser } from '../utils/soegiriStructure';

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

  const accessibleSops = sops.filter((sop) => isSopAccessibleByUser(sop, userSession));

  const filteredSops = accessibleSops.filter((s) => {
    if (selectedCategory !== 'ALL' && s.divisionCode !== selectedCategory) return false;
    if (selectedStatus !== 'ALL' && s.status !== selectedStatus) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return `${s.title || ''} ${s.sopNumber || ''}`.toLowerCase().includes(q);
  });

  const getTypeBadge = (sop: SopDocument) => {
    const type = getStandardJenisSpo(sop);
    if (type === 'RIVIU') return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">RIVIU</span>;
    if (type === 'EKSISTING') return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">EXISTING</span>;
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-50 text-sky-700 border border-sky-200">BARU</span>;
  };

  const getStatusBadge = (status: string) => {
    if (status === 'AKTIF') return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">AKTIF</span>;
    if (status === 'DRAFT') return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">DRAFT</span>;
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600 border border-slate-200">DIARSIPKAN</span>;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Compact library heading */}
      <div className="bg-white rounded-2xl border border-slate-200 px-4 sm:px-5 py-3.5 shadow-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-slate-900">Perpustakaan SPO</h2>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{filteredSops.length} Dokumen</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">Dokumen SPO resmi sesuai kewenangan unit kerja Anda.</p>
          </div>
        </div>
      </div>

      {/* Compact access scope */}
      {isRestricted && assignmentSummary.length > 0 && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Check className="w-4 h-4 shrink-0 text-emerald-700" />
            <span className="text-[11px] font-extrabold text-emerald-900 truncate">Akses: {assignmentSummary.map((a) => `${a.code} / ${a.hierarchy}`).join(' • ')}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {assignmentSummary.map((a) => (
              <button key={`${a.code}-${a.hierarchy}`} type="button" onClick={() => setSelectedCategory(a.code)} className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold transition-colors ${selectedCategory === a.code ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-100'}`} title={a.label}>
                {a.code} / {a.hierarchy}
              </button>
            ))}
            <button type="button" onClick={() => setSelectedCategory('ALL')} className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold transition-colors ${selectedCategory === 'ALL' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}>Semua Hirarki</button>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div className="bg-white rounded-2xl px-4 py-3 border border-slate-200 shadow-xs">
        <div className="flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul atau nomor SPO..."
              className="w-full text-xs pl-10 pr-10 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
            {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label="Hapus pencarian"><X className="w-4 h-4" /></button>}
          </div>
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} disabled={isRestricted && assignedDivCodes.length <= 1} className="lg:w-56 text-xs border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500">
            <option value="ALL">Semua Hirarki</option>
            {assignedDivCodes.map((code) => {
              const cat = SOEGIRI_MASTER_CATEGORIES.find((c) => c.code === code);
              return <option key={code} value={code}>[{code}] {cat?.name || code}</option>;
            })}
          </select>
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="lg:w-40 text-xs border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="ALL">Semua Status</option>
            <option value="AKTIF">Aktif</option>
            <option value="DRAFT">Draft</option>
            <option value="DIARSIPKAN">Diarsipkan</option>
          </select>
        </div>
      </div>

      {/* Results summary */}
      <div className="flex items-center justify-between px-1 gap-3">
        <div className="text-xs text-slate-500"><strong className="text-slate-800">{filteredSops.length}</strong> dokumen SPO</div>
        {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="text-[11px] text-emerald-700 font-bold hover:underline">Reset pencarian</button>}
      </div>

      {filteredSops.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs">
          <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-3">{isRestricted ? <Lock className="w-7 h-7 text-amber-500" /> : <BookOpen className="w-7 h-7" />}</div>
          <h3 className="text-sm font-bold text-slate-800">Tidak ada dokumen SPO yang dapat ditampilkan</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5">{searchQuery ? `Tidak ditemukan naskah dengan kata kunci "${searchQuery}".` : isRestricted ? `Belum ada naskah SPO yang dapat diakses dari kewenangan akun Anda (${lockedPathLabels}).` : 'Belum ada naskah SPO yang terdaftar dalam sistem.'}</p>
          <button type="button" onClick={onSwitchToInputTab} className="mt-5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all inline-flex items-center gap-2"><span>+ SPO Baru</span></button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          {/* Full-width document list */}
          <div className="hidden md:grid grid-cols-[minmax(220px,1.05fr)_minmax(260px,1.7fr)_150px_110px] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider font-black text-slate-500">
            <span>Nomor SPO</span><span>Judul SPO</span><span>Jenis / Status</span><span className="text-right">Aksi</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredSops.map((sop) => {
              const oldNumber = sop.oldSopNumber || sop.legacySopNumber;
              const type = getStandardJenisSpo(sop);
              return (
                <div key={sop.id} className="group px-4 sm:px-5 py-4 hover:bg-slate-50/70 transition-colors">
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,1.05fr)_minmax(260px,1.7fr)_150px_110px] gap-3 md:gap-4 md:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs sm:text-[13px] font-black text-emerald-900 break-all">{sop.sopNumber || 'Nomor belum tersedia'}</span>
                        {sop.sopNumber && <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(sop.sopNumber); } catch {} }} className="shrink-0 p-1 rounded-md text-slate-400 hover:text-emerald-700 hover:bg-emerald-50" title="Salin nomor"><Copy className="w-3.5 h-3.5" /></button>}
                      </div>
                      <div className="md:hidden flex items-center gap-1.5 mt-2 flex-wrap">{getTypeBadge(sop)} {getStatusBadge(sop.status)}</div>
                    </div>

                    <div className="min-w-0">
                      <button type="button" onClick={() => onViewDetail(sop)} className="text-left w-full font-black text-sm sm:text-[15px] text-slate-900 group-hover:text-emerald-800 leading-snug transition-colors">{sop.title || 'Tanpa Judul SPO'}</button>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500 flex-wrap">
                        {sop.divisionName && <span>{sop.divisionName}</span>}
                        {sop.effectiveDate && <span className="inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" />{sop.effectiveDate}</span>}
                        <span>Rev {sop.revisionNumber || sop.version || (type === 'RIVIU' ? '01' : '00')}</span>
                      </div>
                      {type === 'RIVIU' && oldNumber && <div className="mt-1 text-[10px] text-amber-700">Nomor lama: <span className="font-mono font-bold">{oldNumber}</span></div>}
                    </div>

                    <div className="hidden md:flex flex-wrap items-center gap-1.5">{getTypeBadge(sop)} {getStatusBadge(sop.status)}</div>

                    <div className="flex md:justify-end">
                      <button type="button" onClick={() => onViewDetail(sop)} className="inline-flex items-center justify-center gap-1.5 w-full md:w-auto px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"><Eye className="w-3.5 h-3.5" /><span>Buka SPO</span></button>
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
