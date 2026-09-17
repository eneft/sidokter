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
export function preserveSopWorkflowIdentity(stored: SopDocument, submitted: SopDocument): SopDocument {
  return {
    ...submitted,
    id: stored.id,
    status: stored.status,
    sopNumber: stored.sopNumber,
    sequenceNumber: stored.sequenceNumber,
    revisionNumber: stored.revisionNumber,
    version: stored.version,
    jenis_spo: stored.jenis_spo,
    documentType: stored.documentType,
    isReviewDocument: stored.isReviewDocument,
    existingSopId: stored.existingSopId,
    previousRevisionNumber: stored.previousRevisionNumber,
    oldSopNumber: stored.oldSopNumber,
  };
}
