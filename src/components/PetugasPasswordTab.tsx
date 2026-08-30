import React, { useState } from 'react';
import { 
  Key, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  Shield, 
  Building2,
  Check,
  RefreshCw
} from 'lucide-react';
import { UserSession, UserAccount } from '../types';
import { revokeAllUserSessions } from '../lib/authService';

interface PetugasPasswordTabProps {
  userSession: UserSession;
  onLogout: () => void;
  onUpdatePassword?: (currentPass: string, newPass: string) => Promise<{ success: boolean; message: string }>;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const PetugasPasswordTab: React.FC<PetugasPasswordTabProps> = ({
  userSession,
  onLogout,
  onUpdatePassword,
  onShowToast
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!currentPassword.trim()) {
      setErrorMessage('Silakan masukkan kata sandi Anda saat ini.');
      return;
    }

    if (!newPassword.trim() || newPassword.length < 8) {
      setErrorMessage('Kata sandi baru minimal harus 8 karakter.');
      return;
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setErrorMessage('Kata sandi baru harus mengandung huruf besar, huruf kecil, dan angka.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Konfirmasi kata sandi baru tidak cocok. Harap periksa kembali.');
      return;
    }

    if (currentPassword === newPassword) {
      setErrorMessage('Kata sandi baru tidak boleh sama dengan kata sandi saat ini.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (onUpdatePassword) {
        const res = await onUpdatePassword(currentPassword, newPassword);
        if (res.success) {
          setSuccessMessage('Kata sandi Anda berhasil diperbarui! Gunakan kata sandi baru untuk login berikutnya.');
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        } else {
          setErrorMessage(res.message || 'Gagal memperbarui kata sandi.');
        }
      } else {
        setErrorMessage('Fungsi update kata sandi tidak tersedia saat ini.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi kesalahan sistem saat memperbarui kata sandi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!window.confirm('Keluar dari semua perangkat? Sesi pada perangkat ini juga akan dihentikan.')) return;
    setIsSubmitting(true);
    try {
      const result = await revokeAllUserSessions(userSession.username);
      if (result.success) {
        onShowToast?.('success', 'Semua sesi dicabut', result.message);
        onLogout();
      } else {
        onShowToast?.('error', 'Gagal mencabut sesi', result.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      
      {/* Tab Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 sm:p-7 shadow-sm border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Pengaturan Akun & Ganti Kata Sandi
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Perbarui kata sandi akun petugas Anda secara mandiri untuk menjaga keamanan akses naskah SPO.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Profile Card */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 font-black text-lg flex items-center justify-center border border-emerald-200">
                {userSession.name.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {userSession.name}
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  @{userSession.username}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block uppercase text-[10px] tracking-wider">Peran Pengguna</span>
                <span className="inline-block mt-0.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-200">
                  Petugas Unit RSUD Soegiri
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block uppercase text-[10px] tracking-wider">Unit Kerja</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {userSession.unitName || 'Petugas Unit'}
                </p>
              </div>

              {userSession.divisionCode && (
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px] tracking-wider">Kode Klasifikasi</span>
                  <p className="font-mono font-bold text-indigo-700 mt-0.5">
                    {userSession.divisionCode}
                  </p>
                </div>
              )}
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-900 leading-relaxed">
              <div className="flex items-center gap-1.5 font-bold text-emerald-950 mb-1">
                <Shield className="w-3.5 h-3.5 text-emerald-700" />
                <span>Keamanan Akun Terproteksi</span>
              </div>
              Ganti kata sandi secara berkala untuk menjaga kerahasiaan dan integritas penomoran dokumen resmi rumah sakit.
            </div>
          </div>
        </div>

        {/* Right Column: Password Change Form */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Formulir Ganti Kata Sandi Mandiri
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Masukkan kata sandi lama Anda untuk verifikasi, kemudian buat kata sandi baru.
              </p>
            </div>

            {/* Error Message Banner */}
            {errorMessage && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5 animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold block">Gagal Memperbarui:</strong>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            {/* Success Message Banner */}
            {successMessage && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold block">Sukses:</strong>
                  <span>{successMessage}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* 1. Current Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Kata Sandi Saat Ini (Lama) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Masukkan kata sandi saat ini"
                    className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* 2. New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Kata Sandi Baru <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 4 karakter (kombinasi huruf & angka disarankan)"
                    className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {newPassword && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          newPassword.length < 6
                            ? 'w-1/3 bg-amber-500'
                            : newPassword.length < 9
                            ? 'w-2/3 bg-emerald-500'
                            : 'w-full bg-emerald-600'
                        }`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 font-semibold">
                      {newPassword.length < 6 ? 'Cukup' : newPassword.length < 9 ? 'Kuat' : 'Sangat Kuat'}
                    </span>
                  </div>
                )}
              </div>

              {/* 3. Confirm New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Ulangi Kata Sandi Baru <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi baru untuk konfirmasi"
                    className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-[11px] text-rose-600 mt-1 font-semibold">
                    ⚠️ Konfirmasi kata sandi belum cocok dengan kata sandi baru.
                  </p>
                )}
              </div>

              {/* Action Button */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menyimpan Perubahan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Simpan Perubahan Kata Sandi</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          <div className="mt-6 p-4 rounded-xl border border-rose-200 bg-rose-50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-rose-900">Sesi & Perangkat</h4>
                <p className="text-xs text-rose-800/80 mt-1">Login baru pada akun yang sama akan mencabut sesi lama. Anda juga dapat memutus semua sesi secara manual.</p>
              </div>
              <button type="button" onClick={handleRevokeAllSessions} disabled={isSubmitting} className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-rose-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Keluar Semua Perangkat</button>
            </div>
          </div>
          </div>
        </div>

      </div>

    </div>
  );
};
