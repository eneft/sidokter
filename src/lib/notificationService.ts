/**
 * NOTIFICATION SERVICE - SIDOKTER SOEGIRI
 * Sistem notifikasi real-time berbasis toast & notification center
 * untuk penugasan dokumen ke divisi, pengingat riviu berkala,
 * aktivasi SPO oleh Admin bagi User, dan usulan aktivasi bagi Admin.
 */
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { SopDocument, UserSession } from '../types';
import { userCanAccessSop } from './soegiriStructure';

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

const NOTIF_STORAGE_KEY = 'soegiri_active_notifications';

function loadPersistedNotifications(): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 50);
    }
  } catch {}
  return [];
}

function persistNotifications(notifications: AppNotification[]): void {
  if (typeof window === 'undefined') return;
  try {
    const serializable = notifications.slice(0, 50).map(({ onAction, ...rest }) => rest);
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(serializable));
  } catch {}
}

let activeNotifications: AppNotification[] = loadPersistedNotifications();
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
  persistNotifications(activeNotifications);
  notifySubscribers();
  return item;
}

export function markNotificationAsRead(id: string): void {
  activeNotifications = activeNotifications.map((n) =>
    n.id === id ? { ...n, read: true } : n
  );
  persistNotifications(activeNotifications);
  notifySubscribers();
}

export function markAllNotificationsAsRead(): void {
  activeNotifications = activeNotifications.map((n) => ({ ...n, read: true }));
  persistNotifications(activeNotifications);
  notifySubscribers();
}

export function clearNotifications(): void {
  activeNotifications = [];
  persistNotifications(activeNotifications);
  notifySubscribers();
}

