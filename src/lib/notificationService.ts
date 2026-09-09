/**
 * NOTIFICATION SERVICE - SIDOKTER SOEGIRI
 * Sistem notifikasi real-time berbasis toast & notification center
 * untuk penugasan dokumen ke divisi, pengingat riviu berkala,
 * aktivasi SPO oleh Admin bagi User, dan usulan aktivasi bagi Admin.
 */
import { collection, onSnapshot, query, where, doc, setDoc, writeBatch } from 'firebase/firestore';
import { db, functions, auth } from './firebase';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';
import { SopDocument, UserSession, UserAccount } from '../types';
import { userCanAccessSop, getUserHierarchyAccessKeys, hasVerificatorBadge } from './soegiriStructure';

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

const NOTIF_STORAGE_PREFIX = 'soegiri_active_notifications_v3';
const NOTIF_MUTE_PREFIX = 'soegiri_notification_muted_v3';

let notificationScopeKey = 'anonymous';
let notificationAuthUid = '';
let unsubscribeNotificationCloud: (() => void) | null = null;
let cloudNotificationReady = false;
const pendingCloudWrites = new Set<string>();
const emittedSideEffectEventKeys = new Set<string>();

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

function getNotificationStorageKey(): string {
  return `${NOTIF_STORAGE_PREFIX}:${notificationScopeKey}`;
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
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getNotificationStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((n) => n && typeof n.id === 'string' && typeof n.type === 'string')
        .slice(0, 50);
    }
  } catch {}
  return [];
}

function persistNotifications(notifications: AppNotification[]): void {
  if (typeof window === 'undefined') return;
  try {
    const serializable = notifications.slice(0, 50).map(({ onAction, ...rest }) => rest);
    localStorage.setItem(getNotificationStorageKey(), JSON.stringify(serializable));
  } catch {}
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

  unsubscribeNotificationCloud = onSnapshot(ref, (snapshot) => {
    const cloudItemsAll = snapshot.docs
      .map((d) => d.data() as AppNotification)
      .filter((n) => n && typeof n.id === 'string' && typeof n.type === 'string');

    // Seed dedupe from ALL cloud records, including hidden tombstones. This prevents
    // a cleared event from being recreated by a second producer after reload or across devices.
    seedDedupeSetsFromNotifications(cloudItemsAll);

    const cloudItems = cloudItemsAll
      .filter((n) => n.hidden !== true)
      .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
      .slice(0, 50);

    const pending = activeNotifications.filter((n) => pendingCloudWrites.has(n.metadata?.eventKey || n.id));
    const byKey = new Map<string, AppNotification>();
    [...cloudItems, ...pending].forEach((n) => {
      const key = n.metadata?.eventKey || n.id;
      if (!byKey.has(key) || Number(n.timestamp || 0) > Number(byKey.get(key)?.timestamp || 0)) byKey.set(key, n);
    });
    activeNotifications = [...byKey.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
    cloudNotificationReady = true;
    persistNotifications(activeNotifications);
    notifySubscribers();
  }, (error) => {
    cloudNotificationReady = false;
    console.warn('Notification Firestore listener note:', error?.message || error);
  });
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
  notificationScopeKey = nextScope;
  notificationAuthUid = nextAuthUid;
  clearNotificationDedupeSets();
  emittedSideEffectEventKeys.clear();
  activeNotifications = loadPersistedNotifications();
  seedDedupeSetsFromNotifications(activeNotifications);

  if (userSession?.role === 'admin' || hasVerificatorBadge(userSession)) {
    ingestQueuedAdminProposals();
  }

  notifySubscribers();

  syncNotificationCloudListener();
}

const ADMIN_PROPOSALS_QUEUE_KEY = 'soegiri_pending_admin_proposals_v2';

export function queuePendingAdminProposal(sop: SopDocument, reason?: string): void {
  if (typeof window === 'undefined' || !sop) return;
  try {
    const meta = getProposalNotificationMeta(sop, currentUsersList);
    const eventKey = getProposalEventKey(sop);
    const docId = getNotificationDocId(eventKey, undefined);
    const notifItem: AppNotification = {
      id: docId,
      type: 'proposal',
      title: meta.title,
      message: reason || meta.message,
      documentId: sop.id,
      documentNumber: sop.sopNumber,
      documentType: 'SPO',
      divisionCode: sop.divisionCode,
      divisionName: sop.divisionName,
      timestamp: Date.now(),
      read: false,
      hidden: false,
      metadata: { eventKey },
      actionLabel: 'Tinjau & Sahkan'
    };

    const raw = localStorage.getItem(ADMIN_PROPOSALS_QUEUE_KEY);
    const list: AppNotification[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((n) => n.id !== docId && n.metadata?.eventKey !== eventKey);
    localStorage.setItem(ADMIN_PROPOSALS_QUEUE_KEY, JSON.stringify([notifItem, ...filtered].slice(0, 40)));
  } catch (err) {
    console.warn('Unable to queue admin proposal notification:', err);
  }
}

export function removeQueuedAdminProposal(sopId: string): void {
  if (typeof window === 'undefined' || !sopId) return;
  try {
    const raw = localStorage.getItem(ADMIN_PROPOSALS_QUEUE_KEY);
    if (!raw) return;
    const list: AppNotification[] = JSON.parse(raw);
    if (!Array.isArray(list)) return;
    const filtered = list.filter((n) => n.documentId !== sopId);
    localStorage.setItem(ADMIN_PROPOSALS_QUEUE_KEY, JSON.stringify(filtered));
  } catch {}
}

export function ingestQueuedAdminProposals(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(ADMIN_PROPOSALS_QUEUE_KEY);
    if (!raw) return false;
    const queued: AppNotification[] = JSON.parse(raw);
    if (!Array.isArray(queued) || queued.length === 0) return false;

    let modified = false;
    queued.forEach((item) => {
      const exists = activeNotifications.some(
        (n) => n.id === item.id || (n.metadata?.eventKey && n.metadata.eventKey === item.metadata?.eventKey)
      );
      if (!exists) {
        activeNotifications = [item, ...activeNotifications.filter((n) => n.id !== item.id)].slice(0, 50);
        modified = true;
      }
    });

    if (modified) {
      persistNotifications(activeNotifications);
      notifySubscribers();
    }
    return modified;
  } catch {
    return false;
  }
}

let activeNotifications: AppNotification[] = loadPersistedNotifications();
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

  window.addEventListener('storage', (event) => {
    if (event.key !== getNotificationStorageKey()) return;
    activeNotifications = loadPersistedNotifications();
    notifySubscribers();
  });
}

