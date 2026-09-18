/**
 * NOTIFICATION SERVICE - SIDOKTER SOEGIRI
 * Sistem Pesan real-time berbasis notification center
 * untuk penugasan dokumen ke divisi, pengingat riviu berkala,
 * aktivasi SPO oleh Admin bagi User, dan usulan aktivasi bagi Admin.
 */
import { collection, onSnapshot, query, where, doc, setDoc, writeBatch } from 'firebase/firestore';
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
  const raw =
    eventKey ||
    fallbackId ||
    `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
  const stable =
    session?.authUid ||
    session?.uid ||
    session?.userId ||
    '';

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

  // CRITICAL: Path is notifications/{UID}/items.
  // Only query when authenticated UID matches.
  // This completely eliminates unauthenticated queries that trigger
  // 'permission-denied' on READ.
  if (!uid || !auth.currentUser || auth.currentUser.uid !== uid) {
    return null;
  }

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
        .filter((n) => isVisibleMailboxItem(n))
        .slice(0, 50);
    }
  } catch {}

  return [];
}

function persistNotifications(notifications: AppNotification[]): void {
  if (typeof window === 'undefined') return;

  try {
    const serializable = notifications
      .slice(0, 50)
      .map(({ onAction, ...rest }) => rest);

    localStorage.setItem(
      getNotificationStorageKey(),
      JSON.stringify(serializable)
    );
  } catch {}
}

function clearNotificationDedupeSets(): void {
  notifiedReviewDocIds.clear();
  notifiedAssignmentDocIds.clear();
  notifiedActivationDocIds.clear();
  notifiedProposalDocIds.clear();
}

function seedDedupeSetsFromNotifications(
  notifications: AppNotification[]
): void {
  notifications.forEach((n) => {
    const key = String(
      n.metadata?.eventKey ||
      n.id ||
      ''
    ).trim();

    if (!key) return;

    if (n.type === 'review') {
      notifiedReviewDocIds.add(key);
    } else if (n.type === 'assignment') {
      notifiedAssignmentDocIds.add(key);
    } else if (n.type === 'activation') {
      notifiedActivationDocIds.add(key);
    } else if (n.type === 'proposal') {
      notifiedProposalDocIds.add(key);
    }
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

  unsubscribeNotificationCloud = onSnapshot(
    ref,
    (snapshot) => {
      const cloudItemsAll = snapshot.docs
        .map((d) => d.data() as AppNotification)
        .filter(
          (n) =>
            n &&
            typeof n.id === 'string' &&
            typeof n.type === 'string'
        );

      // Seed dedupe from ALL cloud records, including hidden tombstones.
      // This prevents a cleared event from being recreated by a second
      // producer after reload or across devices.
      seedDedupeSetsFromNotifications(cloudItemsAll);

      const cloudItems = cloudItemsAll
        .filter(isVisibleMailboxItem)
        .sort(
          (a, b) =>
            Number(b.timestamp || 0) -
            Number(a.timestamp || 0)
        )
        .slice(0, 50);

      const pending = activeNotifications.filter((n) =>
        pendingCloudWrites.has(
          n.metadata?.eventKey || n.id
        )
      );

      const byKey = new Map<string, AppNotification>();

      [...cloudItems, ...pending].forEach((n) => {
        const key = n.metadata?.eventKey || n.id;

        if (
          !byKey.has(key) ||
          Number(n.timestamp || 0) >
            Number(byKey.get(key)?.timestamp || 0)
        ) {
          byKey.set(key, n);
        }
      });

      activeNotifications = [...byKey.values()]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 50);

      cloudNotificationReady = true;

      persistNotifications(activeNotifications);
      notifySubscribers();
    },
    (error) => {
      cloudNotificationReady = false;

      console.warn(
        'Notification Firestore listener note:',
        error?.message || error
      );
    }
  );
}