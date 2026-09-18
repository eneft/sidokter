'use strict';

function clean(value) {
  return String(value || '').trim();
}

/**
 * Resolve an SPO owner exclusively from persisted ownership metadata.
 *
 * UID fields are checked against the user directory rather than trusted just
 * because they are present. Historical string fields are accepted only when
 * they are an exact, unique username in that directory. They are never
 * interpreted as display names, units, or a reason to route to an Admin.
 */
async function resolveSopOwnerUid(sop, directory) {
  const uidCandidates = [sop?.creatorUid, sop?.activationRequestedUid]
    .map(clean)
    .filter((value, index, values) => value && values.indexOf(value) === index);

  for (const uid of uidCandidates) {
    if (await directory.hasUid(uid)) return uid;
  }

  // activationRequestedBy and creatorName could contain a username in the
  // oldest SPO schema. A directory lookup by the username field keeps this
  // compatibility safe: names and organizational labels do not match unless
  // they really are the unique username of an existing account.
  const usernameCandidates = [
    sop?.creatorUsername,
    sop?.activationRequestedByUsername,
    sop?.activationRequestedUsername,
    sop?.activationRequestedBy,
    sop?.creatorName
  ].map(clean).filter((value, index, values) => value && values.indexOf(value) === index);

  for (const username of usernameCandidates) {
    const matches = await directory.findUidsByUsername(username, 2);
    if (matches.length === 1) return matches[0];
  }

  return null;
}

function buildRevisionRequestNotification({ id, eventKey, sop, actorUid, actor, recipientUid, note, timestamp }) {
  return {
    id,
    type: 'review',
    title: 'Perlu Perbaikan SPO',
    message: note,
    documentId: sop.id,
    documentNumber: sop.sopNumber || null,
    documentType: 'SPO',
    timestamp,
    read: false,
    hidden: false,
    actionLabel: 'Buka & Perbaiki SPO',
    metadata: {
      eventKey,
      reviewContext: 'REVISION_REQUESTED',
      correctionNote: note,
      mailKind: 'human',
      senderUid: actorUid,
      senderName: String(actor?.name || actor?.username || 'Reviewer SIDOKTER'),
      recipientUid,
      documentTitle: String(sop.title || ''),
      internalMailVersion: 1
    }
  };
}

module.exports = { resolveSopOwnerUid, buildRevisionRequestNotification };
