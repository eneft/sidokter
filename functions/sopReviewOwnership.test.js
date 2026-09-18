'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveSopOwnerUid, buildRevisionRequestNotification } = require('./sopReviewOwnership');

function directory(users) {
  return {
    hasUid: async (uid) => users.some((user) => user.uid === uid),
    findUidsByUsername: async (username, limit) => users
      .filter((user) => user.username === username)
      .slice(0, limit)
      .map((user) => user.uid)
  };
}

test('current SPO routes only to a creator/proposer UID that exists in users', async () => {
  const users = directory([{ uid: 'creator-uid', username: 'creator' }, { uid: 'proposer-uid', username: 'proposer' }]);
  assert.equal(await resolveSopOwnerUid({ creatorUid: 'creator-uid', activationRequestedUid: 'proposer-uid' }, users), 'creator-uid');
  assert.equal(await resolveSopOwnerUid({ creatorUid: 'deleted-uid', activationRequestedUid: 'proposer-uid' }, users), 'proposer-uid');
});

test('legacy SPO maps exact unique username without display-name, unit, or Admin fallback', async () => {
  const users = directory([
    { uid: 'legacy-uid', username: 'legacy.user' },
    { uid: 'admin-uid', username: 'admin' }
  ]);
  assert.equal(await resolveSopOwnerUid({ activationRequestedBy: 'legacy.user', creatorName: 'Nama Tampilan' }, users), 'legacy-uid');
  assert.equal(await resolveSopOwnerUid({ activationRequestedBy: 'Nama Tampilan', creatorName: 'Unit ICU', divisionName: 'ICU' }, users), null);
  assert.equal(await resolveSopOwnerUid({ creatorName: 'Administrator SIDOKTER', divisionCode: 'ALL' }, users), null);
});

test('ambiguous legacy username is rejected', async () => {
  const users = directory([{ uid: 'one', username: 'duplicate' }, { uid: 'two', username: 'duplicate' }]);
  assert.equal(await resolveSopOwnerUid({ creatorUsername: 'duplicate' }, users), null);
});

test('revision request notification has correction deep-link and immutable routing metadata', () => {
  const item = buildRevisionRequestNotification({
    id: 'event-id', eventKey: 'event-key', sop: { id: 'spo-legacy', sopNumber: '001', title: 'Cuci Tangan' },
    actorUid: 'reviewer-uid', actor: { name: 'Verifikator' }, recipientUid: 'legacy-uid', note: 'Perbaiki langkah 2', timestamp: 123
  });
  assert.equal(item.documentId, 'spo-legacy');
  assert.equal(item.message, 'Perbaiki langkah 2');
  assert.equal(item.metadata.correctionNote, 'Perbaiki langkah 2');
  assert.equal(item.metadata.senderUid, 'reviewer-uid');
  assert.equal(item.metadata.recipientUid, 'legacy-uid');
  assert.equal(item.read, false);
  assert.equal(item.hidden, false);
  assert.equal(item.actionLabel, 'Buka & Perbaiki SPO');
});
