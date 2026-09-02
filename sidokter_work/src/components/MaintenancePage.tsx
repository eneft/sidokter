import React, { useState } from 'react';
import { 
  Wrench, 
  RefreshCw, 
  ShieldCheck, 
  LogOut, 
  Hospital, 
  AlertCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { HospitalLogo } from './HospitalLogo';
import { SOEGIRI_HOSPITAL_INFO } from '../utils/soegiriStructure';

interface MaintenancePageProps {
  message?: string;
  isAdmin?: boolean;
  onBackToAdmin?: () => void;
  onLogout?: () => void;
}

export const MaintenancePage: React.FC<MaintenancePageProps> = ({
  message,
  isAdmin = false,
  onBackToAdmin,
  onLogout,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-900/95 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(245,158,11,0.15),transparent_70%)] pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-amber-300 to-amber-600" />

      <div className="relative z-10 w-full max-w-lg">
        
        {/* Hospital Branding Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-3">
            <HospitalLogo size="xl" />
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            SIDOKTER SOEGIRI
          </h2>
          <p className="text-xs text-emerald-400 font-semibold mt-0.5">
            {SOEGIRI_HOSPITAL_INFO.hospitalName} • Sistem Dokumen Terpadu (SPO, SK, MOU, Library)
          </p>
        </div>

        {/* Maintenance Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-950/50 p-6 sm:p-8 text-center">
          
          <div className="mx-auto w-20 h-20 rounded-3xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shadow-inner relative">
            <Wrench className="w-10 h-10 animate-bounce duration-1000" />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full border-2 border-white animate-ping" />
          </div>

          <div className="mt-5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/80 border border-amber-300 text-amber-800 text-xs font-extrabold tracking-wide uppercase">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Mode Pemeliharaan Aktif</span>
          </div>

          <h1 className="mt-3 text-2xl font-black text-slate-900 tracking-tight">
            Sistem Sedang Dalam Pemeliharaan
          </h1>

          <div className="mt-4 p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs sm:text-sm text-slate-700 leading-relaxed text-left">
            <p className="font-medium text-amber-950 mb-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Informasi Administrator:</span>
            </p>
            <p className="text-slate-800">
              {message || 'Sistem sedang dalam proses pemeliharaan rutin server dan sinkronisasi data. Akses untuk Petugas/Pengguna biasa ditangguhkan sementara.'}
            </p>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200/60 rounded-xl py-2 px-3">
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Perubahan status akan diperbarui otomatis secara real-time.</span>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Cek Status Sekarang</span>
            </button>

            {isAdmin && onBackToAdmin && (
              <button
                type="button"
                onClick={onBackToAdmin}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-md shadow-emerald-200 transition-all"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Panel Administrator</span>
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-xs font-semibold transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar / Ganti Akun</span>
              </button>
            )}

          </div>

        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-slate-400 mt-6">
          © 2026 RSUD Dr. Soegiri Lamongan • Bagian Umum & Kepegawaian
        </div>

      </div>
    </div>
  );
};
