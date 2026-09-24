from pathlib import Path
import re


def sub_once(text, pattern, repl, label, flags=0):
    out, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 replacement, got {count}')
    return out

# -----------------------------------------------------------------------------
# notificationService.ts
# -----------------------------------------------------------------------------
path = Path('src/lib/notificationService.ts')
s = path.read_text()
s = s.replace(
    "import { collection, onSnapshot, query, where, doc, setDoc, writeBatch, getDocs } from 'firebase/firestore';",
    "import { collection, onSnapshot, query, where, doc, setDoc, getDocs, orderBy, limit as firestoreLimit, startAfter } from 'firebase/firestore';"
)
s = s.replace(
    "  type: NotificationType;\n",
    "  type: NotificationType;\n  eventType?: string;\n"
)
s = s.replace(
    "  read: boolean;\n",
    "  read: boolean;\n  actionable?: boolean;\n  resolvedAt?: number | null;\n  resolvedReason?: string | null;\n"
)
s = s.replace(
    "const NOTIF_STORAGE_PREFIX = 'soegiri_active_notifications_v3';\nconst NOTIF_MUTE_PREFIX = 'soegiri_notification_muted_v3';",
    "const NOTIF_MUTE_PREFIX = 'soegiri_notification_muted_v3';"
)
s = sub_once(
    s,
    r"function getNotificationStorageKey\(\): string \{.*?\n\}\n\nfunction getNotificationMuteKey",
    "function getNotificationMuteKey",
    'remove notification storage key',
    re.S
)
s = sub_once(
    s,
    r"function loadPersistedNotifications\(\): AppNotification\[\] \{.*?\n\}\n\nfunction persistNotifications\(notifications: AppNotification\[\]\): void \{.*?\n\}\n",
    "function loadPersistedNotifications(): AppNotification[] {\n  // Delivery state is cloud-authoritative; browser storage is never a mailbox source.\n  return [];\n}\n\nfunction persistNotifications(_notifications: AppNotification[]): void {\n  // Intentionally no-op. Only user preferences such as mute remain in localStorage.\n}\n",
    'replace local notification cache',
    re.S
)

insert_marker = "const emittedSideEffectEventKeys = new Set<string>();\n"
insert = """const emittedSideEffectEventKeys = new Set<string>();
const MAILBOX_PAGE_SIZE = 50;
let notificationCursor: any = null;
let notificationHasMore = false;
let initialMailboxSnapshotSeen = false;
let olderCloudItems: AppNotification[] = [];
const knownCloudNotificationIds = new Set<string>();

function mergeMailboxItems(...groups: AppNotification[][]): AppNotification[] {
  const byId = new Map<string, AppNotification>();
  groups.flat().forEach((item) => {
    if (!item?.id) return;
    const previous = byId.get(item.id);
    if (!previous || Number(item.timestamp || 0) >= Number(previous.timestamp || 0)) byId.set(item.id, item);
  });
  return [...byId.values()]
    .filter(isVisibleMailboxItem)
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

function chimeTypeForNotification(item: AppNotification): 'activation' | 'proposal' | 'assignment' | 'review' | 'default' {
  if (item.type === 'activation' || item.type === 'proposal' || item.type === 'assignment' || item.type === 'review') return item.type;
  return 'default';
}
"""
if insert_marker not in s:
    raise SystemExit('pagination globals marker missing')
s = s.replace(insert_marker, insert, 1)

