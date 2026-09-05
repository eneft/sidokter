import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, LogOut, Monitor, ShieldCheck, Smartphone, X } from 'lucide-react';
import { LoginAuditLog, UserSession } from '../types';
import { changeUserPassword, fetchRecentAuditLogs, revokeAllUserSessions } from '../lib/authService';

interface SecurityAccountPanelProps {
  isOpen: boolean;
  userSession: UserSession;
  isAdmin?: boolean;
  onClose: () => void;
  onLogout: () => void;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const SecurityAccountPanel: React.FC<SecurityAccountPanelProps> = ({ isOpen, userSession, isAdmin = false, onClose, onLogout, onShowToast }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LoginAuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (!isOpen || !isAdmin) return;
    setLoadingLogs(true);
    fetchRecentAuditLogs(20).then(setLogs).finally(() => setLoadingLogs(false));
  }, [isOpen, isAdmin]);

  if (!isOpen) return null;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      onShowToast?.('error', 'Gagal', 'Konfirmasi kata sandi baru tidak cocok.');
      return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      onShowToast?.('error', 'Kata sandi lemah', 'Gunakan minimal 8 karakter dengan huruf besar, huruf kecil, dan angka.');
      return;
    }
    setBusy(true);
    try {
      const result = await changeUserPassword(userSession.username, currentPassword, newPassword);
      onShowToast?.(result.success ? 'success' : 'error', result.success ? 'Kata sandi diperbarui' : 'Gagal memperbarui', result.message);
      if (result.success) {
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      }
    } finally { setBusy(false); }
  };

  const handleRevokeAll = async () => {
    if (!window.confirm('Keluar dari semua perangkat? Sesi pada perangkat ini juga akan dihentikan.')) return;
    setBusy(true);
    try {
      const result = await revokeAllUserSessions(userSession.username);
      onShowToast?.(result.success ? 'success' : 'error', result.success ? 'Semua sesi dicabut' : 'Gagal', result.message);
      if (result.success) onLogout();
    } finally { setBusy(false); }
  };

  const formatTime = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const getEventBadge = (event: string) => {
    switch (event) {
      case 'BACKUP_EXPORT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">BACKUP DATA</span>;
      case 'RESTORE_EXECUTE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">RESTORE DATA</span>;
      case 'LOGIN_SUCCESS':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">LOGIN BERHASIL</span>;
      case 'LOGIN_FAILED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">LOGIN GAGAL</span>;
      case 'LOCKED_OUT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">AKUN TERKUNCI</span>;
      case 'PASSWORD_CHANGED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">GANTI SANDI</span>;
      case 'SESSION_REVOKED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">SESI DICABUT</span>;
      case 'LOGOUT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">LOGOUT</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{event}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/35 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-slate-50 rounded-2xl shadow-2xl border border-slate-200">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-900 font-bold"><ShieldCheck className="w-5 h-5 text-emerald-600" /> Keamanan Akun</div>
            <p className="text-xs text-slate-500 mt-1">Kelola kata sandi, sesi aktif, dan riwayat keamanan akun.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-5">
            <section className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4"><KeyRound className="w-5 h-5 text-emerald-600" /><div><h3 className="font-bold text-slate-900">Ganti Kata Sandi</h3><p className="text-xs text-slate-500">Minimal 8 karakter, terdiri dari huruf besar, huruf kecil, dan angka.</p></div></div>
              <form onSubmit={handlePasswordChange} className="space-y-3">
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Kata sandi saat ini" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" required />
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Kata sandi baru" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" required />
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Ulangi kata sandi baru" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" required />
                <button disabled={busy} className="w-full rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{busy ? 'Memproses...' : 'Simpan Kata Sandi'}</button>
              </form>
            </section>

            <section className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-3"><Monitor className="w-5 h-5 text-emerald-600" /><div><h3 className="font-bold text-slate-900">Sesi Saat Ini</h3><p className="text-xs text-slate-500">Login baru pada akun yang sama akan mencabut sesi lama.</p></div></div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                <div><div className="text-sm font-semibold text-slate-900">Perangkat ini</div><div className="text-xs text-emerald-700">Sesi aktif • {userSession.username}</div></div><CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <button onClick={handleRevokeAll} disabled={busy} className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><LogOut className="w-4 h-4" />Keluar dari Semua Perangkat</button>
              <p className="mt-2 text-[11px] text-slate-500">Tindakan ini juga akan mengeluarkan Anda dari perangkat yang sedang digunakan.</p>
            </section>
          </div>

          {isAdmin ? (
            <section className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4"><Smartphone className="w-5 h-5 text-indigo-600" /><div><h3 className="font-bold text-slate-900">Riwayat Keamanan Terbaru</h3><p className="text-xs text-slate-500">Aktivitas login dan perubahan keamanan terbaru.</p></div></div>
              {loadingLogs ? (
                <div className="py-10 text-center text-sm text-slate-500">Memuat riwayat...</div>
              ) : logs.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">Belum ada riwayat audit keamanan.</div>
              ) : (
                <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                      <div className="flex items-center justify-between gap-2">
                        {getEventBadge(log.event)}
                        <span className="text-[11px] text-slate-400 font-mono">{formatTime(log.timestamp)}</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800 mt-1.5 flex items-center gap-1.5">
                        <span>{log.username}</span>
                        {log.name && <span className="text-slate-400 font-normal">({log.name})</span>}
                        {log.role && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium uppercase">
                            {log.role}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 mt-1 leading-relaxed">{log.details || '-'}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-3"><AlertTriangle className="w-5 h-5 text-amber-600" /><div><h3 className="font-bold text-slate-900">Perlindungan Login</h3><p className="text-xs text-slate-500">5 percobaan gagal berturut-turut akan mengunci akun selama 15 menit.</p></div></div>
              <div className="mt-5 space-y-2 text-xs text-slate-600"><div>• Satu sesi aktif per akun.</div><div>• Sesi tidak aktif otomatis berakhir setelah 30 menit.</div><div>• Masa sesi maksimum 12 jam.</div><div>• Aktivitas login dicatat untuk audit keamanan.</div></div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
