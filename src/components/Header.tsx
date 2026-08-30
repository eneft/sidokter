import React, { useState } from 'react';
import {
  ShieldCheck, LogOut, FileText, FileCheck, Handshake, BookOpen,
  Menu as MenuIcon, X, Lock, Home, UserRound, Upload, ChevronRight
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
}

export const Header: React.FC<HeaderProps> = ({
  activeTab, onTabChange, totalSopCount, activeSopCount, skCount = 0, mouCount = 0,
  finalDocCount = 0, userSession, onLogout
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = userSession?.role === 'admin';

  // Library = SPO Aktif count
  const petugasItems: Array<{ id: MainMenuTab; label: string; icon: React.ComponentType<{className?: string}>; count?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'spo', label: 'SPO', icon: FileText, count: totalSopCount },
    { id: 'sk', label: 'SK', icon: FileCheck, count: skCount },
    { id: 'mou', label: 'MOU', icon: Handshake, count: mouCount },
    { id: 'library', label: 'Library', icon: BookOpen, count: activeSopCount },
    { id: 'profile', label: 'Profil', icon: UserRound },
  ];

  const handleSelect = (tab: MainMenuTab) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Petugas uses the requested permanent left sidebar. Admin keeps the existing top navigation.
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
            {petugasItems.map((item) => {
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
                <div className="text-xs font-black text-slate-800 truncate leading-tight">{userSession?.name || 'Petugas'}</div>
                <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5">{userSession?.unitName || userSession?.divisionCode || 'Petugas Unit'}</div>
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
              {petugasItems.map((item) => {
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

  const adminItems = [
    { id: 'dashboard' as MainMenuTab, label: 'Dashboard', icon: Home },
    { id: 'spo' as MainMenuTab, label: 'SPO', icon: FileText, count: totalSopCount },
    { id: 'sk' as MainMenuTab, label: 'SK', icon: FileCheck, count: skCount },
    { id: 'mou' as MainMenuTab, label: 'MOU', icon: Handshake, count: mouCount },
    { id: 'library' as MainMenuTab, label: 'Library', icon: BookOpen, count: finalDocCount },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        <button type="button" onClick={() => handleSelect('dashboard')} className="flex items-center gap-3 min-w-0 text-left">
          <HospitalLogo size="md" />
          <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-black text-slate-900">SIDOKTER SOEGIRI</span><span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200"><ShieldCheck className="inline w-3 h-3 mr-1" />Admin</span></div><p className="text-xs text-slate-500">RSUD Dr. Soegiri Lamongan</p></div>
        </button>
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          {adminItems.map(item => { const Icon=item.icon; const active=activeTab===item.id; return <button key={item.id} type="button" onClick={()=>handleSelect(item.id)} className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold ${active?'bg-white text-emerald-800 shadow-sm':'text-slate-600 hover:bg-white/70'}`}><Icon className="w-4 h-4" />{item.label}{item.count ? <span className="text-[10px] px-1.5 rounded-md bg-slate-200">{item.count}</span> : null}</button>; })}
        </nav>
        <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center font-black text-xs">{(userSession?.name||'A')[0].toUpperCase()}</div><button type="button" onClick={onLogout} title="Keluar" className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"><LogOut className="w-4 h-4" /></button></div>
      </div>
    </header>
  );
};
