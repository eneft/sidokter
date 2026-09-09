import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Lock,
  LogIn,
  Eye,
  EyeOff,
  ShieldAlert,
  Clock,
  Loader2,
  Wrench,
  ShieldCheck,
  HelpCircle,
  X,
  PhoneCall,
  AlertTriangle,
  AlertCircle
} from 'lucide-react';
import { UserSession } from '../types';
import { SOEGIRI_HOSPITAL_INFO } from '../utils/soegiriStructure';
import { authenticateUser } from '../lib/authService';

interface LoginPageProps {
  onLogin: (session: UserSession) => void;
  inactivityNotice?: string | null;
  maintenanceMode?: {
    enabled: boolean;
    message: string;
  };
}

const REMEMBER_PREF_KEY = 'sidokter_remember_username_pref';
const SAVED_USERNAME_KEY = 'sidokter_saved_username';

export const LoginPage: React.FC<LoginPageProps> = ({
  onLogin,
  inactivityNotice,
  maintenanceMode
}) => {
  const [rememberUsername, setRememberUsername] = useState<boolean>(() => {
    try {
      return localStorage.getItem(REMEMBER_PREF_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [username, setUsername] = useState<string>(() => {
    try {
      const isRemembered = localStorage.getItem(REMEMBER_PREF_KEY) === 'true';
      return isRemembered ? (localStorage.getItem(SAVED_USERNAME_KEY) || '') : '';
    } catch {
      return '';
    }
  });

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutSecondsRemaining, setLockoutSecondsRemaining] = useState<number | null>(null);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Countdown timer for lockout duration
  useEffect(() => {
    if (lockoutSecondsRemaining === null || lockoutSecondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setLockoutSecondsRemaining(prev => {
        if (prev === null || prev <= 1) {
          setIsLockedOut(false);
          setErrorMsg('');
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutSecondsRemaining]);

  const formatLockoutTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handlePasswordKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  };

  const handleUsernameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (username.trim() && !password.trim()) {
        e.preventDefault();
        passwordInputRef.current?.focus();
      }
    }
  };

  const performLogin = async (userToAuth: string, passToAuth: string) => {
    if (isSubmitting || isLockedOut) return;

    setErrorMsg('');

    const cleanUser = userToAuth.trim().toLowerCase();
    const cleanPass = passToAuth.trim();

    if (!cleanUser || !cleanPass) {
      setErrorMsg('Nama pengguna dan kata sandi wajib diisi.');
      if (!cleanUser) {
        usernameInputRef.current?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await authenticateUser(cleanUser, cleanPass);

      if (result.success && result.session) {
        // Save or remove remembered username
        try {
          if (rememberUsername) {
            localStorage.setItem(SAVED_USERNAME_KEY, cleanUser);
            localStorage.setItem(REMEMBER_PREF_KEY, 'true');
          } else {
            localStorage.removeItem(SAVED_USERNAME_KEY);
            localStorage.removeItem(REMEMBER_PREF_KEY);
          }
        } catch (storageErr) {
          console.warn('Unable to persist username preference:', storageErr);
        }

        // Rotate the GEMES reminder index on valid login
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
          const minutes = Number.isFinite(result.remainingMinutes) && (result.remainingMinutes as number) > 0
            ? (result.remainingMinutes as number)
            : 15;
          setLockoutSecondsRemaining(minutes * 60);
        }
      }
    } catch (err: any) {
      console.error('Authentication error:', err);
      setErrorMsg(
        err?.message ||
          'Terjadi gangguan pada koneksi server autentikasi. Silakan periksa jaringan Anda.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(username, password);
  };

  const hasNoticeOrHelp = Boolean(
    maintenanceMode?.enabled || inactivityNotice || errorMsg || showHelpModal
  );

  return (
    <div id="login-page-container" className="login-page-shell">
      {/* Subtle modern background gradient without noisy watermark */}
      <div className="login-page-bg-canvas" aria-hidden="true" />

      <main id="login-main-content" className="login-main-content">
        {/* Unified 2-Column Desktop Card / Mobile Stacked Card */}
        <div id="login-auth-card" className={`login-auth-card ${hasNoticeOrHelp ? 'has-notice' : ''} ${isSubmitting ? 'is-submitting' : ''}`}>
          
          {/* Top Indeterminate Loading Bar (Seamless on submitting) */}
          {isSubmitting && (
            <div
              id="login-card-progress"
              className="login-card-progress"
              role="progressbar"
              aria-label="Memvalidasi sesi masuk"
              aria-busy="true"
            >
              <div className="login-card-progress-bar" />
            </div>
          )}

          {/* LEFT COLUMN: SIDOKTER Branding & Visual RSUD Dr. Soegiri */}
          <aside className="login-brand-panel" aria-label="Informasi Sistem SIDOKTER">
            {/* Ambient toska radial glow */}
            <div className="login-brand-ambient-glow" aria-hidden="true" />

            <div className="login-brand-content">
              {/* Top Institution Lockup */}
              <div className="login-brand-institution">
                <div className="login-brand-logo-wrap">
                  <img
                    src="/logo_soegiri_transparent.png"
                    alt="Logo RSUD Dr. Soegiri Lamongan"
                    className="login-brand-rsud-logo"
                  />
                </div>
                <div className="login-brand-gov-info">
                  <span className="login-brand-gov-badge">PEMERINTAH KABUPATEN LAMONGAN</span>
                  <span className="login-brand-hospital-name">RSUD Dr. SOEGIRI</span>
                </div>
              </div>

              {/* Main App Title */}
              <div className="login-brand-hero">
                <div className="login-brand-title" aria-label="SIDOKTER">
                  <span className="login-brand-title-light">SIDO</span>
                  <span className="login-brand-title-accent">KTER</span>
                </div>
                <h1 className="login-brand-system-name">
                  Sistem Dokumen Terpadu RSUD Dr. Soegiri Lamongan
                </h1>
                <p className="login-brand-desc">
                  Platform resmi RSUD Dr. Soegiri Lamongan yang menghadirkan digitalisasi tata kelola dokumen melalui sistem yang terstandar, aman, dan terintegrasi. 
                </p>
              </div>

              {/* Feature Pills / Trust Pillars */}
              <div className="login-brand-features" aria-label="Fitur Utama Sistem">
                <div className="login-feature-item">
                  <div className="login-feature-icon-box">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-300" aria-hidden="true" />
                  </div>
                  <div className="login-feature-text">
                    <strong>Standardisasi SPO Terpadu</strong>
                    <span>Penyusunan, verifikasi, dan validasi digital terpusat</span>
                  </div>
                </div>

                <div className="login-feature-item">
                  <div className="login-feature-icon-box">
                    <Lock className="w-3.5 h-3.5 text-teal-300" aria-hidden="true" />
                  </div>
                  <div className="login-feature-text">
                    <strong>Akses &amp; Regulasi Aman</strong>
                    <span>Kontrol hak akses berbasis unit kerja dan otentikasi ketat</span>
                  </div>
                </div>
              </div>

              {/* Bottom Hospital Footer Note */}
              <div className="login-brand-footer-note">
                <span className="login-brand-footer-dot">•</span>
                <span>Terakreditasi Paripurna</span>
              </div>
            </div>
          </aside>

          {/* RIGHT COLUMN: Compact & Clean Login Form */}
          <section id="login-auth-panel" className="login-auth-panel">
            <div className="login-form-container">
              {/* Mobile-Only Brand Header */}
              <div className="login-mobile-brand-header">
                <img
                  src="/logo_soegiri_transparent.png"
                  alt="Logo RSUD Dr. Soegiri Lamongan"
                  className="login-mobile-logo"
                />
                <div className="login-mobile-titles">
                  <div className="login-mobile-brand-title">
                    <span className="text-[#0e294b]">SIDO</span>
                    <span className="text-[#009b83]">KTER</span>
                  </div>
                  <div className="login-mobile-brand-sub">Sistem Dokumen Terpadu RSUD Dr. Soegiri Lamongan</div>
                </div>
              </div>

              <header id="login-card-header" className="login-card-header">
                <h2 className="login-card-title">Masuk ke Sistem</h2>
                <p className="login-card-subtitle">
                  Silakan masukkan nama pengguna dan kata sandi Anda
                </p>
              </header>

              {/* Maintenance Mode Alert */}
              {maintenanceMode?.enabled && (
                <div id="login-maintenance-notice" className="login-notice login-notice-warning" role="status">
                  <Wrench className="login-notice-icon" aria-hidden="true" />
                  <div className="login-notice-text">
                    <strong>Mode Pemeliharaan Aktif</strong>
                    <p>{maintenanceMode.message || 'Sistem sedang dalam proses pemeliharaan. Akses saat ini dibatasi untuk Administrator.'}</p>
                  </div>
                </div>
              )}

              {/* Inactivity Notice */}
              {inactivityNotice && (
                <div id="login-inactivity-notice" className="login-notice login-notice-warning" role="status">
                  <Clock className="login-notice-icon" aria-hidden="true" />
                  <span className="login-notice-text">{inactivityNotice}</span>
                </div>
              )}

              {/* Error & Lockout Notice */}
              {errorMsg && (
                <div
                  id="login-error-notice"
                  className={`login-notice login-notice-error ${isLockedOut ? 'is-locked' : ''}`}
                  role="alert"
                  aria-live="assertive"
                >
                  {isLockedOut ? (
                    <ShieldAlert className="login-notice-icon" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="login-notice-icon" aria-hidden="true" />
                  )}
                  <div className="login-notice-text">
                    <span>{errorMsg}</span>
                    {isLockedOut && lockoutSecondsRemaining !== null && lockoutSecondsRemaining > 0 && (
                      <div className="mt-1">
                        <span className="login-lockout-timer">
                          <Clock className="w-2.5 h-2.5" /> Coba lagi dalam {formatLockoutTime(lockoutSecondsRemaining)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Help / Support Modal */}
              {showHelpModal && (
                <div id="login-help-card" className="login-help-card" role="region" aria-label="Bantuan Akses Akun">
                  <div className="login-help-card-header">
                    <span className="inline-flex items-center gap-1.5 font-bold text-[#0f766e]">
                      <PhoneCall className="w-3.5 h-3.5 text-teal-700" /> Bantuan Akun &amp; Lupa Sandi
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowHelpModal(false)}
                      className="login-help-card-close"
                      aria-label="Tutup Bantuan"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="login-help-content">
                    <div className="login-help-item">
                      <span className="login-help-badge">SIMRS / IT</span>
                      <span>Pesawat Telp <strong>Ext. 200</strong></span>
                    </div>
                    <div className="login-help-item">
                      <span className="login-help-badge">Bagian Umum & Kepegawaian</span>
                      <span>Gedung Manajemen Lt. 2</span>
                    </div>
                    <div className="login-help-subtext">
                      Jam Pelayanan: Senin – Jumat (07.00 – 14.00 WIB)
                    </div>
                  </div>
                </div>
              )}

              {/* Main Login Form */}
              <form id="login-form" onSubmit={handleSubmit} className="login-form">
                {/* Username Field */}
                <div className="login-field">
                  <label htmlFor="login-username-input">
                    Nama Pengguna <span aria-hidden="true">*</span>
                  </label>
                  <div className="login-input-wrap">
                    <User className="login-input-icon" aria-hidden="true" />
                    <input
                      id="login-username-input"
                      ref={usernameInputRef}
                      name="username"
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={username}
                      disabled={isSubmitting || isLockedOut}
                      onChange={e => {
                        setUsername(e.target.value);
                        if (errorMsg) setErrorMsg('');
                      }}
                      onKeyDown={handleUsernameKeyDown}
                      placeholder="Masukkan nama pengguna"
                      aria-required="true"
                      aria-invalid={!!errorMsg}
                      autoFocus={!username}
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="login-field">
                  <div className="login-label-row">
                    <label htmlFor="login-password-input">
                      Kata Sandi <span aria-hidden="true">*</span>
                    </label>
                    {capsLockActive ? (
                      <span className="login-caps-warning" role="status">
                        <AlertTriangle className="w-2.5 h-2.5" /> Caps Lock aktif
                      </span>
                    ) : (
                      <span className="login-label-hint">Peka huruf besar/kecil</span>
                    )}
                  </div>
                  <div className="login-input-wrap">
                    <Lock className="login-input-icon" aria-hidden="true" />
                    <input
                      id="login-password-input"
                      ref={passwordInputRef}
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      disabled={isSubmitting || isLockedOut}
                      onChange={e => {
                        setPassword(e.target.value);
                        if (errorMsg) setErrorMsg('');
                      }}
                      onKeyDown={handlePasswordKeyEvent}
                      onKeyUp={handlePasswordKeyEvent}
                      placeholder="Masukkan kata sandi"
                      aria-required="true"
                      aria-invalid={!!errorMsg}
                      autoFocus={!!username}
                    />
                    <button
                      id="login-password-toggle-btn"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isSubmitting || isLockedOut}
                      className="login-password-toggle"
                      title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                {/* Options Row: Remember Username & Help */}
                <div className="login-options-row">
                  <label className="login-remember-label" htmlFor="login-remember-checkbox">
                    <input
                      id="login-remember-checkbox"
                      type="checkbox"
                      checked={rememberUsername}
                      onChange={e => {
                        setRememberUsername(e.target.checked);
                        if (!e.target.checked) {
                          try {
                            localStorage.removeItem(SAVED_USERNAME_KEY);
                            localStorage.removeItem(REMEMBER_PREF_KEY);
                          } catch {}
                        }
                      }}
                    />
                    <span>Ingat saya</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowHelpModal(!showHelpModal)}
                    className="login-help-trigger"
                    aria-expanded={showHelpModal}
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-teal-600" />
                    <span>Lupa Kata Sandi?</span>
                  </button>
                </div>

                {/* Submit Button */}
                <button
                  id="login-submit-btn"
                  type="submit"
                  disabled={isSubmitting || isLockedOut}
                  className={`login-submit-btn ${isSubmitting ? 'is-submitting is-loading' : ''}`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="login-submit-icon spin" aria-hidden="true" />
                      <span>Memvalidasi...</span>
                    </>
                  ) : isLockedOut && lockoutSecondsRemaining !== null && lockoutSecondsRemaining > 0 ? (
                    <>
                      <Clock className="login-submit-icon" aria-hidden="true" />
                      <span>Terkunci ({formatLockoutTime(lockoutSecondsRemaining)})</span>
                    </>
                  ) : (
                    <>
                      <span>Masuk</span>
                      <LogIn className="login-submit-icon" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>

              {/* Official Security Seal */}
              <div className="login-security-note">
                <ShieldCheck className="login-security-icon" aria-hidden="true" />
                <span>
                  Akses terenkripsi khusus pegawai &amp; staf unit kerja RSUD Dr. Soegiri Lamongan.
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Clean Global Footer */}
      <footer id="login-auth-footer" className="login-page-footer">
        © 2026 {SOEGIRI_HOSPITAL_INFO.shortName} · Sistem Dokumen Terpadu (SIDOKTER) v1.0
      </footer>
    </div>
  );
};
