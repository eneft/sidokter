import assert from 'node:assert/strict';
import test from 'node:test';
import { getEligibleReviewSources, isSopInReviewHierarchy } from '../src/utils/sopReviewSource';

const sop = (id: string, divisionCode: string, subHierarchyCode: string, status = 'AKTIF') => ({
  id, divisionCode, subHierarchyCode, status,
} as any);

test('source eligibility uses the exact authoritative hierarchy identity', () => {
  const selected = { divisionCode: 'PEN', subHierarchyCode: '2.4' };
  assert.equal(isSopInReviewHierarchy(sop('same', 'PEN', '2.4'), selected), true);
  assert.equal(isSopInReviewHierarchy(sop('sibling', 'PEN', '2.5'), selected), false);
  assert.equal(isSopInReviewHierarchy(sop('other', 'MFK', '2.4'), selected), false);
});

test('global RBAC visibility does not broaden hierarchy source eligibility', () => {
  const allVisibleToAdmin = [
    sop('same', 'PEN', '2.4'),
    sop('sibling', 'PEN', '2.5'),
    sop('other', 'MFK', '2.4'),
    sop('draft', 'PEN', '2.4', 'DRAFT'),
  ];
  assert.deepEqual(
    getEligibleReviewSources(allVisibleToAdmin, { divisionCode: 'pen', subHierarchyCode: '2.4' }).map((item) => item.id),
    ['same'],
  );
});
