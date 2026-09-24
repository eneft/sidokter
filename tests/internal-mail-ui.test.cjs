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
  assert.doesNotMatch(
    service,
    /internalMailVersion \|\| 0\) === INTERNAL_MAIL_VERSION/
  );
  assert.match(service, /internalMailVersion: INTERNAL_MAIL_VERSION/);
});

test('desktop mail control is placed in the top-right account header', () => {
  assert.match(header, /fixed left-72 right-0 top-0/);
  assert.match(header, /justify-end/);
  assert.match(header, /DesktopAccountHeader/);
});

test('opening a thread marks unread messages read and keeps the thread in Semua', () => {
  assert.match(ui, /const selectThread/);
  assert.match(ui, /thread\.messages\.filter\(\(item\) => !item\.read\).*markNotificationAsRead/s);
  assert.match(ui, /filter === 'actionable'/);
  assert.match(ui, /Buka Dokumen|Buka & Tindaklanjuti/);
});

test('Riviu source selection keeps Live A4 body blank while retaining reference metadata', () => {
  assert.match(userView, /setExistingSopId\(chosenId\)/);
  assert.match(
    userView,
    /setOldSopNumber\(found\.sopNumber \|\| ''\)/
  );
  assert.match(
    userView,
    /setPreviousRevisionNumber\(currentRevision\)/
  );

  for (const setter of [
    'setPengertian',
    'setTujuan',
    'setKebijakan',
    'setProsedur',
    'setAlur',
    'setUnitTerkait',
  ]) {
    assert.match(
      userView,
      new RegExp(`${setter}\\(''\\)`)
    );

    assert.doesNotMatch(
      userView,
      new RegExp(`${setter}\\(found\\.`)
    );
  }
});

test('server-authored realtime mail chimes only for new unread records after initial snapshot', () => {
  assert.match(service, /initialMailboxSnapshotSeen/);
  assert.match(service, /snapshot\.docChanges\(\)/);
  assert.match(service, /freshUnread/);
  assert.match(service, /playChime\(chimeTypeForNotification\(newest\)\)/);
});

test('recipient writes and listener use the same per-user notification path', () => {
  assert.match(
    service,
    /collection\(db, 'notifications', uid, 'items'\)/
  );

  assert.match(
    functionsSource,
    /collection\('notifications'\)\.doc\(route\.recipientUid\)\.collection\('items'\)/
  );

  assert.match(
    functionsSource,
    /collection\('notifications'\)\.doc\(notification\.uid\)\.collection\('items'\)/
  );
});

test('workflow dedupe keys include document identity and an event version', () => {
  assert.match(
    service,
    /`activation:\$\{sop\.id\}:\$\{sop\.activatedAt/
  );

  assert.match(
    service,
    /`proposal:\$\{sop\.id\}:\$\{sop\.activationRequestedAt/
  );

  assert.match(
    service,
    /`review:\$\{sop\.id\}:\$\{dueDate/
  );
});