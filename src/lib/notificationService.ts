/**
 * NOTIFICATION SERVICE - SIDOKTER SOEGIRI
 * Sistem Pesan real-time berbasis notification center
 * untuk penugasan dokumen ke divisi, aktivasi SPO oleh Admin bagi User,
 * usulan aktivasi bagi Admin, dan pesan alur perbaikan/verifikasi SPO.
 */
import { collection, onSnapshot, query, where, doc, setDoc, getDocs, orderBy, limit as firestoreLimit, startAfter } from 'firebase/firestore';
import { db, functions, auth } from './firebase';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';
import { SopDocument, UserSession, UserAccount } from '../types';
import { userCanAccessSop, getUserHierarchyAccessKeys, hasVerificatorBadge } from './soegiriStructure';
import { INTERNAL_MAIL_VERSION, isInternalMailItem, isVisibleMailboxItem } from './mailboxPolicy';

export { INTERNAL_MAIL_VERSION, isInternalMailItem } from './mailboxPolicy';

export type NotificationType =
  | 'activation'
  | 'proposal'
  | 'assignment'
  | 'review'
  | 'success'
  | 'info'
  | 'warning'
  | 'error';

export interface AppNotification {
  id: string;
  type: NotificationType;
  eventType?: string;
  title: string;
  message: string;
  documentId?: string;
  documentNumber?: string;
  documentType?: 'SPO' | 'SK' | 'MOU';
  divisionCode?: string;
  divisionName?: string;
  subHierarchyCode?: string;
  dueDate?: string;
  isOverdue?: boolean;
  timestamp: number;
  read: boolean;
  actionable?: boolean;
  resolvedAt?: number | null;
  resolvedReason?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  metadata?: Record<string, any>;
  hidden?: boolean;
}

export interface ReviewStatus {
  isDue: boolean;
  isOverdue: boolean;
  daysRemaining: number;
  dueDate: string;
  reason: string;
}

// In-memory set of already notified document IDs per session to prevent spamming
const notifiedReviewDocIds = new Set<string>();
const notifiedAssignmentDocIds = new Set<string>();
const notifiedActivationDocIds = new Set<string>();
const notifiedProposalDocIds = new Set<string>();

const NOTIF_MUTE_PREFIX = 'soegiri_notification_muted_v3';
let notificationScopeKey = 'anonymous';
let notificationAuthUid = '';
let unsubscribeNotificationCloud: (() => void) | null = null;
let cloudNotificationReady = false;
const pendingCloudWrites = new Set<string>();
const emittedSideEffectEventKeys = new Set<string>();
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

export function sanitizeEventKey(eventKey: string): string {
  // A Firestore document ID cannot contain forward slash '/' or exceed 1500 bytes.
  // Colons ':', dashes '-', underscores '_', dots '.' are completely valid in Firestore doc IDs.
  return String(eventKey || '').trim().replace(/\//g, '_').slice(0, 150);
}

export function getNotificationDocId(eventKey: string, fallbackId?: string): string {
  const raw = eventKey || fallbackId || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return sanitizeEventKey(raw);
}

function normalizeScopePart(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._@-]+/g, '_')
    .slice(0, 120);
}

function getNotificationScopeKey(userSession?: UserSession | null): string {
  const session = userSession as any;
  const stable = session?.authUid || session?.uid || session?.userId || '';
  return normalizeScopePart(stable) || 'anonymous';
}

function getNotificationMuteKey(): string {
  return `${NOTIF_MUTE_PREFIX}:${notificationScopeKey}`;
}

function getNotificationAuthUid(): string {
  return auth.currentUser?.uid || notificationAuthUid || '';
}

function notificationCollectionRef() {
  const uid = getNotificationAuthUid();
  // CRITICAL: Path is notifications/{UID}/items. Only query when authenticated UID matches.
  // This completely eliminates unauthenticated queries that trigger 'permission-denied' on READ.
  if (!uid || !auth.currentUser || auth.currentUser.uid !== uid) return null;
  return collection(db, 'notifications', uid, 'items');
}

function loadPersistedNotifications(): AppNotification[] {
  // Delivery state is cloud-authoritative; browser storage is never a mailbox source.
  return [];
}

function persistNotifications(_notifications: AppNotification[]): void {
  // Intentionally no-op. Only user preferences such as mute remain in localStorage.
}

