const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('src/lib/notificationService.ts', 'utf8');
const ui = fs.readFileSync('src/components/NotificationModal.tsx', 'utf8');

test('mailbox exposes read, unread, and per-user tombstone operations', () => {
  assert.match(service, /markNotificationAsRead/);
  assert.match(service, /markNotificationAsUnread/);
  assert.match(service, /deleteNotification/);
  assert.match(service, /hidden:\s*true/);
});

test('suggested words only insert into editable draft', () => {
  assert.match(ui, /setReplyBody/);
  assert.match(ui, /onClick=\{\(\) => insertSuggestion/);
  assert.doesNotMatch(ui, /onClick=\{\(\) => sendReply\(suggestion\)/);
});

test('new mailbox starts empty by excluding legacy notification-center records', () => {
  assert.match(service, /INTERNAL_MAIL_VERSION\s*=\s*1/);
  assert.match(service, /hidden !== true && isInternalMailItem\(n\)/);
  assert.match(service, /internalMailVersion: INTERNAL_MAIL_VERSION/);
});
