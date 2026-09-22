import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { flattenHierarchy, getNodeChildren } from '../src/utils/hierarchyTree';

const mixedHierarchy: any = {
  id: 'soegiri-pen',
  number: 2,
  code: 'PEN',
  name: 'Bidang Penunjang',
  type: 'bidang',
  // This is the shape produced by the cloud normalizer for legacy trees:
  // an empty generic children array can coexist with populated legacy levels.
  children: [],
  subs: [
    {
      id: 'pen-sub-nonmedik',
      code: '2',
      name: 'Non Medik',
      children: [],
      instalasis: [
        {
          id: 'pen-nonmed-cssd',
          code: '1',
          name: 'Inst. CSSD dan Laundry',
          children: [
            { id: 'cssd-unit-steril', code: '1', name: 'Unit Sterilisasi', children: [] },
            { id: 'cssd-unit-laundry', code: '2', name: 'Unit Laundry', children: [] },
          ],
          polis: [],
        },
      ],
    },
  ],
};

test('generic hierarchy traversal falls back to populated legacy children when generic children is empty', () => {
  assert.deepEqual(getNodeChildren(mixedHierarchy).map((node) => node.code), ['2']);
  const sub = getNodeChildren(mixedHierarchy)[0];
  assert.deepEqual(getNodeChildren(sub).map((node) => node.code), ['1']);
  const cssd = getNodeChildren(sub)[0];
  assert.deepEqual(getNodeChildren(cssd).map((node) => node.name), ['Unit Sterilisasi', 'Unit Laundry']);
});

test('HierarchyPicker flattening reaches CSSD units in mixed legacy/generic cloud data', () => {
  const rows = flattenHierarchy(mixedHierarchy);
  assert.ok(rows.some((row) => row.code === '2.1.1' && row.label.includes('Unit Sterilisasi')));
  assert.ok(rows.some((row) => row.code === '2.1.2' && row.label.includes('Unit Laundry')));
});

test('account hierarchy cascade consumes the generic hierarchy tree at every visible level', () => {
  const source = fs.readFileSync(path.resolve('src/components/UserManagementModal.tsx'), 'utf8');
  assert.match(source, /from ['"]\.\.\/utils\/hierarchyTree['"]/);
  assert.match(source, /const availableSubs = selectedCategory \? getNodeChildren\(selectedCategory\) : \[\]/);
  assert.match(source, /const availableInsts = selectedSub \? getNodeChildren\(selectedSub\) : \[\]/);
  assert.match(source, /const availablePolis = selectedInst \? getNodeChildren\(selectedInst\) : \[\]/);
  assert.match(source, /const availableSubUnits = selectedPoli \? getNodeChildren\(selectedPoli\) : \[\]/);
  assert.match(source, /hierarchyCode: visibleHierarchyCode/);
});

test('master hierarchy mutations use the same generic child resolver for legacy roots', () => {
  const source = fs.readFileSync(path.resolve('src/components/MasterDataModal.tsx'), 'utf8');
  assert.match(source, /if \(!parent\.path\.length\) return getNodeChildren\(cat\)/);
  assert.match(source, /parentChildren = getNodeChildren\(cat\)/);
});
