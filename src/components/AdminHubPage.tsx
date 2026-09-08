import React, { useState, useMemo, useEffect } from 'react';
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
  Sliders,
  RotateCcw,
  FileText,
  Check,
  X,
  Info,
  Sparkles,
  Filter,
  Search,
  Download,
  Upload
} from 'lucide-react';
import { UserSession, UserAccount, SopDocument, NumberingConfig } from '../types';
import { 
  standardizeAllSops, 
  DEFAULT_NUMBERING_CONFIG, 
  NUMBERING_PRESETS,
  generateSopNumber 
} from '../utils/numbering';
import { createSystemBackup, downloadSystemBackup, restoreSystemBackup } from '../lib/backupService';
import { bulkUpdateSops, saveConfigToLocal, subscribeToNumberingConfig } from '../lib/sopService';
import { changeUserPassword } from '../lib/authService';
import { SecurityAccountPanel } from './SecurityAccountPanel';
import { BackupRestorePanel } from './BackupRestorePanel';
import { UserPasswordTab } from './UserPasswordTab';

interface AdminHubPageProps {
  userSession: UserSession;
  userAccounts?: UserAccount[];
  sops?: SopDocument[];
  numberingConfig?: NumberingConfig;
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
  onUpdatePassword?: ((currentPass: string, newPass: string) => Promise<{ success: boolean; message: string }>) | ((newPassword: string) => Promise<any>);
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
  onStandardizeAllNumbers?: () => void;
}

type AdminSubTab = 'tools' | 'sync' | 'security' | 'backup' | 'password';

