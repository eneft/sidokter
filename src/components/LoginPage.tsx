import React, { useState } from 'react';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ShieldAlert,
  Clock,
  Loader2,
  KeyRound,
  Wrench,
  ShieldCheck,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { UserSession } from '../types';
import { authenticateUser, provisionInitialAdmin } from '../lib/authService';

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
  maintenanceMode,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [showAdminSetup, setShowAdminSetup] = useState(false);
  const [setupSecret, setSetupSecret] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupPassword2, setSetupPassword2] = useState('');
  const [setupMessage, setSetupMessage] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);

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
      const result = await authenticateUser(cleanUser, cleanPass);

      if (result.success && result.session) {
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
        if (result.lockedOut) setIsLockedOut(true);
      }
    } catch (err: any) {
      console.error('Authentication error:', err);
      setErrorMsg(err?.message || 'Terjadi gangguan pada koneksi server autentikasi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(username, password);
  };

  const handleInitialAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupMessage('');
    if (!setupSecret.trim()) {
      setSetupMessage('Setup key server wajib diisi.');
      return;
    }
    if (setupPassword !== setupPassword2) {
      setSetupMessage('Konfirmasi password tidak sama.');
      return;
    }
    if (
      setupPassword.length < 8 ||
      !/[A-Z]/.test(setupPassword) ||
      !/[a-z]/.test(setupPassword) ||
      !/[0-9]/.test(setupPassword)
    ) {
      setSetupMessage('Password Admin minimal 8 karakter dan wajib mengandung huruf besar, huruf kecil, serta angka.');
      return;
    }
    setSetupBusy(true);
    const result = await provisionInitialAdmin(setupSecret.trim(), setupPassword);
    setSetupBusy(false);
    if (result.success) {
      setShowAdminSetup(false);
      setSetupSecret('');
      setSetupPassword('');
      setSetupPassword2('');
      setUsername('admin');
      setPassword('');
      setErrorMsg('');
      setSetupMessage('Admin berhasil dibuat. Silakan login dengan password yang baru Anda buat.');
    } else {
      setSetupMessage(result.message || 'Provisioning Admin gagal.');
    }
  };

  const featureItems = [
    ['Tata Kelola Dokumen', 'Lebih terstruktur'],
    ['Transparan & Akuntabel', 'Pengendalian dokumen'],
    ['Kolaborasi Unit Kerja', 'Terintegrasi'],
  ];

  return (
    <main
      id="login-page-container"
      className="relative h-[100dvh] min-h-0 w-full overflow-hidden bg-white text-slate-900 selection:bg-teal-600 selection:text-white"
    >
      {/* The supplied RSUD sketch is the actual page background on every breakpoint. */}
      <img
        src="/login-background.png"
        alt=""
        aria-hidden="true"
        className="login-background-image pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* Very subtle background treatment: the supplied sketch remains visible but never competes with the login form. */}
      <div className="pointer-events-none absolute inset-0 bg-white/10" />

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-col px-3 py-3 sm:px-5 sm:py-4 lg:px-10 lg:py-5 xl:px-12">
        {/* MAIN — responsive login stage: branding, card, and footer move as one group */}
        <div className="flex min-h-0 flex-1 items-center py-2 sm:py-3 lg:py-2">
          <header id="login-institution-header" className="login-brand-header flex shrink-0 items-center justify-center">
            <img
              src="/sidokter-login-brand.png"
              alt="SIDOKTER — Sistem Dokumen Terpadu — RSUD Dr. Soegiri"
              className="login-brand-header-image"
            />
          </header>
          <div className="grid w-full min-h-0 items-center gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,370px)] lg:gap-8 xl:gap-10">
            {/* BRANDING */}
            <section id="login-brand-panel" className="order-2 max-w-3xl lg:order-1 lg:pb-0">
              <div className="max-w-2xl rounded-[24px] border border-white/55 bg-white/35 p-4 shadow-[0_20px_60px_-45px_rgba(15,23,42,.25)] sm:p-5 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#1b486f] sm:text-xs">
                  SISTEM DOKUMEN TERPADU
                </p>
                <h1
                  id="login-brand-title"
                  className="mt-1 text-[2.8rem] font-black leading-[.88] tracking-[-0.065em] text-[#173b65] sm:text-[3.8rem] md:text-[4.2rem] lg:text-[4.5rem] xl:text-[5.1rem]"
                >
                  SID<span className="text-[#07977d]">OKTER</span>
                </h1>
                <div className="mt-3 flex items-center gap-3 sm:mt-4">
                  <span className="h-1 w-16 rounded-full bg-[#07977d] sm:w-20" />
                  <span className="text-xs font-bold uppercase tracking-[0.24em] text-[#173b65] sm:text-sm">
                    SOEGIRI
                  </span>
                </div>
                <p className="mt-2 max-w-xl text-xs font-medium leading-5 text-[#274967] sm:text-sm sm:leading-6 lg:text-base">
                  Tata naskah dan dokumen resmi RSUD Dr. Soegiri Lamongan dalam satu sistem yang tertib, aman, dan terintegrasi.
                </p>
                <div className="mt-2 flex items-center gap-3 sm:mt-3">
                  <span className="text-lg font-semibold italic tracking-[-0.04em] text-[#173b65] sm:text-xl">
                    Soegiri Semakin Baik
                  </span>
                  <span className="hidden h-0.5 w-20 bg-[#07977d] sm:block" />
                </div>

                <div className="mt-3 hidden max-w-2xl gap-2 sm:mt-4 sm:grid-cols-3 sm:gap-3 md:grid">
                  {featureItems.map(([title, subtitle]) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-white/70 bg-white/75 px-3 py-2.5 shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e8f5f2] text-[#087f70]">
                          <FileText className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-extrabold text-[#173b65]">{title}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* LOGIN CARD */}
            <section id="login-auth-panel" className="order-1 flex min-h-0 w-full justify-center lg:order-2 lg:justify-end">
              <div className="w-full max-w-[360px] sm:max-w-[370px]">
                <div
                  id="login-auth-card"
                  className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_20px_55px_-30px_rgba(15,43,69,.32)] sm:rounded-[22px] sm:p-5"
                >
                  <div id="login-card-header" className="mb-3">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9f6f3] text-[#087f70] ring-1 ring-[#cdebe4]">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <h2 className="text-[1.35rem] font-extrabold tracking-[-0.03em] text-[#173b65] sm:text-[1.45rem]">
                      Masuk ke SIDOKTER
                    </h2>
                    <p className="mt-1 text-[11px] leading-4.5 text-slate-500 sm:text-xs">
                      Gunakan akun terdaftar untuk mengakses Sistem Dokumen Terpadu Soegiri.
                    </p>
                  </div>

                  {maintenanceMode?.enabled && (
                    <div id="login-maintenance-notice" className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                      <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="text-xs leading-5">
                        <div className="font-bold">Pemeliharaan Sistem</div>
                        <div className="text-amber-800">{maintenanceMode.message || 'Akses sedang dibatasi untuk proses pemeliharaan.'}</div>
                      </div>
                    </div>
                  )}

                  {inactivityNotice && (
                    <div id="login-inactivity-notice" className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <span>{inactivityNotice}</span>
                    </div>
                  )}

                  {errorMsg && (
                    <div id="login-error-notice" className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 text-xs leading-5 ${isLockedOut ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                      <span className="font-medium">{errorMsg}</span>
                    </div>
                  )}

                  {showAdminSetup && (
                    <form id="initial-admin-setup-form" onSubmit={handleInitialAdminSetup} className="mb-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div>
                        <div className="text-sm font-bold text-slate-900">Setup Administrator</div>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">Gunakan setup key server yang diberikan administrator infrastruktur. Key tidak disimpan di halaman login.</p>
                      </div>
                      <input type="password" autoComplete="off" value={setupSecret} onChange={e => setSetupSecret(e.target.value)} placeholder="Setup key server" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#07977d] focus:ring-4 focus:ring-[#07977d]/10" disabled={setupBusy} />
                      <input type="password" autoComplete="new-password" value={setupPassword} onChange={e => setSetupPassword(e.target.value)} placeholder="Password Admin baru" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#07977d] focus:ring-4 focus:ring-[#07977d]/10" disabled={setupBusy} />
                      <input type="password" autoComplete="new-password" value={setupPassword2} onChange={e => setSetupPassword2(e.target.value)} placeholder="Ulangi password Admin" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#07977d] focus:ring-4 focus:ring-[#07977d]/10" disabled={setupBusy} />
                      {setupMessage && <div className="rounded-xl border border-slate-200 bg-white p-3 text-[11px] font-medium text-slate-700">{setupMessage}</div>}
                      <div className="flex gap-2 pt-1">
                        <button type="submit" disabled={setupBusy} className="flex-1 rounded-xl bg-[#087f70] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#066d60] disabled:opacity-60">
                          {setupBusy ? 'Memproses...' : 'Simpan Administrator'}
                        </button>
                        <button type="button" onClick={() => { setShowAdminSetup(false); setSetupMessage(''); }} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Batal</button>
                      </div>
                    </form>
                  )}

                  <form id="login-form" onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <label htmlFor="login-username-input" className="mb-1.5 block text-[11px] font-bold text-slate-700">
                        Nama Pengguna <span className="text-rose-500">*</span>
                      </label>
                      <div className="group relative">
                        <User className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition group-focus-within:text-[#087f70]" />
                        <input
                          id="login-username-input"
                          name="username"
                          type="text"
                          autoComplete="username"
                          autoFocus
                          value={username}
                          disabled={isSubmitting}
                          onChange={e => { setUsername(e.target.value); if (errorMsg) setErrorMsg(''); }}
                          placeholder="Masukkan nama pengguna"
                          className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-[#087f70] focus:bg-white focus:ring-4 focus:ring-[#087f70]/10 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <label htmlFor="login-password-input" className="text-[11px] font-bold text-slate-700">
                          Kata Sandi <span className="text-rose-500">*</span>
                        </label>
                        <span className="text-[10px] font-medium text-slate-400">Peka huruf besar/kecil</span>
                      </div>
                      <div className="group relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition group-focus-within:text-[#087f70]" />
                        <input
                          id="login-password-input"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          value={password}
                          disabled={isSubmitting}
                          onChange={e => { setPassword(e.target.value); if (errorMsg) setErrorMsg(''); }}
                          placeholder="Masukkan kata sandi"
                          className="h-11 w-full rounded-2xl border border-slate-300 bg-slate-50 pl-11 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-[#087f70] focus:bg-white focus:ring-4 focus:ring-[#087f70]/10 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <button
                          id="login-password-toggle-btn"
                          type="button"
                          onClick={() => setShowPassword(value => !value)}
                          disabled={isSubmitting}
                          className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-slate-400 transition hover:text-slate-700 disabled:opacity-50"
                          title={showPassword ? 'Sembunyikan Kata Sandi' : 'Tampilkan Kata Sandi'}
                          aria-label={showPassword ? 'Sembunyikan Kata Sandi' : 'Tampilkan Kata Sandi'}
                        >
                          {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                        </button>
                      </div>
                    </div>

                    <button
                      id="login-submit-btn"
                      type="submit"
                      disabled={isSubmitting}
                      className="group flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#173b65] px-4 text-sm font-extrabold text-white shadow-lg shadow-[#173b65]/15 transition hover:bg-[#123253] hover:shadow-xl active:bg-[#0e2841] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting ? (
                        <><Loader2 className="h-[18px] w-[18px] animate-spin" /><span>Memvalidasi...</span></>
                      ) : (
                        <><span>Masuk</span><ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5" /></>
                      )}
                    </button>
                  </form>

                  <div className="mt-4 flex items-center gap-2.5 border-t border-slate-100 pt-3">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-[#087f70]" />
                    <p className="text-[11px] leading-5 text-slate-500">
                      Akses hanya untuk pengguna terdaftar. Jaga kerahasiaan akun dan password Anda.
                    </p>
                  </div>

                  {/* Admin setup is not displayed on the public login surface.
                      The existing authentication foundation remains unchanged. */}
                </div>

                <footer id="login-auth-footer" className="mt-3 text-center">
                  <p className="whitespace-nowrap text-[10px] font-semibold text-slate-500">© 2026 RSUD Dr. Soegiri Lamongan | Bagian Umum dan Kepegawaian</p>
                </footer>
              </div>
            </section>
          </div>
        </div>

        {/* Small-screen footer marker */}
        <div className="hidden">
          <ShieldCheck className="h-3.5 w-3.5 text-[#087f70]" />
          Sistem resmi RSUD Dr. Soegiri Lamongan
        </div>
      </div>
    </main>
  );
};