/* =========================================================================
   REAL-TIME FIRESTORE & LOCAL LISTENER
========================================================================= */

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

  let isFirstSnapshot = true;
  const initialKnownDocIds = new Set<string>();
  const docStatusMap = new Map<string, string>();
  const docActivationReqMap = new Map<string, string>();

  // 1. Listen to Firestore 'sops' collection in real-time
  let unsubscribeFirestore: (() => void) | null = null;
  try {
    const sopsCollection = collection(db, 'sops');
    unsubscribeFirestore = onSnapshot(
      sopsCollection,
      (snapshot) => {
        if (isFirstSnapshot) {
          // Record existing documents and baseline statuses without spamming
          snapshot.docs.forEach((d) => {
            initialKnownDocIds.add(d.id);
            const data = d.data() as SopDocument;
            if (data?.id) {
              docStatusMap.set(data.id, data.status || '');
              if (data.activationRequestedAt) {
                docActivationReqMap.set(data.id, data.activationRequestedAt);
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
          const inUserHierarchy = userCanAccessSop(sop, userSession) || isAssignedToUserDivision(sop.divisionCode, userSession);

          // EVENT 1 (USER): Notif muncul kalau SPO dari hirarki diaktifkan Admin
          if (!isAdmin && inUserHierarchy && sop.status === 'AKTIF') {
            const isJustActivated =
              (prevStatus && prevStatus !== 'AKTIF') ||
              (change.type === 'modified' && prevStatus === 'DRAFT') ||
              (sop.activatedAt && (!prevStatus || prevStatus === 'DRAFT'));

            const actKey = `${sop.id}-act-${sop.activatedAt || sop.updatedAt || 'active'}`;
            if (isJustActivated && !notifiedActivationDocIds.has(actKey)) {
              notifiedActivationDocIds.add(actKey);
              playChime('activation');

              const unitLabel = sop.divisionName || sop.divisionCode || 'unit Anda';
              const notifMsg = `SPO "${sop.title}" (${sop.sopNumber || 'Resmi'}) telah disahkan & diaktifkan oleh Admin untuk ${unitLabel}.`;

              addNotification({
                type: 'activation',
                title: 'SPO Telah Diaktifkan',
                message: notifMsg,
                documentId: sop.id,
                documentNumber: sop.sopNumber,
                documentType: 'SPO',
                divisionCode: sop.divisionCode,
                divisionName: sop.divisionName,
                actionLabel: 'Buka Dokumen',
                onAction: () => onSelectDocument?.(sop)
              });

              onToast('activation', 'SPO Telah Diaktifkan', notifMsg, {
                document: sop,
                divisionCode: sop.divisionCode,
                actionLabel: 'Buka Dokumen',
                onAction: () => onSelectDocument?.(sop)
              });
            }
          }

          // EVENT 2 (ADMIN): Muncul kalau user mengusulkan aktivasi SPO (status DRAFT baru atau ada usulan baru)
          if (isAdmin && sop.status === 'DRAFT') {
            const isNewDraft = change.type === 'added' && !initialKnownDocIds.has(sop.id);
            const isActivationRequested =
              sop.activationRequestedAt &&
              sop.activationRequestedAt !== prevActivationReq;

            const propKey = `${sop.id}-prop-${sop.activationRequestedAt || sop.createdAt || sop.updatedAt || 'draft'}`;
            if ((isNewDraft || isActivationRequested) && !notifiedProposalDocIds.has(propKey)) {
              notifiedProposalDocIds.add(propKey);
              playChime('proposal');

              const creatorLabel = sop.activationRequestedBy || sop.creatorName || 'Pengguna';
              const unitLabel = sop.divisionName || sop.divisionCode || 'Unit';
              const notifMsg = `Usulan aktivasi dari ${creatorLabel} (${unitLabel}): SPO "${sop.title}" (${sop.sopNumber || 'Draft'}) menunggu pengesahan.`;

              addNotification({
                type: 'proposal',
                title: 'Usulan Aktivasi SPO',
                message: notifMsg,
                documentId: sop.id,
                documentNumber: sop.sopNumber,
                documentType: 'SPO',
                divisionCode: sop.divisionCode,
                divisionName: sop.divisionName,
                actionLabel: 'Tinjau & Sahkan',
                onAction: () => onSelectDocument?.(sop)
              });

              onToast('proposal', 'Usulan Aktivasi SPO', notifMsg, {
                document: sop,
                divisionCode: sop.divisionCode,
                actionLabel: 'Tinjau & Sahkan',
                onAction: () => onSelectDocument?.(sop)
              });
            }
          }

          // EVENT 3: NEW DOCUMENT ASSIGNMENT (Untuk divisi terkait saat dokumen aktif baru terbit)
          if (change.type === 'added' && !initialKnownDocIds.has(sop.id)) {
            initialKnownDocIds.add(sop.id);
            if (inUserHierarchy && sop.status === 'AKTIF' && !notifiedAssignmentDocIds.has(sop.id)) {
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

          // EVENT 4: PERIODIC REVIEW ALERT
          if ((change.type === 'added' || change.type === 'modified') && inUserHierarchy && sop.status === 'AKTIF') {
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
                isOverdue: reviewStatus.isOverdue,
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
      type: 'assignment' | 'review' | 'activation' | 'proposal';
      document: SopDocument;
      reason?: string;
    }>;
    if (!customEvent.detail || !customEvent.detail.document) return;

    const { type, document: sop, reason } = customEvent.detail;
    const isAdmin = userSession.role === 'admin';
    const inUserHierarchy = userCanAccessSop(sop, userSession) || isAssignedToUserDivision(sop.divisionCode, userSession);

    if (type === 'activation') {
      // Notification for regular user when admin activates an SPO in their hierarchy
      if (isAdmin || !inUserHierarchy) return;
      const actKey = `${sop.id}-act-${sop.activatedAt || sop.updatedAt || 'active'}`;
      if (notifiedActivationDocIds.has(actKey)) return;
      notifiedActivationDocIds.add(actKey);
      playChime('activation');

      const unitLabel = sop.divisionName || sop.divisionCode || 'unit Anda';
      const notifMsg = reason || `SPO "${sop.title}" (${sop.sopNumber || 'Resmi'}) telah disahkan & diaktifkan oleh Admin untuk ${unitLabel}.`;

      addNotification({
        type: 'activation',
        title: 'SPO Telah Diaktifkan',
        message: notifMsg,
        documentId: sop.id,
        documentNumber: sop.sopNumber,
        documentType: 'SPO',
        divisionCode: sop.divisionCode,
        divisionName: sop.divisionName,
        actionLabel: 'Buka Dokumen',
        onAction: () => onSelectDocument?.(sop)
      });

      onToast('activation', 'SPO Telah Diaktifkan', notifMsg, {
        document: sop,
        divisionCode: sop.divisionCode,
        actionLabel: 'Buka Dokumen',
        onAction: () => onSelectDocument?.(sop)
      });
    } else if (type === 'proposal') {
      // Notification for Admin when user proposes activation
      if (!isAdmin) return;
      const propKey = `${sop.id}-prop-${sop.activationRequestedAt || sop.createdAt || sop.updatedAt || 'draft'}`;
      if (notifiedProposalDocIds.has(propKey)) return;
      notifiedProposalDocIds.add(propKey);
      playChime('proposal');

      const creatorLabel = sop.activationRequestedBy || sop.creatorName || 'Pengguna';
      const unitLabel = sop.divisionName || sop.divisionCode || 'Unit';
      const notifMsg = reason || `Usulan aktivasi dari ${creatorLabel} (${unitLabel}): SPO "${sop.title}" (${sop.sopNumber || 'Draft'}) menunggu pengesahan.`;

      addNotification({
        type: 'proposal',
        title: 'Usulan Aktivasi SPO',
        message: notifMsg,
        documentId: sop.id,
        documentNumber: sop.sopNumber,
        documentType: 'SPO',
        divisionCode: sop.divisionCode,
        divisionName: sop.divisionName,
        actionLabel: 'Tinjau & Sahkan',
        onAction: () => onSelectDocument?.(sop)
      });

      onToast('proposal', 'Usulan Aktivasi SPO', notifMsg, {
        document: sop,
        divisionCode: sop.divisionCode,
        actionLabel: 'Tinjau & Sahkan',
        onAction: () => onSelectDocument?.(sop)
      });
    } else if (type === 'assignment') {
      if (!inUserHierarchy) return;
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
      if (!inUserHierarchy) return;
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
        isOverdue: reviewStatus.isOverdue,
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
 * Dispatches an event when a document is assigned, updated, activated, or proposed locally.
 */
export function dispatchDocumentEvent(
  type: 'assignment' | 'review' | 'activation' | 'proposal',
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