async function persistNotificationToCloud(item: AppNotification): Promise<void> {
  const ref = notificationCollectionRef();
  if (!ref) return;
  const eventKey = String(item.metadata?.eventKey || item.id || '').trim();
  const docId = getNotificationDocId(eventKey, item.id);
  pendingCloudWrites.add(eventKey || docId);
  try {
    const { onAction, ...serializable } = item;
    const fallbackRef = doc(ref, docId);
    const payload = {
      id: docId,
      type: serializable.type,
      title: String(serializable.title || '').slice(0, 200),
      message: String(serializable.message || '').slice(0, 2000),
      documentId: serializable.documentId || null,
      documentNumber: serializable.documentNumber || null,
      documentType: serializable.documentType || null,
      divisionCode: serializable.divisionCode || null,
      divisionName: serializable.divisionName || null,
      subHierarchyCode: serializable.subHierarchyCode || null,
      dueDate: serializable.dueDate || null,
      isOverdue: Boolean(serializable.isOverdue),
      timestamp: Number(serializable.timestamp || Date.now()),
      read: false,
      hidden: false,
      metadata: { eventKey: eventKey || docId }
    };

    const createNotification = httpsCallable(functions, 'createNotification');
    try {
      await createNotification({ item: { ...payload, id: docId } });
    } catch {
      // Constrained direct Firestore fallback: path notifications/{UID}/items/{eventKey}
      // Using merge: true guarantees idempotent writes and prevents permission-denied
      await setDoc(fallbackRef, payload, { merge: true });
    }
  } catch (error) {
    console.warn('Could not persist notification to Firestore:', error);
  } finally {
    pendingCloudWrites.delete(eventKey || docId);
  }
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
        id: docId,
        read: Boolean(item.read),
        readAt: item.read ? Date.now() : null
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('Could not update notification read state:', error);
  }
}

