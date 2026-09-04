/**
 * NOTIFICATION SERVICE - SIDOKTER SOEGIRI
 * Sistem notifikasi real-time berbasis toast & notification center
 * untuk penugasan dokumen ke divisi dan pengingat riviu berkala dokumen.
 */
import { collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { SopDocument, UserSession } from '../types';

export interface AppNotification {
  id: string;
  type: 'assignment' | 'review' | 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  documentId?: string;
  documentNumber?: string;
  documentType?: 'SPO' | 'SK' | 'MOU';
  divisionCode?: string;
  divisionName?: string;
  dueDate?: string;
  isOverdue?: boolean;
  timestamp: number;
  read: boolean;
  actionLabel?: string;
  onAction?: () => void;
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
let activeNotifications: AppNotification[] = [];
const notificationListeners = new Set<(notifications: AppNotification[]) => void>();

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
  return localStorage.getItem('soegiri_notification_muted') === 'true';
}

export function setAudioMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('soegiri_notification_muted', muted ? 'true' : 'false');
}

export function playChime(type: 'assignment' | 'review' | 'default' = 'default'): void {
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

    if (type === 'assignment') {
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

export function addNotification(
  notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>
): AppNotification {
  const item: AppNotification = {
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    read: false
  };

  activeNotifications = [item, ...activeNotifications.slice(0, 49)];
  notifySubscribers();
  return item;
}

export function markNotificationAsRead(id: string): void {
  activeNotifications = activeNotifications.map((n) =>
    n.id === id ? { ...n, read: true } : n
  );
  notifySubscribers();
}

export function markAllNotificationsAsRead(): void {
  activeNotifications = activeNotifications.map((n) => ({ ...n, read: true }));
  notifySubscribers();
}

export function clearNotifications(): void {
  activeNotifications = [];
  notifySubscribers();
}

/* =========================================================================
   REAL-TIME FIRESTORE & LOCAL LISTENER
========================================================================= */

export interface RealtimeWatcherOptions {
  userSession: UserSession | null;
  onToast: (
    type: 'assignment' | 'review' | 'success' | 'info' | 'warning' | 'error',
    title: string,
    message?: string,
    options?: {
      document?: SopDocument;
      divisionCode?: string;
      dueDate?: string;
      actionLabel?: string;
      onAction?: () => void;
    }
  ) => void;
  onSelectDocument?: (doc: SopDocument) => void;
}

/**
 * Initializes real-time listener for document assignments and periodic reviews.
 * Combines Firestore onSnapshot and local event listeners.
 */
export function setupDocumentRealtimeWatcher({
  userSession,
  onToast,
  onSelectDocument
}: RealtimeWatcherOptions): () => void {
  if (!userSession) return () => {};

  let isFirstSnapshot = true;
  const initialKnownDocIds = new Set<string>();

  // 1. Listen to Firestore 'sops' collection in real-time
  let unsubscribeFirestore: (() => void) | null = null;
  try {
    const sopsCollection = collection(db, 'sops');
    unsubscribeFirestore = onSnapshot(
      sopsCollection,
      (snapshot) => {
        if (isFirstSnapshot) {
          // Record existing documents without spamming
          snapshot.docs.forEach((d) => initialKnownDocIds.add(d.id));
          isFirstSnapshot = false;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          const sop = change.doc.data() as SopDocument;
          if (!sop || !sop.id) return;

          const assigned = isAssignedToUserDivision(sop.divisionCode, userSession);

          // NEW DOCUMENT ASSIGNMENT
          if (change.type === 'added' && !initialKnownDocIds.has(sop.id)) {
            initialKnownDocIds.add(sop.id);
            if (assigned && !notifiedAssignmentDocIds.has(sop.id)) {
              notifiedAssignmentDocIds.add(sop.id);
              playChime('assignment');

              const divLabel = sop.divisionName || sop.divisionCode || 'Divisi Anda';
              const notifMsg = `SPO "${sop.title}" (${sop.sopNumber || 'Baru'}) telah ditugaskan ke unit/bidang ${divLabel}.`;

              addNotification({
                type: 'assignment',
                title: 'Dokumen Baru Ditugaskan',
                message: notifMsg,
                documentId: sop.id,
                documentNumber: sop.sopNumber,
                documentType: 'SPO',
                divisionCode: sop.divisionCode,
                divisionName: sop.divisionName,
                actionLabel: 'Buka Dokumen',
                onAction: () => onSelectDocument?.(sop)
              });

              onToast('assignment', 'Dokumen Baru Ditugaskan', notifMsg, {
                document: sop,
                divisionCode: sop.divisionCode,
                actionLabel: 'Buka Dokumen',
                onAction: () => onSelectDocument?.(sop)
              });
            }
          }

          // PERIODIC REVIEW ALERT
          if ((change.type === 'added' || change.type === 'modified') && assigned) {
            const reviewStatus = evaluatePeriodicReview(sop);
            if (reviewStatus.isDue && !notifiedReviewDocIds.has(`${sop.id}-${reviewStatus.dueDate}`)) {
              notifiedReviewDocIds.add(`${sop.id}-${reviewStatus.dueDate}`);
              playChime('review');

              const notifMsg = `SPO "${sop.title}" (${sop.sopNumber}): ${reviewStatus.reason}`;

              addNotification({
                type: 'review',
                title: 'Perlu Riviu Berkala',
                message: notifMsg,
                documentId: sop.id,
                documentNumber: sop.sopNumber,
                documentType: 'SPO',
                divisionCode: sop.divisionCode,
                dueDate: reviewStatus.dueDate,
                isOverdue: reviewStatus.isOverdue,
                actionLabel: 'Tinjau Sekarang',
                onAction: () => onSelectDocument?.(sop)
              });

              onToast('review', 'Perlu Riviu Berkala', notifMsg, {
                document: sop,
                divisionCode: sop.divisionCode,
                dueDate: reviewStatus.dueDate,
                actionLabel: 'Tinjau Sekarang',
                onAction: () => onSelectDocument?.(sop)
              });
            }
          }
        });
      },
      (error) => {
        console.warn('Firestore real-time notification listener note:', error?.message || error);
      }
    );
  } catch (err) {
    console.warn('Could not attach Firestore realtime listener:', err);
  }

  // 2. Local window event listener for immediate same-client / multi-tab responsiveness
  const handleLocalEvent = (e: Event) => {
    const customEvent = e as CustomEvent<{
      type: 'assignment' | 'review';
      document: SopDocument;
      reason?: string;
    }>;
    if (!customEvent.detail || !customEvent.detail.document) return;

    const { type, document: sop, reason } = customEvent.detail;
    const assigned = isAssignedToUserDivision(sop.divisionCode, userSession);
    if (!assigned) return;

    if (type === 'assignment') {
      if (notifiedAssignmentDocIds.has(sop.id)) return;
      notifiedAssignmentDocIds.add(sop.id);
      playChime('assignment');

      const divLabel = sop.divisionName || sop.divisionCode || 'Divisi Anda';
      const notifMsg = reason || `SPO "${sop.title}" (${sop.sopNumber || 'Baru'}) telah ditugaskan ke unit/bidang ${divLabel}.`;

      addNotification({
        type: 'assignment',
        title: 'Dokumen Baru Ditugaskan',
        message: notifMsg,
        documentId: sop.id,
        documentNumber: sop.sopNumber,
        documentType: 'SPO',
        divisionCode: sop.divisionCode,
        actionLabel: 'Buka Dokumen',
        onAction: () => onSelectDocument?.(sop)
      });

      onToast('assignment', 'Dokumen Baru Ditugaskan', notifMsg, {
        document: sop,
        divisionCode: sop.divisionCode,
        actionLabel: 'Buka Dokumen',
        onAction: () => onSelectDocument?.(sop)
      });
    } else if (type === 'review') {
      const reviewStatus = evaluatePeriodicReview(sop);
      const key = `${sop.id}-${reviewStatus.dueDate || 'review'}`;
      if (notifiedReviewDocIds.has(key)) return;
      notifiedReviewDocIds.add(key);
      playChime('review');

      const notifMsg = reason || `SPO "${sop.title}" (${sop.sopNumber}): ${reviewStatus.reason || 'Memerlukan peninjauan berkala.'}`;

      addNotification({
        type: 'review',
        title: 'Perlu Riviu Berkala',
        message: notifMsg,
        documentId: sop.id,
        documentNumber: sop.sopNumber,
        documentType: 'SPO',
        divisionCode: sop.divisionCode,
        dueDate: reviewStatus.dueDate,
        isOverdue: reviewStatus.isOverdue,
        actionLabel: 'Tinjau Sekarang',
        onAction: () => onSelectDocument?.(sop)
      });

      onToast('review', 'Perlu Riviu Berkala', notifMsg, {
        document: sop,
        divisionCode: sop.divisionCode,
        dueDate: reviewStatus.dueDate,
        actionLabel: 'Tinjau Sekarang',
        onAction: () => onSelectDocument?.(sop)
      });
    }
  };

  window.addEventListener('soegiri_document_event', handleLocalEvent);

  return () => {
    if (unsubscribeFirestore) unsubscribeFirestore();
    window.removeEventListener('soegiri_document_event', handleLocalEvent);
  };
}

/**
 * Dispatches an event when a document is assigned or updated locally.
 */
export function dispatchDocumentEvent(
  type: 'assignment' | 'review',
  document: SopDocument,
  reason?: string
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('soegiri_document_event', {
      detail: { type, document, reason }
    })
  );
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

  const dueDocs: Array<{ sop: SopDocument; status: ReviewStatus }> = [];

  for (const sop of sops) {
    if (!sop || sop.status === 'DIARSIPKAN') continue;
    if (!isAssignedToUserDivision(sop.divisionCode, userSession)) continue;

    const status = evaluatePeriodicReview(sop);
    if (status.isDue) {
      dueDocs.push({ sop, status });
    }
  }

  if (dueDocs.length === 0) return;

  // Add items to Notification Center so they are readily browsable
  dueDocs.forEach(({ sop, status }) => {
    const key = `init-${sop.id}-${status.dueDate}`;
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
        actionLabel: 'Tinjau Sekarang',
        onAction: () => onSelectDocument?.(sop)
      });
    }
  });

  // Display summary or top urgent toast on session start
  const overdueCount = dueDocs.filter((d) => d.status.isOverdue).length;
  const topDue = dueDocs[0];

  const toastKey = `session-summary-review-${userSession.username}-${topDue.sop.id}`;
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
