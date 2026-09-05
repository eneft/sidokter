import React from 'react';
import { DatabaseBackup, Download, Upload, X, RotateCcw, CheckCircle2, ShieldCheck, FileSpreadsheet, Lock, Layers, BookOpen, AlertCircle } from 'lucide-react';
import { UserSession } from '../types';

interface BackupRestorePanelProps {
  isOpen?: boolean;
  onClose?: () => void;
  onBackup?: () => void;
  onRestore?: () => void;
  isRestoring?: boolean;
  restoreProgress?: string;
  userSession?: UserSession;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
  inline?: boolean;
}

export const BackupRestorePanel: React.FC<BackupRestorePanelProps> = ({
  isOpen = true,
  onClose,
  onBackup,
  onRestore,
  isRestoring = false,
  restoreProgress = '',
  inline = false,
}) => {
  if (!inline && !isOpen) return null;

  const content = (
    <div className="space-y-6">
      {/* Intro info box */}
      <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-700 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900">Integritas & Keamanan Snapshot Data</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Sistem pencadangan SIDOKTER SOEGIRI mengompilasi seluruh entitas basis data ke dalam file JSON terenkapsulasi dengan checksum versi.
            </p>
          </div>
        </div>

        {/* Breakdown of what's backed up */}
        <div className="mt-4 pt-4 border-t border-slate-200/70 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs text-slate-700">
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/80 font-medium">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Dokumen SPO & Lampiran PDF</span>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/80 font-medium">
            <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Buku Register Reservasi Nomor</span>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/80 font-medium">
            <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Dokumen SK Direktur & MOU/PKS</span>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/80 font-medium">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Akun & Salt Hash Password</span>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/80 font-medium">
            <DatabaseBackup className="w-4 h-4 text-teal-600 shrink-0" />
            <span>Format Konfigurasi Penomoran</span>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/80 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Master Hirarki Bidang & Unit</span>
          </div>
        </div>
      </div>

      {/* Main Backup / Restore Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Backup Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xs hover:border-emerald-300 transition-all flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4">
              <Download className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-900">Buat File Cadangan (Backup)</h3>
            <p className="text-xs leading-relaxed text-slate-500 mt-2">
              Unduh snapshot lengkap database ke komputer lokal dalam format file JSON bertanggal. File ini dapat disimpan di media eksternal sebagai arsip resmi RSUD Dr. Soegiri Lamongan.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onBackup}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Unduh File Backup Sekarang (.JSON)</span>
            </button>
          </div>
        </div>

        {/* Restore Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xs hover:border-blue-300 transition-all flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mb-4">
              {isRestoring ? <RotateCcw className="w-6 h-6 animate-spin text-blue-600" /> : <Upload className="w-6 h-6" />}
            </div>
            <h3 className="text-base font-black text-slate-900">Pulihkan Data (Restore)</h3>
            <p className="text-xs leading-relaxed text-slate-500 mt-2">
              Unggah file backup valid untuk memulihkan seluruh dokumen SPO, SK, MOU, buku register penomoran, dan akun ke sistem.
            </p>
            {restoreProgress && (
              <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2 text-xs font-medium text-blue-800 animate-pulse">
                <RotateCcw className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                <span>{restoreProgress}</span>
              </div>
            )}
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onRestore}
              disabled={isRestoring}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isRestoring ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  <span>Sedang Memulihkan Sistem...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Pilih File Backup untuk Restore</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Safety Notice */}
      <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold">Prosedur Keamanan Operasional:</span> Pastikan melakukan proses backup berkala sebelum melakukan perubahan besar pada struktur master unit atau nomor naskah. Pemulihan snapshot akan menyinkronkan seluruh database dengan file yang dipilih.
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs">
        <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-slate-100">
          <div className="p-3 rounded-2xl bg-teal-50 text-teal-700">
            <DatabaseBackup className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Pusat Cadangan & Pemulihan Database</h2>
            <p className="text-xs text-slate-500 mt-0.5">Kelola snapshot data SIDOKTER SOEGIRI secara aman dan terverifikasi.</p>
          </div>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs no-print" onMouseDown={onClose}>
      <div
        className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-restore-title"
      >
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center">
              <DatabaseBackup className="w-5 h-5" />
            </span>
            <div>
              <h2 id="backup-restore-title" className="text-base font-bold text-white">Backup & Restore Sistem</h2>
              <p className="text-xs text-slate-400 mt-0.5">Amankan dan pulihkan seluruh data SIDOKTER SOEGIRI.</p>
            </div>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" aria-label="Tutup">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {content}
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Otoritas: Administrator Sistem SIDOKTER SOEGIRI</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer"
            >
              Tutup
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

