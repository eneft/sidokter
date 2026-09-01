import React from 'react';
import {
  FileCheck2,
  Files,
  Clock,
  FileX2,
  ArrowUpRight
} from 'lucide-react';
import { SopDocument } from '../types';

interface DashboardStatsProps {
  sops: SopDocument[];
  pendingSignatureCount?: number;
  onNewSop?: () => void;
  onFilterByStatus?: (status: string) => void;
  activeStatusFilter?: string;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  sops,
  pendingSignatureCount = 0,
  onFilterByStatus,
  activeStatusFilter = '',
}) => {
  const total = sops?.length || 0;
  const activeCount = (sops || []).filter(s => s.status === 'AKTIF').length;
  const inactiveCount = (sops || []).filter(s => s.status === 'DIARSIPKAN').length;
  const pendingCount = pendingSignatureCount > 0 
    ? pendingSignatureCount 
    : (sops || []).filter(s => s.status === 'DRAFT').length;

  const stats = [
    {
      id: 'all',
      statusKey: '',
      title: 'Total SPO',
      value: total,
      subtitle: 'Seluruh dokumen',
      icon: Files,
      accentBg: 'bg-slate-100 text-slate-700',
      activeRing: 'ring-2 ring-slate-800 bg-slate-50/90',
      tag: 'Semua',
      tagColor: 'bg-slate-100 text-slate-700 border-slate-200'
    },
    {
      id: 'active',
      statusKey: 'AKTIF',
      title: 'SPO Aktif',
      value: activeCount,
      subtitle: 'Berlaku operasional',
      icon: FileCheck2,
      accentBg: 'bg-emerald-50 text-emerald-600',
      activeRing: 'ring-2 ring-emerald-600 bg-emerald-50/40',
      tag: 'Operasional',
      tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    {
      id: 'pending',
      statusKey: 'DRAFT',
      title: 'Draft',
      value: pendingCount,
      subtitle: 'Proses TTD Direktur',
      icon: Clock,
      accentBg: 'bg-amber-50 text-amber-600',
      activeRing: 'ring-2 ring-amber-500 bg-amber-50/40',
      tag: 'Draft',
      tagColor: 'bg-amber-50 text-amber-700 border-amber-200'
    },
    {
      id: 'inactive',
      statusKey: 'DIARSIPKAN',
      title: 'Diarsipkan',
      value: inactiveCount,
      subtitle: 'Kedaluwarsa / diganti',
      icon: FileX2,
      accentBg: 'bg-rose-50 text-rose-600',
      activeRing: 'ring-2 ring-rose-500 bg-rose-50/40',
      tag: 'Diarsipkan',
      tagColor: 'bg-rose-50 text-rose-700 border-rose-200'
    }
  ];

  return (
    <section className="no-print" aria-label="Ringkasan Statistik SPO">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {stats.map((item) => {
          const Icon = item.icon;
          const isSelected = activeStatusFilter === item.statusKey;
          
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterByStatus && onFilterByStatus(item.statusKey)}
              className={`text-left p-4 sm:p-5 rounded-2xl border bg-white transition-all duration-150 hover:shadow-md cursor-pointer relative group flex flex-col justify-between ${
                isSelected 
                  ? `${item.activeRing} border-transparent shadow-xs` 
                  : 'border-slate-200/80 hover:border-slate-300 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`w-10 h-10 rounded-xl ${item.accentBg} flex items-center justify-center shrink-0 transition-transform group-hover:scale-105`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.tagColor} shrink-0`}>
                  {item.tag}
                </span>
              </div>

              <div className="mt-4">
                <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {item.value.toLocaleString('id-ID')}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div>
                    <div className="text-xs font-bold text-slate-700">{item.title}</div>
                    <div className="text-[11px] text-slate-400 font-medium">{item.subtitle}</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition-colors opacity-0 group-hover:opacity-100" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
