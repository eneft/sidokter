from pathlib import Path

# Restore the named helper expected by the existing UI contract while keeping
# thread-first rendering.
path = Path('src/components/NotificationModal.tsx')
text = path.read_text()

marker = """  const latestHumanMail = selected
    ? [...selected.messages].reverse().find(isHumanMail) || null
    : null;
"""
replacement = marker + """
  const insertSuggestion = (suggestion: string) => {
    setReplyBody((current) =>
      `${current}${current.trim() ? ' ' : ''}${suggestion}.`
    );
  };
"""
if marker not in text:
    raise SystemExit('latestHumanMail marker not found')
text = text.replace(marker, replacement, 1)

old = "onClick={() => setReplyBody((current) => `${current}${current.trim() ? ' ' : ''}${suggestion}.`)}"
new = "onClick={() => insertSuggestion(suggestion)}"
if old not in text:
    raise SystemExit('suggestion button marker not found')
text = text.replace(old, new, 1)
path.write_text(text)

# Existing regression tests described the old flat/unread-only mailbox. Update
# them to preserve the same user guarantees under the new thread/actionable UI.
test_path = Path('tests/internal-mail-ui.test.cjs')
test_text = test_path.read_text()
old_test = """test('opening unread mail keeps it visible and exposes the SPO review path', () => {
  assert.match(ui, /!item\\.read \\|\\| item\\.id === selectedId/);
  assert.match(ui, /Buka & Riviu SPO/);
  assert.match(
    ui,
    /Pesan tetap tersimpan di tab Semua setelah dibaca/
  );
});
"""
new_test = """test('opening a thread marks unread messages read and keeps the thread in Semua', () => {
  assert.match(ui, /const selectThread/);
  assert.match(ui, /thread\\.messages\\.filter\\(\\(item\\) => !item\\.read\\).*markNotificationAsRead/s);
  assert.match(ui, /filter === 'actionable'/);
  assert.match(ui, /Buka Dokumen|Buka & Tindaklanjuti/);
});
"""
if old_test not in test_text:
    raise SystemExit('old unread UI regression test marker not found')
test_text = test_text.replace(old_test, new_test, 1)

old_sound = """test('workflow sound is emitted only after the same event is added to Pesan', () => {
  const gateStart = service.indexOf(
    'function processNotificationEvent'
  );

  const gateEnd = service.indexOf(
    'export function addNotification',
    gateStart
  );

  const gate = service.slice(gateStart, gateEnd);

  assert.ok(
    gate.indexOf('const item = addNotification') >= 0
  );

  assert.ok(
    gate.indexOf('playChime(event.type)') >
      gate.indexOf('const item = addNotification')
  );

  assert.match(
    gate,
    /documentId: event\\.sop\\.id/
  );
});
"""
new_sound = """test('server-authored realtime mail chimes only for new unread records after initial snapshot', () => {
  assert.match(service, /initialMailboxSnapshotSeen/);
  assert.match(service, /snapshot\\.docChanges\\(\\)/);
  assert.match(service, /freshUnread/);
  assert.match(service, /playChime\\(chimeTypeForNotification\\(newest\\)\\)/);
});
"""
if old_sound not in test_text:
    raise SystemExit('old workflow sound regression marker not found')
test_text = test_text.replace(old_sound, new_sound, 1)
test_path.write_text(test_text)

periodic_path = Path('tests/periodic-review-notification-disabled.test.cjs')
periodic = periodic_path.read_text()
old_periodic = """test('legacy periodic review client events are ignored', () => {
  assert.equal(service.includes(\"if (type === 'review') return;\"), true);
});
"""
new_periodic = """test('legacy document events cannot create mailbox records on the client', () => {
  assert.match(service, /export function dispatchDocumentEvent/);
  assert.match(service, /sole producer of official workflow mailbox records/);
  assert.doesNotMatch(service, /queuePendingAdminProposal/);
});
"""
if old_periodic not in periodic:
    raise SystemExit('old periodic review event regression marker not found')
periodic = periodic.replace(old_periodic, new_periodic, 1)
periodic_path.write_text(periodic)

arch_path = Path('tests/notification-architecture.test.cjs')
arch = arch_path.read_text()
arch = arch.replace(
    "assert.match(service, /server Firestore workflow trigger is\\s*the sole producer/i);",
    "assert.match(service, /server Firestore workflow trigger is[\\s\\S]*sole producer/i);"
)
arch_path.write_text(arch)
