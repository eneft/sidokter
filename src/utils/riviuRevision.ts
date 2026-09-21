import { SopDocument } from '../types';
import { getNextRevisionNumber, normalizeSopNumberInput } from './numbering';

export const findAuthoritativeRiviuPredecessor = (
  sops: SopDocument[],
  params: { existingSopId?: string; oldSopNumber?: string }
): SopDocument | undefined => {
  const byId = params.existingSopId
    ? sops.find((sop) => sop.id === params.existingSopId)
    : undefined;
  if (byId) return byId;

  const normalizedOldNumber = normalizeSopNumberInput(params.oldSopNumber || '');
  if (!normalizedOldNumber) return undefined;

  return sops.find((sop) =>
    normalizeSopNumberInput(sop.sopNumber || '') === normalizedOldNumber
    || normalizeSopNumberInput(sop.legacySopNumber || '') === normalizedOldNumber
  );
};

export const getAuthoritativeRiviuRevision = (
  predecessor: SopDocument,
  fallbackPreviousRevisionNumber?: string
): { previousRevisionNumber: string; revisionNumber: string } => {
  const previousRevisionNumber = String(
    predecessor.revisionNumber
    || predecessor.version
    || fallbackPreviousRevisionNumber
    || ''
  ).trim();

  return {
    previousRevisionNumber,
    revisionNumber: getNextRevisionNumber(previousRevisionNumber),
  };
};
