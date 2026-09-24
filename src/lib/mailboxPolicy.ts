export const INTERNAL_MAIL_VERSION = 2;

const WORKFLOW_TYPES = new Set(['activation', 'proposal', 'assignment', 'review']);
const VERSIONED_SYSTEM_TYPES = new Set(['success', 'info', 'warning', 'error']);

export interface MailboxCandidate {
  id?: unknown;
  type?: unknown;
  eventType?: unknown;
  title?: unknown;
  message?: unknown;
  documentId?: unknown;
  timestamp?: unknown;
  hidden?: unknown;
  actionable?: unknown;
  resolvedAt?: unknown;
  metadata?: Record<string, unknown>;
}
/** Legacy automatic periodic/annual SPO review reminders are no longer mailbox items. */
export function isPeriodicReviewReminder(item: MailboxCandidate): boolean {
  const eventKey = String(item?.metadata?.eventKey || item?.id || '').trim().toLowerCase();
  const title = String(item?.title || '').trim().toLowerCase();
  return eventKey.startsWith('review:') || title === 'perlu riviu berkala';
}

/**
 * Unified mailbox admission policy.
 *
 * Legacy workflow records remain readable during migration. New workflow records
 * carry eventType/actionable/resolved metadata and are authored by the backend.
 */
export function isInternalMailItem(item: MailboxCandidate): boolean {
  if (!item || typeof item.id !== 'string' || !item.id.trim()) return false;
  if (isPeriodicReviewReminder(item)) return false;
  if (item.metadata?.obsoleteDuplicate === true) return false;
  if (!Number.isFinite(Number(item.timestamp)) || Number(item.timestamp) <= 0) return false;
  if (typeof item.title !== 'string' || typeof item.message !== 'string') return false;

  const type = String(item.type || '');
  const mailKind = String(item.metadata?.mailKind || '');
  if (mailKind === 'human') {
    return Boolean(item.documentId && item.metadata?.senderUid);
  }
  if (WORKFLOW_TYPES.has(type)) return Boolean(item.documentId);
  if (mailKind === 'system') return true;
  return Number(item.metadata?.internalMailVersion || 0) >= 1 && VERSIONED_SYSTEM_TYPES.has(type);
}

export function isVisibleMailboxItem(item: MailboxCandidate): boolean {
  return item.hidden !== true && isInternalMailItem(item);
}

export function isMailboxItemActionable(item: MailboxCandidate): boolean {
  return item.actionable === true && !item.resolvedAt && item.hidden !== true;
}
