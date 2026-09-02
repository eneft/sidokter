import React from 'react';
import { DatabaseBackup, Download, Upload, X, RotateCcw } from 'lucide-react';

interface BackupRestorePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onBackup?: () => void;
  onRestore?: () => void;
  isRestoring?: boolean;
  restoreProgress?: string;
}

export const BackupRestorePanel: React.FC<BackupRestorePanelProps> = ({
  isOpen,
  onClose,
  onBackup,
  onRestore,
  isRestoring = false,
  restoreProgress = '',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 no-print" onMouseDown={onClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-restore-title"
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <DatabaseBackup className="w-5 h-5" />
            </span>
            <div>
              <h2 id="backup-restore-title" className="text-base font-bold text-slate-900">Backup & Restore</h2>
              <p className="text-xs text-slate-500 mt-0.5">Amankan dan pulihkan seluruh data SIDOKTER SOEGIRI.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4">
              <Download className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Backup Data</h3>
            <p className="text-xs leading-5 text-slate-500 mt-1.5">
              Unduh salinan data SPO, konfigurasi penomoran, dan data akun untuk keperluan pemulihan.
            </p>
            <button
              type="button"
              onClick={onBackup}
              className="mt-4 w-full px-3 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
            >
              Buat Backup
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-4">
              {isRestoring ? <RotateCcw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            </div>
            <h3 className="text-sm font-bold text-slate-900">Restore Data</h3>
            <p className="text-xs leading-5 text-slate-500 mt-1.5">
              Pulihkan data dari file backup SIDOKTER SOEGIRI yang sebelumnya dibuat oleh sistem.
            </p>
            <button
              type="button"
              onClick={onRestore}
              disabled={isRestoring}
              className="mt-4 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
            >
              {isRestoring ? 'Memulihkan...' : 'Pilih File Backup'}
            </button>
            {restoreProgress && (
              <p className="mt-3 text-[11px] leading-4 text-slate-500">{restoreProgress}</p>
            )}
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
          Backup dan Restore merupakan fungsi administratif dan hanya tersedia untuk Administrator.
        </div>
      </div>
    </div>
  );
};
