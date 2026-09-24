'use strict';

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

function normalizeRevision(value) {
  const raw = String(value || '').trim();
  if (!/^\d+$/.test(raw)) throw new Error('INVALID_REVISION');
  return raw.padStart(2, '0');
}

function isRiviu(sop) {
  const jenis = String(sop?.jenis_spo || sop?.documentType || '').trim().toUpperCase();
  return jenis === 'RIVIU' || jenis === 'REVIEW' || sop?.isReviewDocument === true;
}

function buildSopActivationTransition({ storedSuccessor, submitted, predecessor, actor }) {
  if (normalizeRole(actor?.role) !== 'admin') throw new Error('ADMIN_REQUIRED');
  if (!storedSuccessor?.id || String(submitted?.id || '') !== String(storedSuccessor.id)) {
    throw new Error('INVALID_SOP');
  }
  if (storedSuccessor.status !== 'DRAFT') throw new Error('DRAFT_REQUIRED');
  if (storedSuccessor.reviewState === 'REVISION_REQUESTED' || storedSuccessor.reviewState === 'REVISION_SUBMITTED') {
    throw new Error('REVIEW_NOT_COMPLETE');
  }

  const updatedAt = String(submitted.updatedAt || new Date().toISOString());
  const activationFields = {
    status: 'AKTIF',
    everActivated: true,
    updatedAt,
    activatedAt: submitted.activatedAt || updatedAt.slice(0, 10),
    activatedBy: String(submitted.activatedBy || actor?.name || actor?.username || 'Administrator').trim(),
    activationNotes: String(submitted.activationNotes || '').trim(),
  };

  const riviu = isRiviu(storedSuccessor);
  if (predecessor) {
    if (!riviu) throw new Error('INVALID_RIVIU');
    if (String(storedSuccessor.existingSopId || '') !== String(predecessor.id || '')) {
      throw new Error('INVALID_PREDECESSOR');
    }
    if (predecessor.status !== 'AKTIF') throw new Error('PREDECESSOR_NOT_ACTIVE');

    const predecessorRevision = normalizeRevision(predecessor.revisionNumber || predecessor.version);
    const storedPreviousRevision = normalizeRevision(storedSuccessor.previousRevisionNumber);
    if (storedPreviousRevision !== predecessorRevision) throw new Error('PREDECESSOR_REVISION_MISMATCH');

    const nextRevision = String(Number(predecessorRevision) + 1).padStart(2, '0');
    if (normalizeRevision(storedSuccessor.revisionNumber || storedSuccessor.version) !== nextRevision) {
      throw new Error('SUCCESSOR_REVISION_MISMATCH');
    }
    if (!storedSuccessor.sopNumber || storedSuccessor.sopNumber === predecessor.sopNumber) {
      throw new Error('NEW_NUMBER_REQUIRED');
    }

    return {
      successor: {
        ...storedSuccessor,
        ...activationFields,
        previousRevisionNumber: predecessorRevision,
        revisionNumber: nextRevision,
        version: nextRevision,
      },
      predecessor: {
        ...predecessor,
        status: 'DIARSIPKAN',
        everActivated: true,
        archivedAt: updatedAt,
        updatedAt,
      },
    };
  }

  if (riviu) {
    if (storedSuccessor.existingSopId) throw new Error('PREDECESSOR_REQUIRED');
    const sourceName = String(storedSuccessor.oldFileName || '').trim().toLowerCase();
    const sourceType = String(storedSuccessor.oldFileType || '').trim().toLowerCase();
    const sourceIsPdf = sourceType === 'application/pdf' || sourceName.endsWith('.pdf');
    if (!storedSuccessor.oldSopNumber || !storedSuccessor.reviewReason || !storedSuccessor.previousRevisionNumber) {
      throw new Error('EXTERNAL_METADATA_REQUIRED');
    }
    if (!sourceIsPdf || !storedSuccessor.oldFileUrl || !storedSuccessor.oldStoragePath) {
      throw new Error('EXTERNAL_PDF_REQUIRED');
    }
    const previousRevision = normalizeRevision(storedSuccessor.previousRevisionNumber);
    const nextRevision = String(Number(previousRevision) + 1).padStart(2, '0');
    if (normalizeRevision(storedSuccessor.revisionNumber || storedSuccessor.version) !== nextRevision) {
      throw new Error('SUCCESSOR_REVISION_MISMATCH');
    }
    activationFields.previousRevisionNumber = previousRevision;
    activationFields.revisionNumber = nextRevision;
    activationFields.version = nextRevision;
  }

  return {
    successor: { ...storedSuccessor, ...activationFields },
    predecessor: null,
  };
}

module.exports = {
  buildSopActivationTransition,
  normalizeRevision,
};
