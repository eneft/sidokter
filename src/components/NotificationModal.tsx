import React, { useState } from 'react';
import { 
  Bell, 
  X, 
  CheckCheck, 
  Trash2, 
  FilePlus2, 
  CalendarClock, 
  Volume2, 
  VolumeX, 
  ArrowRight, 
  Check,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { 
  AppNotification, 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  clearNotifications,
  isAudioMuted,
  setAudioMuted
} from '../lib/notificationService';
import { SopDocument } from '../types';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onSelectDocument?: (docId: string, docNumber?: string) => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onSelectDocument
}) => {
  const [filter, setFilter] = useState<'all' | 'assignment' | 'review'>('all');
  const [muted, setMuted] = useState(isAudioMuted());

  if (!isOpen) return null;

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    setAudioMuted(next);
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'all') return true;
    return n.type === filter;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 text-base leading-tight">
                  Pemberitahuan Sistem
                </h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-black text-[10px]">
                    {unreadCount} Baru
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Peringatan penugasan divisi & jadwal riviu berkala dokumen SPO
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mute Toggle */}
            <button
              type="button"
              onClick={handleToggleMute}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              title={muted ? 'Aktifkan Suara Notifikasi' : 'Senyapkan Suara Notifikasi'}
              aria-label="Toggle suara notifikasi"
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4 text-emerald-600" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Tutup modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Toolbar & Filters */}
        <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Semua ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('assignment')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                filter === 'assignment'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              Penugasan Divisi ({notifications.filter((n) => n.type === 'assignment').length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('review')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                filter === 'review'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
              }`}
            >
              Riviu Berkala ({notifications.filter((n) => n.type === 'review').length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllNotificationsAsRead()}
                className="inline-flex items-center gap-1.5 text-slate-600 hover:text-emerald-700 font-bold transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-white"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Tandai Semua Dibaca</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={() => clearNotifications()}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-600 font-bold transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-rose-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Bersihkan</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Bell className="w-6 h-6 opacity-60" />
              </div>
              <h4 className="font-bold text-slate-800 text-sm">Tidak ada pemberitahuan</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {filter === 'all'
                  ? 'Semua dokumen penugasan divisi dan jadwal riviu berkala sudah dalam keadaan mutakhir.'
                  : `Tidak ada pemberitahuan dengan kategori ${filter === 'assignment' ? 'Penugasan Divisi' : 'Riviu Berkala'}.`}
              </p>
            </div>
          ) : (
            filtered.map((item) => {
              const isAssignment = item.type === 'assignment';
              const isReview = item.type === 'review';

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    !item.read
                      ? isAssignment
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : isReview
                        ? 'bg-amber-50/40 border-amber-200'
                        : 'bg-blue-50/40 border-blue-200'
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {/* Icon */}
                    <div className="shrink-0 mt-0.5">
                      {isAssignment ? (
                        <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                          <FilePlus2 className="w-4.5 h-4.5" />
                        </div>
                      ) : isReview ? (
                        <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                          <CalendarClock className="w-4.5 h-4.5" />
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600">
                          <Bell className="w-4.5 h-4.5" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            isAssignment
                              ? 'bg-emerald-100 text-emerald-800'
                              : isReview
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isAssignment ? 'Penugasan Divisi' : isReview ? 'Riviu Berkala' : 'Informasi'}
                        </span>

                        {item.divisionCode && (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {item.divisionCode}
                          </span>
                        )}

                        {item.dueDate && (
                          <span className={`text-[10px] font-semibold flex items-center gap-1 ${
                            item.isOverdue ? 'text-rose-600 font-bold' : 'text-amber-700'
                          }`}>
                            <Clock className="w-3 h-3" />
                            Tempo: {item.dueDate}
                          </span>
                        )}

                        <span className="text-[10px] text-slate-400 ml-auto">
                          {new Date(item.timestamp).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      <h4 className="font-bold text-slate-900 text-sm leading-snug">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {item.message}
                      </p>

                      {/* Action buttons */}
                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100/80">
                        {item.onAction ? (
                          <button
                            type="button"
                            onClick={() => {
                              markNotificationAsRead(item.id);
                              item.onAction?.();
                              onClose();
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer ${
                              isAssignment
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-amber-600 hover:bg-amber-700 text-white'
                            }`}
                          >
                            <span>{item.actionLabel || (isReview ? 'Tinjau Sekarang' : 'Buka Dokumen')}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : item.documentId && onSelectDocument ? (
                          <button
                            type="button"
                            onClick={() => {
                              markNotificationAsRead(item.id);
                              onSelectDocument(item.documentId!, item.documentNumber);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all shadow-2xs active:scale-95 cursor-pointer"
                          >
                            <span>Buka Dokumen</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : <div />}

                        {!item.read && (
                          <button
                            type="button"
                            onClick={() => markNotificationAsRead(item.id)}
                            className="text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors flex items-center gap-1 py-1 px-2 rounded-lg cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Tandai dibaca</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>
            Sistem Pemantauan Regulasi RSUD Dr. Soegiri Lamongan
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
