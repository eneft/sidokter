import React, { useState } from 'react';
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
  Server,
  Activity,
  ArrowRight,
  ShieldAlert,
  Building2
} from 'lucide-react';
import { UserSession, UserAccount } from '../types';
import { SecurityAccountPanel } from './SecurityAccountPanel';
import { BackupRestorePanel } from './BackupRestorePanel';
import { PetugasPasswordTab } from './PetugasPasswordTab';

interface AdminHubPageProps {
  userSession: UserSession;
  userAccounts?: UserAccount[];
  onOpenUserManagement?: () => void;
  onOpenMasterData?: () => void;
  onOpenMaintenanceModal?: () => void;
  onOpenNumberingConfig?: () => void;
  onLogout?: () => void;
  onUpdatePassword?: (newPassword: string) => Promise<void>;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

type AdminSubTab = 'tools' | 'security' | 'backup' | 'password';

export const AdminHubPage: React.FC<AdminHubPageProps> = ({
  userSession,
  userAccounts = [],
  onOpenUserManagement,
  onOpenMasterData,
  onOpenMaintenanceModal,
  onOpenNumberingConfig,
  onLogout,
  onUpdatePassword,
  onShowToast,
}) => {
  const isAdmin = userSession.role === 'admin';
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>(isAdmin ? 'tools' : 'password');

  // If user is Petugas, show clean Petugas Security & Profile Hub
  if (!isAdmin) {
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
                  Petugas Unit
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
          <PetugasPasswordTab
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
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs">
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
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Kelola master struktur unit RSUD Dr. Soegiri, manajemen akun petugas, keamanan sesi, pencadangan database, dan pengaturan penomoran.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
            <Server className="w-4 h-4 text-emerald-600" />
            <span>Database Cloud: Aktif</span>
          </div>
        </div>

        {/* Admin Navigation Sub-Tabs */}
        <div className="mt-6 flex items-center gap-2 border-b border-slate-100 pb-3 overflow-x-auto">
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
              <h3 className="text-base font-black text-slate-900">Master Hirarki & Unit Kerja</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Kelola struktur Bidang, Bagian, Instalasi, Poli, dan Sub-Unit RSUD Dr. Soegiri untuk klasifikasi baku dokumen SPO.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onOpenMasterData}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <span>Buka Master Hirarki</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card 2: Manajemen Petugas & Akun */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-700 w-fit mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">Manajemen Petugas & Akun</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Tambah akun petugas, atur penugasan multi-hirarki/bidang unit, reset password, dan pantau status login pengguna.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onOpenUserManagement}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <span>Kelola Petugas ({userAccounts.length})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card 3: Aturan Penomoran SPO */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-amber-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-amber-50 text-amber-700 w-fit mb-4 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <Hash className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">Format Penomoran SPO</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Atur format baku penomoran naskah SPO (Prefix, Padding angka, Bulan Romawi, & Reset Counter tahunan).
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onOpenNumberingConfig}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <span>Atur Format Penomoran</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card 4: Mode Pemeliharaan (Maintenance Mode) */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-rose-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-rose-50 text-rose-700 w-fit mb-4 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                <Wrench className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">Mode Pemeliharaan (Maintenance)</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Aktifkan mode pemeliharaan sistem dengan pesan pengumuman real-time ke seluruh petugas yang sedang aktif.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onOpenMaintenanceModal}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <span>Kelola Mode Pemeliharaan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card 5: Backup & Restore */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-teal-50 text-teal-700 w-fit mb-4 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">Cadangan & Pemulihan Data</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Ekspor seluruh berkas SPO, SK, MOU dalam format JSON terverifikasi dan pulihkan snapshot data kapan saja.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveSubTab('backup')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <span>Buka Panel Backup</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card 6: Single Active Session Monitor */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-blue-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-blue-50 text-blue-700 w-fit mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">Audit Sesi & Keamanan</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Pantau Single Active Session guard, riwayat audit login, dan pencegahan akun ganda bersamaan.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveSubTab('security')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <span>Buka Panel Keamanan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SubTab 2: Security & Session Guard Panel */}
      {activeSubTab === 'security' && (
        <SecurityAccountPanel
          userSession={userSession}
          onShowToast={onShowToast}
        />
      )}

      {/* SubTab 3: Backup & Restore Panel */}
      {activeSubTab === 'backup' && (
        <BackupRestorePanel
          userSession={userSession}
          onShowToast={onShowToast}
        />
      )}

      {/* SubTab 4: Change Admin Password */}
      {activeSubTab === 'password' && onUpdatePassword && (
        <PetugasPasswordTab
          userSession={userSession}
          onLogout={onLogout || (() => {})}
          onUpdatePassword={onUpdatePassword}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
};
