from pathlib import Path

service_path = Path('src/lib/notificationService.ts')
service = service_path.read_text()
old_import = "import { collection, onSnapshot, query, where, doc, setDoc, writeBatch } from 'firebase/firestore';"
new_import = "import { collection, onSnapshot, query, where, doc, setDoc, writeBatch, getDocs } from 'firebase/firestore';"
if old_import not in service:
    raise SystemExit('notificationService import marker not found')
service = service.replace(old_import, new_import, 1)

old_clear = '''export function clearNotifications(): void {
  const ref = notificationCollectionRef();
  const items = [...activeNotifications];
  activeNotifications = [];
  persistNotifications(activeNotifications);
  notifySubscribers();
  if (!ref) return;
  void (async () => {
    try {
      const batch = writeBatch(db);
      const now = Date.now();
      items.forEach((item) => {
        const eventKey = String(item.metadata?.eventKey || item.id || '').trim();
        const id = getNotificationDocId(eventKey, item.id);
        batch.set(doc(ref, id), { id, hidden: true, deletedAt: now }, { merge: true });
      });
      await batch.commit();
    } catch (error) {
      console.warn('Could not clear cloud notifications:', error);
    }
  })();
}
'''
new_clear = '''export async function clearNotifications(): Promise<void> {
  const ref = notificationCollectionRef();
  activeNotifications = [];
  persistNotifications(activeNotifications);
  notifySubscribers();
  if (!ref) return;

  try {
    const snapshot = await getDocs(ref);
    const visibleDocs = snapshot.docs.filter((entry) => {
      const item = entry.data() as AppNotification;
      return item && item.hidden !== true;
    });
    const now = Date.now();

    // Firestore batches are capped at 500 writes. Keep margin for safety.
    for (let offset = 0; offset < visibleDocs.length; offset += 400) {
      const batch = writeBatch(db);
      visibleDocs.slice(offset, offset + 400).forEach((entry) => {
        batch.set(entry.ref, { id: entry.id, hidden: true, deletedAt: now }, { merge: true });
      });
      await batch.commit();
    }
  } catch (error) {
    console.warn('Could not clear cloud notifications:', error);
    throw error;
  }
}
'''
if old_clear not in service:
    raise SystemExit('clearNotifications marker not found')
service = service.replace(old_clear, new_clear, 1)
service_path.write_text(service)

modal_path = Path('src/components/NotificationModal.tsx')
modal = modal_path.read_text()
old_import_modal = '''  AppNotification,
  deleteNotification,
  markNotificationAsRead,'''
new_import_modal = '''  AppNotification,
  clearNotifications,
  deleteNotification,
  markNotificationAsRead,'''
if old_import_modal not in modal:
    raise SystemExit('NotificationModal import marker not found')
modal = modal.replace(old_import_modal, new_import_modal, 1)

old_state = '''  const [sending, setSending] =
    useState(false);
'''
new_state = '''  const [sending, setSending] =
    useState(false);

  const [clearingAll, setClearingAll] =
    useState(false);
'''
if old_state not in modal:
    raise SystemExit('NotificationModal sending state marker not found')
modal = modal.replace(old_state, new_state, 1)

marker = '''  const sendReply = async () => {'''
handler = '''  const clearAllMessages = async () => {
    if (!notifications.length || clearingAll) return;
    const confirmed = window.confirm(
      'Hapus semua pesan dari mailbox Anda? Tindakan ini hanya menghapus salinan pesan akun yang sedang login.'
    );
    if (!confirmed) return;

    setClearingAll(true);
    setSelectedId(null);
    setReplying(false);
    setReplyBody('');
    try {
      await clearNotifications();
      onShowToast?.(
        'success',
        'Semua Pesan Dihapus',
        'Mailbox akun ini telah dikosongkan di semua perangkat.'
      );
    } catch (error) {
      onShowToast?.(
        'error',
        'Gagal Menghapus Semua Pesan',
        error instanceof Error ? error.message : 'Mailbox tidak dapat dikosongkan.'
      );
    } finally {
      setClearingAll(false);
    }
  };

'''
if marker not in modal:
    raise SystemExit('NotificationModal sendReply marker not found')
modal = modal.replace(marker, handler + marker, 1)

old_toolbar = '''            <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              {(
                [
                  ['all', 'Semua'],
                  [
                    'unread',
                    'Belum Dibaca'
                  ]
                ] as const
              ).map(([value, label]) => (
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
                  {value === 'unread' &&
                  unreadCount
                    ? ` (${unreadCount})`
                    : ''}
                </button>
              ))}
            </div>'''
new_toolbar = '''            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <div className="flex gap-1">
                {(
                  [
                    ['all', 'Semua'],
                    [
                      'unread',
                      'Belum Dibaca'
                    ]
                  ] as const
                ).map(([value, label]) => (
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
                    {value === 'unread' &&
                    unreadCount
                      ? ` (${unreadCount})`
                      : ''}
                  </button>
                ))}
              </div>

              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllMessages}
                  disabled={clearingAll}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Hapus semua pesan"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {clearingAll ? 'Menghapus...' : 'Hapus Semua'}
                </button>
              )}
            </div>'''
if old_toolbar not in modal:
    raise SystemExit('NotificationModal toolbar marker not found')
modal = modal.replace(old_toolbar, new_toolbar, 1)
modal_path.write_text(modal)
