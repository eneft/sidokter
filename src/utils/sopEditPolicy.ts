import { SopDocument, SopStatus, UserSession } from '../types';

export function canEditSop(role: UserSession['role'] | string | undefined, status: SopStatus | string | undefined): boolean {
  return role === 'admin' || status === 'DRAFT';
}

export function assertCanEditSop(role: UserSession['role'] | string | undefined, status: SopStatus | string | undefined): void {
  if (!canEditSop(role, status)) {
    throw new Error('SPO AKTIF atau DIARSIPKAN hanya dapat diedit oleh Admin.');
  }
}

const IDENTITY_FIELDS: Array<keyof SopDocument> = [
  'id', 'sopNumber', 'sequenceNumber', 'revisionNumber', 'version', 'status',
  'jenis_spo', 'documentType', 'isReviewDocument', 'isLegacySop',
  'existingSopId', 'oldSopNumber', 'previousSopNumber', 'previousRevisionNumber',
];

/** Editing content never becomes a numbering or lifecycle operation. */
export function preserveSopIdentity(current: SopDocument, edited: SopDocument): SopDocument {
  const preserved = { ...edited };
  for (const field of IDENTITY_FIELDS) (preserved as any)[field] = current[field];
  return preserved;
}