/* =========================================================================
   AUDIO CHIME (WEB AUDIO API)
========================================================================= */

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
========================================================================= */

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
========================================================================= */

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
========================================================================= */

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
function processNotificationEvent(event: NotificationEventPayload, onToast: RealtimeWatcherOptions['onToast']): AppNotification | null {
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
    metadata: { eventKey: key },
    actionLabel: event.actionLabel,
    onAction: event.onAction
  });

  // UI side effects happen only after the event has passed the same dedupe gate.
  playChime(event.type);
  onToast(event.type, event.title, event.message, {
    document: event.sop,
    divisionCode: event.sop.divisionCode,
    dueDate: event.dueDate,
    isOverdue: event.isOverdue,
    actionLabel: event.actionLabel,
    onAction: event.onAction
  });
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
    metadata: { ...(notification.metadata || {}), eventKey: eventKey || docId },
    hidden: false
  };

  activeNotifications = [item, ...activeNotifications.filter((n) => n.id !== item.id).slice(0, 49)];
  persistNotifications(activeNotifications);
  notifySubscribers();
  void persistNotificationToCloud(item);
  return item;
}

export function markNotificationAsRead(id: string): void {
  const item = activeNotifications.find((n) => n.id === id);
  activeNotifications = activeNotifications.map((n) => n.id === id ? { ...n, read: true } : n);
  persistNotifications(activeNotifications);
  notifySubscribers();
  if (item) void persistNotificationReadToCloud({ ...item, read: true });
}

export function markAllNotificationsAsRead(): void {
  const items = activeNotifications.map((n) => ({ ...n, read: true }));
  activeNotifications = items;
  persistNotifications(activeNotifications);
  notifySubscribers();
  items.forEach((item) => void persistNotificationReadToCloud(item));
}

