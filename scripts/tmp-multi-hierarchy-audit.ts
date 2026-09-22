import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/UserManagementModal.tsx', 'utf8');

assert.match(
  source,
  /assignments\.length\s*<=\s*1\s*\?\s*\[draftAssignment\]\s*:\s*\[draftAssignment,\s*\.\.\.otherAssignments\]/,
  'Expected the current single-assignment replacement branch to exist before the fix.'
);

const existing = [
  { id: 'a', divisionCode: 'PEN', hierarchyCode: '2.1' },
];
const draft = { id: 'b', divisionCode: 'PEN', hierarchyCode: '2.2' };
const other = existing.filter((a) => a.divisionCode !== draft.divisionCode || (a.hierarchyCode || '') !== (draft.hierarchyCode || ''));
const currentResult = existing.length <= 1 ? [draft] : [draft, ...other];

assert.deepEqual(
  currentResult.map((a) => `${a.divisionCode}|${a.hierarchyCode || ''}`),
  ['PEN|2.1', 'PEN|2.2'],
  'BUG REPRODUCED: saving a second hierarchy must preserve the existing hierarchy instead of replacing it.'
);
