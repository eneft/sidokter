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
  Sparkles
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
      className="
        min-h-screen
        flex flex-col
        justify-center items-center
        px-4 py-5
        sm:px-6
        relative overflow-hidden
        bg-slate-50
        bg-cover bg-center bg-no-repeat
      "
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.10), rgba(255,255,255,0.10)), url('/login-background.png')"
      }}
    >
      {/* Background overlay */}
      <div className="absolute inset-0 bg-white/5 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">

        {/* =====================================================
            BRANDING
        ====================================================== */}
        <div className="text-center mb-4">

          <div className="flex items-center justify-center mb-2">
            <HospitalLogo size="lg" />
          </div>

          <h1
            className="
              text-xl
              sm:text-2xl
              font-black
              text-slate-900
              tracking-tight
              leading-tight
            "
          >
            SIDOKTER SOEGIRI
          </h1>

          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
            Sistem Informasi & Manajemen Dokumen Terpadu
          </p>

          <p className="text-base text-emerald-700 font-bold mt-0.5">
            {SOEGIRI_HOSPITAL_INFO.hospitalName}
          </p>

        </div>

        {/* =====================================================
            LOGIN CARD
        ====================================================== */}
        <div
          className="
            bg-white/95
            backdrop-blur-xl
            border border-white/80
            rounded-2xl
            shadow-xl
            shadow-slate-300/40
            px-5 py-5
            sm:px-6 sm:py-6
          "
        >

          {/* Card Header */}
          <div
            className="
              flex items-center
              gap-2.5
              mb-4
              pb-3
              border-b
              border-slate-200
            "
          >

            <div
              className="
                flex items-center
                justify-center
                w-8 h-8
                rounded-lg
                bg-emerald-50
              "
            >
              <KeyRound className="w-4 h-4 text-emerald-600" />
            </div>

            <div className="min-w-0">

              <h2 className="text-sm font-bold text-slate-900">
                Masuk ke Akun Anda
              </h2>

              <p className="text-[10px] text-slate-500">
                Local Authentication • Single Active Session
              </p>

            </div>

          </div>

          {/* =====================================================
              MAINTENANCE NOTICE
          ====================================================== */}
          {maintenanceMode?.enabled && (
            <div
              className="
                mb-3
                p-3
                bg-amber-50
                border border-amber-200
                rounded-xl
                text-amber-900
                text-xs
                flex items-start
                gap-2
                animate-fade-in
              "
            >

              <Wrench
                className="
                  w-4 h-4
                  text-amber-600
                  shrink-0
                  mt-0.5
                "
              />

              <div className="leading-snug">

                <div className="font-bold">
                  Mode Pemeliharaan Aktif
                </div>

                <div
                  className="
                    text-[10px]
                    text-slate-600
                    mt-0.5
                    leading-relaxed
                  "
                >
                  {maintenanceMode.message ||
                    'Sistem sedang dalam proses pemeliharaan. Akses dibatasi khusus untuk akun Administrator.'}
                </div>

              </div>

            </div>
          )}

          {/* =====================================================
              INACTIVITY NOTICE
          ====================================================== */}
          {inactivityNotice && (
            <div
              className="
                mb-3
                p-3
                bg-amber-50
                border border-amber-200
                rounded-xl
                text-amber-800
                text-xs
                flex items-start
                gap-2
                animate-fade-in
              "
            >

              <Clock
                className="
                  w-4 h-4
                  text-amber-600
                  shrink-0
                  mt-0.5
                "
              />

              <span className="leading-snug">
                {inactivityNotice}
              </span>

            </div>
          )}

          {/* =====================================================
              ERROR MESSAGE
          ====================================================== */}
          {errorMsg && (
            <div
              className={`
                mb-3
                p-3
                rounded-xl
                text-xs
                flex items-start
                gap-2
                border
                ${
                  isLockedOut
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }
              `}
            >

              {isLockedOut ? (
                <ShieldAlert
                  className="
                    w-4 h-4
                    text-rose-600
                    shrink-0
                    mt-0.5
                  "
                />
              ) : (
                <span
                  className="
                    flex items-center
                    justify-center
                    w-4 h-4
                    rounded-full
                    bg-rose-100
                    text-rose-600
                    font-bold
                    text-[10px]
                    shrink-0
                  "
                >
                  !
                </span>
              )}

              <span className="leading-snug">
                {errorMsg}
              </span>

            </div>
          )}

          {/* =====================================================
              LOGIN FORM
          ====================================================== */}
          <form
            onSubmit={handleSubmit}
            className="space-y-3.5"
          >

            {/* USERNAME */}
            <div>

              <label
                className="
                  block
                  text-[11px]
                  font-semibold
                  text-slate-700
                  mb-1
                "
              >
                Nama Pengguna
              </label>

              <div className="relative">

                <User
                  className="
                    w-4 h-4
                    text-slate-400
                    absolute
                    left-3
                    top-1/2
                    -translate-y-1/2
                  "
                />

                <input
                  type="text"
                  value={username}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setUsername(e.target.value);

                    if (errorMsg) {
                      setErrorMsg('');
                    }
                  }}
                  placeholder="Masukkan nama pengguna"
                  className="
                    w-full
                    bg-white
                    border border-slate-300
                    rounded-lg
                    pl-9 pr-3
                    py-2.5
                    text-sm
                    text-slate-900
                    placeholder-slate-400
                    focus:outline-none
                    focus:ring-2
                    focus:ring-emerald-500
                    focus:border-emerald-500
                    transition-all
                    disabled:opacity-50
                  "
                  autoFocus
                />

              </div>

            </div>

            {/* PASSWORD */}
            <div>

              <label
                className="
                  block
                  text-[11px]
                  font-semibold
                  text-slate-700
                  mb-1
                "
              >
                Kata Sandi
              </label>

              <div className="relative">

                <Lock
                  className="
                    w-4 h-4
                    text-slate-400
                    absolute
                    left-3
                    top-1/2
                    -translate-y-1/2
                  "
                />

                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setPassword(e.target.value);

                    if (errorMsg) {
                      setErrorMsg('');
                    }
                  }}
                  placeholder="Masukkan kata sandi"
                  className="
                    w-full
                    bg-white
                    border border-slate-300
                    rounded-lg
                    pl-9 pr-10
                    py-2.5
                    text-sm
                    text-slate-900
                    placeholder-slate-400
                    focus:outline-none
                    focus:ring-2
                    focus:ring-emerald-500
                    focus:border-emerald-500
                    transition-all
                    disabled:opacity-50
                  "
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                  className="
                    absolute
                    right-2.5
                    top-1/2
                    -translate-y-1/2
                    text-slate-400
                    hover:text-slate-700
                    p-1
                    cursor-pointer
                  "
                  title={
                    showPassword
                      ? 'Sembunyikan Kata Sandi'
                      : 'Tampilkan Kata Sandi'
                  }
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>

              </div>

            </div>

            {/* LOGIN BUTTON */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="
                w-full
                py-2.5
                px-4
                rounded-lg
                font-bold
                text-sm
                text-white
                bg-emerald-600
                hover:bg-emerald-700
                active:bg-emerald-800
                transition-all
                shadow-sm
                shadow-emerald-200
                flex items-center
                justify-center
                gap-2
                cursor-pointer
                mt-1
                disabled:opacity-60
                disabled:cursor-not-allowed
              "
            >

              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    Memvalidasi Keamanan...
                  </span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>
                    Masuk Sekarang
                  </span>
                </>
              )}

            </button>

          </form>

          {/* =====================================================
              QUICK ACCOUNT TEST
          ====================================================== */}
          <div
            className="
              mt-4
              pt-3
              border-t
              border-slate-100
            "
          >

            <div
              className="
                text-[10px]
                font-bold
                text-slate-400
                mb-1.5
                text-center
              "
            >
              Akses Cepat Pengujian
            </div>

            <div className="grid grid-cols-2 gap-2">

              {/* ADMIN */}
              <button
                type="button"
                onClick={() => handleQuickLogin('admin', 'admin123')}
                disabled={isSubmitting}
                className="
                  px-2.5
                  py-1.5
                  rounded-lg
                  border border-slate-200
                  bg-slate-50
                  hover:bg-emerald-50
                  hover:border-emerald-300
                  text-left
                  transition-colors
                  cursor-pointer
                  disabled:opacity-50
                "
              >
                <div
                  className="
                    text-[10px]
                    font-black
                    text-slate-700
                    flex items-center justify-between
                  "
                >
                  <span>Akun Admin</span>
                  <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-bold">1-Klik</span>
                </div>

                <div
                  className="
                    text-[9px]
                    text-slate-400
                    font-mono
                  "
                >
                  admin / admin123
                </div>
              </button>

              {/* PETUGAS */}
              <button
                type="button"
                onClick={() => handleQuickLogin('pelayanan', 'pelayanan123')}
                disabled={isSubmitting}
                className="
                  px-2.5
                  py-1.5
                  rounded-lg
                  border border-slate-200
                  bg-slate-50
                  hover:bg-indigo-50
                  hover:border-indigo-300
                  text-left
                  transition-colors
                  cursor-pointer
                  disabled:opacity-50
                "
              >
                <div
                  className="
                    text-[10px]
                    font-black
                    text-slate-700
                    flex items-center justify-between
                  "
                >
                  <span>Akun Petugas</span>
                  <span className="text-[8px] bg-indigo-100 text-indigo-800 px-1 py-0.2 rounded font-bold">1-Klik</span>
                </div>

                <div
                  className="
                    text-[9px]
                    text-slate-400
                    font-mono
                  "
                >
                  pelayanan / pelayanan123
                </div>
              </button>

            </div>

          </div>

        </div>

        {/* =====================================================
            FOOTER
        ====================================================== */}
        <div
          className="
            text-center
            text-[10px]
            text-slate-400
            mt-3
          "
        >
          © 2026 RSUD Dr. Soegiri Lamongan
          <span className="mx-1">•</span>
          Bagian Umum dan Kepegawaian
        </div>

      </div>
    </div>
  );
};