export function clearNotifications(): void {
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

/* =========================================================================
   REAL-TIME FIRESTORE & LOCAL LISTENER
========================================================================= */

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
 * Initializes real-time listener for document assignments, periodic reviews,
 * admin activation alerts for users in that hierarchy, and user proposals for admin.
 * Combines Firestore onSnapshot and local event listeners.
 */
export function setupDocumentRealtimeWatcher({
  userSession,
  onToast,
  onSelectDocument
}: RealtimeWatcherOptions): () => void {
  if (!userSession) return () => {};
  setNotificationUserSession(userSession);

  let isFirstSnapshot = true;
  const initialKnownDocIds = new Set<string>();
  const docStatusMap = new Map<string, string>();
  const docActivationReqMap = new Map<string, string>();

  // 1. Listen to Firestore 'sops' collection in real-time
  let unsubscribeFirestore: (() => void) | null = null;
  try {
    const sopsCollection = collection(db, 'sops');
    const isAdmin = userSession.role === 'admin';
    const hasAllHierarchyAssignment = Array.isArray(userSession?.assignments)
      ? userSession.assignments.some((a) => String(a?.divisionCode || '').trim().toUpperCase() === 'ALL')
      : Array.isArray(userSession?.divisionCodes)
        ? userSession.divisionCodes.some((code) => String(code || '').trim().toUpperCase() === 'ALL')
        : String(userSession?.divisionCode || '').trim().toUpperCase() === 'ALL';
    const globalAccess = isAdmin || hasAllHierarchyAssignment;
    const scopedKeys = getUserHierarchyAccessKeys(userSession);

    const sopsQuery = globalAccess
      ? sopsCollection
      : (scopedKeys.length > 0
          ? query(sopsCollection, where('authorizedUids', 'array-contains', auth.currentUser!.uid))
          : null);

    if (sopsQuery && auth.currentUser) {
      unsubscribeFirestore = onSnapshot(
        sopsQuery,
      (snapshot) => {
        if (isFirstSnapshot) {
          // Record existing documents and baseline statuses
          snapshot.docs.forEach((d) => {
            initialKnownDocIds.add(d.id);
            const data = d.data() as SopDocument;
            if (data?.id) {
              docStatusMap.set(data.id, data.status || '');
              if (data.activationRequestedAt) {
                docActivationReqMap.set(data.id, data.activationRequestedAt);
              }

              // Check if this document is an activated document proposed by this user that hasn't been notified yet
              // (handles cases where admin activated the document while user was offline or in another session)
              // NOTE: Notif pengaktifan HANYA masuk ke user pengusul, BUKAN ke semua user
              const isAdmin = userSession.role === 'admin';
              if (!isAdmin && data.status === 'AKTIF' && isUserPengusulSop(data, userSession)) {
                const actKey = getActivationEventKey(data);
                const alreadyNotified =
                  notifiedActivationDocIds.has(actKey) ||
                  activeNotifications.some(
                    (n) => n.metadata?.eventKey === actKey || (n.type === 'activation' && n.documentId === data.id)
                  );
                if (!alreadyNotified && (data.activatedAt || data.activationRequestedAt)) {
                  const meta = getActivationNotificationMeta(data);
                  processNotificationEvent(
                    {
                      type: 'activation',
                      sop: data,
                      eventKey: actKey,
                      title: meta.title,
                      message: meta.message,
                      actionLabel: 'Buka Dokumen',
                      onAction: () => onSelectDocument?.(data)
                    },
                    onToast
                  );
                }
              }

              // Check if this document is an unapproved draft proposal for Admin that hasn't been notified yet
              const canReceiveProposalNotif = isAdmin || (hasVerificatorBadge(userSession) && userCanAccessSop(data, userSession));
              if (canReceiveProposalNotif && data.status === 'DRAFT' && (data.activationRequestedAt || data.activationRequestedBy || data.isLegacySop || data.isReviewDocument || data.jenis_spo === 'BARU')) {
                const propKey = getProposalEventKey(data);
                const alreadyNotified =
                  notifiedProposalDocIds.has(propKey) ||
                  activeNotifications.some(
                    (n) => (n.metadata?.eventKey === propKey || (n.type === 'proposal' && n.documentId === data.id)) && !n.hidden
                  );
                if (!alreadyNotified) {
                  const meta = getProposalNotificationMeta(data, currentUsersList);
                  processNotificationEvent(
                    {
                      type: 'proposal',
                      sop: data,
                      eventKey: propKey,
                      title: meta.title,
                      message: meta.message,
                      actionLabel: 'Tinjau & Sahkan',
                      onAction: () => onSelectDocument?.(data)
                    },
                    onToast
                  );
                }
              }
            }
          });
          isFirstSnapshot = false;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          const sop = change.doc.data() as SopDocument;
          if (!sop || !sop.id) return;

          const prevStatus = docStatusMap.get(sop.id);
          const prevActivationReq = docActivationReqMap.get(sop.id);
          docStatusMap.set(sop.id, sop.status || '');
          if (sop.activationRequestedAt) {
            docActivationReqMap.set(sop.id, sop.activationRequestedAt);
          }

          const isAdmin = userSession.role === 'admin';
          const inUserHierarchy = userCanAccessSop(sop, userSession);
          const isPengusul = isUserPengusulSop(sop, userSession);

          // EVENT 1 (HANYA USER PENGUSUL): Notif muncul kalau SPO disetujui & diaktifkan Admin
          // Sesuai rules: Notif pengaktifan HANYA masuk ke user pengusul, BUKAN ke semua user
          if (!isAdmin && isPengusul && sop.status === 'AKTIF') {
            const isJustActivated =
              (prevStatus && prevStatus !== 'AKTIF') ||
              (change.type === 'modified' && prevStatus === 'DRAFT') ||
              (sop.activatedAt && (!prevStatus || prevStatus === 'DRAFT')) ||
              (change.type === 'modified' && sop.status === 'AKTIF');

            const actKey = getActivationEventKey(sop);
            if (isJustActivated) {
              const meta = getActivationNotificationMeta(sop);
              processNotificationEvent({
                type: 'activation',
                sop,
                eventKey: actKey,
                title: meta.title,
                message: meta.message,
                actionLabel: 'Buka Dokumen',
                onAction: () => onSelectDocument?.(sop)
              }, onToast);
            }
          }

          // EVENT 2 (ADMIN): Muncul kalau pengusul mengusulkan aktivasi SPO (status DRAFT baru atau ada usulan baru)
          // Sesuai rules: Pengusul -> 🔔 Admin
          const canReceiveProposalNotif = isAdmin || (hasVerificatorBadge(userSession) && userCanAccessSop(sop, userSession));
          if (canReceiveProposalNotif && sop.status === 'DRAFT') {
            const isNewDraft = change.type === 'added' && !initialKnownDocIds.has(sop.id);
            const isActivationRequested =
              Boolean(sop.activationRequestedAt) &&
              sop.activationRequestedAt !== prevActivationReq;
            const hasProposalMeta = Boolean(sop.activationRequestedAt || sop.activationRequestedBy || sop.isLegacySop || sop.isReviewDocument || sop.jenis_spo === 'BARU');

            const propKey = getProposalEventKey(sop);
            const alreadyNotified =
              notifiedProposalDocIds.has(propKey) ||
              activeNotifications.some(
                (n) => (n.metadata?.eventKey === propKey || (n.type === 'proposal' && n.documentId === sop.id)) && !n.hidden
              );

            if ((isNewDraft || isActivationRequested || !alreadyNotified) && hasProposalMeta) {
              const meta = getProposalNotificationMeta(sop, currentUsersList);
              processNotificationEvent({
                type: 'proposal',
                sop,
                eventKey: propKey,
                title: meta.title,
                message: meta.message,
                actionLabel: 'Tinjau & Sahkan',
                onAction: () => onSelectDocument?.(sop)
              }, onToast);
            }
          }

          // EVENT 3: NEW DOCUMENT ASSIGNMENT (Untuk divisi terkait saat dokumen aktif baru terbit)
          if (change.type === 'added' && !initialKnownDocIds.has(sop.id)) {
            initialKnownDocIds.add(sop.id);
            const assignmentKey = getAssignmentEventKey(sop);
            if (inUserHierarchy && sop.status === 'AKTIF') {
              const divLabel = sop.divisionName || sop.divisionCode || 'Divisi Anda';
              const notifMsg = `SPO "${sop.title}" (${sop.sopNumber || 'Baru'}) telah disetujui & disahkan untuk ${divLabel}.`;
              processNotificationEvent({ type: 'assignment', sop, eventKey: assignmentKey, title: 'Dokumen Baru Disetujui', message: notifMsg, actionLabel: 'Buka Dokumen', onAction: () => onSelectDocument?.(sop) }, onToast);
            }
          }

          // EVENT 4: PERIODIC REVIEW ALERT
          if ((change.type === 'added' || change.type === 'modified') && inUserHierarchy && sop.status === 'AKTIF') {
            const reviewStatus = evaluatePeriodicReview(sop);
            if (reviewStatus.isDue) {
              const reviewEventKey = getReviewEventKey(sop, reviewStatus.dueDate);
              const notifMsg = `SPO "${sop.title}" (${sop.sopNumber}): ${reviewStatus.reason}`;
              processNotificationEvent({
                type: 'review', sop, eventKey: reviewEventKey,
                title: 'Perlu Riviu Berkala', message: notifMsg,
                actionLabel: 'Tinjau Sekarang', dueDate: reviewStatus.dueDate,
                isOverdue: reviewStatus.isOverdue, onAction: () => onSelectDocument?.(sop)
              }, onToast);
            }
          }
        });
      },
      (error) => {
        if (error?.code !== 'permission-denied') {
          console.info('Firestore real-time notification listener note:', error?.message || error);
        }
      }
    );
    }
  } catch (err) {
    console.warn('Could not attach Firestore realtime listener:', err);
  }

  // 2. Local window & cross-tab event listener for immediate same-client / multi-tab responsiveness
  const handleLocalEvent = (e: Event) => {
    const customEvent = e as CustomEvent<{
      type: 'assignment' | 'review' | 'activation' | 'proposal';
      document: SopDocument;
      reason?: string;
    }>;
    const detail = customEvent.detail;
    if (!detail?.document) return;

    const { type, document: sop, reason } = detail;
    const isAdmin = userSession.role === 'admin';
    const inUserHierarchy = userCanAccessSop(sop, userSession);
    const isPengusul = isUserPengusulSop(sop, userSession);

    if (type === 'activation') {
      // NOTE: Notifikasi pengaktifan HANYA untuk user pengusul, bukan semua user
      if (isAdmin || !isPengusul) return;
      const eventKey = getActivationEventKey(sop);
      const meta = getActivationNotificationMeta(sop);
      const message = reason || meta.message;
      processNotificationEvent({
        type,
        sop,
        eventKey,
        title: meta.title,
        message,
        actionLabel: 'Buka Dokumen',
        onAction: () => onSelectDocument?.(sop)
      }, onToast);
      return;
    }

    if (type === 'proposal') {
      if (!isAdmin) return;
      const eventKey = getProposalEventKey(sop);
      const meta = getProposalNotificationMeta(sop, currentUsersList);
      const message = reason || meta.message;
      processNotificationEvent({
        type,
        sop,
        eventKey,
        title: meta.title,
        message,
        actionLabel: 'Tinjau & Sahkan',
        onAction: () => onSelectDocument?.(sop)
      }, onToast);
      return;
    }

    if (type === 'assignment') {
      if (!inUserHierarchy) return;
      const eventKey = getAssignmentEventKey(sop);
      const divLabel = sop.divisionName || sop.divisionCode || 'Divisi Anda';
      const message = reason || `SPO "${sop.title}" (${sop.sopNumber || 'Baru'}) telah disetujui & disahkan untuk ${divLabel}.`;
      processNotificationEvent({ type, sop, eventKey, title: 'Dokumen Baru Disetujui', message, actionLabel: 'Buka Dokumen', onAction: () => onSelectDocument?.(sop) }, onToast);
      return;
    }

    if (type === 'review') {
      if (!inUserHierarchy) return;
      const status = evaluatePeriodicReview(sop);
      if (!status.isDue) return;
      const eventKey = getReviewEventKey(sop, status.dueDate);
      const message = reason || `SPO "${sop.title}" (${sop.sopNumber}): ${status.reason || 'Memerlukan peninjauan berkala.'}`;
      processNotificationEvent({ type, sop, eventKey, title: 'Perlu Riviu Berkala', message, actionLabel: 'Tinjau Sekarang', dueDate: status.dueDate, isOverdue: status.isOverdue, onAction: () => onSelectDocument?.(sop) }, onToast);
    }
  };

  const handleBroadcastMessage = (event: MessageEvent) => {
    if (event?.data?.type && event?.data?.document) {
      handleLocalEvent(new CustomEvent('soegiri_document_event', { detail: event.data }));
    }
  };

  window.addEventListener('soegiri_document_event', handleLocalEvent);
  documentBroadcastChannel?.addEventListener('message', handleBroadcastMessage);

  return () => {
    if (unsubscribeFirestore) unsubscribeFirestore();
    window.removeEventListener('soegiri_document_event', handleLocalEvent);
    documentBroadcastChannel?.removeEventListener('message', handleBroadcastMessage);
  };
}

