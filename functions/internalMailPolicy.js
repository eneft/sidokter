'use strict';

function isHumanMail(mail) {
  return mail?.metadata?.mailKind === 'human' && Boolean(mail?.metadata?.senderUid);
}

function assertMailReply({ actorUid, actor, sourceMail, sop, body }) {
  if (!actorUid || !actor) throw new Error('AUTH_REQUIRED');
  if (!sourceMail || sourceMail.hidden === true || !isHumanMail(sourceMail)) throw new Error('MAIL_NOT_REPLYABLE');
  if (!String(body || '').trim()) throw new Error('BODY_REQUIRED');
  if (String(sourceMail.documentId || '') !== String(sop?.id || '')) throw new Error('DOCUMENT_MISMATCH');

  const creatorUid = String(sop.creatorUid || sop.activationRequestedUid || '').trim();
  const reviewerUid = String(sourceMail.metadata.senderUid || '').trim();
  const currentRequesterUid = String(sop.currentReviewRequesterUid || '').trim();
  const isCreatorReply = actorUid === creatorUid && reviewerUid === currentRequesterUid;
  const isReviewerReply = actorUid === currentRequesterUid && reviewerUid === creatorUid;
  if (!creatorUid || (!isCreatorReply && !isReviewerReply)) throw new Error('PARTICIPANT_REQUIRED');

  return { recipientUid: reviewerUid, creatorUid, reviewerUid };
}

module.exports = { isHumanMail, assertMailReply };