export const AdminHubPage: React.FC<AdminHubPageProps> = ({
  userSession,
  userAccounts = [],
  sops = [],
  numberingConfig: propNumberingConfig,
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

  // Local Numbering Config State
  const [config, setConfig] = useState<NumberingConfig>(propNumberingConfig || DEFAULT_NUMBERING_CONFIG);
  const [isNumberingModalOpen, setIsNumberingModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<NumberingConfig>(propNumberingConfig || DEFAULT_NUMBERING_CONFIG);

  // Sync execution state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFilter, setSyncFilter] = useState<'all' | 'changed' | 'standard' | 'legacy'>('all');
  const [syncSearch, setSyncSearch] = useState('');

  // Backup & Restore internal state for self-contained execution
  const [isLocalRestoring, setIsLocalRestoring] = useState(false);
  const [localRestoreProgress, setLocalRestoreProgress] = useState('');

  // Subscribe to persistent numbering config updates
  useEffect(() => {
    if (propNumberingConfig) {
      setConfig(propNumberingConfig);
      setEditingConfig(propNumberingConfig);
    }
    const unsub = subscribeToNumberingConfig((newCfg) => {
      if (newCfg) {
        setConfig(newCfg);
        setEditingConfig(newCfg);
      }
    });
    return () => unsub();
  }, [propNumberingConfig]);

  // Live analysis of SOP numbering status
  const standardSopsCount = useMemo(() => {
    return sops.filter((s) => !s.isLegacySop && s.documentType !== 'LAMA' && !(s as any).isNumberReservation).length;
  }, [sops]);

  const syncAnalysis = useMemo(() => {
    if (!sops || sops.length === 0) {
      return { changedCount: 0, duplicateCount: 0, changes: [], updatedSops: [] };
    }
    return standardizeAllSops(sops);
  }, [sops]);

  // Map updated SOPs by ID for fast lookup in preview table
  const updatedSopMap = useMemo(() => {
    const map = new Map<string, SopDocument>();
    syncAnalysis.updatedSops.forEach((s) => {
      if (s.id) map.set(s.id, s);
    });
    return map;
  }, [syncAnalysis.updatedSops]);

  // Filtered SOPs for Sync Table
  const filteredSyncSops = useMemo(() => {
    return sops.filter((s) => {
      const isLegacy = Boolean(s.isLegacySop || s.documentType === 'LAMA');
      const updated = updatedSopMap.get(s.id);
      const isChanged = Boolean(updated && updated.sopNumber !== s.sopNumber);

      if (syncFilter === 'changed' && !isChanged) return false;
      if (syncFilter === 'standard' && (isLegacy || isChanged)) return false;
      if (syncFilter === 'legacy' && !isLegacy) return false;

      if (syncSearch.trim()) {
        const q = syncSearch.toLowerCase();
        const titleMatch = s.title?.toLowerCase().includes(q);
        const numMatch = s.sopNumber?.toLowerCase().includes(q) || s.legacySopNumber?.toLowerCase().includes(q);
        const divMatch = s.divisionCode?.toLowerCase().includes(q) || s.subHierarchyCode?.toLowerCase().includes(q);
        return Boolean(titleMatch || numMatch || divMatch);
      }

      return true;
    });
  }, [sops, updatedSopMap, syncFilter, syncSearch]);

  // Sample generated number for live preview in Numbering Config Modal
  const sampleNumberPreview = useMemo(() => {
    return generateSopNumber({
      config: editingConfig,
      divisionCode: 'PEL',
      subHierarchyCode: '1.1.3',
      sequenceNum: 1,
      dateStr: new Date().toISOString()
    }).sopNumber;
  }, [editingConfig]);

  // Self-contained password update handler with fallback
  const handlePasswordUpdate = async (currentPass: string, newPass: string): Promise<{ success: boolean; message: string }> => {
    if (onUpdatePassword) {
      try {
        if (onUpdatePassword.length >= 2) {
          const res = await (onUpdatePassword as (c: string, n: string) => Promise<{ success: boolean; message: string }>)(currentPass, newPass);
          return res;
        } else {
          await (onUpdatePassword as (n: string) => Promise<any>)(newPass);
          return { success: true, message: 'Kata sandi berhasil diperbarui.' };
        }
      } catch (err: any) {
        return { success: false, message: err?.message || 'Gagal memperbarui kata sandi.' };
      }
    }
    return changeUserPassword(userSession.username, currentPass, newPass);
  };

  // Self-contained backup execution with fallback
  const handleBackupAction = async () => {
    if (onBackup) {
      onBackup();
      return;
    }
    try {
      const backup = await createSystemBackup(userSession.username);
      const filename = downloadSystemBackup(backup);
      onShowToast?.('success', 'Backup Berhasil Dibuat', `File arsip ${filename} berhasil diunduh ke komputer.`);
    } catch (err: any) {
      onShowToast?.('error', 'Gagal Membuat Backup', err?.message || 'Terjadi kesalahan sistem saat membuat cadangan data.');
    }
  };

  // Self-contained restore execution with fallback
  const handleRestoreAction = () => {
    if (onRestore) {
      onRestore();
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setIsLocalRestoring(true);
      setLocalRestoreProgress('Memvalidasi snapshot dan memulihkan seluruh database sistem...');
      try {
        const res = await restoreSystemBackup(file, userSession.username);
        onShowToast?.('success', 'Sistem Berhasil Dipulihkan!', `Berhasil memulihkan ${res.sops.length} dokumen SPO dan ${res.users.length} akun pengguna.`);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } catch (err: any) {
        onShowToast?.('error', 'Gagal Memulihkan Snapshot', err?.message || 'File cadangan tidak valid atau struktur data tidak sesuai.');
      } finally {
        setIsLocalRestoring(false);
        setLocalRestoreProgress('');
      }
    };
    input.click();
  };

  // Self-contained sync execution with fallback
  const handleRunSync = async () => {
    if (syncAnalysis.changedCount === 0) {
      onShowToast?.('info', 'Penomoran Sudah Standar Baku', 'Semua nomor dokumen SPO sudah 100% unik dan sesuai pedoman tata naskah.');
      return;
    }

    if (onStandardizeAllNumbers) {
      onStandardizeAllNumbers();
      return;
    }

    setIsSyncing(true);
    try {
      const { updatedSops, changedCount, changes, duplicateCount } = syncAnalysis;
      const changedIds = updatedSops
        .filter((s) => changes.some((c) => c.newNumber === s.sopNumber))
        .map((s) => s.id);

      await bulkUpdateSops(updatedSops, changedIds);

      const summaryList = changes
        .slice(0, 4)
        .map((c) => `• ${c.oldNumber} ➔ ${c.newNumber}`)
        .join('\n');
      const remaining = changes.length > 4 ? `\n...dan ${changes.length - 4} dokumen lainnya.` : '';

      onShowToast?.(
        'success',
        `${changedCount} Nomor SPO Berhasil Disesuaikan!`,
        `${duplicateCount > 0 ? `Ditemukan & diperbaiki ${duplicateCount} nomor duplikat per unit.\n` : ''}Seluruh format nomor unit telah distandarkan:\n${summaryList}${remaining}`
      );
    } catch (err: any) {
      onShowToast?.('error', 'Gagal Menstandarkan Nomor', err?.message || 'Terjadi kesalahan sistem saat menyimpan nomor ke database.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Save numbering config
  const handleSaveNumberingConfig = async () => {
    try {
      await saveConfigToLocal(editingConfig);
      setConfig(editingConfig);
      setIsNumberingModalOpen(false);
      onShowToast?.('success', 'Format Penomoran Disimpan', 'Aturan penomoran otomatis berhasil diperbarui.');
    } catch (err: any) {
      onShowToast?.('error', 'Gagal Menyimpan Format', err?.message || 'Terjadi kesalahan saat menyimpan konfigurasi.');
    }
  };

  // Reset numbering config to RSUD Dr. Soegiri standard
  const handleResetDefaultConfig = async () => {
    try {
      await saveConfigToLocal(DEFAULT_NUMBERING_CONFIG);
      setConfig(DEFAULT_NUMBERING_CONFIG);
      setEditingConfig(DEFAULT_NUMBERING_CONFIG);
      onShowToast?.('info', 'Format Diatur Ulang', 'Format penomoran dikembalikan ke Standar Baku RSUD Dr. Soegiri Lamongan.');
    } catch (err: any) {
      onShowToast?.('error', 'Gagal Mereset Format', err?.message || 'Terjadi kesalahan.');
    }
  };

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

        {/* Change Password Card for Unit User */}
        <UserPasswordTab
          userSession={userSession}
          onLogout={onLogout || (() => {})}
          onUpdatePassword={handlePasswordUpdate}
          onShowToast={onShowToast}
        />
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
              <span>Admin Root: {userSession.username}</span>
            </div>
          </div>
        </div>

        {/* Admin Navigation Sub-Tabs */}
        <div className="mt-5 flex items-center gap-2 border-b border-slate-100 pb-3 overflow-x-auto">
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
                onClick={() => {
                  if (onOpenMasterData) {
                    onOpenMasterData();
                  } else {
                    onShowToast?.('info', 'Master Data', 'Fitur Master Hirarki & Unit Kerja diaktifkan.');
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <span>Buka Master Hirarki</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card 2: Manajemen User & Akun */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-700 w-fit mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">Manajemen User & Akun</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Tambah akun user, atur penugasan multi-hirarki/bidang unit, reset password, dan pantau status login pengguna.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  if (onOpenUserManagement) {
                    onOpenUserManagement();
                  } else {
                    onShowToast?.('info', 'Manajemen User', 'Fitur Manajemen Akun & User diaktifkan.');
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <span>Kelola User ({userAccounts.length})</span>
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
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900">Format Penomoran SPO</h3>
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                  Standar Soegiri
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Atur format baku penomoran naskah SPO (Prefix, Padding digit nomor, Bulan Romawi, & Reset Counter tahunan).
              </p>
              <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700 truncate">
                {sampleNumberPreview}
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  if (onOpenNumberingConfig) {
                    onOpenNumberingConfig();
                  } else {
                    setEditingConfig({ ...config });
                    setIsNumberingModalOpen(true);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <Sliders className="w-4 h-4" />
                <span>Atur Format Penomoran</span>
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
                Aktifkan mode pemeliharaan sistem dengan pesan pengumuman real-time ke seluruh user yang sedang aktif.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const fn = onOpenMaintenanceModal || onOpenMaintenance;
                  if (fn) {
                    fn();
                  } else {
                    onShowToast?.('info', 'Mode Pemeliharaan', 'Panel Mode Pemeliharaan dibuka.');
                  }
                }}
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
                <span>Buka Panel Backup & Restore</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card 6: Per-Device Session Monitor */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-blue-300 transition-all group">
            <div>
              <div className="p-3 rounded-2xl bg-blue-50 text-blue-700 w-fit mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">Audit Sesi & Keamanan</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Pantau sesi per perangkat, riwayat audit login, dan pencabutan sesi yang tidak sah.
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

          {/* Card 7: Sinkronkan Nomor SPO */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-purple-300 transition-all group md:col-span-2 lg:col-span-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-purple-50 text-purple-700 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <RefreshCw className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Sinkronisasi & Standarisasi Nomor SPO</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Standarisasi nomor urut per unit kerja sesuai Pedoman Tata Naskah Soegiri serta rapikan nomor duplikat secara otomatis.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs pt-2">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Dokumen Standar: <strong>{standardSopsCount}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <AlertTriangle className={`w-4 h-4 ${syncAnalysis.changedCount > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
                    <span>Perlu Sinkronisasi: <strong className={syncAnalysis.changedCount > 0 ? 'text-amber-600' : 'text-slate-800'}>{syncAnalysis.changedCount}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <ShieldAlert className={`w-4 h-4 ${syncAnalysis.duplicateCount > 0 ? 'text-rose-500' : 'text-slate-400'}`} />
                    <span>Duplikat: <strong className={syncAnalysis.duplicateCount > 0 ? 'text-rose-600' : 'text-slate-800'}>{syncAnalysis.duplicateCount}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('sync')}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-2"
                >
                  <span>Buka Panel Sinkronisasi</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SubTab 2: Dedicated Panel Sinkronisasi Nomor SPO */}
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
                <button
                  type="button"
                  onClick={() => setActiveSubTab('tools')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                >
                  ← Kembali ke Menu
                </button>
                <button
                  type="button"
                  onClick={handleRunSync}
                  disabled={isSyncing || syncAnalysis.changedCount === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-black transition-all cursor-pointer shadow-sm shadow-purple-200"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Menyinkronkan...' : 'Jalankan Sinkronisasi Nomor Sekarang'}</span>
                </button>
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
              <button
                type="button"
                onClick={() => {
                  setEditingConfig({ ...config });
                  setIsNumberingModalOpen(true);
                }}
                className="shrink-0 px-3.5 py-1.5 rounded-xl bg-white border border-purple-300 text-purple-900 font-bold text-xs hover:bg-purple-100 transition-colors"
              >
                Konfigurasi Format
              </button>
            </div>
          </div>

          {/* Table Preview with Filters and Search */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Pratinjau Penomoran
                </span>
                <span className="text-xs text-slate-500 font-bold">
                  ({filteredSyncSops.length} dari {sops.length})
                </span>
              </div>

              {/* Filters & Search */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={syncSearch}
                    onChange={(e) => setSyncSearch(e.target.value)}
                    placeholder="Cari judul atau nomor..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  />
                </div>

                <div className="flex items-center rounded-xl bg-slate-200/70 p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setSyncFilter('all')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      syncFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncFilter('changed')}
                    className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                      syncFilter === 'changed' ? 'bg-white text-amber-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>Perlu Diperbaiki</span>
                    {syncAnalysis.changedCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-black">
                        {syncAnalysis.changedCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncFilter('standard')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      syncFilter === 'standard' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sudah Baku
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncFilter('legacy')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      syncFilter === 'legacy' ? 'bg-white text-purple-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Eksisting (Asli)
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-wider z-10">
                  <tr>
                    <th className="px-4 py-3">No</th>
                    <th className="px-4 py-3">Judul SPO</th>
                    <th className="px-4 py-3">Jenis Naskah</th>
                    <th className="px-4 py-3">Nomor Terdaftar</th>
                    <th className="px-4 py-3">Nomor Hasil Standarisasi</th>
                    <th className="px-4 py-3">Bidang / Unit</th>
                    <th className="px-4 py-3">Status Sinkron</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSyncSops.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-medium">
                        Tidak ada dokumen SPO yang cocok dengan kriteria filter.
                      </td>
                    </tr>
                  ) : (
                    filteredSyncSops.map((s, idx) => {
                      const isLegacy = Boolean(s.isLegacySop || s.documentType === 'LAMA');
                      const updated = updatedSopMap.get(s.id);
                      const isChanged = Boolean(updated && updated.sopNumber !== s.sopNumber);

                      return (
                        <tr key={s.id || idx} className={`transition-colors ${isChanged ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50/80'}`}>
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
                          <td className="px-4 py-3 font-mono text-xs font-bold">
                            {isLegacy ? (
                              <span className="text-slate-400 italic">Tetap (Asli)</span>
                            ) : isChanged ? (
                              <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                {updated?.sopNumber}
                              </span>
                            ) : (
                              <span className="text-emerald-700">
                                {updated?.sopNumber || s.sopNumber}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-[11px]">
                            {s.divisionCode || 'PEL'} {s.subHierarchyCode ? `(${s.subHierarchyCode})` : ''}
                          </td>
                          <td className="px-4 py-3">
                            {isLegacy ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700">
                                <Check className="w-3 h-3" /> Asli
                              </span>
                            ) : isChanged ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                <AlertTriangle className="w-3 h-3 text-amber-600" /> Perlu Update
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sesuai Baku
                              </span>
                            )}
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

      {/* SubTab 3: Security & Session Guard Panel */}
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

      {/* SubTab 4: Backup & Restore Panel */}
      {activeSubTab === 'backup' && (
        <BackupRestorePanel
          inline={true}
          userSession={userSession}
          onBackup={handleBackupAction}
          onRestore={handleRestoreAction}
          isRestoring={isRestoring || isLocalRestoring}
          restoreProgress={restoreProgress || localRestoreProgress}
          onShowToast={onShowToast}
        />
      )}

      {/* SubTab 5: Change Admin Password */}
      {activeSubTab === 'password' && (
        <UserPasswordTab
          userSession={userSession}
          onLogout={onLogout || (() => {})}
          onUpdatePassword={handlePasswordUpdate}
          onShowToast={onShowToast}
        />
      )}

      {/* Modal: Format Penomoran SPO */}
      {isNumberingModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300">
                  <Hash className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Format & Aturan Penomoran SPO</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Pedoman Tata Naskah RSUD Dr. Soegiri Lamongan</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNumberingModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Live Preview Box */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/80 to-amber-100/40 border border-amber-200">
                <div className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  Pratinjau Nomor Otomatis SPO:
                </div>
                <div className="mt-2 text-lg font-black font-mono text-slate-900 tracking-wider bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
                  {sampleNumberPreview}
                </div>
                <div className="mt-2 text-[10px] text-amber-800 flex items-center gap-2">
                  <span>Template aktif:</span>
                  <code className="bg-white/80 px-2 py-0.5 rounded font-mono text-slate-800 border border-amber-200">
                    {editingConfig.template}
                  </code>
                </div>
              </div>

              {/* Presets */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  Pilih Format Template Baku:
                </label>
                <div className="space-y-2">
                  {NUMBERING_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setEditingConfig((prev) => ({
                          ...prev,
                          template: preset.template,
                          separator: preset.separator,
                          mode: preset.mode,
                          useRomanMonth: preset.template.includes('BULAN_ROMAWI')
                        }));
                      }}
                      className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                        editingConfig.template === preset.template
                          ? 'border-amber-400 bg-amber-50/60 font-bold text-amber-950'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold">{preset.name}</div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">{preset.example}</div>
                      </div>
                      {editingConfig.template === preset.template && (
                        <Check className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Granular Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Prefix Default:
                  </label>
                  <input
                    type="text"
                    value={editingConfig.prefix}
                    onChange={(e) => setEditingConfig({ ...editingConfig, prefix: e.target.value.toUpperCase() })}
                    placeholder="Contoh: PEL"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Kode pelayanan dasar dokumen</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Padding Digit Nomor Urut:
                  </label>
                  <select
                    value={editingConfig.numberPadding}
                    onChange={(e) => setEditingConfig({ ...editingConfig, numberPadding: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value={1}>1 digit (1, 2, 3...)</option>
                    <option value={2}>2 digit (01, 02, 03...)</option>
                    <option value={3}>3 digit (001, 002, 003...) - Standar Baku Soegiri</option>
                    <option value={4}>4 digit (0001, 0002...)</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">Format padding penomoran naskah</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanda Pemisah (Separator):
                  </label>
                  <select
                    value={editingConfig.separator}
                    onChange={(e) => setEditingConfig({ ...editingConfig, separator: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value=" / ">Garis miring berjarak ( " / " ) - Standar Soegiri</option>
                    <option value="/">Garis miring rapat ( "/" )</option>
                    <option value="-">Tanda hubung strip ( "-" )</option>
                    <option value=".">Titik ( "." )</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Siklus Reset Nomor Urut:
                  </label>
                  <select
                    value={editingConfig.resetSequence}
                    onChange={(e) => setEditingConfig({ ...editingConfig, resetSequence: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value="yearly">Tahunan (Reset setiap 1 Januari) - Rekomendasi</option>
                    <option value="monthly">Bulanan (Reset setiap awal bulan)</option>
                    <option value="never">Tidak Pernah (Urutan berlanjut selamanya)</option>
                  </select>
                </div>
              </div>

              {/* Month Roman Toggle */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">Sertakan Bulan Romawi</div>
                  <p className="text-[10px] text-slate-500">Contoh: PEL / 1.1.3 / 001 / VIII / 2026</p>
                </div>
                <input
                  type="checkbox"
                  checked={editingConfig.useRomanMonth}
                  onChange={(e) => setEditingConfig({ ...editingConfig, useRomanMonth: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetDefaultConfig}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 text-xs transition-colors cursor-pointer"
              >
                Kembalikan Standar Soegiri
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsNumberingModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 text-xs transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveNumberingConfig}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs transition-all shadow-xs cursor-pointer"
                >
                  Simpan Format Penomoran
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