/**
 * Dispatches an event when a document is assigned, updated, activated, or proposed locally.
 * Broadcasts across same-window and cross-tab BroadcastChannel.
 */
export function dispatchDocumentEvent(
  type: 'assignment' | 'review' | 'activation' | 'proposal',
  document: SopDocument,
  reason?: string
): void {
  if (typeof window === 'undefined') return;
  const detail = { type, document, reason };

  if (type === 'proposal') {
    queuePendingAdminProposal(document, reason);
  } else if (type === 'activation') {
    removeQueuedAdminProposal(document.id);
  }

  window.dispatchEvent(
    new CustomEvent('soegiri_document_event', { detail })
  );
  try {
    documentBroadcastChannel?.postMessage(detail);
  } catch {}
}

/**
 * Evaluates all existing documents in memory on login/session mount and alerts Admin if any
 * document is a pending proposal (DRAFT) waiting for Admin approval/activation.
 */
export function scanDocumentsForProposals(
  sops: SopDocument[],
  userSession: UserSession | null,
  users: UserAccount[] | undefined,
  onToast: RealtimeWatcherOptions['onToast'],
  onSelectDocument?: (doc: SopDocument) => void
): void {
  if (!userSession || userSession.role !== 'admin' || !Array.isArray(sops) || sops.length === 0) return;
  setNotificationUserSession(userSession);
  if (users) setNotificationUsers(users);

  // Ingest any queued proposals from previous session / cross-session actions
  ingestQueuedAdminProposals();

  const pendingProposals: SopDocument[] = [];

  for (const sop of sops) {
    if (!sop || sop.status !== 'DRAFT') continue;
    if ((sop as any).isNumberReservation) continue;

    const propKey = getProposalEventKey(sop);
    const alreadyNotified =
      notifiedProposalDocIds.has(propKey) ||
      activeNotifications.some(
        (n) => (n.metadata?.eventKey === propKey || (n.type === 'proposal' && n.documentId === sop.id)) && !n.hidden
      );

    if (!alreadyNotified) {
      pendingProposals.push(sop);
    }
  }

  if (pendingProposals.length === 0) return;

  pendingProposals.forEach((sop) => {
    const propKey = getProposalEventKey(sop);
    notifiedProposalDocIds.add(propKey);
    const meta = getProposalNotificationMeta(sop, users || currentUsersList);
    addNotification({
      type: 'proposal',
      title: meta.title,
      message: meta.message,
      documentId: sop.id,
      documentNumber: sop.sopNumber,
      documentType: 'SPO',
      divisionCode: sop.divisionCode,
      divisionName: sop.divisionName,
      metadata: { eventKey: propKey },
      actionLabel: 'Tinjau & Sahkan',
      onAction: () => onSelectDocument?.(sop)
    });
  });

  const topProposal = pendingProposals[0];
  const toastKey = `session-proposal-${userSession.authUid || userSession.username}-${topProposal.id}-${topProposal.activationRequestedAt || 'draft'}`;
  if (!sessionStorage.getItem(toastKey)) {
    sessionStorage.setItem(toastKey, 'true');
    playChime('proposal');
    const meta = getProposalNotificationMeta(topProposal, users || currentUsersList);
    onToast(
      'proposal',
      meta.title,
      meta.message,
      {
        document: topProposal,
        divisionCode: topProposal.divisionCode,
        actionLabel: 'Tinjau & Sahkan',
        onAction: () => onSelectDocument?.(topProposal)
      }
    );
  }
}

