'use strict';

const IMMUTABLE_WORKFLOW_FIELDS = [
  'id',
  'status',
  'sopNumber',
  'sequenceNumber',
  'revisionNumber',
  'version',
  'jenis_spo',
  'documentType',
  'isReviewDocument',
  'existingSopId',
  'previousRevisionNumber',
  'previousSopNumber',
  'oldSopNumber',
  'reviewState',
  'reviewHistory',
  'currentReviewRequesterUid',
  'reviewUpdatedAt',
  'authorizedUids',
  'accessKeys',
  'accessBoundaryVersion',
  'creatorUid',
  'createdBy',
  'everActivated',
  'activatedAt',
  'activatedBy',
];

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

function normalizeKey(value) {
  return String(value || '').trim().toUpperCase();
}

function assertTrustedSopEditAllowed({ stored, actor, hierarchyClaims }) {
  if (!stored || !stored.id) throw new Error('INVALID_SOP');
  if (!actor) throw new Error('UNAUTHENTICATED');

  if (normalizeRole(actor.role) === 'admin') return;
  if (String(stored.status || '').trim().toUpperCase() !== 'DRAFT') {
    throw new Error('DRAFT_REQUIRED');
  }

  const claims = hierarchyClaims || {};
  if (claims.globalHierarchyAccess === true) return;

  const userKeys = new Set((Array.isArray(claims.hierarchyKeys) ? claims.hierarchyKeys : []).map(normalizeKey).filter(Boolean));
  const sopKeys = (Array.isArray(stored.accessKeys) ? stored.accessKeys : []).map(normalizeKey).filter(Boolean);
  if (!sopKeys.some((key) => userKeys.has(key))) {
    throw new Error('HIERARCHY_DENIED');
  }
}

function buildTrustedSopContentUpdate({ stored, submitted, actor, hierarchyClaims }) {
  assertTrustedSopEditAllowed({ stored, actor, hierarchyClaims });
  if (!submitted || String(submitted.id || '').trim() !== String(stored.id || '').trim()) {
    throw new Error('INVALID_SOP');
  }

  // Number correction has its own atomic backend workflow. A content save must
  // never silently change the registered SPO number.
  if (String(submitted.sopNumber || '').trim() !== String(stored.sopNumber || '').trim()) {
    throw new Error('NUMBER_CHANGE_REQUIRES_CORRECTION');
  }

  const next = { ...submitted };
  for (const field of IMMUTABLE_WORKFLOW_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(stored, field)) next[field] = stored[field];
    else delete next[field];
  }

  // Binary DataURLs are never authoritative Firestore data. Durable binaries
  // are stored in Firebase Storage and only their references may be persisted.
  delete next.fileDataUrl;
  delete next.signedScanDataUrl;
  delete next.oldFileDataUrl;

  next.id = stored.id;
  next._syncedAt = new Date().toISOString();
  return next;
}

module.exports = {
  IMMUTABLE_WORKFLOW_FIELDS,
  assertTrustedSopEditAllowed,
  buildTrustedSopContentUpdate,
};
