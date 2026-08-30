import React, { useState, useEffect } from 'react';
import { 
  X, 
  Wrench, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  User, 
  Sparkles,
  Loader2
} from 'lucide-react';
import { MaintenanceMode } from '../lib/maintenanceService';

interface MaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: MaintenanceMode;
  onSave: (enabled: boolean, message: string) => Promise<void>;
}

const PRESET_MESSAGES = [
  'Sistem sedang dalam pemeliharaan rutin server dan sinkronisasi data. Silakan coba beberapa saat lagi.',
  'Sedang dilakukan pembaruan struktur master data dan hirarki penomoran SPO.',
  'Sistem sedang dalam proses pencadangan (backup) dan peningkatan keamanan berkas.',
  'Sedang dilakukan integrasi dan optimasi sistem penomoran SPO RSUD Dr. Soegiri Lamongan.'
];

export const MaintenanceModal: React.FC<MaintenanceModalProps> = ({
  isOpen,
  onClose,
  currentMode,
  onSave
}) => {
  const [enabled, setEnabled] = useState(currentMode.enabled);
  const [message, setMessage] = useState(currentMode.message);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEnabled(currentMode.enabled);
      setMessage(
        currentMode.message ||
        'Sistem sedang dalam pemeliharaan rutin. Silakan coba kembali beberapa saat lagi.'
      );
      setStatusFeedback(null);
    }
  }, [isOpen, currentMode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      setStatusFeedback(null);
      await onSave(enabled, message.trim());
      setStatusFeedback({
        type: 'success',
        text: enabled 
          ? 'Mode Pemeliharaan berhasil DIAKTIFKAN. Seluruh akses pengguna non-admin dialihkan ke layar pemeliharaan.' 
          : 'Mode Pemeliharaan berhasil DINONAKTIFKAN. Akses pengguna dibuka kembali normal.'
      });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error saving maintenance mode:', err);
      setStatusFeedback({
        type: 'error',
        text: err?.message || 'Gagal menyimpan status mode pemeliharaan ke server.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${enabled ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-300'}`}>
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Pengaturan Mode Pemeliharaan</h2>
              <p className="text-xs text-slate-400">Kontrol akses global dan pemeliharaan sistem realtime</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          
          {/* Status Feedback */}
          {statusFeedback && (
            <div className={`p-4 rounded-2xl border flex items-start gap-3 text-xs leading-relaxed ${
              statusFeedback.type === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {statusFeedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span className="font-medium">{statusFeedback.text}</span>
            </div>
          )}

          {/* Master Toggle Card */}
          <div className={`p-5 rounded-2xl border transition-all ${
            enabled 
              ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/30' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">Status Pemeliharaan Sistem</span>
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                    enabled 
                      ? 'bg-amber-500 text-white border-amber-600 shadow-sm' 
                      : 'bg-slate-200 text-slate-600 border-slate-300'
                  }`}>
                    {enabled ? 'AKTIF (ON)' : 'NONAKTIF (OFF)'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {enabled 
                    ? 'Akses untuk Petugas/Pengguna biasa sedang DITAHAN di layar pemeliharaan. Hanya Administrator yang dapat masuk.' 
                    : 'Sistem terbuka normal untuk seluruh Petugas dan Administrator.'}
                </p>
              </div>

              {/* Switch Switcher */}
              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                  enabled ? 'bg-amber-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    enabled ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Maintenance Message */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between">
              <span>Pesan Penjelasan Pemeliharaan</span>
              <span className="text-[11px] font-normal text-slate-500">Akan tampil di layar pengguna</span>
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Contoh: Sistem sedang dalam pemeliharaan rutin. Silakan coba kembali beberapa saat lagi."
              className="w-full bg-white border border-slate-300 rounded-2xl p-3.5 text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
            />
          </div>

          {/* Quick Preset Buttons */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Pilih Template Pesan Cepat:</span>
            </label>
            <div className="space-y-1.5">
              {PRESET_MESSAGES.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setMessage(preset)}
                  className="w-full text-left text-[11px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-900 transition-all text-slate-700 font-medium"
                >
                  "{preset}"
                </button>
              ))}
            </div>
          </div>

          {/* Last Updated Information */}
          {(currentMode.updatedAt || currentMode.updatedBy) && (
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Terakhir diubah: {currentMode.updatedAt ? new Date(currentMode.updatedAt).toLocaleString('id-ID') : '-'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Oleh: <strong className="text-slate-700">{currentMode.updatedBy || 'admin'}</strong></span>
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md flex items-center gap-2 ${
                enabled 
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200' 
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
              } disabled:opacity-60`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{enabled ? 'Simpan & Aktifkan Pemeliharaan' : 'Simpan & Buka Akses Normal'}</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