new_listener = r'''function syncNotificationCloudListener(): void {
  if (unsubscribeNotificationCloud) {
    unsubscribeNotificationCloud();
    unsubscribeNotificationCloud = null;
  }

  const ref = notificationCollectionRef();
  if (!ref) {
    cloudNotificationReady = false;
    return;
  }

  const mailboxQuery = query(ref, orderBy('timestamp', 'desc'), firestoreLimit(MAILBOX_PAGE_SIZE));
  unsubscribeNotificationCloud = onSnapshot(mailboxQuery, (snapshot) => {
    const pageItems = snapshot.docs
      .map((d) => d.data() as AppNotification)
      .filter((n) => n && typeof n.id === 'string' && typeof n.type === 'string');

    seedDedupeSetsFromNotifications(pageItems);

    if (initialMailboxSnapshotSeen) {
      const freshUnread = snapshot.docChanges()
        .filter((change) => change.type === 'added')
        .map((change) => change.doc.data() as AppNotification)
        .filter((item) => isVisibleMailboxItem(item) && !item.read && !knownCloudNotificationIds.has(item.id));
      if (freshUnread.length > 0) {
        const newest = freshUnread.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))[0];
        playChime(chimeTypeForNotification(newest));
      }
    }

    snapshot.docs.forEach((entry) => knownCloudNotificationIds.add(entry.id));
    initialMailboxSnapshotSeen = true;
    notificationCursor = snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null;
    notificationHasMore = snapshot.size === MAILBOX_PAGE_SIZE;
    const visiblePage = pageItems.filter(isVisibleMailboxItem);
    activeNotifications = mergeMailboxItems(visiblePage, olderCloudItems);
    cloudNotificationReady = true;
    notifySubscribers();
  }, (error) => {
    cloudNotificationReady = false;
    console.warn('Notification Firestore listener note:', error?.message || error);
  });
}

export function canLoadMoreNotifications(): boolean {
  return notificationHasMore && Boolean(notificationCursor);
}

export async function loadMoreNotifications(): Promise<number> {
  const ref = notificationCollectionRef();
  if (!ref || !notificationCursor || !notificationHasMore) return 0;
  let addedVisible = 0;
  let rounds = 0;

  while (notificationHasMore && notificationCursor && addedVisible === 0 && rounds < 5) {
    const nextQuery = query(
      ref,
      orderBy('timestamp', 'desc'),
      startAfter(notificationCursor),
      firestoreLimit(MAILBOX_PAGE_SIZE)
    );
    const snapshot = await getDocs(nextQuery);
    rounds += 1;
    notificationCursor = snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : notificationCursor;
    notificationHasMore = snapshot.size === MAILBOX_PAGE_SIZE;
    const nextItems = snapshot.docs
      .map((entry) => entry.data() as AppNotification)
      .filter((item) => item && typeof item.id === 'string' && typeof item.type === 'string');
    snapshot.docs.forEach((entry) => knownCloudNotificationIds.add(entry.id));
    seedDedupeSetsFromNotifications(nextItems);
    const visible = nextItems.filter(isVisibleMailboxItem);
    addedVisible += visible.length;
    olderCloudItems = mergeMailboxItems(olderCloudItems, visible);
  }

  activeNotifications = mergeMailboxItems(activeNotifications, olderCloudItems);
  notifySubscribers();
  return addedVisible;
}
'''
s = sub_once(
    s,
    r"function syncNotificationCloudListener\(\): void \{.*?\n\}\n\n/\*\* Switches notification state",
    new_listener + "\n/** Switches notification state",
    'replace cloud listener',
    re.S
)

s = s.replace(
    "  pendingCloudWrites.clear();\n  notificationScopeKey = nextScope;",
    "  pendingCloudWrites.clear();\n  notificationCursor = null;\n  notificationHasMore = false;\n  initialMailboxSnapshotSeen = false;\n  olderCloudItems = [];\n  knownCloudNotificationIds.clear();\n  notificationScopeKey = nextScope;"
)
s = s.replace("  activeNotifications = loadPersistedNotifications();", "  activeNotifications = [];", 1)
s = sub_once(
    s,
    r"\n  if \(userSession\?\.role === 'admin' \|\| hasVerificatorBadge\(userSession\)\) \{\n    ingestQueuedAdminProposals\(\);\n  \}\n",
    "\n",
    'remove queued proposal ingest'
)
s = sub_once(
    s,
    r"\nconst ADMIN_PROPOSALS_QUEUE_KEY = 'soegiri_pending_admin_proposals_v2';.*?\nlet activeNotifications:",
    "\nlet activeNotifications:",
    'remove local proposal queue',
    re.S
)
s = s.replace("let activeNotifications: AppNotification[] = loadPersistedNotifications();", "let activeNotifications: AppNotification[] = [];", 1)
s = sub_once(
    s,
    r"\n  window\.addEventListener\('storage', \(event\) => \{.*?\n  \}\);",
    "",
    'remove storage mailbox listener',
    re.S
)
s = sub_once(
    s,
    r"async function persistNotificationToCloud\(item: AppNotification\): Promise<void> \{.*?\n\}\n\nasync function persistNotificationReadToCloud",
    "async function persistNotificationReadToCloud",
    'remove client notification writer',
    re.S
)
s = s.replace(
    "        id: docId,\n        read: Boolean(item.read),",
    "        read: Boolean(item.read),"
)
s = s.replace(
    "    await setDoc(doc(ref, id), { id, hidden: true, deletedAt: Date.now() }, { merge: true });",
    "    await setDoc(doc(ref, id), { hidden: true, deletedAt: Date.now() }, { merge: true });"
)
s = s.replace("  void persistNotificationToCloud(item);\n", "")

