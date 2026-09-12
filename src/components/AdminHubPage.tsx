import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Layers, 
  Lock, 
  Database, 
  Wrench, 
  Hash, 
  KeyRound, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  AlertCircle,
  Server,
  Activity,
  ArrowRight,
  ShieldAlert,
  Building2,
  RefreshCw,
  Info,
  HelpCircle
} from 'lucide-react';
import { UserSession, UserAccount, SopDocument } from '../types';
import { standardizeAllSops } from '../utils/numbering';
import { SecurityAccountPanel } from './SecurityAccountPanel';
import { BackupRestorePanel } from './BackupRestorePanel';
import { UserPasswordTab } from './UserPasswordTab';
import { AdminTooltip, AdminHelpHint } from './AdminTooltip';

interface AdminHubPageProps {
  userSession: UserSession;
  userAccounts?: UserAccount[];
  sops?: SopDocument[];
  onOpenUserManagement?: () => void;
  onOpenMasterData?: () => void;
  onOpenMaintenanceModal?: () => void;
  onOpenMaintenance?: () => void;
  onOpenNumberingConfig?: () => void;
  onOpenSecurity?: () => void;
  onOpenBackupRestore?: () => void;
  onBackup?: () => void;
  onRestore?: () => void;
  isRestoring?: boolean;
  restoreProgress?: string;
  onLogout?: () => void;
  onUpdatePassword?: (newPassword: string) => Promise<void>;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
  onStandardizeAllNumbers?: () => void;
}

type AdminSubTab = 'tools' | 'sync' | 'security' | 'backup' | 'password';

