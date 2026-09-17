const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('src/lib/notificationService.ts', 'utf8');
const ui = fs.readFileSync('src/components/NotificationModal.tsx', 'utf8');
const header = fs.readFileSync('src/components/Header.tsx', 'utf8');

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

test('desktop mail control is placed in the top-right account header', () => {
  assert.match(header, /fixed left-72 right-0 top-0/);
  assert.match(header, /justify-end/);
  assert.match(header, /DesktopAccountHeader/);
});

test('opening unread mail keeps it visible and exposes the SPO review path', () => {
  assert.match(ui, /!item\.read \|\| item\.id === selectedId/);
  assert.match(ui, /Buka & Riviu SPO/);
  assert.match(ui, /Pesan tetap tersimpan di tab Semua setelah dibaca/);
});
