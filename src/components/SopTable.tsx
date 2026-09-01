import React, { useState } from 'react';
import { 
  FileText, 
  Plus, 
  RotateCcw, 
  Eye, 
  Trash2, 
  Copy, 
  Check, 
  Calendar, 
  Building2,
  FileCheck2,
  Clock,
  FileX2,
  Sparkles,
  Edit3
} from 'lucide-react';
import { SopDocument, SopStatus, getStandardJenisSpo } from '../types';

interface SopTableProps {
  sops: SopDocument[];
  viewMode?: 'table' | 'grid';
  onSelectSop: (sop: SopDocument) => void;
  onEditSop?: (sop: SopDocument) => void;
  onDeleteSop: (id: string, title: string) => void;
  onOpenUpload: () => void;
  onResetCounters?: () => void;
}

export const SopTable: React.FC<SopTableProps> = ({
  sops,
  onSelectSop,
  onEditSop,
  onDeleteSop,
  onOpenUpload,
  onResetCounters,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, sopNumber: string, id: string) => {
    e.stopPropagation();
    if (!sopNumber) return;
    navigator.clipboard.writeText(sopNumber);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 1500);
  };

  const isReview = (sop: SopDocument) => getStandardJenisSpo(sop) === 'RIVIU';
  const revision = (sop: SopDocument) => sop.revisionNumber || sop.version || (isReview(sop) ? '01' : '00');

  const renderStatusBadge = (status: SopStatus, isReservation?: boolean) => {
    if (status === 'AKTIF') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Aktif</span>
        </span>
      );
    }
    if (status === 'DRAFT') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600" />
          <span>Draft</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
        <FileX2 className="w-3 h-3 text-slate-400" />
        <span>Diarsipkan</span>
      </span>
    );
  };

  if (!sops || sops.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center no-print shadow-xs">
        <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-xs">
          <FileText className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Tidak ada dokumen SPO ditemukan</h3>
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1.5 leading-relaxed">
          Ubah kata kunci pencarian, sesuaikan filter, atau daftarkan dokumen Standar Prosedur Operasional baru.
        </p>
        <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
          <button 
            type="button"
            onClick={onOpenUpload} 
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-200 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Daftarkan SPO Baru
          </button>
          {onResetCounters && (
            <button 
              type="button"
              onClick={onResetCounters} 
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" /> Atur Ulang Nomor
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden no-print shadow-xs">
      <div className="divide-y divide-slate-100">
        {sops.map((sop, idx) => {
          const review = isReview(sop);
          const oldNumber = sop.oldSopNumber || sop.legacySopNumber;
          const isCopied = copiedId === sop.id;

          return (
            <div
              key={`${sop.id || 'sop'}-${idx}`}
              onClick={() => onSelectSop(sop)}
              className="group px-4 sm:px-6 py-4 hover:bg-slate-50/80 transition-all duration-150 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              {/* Left Details */}
              <div className="min-w-0 flex-1 space-y-1.5">
                
                {/* Title and Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug">
                    {sop.title || 'Tanpa Judul SPO'}
                  </h3>

                  {renderStatusBadge(sop.status, sop.isNumberReservation)}

                  {review && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>Riviu</span>
                    </span>
                  )}
                </div>

                {/* SOP Number + Copy Button */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/80 border border-slate-200 text-slate-800 font-mono text-[11px] font-semibold">
                    <span>{sop.sopNumber || '-'}</span>
                    <button
                      type="button"
                      onClick={(e) => handleCopy(e, sop.sopNumber, sop.id)}
                      className="text-slate-400 hover:text-slate-700 transition-colors p-0.5 rounded-sm cursor-pointer"
                      title="Salin Nomor SOP"
                    >
                      {isCopied ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>

                  {/* Division / Unit */}
                  {(sop.divisionName || sop.categoryName) && (
                    <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      <span className="truncate max-w-[220px]">{sop.divisionName || sop.categoryName}</span>
                    </span>
                  )}

                  {/* Effective Date */}
                  {sop.effectiveDate && (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <span>•</span>
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{sop.effectiveDate}</span>
                    </span>
                  )}

                  {/* Revision */}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200">
                    Rev {revision(sop)}
                  </span>
                </div>

                {/* Old Number reference if review */}
                {review && oldNumber && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                    <span className="text-slate-400">Menggantikan nomor lama:</span>
                    <span className="font-mono text-slate-700 font-medium">{oldNumber}</span>
                  </div>
                )}
              </div>

              {/* Right Action Buttons */}
              <div 
                className="shrink-0 flex items-center gap-1.5 self-end sm:self-center" 
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onSelectSop(sop)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-slate-200 transition-all cursor-pointer shadow-2xs"
                  title="Lihat Detail SPO"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Detail</span>
                </button>

                {onEditSop && (
                  <button
                    type="button"
                    onClick={() => onEditSop(sop)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer shadow-2xs"
                    title="Edit Dokumen SPO"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Edit</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onDeleteSop(sop.id, sop.title)}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 border border-transparent transition-all cursor-pointer"
                  title="Hapus Dokumen SPO"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
};