function clearNotificationDedupeSets(): void {
  notifiedReviewDocIds.clear();
  notifiedAssignmentDocIds.clear();
  notifiedActivationDocIds.clear();
  notifiedProposalDocIds.clear();
}

function seedDedupeSetsFromNotifications(notifications: AppNotification[]): void {
  notifications.forEach((n) => {
    const key = String(n.metadata?.eventKey || n.id || '').trim();
    if (!key) return;
    if (n.type === 'review') notifiedReviewDocIds.add(key);
    else if (n.type === 'assignment') notifiedAssignmentDocIds.add(key);
    else if (n.type === 'activation') notifiedActivationDocIds.add(key);
    else if (n.type === 'proposal') notifiedProposalDocIds.add(key);
  });
}

function syncNotificationCloudListener(): void {
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

/** Switches notification state to the Firebase Auth UID of the authenticated account. */
export function setNotificationUserSession(userSession: UserSession | null): void {
  const nextAuthUid = auth.currentUser?.uid || String((userSession as any)?.authUid || '');
  const nextScope = getNotificationScopeKey(userSession);
  if (nextScope === notificationScopeKey && nextAuthUid === notificationAuthUid) return;

  if (unsubscribeNotificationCloud) {
    unsubscribeNotificationCloud();
    unsubscribeNotificationCloud = null;
  }
  cloudNotificationReady = false;
  pendingCloudWrites.clear();
  notificationCursor = null;
  notificationHasMore = false;
  initialMailboxSnapshotSeen = false;
  olderCloudItems = [];
  knownCloudNotificationIds.clear();
  notificationScopeKey = nextScope;
  notificationAuthUid = nextAuthUid;
  clearNotificationDedupeSets();
  emittedSideEffectEventKeys.clear();
  activeNotifications = [];
  seedDedupeSetsFromNotifications(activeNotifications);


  notifySubscribers();

  syncNotificationCloudListener();
}

let activeNotifications: AppNotification[] = [];
const notificationListeners = new Set<(notifications: AppNotification[]) => void>();

if (typeof window !== 'undefined') {
  // Listen for Firebase Auth user state changes so the notification listener always runs
  // with a valid request.auth.uid matching the path notifications/{UID}/items/{eventKey}
  onAuthStateChanged(auth, (firebaseUser) => {
    const nextAuthUid = firebaseUser?.uid || '';
    if (nextAuthUid !== notificationAuthUid) {
      notificationAuthUid = nextAuthUid;
      syncNotificationCloudListener();
    }
  });

}

async function persistNotificationReadToCloud(item: AppNotification): Promise<void> {
  const ref = notificationCollectionRef();
  if (!ref) return;
  const eventKey = String(item.metadata?.eventKey || item.id || '').trim();
  const docId = getNotificationDocId(eventKey, item.id);
  try {
    await setDoc(
      doc(ref, docId),
      {
        read: Boolean(item.read),
        readAt: item.read ? Date.now() : null
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('Could not update notification read state:', error);
  }
}

async function persistNotificationDeleteToCloud(item: AppNotification): Promise<void> {
  const ref = notificationCollectionRef();
  if (!ref) return;
  const eventKey = String(item.metadata?.eventKey || item.id || '').trim();
  const id = getNotificationDocId(eventKey, item.id);
  try {
    await setDoc(doc(ref, id), { hidden: true, deletedAt: Date.now() }, { merge: true });
  } catch (error) {
    console.warn('Could not hide notification:', error);
  }
}

export async function replyToInternalMail(sourceNotificationId: string, body: string): Promise<void> {
  const replyInternalMail = httpsCallable(functions, 'replyInternalMail');
  await replyInternalMail({ sourceNotificationId, body: body.trim() });
}

/* =========================================================================
   AUDIO CHIME (WEB AUDIO API)
 * ========================================================================= */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export function isAudioMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(getNotificationMuteKey()) === 'true';
}

export function setAudioMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getNotificationMuteKey(), muted ? 'true' : 'false');
}

