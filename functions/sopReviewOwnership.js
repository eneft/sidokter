'use strict';

function clean(value) {
  return String(value || '').trim();
}

function normalizeIdentity(value) {
  return clean(value).replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
}

class SopOwnerResolutionError extends Error {
  constructor(reason, field, value) {
    super(reason === 'AMBIGUOUS'
      ? `Pemilik SPO ambigu pada ${field}.`
      : 'UID pembuat/pengusul SPO tidak dapat ditentukan.');
    this.name = 'SopOwnerResolutionError';
    this.reason = reason;
    this.field = field;
    this.value = value;
  }
}

/**
 * Resolve an SPO owner from persisted ownership metadata and the authoritative
 * users directory. UID metadata wins. Legacy text is accepted only when its
 * normalized, exact value identifies precisely one profile or assignment.
 */
async function resolveSopOwner(sop, directory) {
  const uidFields = ['creatorUid', 'activationRequestedUid'];
  const checkedUids = new Set();
  for (const field of uidFields) {
    const uid = clean(sop?.[field]);
    if (!uid || checkedUids.has(uid)) continue;
    checkedUids.add(uid);
    if (await directory.hasUid(uid)) {
      return { uid, source: field, shouldBackfillCreatorUid: clean(sop?.creatorUid) !== uid };
    }
  }

  const legacyFields = [
    ['creatorUsername', 'username'],
    ['activationRequestedByUsername', 'username'],
    ['activationRequestedUsername', 'username'],
    ['activationRequestedBy', 'identity'],
    ['creatorName', 'identity']
  ];
  const checkedValues = new Set();
  for (const [field, kind] of legacyFields) {
    const value = clean(sop?.[field]);
    const normalized = normalizeIdentity(value);
    if (!normalized || checkedValues.has(`${kind}:${normalized}`)) continue;
    checkedValues.add(`${kind}:${normalized}`);
    const matches = await directory.findUidsByIdentity(value, { kind, limit: 2 });
    const uniqueMatches = [...new Set(matches.map(clean).filter(Boolean))];
    if (uniqueMatches.length === 1) {
      return { uid: uniqueMatches[0], source: field, shouldBackfillCreatorUid: true };
    }
    if (uniqueMatches.length > 1) throw new SopOwnerResolutionError('AMBIGUOUS', field, value);
  }

  throw new SopOwnerResolutionError('NOT_FOUND');
}

async function resolveSopOwnerUid(sop, directory) {
  try {
    return (await resolveSopOwner(sop, directory)).uid;
  } catch (error) {
    if (error instanceof SopOwnerResolutionError) return null;
    throw error;
  }
}

function userMatchesIdentity(user, value, kind = 'identity') {
  const target = normalizeIdentity(value);
  if (!target) return false;
  const values = [user?.username];
  if (kind !== 'username') {
    values.push(user?.name, user?.unitName);
    for (const assignment of Array.isArray(user?.assignments) ? user.assignments : []) {
      values.push(assignment?.label, assignment?.unitName);
    }
  }
  return values.some((candidate) => normalizeIdentity(candidate) === target);
}

function buildRevisionRequestNotification({ id, eventKey, sop, actorUid, actor, recipientUid, recipient, note, timestamp }) {
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
      recipientName: String(recipient?.name || recipient?.username || 'Pengguna SIDOKTER'),
      documentTitle: String(sop.title || ''),
      internalMailVersion: 1
    }
  };
}

module.exports = {
  SopOwnerResolutionError,
  normalizeIdentity,
  userMatchesIdentity,
  resolveSopOwner,
  resolveSopOwnerUid,
  buildRevisionRequestNotification
};
