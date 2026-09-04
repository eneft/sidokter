import React, { useState, useEffect } from 'react';
import {
  User,
  Lock,
  LogIn,
  Eye,
  EyeOff,
  KeyRound,
  Clock,
  ShieldAlert,
  Loader2,
  Wrench,
  CheckCircle2,
  ShieldCheck,
  FileText,
  Building2,
  Sparkles,
  ArrowRight,
  Award
} from 'lucide-react';
import { UserSession } from '../types';
import { SOEGIRI_HOSPITAL_INFO } from '../utils/soegiriStructure';
import { HospitalLogo } from './HospitalLogo';
import { authenticateUser, bootstrapDefaultUsers } from '../lib/authService';
import { initializeLocalData } from '../lib/localDataService';

interface LoginPageProps {
  onLogin: (session: UserSession) => void;
  inactivityNotice?: string | null;
  maintenanceMode?: {
    enabled: boolean;
    message: string;
  };
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLogin,
  inactivityNotice,
  maintenanceMode
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);

  // Bootstrap accounts on mount
  useEffect(() => {
    (async () => {
      try {
        await initializeLocalData();
        await bootstrapDefaultUsers();
      } catch (err) {
        console.error('Failed to bootstrap accounts:', err);
      }
    })();
  }, []);

  const performLogin = async (userToAuth: string, passToAuth: string) => {
    if (isSubmitting) return;

    setErrorMsg('');
    setIsLockedOut(false);

    const cleanUser = userToAuth.trim().toLowerCase();
    const cleanPass = passToAuth.trim();

    if (!cleanUser || !cleanPass) {
      setErrorMsg('Nama pengguna dan kata sandi wajib diisi.');
      return;
    }

    try {
      setIsSubmitting(true);
      await initializeLocalData();
      await bootstrapDefaultUsers();

      const result = await authenticateUser(cleanUser, cleanPass);

      if (result.success && result.session) {
        // Rotate the GEMES reminder only on a real successful login.
        try {
          const key = `sidokter.gemes.loginIndex.${cleanUser}`;
          const current = Number.parseInt(localStorage.getItem(key) || '0', 10);
          const next = Number.isFinite(current) ? current + 1 : 1;
          localStorage.setItem(key, String(next));
          sessionStorage.setItem('sidokter.gemes.loginIndex', String(next));
        } catch (storageError) {
          console.warn('GEMES rotation state could not be persisted:', storageError);
        }
        onLogin(result.session);
      } else {
        setErrorMsg(result.message || 'Gagal masuk ke sistem.');

        if (result.lockedOut) {
          setIsLockedOut(true);
        }
      }
    } catch (err: any) {
      console.error('Authentication error:', err);
      setErrorMsg(
        err?.message ||
          'Terjadi gangguan pada koneksi server autentikasi.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(username, password);
  };

  const handleQuickLogin = async (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    await performLogin(user, pass);
  };

  return (
    <div
      id="login-page-container"
      className="min-h-screen w-full flex flex-col lg:grid lg:grid-cols-12 bg-slate-900 text-slate-900 selection:bg-emerald-500 selection:text-white"
    >
      {/* =========================================================
          LEFT PANEL: EXECUTIVE HOSPITAL SHOWCASE (DESKTOP)
      ========================================================== */}
      <div
        id="login-showcase-panel"
        className="relative hidden lg:flex lg:col-span-7 xl:col-span-7 flex-col justify-between p-8 xl:p-12 overflow-hidden bg-slate-950 text-white"
      >
        {/* Background Image Layer */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 scale-105"
          style={{
            backgroundImage: "url('/login-background.png')",
            filter: 'brightness(0.38) contrast(1.15) saturate(1.1)'
          }}
        />

        {/* Sophisticated Dark Emerald Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-950/85 to-emerald-950/75" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-emerald-500/15 via-transparent to-transparent pointer-events-none" />

        {/* TOP BRANDING BAR */}
        <div className="relative z-10 flex items-center justify-between">
          <div id="login-showcase-logo-badge" className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 p-1 flex items-center justify-center shadow-lg shadow-black/20">
              <img
                src="/logo_soegiri_transparent.png"
                alt="Logo RSUD Dr. Soegiri"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-wider text-emerald-300 uppercase">
                {SOEGIRI_HOSPITAL_INFO.government}
              </p>
              <h2 className="text-sm font-bold text-white tracking-tight">
                {SOEGIRI_HOSPITAL_INFO.hospitalName}
              </h2>
            </div>
          </div>

          <div
            id="login-showcase-accreditation-badge"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 backdrop-blur-md text-[11px] text-emerald-200 font-medium"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <Award className="w-3.5 h-3.5 text-emerald-300" />
            <span>Akreditasi Paripurna KARS</span>
          </div>
        </div>

        {/* CENTER HERO COPY & VALUE PROPOSITIONS */}
        <div className="relative z-10 my-auto py-8 xl:py-12 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white/10 border border-white/15 backdrop-blur-md text-xs font-semibold text-emerald-300 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Portal Tata Naskah & Dokumen Resmi Terintegrasi</span>
          </div>

          <h1
            id="login-showcase-hero-heading"
            className="text-2xl xl:text-3xl font-extrabold text-white tracking-tight leading-snug mb-4 font-sans"
          >
            Tata Kelola Dokumen Standar Pelayanan & Regulasi Rumah Sakit yang Presisi
          </h1>

          <p className="text-sm text-slate-300 leading-relaxed mb-8">
            Platform sentralisasi naskah dinas RSUD Dr. Soegiri Lamongan untuk penyusunan,
            penomoran terstandar, serta pengesahan berkas resmi yang akuntabel dan transparan.
          </p>

          {/* Core Capability Cards */}
          <div id="login-showcase-features-list" className="space-y-3">
            <div
              id="login-showcase-feature-spo"
              className="flex items-start gap-3.5 p-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.10] border border-white/10 backdrop-blur-md transition-all duration-200"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0 text-emerald-300 mt-0.5">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-white mb-0.5">
                  Standar Prosedur Operasional (SPO)
                </h3>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Penyusunan format buku pedoman baku, penomoran otomatis 25 unit/instalasi,
                  serta verifikasi pengesahan resmi Direktur.
                </p>
              </div>
            </div>

            <div
              id="login-showcase-feature-sk"
              className="flex items-start gap-3.5 p-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.10] border border-white/10 backdrop-blur-md transition-all duration-200"
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0 text-indigo-300 mt-0.5">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-white mb-0.5">
                  Surat Keputusan (SK) & Nota Kesepahaman (MoU)
                </h3>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Repositori naskah hukum & kerja sama eksternal terintegrasi dengan pemantauan
                  masa kedaluwarsa dokumen aktif.
                </p>
              </div>
            </div>

            <div
              id="login-showcase-feature-security"
              className="flex items-start gap-3.5 p-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.10] border border-white/10 backdrop-blur-md transition-all duration-200"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0 text-amber-300 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-white mb-0.5">
                  Autentikasi & Keamanan Sesi Tunggal
                </h3>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Perlindungan sesi aktif tunggal berbasis enkripsi lokal tanpa kebocoran data
                  pada perangkat bersama di lingkungan rumah sakit.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM SHOWCASE FOOTER */}
        <div
          id="login-showcase-footer"
          className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400"
        >
          <span>{SOEGIRI_HOSPITAL_INFO.address}</span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Sistem Aktif & Terlindungi
          </span>
        </div>
      </div>

      {/* =========================================================
          RIGHT PANEL: AUTHENTICATION FORM (DESKTOP & MOBILE)
      ========================================================== */}
      <div
        id="login-auth-panel"
        className="flex-1 lg:col-span-5 xl:col-span-5 flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-14 bg-slate-50 relative overflow-y-auto"
      >
        {/* Subtle decorative background pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40 pointer-events-none" />

        <div className="relative z-10 w-full max-w-md mx-auto my-auto py-4">
          {/* MOBILE HEADER (Visible on screens < lg) */}
          <div id="login-mobile-header" className="text-center mb-6 lg:hidden">
            <div className="flex justify-center mb-3">
              <div className="w-16 h-16 rounded-2xl bg-white p-2 shadow-md border border-slate-200/80 flex items-center justify-center">
                <HospitalLogo size="md" />
              </div>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              SIDOKTER SOEGIRI
            </h1>
            <p className="text-xs text-emerald-700 font-bold mt-0.5">
              {SOEGIRI_HOSPITAL_INFO.shortName}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Sistem Informasi Dokumen Terpadu & Tata Naskah
            </p>
          </div>

          {/* AUTHENTICATION CARD */}
          <div
            id="login-auth-card"
            className="bg-white rounded-2xl shadow-xl shadow-slate-200/70 border border-slate-200/80 p-6 sm:p-8"
          >
            {/* Header with Title & Subtitle */}
            <div id="login-card-header" className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-600">
                  <KeyRound className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/60 px-2 py-0.5 rounded-full">
                  Portal Masuk Resmi
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Masuk ke Akun Anda
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Silakan masukkan kredensial akun terdaftar untuk mengakses tata naskah.
              </p>
            </div>

            {/* MAINTENANCE NOTICE */}
            {maintenanceMode?.enabled && (
              <div
                id="login-maintenance-notice"
                className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5 animate-fade-in"
              >
                <Wrench className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <div className="font-bold text-amber-950">
                    Mode Pemeliharaan Sistem Aktif
                  </div>
                  <div className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    {maintenanceMode.message ||
                      'Sistem sedang dalam proses pemeliharaan berkala. Akses saat ini dibatasi khusus untuk akun Administrator.'}
                  </div>
                </div>
              </div>
            )}

            {/* INACTIVITY TIMEOUT NOTICE */}
            {inactivityNotice && (
              <div
                id="login-inactivity-notice"
                className="mb-4 p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5 animate-fade-in"
              >
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="leading-snug text-[11px]">
                  {inactivityNotice}
                </span>
              </div>
            )}

            {/* ERROR ALERT */}
            {errorMsg && (
              <div
                id="login-error-notice"
                className={`mb-4 p-3.5 rounded-xl text-xs flex items-start gap-2.5 border animate-shake ${
                  isLockedOut
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {isLockedOut ? (
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-rose-200/80 text-rose-700 font-bold text-[10px] shrink-0 mt-0.5">
                    !
                  </span>
                )}
                <span className="leading-snug text-[11px] font-medium">
                  {errorMsg}
                </span>
              </div>
            )}

            {/* LOGIN FORM */}
            <form id="login-form" onSubmit={handleSubmit} className="space-y-4">
              {/* USERNAME FIELD */}
              <div>
                <label
                  htmlFor="login-username-input"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Nama Pengguna <span className="text-rose-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-600 transition-colors">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="login-username-input"
                    name="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="Contoh: admin atau pelayanan"
                    className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/15 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-all outline-none disabled:opacity-50 disabled:bg-slate-100"
                    autoFocus
                  />
                </div>
              </div>

              {/* PASSWORD FIELD */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-password-input"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Kata Sandi <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Sensitif Huruf Besar/Kecil
                  </span>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-600 transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="login-password-input"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="Masukkan kata sandi Anda"
                    className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/15 rounded-xl pl-10 pr-11 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-all outline-none disabled:opacity-50 disabled:bg-slate-100"
                  />
                  <button
                    id="login-password-toggle-btn"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                    title={showPassword ? 'Sembunyikan Kata Sandi' : 'Tampilkan Kata Sandi'}
                    aria-label={showPassword ? 'Sembunyikan Kata Sandi' : 'Tampilkan Kata Sandi'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* SUBMIT BUTTON */}
              <button
                id="login-submit-btn"
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 px-4 mt-2 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-md shadow-emerald-600/25 hover:shadow-lg hover:shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Memvalidasi Kredensial...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Masuk ke Sistem</span>
                  </>
                )}
              </button>
            </form>

            {/* QUICK ACCESS / PENGUJIAN AKUN (1-KLIK) */}
            <div id="login-quick-access-section" className="mt-6 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Akses Cepat Pengujian
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium border border-emerald-200/60">
                  1-Klik Masuk
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* ADMIN ACCOUNT BUTTON */}
                <button
                  id="login-quick-admin-btn"
                  type="button"
                  onClick={() => handleQuickLogin('admin', 'admin123')}
                  disabled={isSubmitting}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-emerald-50/80 hover:border-emerald-300 transition-all text-left group cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-900 transition-colors">
                      Akun Admin
                    </span>
                    <span className="text-[9px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                      Penuh
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight mb-1">
                    Administrator Tata Naskah
                  </p>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                    <span>admin / admin123</span>
                    <ArrowRight className="w-3 h-3 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>

                {/* USER ACCOUNT BUTTON */}
                <button
                  id="login-quick-user-btn"
                  type="button"
                  onClick={() => handleQuickLogin('pelayanan', 'pelayanan123')}
                  disabled={isSubmitting}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-indigo-50/80 hover:border-indigo-300 transition-all text-left group cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-900 transition-colors">
                      Akun User
                    </span>
                    <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                      Unit
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight mb-1">
                    Bidang / Unit Pelayanan
                  </p>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                    <span>pelayanan / ...</span>
                    <ArrowRight className="w-3 h-3 text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* FOOTER METADATA */}
          <div
            id="login-auth-footer"
            className="text-center text-[11px] text-slate-400 mt-6 space-y-1"
          >
            <p>
              © 2026 {SOEGIRI_HOSPITAL_INFO.shortName}
            </p>
            <p className="text-[10px] text-slate-400/80">
              Sistem Terproteksi Enkripsi Sesi Tunggal • Hak Cipta Dilindungi
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

