import React, { useState } from 'react';
import {
  ShieldCheck, LogOut, FileText, FileCheck, Handshake,
  Menu as MenuIcon, X, Lock, Home, UserRound, Upload, ChevronRight, Database, Wrench
} from 'lucide-react';
import { UserSession, MainMenuTab } from '../types';
import { HospitalLogo } from './HospitalLogo';

interface HeaderProps {
  activeTab: MainMenuTab;
  onTabChange: (tab: MainMenuTab) => void;
  totalSopCount: number;
  activeSopCount: number;
  skCount?: number;
  mouCount?: number;
  finalDocCount?: number;
  userSession?: UserSession | null;
  onLogout?: () => void;
  onOpenUpload?: () => void;
  onOpenPrintAll?: () => void;
  onOpenUserManagement?: () => void;
  onOpenMasterData?: () => void;
  onOpenSecurity?: () => void;
  onOpenBackupRestore?: () => void;
  onOpenMaintenance?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab, onTabChange, totalSopCount, activeSopCount, skCount = 0, mouCount = 0,
  finalDocCount = 0, userSession, onLogout, onOpenUserManagement, onOpenMasterData, onOpenSecurity, onOpenBackupRestore, onOpenMaintenance
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = userSession?.role === 'admin';

    const userItems: Array<{ id: MainMenuTab; label: string; icon: React.ComponentType<{className?: string}>; count?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'spo', label: 'SPO', icon: FileText, count: totalSopCount },
    { id: 'sk', label: 'SK', icon: FileCheck, count: skCount },
    { id: 'mou', label: 'MOU', icon: Handshake, count: mouCount },
      { id: 'profile', label: 'Profil', icon: UserRound },
  ];

  const handleSelect = (tab: MainMenuTab) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // User uses the requested permanent left sidebar. Admin keeps the existing top navigation.
  if (!isAdmin) {
    return (
      <>
        <aside className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200/90 shadow-sm flex-col no-print select-none">
          {/* Brand Header */}
          <div className="h-20 px-5 flex items-center gap-3.5 border-b border-slate-100">
            <HospitalLogo size="md" />
            <div className="min-w-0">
              <div className="font-black text-slate-900 tracking-tight text-sm leading-tight">SIDOKTER SOEGIRI</div>
              <div className="text-[11px] text-emerald-700 font-bold truncate">RSUD Dr. Soegiri Lamongan</div>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="flex-1 p-3.5 space-y-1.5 overflow-y-auto">
            <div className="px-3 pt-2 pb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
              Menu Utama
            </div>
            {userItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all text-left cursor-pointer group ${
                    active
                      ? 'bg-emerald-600 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4.5 h-4.5 shrink-0 transition-transform group-hover:scale-105 ${active ? 'text-white' : 'text-slate-400 group-hover:text-emerald-600'}`} />
                  <span className="flex-1 text-xs">{item.label}</span>
                  {typeof item.count === 'number' && item.count >= 0 && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-black min-w-5 text-center transition-colors ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-800'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                  {active && <ChevronRight className="w-3.5 h-3.5 opacity-80 shrink-0" />}
                </button>
              );
            })}
          </nav>

          {/* User Profile Card & Logout at Bottom */}
          <div className="p-3.5 border-t border-slate-100">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100/80">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-xs shrink-0 ring-1 ring-emerald-200">
                {(userSession?.name || userSession?.username || 'P')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-slate-800 truncate leading-tight">{userSession?.name || 'User'}</div>
                <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5">{userSession?.unitName || userSession?.divisionCode || 'User Unit'}</div>
                {Array.isArray(userSession?.badges) && userSession?.badges.some((b) => String(b).toUpperCase() === 'STRUKTURAL') && (
                  <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-black tracking-wide shadow-sm">
                    <ShieldCheck className="w-3 h-3" /> STRUKTURAL
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onLogout}
                title="Keluar dari Akun"
                className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile Topbar & Drawer */}
        <div className="lg:hidden sticky top-0 z-50 bg-white border-b border-slate-200 no-print">
          <div className="h-16 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <HospitalLogo size="sm" />
              <div>
                <span className="font-black text-xs text-slate-900 block leading-tight">SIDOKTER SOEGIRI</span>
                <span className="text-[10px] text-slate-500 font-medium truncate block">RSUD Dr. Soegiri Lamongan</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(v => !v)}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-700 cursor-pointer"
              aria-label="Buka Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
          {mobileMenuOpen && (
            <nav className="p-3 border-t border-slate-100 space-y-1.5 bg-white shadow-xl animate-in slide-in-from-top-2 duration-150">
              {userItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-left cursor-pointer ${
                      active ? 'bg-emerald-600 text-white font-black' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4.5 h-4.5" />
                    <span className="flex-1">{item.label}</span>
                    {typeof item.count === 'number' && item.count >= 0 && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
              {Array.isArray(userSession?.badges) && userSession?.badges.some((b) => String(b).toUpperCase() === 'STRUKTURAL') && (
                <div className="mt-2 px-3.5 py-2.5 rounded-xl bg-amber-500 text-white shadow-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[9px] font-black tracking-wider">BADGE AKSES</div>
                    <div className="text-xs font-black">STRUKTURAL</div>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer pt-2 border-t border-slate-100 mt-2"
              >
                <LogOut className="w-4.5 h-4.5" />
                <span>Keluar Akun</span>
              </button>
            </nav>
          )}
        </div>
      </>
    );
  }

  const adminItems: Array<{ id: MainMenuTab; label: string; icon: React.ComponentType<{className?: string}>; count?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'spo', label: 'SPO', icon: FileText, count: totalSopCount },
    { id: 'sk', label: 'SK', icon: FileCheck, count: skCount },
    { id: 'mou', label: 'MOU', icon: Handshake, count: mouCount },
    { id: 'profile', label: 'Profil', icon: UserRound },
  ];

  return (
    <>
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200/90 shadow-sm flex-col no-print select-none">
        <div className="h-20 px-5 flex items-center gap-3.5 border-b border-slate-100">
          <HospitalLogo size="md" />
          <div className="min-w-0">
            <div className="font-black text-slate-900 tracking-tight text-sm leading-tight">SIDOKTER SOEGIRI</div>
            <div className="text-[11px] text-emerald-700 font-bold truncate">RSUD Dr. Soegiri Lamongan</div>
          </div>
        </div>

        <nav className="flex-1 p-3.5 space-y-1.5 overflow-y-auto">
          <div className="px-3 pt-2 pb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Menu Utama</div>
          {adminItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button key={item.id} type="button" onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all text-left cursor-pointer group ${active ? 'bg-emerald-600 text-white shadow-xs font-black' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                <Icon className={`w-4.5 h-4.5 shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-emerald-600'}`} />
                <span className="flex-1 text-xs">{item.label}</span>
                {typeof item.count === 'number' && item.count >= 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-black min-w-5 text-center ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-800'}`}>{item.count}</span>
                )}
                {active && <ChevronRight className="w-3.5 h-3.5 opacity-80 shrink-0" />}
              </button>
            );
          })}

          <div className="px-3 pt-6 pb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Administrasi</div>
          <button type="button" onClick={onOpenUserManagement} className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-left cursor-pointer">
            <ShieldCheck className="w-4.5 h-4.5 text-slate-400" /><span className="flex-1">Manajemen User</span>
          </button>
          <button type="button" onClick={onOpenMasterData} className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-left cursor-pointer">
            <Database className="w-4.5 h-4.5 text-slate-400" /><span className="flex-1">Master Hirarki & Unit</span>
          </button>
          <button type="button" onClick={onOpenSecurity} className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-left cursor-pointer">
            <Lock className="w-4.5 h-4.5 text-slate-400" /><span className="flex-1">Security</span>
          </button>
          <button type="button" onClick={onOpenBackupRestore} className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-left cursor-pointer">
            <Database className="w-4.5 h-4.5 text-slate-400" /><span className="flex-1">Backup & Restore</span>
          </button>
          <button type="button" onClick={onOpenMaintenance} className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-left cursor-pointer">
            <Wrench className="w-4.5 h-4.5 text-slate-400" /><span className="flex-1">Mode Pemeliharaan</span>
          </button>
        </nav>

        <div className="p-3.5 border-t border-slate-100">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100/80">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs shrink-0">{(userSession?.name || userSession?.username || 'A')[0].toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black text-slate-800 truncate leading-tight">{userSession?.name || 'Administrator'}</div>
              <div className="text-[10px] text-emerald-700 font-bold truncate mt-0.5">Administrator</div>
            </div>
            <button type="button" onClick={onLogout} title="Keluar dari Akun" className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </aside>

      <div className="lg:hidden sticky top-0 z-50 bg-white border-b border-slate-200 no-print">
        <div className="h-16 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0"><HospitalLogo size="sm" /><div><span className="font-black text-xs text-slate-900 block leading-tight">SIDOKTER SOEGIRI</span><span className="text-[10px] text-slate-500 font-medium truncate block">RSUD Dr. Soegiri Lamongan</span></div></div>
          <button type="button" onClick={() => setMobileMenuOpen(v => !v)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-700 cursor-pointer" aria-label="Buka Menu">{mobileMenuOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}</button>
        </div>
        {mobileMenuOpen && (
          <nav className="p-3 border-t border-slate-100 space-y-1.5 bg-white shadow-xl">
            {adminItems.map((item) => {
              const Icon = item.icon; const active = activeTab === item.id;
              return <button key={item.id} type="button" onClick={() => handleSelect(item.id)} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-left cursor-pointer ${active ? 'bg-emerald-600 text-white font-black' : 'text-slate-700 hover:bg-slate-100'}`}><Icon className="w-4.5 h-4.5" /><span className="flex-1">{item.label}</span>{typeof item.count === 'number' && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{item.count}</span>}</button>;
            })}
            <div className="pt-3 mt-2 border-t border-slate-100 space-y-1.5">
              <button type="button" onClick={onOpenUserManagement} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 text-left"><ShieldCheck className="w-4.5 h-4.5" /><span className="flex-1">Manajemen User</span></button>
              <button type="button" onClick={onOpenMasterData} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 text-left"><Database className="w-4.5 h-4.5" /><span className="flex-1">Master Hirarki & Unit</span></button>
              <button type="button" onClick={onOpenSecurity} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 text-left"><Lock className="w-4.5 h-4.5" /><span className="flex-1">Security</span></button>
              <button type="button" onClick={onOpenBackupRestore} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 text-left"><Database className="w-4.5 h-4.5" /><span className="flex-1">Backup & Restore</span></button>
              <button type="button" onClick={onOpenMaintenance} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 text-left"><Wrench className="w-4.5 h-4.5" /><span className="flex-1">Mode Pemeliharaan</span></button>
            </div>
            <button type="button" onClick={onLogout} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 text-left"><LogOut className="w-4.5 h-4.5" /><span>Keluar Akun</span></button>
          </nav>
        )}
      </div>
    </>
  );

};
