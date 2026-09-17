import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  MoreVertical,
  Reply,
  Send,
  Trash2,
  X
} from 'lucide-react';
import { UserSession } from '../types';
import {
  AppNotification,
  deleteNotification,
  markNotificationAsRead,
  markNotificationAsUnread,
  replyToInternalMail
} from '../lib/notificationService';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  userSession?: UserSession | null;
  onSelectDocument?: (docId: string, docNumber?: string) => void;
  onShowToast?: (
    type: 'success' | 'error' | 'info',
    title: string,
    message?: string
  ) => void;
}

export const CREATOR_REPLY_SUGGESTIONS = [
  'Sudah diperbaiki sesuai catatan',
  'Mohon diperiksa kembali',
  'Perbaikan telah selesai',
  'Terima kasih atas koreksinya'
];

export const REVIEWER_REPLY_SUGGESTIONS = [
  'Mohon dilakukan perbaikan',
  'Mohon lengkapi dokumen',
  'Mohon sesuaikan prosedur',
  'Sudah sesuai',
  'Silakan ditindaklanjuti'
];

function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);

  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      })
    : date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short'
      });
}

function documentTitle(item: AppNotification): string {
  const explicit =
    item.metadata?.documentTitle ||
    item.metadata?.sopTitle;

  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }

  const quoted =
    item.message?.match(/SPO\s+[“"]([^”"]+)[”"]/i)?.[1];

  return quoted
    ? `SPO ${quoted}`
    : 'Dokumen SIDOKTER';
}

function isHumanMail(item: AppNotification): boolean {
  return (
    item.metadata?.mailKind === 'human' &&
    Boolean(item.metadata?.senderUid)
  );
}

export const NotificationModal: React.FC<
  NotificationModalProps
