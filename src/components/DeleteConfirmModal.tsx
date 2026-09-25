import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface RelatedSopWarningItem {
  id: string;
  sopNumber?: string;
  title: string;
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  sopNumber?: string;
  title?: string;
  isArchived?: boolean;
  relatedDocuments?: RelatedSopWarningItem[];
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  sopNumber,
  title,
  isArchived = false,
  relatedDocuments = [],
  onClose,
  onConfirm
}) => {
  if (!isOpen) return null;

  const hasRelations = isArchived && relatedDocuments.length > 0;
  const visibleRelations = relatedDocuments.slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-rose-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isArchived ? 'Hapus Permanen Arsip SPO' : 'Konfirmasi Hapus SPO'}
              </h3>
              <p className="text-xs text-slate-500">
                {isArchived ? 'Tindakan khusus Administrator' : 'Hapus dokumen dari register'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Tutup konfirmasi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            {isArchived
              ? 'Anda akan menghapus permanen SPO yang sudah berstatus DIARSIPKAN dari SIDOKTER.'
              : 'Apakah Anda yakin ingin menghapus data Standar Prosedur Operasional (SPO) berikut dari daftar register?'}
          </p>

          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-1.5">
            {sopNumber && (
              <div className="text-xs font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-md border border-slate-200 inline-block">
                {sopNumber}
              </div>
            )}
            <div className="text-xs sm:text-sm font-semibold text-slate-800 line-clamp-2">
              {title}
            </div>
          </div>

          {hasRelations && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
              <p className="font-bold">
                ⚠️ SPO ini masih terkait dengan {relatedDocuments.length} dokumen lain.
              </p>
              <p className="leading-relaxed">
                Penghapusan tetap dapat dilanjutkan. Dokumen terkait tidak akan dihapus atau diubah, dan metadata referensi historisnya tetap dipertahankan.
              </p>
              <div className="space-y-1">
                {visibleRelations.map((item) => (
                  <div key={item.id} className="rounded-lg border border-amber-200/80 bg-white/70 px-2.5 py-1.5">
                    <span className="font-semibold">{item.sopNumber || item.id}</span>
                    <span className="text-amber-800"> — {item.title}</span>
                  </div>
                ))}
                {relatedDocuments.length > visibleRelations.length && (
                  <p className="font-medium">+{relatedDocuments.length - visibleRelations.length} dokumen terkait lainnya</p>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-100 leading-relaxed">
            {isArchived
              ? '⚠️ Perhatian: Arsip dan file khusus miliknya akan dihapus permanen. Nomor SPO tidak dikembalikan ke antrean nomor. Audit penghapusan tetap disimpan.'
              : '⚠️ Perhatian: Dokumen yang dihapus tidak dapat dikembalikan.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isArchived ? 'Tetap Hapus Arsip' : 'Ya, Hapus Sekarang'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};