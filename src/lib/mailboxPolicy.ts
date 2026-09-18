export const INTERNAL_MAIL_VERSION = 1;

const WORKFLOW_TYPES = new Set(['activation', 'proposal', 'assignment', 'review']);
const VERSIONED_SYSTEM_TYPES = new Set(['success', 'info', 'warning', 'error']);

export interface MailboxCandidate {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  message?: unknown;
  documentId?: unknown;
  timestamp?: unknown;
  hidden?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Unified mailbox admission policy.
 *
 * Workflow records predate `internalMailVersion`, so version is capability
 * metadata—not an eligibility gate. Only explicitly obsolete duplicates and
 * malformed/non-mail records are rejected here. Per-user tombstones are
 * handled separately by `isVisibleMailboxItem`.
 */
export function isInternalMailItem(item: MailboxCandidate): boolean {
  if (!item || typeof item.id !== 'string' || !item.id.trim()) return false;
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
  return Number(item.metadata?.internalMailVersion || 0) === INTERNAL_MAIL_VERSION && VERSIONED_SYSTEM_TYPES.has(type);
}

export function isVisibleMailboxItem(item: MailboxCandidate): boolean {
  return item.hidden !== true && isInternalMailItem(item);
}