> = ({
  isOpen,
  onClose,
  notifications,
  userSession,
  onSelectDocument,
  onShowToast
}) => {
  const [filter, setFilter] =
    useState<'all' | 'unread'>('all');

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [replying, setReplying] =
    useState(false);

  const [replyBody, setReplyBody] =
    useState('');

  const [sending, setSending] =
    useState(false);

  const selected =
    notifications.find(
      (item) => item.id === selectedId
    ) || null;

  useEffect(() => {
    if (!isOpen) {
      setFilter('all');
      setSelectedId(null);
      setReplying(false);
      setReplyBody('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedId && !selected) {
      setSelectedId(null);
    }
  }, [selectedId, selected]);

  if (!isOpen) return null;

  // Pesan yang sedang dibaca tetap terlihat di tab
  // "Belum Dibaca" meskipun otomatis ditandai dibaca.
  const filtered =
    filter === 'unread'
      ? notifications.filter(
          (item) =>
            !item.read ||
            item.id === selectedId
        )
      : notifications;

  const unreadCount =
    notifications.filter(
      (item) => !item.read
    ).length;

  const senderName = selected
    ? String(
        selected.metadata?.senderName ||
          (isHumanMail(selected)
            ? 'Petugas SIDOKTER'
            : 'Sistem SIDOKTER')
      )
    : '';

  const recipientName = selected
    ? String(
        selected.metadata?.recipientName ||
          userSession?.name ||
          userSession?.username ||
          'Pengguna SIDOKTER'
      )
    : '';

  const suggestions =
    userSession?.role === 'admin' ||
    userSession?.badges?.some(
      (b) =>
        String(b).toUpperCase() ===
        'VERIFIKATOR'
    )
      ? REVIEWER_REPLY_SUGGESTIONS
      : CREATOR_REPLY_SUGGESTIONS;

  const selectMessage = (
    item: AppNotification
  ) => {
    setSelectedId(item.id);
    setReplying(false);
    setReplyBody('');

    if (!item.read) {
      markNotificationAsRead(item.id);
    }
  };

  const openDocument = (
    item: AppNotification
  ) => {
    markNotificationAsRead(item.id);
    onClose();

    if (
      item.documentId &&
      onSelectDocument
    ) {
      onSelectDocument(
        item.documentId,
        item.documentNumber
      );
    } else {
      item.onAction?.();
    }
  };

  const insertSuggestion = (
    suggestion: string
  ) => {
    setReplyBody((current) =>
      `${current}${
        current.trim() ? ' ' : ''
      }${suggestion}.`
    );
  };

  const sendReply = async () => {
    if (
      !selected ||
      !replyBody.trim() ||
      sending
    ) {
      return;
    }

    setSending(true);

    try {
      await replyToInternalMail(
        selected.id,
        replyBody
      );

      setReplying(false);
      setReplyBody('');

      onShowToast?.(
        'success',
        'Pesan Berhasil Dikirim',
        'Balasan masuk ke mailbox penerima.'
      );
    } catch (error) {
      onShowToast?.(
        'error',
        'Pesan Gagal Dikirim',
        error instanceof Error
          ? error.message
          : 'Balasan tidak dapat dikirim.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex bg-slate-950/30 sm:p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pesan-title"
        className="m-auto flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[78vh] sm:max-w-6xl sm:rounded-xl sm:border sm:border-slate-200"
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        {/* HEADER */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4 sm:px-5">
          <div className="flex items-center gap-3">
            {selected && (
              <button
                type="button"
                onClick={() =>
                  setSelectedId(null)
                }
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
                aria-label="Kembali ke daftar pesan"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}

            <Mail className="h-5 w-5 text-emerald-700" />

            <div>
              <h2
                id="pesan-title"
                className="text-sm font-black tracking-wide text-slate-900"
              >
                PESAN
              </h2>

              <p className="text-[11px] text-slate-500">
                Internal Mail SIDOKTER
              </p>
            </div>

            {unreadCount > 0 && (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                {unreadCount > 9
                  ? '9+'
                  : unreadCount}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Tutup Pesan"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* DAFTAR PESAN */}
          <aside
            className={`${
              selected
                ? 'hidden md:flex'
                : 'flex'
            } w-full flex-col border-r border-slate-200 md:w-[42%]`}
          >
            <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              {(
                [
                  ['all', 'Semua'],
                  [
                    'unread',
                    'Belum Dibaca'
                  ]
                ] as const
              ).map(
                ([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setFilter(value)
                    }
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                      filter === value
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {label}

                    {value ===
                      'unread' &&
                    unreadCount
                      ? ` (${unreadCount})`
                      : ''}
                  </button>
                )
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {!filtered.length ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  {filter === 'unread'
                    ? 'Semua pesan sudah dibaca'
                    : 'Belum ada pesan'}
                </div>
              ) : (
                filtered.map((item) => (
                  <div
                    key={item.id}
                    className={`group relative border-b border-slate-100 ${
                      selectedId ===
                      item.id
                        ? 'bg-slate-100'
                        : !item.read
                          ? 'bg-emerald-50/45'
                          : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        selectMessage(
                          item
                        )
                      }
                      className="block w-full px-4 py-3.5 pr-11 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            item.read
                              ? 'bg-transparent'
                              : 'bg-emerald-600'
                          }`}
                        />

                        <span
                          className={`min-w-0 flex-1 truncate text-xs ${
                            item.read
                              ? 'font-semibold text-slate-700'
                              : 'font-black text-slate-900'
                          }`}
                        >
                          {String(
                            item.metadata
                              ?.senderName ||
                              (isHumanMail(
                                item
                              )
                                ? 'Petugas SIDOKTER'
                                : 'Sistem SIDOKTER')
                          )}
                        </span>

                        <time className="text-[10px] text-slate-400">
                          {formatMessageTime(
                            item.timestamp
                          )}
                        </time>
                      </div>

                      <p
                        className={`mt-1 truncate pl-4 text-xs ${
                          item.read
                            ? 'font-medium'
                            : 'font-bold'
                        } text-slate-900`}
                      >
                        {item.title}
                      </p>

                      <p className="mt-0.5 truncate pl-4 text-[11px] font-medium text-slate-500">
                        {documentTitle(
                          item
                        )}
                        {item.documentNumber
                          ? ` · ${item.documentNumber}`
                          : ''}
                      </p>

                      <p className="mt-1 line-clamp-1 pl-4 text-xs text-slate-500">
                        {item.message}
                      </p>
                    </button>

                    <details className="absolute right-2 top-8">
                      <summary
                        className="list-none rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                        aria-label="Menu pesan"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </summary>

                      <div className="absolute right-0 z-10 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() =>
                            item.read
                              ? markNotificationAsUnread(
                                  item.id
                                )
                              : markNotificationAsRead(
                                  item.id
                                )
                          }
                          className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-slate-100"
                        >
                          Tandai{' '}
                          {item.read
                            ? 'belum dibaca'
                            : 'sudah dibaca'}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            deleteNotification(
                              item.id
                            )
                          }
                          className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Hapus
                        </button>
                      </div>
                    </details>
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* DETAIL PESAN */}
          <main
            className={`${
              selected
                ? 'flex'
                : 'hidden md:flex'
            } min-w-0 flex-1 flex-col overflow-y-auto`}
          >
            {!selected ? (
              <div className="m-auto text-center text-sm text-slate-400">
                <Mail className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                Pilih pesan untuk membaca
              </div>
            ) : (
              <article className="p-5 sm:p-8">
                <div className="border-b border-slate-200 pb-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                    {isHumanMail(
                      selected
                    )
                      ? 'Pesan Pengguna'
                      : 'Pesan Sistem · Hanya Baca'}
                  </p>

                  <h3 className="mt-2 text-lg font-black uppercase tracking-tight text-slate-900">
                    {selected.title}
                  </h3>

                  <time className="mt-1 block text-xs text-slate-400">
                    {new Date(
                      selected.timestamp
                    ).toLocaleString(
                      'id-ID'
                    )}
                  </time>
                </div>

                <dl className="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-2 border-b border-slate-200 py-5 text-sm">
                  <dt className="text-slate-500">
                    Dari
                  </dt>

                  <dd className="font-semibold text-slate-900">
                    {senderName}
                  </dd>

                  <dt className="text-slate-500">
                    Kepada
                  </dt>

                  <dd className="font-semibold text-slate-900">
                    {recipientName}
                  </dd>

                  <dt className="text-slate-500">
                    Dokumen
                  </dt>

                  <dd>
                    <div className="font-bold text-slate-900">
                      {documentTitle(
                        selected
                      )}
                    </div>

                    {selected.documentNumber && (
                      <div className="mt-0.5 text-xs text-slate-500">
                        {
                          selected.documentNumber
                        }
                      </div>
                    )}
                  </dd>
                </dl>

                <p className="whitespace-pre-wrap py-6 text-sm leading-7 text-slate-700">
                  {selected.message}
                </p>

                {!replying ? (
                  <div>
                    <div className="flex flex-wrap gap-2">
                      {isHumanMail(
                        selected
                      ) && (
                        <button
                          type="button"
                          onClick={() =>
                            setReplying(
                              true
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white"
                        >
                          <Reply className="h-4 w-4" />
                          Balas
                        </button>
                      )}

                      {selected.documentId && (
                        <button
                          type="button"
                          onClick={() =>
                            openDocument(
                              selected
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          <ExternalLink className="h-4 w-4" />

                          {userSession?.role ===
                            'admin' ||
                          userSession?.badges?.some(
                            (b) =>
                              String(
                                b
                              ).toUpperCase() ===
                              'VERIFIKATOR'
                          )
                            ? 'Buka & Riviu SPO'
                            : 'Buka & Perbaiki SPO'}
                        </button>
                      )}
                    </div>

                    <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                      Pesan tetap
                      tersimpan di tab
                      Semua setelah
                      dibaca. Buka SPO
                      untuk menggunakan
                      tindakan edit atau
                      verifikasi yang
                      tersedia sesuai
                      wewenang Anda.
                    </p>
                  </div>
                ) : (
                  <section className="border-t border-slate-200 pt-5">
                    <h4 className="text-sm font-bold text-slate-900">
                      Balas kepada{' '}
                      {senderName}
                    </h4>

                    <textarea
                      value={replyBody}
                      onChange={(e) =>
                        setReplyBody(
                          e.target
                            .value
                        )
                      }
                      maxLength={2000}
                      rows={5}
                      autoFocus
                      className="mt-3 w-full resize-y rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-emerald-600"
                      placeholder="Tulis balasan..."
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                      {suggestions.map(
                        (
                          suggestion
                        ) => (
                          <button
                            key={
                              suggestion
                            }
                            type="button"
                            onClick={() =>
                              insertSuggestion(
                                suggestion
                              )
                            }
                            className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:border-emerald-300 hover:bg-emerald-50"
                          >
                            {
                              suggestion
                            }
                          </button>
                        )
                      )}
                    </div>

                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReplying(
                            false
                          );
                          setReplyBody(
                            ''
                          );
                        }}
                        className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                      >
                        Batal
                      </button>

                      <button
                        type="button"
                        disabled={
                          !replyBody.trim() ||
                          sending
                        }
                        onClick={
                          sendReply
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />

                        {sending
                          ? 'Mengirim...'
                          : 'Kirim'}
                      </button>
                    </div>
                  </section>
                )}
              </article>
            )}
          </main>
        </div>
      </section>
    </div>
  );
};