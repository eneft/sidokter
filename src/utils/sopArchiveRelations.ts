import type { SopDocument } from '../types';
import { normalizeSopNumberInput } from './numbering';

export interface SopArchiveRelation {
  id: string;
  sopNumber: string;
  title: string;
  status: SopDocument['status'];
  reasons: Array<'existingSopId' | 'oldSopNumber' | 'previousSopNumber'>;
}

const normalizedNumber = (value?: string): string => {
  const raw = String(value || '').trim();
  return raw ? normalizeSopNumberInput(raw) : '';
};

/**
 * Returns SPO records that still carry an explicit historical reference to the
 * target document. This is intentionally read-only: deleting an archived SPO
 * must never cascade into, rewrite, or detach its successors.
 */
export function findArchivedSopRelations(
  target: Pick<SopDocument, 'id' | 'sopNumber'>,
  sops: SopDocument[],
): SopArchiveRelation[] {
  const targetId = String(target.id || '').trim();
  const targetNumber = normalizedNumber(target.sopNumber);
  if (!targetId && !targetNumber) return [];

  return (sops || [])
    .filter((candidate) => candidate && candidate.id !== targetId)
    .map((candidate): SopArchiveRelation | null => {
      const reasons: SopArchiveRelation['reasons'] = [];
      if (targetId && String(candidate.existingSopId || '').trim() === targetId) {
        reasons.push('existingSopId');
      }
      if (targetNumber && normalizedNumber(candidate.oldSopNumber) === targetNumber) {
        reasons.push('oldSopNumber');
      }
      if (targetNumber && normalizedNumber(candidate.previousSopNumber) === targetNumber) {
        reasons.push('previousSopNumber');
      }
      if (!reasons.length) return null;
      return {
        id: candidate.id,
        sopNumber: candidate.sopNumber || '',
        title: candidate.title || 'SPO tanpa judul',
        status: candidate.status,
        reasons: Array.from(new Set(reasons)),
      };
    })
    .filter((item): item is SopArchiveRelation => Boolean(item));
}