export function playChime(
  type: 'activation' | 'proposal' | 'assignment' | 'review' | 'default' = 'default'
): void {
  if (isAudioMuted() || typeof window === 'undefined') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    gain.connect(ctx.destination);
    osc.connect(gain);

    if (type === 'activation') {
      // Pleasant hospital activation chime (Harmonic ascend: E5 -> G#5 -> B5 -> E6)
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.exponentialRampToValueAtTime(830.61, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.16);
      osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.24);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.start(now);
      osc.stop(now + 0.55);
    } else if (type === 'proposal') {
      // Crisp double tone for new user activation proposal: F5 (698Hz) -> C6 (1046Hz)
      osc.frequency.setValueAtTime(698.46, now);
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.start(now);
      osc.stop(now + 0.42);
    } else if (type === 'assignment') {
      // Pleasant hospital assignment chime: C5 (523Hz) -> G5 (784Hz) -> C6 (1046Hz)
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.18);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    } else if (type === 'review') {
      // Gentle warning reminder chime: A4 (440Hz) -> F5 (698Hz)
      osc.frequency.setValueAtTime(440.0, now);
      osc.frequency.exponentialRampToValueAtTime(698.46, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else {
      osc.frequency.setValueAtTime(587.33, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch {
    // Autoplay policy or unsupported audio context
  }
}

/* =========================================================================
   PERIODIC REVIEW EVALUATION (RSUD DR. SOEGIRI STANDARD)
 * ========================================================================= */

/**
 * Checks whether an SOP document is due for periodic review.
 * In accordance with Indonesian hospital accreditation (KARS) and RSUD Dr. Soegiri,
 * documents must be reviewed periodically (typically 36 months / 3 years or custom interval).
 */
export function evaluatePeriodicReview(sop: SopDocument): ReviewStatus {
  if (!sop || sop.status === 'DIARSIPKAN') {
    return { isDue: false, isOverdue: false, daysRemaining: 9999, dueDate: '', reason: '' };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let dueDate: Date | null = null;

  // 1. Explicit nextReviewDate
  if (sop.nextReviewDate && sop.nextReviewDate.trim()) {
    const parsed = new Date(sop.nextReviewDate);
    if (!isNaN(parsed.getTime())) {
      dueDate = parsed;
    }
  }

  // 2. Computed from effectiveDate + reviewPeriodMonths (or default 36 months)
  if (!dueDate && sop.effectiveDate && sop.effectiveDate.trim()) {
    const eff = new Date(sop.effectiveDate);
    if (!isNaN(eff.getTime())) {
      const months = sop.reviewPeriodMonths && sop.reviewPeriodMonths > 0 ? Number(sop.reviewPeriodMonths) : 36;
      eff.setMonth(eff.getMonth() + months);
      dueDate = eff;
    }
  }

  // 3. Fallback: createdAt + 36 months
  if (!dueDate && sop.createdAt && sop.createdAt.trim()) {
    const created = new Date(sop.createdAt);
    if (!isNaN(created.getTime())) {
      created.setMonth(created.getMonth() + 36);
      dueDate = created;
    }
  }

  if (!dueDate) {
    return { isDue: false, isOverdue: false, daysRemaining: 9999, dueDate: '', reason: '' };
  }

  const diffMs = dueDate.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const formattedDueDate = dueDate.toISOString().split('T')[0];

  // Overdue
  if (daysRemaining <= 0) {
    const daysAgo = Math.abs(daysRemaining);
    return {
      isDue: true,
      isOverdue: true,
      daysRemaining,
      dueDate: formattedDueDate,
      reason: daysAgo === 0
        ? `Jatuh tempo riviu berkala hari ini (${formattedDueDate}).`
        : `Telah melewati batas waktu riviu berkala ${daysAgo} hari yang lalu (${formattedDueDate}).`
    };
  }

  // Due soon within 30 days
  if (daysRemaining <= 30) {
    return {
      isDue: true,
      isOverdue: false,
      daysRemaining,
      dueDate: formattedDueDate,
      reason: `Jatuh tempo peninjauan berkala dalam ${daysRemaining} hari lagi (${formattedDueDate}).`
    };
  }

  return {
    isDue: false,
    isOverdue: false,
    daysRemaining,
    dueDate: formattedDueDate,
    reason: ''
  };
}

/* =========================================================================
   USER DIVISION MATCHING
 * ========================================================================= */

/**
 * Checks whether a document's division code corresponds to the user's division(s).
 * Admin accounts oversee all divisions.
 */
export function isAssignedToUserDivision(
  divisionCode?: string,
  userSession?: UserSession | null
): boolean {
  if (!userSession) return false;
  if (userSession.role === 'admin') return true;
  if (!divisionCode) return false;

  const target = divisionCode.trim().toUpperCase();

  // Legacy single division code
  if (userSession.divisionCode && userSession.divisionCode.trim().toUpperCase() === target) {
    return true;
  }

  // Array of division codes
  if (
    Array.isArray(userSession.divisionCodes) &&
    userSession.divisionCodes.some((c) => c && c.trim().toUpperCase() === target)
  ) {
    return true;
  }

  // Multi-hierarchy assignments
  if (
    Array.isArray(userSession.assignments) &&
    userSession.assignments.some(
      (a) => a && a.divisionCode && a.divisionCode.trim().toUpperCase() === target
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================================
   NOTIFICATION STATE & SUBSCRIBERS
 * ========================================================================= */

export function subscribeToNotifications(
  callback: (notifications: AppNotification[]) => void
): () => void {
  callback(activeNotifications);
  notificationListeners.add(callback);
  return () => {
    notificationListeners.delete(callback);
  };
}

function notifySubscribers(): void {
  const list = [...activeNotifications];
  notificationListeners.forEach((cb) => {
    try {
      cb(list);
    } catch (e) {
      console.error('Error in notification listener:', e);
    }
  });
}

type NotificationEventPayload = {
  type: 'assignment' | 'review' | 'activation' | 'proposal';
  sop: SopDocument;
  eventKey: string;
  message: string;
  title: string;
  actionLabel: string;
  dueDate?: string;
  isOverdue?: boolean;
  onAction?: () => void;
};

/** Single gate for notification creation and UI side effects. */
function processNotificationEvent(event: NotificationEventPayload, _onToast: RealtimeWatcherOptions['onToast']): AppNotification | null {
  const key = String(event.eventKey || '').trim();
  if (!key) return null;
  if (emittedSideEffectEventKeys.has(key)) return null;
  if (
    notifiedReviewDocIds.has(key) ||
    notifiedAssignmentDocIds.has(key) ||
    notifiedActivationDocIds.has(key) ||
    notifiedProposalDocIds.has(key)
  ) return null;

  if (event.type === 'review') notifiedReviewDocIds.add(key);
  else if (event.type === 'assignment') notifiedAssignmentDocIds.add(key);
  else if (event.type === 'activation') notifiedActivationDocIds.add(key);
  else if (event.type === 'proposal') notifiedProposalDocIds.add(key);

  emittedSideEffectEventKeys.add(key);
  const item = addNotification({
    type: event.type,
    title: event.title,
    message: event.message,
    documentId: event.sop.id,
    documentNumber: event.sop.sopNumber,
    documentType: 'SPO',
    divisionCode: event.sop.divisionCode,
    divisionName: event.sop.divisionName,
    dueDate: event.dueDate,
    isOverdue: event.isOverdue,
    metadata: { eventKey: key, documentTitle: event.sop.title },
    actionLabel: event.actionLabel,
    onAction: event.onAction
  });

  // Workflow events belong in Pesan, not in action-feedback toasts.
  playChime(event.type);
  return item;
}

export function addNotification(
  notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>
): AppNotification {
  const eventKey = String(notification.metadata?.eventKey || '').trim();
  const docId = getNotificationDocId(eventKey, undefined);
  if (eventKey) {
    const existing = activeNotifications.find((n) => String(n.metadata?.eventKey || n.id).trim() === eventKey || n.id === docId);
    if (existing) return existing;
  }

  const item: AppNotification = {
    ...notification,
    id: docId,
    timestamp: Date.now(),
    read: false,
    metadata: { ...(notification.metadata || {}), eventKey: eventKey || docId, internalMailVersion: INTERNAL_MAIL_VERSION },
    hidden: false
  };

  activeNotifications = [item, ...activeNotifications.filter((n) => n.id !== item.id).slice(0, 49)];
  persistNotifications(activeNotifications);
  notifySubscribers();
  return item;
}

export function markNotificationAsRead(id: string): void {
  const item = activeNotifications.find((n) => n.id === id);
  activeNotifications = activeNotifications.map((n) => n.id === id ? { ...n, read: true } : n);
  persistNotifications(activeNotifications);
  notifySubscribers();
  if (item) void persistNotificationReadToCloud({ ...item, read: true });
}

export function markNotificationAsUnread(id: string): void {
  const item = activeNotifications.find((n) => n.id === id);
  activeNotifications = activeNotifications.map((n) => n.id === id ? { ...n, read: false } : n);
  persistNotifications(activeNotifications);
  notifySubscribers();
  if (item) void persistNotificationReadToCloud({ ...item, read: false });
}

/** Per-user soft delete: hides only this authenticated user's mailbox copy. */
export function deleteNotification(id: string): void {
  const item = activeNotifications.find((n) => n.id === id);
  if (!item) return;
  activeNotifications = activeNotifications.filter((n) => n.id !== id);
  persistNotifications(activeNotifications);
  notifySubscribers();
  void persistNotificationDeleteToCloud(item);
}

export function markAllNotificationsAsRead(): void {
  const items = activeNotifications.map((n) => ({ ...n, read: true }));
  activeNotifications = items;
  persistNotifications(activeNotifications);
  notifySubscribers();
  items.forEach((item) => void persistNotificationReadToCloud(item));
}

export async function clearNotifications(): Promise<void> {
  const clearMailbox = httpsCallable(functions, 'clearNotificationMailbox');
  await clearMailbox({});
  activeNotifications = [];
  olderCloudItems = [];
  notificationCursor = null;
  notificationHasMore = false;
  knownCloudNotificationIds.clear();
  notifySubscribers();
}

/* =========================================================================
   REAL-TIME FIRESTORE & LOCAL LISTENER
 * ========================================================================= */

let currentUsersList: UserAccount[] = [];

export function setNotificationUsers(users: UserAccount[]): void {
  if (Array.isArray(users)) {
    currentUsersList = users;
  }
}

export function resolveProposerFullName(sop: SopDocument, usersList?: UserAccount[]): string {
  const users = usersList || currentUsersList;
  const reqBy = String(sop.activationRequestedBy || '').trim();
  const reqUsername = String((sop as any).activationRequestedByUsername || (sop as any).activationRequestedUsername || '').trim();
  const creator = String(sop.creatorName || '').trim();
  const creatorUsername = String((sop as any).creatorUsername || '').trim();

  if (Array.isArray(users) && users.length > 0) {
    const targetUsername = (reqUsername || creatorUsername || reqBy || creator).toLowerCase();
    const matchedByUsername = users.find((u) => u?.username && String(u.username).trim().toLowerCase() === targetUsername);
    if (matchedByUsername?.name) return matchedByUsername.name;

    const matchedByName = users.find((u) => u?.name && String(u.name).trim().toLowerCase() === reqBy.toLowerCase());
    if (matchedByName?.name) return matchedByName.name;

    const matchedByCreator = users.find((u) => u?.name && String(u.name).trim().toLowerCase() === creator.toLowerCase());
    if (matchedByCreator?.name) return matchedByCreator.name;
  }

  if (reqBy && reqBy.toLowerCase() !== 'pengguna' && reqBy.toLowerCase() !== 'user') {
    return reqBy;
  }
  if (creator && creator.toLowerCase() !== 'pengguna' && creator.toLowerCase() !== 'user') {
    return creator;
  }
  return reqBy || creator || 'Pengguna';
}

function getSopWorkflowCategory(sop: SopDocument): 'BARU' | 'RIVIU' | 'EKSISTING' {
  const jenis = String(sop.jenis_spo || sop.documentType || '').trim().toUpperCase();
  if (jenis === 'RIVIU' || jenis === 'REVIEW' || sop.isReviewDocument === true) return 'RIVIU';
  if (jenis === 'EKSISTING' || sop.documentType === 'LAMA' || sop.isLegacySop === true) return 'EKSISTING';
  return 'BARU';
}

export function getProposalNotificationMeta(sop: SopDocument, users?: UserAccount[]): { title: string; message: string } {
  const category = getSopWorkflowCategory(sop);
  const creatorLabel = resolveProposerFullName(sop, users || currentUsersList);
  const unitLabel = sop.divisionName || sop.divisionCode || 'Unit';
  const docNum = sop.sopNumber ? `(${sop.sopNumber})` : '(Draft)';

  if (category === 'RIVIU') {
    return {
      title: 'Usulan Hasil Riviu SPO',
      message: `${creatorLabel} (${unitLabel}) mengusulkan SPO pilihan (Hasil Riviu): "${sop.title}" ${docNum} menunggu persetujuan Admin.`
    };
  }
  if (category === 'EKSISTING') {
    return {
      title: 'Usulan Aktivasi SPO Eksisting',
      message: `${creatorLabel} (${unitLabel}) mengusulkan SPO pilihan (Eksisting): "${sop.title}" ${docNum} menunggu persetujuan Admin.`
    };
  }
  return {
    title: 'Usulan Aktivasi SPO Baru',
    message: `${creatorLabel} (${unitLabel}) mengusulkan SPO pilihan: "${sop.title}" ${docNum} menunggu persetujuan Admin.`
  };
}

export function getActivationNotificationMeta(sop: SopDocument): { title: string; message: string } {
  const category = getSopWorkflowCategory(sop);
  const unitLabel = sop.divisionName || sop.divisionCode || 'unit Anda';

  if (category === 'RIVIU') {
    return {
      title: 'Hasil Riviu SPO Disetujui & Aktif',
      message: `Hasil riviu SPO "${sop.title}" (${sop.sopNumber || 'Resmi'}) telah disetujui & diaktifkan oleh Admin untuk ${unitLabel}.`
    };
  }
  if (category === 'EKSISTING') {
    return {
      title: 'SPO Eksisting Disetujui & Aktif',
      message: `SPO Eksisting "${sop.title}" (${sop.sopNumber || 'Eksisting'}) telah disetujui & diaktifkan oleh Admin. PDF tetap asli tanpa TTD/Stempel tambahan.`
    };
  }
  return {
    title: 'SPO Baru Disetujui & Aktif',
    message: `SPO Baru "${sop.title}" (${sop.sopNumber || 'Resmi'}) telah disetujui & diaktifkan oleh Admin untuk ${unitLabel}.`
  };
}

function getActivationEventKey(sop: SopDocument): string {
  return `activation:${sop.id}:${sop.activatedAt || 'active'}`;
}

function getProposalEventKey(sop: SopDocument): string {
  return `proposal:${sop.id}:${sop.activationRequestedAt || 'draft'}`;
}

function getAssignmentEventKey(sop: SopDocument): string {
  // Prefer an explicit assignment change timestamp/revision when available.
  // This keeps a re-assignment of the same document distinguishable from the
  // original assignment while remaining backward-compatible with legacy SPOs.
  const raw = sop as any;
  const assignmentVersion = String(
    raw.assignmentUpdatedAt || raw.assignedAt || raw.assignmentRevision || ''
  ).trim();
  const assignmentFingerprint = Array.isArray(sop.accessKeys)
    ? [...sop.accessKeys].map(String).sort().join(',')
    : String(sop.divisionCode || '');
  return `assignment:${sop.id}:${assignmentVersion || assignmentFingerprint || 'unassigned'}`;
}

function getReviewEventKey(sop: SopDocument, dueDate: string): string {
  return `review:${sop.id}:${dueDate || 'review'}`;
}

const documentBroadcastChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('soegiri_document_channel')
  : null;

/**
 * Robust check if a user is the proposer or creator of an SPO.
 * Checks UID, username, full name, and handles academic/medical title variations.
 * Ensures activation notifications ONLY reach the specific proposing user.
 */
export function isUserPengusulSop(sop: SopDocument, userSession: UserSession | null): boolean {
  if (!userSession || !sop) return false;

  const sessionName = String(userSession.name || '').trim().toLowerCase();
  const sessionUsername = String(userSession.username || '').trim().toLowerCase();
  const sessionUid = String(userSession.authUid || userSession.id || '').trim();

  const reqBy = String(sop.activationRequestedBy || '').trim().toLowerCase();
  const reqUsername = String((sop as any).activationRequestedByUsername || (sop as any).activationRequestedUsername || '').trim().toLowerCase();
  const reqUid = String((sop as any).activationRequestedUid || '').trim();

  const creator = String(sop.creatorName || '').trim().toLowerCase();
  const creatorUsername = String((sop as any).creatorUsername || '').trim().toLowerCase();
  const creatorUid = String((sop as any).creatorUid || '').trim();

  // Strip academic / medical degree prefixes and suffixes
  const cleanName = (val: string) =>
    val
      .replace(/^(dr\.|drg\.|ns\.|prof\.|h\.|hj\.|apt\.|bidan|perawat)\s*/gi, '')
      .replace(/,\s*.*$/gi, '')
      .trim();

  const cleanSessionName = cleanName(sessionName);
  const cleanReqBy = cleanName(reqBy);
  const cleanCreator = cleanName(creator);

  // If explicit activation request metadata exists, match strictly against the requester
  const hasRequesterMeta = Boolean(reqUid || reqUsername || reqBy);
  if (hasRequesterMeta) {
    if (sessionUid && reqUid && sessionUid === reqUid) return true;
    if (sessionUsername && reqUsername && sessionUsername === reqUsername) return true;
    if (sessionUsername && reqBy && sessionUsername === reqBy) return true;
    if (sessionName && reqBy && (sessionName === reqBy || (cleanSessionName && cleanSessionName === cleanReqBy))) return true;
    if (cleanSessionName && cleanReqBy && cleanSessionName.length >= 4 && (cleanReqBy.includes(cleanSessionName) || cleanSessionName.includes(cleanReqBy))) return true;

    // Has explicit requester metadata but this session does not match it -> NOT the proposer
    return false;
  }

  // Fallback to creator metadata if no specific activation requester was recorded
  if (sessionUid && creatorUid && sessionUid === creatorUid) return true;
  if (sessionUsername && creatorUsername && sessionUsername === creatorUsername) return true;
  if (sessionUsername && creator && sessionUsername === creator) return true;
  if (sessionName && creator && (sessionName === creator || (cleanSessionName && cleanSessionName === cleanCreator))) return true;
  if (cleanSessionName && cleanCreator && cleanSessionName.length >= 4 && (cleanCreator.includes(cleanSessionName) || cleanSessionName.includes(cleanCreator))) return true;

  return false;
}

export interface RealtimeWatcherOptions {
  userSession: UserSession | null;
  onToast: (
    type: NotificationType,
    title: string,
    message?: string,
    options?: {
      document?: SopDocument;
      divisionCode?: string;
      dueDate?: string;
      isOverdue?: boolean;
      actionLabel?: string;
      onAction?: () => void;
    }
  ) => void;
  onSelectDocument?: (doc: SopDocument) => void;
}

/**
 * Initializes real-time listener for document assignments, admin activation alerts
 * for users in that hierarchy, and user proposals for admin.
 * Combines Firestore onSnapshot and local event listeners.
 */
export function setupDocumentRealtimeWatcher({
  userSession
}: RealtimeWatcherOptions): () => void {
  if (!userSession) return () => {};
  setNotificationUserSession(userSession);
  // Workflow notification production is backend-authoritative. This watcher now
  // only binds the authenticated mailbox listener; it never creates messages.
  return () => {};
}

/**
 * Dispatches an event when a document is assigned, updated, activated, or proposed locally.
 * Broadcasts across same-window and cross-tab BroadcastChannel.
 */
export function dispatchDocumentEvent(
  _type: 'assignment' | 'review' | 'activation' | 'proposal',
  _document: SopDocument,
  _reason?: string
): void {
  // Kept for call-site compatibility. The server Firestore workflow trigger is
  // the sole producer of official workflow mailbox records.
  return;
}

/**
 * Evaluates all existing documents in memory on login/session mount and alerts Admin if any
 * document is a pending proposal (DRAFT) waiting for Admin approval/activation.
 */
export function scanDocumentsForProposals(
  _sops: SopDocument[],
  _userSession: UserSession | null,
  _users: UserAccount[] | undefined,
  _onToast: RealtimeWatcherOptions['onToast'],
  _onSelectDocument?: (doc: SopDocument) => void
): void {
  return;
}

/**
 * Evaluates all documents on session mount to ensure any activated documents
 * proposed by this user (or in user's hierarchy) have generated notifications.
 */
export function scanDocumentsForActivations(
  _sops: SopDocument[],
  _userSession: UserSession | null,
  _onToast: RealtimeWatcherOptions['onToast'],
  _onSelectDocument?: (doc: SopDocument) => void
): void {
  return;
}

/**
 * Backward-compatible no-op. Automatic periodic/annual SPO review reminders were
 * retired from Pesan; review dates may still exist as document metadata.
 */
export function scanDocumentsForPeriodicReviews(
  _sops: SopDocument[],
  _userSession: UserSession | null,
  _onToast: RealtimeWatcherOptions['onToast'],
  _onSelectDocument?: (doc: SopDocument) => void
): void {
  return;
}
