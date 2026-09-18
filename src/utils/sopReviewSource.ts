import { SopDocument } from '../types';

export interface ReviewHierarchyIdentity {
  divisionCode: string;
  subHierarchyCode: string;
}

const normalizeCode = (value: unknown) => String(value ?? '').trim().toUpperCase();

/**
 * Riviu eligibility is scoped to the exact hierarchy selected in step 2.
 * This is deliberately independent from RBAC: an Admin may see every hierarchy,
 * but a source is eligible only when its persisted hierarchy identity matches.
 */
export function getReviewHierarchyIdentity(
  value: Pick<SopDocument, 'divisionCode' | 'subHierarchyCode'> | ReviewHierarchyIdentity,
): ReviewHierarchyIdentity {
  return {
    divisionCode: normalizeCode(value.divisionCode),
    subHierarchyCode: normalizeCode(value.subHierarchyCode),
  };
}

export function isSopInReviewHierarchy(
  sop: Pick<SopDocument, 'divisionCode' | 'subHierarchyCode'>,
  selected: ReviewHierarchyIdentity,
): boolean {
  const source = getReviewHierarchyIdentity(sop);
  const target = getReviewHierarchyIdentity(selected);
  return Boolean(target.divisionCode)
    && source.divisionCode === target.divisionCode
    && source.subHierarchyCode === target.subHierarchyCode;
}

export function getEligibleReviewSources(
  sops: SopDocument[],
  selected: ReviewHierarchyIdentity,
): SopDocument[] {
  return sops.filter((sop) => sop.status === 'AKTIF' && isSopInReviewHierarchy(sop, selected));
}
