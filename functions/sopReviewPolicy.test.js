const test = require('node:test');
const assert = require('node:assert/strict');
const { canReviewSop, assertReviewTransition, canActivate } = require('./sopReviewPolicy');

const draft = { id: 'spo-1', status: 'DRAFT', creatorUid: 'creator', authorizedUids: ['verifier'], sopNumber: '001', revisionNumber: '00' };
test('Admin and scoped VERIFIKATOR can request; ordinary, STRUKTURAL and ALL cannot', () => {
  assert.equal(canReviewSop({ role: 'admin' }, 'admin', draft), true);
  assert.equal(canReviewSop({ role: 'user', badges: ['VERIFIKATOR'] }, 'verifier', draft), true);
  assert.equal(canReviewSop({ role: 'user' }, 'verifier', draft), false);
  assert.equal(canReviewSop({ role: 'user', badges: ['STRUKTURAL'] }, 'verifier', draft), false);
  assert.equal(canReviewSop({ role: 'user', divisionCode: 'ALL' }, 'verifier', draft), false);
});
test('request trims note requirement, routes to immutable creator and leaves identity untouched', () => {
  assert.throws(() => assertReviewTransition({ action: 'REQUEST_REVISION', actor: { role: 'admin' }, actorUid: 'a', sop: draft, note: '   ' }), /NOTE_REQUIRED/);
  const result = assertReviewTransition({ action: 'REQUEST_REVISION', actor: { role: 'admin' }, actorUid: 'a', sop: draft, note: 'fix' });
  assert.deepEqual(result, { nextState: 'REVISION_REQUESTED', recipientUid: 'creator' });
  assert.equal(draft.id, 'spo-1'); assert.equal(draft.sopNumber, '001'); assert.equal(draft.revisionNumber, '00'); assert.equal(draft.status, 'DRAFT');
});
test('creator submission returns to current requester and verification supports another round', () => {
  const requested = { ...draft, reviewState: 'REVISION_REQUESTED', currentReviewRequesterUid: 'verifier' };
  assert.deepEqual(assertReviewTransition({ action: 'SUBMIT_REVISION', actor: {}, actorUid: 'creator', sop: requested }), { nextState: 'REVISION_SUBMITTED', recipientUid: 'verifier' });
  const submitted = { ...requested, reviewState: 'REVISION_SUBMITTED' };
  assert.equal(assertReviewTransition({ action: 'VERIFY', actor: { role: 'user', badges: ['VERIFIKATOR'] }, actorUid: 'verifier', sop: submitted }).nextState, 'VERIFIED');
  assert.equal(assertReviewTransition({ action: 'REQUEST_REVISION', actor: { role: 'user', badges: ['VERIFIKATOR'] }, actorUid: 'verifier', sop: submitted, note: 'again' }).nextState, 'REVISION_REQUESTED');
});
test('active requests and unresolved activation are rejected', () => {
  assert.throws(() => assertReviewTransition({ action: 'REQUEST_REVISION', actor: { role: 'admin' }, actorUid: 'a', sop: { ...draft, status: 'AKTIF' }, note: 'x' }), /DRAFT_REQUIRED/);
  assert.equal(canActivate('REVISION_REQUESTED'), false); assert.equal(canActivate('REVISION_SUBMITTED'), false); assert.equal(canActivate('NONE'), true); assert.equal(canActivate('VERIFIED'), true);
});
