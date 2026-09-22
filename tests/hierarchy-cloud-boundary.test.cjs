'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const hierarchyClient = fs.readFileSync('src/lib/hierarchyService.ts', 'utf8');
const hierarchyApi = fs.readFileSync('functions/hierarchyApiV2.js', 'utf8');
const firebaseJson = fs.readFileSync('firebase.json', 'utf8');

// This test intentionally fails until the client/rewrite wiring lands in the same patch.
test('Master Hirarki uses trusted cross-host chunked backend', () => {
  assert.doesNotMatch(hierarchyClient, /saveSystemConfigToFirestore/);
  assert.match(hierarchyClient, /DIRECT_CLOUD_HIERARCHY_URL/);
  assert.match(hierarchyClient, /hierarchyApiV2/);
  assert.match(hierarchyApi, /chunked-json-base64-v1/);
  assert.match(hierarchyApi, /hierarchy_master_chunks/);
  assert.match(hierarchyApi, /FieldValue\.delete\(\)/);
  assert.match(firebaseJson, /"functionId"\s*:\s*"hierarchyApiV2"/);
});
