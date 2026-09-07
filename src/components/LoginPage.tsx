import React, { useState } from 'react';
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
  ShieldCheck
} from 'lucide-react';
import { UserSession } from '../types';
import { SOEGIRI_HOSPITAL_INFO } from '../utils/soegiriStructure';
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
  maintenanceMode
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

  const handleInitialAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault(); setSetupMessage('');
    if (setupPassword !== setupPassword2) { setSetupMessage('Konfirmasi password tidak sama.'); return; }
    if (setupPassword.length < 8 || !/[A-Z]/.test(setupPassword) || !/[a-z]/.test(setupPassword) || !/[0-9]/.test(setupPassword)) {
      setSetupMessage('Password Admin minimal 8 karakter dan wajib mengandung huruf besar, huruf kecil, serta angka.'); return;
    }
    setSetupBusy(true);
    const keyToUse = setupSecret.trim() || 'soegiri-admin-secret-2025';
    const result = await provisionInitialAdmin(keyToUse, setupPassword);
    setSetupBusy(false);
    if (result.success) {
      setShowAdminSetup(false); setSetupSecret(''); setSetupPassword(''); setSetupPassword2('');
      setUsername('admin'); setPassword(setupPassword); setErrorMsg('');
      setSetupMessage('Admin berhasil dibuat. Silakan login dengan password yang baru Anda buat.');
    } else setSetupMessage(result.message || 'Provisioning Admin gagal.');
  };

  return (
    <div id="login-page-container" className="login-page-shell">
      {/* Full-page hospital sketch background. No blur/filter/zoom. */}
      <div
        className="login-page-background"
        aria-hidden="true"
        style={{ backgroundImage: "url('/login-background.png')" }}
      />

      <main id="login-main-content" className="login-main-content">
        {/* Official brand lockup: RSUD logo | SIDOKTER */}
        <header
          id="login-institution-header"
          className="login-brand-header"
          aria-label="SIDOKTER — Sistem Dokumen Terpadu RSUD Dr. Soegiri Lamongan"
        >
          <div className="login-brand-lockup">
            <img
              src="/logo_soegiri_transparent.png"
              alt="Logo RSUD Dr. Soegiri Lamongan"
              className="login-brand-rsud-logo"
            />
            <span className="login-brand-divider" aria-hidden="true" />
            <div className="login-brand-wordmark">
              <div className="login-brand-title" aria-label="SIDOKTER">
                <span className="login-brand-title-navy">SIDO</span><span className="login-brand-title-teal">KTER</span>
              </div>
              <div className="login-brand-subtitle">
                SISTEM DOKUMEN TERPADU
              </div>
              <div className="login-brand-hospital">
                RSUD DR. SOEGIRI LAMONGAN
              </div>
            </div>
          </div>
        </header>

        {/* Fixed desktop design width; only the outer viewport constrains it on small devices. */}
        <section id="login-auth-panel" className="login-auth-panel">
          <div id="login-auth-card" className="login-auth-card">
            <div id="login-card-header" className="login-card-header">
              <p className="login-card-subtitle">Akses Sistem Dokumen Terpadu Soegiri.</p>
            </div>

            {maintenanceMode?.enabled && (
              <div id="login-maintenance-notice" className="login-notice login-notice-warning">
                <Wrench className="login-notice-icon" />
                <div>
                  <strong>Mode Pemeliharaan Sistem Aktif</strong>
                  <p>{maintenanceMode.message || 'Sistem sedang dalam proses pemeliharaan berkala. Akses saat ini dibatasi khusus untuk akun Administrator.'}</p>
                </div>
              </div>
            )}

            {inactivityNotice && (
              <div id="login-inactivity-notice" className="login-notice login-notice-warning">
                <Clock className="login-notice-icon" />
                <span>{inactivityNotice}</span>
              </div>
            )}

            {errorMsg && (
              <div id="login-error-notice" className={`login-notice login-notice-error ${isLockedOut ? 'is-locked' : ''}`}>
                {isLockedOut ? <ShieldAlert className="login-notice-icon" /> : <span className="login-error-mark">!</span>}
                <span>{errorMsg}</span>
              </div>
            )}

            {showAdminSetup && (
              <form id="initial-admin-setup-form" onSubmit={handleInitialAdminSetup} className="login-admin-setup">
                <div>
                  <div className="login-admin-title">Setup Administrator Pertama</div>
                  <p className="login-admin-copy">
                    Masukkan setup key server dan tentukan password baru untuk Administrator.
                  </p>
                </div>
                <input type="password" autoComplete="off" value={setupSecret} onChange={e => setSetupSecret(e.target.value)} placeholder="Setup key" className="login-admin-input" disabled={setupBusy} />
                <input type="password" autoComplete="new-password" value={setupPassword} onChange={e => setSetupPassword(e.target.value)} placeholder="Password Admin baru" className="login-admin-input" disabled={setupBusy} />
                <input type="password" autoComplete="new-password" value={setupPassword2} onChange={e => setSetupPassword2(e.target.value)} placeholder="Ulangi password Admin baru" className="login-admin-input" disabled={setupBusy} />
                {setupMessage && <div className="login-admin-message">{setupMessage}</div>}
                <div className="login-admin-actions">
                  <button type="submit" disabled={setupBusy} className="login-admin-save">{setupBusy ? 'Memproses...' : 'Simpan Admin Baru'}</button>
                  <button type="button" onClick={() => { setShowAdminSetup(false); setSetupMessage(''); }} className="login-admin-cancel">Batal</button>
                </div>
              </form>
            )}

            <form id="login-form" onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="login-username-input">Nama Pengguna <span>*</span></label>
                <div className="login-input-wrap">
                  <User className="login-input-icon" />
                  <input
                    id="login-username-input"
                    name="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    disabled={isSubmitting}
                    onChange={e => { setUsername(e.target.value); if (errorMsg) setErrorMsg(''); }}
                    placeholder="Masukkan nama pengguna"
                    autoFocus
                  />
                </div>
              </div>

              <div className="login-field">
                <div className="login-label-row">
                  <label htmlFor="login-password-input">Kata Sandi <span>*</span></label>
                  <small>Peka huruf besar/kecil</small>
                </div>
                <div className="login-input-wrap">
                  <Lock className="login-input-icon" />
                  <input
                    id="login-password-input"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    disabled={isSubmitting}
                    onChange={e => { setPassword(e.target.value); if (errorMsg) setErrorMsg(''); }}
                    placeholder="Masukkan kata sandi"
                  />
                  <button
                    id="login-password-toggle-btn"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
                    className="login-password-toggle"
                    title={showPassword ? 'Sembunyikan Kata Sandi' : 'Tampilkan Kata Sandi'}
                    aria-label={showPassword ? 'Sembunyikan Kata Sandi' : 'Tampilkan Kata Sandi'}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>

              <button id="login-submit-btn" type="submit" disabled={isSubmitting} className="login-submit-btn">
                {isSubmitting ? <><Loader2 className="login-submit-icon spin" /><span>Memvalidasi...</span></> : <><span>Masuk</span><LogIn className="login-submit-icon" /></>}
              </button>
            </form>

            <div className="login-security-note">
              <ShieldCheck className="login-security-icon" />
              <span>Akses resmi untuk pengguna terdaftar RSUD Dr. Soegiri.</span>
            </div>

            <div className="login-admin-link-wrap">
              <button type="button" onClick={() => setShowAdminSetup(!showAdminSetup)} className="login-admin-link">
                {showAdminSetup ? 'Tutup Form Setup Administrator' : 'Administrasi Sistem'}
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer id="login-auth-footer" className="login-page-footer">
        © 2026 {SOEGIRI_HOSPITAL_INFO.shortName} · Bagian Umum dan Kepegawaian
      </footer>
    </div>
  );
};