/**
 * Evaluates all documents on session mount to ensure any activated documents
 * proposed by this user (or in user's hierarchy) have generated notifications.
 */
export function scanDocumentsForActivations(
  sops: SopDocument[],
  userSession: UserSession | null,
  onToast: RealtimeWatcherOptions['onToast'],
  onSelectDocument?: (doc: SopDocument) => void
): void {
  if (!userSession || !Array.isArray(sops) || sops.length === 0) return;
  if (userSession.role === 'admin') return;

  setNotificationUserSession(userSession);

  // Prune any legacy or invalid activation notifications for documents this user did not propose
  if (sops.length > 0 && activeNotifications.some((n) => n.type === 'activation')) {
    const sopsMap = new Map<string, SopDocument>();
    sops.forEach((s) => {
      if (s?.id) sopsMap.set(s.id, s);
    });

    const cleaned = activeNotifications.filter((n) => {
      if (n.type !== 'activation' || !n.documentId) return true;
      const targetSop = sopsMap.get(n.documentId);
      if (!targetSop) return true;
      return isUserPengusulSop(targetSop, userSession);
    });

    if (cleaned.length !== activeNotifications.length) {
      activeNotifications = cleaned;
      persistNotifications(activeNotifications);
      notifySubscribers();
    }
  }

  const newlyActivatedDocs: SopDocument[] = [];

  for (const sop of sops) {
    if (!sop || sop.status !== 'AKTIF') continue;
    // NOTE: Notifikasi pengaktifan HANYA masuk ke user pengusul, bukan ke semua user
    const isPengusul = isUserPengusulSop(sop, userSession);
    if (!isPengusul) continue;
    if (!sop.activatedAt && !sop.activationRequestedAt) continue;

    const actKey = getActivationEventKey(sop);
    const alreadyNotified =
      notifiedActivationDocIds.has(actKey) ||
      activeNotifications.some(
        (n) => n.metadata?.eventKey === actKey || (n.type === 'activation' && n.documentId === sop.id)
      );

    if (!alreadyNotified) {
      newlyActivatedDocs.push(sop);
    }
  }

  if (newlyActivatedDocs.length === 0) return;

  newlyActivatedDocs.forEach((sop) => {
    const actKey = getActivationEventKey(sop);
    notifiedActivationDocIds.add(actKey);
    const meta = getActivationNotificationMeta(sop);
    addNotification({
      type: 'activation',
      title: meta.title,
      message: meta.message,
      documentId: sop.id,
      documentNumber: sop.sopNumber,
      documentType: 'SPO',
      divisionCode: sop.divisionCode,
      divisionName: sop.divisionName,
      metadata: { eventKey: actKey },
      actionLabel: 'Buka Dokumen',
      onAction: () => onSelectDocument?.(sop)
    });
  });

  const topActivated = newlyActivatedDocs[0];
  const toastKey = `session-summary-activation-${userSession.authUid || userSession.username}-${topActivated.id}-${topActivated.activatedAt || 'active'}`;
  if (!sessionStorage.getItem(toastKey)) {
    sessionStorage.setItem(toastKey, 'true');
    playChime('activation');
    const meta = getActivationNotificationMeta(topActivated);
    onToast(
      'activation',
      meta.title,
      meta.message,
      {
        document: topActivated,
        divisionCode: topActivated.divisionCode,
        actionLabel: 'Buka Dokumen',
        onAction: () => onSelectDocument?.(topActivated)
      }
    );
  }
}