new_clear = r'''export async function clearNotifications(): Promise<void> {
  const clearMailbox = httpsCallable(functions, 'clearNotificationMailbox');
  await clearMailbox({});
  activeNotifications = [];
  olderCloudItems = [];
  notificationCursor = null;
  notificationHasMore = false;
  knownCloudNotificationIds.clear();
  notifySubscribers();
}'''
s = sub_once(
    s,
    r"export async function clearNotifications\(\): Promise<void> \{.*?\n\}",
    new_clear,
    'replace clear all with backend callable',
    re.S
)

simple_watcher = r'''export function setupDocumentRealtimeWatcher({
  userSession
}: RealtimeWatcherOptions): () => void {
  if (!userSession) return () => {};
  setNotificationUserSession(userSession);
  // Workflow notification production is backend-authoritative. This watcher now
  // only binds the authenticated mailbox listener; it never creates messages.
  return () => {};
}'''
s = sub_once(
    s,
    r"export function setupDocumentRealtimeWatcher\(\{.*?\n\}\n\n/\*\*\n \* Dispatches an event",
    simple_watcher + "\n\n/**\n * Dispatches an event",
    'replace realtime document producer',
    re.S
)

simple_dispatch = r'''export function dispatchDocumentEvent(
  _type: 'assignment' | 'review' | 'activation' | 'proposal',
  _document: SopDocument,
  _reason?: string
): void {
  // Kept for call-site compatibility. The server Firestore workflow trigger is
  // the sole producer of official workflow mailbox records.
  return;
}'''
s = sub_once(
    s,
    r"export function dispatchDocumentEvent\(.*?\n\}\n\n/\*\*\n \* Evaluates all existing documents in memory on login/session mount and alerts Admin if any",
    simple_dispatch + "\n\n/**\n * Evaluates all existing documents in memory on login/session mount and alerts Admin if any",
    'replace local dispatch producer',
    re.S
)

s = sub_once(
    s,
    r"export function scanDocumentsForProposals\(.*?\n\}\n\n/\*\*\n \* Evaluates all documents on session mount",
    "export function scanDocumentsForProposals(\n  _sops: SopDocument[],\n  _userSession: UserSession | null,\n  _users: UserAccount[] | undefined,\n  _onToast: RealtimeWatcherOptions['onToast'],\n  _onSelectDocument?: (doc: SopDocument) => void\n): void {\n  return;\n}\n\n/**\n * Evaluates all documents on session mount",
    'disable proposal login scan',
    re.S
)
s = sub_once(
    s,
    r"export function scanDocumentsForActivations\(.*?\n\}\n\n/\*\*\n \* Backward-compatible no-op",
    "export function scanDocumentsForActivations(\n  _sops: SopDocument[],\n  _userSession: UserSession | null,\n  _onToast: RealtimeWatcherOptions['onToast'],\n  _onSelectDocument?: (doc: SopDocument) => void\n): void {\n  return;\n}\n\n/**\n * Backward-compatible no-op",
    'disable activation login scan',
    re.S
)

if 'ADMIN_PROPOSALS_QUEUE_KEY' in s or 'queuePendingAdminProposal' in s or 'ingestQueuedAdminProposals' in s:
    raise SystemExit('legacy proposal queue still present')
if 'setDoc(fallbackRef' in s:
    raise SystemExit('direct client notification fallback still present')
path.write_text(s)

