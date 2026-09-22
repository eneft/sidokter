import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeUserAssignments, getPrimaryUserAssignment } from '../src/lib/userAssignmentPolicy';
import { getUserHierarchyAccessKeys } from '../src/lib/soegiriStructure';
import type { UserAssignment } from '../src/types';

const assignment = (id: string, divisionCode: string, hierarchyCode: string): UserAssignment => ({
  id,
  divisionCode,
  hierarchyCode,
  subCode: hierarchyCode.split('.')[0] || undefined,
  instCode: hierarchyCode.split('.')[1] || undefined,
  poliCode: hierarchyCode.split('.')[2] || undefined,
  subUnitCode: hierarchyCode.split('.')[3] || undefined,
});

test('adding a second hierarchy preserves the only existing assignment', () => {
  const existing = [assignment('old', 'PEN', '2.1')];
  const draft = assignment('new', 'PEN', '2.2');
  const merged = mergeUserAssignments(existing, draft);
  assert.deepEqual(merged.map((a) => `${a.divisionCode}|${a.hierarchyCode}`), ['PEN|2.1', 'PEN|2.2']);
});

test('additional hierarchy in another division is retained and produces access keys for both scopes', () => {
  const existing = [assignment('old', 'PEN', '2.1')];
  const draft = assignment('new', 'PEL', '1.2.3');
  const merged = mergeUserAssignments(existing, draft);
  const keys = getUserHierarchyAccessKeys({
    role: 'user',
    assignments: merged,
  });

  assert.ok(keys.includes('PEN|2.1'));
  assert.ok(keys.includes('PEL|1.2.3'));
});

test('saving the same hierarchy updates metadata without creating a duplicate', () => {
  const existing = [{ ...assignment('old', 'PEN', '2.1'), unitName: 'Nama Lama' }];
  const draft = { ...assignment('new', 'PEN', '2.1'), unitName: 'Inst. CSSD dan Laundry' };
  const merged = mergeUserAssignments(existing, draft);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].unitName, 'Inst. CSSD dan Laundry');
});

test('primary hierarchy remains the first persisted assignment after adding another scope', () => {
  const first = assignment('first', 'PEN', '2.1');
  const second = assignment('second', 'PEL', '1.1');
  const merged = mergeUserAssignments([first], second);
  assert.deepEqual(getPrimaryUserAssignment(merged, second), first);
});
