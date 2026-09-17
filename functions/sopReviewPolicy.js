'use strict';

function hasVerificatorBadge(user) {
  return Array.isArray(user?.badges) && user.badges.some((badge) => String(badge).trim().toUpperCase() === 'VERIFIKATOR');
}

function canReviewSop(user, uid, sop) {
  const admin = String(user?.role || '').toLowerCase() === 'admin';
  return admin || (hasVerificatorBadge(user) && Array.isArray(sop?.authorizedUids) && sop.authorizedUids.includes(uid));
}

function assertReviewTransition({ action, actor, actorUid, sop, note }) {
  if (sop?.status !== 'DRAFT') throw new Error('DRAFT_REQUIRED');
  const creatorUid = String(sop.creatorUid || sop.activationRequestedUid || '').trim();
  if (!creatorUid) throw new Error('CREATOR_REQUIRED');
  const state = String(sop.reviewState || 'NONE');
  if (action === 'REQUEST_REVISION') {
    if (!canReviewSop(actor, actorUid, sop)) throw new Error('REVIEWER_REQUIRED');
    if (!String(note || '').trim()) throw new Error('NOTE_REQUIRED');
    if (!['NONE', 'REVISION_SUBMITTED', 'VERIFIED'].includes(state)) throw new Error('INVALID_STATE');
    return { nextState: 'REVISION_REQUESTED', recipientUid: creatorUid };
  }
  if (action === 'SUBMIT_REVISION') {
    if (actorUid !== creatorUid) throw new Error('CREATOR_ONLY');
    if (state !== 'REVISION_REQUESTED' || !sop.currentReviewRequesterUid) throw new Error('INVALID_STATE');
    return { nextState: 'REVISION_SUBMITTED', recipientUid: sop.currentReviewRequesterUid };
  }
  if (action === 'VERIFY') {
    if (!canReviewSop(actor, actorUid, sop)) throw new Error('REVIEWER_REQUIRED');
    if (state !== 'REVISION_SUBMITTED') throw new Error('INVALID_STATE');
    return { nextState: 'VERIFIED', recipientUid: creatorUid };
  }
  throw new Error('INVALID_ACTION');
}

function canActivate(reviewState) {
  return reviewState !== 'REVISION_REQUESTED' && reviewState !== 'REVISION_SUBMITTED';
}

module.exports = { hasVerificatorBadge, canReviewSop, assertReviewTransition, canActivate };
