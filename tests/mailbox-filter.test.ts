import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERNAL_MAIL_VERSION, isInternalMailItem, isVisibleMailboxItem } from '../src/lib/mailboxPolicy';

const workflow = (type: string, extra: Record<string, unknown> = {}) => ({
  id: `${type}-1`, type, title: 'Workflow SPO', message: 'Informasi workflow',
  documentId: 'spo-1', timestamp: 1_700_000_000_000, read: false, ...extra
});

test('workflow mail without human kind or internal mail version remains visible', () => {
  for (const type of ['activation', 'proposal', 'assignment', 'review']) {
    assert.equal(isVisibleMailboxItem(workflow(type)), true, type);
  }
});

test('human mail remains visible', () => {
  assert.equal(isVisibleMailboxItem(workflow('review', { metadata: { mailKind: 'human', senderUid: 'reviewer' } })), true);
});

test('new unread and read workflow mail both remain in unified mailbox dataset', () => {
  assert.equal(isVisibleMailboxItem(workflow('proposal', { read: false })), true);
  assert.equal(isVisibleMailboxItem(workflow('proposal', { read: true })), true);
});

test('per-user hidden tombstone is excluded but does not invalidate another visible copy', () => {
  const item = workflow('review');
  assert.equal(isVisibleMailboxItem({ ...item, hidden: true }), false);
  assert.equal(isVisibleMailboxItem({ ...item, hidden: false }), true);
});

test('only explicitly obsolete duplicates are filtered among valid legacy workflow records', () => {
  assert.equal(isInternalMailItem(workflow('activation')), true);
  assert.equal(isInternalMailItem(workflow('activation', { metadata: { obsoleteDuplicate: true } })), false);
});

test('versioned system mail is admitted without pretending to be human mail', () => {
  assert.equal(isVisibleMailboxItem({
    id: 'system-1', type: 'info', title: 'Sistem', message: 'Informasi', timestamp: 1_700_000_000_000,
    metadata: { internalMailVersion: INTERNAL_MAIL_VERSION, mailKind: 'system' }
  }), true);
});
