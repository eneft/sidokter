import React from 'react';
import { 
  Search, 
  X, 
  Wand2,
  ArrowUpDown,
  RotateCcw,
  SlidersHorizontal,
  Building2,
  Tag,
  Calendar,
  Activity
} from 'lucide-react';
import { Division, SopCategory, FilterOptions } from '../types';

interface SopFilterBarProps {
  filters: FilterOptions;
  divisions: Division[];
  categories: SopCategory[];
  availableYears: string[];
  totalResults: number;
  onFilterChange: (updates: Partial<FilterOptions>) => void;
  onResetFilters: () => void;
  isAdmin?: boolean;
  onStandardizeAll?: () => void;
}

export const SopFilterBar: React.FC<SopFilterBarProps> = ({
  filters,
  divisions,
  categories,
  availableYears,
  totalResults,
  onFilterChange,
  onResetFilters,
  isAdmin,
  onStandardizeAll,
}) => {
  const isFiltered = Boolean(
    filters.searchQuery ||
    filters.division ||
    filters.category ||
    filters.status ||
    filters.year
  );

  return (
    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3.5 no-print">
      
      {/* Top row: Search and Utilities */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        
        {/* Search Input Box */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="input-search-sop"
            type="text"
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
            placeholder="Cari berdasarkan judul, nomor SPO, atau unit penyusun..."
            className="w-full pl-10 pr-10 py-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-hidden font-medium"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onFilterChange({ searchQuery: '' })}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              title="Hapus kata kunci"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && onStandardizeAll && (
            <button
              id="btn-standardize-all"
              type="button"
              onClick={onStandardizeAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl transition-all shadow-xs cursor-pointer"
              title="Periksa dan sesuaikan nomor seluruh dokumen yang terdaftar agar seragam sesuai standar tata naskah RSUD Dr. Soegiri"
            >
              <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Standarkan Nomor</span>
            </button>
          )}

          {isFiltered && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
              title="Reset semua filter ke awal"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Filter</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Selectors Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 pt-3 border-t border-slate-100">
        
        {/* Division Filter */}
        <div>
          <label htmlFor="filter-division" className="flex items-center gap-1 text-[11px] font-bold text-slate-600 mb-1 truncate">
            <Building2 className="w-3 h-3 text-slate-400" />
            <span>Divisi</span>
          </label>
          <select
            id="filter-division"
            value={filters.division}
            onChange={(e) => onFilterChange({ division: e.target.value })}
            className="w-full py-2 px-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 rounded-xl text-xs text-slate-800 outline-hidden font-medium min-h-[38px] transition-colors"
          >
            <option value="">Semua Divisi</option>
            {(divisions || []).map((d) => (
              <option key={d.id} value={d.code}>
                {d.code} - {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div>
          <label htmlFor="filter-category" className="flex items-center gap-1 text-[11px] font-bold text-slate-600 mb-1 truncate">
            <Tag className="w-3 h-3 text-slate-400" />
            <span>Kategori</span>
          </label>
          <select
            id="filter-category"
            value={filters.category}
            onChange={(e) => onFilterChange({ category: e.target.value })}
            className="w-full py-2 px-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 rounded-xl text-xs text-slate-800 outline-hidden font-medium min-h-[38px] transition-colors"
          >
            <option value="">Semua Kategori</option>
            {(categories || []).map((c) => (
              <option key={c.id} value={c.name}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label htmlFor="filter-status" className="flex items-center gap-1 text-[11px] font-bold text-slate-600 mb-1 truncate">
            <Activity className="w-3 h-3 text-slate-400" />
            <span>Status</span>
          </label>
          <select
            id="filter-status"
            value={filters.status}
            onChange={(e) => onFilterChange({ status: e.target.value })}
            className="w-full py-2 px-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 rounded-xl text-xs text-slate-800 outline-hidden font-medium min-h-[38px] transition-colors"
          >
            <option value="">Semua Status</option>
            <option value="AKTIF">🟢 Aktif (Operasional)</option>
            <option value="MENUNGGU_PENGESAHAN">🟡 Menunggu Pengesahan</option>
            <option value="TIDAK_AKTIF">🔴 Tidak Aktif</option>
          </select>
        </div>

        {/* Year Filter */}
        <div>
          <label htmlFor="filter-year" className="flex items-center gap-1 text-[11px] font-bold text-slate-600 mb-1 truncate">
            <Calendar className="w-3 h-3 text-slate-400" />
            <span>Tahun Dokumen</span>
          </label>
          <select
            id="filter-year"
            value={filters.year}
            onChange={(e) => onFilterChange({ year: e.target.value })}
            className="w-full py-2 px-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 rounded-xl text-xs text-slate-800 outline-hidden font-medium min-h-[38px] transition-colors"
          >
            <option value="">Semua Tahun</option>
            {(availableYears || []).map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>

        {/* Sort By and Sort Order */}
        <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex items-end gap-1.5">
          <div className="flex-1 min-w-0">
            <label htmlFor="filter-sort" className="flex items-center gap-1 text-[11px] font-bold text-slate-600 mb-1 truncate">
              <SlidersHorizontal className="w-3 h-3 text-slate-400" />
              <span>Urutkan</span>
            </label>
            <select
              id="filter-sort"
              value={filters.sortBy}
              onChange={(e) => onFilterChange({ sortBy: e.target.value as any })}
              className="w-full py-2 px-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 rounded-xl text-xs text-slate-800 outline-hidden font-medium min-h-[38px] transition-colors"
            >
              <option value="sopNumber">Nomor Urut SPO</option>
              <option value="title">Judul Dokumen</option>
              <option value="effectiveDate">Tanggal Berlaku</option>
              <option value="createdAt">Waktu Didaftarkan</option>
              <option value="updatedAt">Waktu Pembaruan</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => onFilterChange({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-200 rounded-xl text-slate-700 text-xs font-semibold cursor-pointer shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center transition-colors"
            title={`Urutan: ${filters.sortOrder === 'asc' ? 'Menaik (A-Z / 1-9)' : 'Menurun (Z-A / 9-1)'}`}
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* Filter Chips & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-500 border-t border-slate-100">
        <div className="flex flex-wrap items-center gap-1.5">
          <span>Menampilkan <strong className="font-bold text-slate-900">{totalResults}</strong> dokumen</span>
          
          {filters.status && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              Status: {filters.status === 'AKTIF' ? 'Aktif' : filters.status === 'MENUNGGU_PENGESAHAN' ? 'Menunggu TTD' : 'Tidak Aktif'}
              <button type="button" onClick={() => onFilterChange({ status: '' })} className="hover:text-emerald-950 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.division && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
              Divisi: {filters.division}
              <button type="button" onClick={() => onFilterChange({ division: '' })} className="hover:text-slate-950 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.category && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
              Kategori: {filters.category}
              <button type="button" onClick={() => onFilterChange({ category: '' })} className="hover:text-slate-950 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.year && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
              Tahun: {filters.year}
              <button type="button" onClick={() => onFilterChange({ year: '' })} className="hover:text-slate-950 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>

        {isFiltered && (
          <button
            type="button"
            onClick={onResetFilters}
            className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
          >
            Bersihkan Semua Filter
          </button>
        )}
      </div>

    </div>
  );
};
