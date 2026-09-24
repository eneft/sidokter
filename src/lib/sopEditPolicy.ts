import { SopDocument, UserSession } from '../types';
import { isSopAccessibleByUser } from './soegiriStructure';

/** Single policy used by the preview and the authoritative edit service. */
export function canEditExistingSop(sop: SopDocument, actor: UserSession | null | undefined): boolean {
  if (!sop || !actor) return false;
  if (actor.role === 'admin') return true;
  return sop.status === 'DRAFT' && isSopAccessibleByUser(sop, actor);
}

export function assertCanEditExistingSop(sop: SopDocument, actor: UserSession | null | undefined): void {
  if (canEditExistingSop(sop, actor)) return;
  if (actor?.role !== 'admin' && sop?.status !== 'DRAFT') {
    throw new Error('Akses ditolak. Petugas hanya dapat mengedit SPO berstatus DRAFT.');
  }
  throw new Error('Akses ditolak. Anda tidak memiliki hak edit pada hierarki SPO ini.');
}

// Editing never performs a lifecycle transition. In particular, an Admin edit
// of an active/archive document retains the document's registered identity.
export function preserveSopWorkflowIdentity(
  stored: SopDocument,
  submitted: SopDocument,
  actor?: UserSession | null,
): SopDocument {
  const adminNumberCorrection = actor?.role === 'admin';
  const isDraftRiviu = stored.status === 'DRAFT' && (
    stored.jenis_spo === 'RIVIU'
    || stored.documentType === 'RIVIU'
    || stored.documentType === 'REVIEW'
    || stored.isReviewDocument === true
  );
  const preserveOrRepair = <T,>(current: T | undefined, proposed: T | undefined): T | undefined => (
    current !== undefined && current !== null && String(current).trim() !== ''
      ? current
      : (isDraftRiviu ? proposed : current)
  );
  const canRepairRiviuRevision = isDraftRiviu && !String(stored.previousRevisionNumber || '').trim();
  return {
    ...submitted,
    id: stored.id,
    status: stored.status,
    // sopNumber is the one canonical current-document number. Admins may
    // correct it; historical predecessor/reference fields remain immutable.
    sopNumber: adminNumberCorrection ? submitted.sopNumber : stored.sopNumber,
    sequenceNumber: adminNumberCorrection ? submitted.sequenceNumber : stored.sequenceNumber,
    revisionNumber: canRepairRiviuRevision ? submitted.revisionNumber : stored.revisionNumber,
    version: canRepairRiviuRevision ? submitted.version : stored.version,
    jenis_spo: stored.jenis_spo,
    documentType: stored.documentType,
    isReviewDocument: stored.isReviewDocument,
    // Draft Riviu records created by older clients may be missing their source
    // identity. Permit a one-time completion of absent fields, but never allow
    // an already-recorded predecessor identity to be replaced by content edit.
    existingSopId: preserveOrRepair(stored.existingSopId, submitted.existingSopId),
    previousRevisionNumber: preserveOrRepair(stored.previousRevisionNumber, submitted.previousRevisionNumber),
    previousSopNumber: preserveOrRepair(stored.previousSopNumber, submitted.previousSopNumber),
    oldSopNumber: preserveOrRepair(stored.oldSopNumber, submitted.oldSopNumber),
    reviewState: stored.reviewState,
    reviewHistory: stored.reviewHistory,
    currentReviewRequesterUid: stored.currentReviewRequesterUid,
    reviewUpdatedAt: stored.reviewUpdatedAt,
  };
}