/**
 * Evaluates all existing documents in memory on login/session mount and alerts if any
 * document assigned to user's division requires periodic review.
 */
export function scanDocumentsForPeriodicReviews(
  sops: SopDocument[],
  userSession: UserSession | null,
  onToast: RealtimeWatcherOptions['onToast'],
  onSelectDocument?: (doc: SopDocument) => void
): void {
  if (!userSession || !Array.isArray(sops) || sops.length === 0) return;
  setNotificationUserSession(userSession);

  const dueDocs: Array<{ sop: SopDocument; status: ReviewStatus }> = [];

  for (const sop of sops) {
    if (!sop || sop.status === 'DIARSIPKAN') continue;
    if (!userCanAccessSop(sop, userSession)) continue;

    const status = evaluatePeriodicReview(sop);
    if (status.isDue) {
      dueDocs.push({ sop, status });
    }
  }

  if (dueDocs.length === 0) return;

  // Add items to Notification Center so they are readily browsable
  dueDocs.forEach(({ sop, status }) => {
    const key = getReviewEventKey(sop, status.dueDate);
    if (!notifiedReviewDocIds.has(key)) {
      notifiedReviewDocIds.add(key);
      addNotification({
        type: 'review',
        title: 'Perlu Riviu Berkala',
        message: `SPO "${sop.title}" (${sop.sopNumber}): ${status.reason}`,
        documentId: sop.id,
        documentNumber: sop.sopNumber,
        documentType: 'SPO',
        divisionCode: sop.divisionCode,
        dueDate: status.dueDate,
        isOverdue: status.isOverdue,
        metadata: { eventKey: getReviewEventKey(sop, status.dueDate) },
        actionLabel: 'Tinjau Sekarang',
        onAction: () => onSelectDocument?.(sop)
      });
    }
  });

  // Display summary or top urgent toast on session start
  const overdueCount = dueDocs.filter((d) => d.status.isOverdue).length;
  const topDue = dueDocs[0];

  const toastKey = `session-summary-review-${userSession.authUid || userSession.username}-${topDue.sop.id}`;
  if (!sessionStorage.getItem(toastKey)) {
    sessionStorage.setItem(toastKey, 'true');
    playChime('review');

    if (dueDocs.length === 1) {
      onToast(
        'review',
        topDue.status.isOverdue ? 'Dokumen Melewati Siklus Riviu' : 'Dokumen Perlu Riviu Berkala',
        `SPO "${topDue.sop.title}" (${topDue.sop.sopNumber}): ${topDue.status.reason}`,
        {
          document: topDue.sop,
          divisionCode: topDue.sop.divisionCode,
          dueDate: topDue.status.dueDate,
          actionLabel: 'Tinjau Sekarang',
          onAction: () => onSelectDocument?.(topDue.sop)
        }
      );
    } else {
      onToast(
        'review',
        `${dueDocs.length} Dokumen Perlu Riviu Berkala`,
        overdueCount > 0
          ? `${overdueCount} SPO telah melewati batas waktu dan ${dueDocs.length - overdueCount} SPO mendekati jatuh tempo di unit Anda.`
          : `${dueDocs.length} SPO di unit Anda mendekati batas waktu siklus peninjauan berkala.`,
        {
          document: topDue.sop,
          divisionCode: topDue.sop.divisionCode,
          dueDate: topDue.status.dueDate,
          actionLabel: 'Tinjau Dokumen',
          onAction: () => onSelectDocument?.(topDue.sop)
        }
      );
    }
  }
}
