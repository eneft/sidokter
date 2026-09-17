import React, { useEffect, useState } from 'react';
import { Mail, X } from 'lucide-react';
import {
  AppNotification,
  markNotificationAsRead
} from '../lib/notificationService';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onSelectDocument?: (docId: string, docNumber?: string) => void;
}

function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

function eventLabel(item: AppNotification): string {
  const reviewContext = String(item.metadata?.reviewContext || '').toUpperCase();
  if (reviewContext === 'REVISION_REQUESTED') return 'Perlu Perbaikan';
  if (reviewContext === 'REVISION_SUBMITTED') return 'Perbaikan Dikirim';
  if (reviewContext === 'VERIFIED') return 'Dokumen Terverifikasi';
  if (item.type === 'activation') return 'SPO Diaktifkan';
  if (item.type === 'proposal') return 'Usulan SPO';
  if (item.type === 'assignment') return 'Usulan SPO Disetujui';
  if (item.type === 'review') return 'Riviu SPO';
  return item.title || 'Informasi';
}

function documentTitle(item: AppNotification): string {
  const explicitTitle = item.metadata?.documentTitle || item.metadata?.sopTitle;
  if (typeof explicitTitle === 'string' && explicitTitle.trim()) return explicitTitle.trim();
  const quotedTitle = item.message?.match(/SPO\s+[“"]([^”"]+)[”"]/i)?.[1];
  return quotedTitle ? `SPO ${quotedTitle}` : item.title;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onSelectDocument
}) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (!isOpen) setFilter('all');
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = filter === 'unread' ? notifications.filter((item) => !item.read) : notifications;
  const unreadCount = notifications.filter((item) => !item.read).length;

  const openMessage = (item: AppNotification) => {
    markNotificationAsRead(item.id);
    onClose();

    // Prefer the persisted documentId. Legacy in-memory actions remain a safe fallback.
    if (item.documentId && onSelectDocument) {
      onSelectDocument(item.documentId, item.documentNumber);
    } else if (item.onAction) {
      item.onAction();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pesan-title"
        className="flex max-h-[100dvh] min-h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:min-h-0 sm:max-h-[78vh] sm:max-w-lg sm:rounded-2xl sm:border sm:border-slate-200"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="pesan-title" className="text-sm font-black tracking-wide text-slate-900">PESAN</h2>
                {unreadCount > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">Informasi dan tindak lanjut dokumen</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Tutup Pesan">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex gap-1 border-b border-slate-200 bg-slate-50/70 px-5 py-2.5">
          {([['all', 'Semua'], ['unread', 'Belum Dibaca']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filter === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              {label}{value === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <Mail className="mb-3 h-7 w-7 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">{filter === 'unread' ? 'Semua pesan sudah dibaca' : 'Belum ada pesan'}</p>
              <p className="mt-1 text-xs text-slate-400">Pembaruan workflow dokumen akan tampil di sini.</p>
            </div>
          ) : filtered.map((item) => {
            const actor = item.metadata?.actorName || item.metadata?.senderName;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openMessage(item)}
                className={`relative block w-full border-b border-slate-100 px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-slate-50 ${!item.read ? 'bg-emerald-50/35' : 'bg-white'}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${!item.read ? 'bg-emerald-600' : 'bg-transparent'}`} aria-label={!item.read ? 'Belum dibaca' : undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <span className={`text-[10px] uppercase tracking-wide text-slate-700 ${!item.read ? 'font-black' : 'font-bold'}`}>{eventLabel(item)}</span>
                      <time className="shrink-0 text-[10px] text-slate-400">{formatMessageTime(item.timestamp)}</time>
                    </div>
                    <h3 className={`mt-1 truncate text-sm text-slate-900 ${!item.read ? 'font-bold' : 'font-semibold'}`}>{documentTitle(item)}</h3>
                    {item.documentNumber && <p className="mt-0.5 text-[11px] font-medium text-slate-500">{item.documentNumber}</p>}
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">{item.message}</p>
                    {actor && <p className="mt-1.5 text-[11px] font-medium text-slate-500">{String(actor)}</p>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
