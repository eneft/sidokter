'use strict';
const fs = require('fs');

const policyPath = 'functions/sopNumberSyncPolicy.js';
const testPath = 'functions/sopNumberSync.test.js';

let policy = fs.readFileSync(policyPath, 'utf8');
const oldLine = "    const subHierarchyCode = cleanString(sop.subHierarchyCode ?? parsed?.subHierarchyCode);";
const replacement = `    // Older standard SPO records can have an empty composite subHierarchyCode\n    // even though the canonical SPO number (and/or component hierarchy fields)\n    // already identifies the real hierarchy. Keep the server plan aligned with\n    // the browser preview: blank is missing data, not an authoritative ROOT.\n    const storedSubHierarchyCode = cleanString(sop.subHierarchyCode);\n    const componentSubHierarchyCode = [\n      cleanString(sop.subCode),\n      cleanString(sop.instalasiCode || sop.instCode),\n      cleanString(sop.poliCode),\n      cleanString(sop.subUnitCode),\n    ].filter(Boolean).join('.');\n    const subHierarchyCode =\n      storedSubHierarchyCode ||\n      cleanString(parsed?.subHierarchyCode) ||\n      componentSubHierarchyCode;`;

if (!policy.includes(oldLine)) {
  throw new Error('Expected subHierarchyCode scope line not found');
}
policy = policy.replace(oldLine, replacement);
fs.writeFileSync(policyPath, policy);

let tests = fs.readFileSync(testPath, 'utf8');
const marker = "test('blank stored subHierarchyCode falls back to the hierarchy encoded in the SPO number'";
if (!tests.includes(marker)) {
  tests += `\n\ntest('blank stored subHierarchyCode falls back to the hierarchy encoded in the SPO number', () => {\n  const docs = [\n    {\n      ...sop('uph-gap-3', 3),\n      divisionCode: 'UPH',\n      subHierarchyCode: '',\n      sopNumber: 'UPH / 1.1 / 003 / 2026',\n    },\n    {\n      ...sop('uph-gap-4', 4),\n      divisionCode: 'UPH',\n      subHierarchyCode: '',\n      sopNumber: 'UPH / 1.1 / 004 / 2026',\n    },\n  ];\n  const reservations = [{\n    id: 'uph-reserved-1',\n    divisionCode: 'UPH',\n    subHierarchyCode: '1.1',\n    sequenceNumber: 1,\n    sopNumber: 'UPH / 1.1 / 001 / 2026',\n    year: '2026',\n    status: 'RESERVED',\n    reservedAt: '2026-01-01T00:00:00.000Z',\n    reservedBy: 'Admin',\n  }];\n\n  const plan = buildSequentialSyncPlan(docs, reservations);\n  const targetScope = plan.scopes.find((row) => row.scopeKey === '2026|UPH|1.1');\n\n  assert.ok(targetScope, 'UPH / 1.1 scope should be recovered from the SPO number');\n  assert.equal(targetScope.docs.length, 2);\n  assert.equal(plan.changedCount, 2);\n  assert.deepEqual(plan.changes.map((row) => row.newNumber), [\n    'UPH / 1.1 / 002 / 2026',\n    'UPH / 1.1 / 003 / 2026',\n  ]);\n  assert.equal(plan.scopes.some((row) => row.scopeKey === '2026|UPH|ROOT' && row.docs.length > 0), false);\n});\n`;
  fs.writeFileSync(testPath, tests);
}

console.log('SPO number sync hierarchy fallback patch applied.');
