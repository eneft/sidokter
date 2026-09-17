const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('src/lib/notificationService.ts', 'utf8');
const ui = fs.readFileSync('src/components/NotificationModal.tsx', 'utf8');
const header = fs.readFileSync('src/components/Header.tsx', 'utf8');
const userView = fs.readFileSync('src/components/UserView.tsx', 'utf8');
const functionsSource = fs.readFileSync('functions/index.js', 'utf8');

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

test('unified mailbox uses semantic visibility instead of rejecting unversioned workflow mail', () => {
  assert.match(service, /isVisibleMailboxItem/);
  assert.doesNotMatch(service, /internalMailVersion \|\| 0\) === INTERNAL_MAIL_VERSION/);
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

test('Riviu source selection keeps Live A4 body blank while retaining reference metadata', () => {
  assert.match(userView, /setExistingSopId\(chosenId\)/);
  assert.match(userView, /setOldSopNumber\(found\.sopNumber \|\| ''\)/);
  assert.match(userView, /setPreviousRevisionNumber\(currentRevision\)/);
  for (const setter of ['setPengertian', 'setTujuan', 'setKebijakan', 'setProsedur', 'setAlur', 'setUnitTerkait']) {
    assert.match(userView, new RegExp(`${setter}\\(''\\)`));
    assert.doesNotMatch(userView, new RegExp(`${setter}\\(found\\.`));
  }
});

test('workflow sound is emitted only after the same event is added to Pesan', () => {
  const gateStart = service.indexOf('function processNotificationEvent');
  const gateEnd = service.indexOf('export function addNotification', gateStart);
  const gate = service.slice(gateStart, gateEnd);
  assert.ok(gate.indexOf('const item = addNotification') >= 0);
  assert.ok(gate.indexOf('playChime(event.type)') > gate.indexOf('const item = addNotification'));
  assert.match(gate, /documentId: event\.sop\.id/);
});

test('recipient writes and listener use the same per-user notification path', () => {
  assert.match(service, /collection\(db, 'notifications', uid, 'items'\)/);
  assert.match(functionsSource, /collection\('notifications'\)\.doc\(route\.recipientUid\)\.collection\('items'\)/);
  assert.match(functionsSource, /collection\('notifications'\)\.doc\(notification\.uid\)\.collection\('items'\)/);
});

test('workflow dedupe keys include document identity and an event version', () => {
  assert.match(service, /`activation:\$\{sop\.id\}:\$\{sop\.activatedAt/);
  assert.match(service, /`proposal:\$\{sop\.id\}:\$\{sop\.activationRequestedAt/);
  assert.match(service, /`review:\$\{sop\.id\}:\$\{dueDate/);
});
