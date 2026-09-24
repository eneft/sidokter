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

  const matches = sops.filter((sop) =>
    normalizeSopNumberInput(sop.sopNumber || '') === normalizedOldNumber
    || normalizeSopNumberInput(sop.legacySopNumber || '') === normalizedOldNumber
  );

  return matches.find((s) => s.status === 'AKTIF') || matches[0];
};

export const hasDurableExternalRiviuSource = (sop?: Partial<SopDocument> | null): boolean => {
  if (!sop) return false;
  const name = String(sop.oldFileName || '').trim().toLowerCase();
  const type = String(sop.oldFileType || '').trim().toLowerCase();
  const isPdf = type === 'application/pdf' || name.endsWith('.pdf');
  return Boolean(isPdf && sop.oldFileUrl && sop.oldStoragePath);
};

export const getAuthoritativeRiviuRevision = (
  predecessor?: SopDocument | null,
  fallbackPreviousRevisionNumber?: string
): { previousRevisionNumber: string; revisionNumber: string } => {
  const rawCandidate = String(
    predecessor?.revisionNumber
    || predecessor?.version
    || fallbackPreviousRevisionNumber
    || ''
  ).trim();

  if (!rawCandidate) {
    return {
      previousRevisionNumber: '',
      revisionNumber: '',
    };
  }

  const matched = rawCandidate.match(/\d+/);
  const previousRevisionNumber = matched ? matched[0].padStart(2, '0') : rawCandidate;

  return {
    previousRevisionNumber,
    revisionNumber: getNextRevisionNumber(previousRevisionNumber),
  };
};
