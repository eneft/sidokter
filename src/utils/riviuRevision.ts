import { SopDocument } from '../types';
import { getNextRevisionNumber, normalizeSopNumberInput, isNewSopFormat } from './numbering';


const sopNumberComparisonKey = (value?: string | null): string =>
  normalizeSopNumberInput(value || '')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, '');

/**
 * Recognizes legacy/external SPO number shapes without forcing them into the
 * current SIDOKTER hierarchy format. Legacy numbers remain historical source
 * identifiers; they are never converted into a new-format document number.
 */
export const isRecognizedLegacySopNumber = (value?: string | null): boolean => {
  const normalized = normalizeSopNumberInput(value || '');
  if (!normalized || isNewSopFormat(normalized)) return false;

  const parts = normalized.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return false;

  const year = parts[parts.length - 1];
  if (!/^(?:19|20)\d{2}$/.test(year)) return false;

  // Historical formats vary (e.g. SOEGIRI-KEP / 001 / 568 / 2024 or
  // 440 / 102 / SPO / PEL / 2023), but they still carry a numeric identity.
  return parts.slice(0, -1).some((part) => /\d/.test(part));
};

export const findAuthoritativeRiviuPredecessor = (
  sops: SopDocument[],
  params: { existingSopId?: string; oldSopNumber?: string }
): SopDocument | undefined => {
  const byId = params.existingSopId
    ? sops.find((sop) => sop.id === params.existingSopId)
    : undefined;
  if (byId) return byId;

  const normalizedOldNumber = normalizeSopNumberInput(params.oldSopNumber || '');
  const oldNumberKey = sopNumberComparisonKey(normalizedOldNumber);
  if (!oldNumberKey) return undefined;

  const matches = sops.filter((sop) =>
    sopNumberComparisonKey(sop.sopNumber || '') === oldNumberKey
    || sopNumberComparisonKey(sop.legacySopNumber || '') === oldNumberKey
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
