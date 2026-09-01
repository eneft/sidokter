import React, { useState, useMemo } from 'react';
import { 
  X, 
  Printer, 
  Search, 
  Filter, 
  RotateCcw, 
  Building2,
  FileText
} from 'lucide-react';
import { SopDocument, getStandardJenisSpo } from '../types';
import { SOEGIRI_HOSPITAL_INFO, SOEGIRI_MASTER_CATEGORIES } from '../utils/soegiriStructure';
import { HospitalLogo } from './HospitalLogo';
import { DirectorSignature } from './DirectorSignature';

interface PrintRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  sops: SopDocument[];
  initialDivisionFilter?: string;
  activeFilterSummary?: string;
}

export const PrintRegisterModal: React.FC<PrintRegisterModalProps> = ({
  isOpen,
  onClose,
  sops,
  initialDivisionFilter,
  activeFilterSummary
}) => {
  if (!isOpen) return null;

  const [selectedDivision, setSelectedDivision] = useState<string>(initialDivisionFilter || 'ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  const handlePrint = () => {
    window.print();
  };

  const isFilterActive = selectedDivision !== 'ALL' || searchQuery !== '' || selectedStatus !== 'ALL' || selectedYear !== 'ALL';

  const handleResetFilter = () => {
    setSelectedDivision('ALL');
    setSearchQuery('');
    setSelectedStatus('ALL');
    setSelectedYear('ALL');
  };

  // Filtered SOPs for register table
  const filteredSops = useMemo(() => {
    return (sops || []).filter((sop) => {
      // 1. Division Code Filter
      if (selectedDivision !== 'ALL' && sop.divisionCode !== selectedDivision) {
        return false;
      }
      // 2. Status Filter
      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'Aktif' && sop.status !== 'AKTIF') return false;
        if (selectedStatus === 'Draft' && sop.status !== 'DRAFT') return false;
        if (selectedStatus === 'Draft' && sop.status !== 'DRAFT' && sop.status !== 'DRAFT' && !sop.isNumberReservation) return false;
        if (selectedStatus === 'Diarsipkan' && sop.status !== 'DIARSIPKAN') return false;
      }
      // 3. Year Filter
      if (selectedYear !== 'ALL') {
        const sopYear = (sop.effectiveDate || '').substring(0, 4);
        if (sopYear !== selectedYear) return false;
      }
      // 4. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        // Pencarian register hanya berdasarkan judul SPO.
        const matchTitle = (sop.title || '').toLowerCase().includes(q);
        if (!matchTitle) return false;
      }
      return true;
    });
  }, [sops, selectedDivision, selectedStatus, selectedYear, searchQuery]);

  const currentDateStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const selectedCategoryObj = SOEGIRI_MASTER_CATEGORIES.find((c) => c.code === selectedDivision);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 printable-modal-active">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] printable-modal-overlay">
        
        {/* Modal Header & Navigation Bar (NO PRINT) */}
        <div className="flex flex-col gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/90 no-print">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-600" />
                <span>Buku Register & Rekapitulasi Penomoran SPO RSUD Dr. Soegiri</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cetak rekapitulasi penomoran SPO per bidang / bagian / unit / pokja untuk akreditasi & kesekretariatan.
              </p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                title="Cetak langsung lembar register A4"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Rekap A4</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* FILTER CONTROL PANEL IN REGISTER BOOK (NO PRINT) */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3 no-print">
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs font-bold text-slate-800">
              <span className="flex items-center gap-1.5 uppercase tracking-wider text-indigo-900">
                <Filter className="w-4 h-4 text-indigo-600" />
                <span>Filter Buku Register SPO</span>
              </span>
              <span className="text-slate-500 font-normal">
                Menampilkan <strong className="text-indigo-700 font-bold">{filteredSops.length}</strong> dari <strong className="text-slate-800 font-bold">{sops.length}</strong> Dokumen Registered
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              
              {/* 1. KODE BIDANG / BAGIAN / UNIT FILTER */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  1. Kode Bidang / Unit / Pokja
                </label>
                <div className="relative">
                  <select
                    value={selectedDivision}
                    onChange={(e) => setSelectedDivision(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="ALL">-- SEMUA KODE BIDANG / UNIT ({sops.length}) --</option>
                    {SOEGIRI_MASTER_CATEGORIES.map((cat) => {
                      const count = sops.filter((s) => s.divisionCode === cat.code).length;
                      return (
                        <option key={cat.code} value={cat.code}>
                          {cat.code} - {cat.name} ({count} SPO)
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* 2. PENCARIAN JUDUL / NOMOR */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  2. Pencarian Judul SPO
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ketik judul SPO..."
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-2.5 py-2 text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* 3. FILTER STATUS DOKUMEN */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  3. Status Dokumen
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900 font-semibold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="Aktif">Status: Aktif</option>
                  <option value="Draft">Status: Draft</option>
                  <option value="Draft">Status: Draft</option>
                  <option value="Diarsipkan">Status: Diarsipkan</option>
                </select>
              </div>

              {/* 4. FILTER TAHUN */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  4. Tahun Terbit
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900 font-semibold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="ALL">Semua Tahun</option>
                    <option value="2026">Tahun 2026</option>
                    <option value="2025">Tahun 2025</option>
                    <option value="2024">Tahun 2024</option>
                  </select>

                  {isFilterActive && (
                    <button
                      type="button"
                      onClick={handleResetFilter}
                      className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors cursor-pointer shrink-0"
                      title="Reset Semua Filter"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* PRINTABLE DOCUMENT PAPER */}
        <div className="overflow-y-auto p-4 sm:p-8 bg-slate-50 flex-1">
          <div className="bg-white p-6 sm:p-10 rounded-xl shadow-xs border border-slate-200 max-w-4xl mx-auto space-y-6 text-slate-900 printable-paper">
            
            {/* Formal Hospital Header */}
            <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <HospitalLogo size="xl" />
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    {SOEGIRI_HOSPITAL_INFO.government}
                  </div>
                  <h1 className="text-base sm:text-lg font-extrabold uppercase tracking-wide text-slate-950 mt-0.5">
                    {SOEGIRI_HOSPITAL_INFO.hospitalName}
                  </h1>
                  <h2 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mt-1">
                    BUKU REGISTER & REKAPITULASI PENOMORAN SPO TAHUN 2026
                  </h2>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Tanggal Cetak: <strong>{currentDateStr}</strong>
                  </div>
                </div>
              </div>

              <div className="text-right text-xs font-mono shrink-0">
                <div className="font-bold text-slate-900 bg-slate-100 px-3 py-1.5 rounded border border-slate-300">
                  TOTAL: {filteredSops.length} DOKUMEN
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Sekretariat RSUD Dr. Soegiri
                </div>
              </div>
            </div>

            {/* Active Filter Scope Summary */}
            <div className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-700 flex items-center justify-between flex-wrap gap-2">
              <div>
                <strong>Scope Lingkup Register:</strong>{' '}
                <span className="font-semibold text-indigo-900">
                  {selectedDivision !== 'ALL'
                    ? `[${selectedDivision}] ${selectedCategoryObj ? selectedCategoryObj.name : selectedDivision}`
                    : 'Seluruh Bidang / Bagian / Unit / Pokja RSUD Dr. Soegiri'}
                </span>
                {selectedStatus !== 'ALL' && ` • Status: ${selectedStatus}`}
                {selectedYear !== 'ALL' && ` • Tahun: ${selectedYear}`}
                {searchQuery.trim() && ` • Kata Kunci: "${searchQuery}"`}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                Reg-Ref: RSUD-SOEGIRI-{selectedDivision !== 'ALL' ? selectedDivision : 'ALL'}-2026
              </div>
            </div>

            {/* Table of Registered SOPs */}
            <div className="border border-slate-400 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-400 font-bold text-slate-900">
                    <th className="py-2.5 px-2.5 w-8 text-center border-r border-slate-300">No</th>
                    <th className="py-2.5 px-3 border-r border-slate-300">Nomor Resmi SPO</th>
                    <th className="py-2.5 px-3 border-r border-slate-300">Judul Standar Prosedur Operasional</th>
                    <th className="py-2.5 px-3 border-r border-slate-300">Unit / Hierarki</th>
                    <th className="py-2.5 px-3 text-center border-r border-slate-300 w-14">Versi</th>
                    <th className="py-2.5 px-3 border-r border-slate-300 whitespace-nowrap">Tgl Terbit</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {filteredSops.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                        Tidak ada dokumen SPO yang sesuai dengan kriteria filter yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    filteredSops.map((sop, idx) => (
                      <tr key={sop.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-2 text-center font-mono text-slate-600 border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-950 border-r border-slate-200 whitespace-nowrap">
                          {sop.sopNumber}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900 border-r border-slate-200">
                          <div>{sop.title}</div>
                          {sop.oldSopNumber && getStandardJenisSpo(sop) === 'RIVIU' && (
                            <span className="block text-[10px] text-amber-900 font-mono mt-0.5">
                              🔄 Review SPO Lama: {sop.oldSopNumber}
                            </span>
                          )}
                          {sop.hierarchyDescription && (!sop.oldSopNumber || getStandardJenisSpo(sop) !== 'RIVIU') && (
                            <span className="block text-[10px] text-slate-500 mt-0.5">
                              {sop.hierarchyDescription}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 border-r border-slate-200 whitespace-nowrap font-medium">
                          <span className="font-extrabold text-indigo-900">{sop.divisionCode}</span>
                          {sop.subHierarchyCode ? ` / ${sop.subHierarchyCode}` : ''}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono border-r border-slate-200">
                          v{sop.revisionNumber || sop.version || '00'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 border-r border-slate-200 whitespace-nowrap">
                          {sop.effectiveDate}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {getStandardJenisSpo(sop) === 'RIVIU' ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              REVISI
                            </span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {sop.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Official Signature Blocks */}
            <div className="pt-8 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs text-center">
              <div className="flex flex-col items-center">
                <p className="text-slate-600">Mengetahui / Mengesahkan,</p>
                <p className="font-bold text-slate-900 mt-1">Direktur RSUD Dr. Soegiri Lamongan</p>
                <div className="h-16 flex items-center justify-center py-1">
                  <DirectorSignature className="h-14 w-auto max-w-[140px] object-contain" />
                </div>
                <p className="font-bold text-slate-900 underline">{SOEGIRI_HOSPITAL_INFO.director.name}</p>
                <p className="text-slate-600 text-[11px]">{SOEGIRI_HOSPITAL_INFO.director.rank}</p>
                <p className="text-slate-600 text-[11px] font-mono">NIP. {SOEGIRI_HOSPITAL_INFO.director.nip}</p>
              </div>

              <div>
                <p className="text-slate-600">Lamongan, {currentDateStr}</p>
                <p className="font-bold text-slate-900 mt-1">Petugas Pengelola Penomoran SPO</p>
                <div className="h-16 flex items-center justify-center text-slate-300 italic text-[11px]">
                  (Tanda Tangan)
                </div>
                <p className="font-bold text-slate-900 underline">Sekretariat & Tata Usaha RS</p>
                <p className="text-slate-600 text-[11px]">Tim Penomoran Tersentral SPO</p>
                <p className="text-slate-600 text-[11px] font-mono">RSUD Dr. Soegiri Lamongan</p>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