# -----------------------------------------------------------------------------
# NotificationModal.tsx - thread-first mailbox UI
# -----------------------------------------------------------------------------
Path('src/components/NotificationModal.tsx').write_text(r'''import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
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
  canLoadMoreNotifications,
  clearNotifications,
  deleteNotification,
  loadMoreNotifications,
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
    ? date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

function documentTitle(item: AppNotification): string {
  const explicit = item.metadata?.documentTitle || item.metadata?.sopTitle;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const quoted = item.message?.match(/SPO\s+[“"]([^”"]+)[”"]/i)?.[1];
  return quoted ? `SPO ${quoted}` : 'Dokumen SIDOKTER';
}

function isHumanMail(item: AppNotification): boolean {
  return item.metadata?.mailKind === 'human' && Boolean(item.metadata?.senderUid);
}

function threadKeyFor(item: AppNotification): string {
  const explicit = String(item.metadata?.threadKey || item.metadata?.correlationId || '').trim();
  if (explicit) return explicit;
  if (item.documentId && item.type === 'review') return `sop-review:${item.documentId}`;
  if (item.documentId && ['proposal', 'activation', 'assignment'].includes(item.type)) {
    return `sop-workflow:${item.documentId}`;
  }
  return item.id;
}

function isActionable(item: AppNotification): boolean {
  return item.actionable === true && !item.resolvedAt && item.hidden !== true;
}

type MailThread = {
  key: string;
  messages: AppNotification[];
  latest: AppNotification;
  unread: boolean;
  actionable: boolean;
  resolved: boolean;
};

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  notifications,
  userSession,
  onSelectDocument,
  onShowToast
}) => {
  const [filter, setFilter] = useState<'all' | 'actionable'>('all');
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const threads = useMemo<MailThread[]>(() => {
    const grouped = new Map<string, AppNotification[]>();
    notifications.forEach((item) => {
      const key = threadKeyFor(item);
      const current = grouped.get(key) || [];
      current.push(item);
      grouped.set(key, current);
    });
    return [...grouped.entries()].map(([key, items]) => {
      const messages = [...items].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
      const latest = messages[messages.length - 1];
      const actionable = messages.some(isActionable);
      const resolved = !actionable && messages.some((item) => Boolean(item.resolvedAt));
      return {
        key,
        messages,
        latest,
        unread: messages.some((item) => !item.read),
        actionable,
        resolved
      };
    }).sort((a, b) => Number(b.latest.timestamp || 0) - Number(a.latest.timestamp || 0));
  }, [notifications]);

  const selected = threads.find((thread) => thread.key === selectedThreadKey) || null;
  const filtered = filter === 'actionable' ? threads.filter((thread) => thread.actionable) : threads;
  const unreadCount = notifications.filter((item) => !item.read).length;
  const actionableCount = threads.filter((thread) => thread.actionable).length;

  useEffect(() => {
    if (!isOpen) {
      setFilter('all');
      setSelectedThreadKey(null);
      setReplying(false);
      setReplyBody('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedThreadKey && !selected) setSelectedThreadKey(null);
  }, [selectedThreadKey, selected]);

  if (!isOpen) return null;

  const suggestions = userSession?.role === 'admin' || userSession?.badges?.some(
    (badge) => String(badge).toUpperCase() === 'VERIFIKATOR'
  ) ? REVIEWER_REPLY_SUGGESTIONS : CREATOR_REPLY_SUGGESTIONS;

  const selectThread = (thread: MailThread) => {
    setSelectedThreadKey(thread.key);
    setReplying(false);
    setReplyBody('');
    thread.messages.filter((item) => !item.read).forEach((item) => markNotificationAsRead(item.id));
  };

  const latestHumanMail = selected
    ? [...selected.messages].reverse().find(isHumanMail) || null
    : null;

  const openDocument = (item: AppNotification) => {
    selected?.messages.filter((message) => !message.read).forEach((message) => markNotificationAsRead(message.id));
    onClose();
    if (item.documentId && onSelectDocument) onSelectDocument(item.documentId, item.documentNumber);
    else item.onAction?.();
  };

  const clearAllMessages = async () => {
    if (!notifications.length || clearingAll) return;
    const confirmed = window.confirm(
      'Hapus semua pesan dari mailbox Anda? Pesan disembunyikan dari akun ini di seluruh perangkat.'
    );
    if (!confirmed) return;
    setClearingAll(true);
    setSelectedThreadKey(null);
    try {
      await clearNotifications();
      onShowToast?.('success', 'Semua Pesan Dihapus', 'Mailbox akun ini telah dikosongkan di semua perangkat.');
    } catch (error) {
      onShowToast?.('error', 'Gagal Menghapus Semua Pesan', error instanceof Error ? error.message : 'Mailbox tidak dapat dikosongkan.');
    } finally {
      setClearingAll(false);
    }
  };

  const sendReply = async () => {
    if (!latestHumanMail || !replyBody.trim() || sending || selected?.resolved) return;
    setSending(true);
    try {
      await replyToInternalMail(latestHumanMail.id, replyBody);
      setReplying(false);
      setReplyBody('');
      onShowToast?.('success', 'Pesan Berhasil Dikirim', 'Balasan masuk ke thread SPO penerima.');
    } catch (error) {
      onShowToast?.('error', 'Pesan Gagal Dikirim', error instanceof Error ? error.message : 'Balasan tidak dapat dikirim.');
    } finally {
      setSending(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const added = await loadMoreNotifications();
      if (!added && !canLoadMoreNotifications()) {
        onShowToast?.('info', 'Semua Pesan Dimuat', 'Tidak ada pesan lama lainnya.');
      }
    } catch (error) {
      onShowToast?.('error', 'Gagal Memuat Pesan', error instanceof Error ? error.message : 'Pesan lama tidak dapat dimuat.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-950/30 sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pesan-title"
        className="m-auto flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[78vh] sm:max-w-6xl sm:rounded-xl sm:border sm:border-slate-200"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4 sm:px-5">
          <div className="flex items-center gap-3">
            {selected && (
              <button type="button" onClick={() => setSelectedThreadKey(null)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Kembali ke daftar pesan">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <Mail className="h-5 w-5 text-emerald-700" />
            <div>
              <h2 id="pesan-title" className="text-sm font-black tracking-wide text-slate-900">PESAN</h2>
              <p className="text-[11px] text-slate-500">Workflow Inbox SIDOKTER</p>
            </div>
            {unreadCount > 0 && (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Tutup Pesan">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className={`${selected ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-slate-200 md:w-[42%]`}>
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <div className="flex gap-1">
                <button type="button" onClick={() => setFilter('all')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${filter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}>Semua</button>
                <button type="button" onClick={() => setFilter('actionable')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${filter === 'actionable' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}>
                  Perlu Tindakan{actionableCount ? ` (${actionableCount})` : ''}
                </button>
              </div>
              {notifications.length > 0 && (
                <button type="button" onClick={clearAllMessages} disabled={clearingAll} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" />{clearingAll ? 'Menghapus...' : 'Hapus Semua'}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {!filtered.length ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">{filter === 'actionable' ? 'Tidak ada pesan yang perlu ditindaklanjuti' : 'Belum ada pesan'}</div>
              ) : filtered.map((thread) => {
                const item = thread.latest;
                return (
                  <div key={thread.key} className={`group relative border-b border-slate-100 ${selectedThreadKey === thread.key ? 'bg-slate-100' : thread.unread ? 'bg-emerald-50/45' : 'bg-white hover:bg-slate-50'}`}>
                    <button type="button" onClick={() => selectThread(thread)} className="block w-full px-4 py-3.5 pr-11 text-left">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${thread.unread ? 'bg-emerald-600' : 'bg-transparent'}`} />
                        <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">{String(item.metadata?.senderName || (isHumanMail(item) ? 'Petugas SIDOKTER' : 'Sistem SIDOKTER'))}</span>
                        <time className="text-[10px] text-slate-400">{formatMessageTime(item.timestamp)}</time>
                      </div>
                      <div className="mt-1 flex items-center gap-2 pl-4">
                        <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-900">{item.title}</p>
                        {thread.actionable ? (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">Perlu Tindakan</span>
                        ) : thread.resolved ? (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">Selesai</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate pl-4 text-[11px] font-medium text-slate-500">{documentTitle(item)}{item.documentNumber ? ` · ${item.documentNumber}` : ''}</p>
                      {thread.messages.length > 1 && <p className="mt-1 pl-4 text-[10px] font-semibold text-slate-400">{thread.messages.length} pesan dalam thread</p>}
                    </button>

                    <details className="absolute right-2 top-8">
                      <summary className="list-none rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Menu thread"><MoreVertical className="h-4 w-4" /></summary>
                      <div className="absolute right-0 z-10 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                        <button type="button" onClick={() => thread.messages.forEach((message) => thread.unread ? markNotificationAsRead(message.id) : markNotificationAsUnread(message.id))} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-slate-100">
                          Tandai {thread.unread ? 'sudah dibaca' : 'belum dibaca'}
                        </button>
                        <button type="button" onClick={() => thread.messages.forEach((message) => deleteNotification(message.id))} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50">
                          <Trash2 className="h-3.5 w-3.5" />Hapus Thread
                        </button>
                      </div>
                    </details>
                  </div>
                );
              })}

              {canLoadMoreNotifications() && (
                <div className="p-3 text-center">
                  <button type="button" onClick={handleLoadMore} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{loadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
                  </button>
                </div>
              )}
            </div>
          </aside>

          <main className={`${selected ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col overflow-hidden`}>
            {!selected ? (
              <div className="m-auto text-center text-sm text-slate-400">Pilih pesan untuk melihat detail.</div>
            ) : (
              <>
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-black text-slate-900">{selected.latest.title}</h3>
                        {selected.actionable ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">Perlu Tindakan</span>
                        ) : selected.resolved ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" />Selesai</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{documentTitle(selected.latest)}{selected.latest.documentNumber ? ` · ${selected.latest.documentNumber}` : ''}</p>
                    </div>
                    {selected.latest.documentId && (
                      <button type="button" onClick={() => openDocument(selected.latest)} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${selected.actionable ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                        <ExternalLink className="h-3.5 w-3.5" />{selected.actionable ? (selected.latest.actionLabel || 'Buka & Tindaklanjuti') : 'Buka Dokumen'}
                      </button>
                    )}
                  </div>
                  {selected.resolved && selected.latest.resolvedReason && <p className="mt-2 text-[11px] font-medium text-emerald-700">{selected.latest.resolvedReason}</p>}
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/50 p-4 sm:p-5">
                  {selected.messages.map((item) => (
                    <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-slate-800">{String(item.metadata?.senderName || (isHumanMail(item) ? 'Petugas SIDOKTER' : 'Sistem SIDOKTER'))}</p>
                          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.eventType || item.metadata?.eventType || item.title}</p>
                        </div>
                        <time className="shrink-0 text-[10px] text-slate-400">{new Date(item.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.message}</p>
                    </article>
                  ))}
                </div>

                {latestHumanMail && !selected.resolved && (
                  <div className="border-t border-slate-200 bg-white p-4">
                    {!replying ? (
                      <button type="button" onClick={() => setReplying(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Reply className="h-3.5 w-3.5" />Balas</button>
                    ) : (
                      <div>
                        <textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} rows={3} maxLength={2000} placeholder="Tulis balasan..." className="w-full resize-none rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-emerald-600" />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {suggestions.map((suggestion) => (
                            <button key={suggestion} type="button" onClick={() => setReplyBody((current) => `${current}${current.trim() ? ' ' : ''}${suggestion}.`)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-200">{suggestion}</button>
                          ))}
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button type="button" onClick={() => { setReplying(false); setReplyBody(''); }} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Batal</button>
                          <button type="button" onClick={sendReply} disabled={!replyBody.trim() || sending} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><Send className="h-3.5 w-3.5" />{sending ? 'Mengirim...' : 'Kirim'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </section>
    </div>
  );
};
''')