export const AdminHubPage: React.FC<AdminHubPageProps> = ({
  userSession,
  userAccounts = [],
  sops = [],
  onOpenUserManagement,
  onOpenMasterData,
  onOpenMaintenanceModal,
  onOpenMaintenance,
  onOpenNumberingConfig,
  onOpenSecurity,
  onOpenBackupRestore,
  onBackup,
  onRestore,
  isRestoring = false,
  restoreProgress = '',
  onLogout,
  onUpdatePassword,
  onShowToast,
  onStandardizeAllNumbers,
}) => {
  const hasAdminAccess = userSession.role === 'admin';
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>(hasAdminAccess ? 'tools' : 'password');

  // Live analysis of SOP numbering status
  const standardSopsCount = useMemo(() => {
    return sops.filter((s) => !s.isLegacySop && s.documentType !== 'LAMA' && !(s as any).isNumberReservation).length;
  }, [sops]);

  const syncAnalysis = useMemo(() => {
    if (!sops || sops.length === 0) return { changedCount: 0, duplicateCount: 0 };
    const res = standardizeAllSops(sops);
    return { changedCount: res.changedCount, duplicateCount: res.duplicateCount };
  }, [sops]);

  // If user does not have Admin access, show clean User Security & Profile Hub
  if (!hasAdminAccess) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-lg">
              {(userSession.name || 'P')[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">{userSession.name}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                  User Unit
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Akun & Hak Akses RSUD Dr. Soegiri Lamongan
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Nama Pengguna (Username)</div>
              <div className="mt-1 text-sm font-black text-slate-900 font-mono">{userSession.username}</div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Unit Kerja Penugasan</div>
              <div className="mt-1 text-sm font-black text-emerald-800">{userSession.unitName || userSession.divisionCode || 'Unit Kerja Terdaftar'}</div>
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        {onUpdatePassword && (
          <UserPasswordTab
            userSession={userSession}
            onLogout={onLogout || (() => {})}
            onUpdatePassword={onUpdatePassword}
            onShowToast={onShowToast}
          />
        )}
      </div>
    );
  }

  // If user is Admin, show full Admin Management Portal
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-slate-900 text-white shadow-xs">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                  Portal Administrasi & Kontrol Sistem
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                  ADMINISTRATOR
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Kelola struktur unit, akun User, keamanan, pencadangan data, dan konfigurasi dokumen SIDOKTER.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
              <span>Admin Root</span>
            </div>
          </div>
        </div>

        {/* Admin Navigation Sub-Tabs */}
        <div className="mt-5 flex items-center gap-2 border-b border-slate-100 pb-3 overflow-x-auto">
          <AdminTooltip content="Akses cepat ke pengaturan struktur organisasi hirarki, akun pengguna, format nomor baku, dan modul sistem." title="Alat Manajemen" side="bottom">
            <button
              type="button"
              onClick={() => setActiveSubTab('tools')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeSubTab === 'tools'
                  ? 'bg-slate-900 text-white shadow-xs font-black'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>Alat Manajemen & Master Data</span>
            </button>
          </AdminTooltip>

          <AdminTooltip content="Menstandarisasi urutan nomor SPO per unit kerja sesuai pedoman baku RSUD Dr. Soegiri serta merapikan nomor duplikat." title="Sinkronisasi Nomor" side="bottom">
            <button
              type="button"
              onClick={() => setActiveSubTab('sync')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeSubTab === 'sync'
                  ? 'bg-purple-600 text-white shadow-xs font-black'
                  : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Sinkronisasi Nomor SPO</span>
              {syncAnalysis.changedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-black">
                  {syncAnalysis.changedCount}
                </span>
              )}
            </button>
          </AdminTooltip>

          <AdminTooltip content="Pantau sesi login perangkat aktif, riwayat audit keamanan admin, dan pencabutan sesi yang tidak sah." title="Keamanan & Audit" side="bottom">
            <button
              type="button"
              onClick={() => setActiveSubTab('security')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeSubTab === 'security'
                  ? 'bg-slate-900 text-white shadow-xs font-black'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Keamanan Akun & Audit Sesi</span>
            </button>
          </AdminTooltip>

          <AdminTooltip content="Unduh snapshot arsip lengkap (JSON) seluruh dokumen & akun atau pulihkan database dari berkas backup." title="Cadangan Data" side="bottom">
            <button
              type="button"
              onClick={() => setActiveSubTab('backup')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeSubTab === 'backup'
                  ? 'bg-slate-900 text-white shadow-xs font-black'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Backup & Restore Database</span>
            </button>
          </AdminTooltip>

          <AdminTooltip content="Ganti kata sandi akun administrator saat ini dengan kombinasi aman minimal 8 karakter." title="Ganti Password" side="bottom">
            <button
              type="button"
              onClick={() => setActiveSubTab('password')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeSubTab === 'password'
                  ? 'bg-slate-900 text-white shadow-xs font-black'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Ganti Password Admin</span>
            </button>
          </AdminTooltip>
        </div>
      </div>

      {/* SubTab 1: Tools & Modules Grid */}
      {activeSubTab === 'tools' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Master Hirarki & Unit Kerja */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700 w-fit mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <Layers className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900">Master Hirarki & Unit Kerja</h3>
                <AdminHelpHint text="Kelola struktur hierarki rumah sakit (Bidang, Bagian, Instalasi, Poli, Sub-Unit) untuk dasar penomoran dokumen baku." title="Master Hirarki" />
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Kelola struktur Bidang, Bagian, Instalasi, Poli, dan Sub-Unit RSUD Dr. Soegiri untuk klasifikasi baku dokumen SPO.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <AdminTooltip content="Buka panel hierarki organisasi untuk menambah, mengubah, atau menyusun unit kerja RSUD Dr. Soegiri." title="Buka Master Hirarki" side="top" className="w-full">
                <button
                  type="button"
                  onClick={onOpenMasterData}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>Buka Master Hirarki</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </AdminTooltip>
              <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Atur kode hirarki, bidang, instalasi, dan poli</span>
              </div>
            </div>
          </div>

          {/* Card 2: Manajemen User & Akun */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-700 w-fit mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Users className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900">Manajemen User & Akun</h3>
                <AdminHelpHint text="Daftarkan akun petugas unit, atur penugasan multi-hirarki, reset sandi, dan tetapkan badge verifikator." title="Manajemen Pengguna" />
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Tambah akun user, atur penugasan multi-hirarki/bidang unit, reset password, dan pantau status login pengguna.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <AdminTooltip content="Buka daftar akun untuk membuat user baru, atur unit kerja, hak verifikator, atau reset kata sandi." title="Kelola User" side="top" className="w-full">
                <button
                  type="button"
                  onClick={onOpenUserManagement}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>Kelola User ({userAccounts.length})</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </AdminTooltip>
              <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Buat akun baru, atur unit penugasan & reset sandi</span>
              </div>
            </div>
          </div>

          {/* Card 3: Aturan Penomoran SPO */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-amber-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-amber-50 text-amber-700 w-fit mb-4 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <Hash className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900">Format Penomoran SPO</h3>
                <AdminHelpHint text="Konfigurasi pola baku nomor naskah dinas SPO (digit padding, urutan angka, format bulan romawi, dan counter tahunan)." title="Format Penomoran" />
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Atur format baku penomoran naskah SPO (Prefix, Padding angka, Bulan Romawi, & Reset Counter tahunan).
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <AdminTooltip content="Sesuaikan format penomoran SPO resmi agar sesuai dengan pedoman tata naskah RSUD Dr. Soegiri." title="Atur Format Penomoran" side="top" className="w-full">
                <button
                  type="button"
                  onClick={onOpenNumberingConfig}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>Atur Format Penomoran</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </AdminTooltip>
              <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Format baku prefix kode bidang dan counter tahunan</span>
              </div>
            </div>
          </div>

          {/* Card 4: Mode Pemeliharaan (Maintenance Mode) */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-rose-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-rose-50 text-rose-700 w-fit mb-4 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                <Wrench className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900">Mode Pemeliharaan (Maintenance)</h3>
                <AdminHelpHint text="Kunci akses sistem untuk pengguna non-admin saat sedang ada perbaikan atau upgrade server." title="Mode Pemeliharaan" />
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Aktifkan mode pemeliharaan sistem dengan pesan pengumuman real-time ke seluruh user yang sedang aktif.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <AdminTooltip content="Alihkan seluruh pengguna ke layar pemberitahuan pemeliharaan saat perbaikan server sedang berlangsung." title="Mode Pemeliharaan" side="top" className="w-full">
                <button
                  type="button"
                  onClick={onOpenMaintenanceModal || onOpenMaintenance}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>Kelola Mode Pemeliharaan</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </AdminTooltip>
              <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                <Info className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Siarkan pesan pengumuman & kunci akses sistem</span>
              </div>
            </div>
          </div>

          {/* Card 5: Backup & Restore */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-teal-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-teal-50 text-teal-700 w-fit mb-4 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                <Database className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900">Cadangan & Pemulihan Data</h3>
                <AdminHelpHint text="Unduh file backup berkala database ke komputer lokal dan pulihkan saat dibutuhkan." title="Backup & Restore" />
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Ekspor seluruh berkas SPO, SK, MOU dalam format JSON terverifikasi dan pulihkan snapshot data kapan saja.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <AdminTooltip content="Buka panel pencadangan untuk mengunduh snapshot data JSON atau mengunggah file restore." title="Panel Backup" side="top" className="w-full">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('backup')}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>Buka Panel Backup</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </AdminTooltip>
              <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                <Info className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Unduh salinan JSON lengkap atau pulihkan arsip</span>
              </div>
            </div>
          </div>

          {/* Card 6: Per-Device Session Monitor */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-blue-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-blue-50 text-blue-700 w-fit mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Activity className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900">Audit Sesi & Keamanan</h3>
                <AdminHelpHint text="Pantau perangkat yang sedang login dan cabut sesi jika terdeteksi aktivitas yang mencurigakan." title="Audit Keamanan" />
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Pantau sesi per perangkat, riwayat audit login, dan pencabutan sesi yang tidak sah.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <AdminTooltip content="Periksa sesi aktif, riwayat audit login sukses/gagal, dan keamanan akun." title="Panel Keamanan" side="top" className="w-full">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('security')}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>Buka Panel Keamanan</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </AdminTooltip>
              <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Pantau riwayat login & kelola sesi aktif pengguna</span>
              </div>
            </div>
          </div>

          {/* Card 7: Sinkronkan Nomor SPO */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-purple-300 transition-all group">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="p-3 rounded-2xl bg-purple-50 text-purple-700 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <RefreshCw className="w-6 h-6" />
                </div>
                {syncAnalysis.changedCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    {syncAnalysis.changedCount} Perlu Sinkronisasi
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    100% Baku & Rapi
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900">Sinkronkan Nomor SPO</h3>
                <AdminHelpHint text="Perbaiki nomor urut naskah SPO yang loncat atau duplikat secara otomatis sesuai standar RSUD Dr. Soegiri." title="Sinkronisasi SPO" />
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Standarisasi seluruh nomor urut SPO per unit kerja sesuai Pedoman Tata Naskah Soegiri serta rapikan nomor duplikat secara otomatis.
              </p>

              <div className="mt-3.5 p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Dokumen Standar Unit:</span>
                  <span className="font-black text-slate-900">{standardSopsCount} dokumen</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Nomor Duplikat Terdeteksi:</span>
                  <span className={`font-black ${syncAnalysis.duplicateCount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {syncAnalysis.duplicateCount > 0 ? `${syncAnalysis.duplicateCount} duplikat` : '0 (Bebas Duplikat)'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Format Penomoran:</span>
                  <span className="font-mono text-[10px] font-bold text-purple-700">KODE / HIRARKI / 001 / THN</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <AdminTooltip content="Buka pratinjau analisis nomor dan jalankan standarisasi nomor naskah SPO." title="Panel Sinkronisasi" side="top" className="w-full">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('sync')}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>Buka Panel Detail</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </AdminTooltip>
              <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                <Info className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>Rapikan nomor urut dokumen & perbaiki duplikasi</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SubTab: Dedicated Panel Sinkronisasi Nomor SPO */}
      {activeSubTab === 'sync' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header Card */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3.5 rounded-2xl bg-purple-100 text-purple-700">
                  <RefreshCw className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">Sinkronisasi & Standarisasi Nomor SPO</h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Menstandarisasi seluruh nomor urut SPO per unit kerja sesuai Pedoman Tata Naskah RSUD Dr. Soegiri Lamongan.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AdminTooltip content="Kembali ke beranda modul manajemen dan master data." title="Kembali" side="bottom">
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('tools')}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                  >
                    ← Kembali ke Menu
                  </button>
                </AdminTooltip>

                <AdminTooltip content="Terapkan penomoran urut sekuensial per unit kerja. Nomor dokumen lama tetap dipertahankan." title="Jalankan Sinkronisasi" side="bottom">
                  <button
                    type="button"
                    onClick={onStandardizeAllNumbers}
                    disabled={!onStandardizeAllNumbers}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-black transition-all cursor-pointer shadow-sm shadow-purple-200"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Jalankan Sinkronisasi Nomor Sekarang</span>
                  </button>
                </AdminTooltip>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-6">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Dokumen</div>
                <div className="text-xl font-black text-slate-900 mt-1">{sops.length} dokumen</div>
                <div className="text-[10px] text-slate-500 mt-0.5">SPO terdaftar di sistem</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Standar Unit Terbitan</div>
                <div className="text-xl font-black text-indigo-700 mt-1">{standardSopsCount} dokumen</div>
                <div className="text-[10px] text-slate-500 mt-0.5">SPO Baru & Riviu Aktif</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Perlu Sinkronisasi</div>
                <div className={`text-xl font-black mt-1 ${syncAnalysis.changedCount > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                  {syncAnalysis.changedCount} dokumen
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Urutan tidak sekuensial</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nomor Duplikat</div>
                <div className={`text-xl font-black mt-1 ${syncAnalysis.duplicateCount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {syncAnalysis.duplicateCount} duplikat
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Akan dirapikan otomatis</div>
              </div>
            </div>

            {/* Rules Banner */}
            <div className="mt-5 p-4 rounded-2xl bg-purple-50/70 border border-purple-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-purple-950">
              <div className="space-y-1">
                <div className="font-black text-purple-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-purple-600" />
                  Format Baku Penomoran: KODE_BIDANG / SUB_HIRARKI / NO_URUT / TAHUN
                </div>
                <div className="text-purple-800 text-[11px] leading-relaxed">
                  SPO Baru dan SPO Riviu dinomori urut per unit kerja (dimulai dari 001). 
                  Dokumen <strong>SPO Eksisting (Lama)</strong> tetap dipertahankan nomor aslinya dan tidak akan diubah atau digenerate baru.
                </div>
              </div>
            </div>
          </div>

          {/* Table Preview */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="text-xs font-black uppercase tracking-wider text-slate-800">
                Daftar Naskah SPO & Status Penomoran ({sops.length})
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Pratinjau sebelum & sesudah standarisasi
              </span>
            </div>

            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">No</th>
                    <th className="px-4 py-3">Judul SPO</th>
                    <th className="px-4 py-3">Jenis Naskah</th>
                    <th className="px-4 py-3">Nomor Terdaftar</th>
                    <th className="px-4 py-3">Bidang / Unit</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sops.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-medium">
                        Belum ada dokumen SPO yang terdaftar di database.
                      </td>
                    </tr>
                  ) : (
                    sops.map((s, idx) => {
                      const isLegacy = Boolean(s.isLegacySop || s.documentType === 'LAMA');
                      return (
                        <tr key={s.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="px-4 py-3 font-bold text-slate-900 max-w-xs truncate" title={s.title}>
                            {s.title}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${
                              isLegacy 
                                ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                : s.documentType === 'RIVIU' || s.documentType === 'REVIEW'
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            }`}>
                              {isLegacy ? 'SPO Eksisting' : s.documentType === 'RIVIU' || s.documentType === 'REVIEW' ? 'SPO Riviu' : 'SPO Baru'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-bold text-slate-800">
                            {s.sopNumber || s.legacySopNumber || '-'}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-[11px]">
                            {s.divisionCode || 'PEL'} {s.subHierarchyCode ? `(${s.subHierarchyCode})` : ''}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              s.status === 'AKTIF'
                                ? 'bg-emerald-50 text-emerald-700'
                                : s.status === 'REVIEW'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {s.status || 'DRAFT'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SubTab 2: Security & Session Guard Panel */}
      {activeSubTab === 'security' && (
        <SecurityAccountPanel
          isOpen={true}
          userSession={userSession}
          isAdmin={true}
          onClose={() => setActiveSubTab('tools')}
          onLogout={onLogout || (() => {})}
          onShowToast={onShowToast}
        />
      )}

      {/* SubTab 3: Backup & Restore Panel */}
      {activeSubTab === 'backup' && (
        <BackupRestorePanel
          inline={true}
          userSession={userSession}
          onBackup={onBackup}
          onRestore={onRestore}
          isRestoring={isRestoring}
          restoreProgress={restoreProgress}
          onShowToast={onShowToast}
        />
      )}

      {/* SubTab 4: Change Admin Password */}
      {activeSubTab === 'password' && onUpdatePassword && (
        <UserPasswordTab
          userSession={userSession}
          onLogout={onLogout || (() => {})}
          onUpdatePassword={onUpdatePassword}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
};
