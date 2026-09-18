'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SopOwnerResolutionError,
  userMatchesIdentity,
  resolveSopOwner,
  buildRevisionRequestNotification
} = require('./sopReviewOwnership');
const { assertReviewTransition } = require('./sopReviewPolicy');

function directory(users) {
  return {
    hasUid: async (uid) => users.some((user) => user.uid === uid),
    findUidsByIdentity: async (value, { kind, limit }) => users
      .filter((user) => userMatchesIdentity(user, value, kind))
      .slice(0, limit)
      .map((user) => user.uid)
  };
}

test('valid creatorUid has first priority and needs no backfill', async () => {
  const users = directory([{ uid: 'creator-uid' }, { uid: 'proposer-uid' }]);
  assert.deepEqual(
    await resolveSopOwner({ creatorUid: 'creator-uid', activationRequestedUid: 'proposer-uid' }, users),
    { uid: 'creator-uid', source: 'creatorUid', shouldBackfillCreatorUid: false }
  );
});

test('stale creatorUid falls through to a valid activationRequestedUid and is safely backfilled', async () => {
  const users = directory([{ uid: 'proposer-uid' }]);
  assert.deepEqual(
    await resolveSopOwner({ creatorUid: 'deleted-uid', activationRequestedUid: 'proposer-uid' }, users),
    { uid: 'proposer-uid', source: 'activationRequestedUid', shouldBackfillCreatorUid: true }
  );
});

test('legacy creatorName resolves exactly and uniquely through authoritative assignment data', async () => {
  const users = directory([
    { uid: 'gizi-uid', username: 'petugas.gizi', name: 'Petugas Gizi', assignments: [{ label: 'Pelayanan → Instalasi Gizi', unitName: 'Instalasi Gizi' }] },
    { uid: 'other-uid', username: 'other', name: 'Petugas Lain', unitName: 'Instalasi Bedah' }
  ]);
  assert.deepEqual(
    await resolveSopOwner({ creatorName: '  INSTALASI   GIZI ' }, users),
    { uid: 'gizi-uid', source: 'creatorName', shouldBackfillCreatorUid: true }
  );
});

test('missing legacy creatorName fails closed', async () => {
  await assert.rejects(
    resolveSopOwner({ creatorName: 'Unit Tidak Terdaftar' }, directory([{ uid: 'one', unitName: 'Instalasi Gizi' }])),
    (error) => error instanceof SopOwnerResolutionError && error.reason === 'NOT_FOUND'
  );
});

test('ambiguous creatorName fails closed instead of selecting the first match', async () => {
  const users = directory([
    { uid: 'one', assignments: [{ unitName: 'Instalasi Gizi' }] },
    { uid: 'two', unitName: 'instalasi gizi' }
  ]);
  await assert.rejects(
    resolveSopOwner({ creatorName: 'Instalasi Gizi' }, users),
    (error) => error instanceof SopOwnerResolutionError && error.reason === 'AMBIGUOUS' && error.field === 'creatorName'
  );
});

test('authorizedUids is never an owner fallback', async () => {
  await assert.rejects(
    resolveSopOwner({ authorizedUids: ['authorized-first'] }, directory([{ uid: 'authorized-first', name: 'Reviewer' }])),
    (error) => error instanceof SopOwnerResolutionError && error.reason === 'NOT_FOUND'
  );
});

test('owner resolved by assignment receives REQUEST_REVISION under existing RBAC', async () => {
  const owner = await resolveSopOwner(
    { creatorName: 'Instalasi Gizi' },
    directory([{ uid: 'gizi-uid', assignments: [{ unitName: 'Instalasi Gizi' }] }])
  );
  const transition = assertReviewTransition({
    action: 'REQUEST_REVISION',
    actor: { role: 'user', badges: ['VERIFIKATOR'] },
    actorUid: 'reviewer-uid',
    sop: { status: 'DRAFT', creatorUid: owner.uid, authorizedUids: ['reviewer-uid'] },
    note: 'Perbaiki langkah 2'
  });
  assert.deepEqual(transition, { nextState: 'REVISION_REQUESTED', recipientUid: 'gizi-uid' });
});

test('legacy username metadata only matches username, not a display or assignment name', async () => {
  const users = directory([{ uid: 'legacy-uid', username: 'legacy.user', name: 'Budi' }]);
  assert.equal((await resolveSopOwner({ creatorUsername: 'LEGACY.USER' }, users)).uid, 'legacy-uid');
  await assert.rejects(resolveSopOwner({ creatorUsername: 'Budi' }, users), /tidak dapat ditentukan/);
});

test('revision request notification routes owner with correction deep-link and sender/recipient metadata', () => {
  const item = buildRevisionRequestNotification({
    id: 'event-id', eventKey: 'event-key', sop: { id: 'spo-legacy', sopNumber: '001', title: 'Cuci Tangan' },
    actorUid: 'reviewer-uid', actor: { name: 'Verifikator' }, recipientUid: 'gizi-uid',
    recipient: { name: 'Instalasi Gizi' }, note: 'Perbaiki langkah 2', timestamp: 123
  });
  assert.equal(item.documentId, 'spo-legacy');
  assert.equal(item.message, 'Perbaiki langkah 2');
  assert.equal(item.metadata.correctionNote, 'Perbaiki langkah 2');
  assert.equal(item.metadata.senderUid, 'reviewer-uid');
  assert.equal(item.metadata.senderName, 'Verifikator');
  assert.equal(item.metadata.recipientUid, 'gizi-uid');
  assert.equal(item.metadata.recipientName, 'Instalasi Gizi');
  assert.equal(item.read, false);
  assert.equal(item.hidden, false);
  assert.equal(item.actionLabel, 'Buka & Perbaiki SPO');
});
