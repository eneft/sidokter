const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('src/lib/notificationService.ts', 'utf8');
const modal = fs.readFileSync('src/components/NotificationModal.tsx', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const main = fs.readFileSync('functions/main.js', 'utf8');
const workflow = fs.readFileSync('functions/mailboxWorkflow.js', 'utf8');
const indexSource = fs.readFileSync('functions/index.js', 'utf8');
const mainSource = fs.readFileSync('functions/main.js', 'utf8');

test('notification content is backend-only and client state mutation is constrained', () => {
  assert.match(rules, /allow create: if false/);
  assert.match(rules, /hasOnly\(\[\s*'read', 'readAt', 'hidden', 'deletedAt'/s);
  assert.doesNotMatch(service, /setDoc\(fallbackRef/);
  assert.match(main, /createNotificationBlocked/);
});

test('legacy local proposal queue and login scans no longer produce official messages', () => {
  assert.doesNotMatch(service, /ADMIN_PROPOSALS_QUEUE_KEY/);
  assert.doesNotMatch(service, /queuePendingAdminProposal/);
  assert.match(service, /server Firestore workflow trigger is[\s\S]*sole producer/i);
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


test('workflow mail is generated inside existing trusted SPO backend actions without Eventarc', () => {
  assert.doesNotMatch(workflow, /onDocumentWritten/);
  assert.doesNotMatch(mainSource, /sopMailboxWorkflow/);
  assert.match(indexSource, /processSopWrite\(previousSop, resultingSop, sopId\)/);
  assert.match(indexSource, /processSopWrite\(activationPreviousSop, transitionResult\.successor, sopId\)/);
  assert.match(indexSource, /processSopWrite\(previousReviewSop, resultingSop, sopId\)/);
});
