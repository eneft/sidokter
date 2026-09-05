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
  Clock,
  Stamp,
  FileText
} from 'lucide-react';
import { 
  AppNotification, 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  clearNotifications,
  isAudioMuted,
  setAudioMuted,
  NotificationType
} from '../lib/notificationService';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onSelectDocument?: (docId: string, docNumber?: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} mnt lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(timestamp).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short'
  });
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onSelectDocument
}) => {
  const [filter, setFilter] = useState<'all' | 'activation' | 'proposal' | 'assignment' | 'review'>('all');
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
  const countActivation = notifications.filter((n) => n.type === 'activation').length;
  const countProposal = notifications.filter((n) => n.type === 'proposal').length;
  const countAssignment = notifications.filter((n) => n.type === 'assignment').length;
  const countReview = notifications.filter((n) => n.type === 'review').length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-2xl shadow-xl border border-slate-200/90 w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimalist Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm leading-tight">
                  Pemberitahuan
                </h3>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px]">
                    {unreadCount} baru
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Aktivasi, usulan SPO, penugasan & jadwal riviu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Mute Toggle */}
            <button
              type="button"
              onClick={handleToggleMute}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title={muted ? 'Aktifkan Suara Notifikasi' : 'Senyapkan Suara Notifikasi'}
              aria-label="Toggle suara notifikasi"
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4 text-emerald-600" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Tutup modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Minimalist Filter Bar & Actions */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60 text-xs">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              Semua ({notifications.length})
            </button>

            {countActivation > 0 && (
              <button
                type="button"
                onClick={() => setFilter('activation')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  filter === 'activation'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                Aktivasi ({countActivation})
              </button>
            )}

            {countProposal > 0 && (
              <button
                type="button"
                onClick={() => setFilter('proposal')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  filter === 'proposal'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                Usulan ({countProposal})
              </button>
            )}

            {countAssignment > 0 && (
              <button
                type="button"
                onClick={() => setFilter('assignment')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  filter === 'assignment'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                Penugasan ({countAssignment})
              </button>
            )}

            {countReview > 0 && (
              <button
                type="button"
                onClick={() => setFilter('review')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  filter === 'review'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-amber-700 hover:bg-amber-50'
                }`}
              >
                Riviu ({countReview})
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllNotificationsAsRead()}
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-emerald-700 font-medium transition-colors cursor-pointer py-0.5 px-1.5 rounded hover:bg-white"
              >
                <CheckCheck className="w-3 h-3" />
                <span>Baca Semua</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={() => clearNotifications()}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-600 font-medium transition-colors cursor-pointer py-0.5 px-1.5 rounded hover:bg-rose-50"
              >
                <Trash2 className="w-3 h-3" />
                <span>Hapus</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                <Bell className="w-5 h-5 opacity-40" />
              </div>
              <h4 className="font-semibold text-slate-700 text-xs">Belum ada pemberitahuan</h4>
              <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs mx-auto">
                Semua pembaruan aktivasi SPO, usulan, dan jadwal riviu akan tampil di sini.
              </p>
            </div>
          ) : (
            filtered.map((item) => {
              const isActivation = item.type === 'activation';
              const isProposal = item.type === 'proposal';
              const isAssignment = item.type === 'assignment';
              const isReview = item.type === 'review';

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border transition-all text-left ${
                    !item.read
                      ? isActivation || isAssignment
                        ? 'bg-emerald-50/30 border-emerald-200/80'
                        : isProposal
                        ? 'bg-indigo-50/30 border-indigo-200/80'
                        : isReview
                        ? 'bg-amber-50/30 border-amber-200/80'
                        : 'bg-slate-50 border-slate-200'
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Small Minimal Icon */}
                    <div className="shrink-0 mt-0.5">
                      {isActivation ? (
                        <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
                          <Stamp className="w-3.5 h-3.5" />
                        </div>
                      ) : isProposal ? (
                        <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                      ) : isAssignment ? (
                        <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
                          <FilePlus2 className="w-3.5 h-3.5" />
                        </div>
                      ) : isReview ? (
                        <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
                          <CalendarClock className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center">
                          <Bell className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    {/* Content Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                            isActivation
                              ? 'bg-emerald-100 text-emerald-800'
                              : isProposal
                              ? 'bg-indigo-100 text-indigo-800'
                              : isAssignment
                              ? 'bg-emerald-100 text-emerald-800'
                              : isReview
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isActivation
                            ? 'Aktivasi SPO'
                            : isProposal
                            ? 'Usulan Aktivasi'
                            : isAssignment
                            ? 'Penugasan'
                            : isReview
                            ? 'Riviu Berkala'
                            : 'Info'}
                        </span>

                        {item.divisionCode && (
                          <span className="text-[9px] font-mono font-medium px-1 py-0.2 rounded bg-slate-100 text-slate-600">
                            {item.divisionCode}
                          </span>
                        )}

                        {item.dueDate && (
                          <span className={`text-[9px] font-medium flex items-center gap-1 ${
                            item.isOverdue ? 'text-rose-600 font-bold' : 'text-amber-700'
                          }`}>
                            <Clock className="w-2.5 h-2.5" />
                            {item.dueDate}
                          </span>
                        )}

                        <span className="text-[10px] text-slate-400 ml-auto font-normal">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>

                      <h4 className="font-semibold text-slate-900 text-xs leading-snug">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                        {item.message}
                      </p>

                      {/* Action buttons */}
                      <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-slate-100/60">
                        {item.onAction ? (
                          <button
                            type="button"
                            onClick={() => {
                              markNotificationAsRead(item.id);
                              item.onAction?.();
                              onClose();
                            }}
                            className={`inline-flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer ${
                              isActivation || isAssignment
                                ? 'text-emerald-700 hover:text-emerald-800'
                                : isProposal
                                ? 'text-indigo-700 hover:text-indigo-800'
                                : 'text-slate-800 hover:text-slate-950'
                            }`}
                          >
                            <span>{item.actionLabel || (isProposal ? 'Tinjau & Sahkan' : 'Buka Dokumen')}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : item.documentId && onSelectDocument ? (
                          <button
                            type="button"
                            onClick={() => {
                              markNotificationAsRead(item.id);
                              onSelectDocument(item.documentId!, item.documentNumber);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-800 hover:text-emerald-700 transition-colors cursor-pointer"
                          >
                            <span>Buka Dokumen</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : <div />}

                        {!item.read && (
                          <button
                            type="button"
                            onClick={() => markNotificationAsRead(item.id)}
                            className="text-[10px] text-slate-400 hover:text-slate-700 transition-colors flex items-center gap-0.5 py-0.5 px-1.5 rounded cursor-pointer"
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

        {/* Minimalist Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-[11px] text-slate-400">
          <span>RSUD Dr. Soegiri Lamongan</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
