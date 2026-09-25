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

function firstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
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

  // Asset upload happens before this transaction. Carry only durable file
  // metadata into the authoritative activation write; never carry DataURLs.
  const durableStringFields = [
    'fileName', 'fileType', 'fileUrl', 'storagePath',
    'signedScanFileName', 'signedScanFileType', 'signedScanUrl', 'signedScanStoragePath',
    'oldFileName', 'oldFileType', 'oldFileUrl', 'oldStoragePath',
    'existingSourceFormat',
  ];
  for (const key of durableStringFields) {
    const value = String(submitted?.[key] || '').trim();
    if (value) activationFields[key] = value;
  }
  for (const key of ['fileSize', 'signedScanFileSize', 'oldFileSize']) {
    const value = Number(submitted?.[key]);
    if (Number.isFinite(value) && value >= 0) activationFields[key] = value;
  }
  if (Array.isArray(submitted?.supportingEvidence)) {
    activationFields.supportingEvidence = submitted.supportingEvidence;
  }

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

    // Older external/legacy Riviu drafts can predate the first-write metadata
    // fix. During trusted Admin activation, repair only fields that are missing
    // from the stored Draft by falling back to the submitted Draft snapshot.
    // Existing stored values remain authoritative and cannot be overwritten.
    const oldSopNumber = firstNonEmptyString(storedSuccessor.oldSopNumber, submitted?.oldSopNumber);
    const reviewReason = firstNonEmptyString(storedSuccessor.reviewReason, submitted?.reviewReason);
    const previousRevisionRaw = firstNonEmptyString(storedSuccessor.previousRevisionNumber, submitted?.previousRevisionNumber);

    const sourceName = firstNonEmptyString(storedSuccessor.oldFileName, submitted?.oldFileName);
    const sourceType = firstNonEmptyString(storedSuccessor.oldFileType, submitted?.oldFileType);
    const sourceUrl = firstNonEmptyString(storedSuccessor.oldFileUrl, submitted?.oldFileUrl);
    const sourceStoragePath = firstNonEmptyString(storedSuccessor.oldStoragePath, submitted?.oldStoragePath);
    const sourceIsPdf = sourceType.toLowerCase() === 'application/pdf' || sourceName.toLowerCase().endsWith('.pdf');

    if (!oldSopNumber || !reviewReason || !previousRevisionRaw) {
      throw new Error('EXTERNAL_METADATA_REQUIRED');
    }
    if (!sourceIsPdf || !sourceUrl || !sourceStoragePath) {
      throw new Error('EXTERNAL_PDF_REQUIRED');
    }

    const previousRevision = normalizeRevision(previousRevisionRaw);
    const nextRevision = String(Number(previousRevision) + 1).padStart(2, '0');
    if (normalizeRevision(storedSuccessor.revisionNumber || storedSuccessor.version) !== nextRevision) {
      throw new Error('SUCCESSOR_REVISION_MISMATCH');
    }

    // Persist repaired metadata atomically together with DRAFT -> AKTIF.
    activationFields.oldSopNumber = oldSopNumber;
    activationFields.reviewReason = reviewReason;
    activationFields.previousRevisionNumber = previousRevision;
    activationFields.revisionNumber = nextRevision;
    activationFields.version = nextRevision;
    activationFields.oldFileName = sourceName;
    activationFields.oldFileType = sourceType;
    activationFields.oldFileUrl = sourceUrl;
    activationFields.oldStoragePath = sourceStoragePath;

    const storedOldFileSize = Number(storedSuccessor.oldFileSize);
    const submittedOldFileSize = Number(submitted?.oldFileSize);
    if (Number.isFinite(storedOldFileSize) && storedOldFileSize >= 0) {
      activationFields.oldFileSize = storedOldFileSize;
    } else if (Number.isFinite(submittedOldFileSize) && submittedOldFileSize >= 0) {
      activationFields.oldFileSize = submittedOldFileSize;
    }

    if (storedSuccessor.externalReviewSignedConfirmed === true || submitted?.externalReviewSignedConfirmed === true) {
      activationFields.externalReviewSignedConfirmed = true;
    }
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