# -----------------------------------------------------------------------------
# package scripts + tests
# -----------------------------------------------------------------------------
package_path = Path('package.json')
p = package_path.read_text()
p = p.replace(
    '"verify:functions": "node --check functions/index.js && node --check functions/main.js && node --check functions/hierarchyApiV2.js',
    '"verify:functions": "node --check functions/index.js && node --check functions/main.js && node --check functions/mailboxWorkflow.js && node --check functions/hierarchyApiV2.js'
)
p = p.replace(
    '"test:mail": "node --test functions/internalMailPolicy.test.js tests/internal-mail-ui.test.cjs tests/periodic-review-notification-disabled.test.cjs && tsx --test tests/mailbox-filter.test.ts"',
    '"test:mail": "node --test functions/internalMailPolicy.test.js functions/mailboxWorkflow.test.js tests/internal-mail-ui.test.cjs tests/periodic-review-notification-disabled.test.cjs tests/notification-architecture.test.cjs && tsx --test tests/mailbox-filter.test.ts"'
)
package_path.write_text(p)

Path('functions/mailboxWorkflow.test.js').write_text(r'''"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveSopMailboxEvents, TOMBSTONE_RETENTION_MS } = require('./mailboxWorkflow');

test('proposal event is emitted only when activation request timestamp changes', () => {
  assert.deepEqual(deriveSopMailboxEvents(
    { status: 'DRAFT', activationRequestedAt: '' },
    { status: 'DRAFT', activationRequestedAt: '2026-09-25T01:00:00.000Z' }
  ), ['SOP_ACTIVATION_REQUESTED']);
  assert.deepEqual(deriveSopMailboxEvents(
    { status: 'DRAFT', activationRequestedAt: 'same' },
    { status: 'DRAFT', activationRequestedAt: 'same' }
  ), []);
});

test('activation and review transitions emit specific workflow event types', () => {
  assert.deepEqual(deriveSopMailboxEvents(
    { status: 'DRAFT', reviewState: 'REVISION_SUBMITTED' },
    { status: 'AKTIF', reviewState: 'VERIFIED', activatedAt: '2026-09-25T02:00:00.000Z' }
  ), ['SOP_ACTIVATED', 'SOP_VERIFIED']);
});

test('tombstone retention is finite', () => {
  assert.equal(TOMBSTONE_RETENTION_MS, 90 * 24 * 60 * 60 * 1000);
});
''')

