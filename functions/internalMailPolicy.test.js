'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isHumanMail, assertMailReply } = require('./internalMailPolicy');

const sop = { id: 'spo-1', creatorUid: 'creator', currentReviewRequesterUid: 'reviewer' };
const human = { documentId: 'spo-1', metadata: { mailKind: 'human', senderUid: 'reviewer' } };

test('system email cannot be replied to', () => {
  assert.equal(isHumanMail({ metadata: { mailKind: 'system' } }), false);
  assert.throws(() => assertMailReply({ actorUid: 'creator', actor: {}, sourceMail: { ...human, metadata: { mailKind: 'system' } }, sop, body: 'ok' }), /MAIL_NOT_REPLYABLE/);
});

test('human review email replies to authoritative sender and retains document', () => {
  const route = assertMailReply({ actorUid: 'creator', actor: {}, sourceMail: human, sop, body: 'Sudah diperbaiki' });
  assert.equal(route.recipientUid, 'reviewer');
  assert.equal(human.documentId, sop.id);
});

test('recipient and sender cannot be supplied or spoofed by another participant', () => {
  assert.throws(() => assertMailReply({ actorUid: 'arbitrary', actor: {}, sourceMail: human, sop, body: 'spoof' }), /PARTICIPANT_REQUIRED/);
  assert.throws(() => assertMailReply({ actorUid: 'creator', actor: {}, sourceMail: { ...human, metadata: { ...human.metadata, senderUid: 'arbitrary' } }, sop, body: 'x' }), /PARTICIPANT_REQUIRED/);
});
