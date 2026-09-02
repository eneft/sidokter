import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, Eye, Lock, ArrowUpDown, RotateCcw } from 'lucide-react';
import { SopDocument, UserSession, getStandardJenisSpo } from '../types';
import { SOEGIRI_MASTER_CATEGORIES, isSopAccessibleByUser } from '../utils/soegiriStructure';

interface PetugasLibraryTabProps {
  sops: SopDocument[];
  userSession: UserSession;
  onViewDetail: (sop: SopDocument) => void;
  onSwitchToInputTab: () => void;
}

type SortKey = 'number' | 'title' | 'date';

export const PetugasLibraryTab: React.FC<PetugasLibraryTabProps> = ({
  sops,
  userSession,
  onViewDetail,
  onSwitchToInputTab,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('number');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Access remains authoritative in the component; this UI rollback changes presentation only.
  const accessibleSops = useMemo(() => sops.filter((sop) => isSopAccessibleByUser(sop, userSession)), [sops, userSession]);

  const assignedDivCodes = Array.from(new Set(
    (Array.isArray(userSession.assignments) && userSession.assignments.length
      ? userSession.assignments.map((a) => a.divisionCode)
      : (Array.isArray(userSession.divisionCodes) ? userSession.divisionCodes : [userSession.divisionCode || 'PEL']))
      .filter(Boolean).map((c) => String(c).toUpperCase())
  ));
  const isRestricted = userSession.role !== 'admin' && !assignedDivCodes.includes('ALL');
  const assignedDivCode = assignedDivCodes[0] || 'PEL';

  const years = useMemo(() => {
    return Array.from(new Set(accessibleSops
      .map((s) => String(s.effectiveDate || '').slice(0, 4))
      .filter((year) => /^\d{4}$/.test(year))
    )).sort((a, b) => Number(b) - Number(a));
  }, [accessibleSops]);

  const lockedPathLabels = assignedDivCodes.join(', ') || assignedDivCode;

  const [selectedCategory, setSelectedCategory] = useState(
    isRestricted && assignedDivCodes.length === 1 ? assignedDivCode : 'ALL'
  );

  useEffect(() => {
    setSelectedCategory(isRestricted && assignedDivCodes.length === 1 ? assignedDivCode : 'ALL');
  }, [isRestricted, assignedDivCodes.join('|'), assignedDivCode]);

  const filteredSops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result = accessibleSops.filter((s) => {
      if (selectedCategory !== 'ALL' && String(s.divisionCode || '').toUpperCase() !== selectedCategory) return false;
      if (selectedStatus !== 'ALL' && s.status !== selectedStatus) return false;
      if (selectedYear !== 'ALL' && String(s.effectiveDate || '').slice(0, 4) !== selectedYear) return false;
      if (!q) return true;
      return `${s.sopNumber || ''} ${s.title || ''}`.toLowerCase().includes(q);
    });

    result.sort((a, b) => {
      const av = sortKey === 'title' ? String(a.title || '') : sortKey === 'date' ? String(a.effectiveDate || '') : String(a.sopNumber || '');
      const bv = sortKey === 'title' ? String(b.title || '') : sortKey === 'date' ? String(b.effectiveDate || '') : String(b.sopNumber || '');
      const cmp = av.localeCompare(bv, 'id', { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [accessibleSops, searchQuery, selectedCategory, selectedStatus, selectedYear, sortKey, sortDirection]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedStatus('ALL');
    setSelectedYear('ALL');
    setSortKey('number');
    setSortDirection('asc');
    setSelectedCategory(isRestricted && assignedDivCodes.length === 1 ? assignedDivCode : 'ALL');
  };

  const hasFilters = searchQuery.trim() || selectedStatus !== 'ALL' || selectedYear !== 'ALL' || selectedCategory !== 'ALL';

  const statusLabel = (status: string) => status === 'AKTIF' ? 'AKTIF' : status === 'DIARSIPKAN' ? 'DIARSIPKAN' : 'DRAFT';
  const jenisLabel = (sop: SopDocument) => getStandardJenisSpo(sop);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Search + compact filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5">
        <div className="flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul atau nomor SPO..."
              className="w-full text-xs pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium" />
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} disabled={isRestricted && assignedDivCodes.length <= 1}
              aria-label="Filter hirarki"
              className="min-w-0 sm:min-w-[190px] text-xs border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100">
              <option value="ALL">Semua Hirarki</option>
              {assignedDivCodes.map((code) => {
                const cat = SOEGIRI_MASTER_CATEGORIES.find((c) => c.code === code);
                return <option key={code} value={code}>[{code}] {cat?.name || code}</option>;
              })}
            </select>
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} aria-label="Filter status"
              className="text-xs border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="ALL">Semua Status</option><option value="DRAFT">Draft</option><option value="AKTIF">Aktif</option><option value="DIARSIPKAN">Diarsipkan</option>
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} aria-label="Filter tahun"
              className="text-xs border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="ALL">Semua Tahun</option>
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <button type="button" onClick={() => setSortDirection((d) => d === 'asc' ? 'desc' : 'asc')} title="Balik urutan"
              className="inline-flex items-center justify-center gap-1.5 text-xs border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 bg-white font-bold hover:bg-slate-50">
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sortDirection === 'asc' ? 'A–Z' : 'Z–A'}
            </button>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>Urutkan:</span>
            <button type="button" onClick={() => setSortKey('number')} className={`font-bold ${sortKey === 'number' ? 'text-emerald-700' : 'text-slate-500'}`}>Nomor</button>
            <button type="button" onClick={() => setSortKey('title')} className={`font-bold ${sortKey === 'title' ? 'text-emerald-700' : 'text-slate-500'}`}>Judul</button>
            <button type="button" onClick={() => setSortKey('date')} className={`font-bold ${sortKey === 'date' ? 'text-emerald-700' : 'text-slate-500'}`}>Tanggal</button>
          </div>
          {hasFilters && <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 hover:text-emerald-900"><RotateCcw className="w-3 h-3" /> Reset filter</button>}
        </div>
      </div>

      {/* Result count */}
      <div className="flex items-center justify-between px-1 gap-2 text-xs text-slate-500">
        <span>Menampilkan <strong className="text-slate-800">{filteredSops.length}</strong> dari <strong className="text-slate-800">{accessibleSops.length}</strong> dokumen yang dapat diakses</span>
        {isRestricted && <span className="hidden sm:inline text-[11px] text-slate-400">Scope: {lockedPathLabels}</span>}
      </div>

      {filteredSops.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-sm">
          <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            {isRestricted ? <Lock className="w-7 h-7 text-amber-500" /> : <BookOpen className="w-7 h-7" />}
          </div>
          <h3 className="text-sm font-bold text-slate-800">Tidak ada dokumen SPO yang dapat ditampilkan</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 leading-relaxed">
            {searchQuery ? `Tidak ditemukan naskah dengan kata kunci "${searchQuery}".` : isRestricted ? `Belum ada naskah SPO dalam kewenangan akun Anda (${lockedPathLabels}).` : 'Belum ada naskah SPO yang terdaftar dalam sistem.'}
          </p>
          <button type="button" onClick={onSwitchToInputTab} className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm">Input SPO Baru</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Desktop column header */}
          <div className="hidden md:grid grid-cols-[minmax(210px,1.05fr)_minmax(260px,2fr)_110px_120px] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
            <div>Nomor SPO</div><div>Judul SPO</div><div>Jenis / Status</div><div className="text-right">Aksi</div>
          </div>
          {filteredSops.map((sop, index) => {
            const jenis = jenisLabel(sop);
            return (
              <div key={sop.id} className={`grid grid-cols-1 md:grid-cols-[minmax(210px,1.05fr)_minmax(260px,2fr)_110px_120px] gap-3 md:gap-4 px-5 py-4 items-center hover:bg-slate-50/80 transition-colors ${index < filteredSops.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div className="min-w-0">
                  <div className="md:hidden text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Nomor SPO</div>
                  <div className="font-mono text-sm font-black text-emerald-800 break-words">{sop.sopNumber || '-'}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{sop.effectiveDate || '-'} · Rev {sop.revisionNumber || '00'}</div>
                </div>
                <div className="min-w-0">
                  <div className="md:hidden text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Judul SPO</div>
                  <div className="text-sm font-black text-slate-900 leading-snug">{sop.title || '-'}</div>
                  {sop.hierarchyDescription && <div className="text-[11px] text-slate-500 mt-1 line-clamp-1">{sop.hierarchyDescription}</div>}
                </div>
                <div className="flex md:block items-center gap-1.5">
                  <span className={`inline-flex px-2 py-1 rounded-lg text-[9px] font-black border ${jenis === 'RIVIU' ? 'bg-amber-50 text-amber-800 border-amber-200' : jenis === 'EKSISTING' ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-violet-50 text-violet-800 border-violet-200'}`}>{jenis}</span>
                  <span className={`inline-flex mt-0 md:mt-1 px-2 py-1 rounded-lg text-[9px] font-black border ${sop.status === 'AKTIF' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : sop.status === 'DRAFT' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>{statusLabel(sop.status)}</span>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={() => onViewDetail(sop)} className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm">
                    <Eye className="w-3.5 h-3.5" /> Buka SPO
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
