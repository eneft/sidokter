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

function isBlankWorkflowValue(value) {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
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
  const isDraftRiviu = String(stored.status || '').trim().toUpperCase() === 'DRAFT' && (
    String(stored.jenis_spo || '').trim().toUpperCase() === 'RIVIU'
    || ['RIVIU', 'REVIEW'].includes(String(stored.documentType || '').trim().toUpperCase())
    || stored.isReviewDocument === true
  );
  const repairableRiviuFields = new Set([
    'existingSopId',
    'previousRevisionNumber',
    'previousSopNumber',
    'oldSopNumber',
  ]);
  const canRepairRiviuRevision = isDraftRiviu && isBlankWorkflowValue(stored.previousRevisionNumber);

  for (const field of IMMUTABLE_WORKFLOW_FIELDS) {
    const submittedHasField = Object.prototype.hasOwnProperty.call(submitted, field);
    const storedHasField = Object.prototype.hasOwnProperty.call(stored, field);

    if (canRepairRiviuRevision && (field === 'revisionNumber' || field === 'version') && submittedHasField) {
      next[field] = submitted[field];
    }
    // Legacy Draft Riviu records may already contain these keys as empty
    // strings. Empty is not an authoritative workflow identity. Permit a
    // one-time repair from the trusted edit payload, then freeze the value on
    // subsequent edits exactly like any other immutable workflow field.
    else if (
      isDraftRiviu
      && repairableRiviuFields.has(field)
      && isBlankWorkflowValue(stored[field])
      && submittedHasField
      && !isBlankWorkflowValue(submitted[field])
    ) {
      next[field] = submitted[field];
    }
    else if (storedHasField) {
      next[field] = stored[field];
    }
    else {
      delete next[field];
    }
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