Path('tests/notification-architecture.test.cjs').write_text(r'''const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('src/lib/notificationService.ts', 'utf8');
const modal = fs.readFileSync('src/components/NotificationModal.tsx', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const main = fs.readFileSync('functions/main.js', 'utf8');
const workflow = fs.readFileSync('functions/mailboxWorkflow.js', 'utf8');

test('notification content is backend-only and client state mutation is constrained', () => {
  assert.match(rules, /allow create: if false/);
  assert.match(rules, /hasOnly\(\[\s*'read', 'readAt', 'hidden', 'deletedAt'/s);
  assert.doesNotMatch(service, /setDoc\(fallbackRef/);
  assert.match(main, /createNotificationBlocked/);
});

test('legacy local proposal queue and login scans no longer produce official messages', () => {
  assert.doesNotMatch(service, /ADMIN_PROPOSALS_QUEUE_KEY/);
  assert.doesNotMatch(service, /queuePendingAdminProposal/);
  assert.match(service, /server Firestore workflow trigger is\s*the sole producer/i);
});

test('mailbox uses ordered server pagination and realtime chime guard', () => {
  assert.match(service, /orderBy\('timestamp', 'desc'\)/);
  assert.match(service, /firestoreLimit\(MAILBOX_PAGE_SIZE\)/);
  assert.match(service, /startAfter\(notificationCursor\)/);
  assert.match(service, /initialMailboxSnapshotSeen/);
  assert.match(service, /freshUnread/);
});

test('workflow lifecycle, thread UI and operational filter are present', () => {
  for (const eventType of ['SOP_ACTIVATION_REQUESTED', 'SOP_ACTIVATED', 'SOP_REVISION_REQUESTED', 'SOP_REVISION_SUBMITTED', 'SOP_VERIFIED']) {
    assert.match(workflow, new RegExp(eventType));
  }
  assert.match(workflow, /actionable/);
  assert.match(workflow, /resolvedAt/);
  assert.match(workflow, /resolvedReason/);
  assert.match(modal, /threadKeyFor/);
  assert.match(modal, /Perlu Tindakan/);
  assert.match(modal, /Muat Lebih Banyak/);
  assert.doesNotMatch(modal, /Belum Dibaca/);
});
''')
