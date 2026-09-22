import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/firebase-deploy.yml', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const firebaseConfig = fs.readFileSync('firebase.json', 'utf8');

test('production Firebase deploy includes Firestore rules', () => {
  assert.match(
    workflow,
    /firebase-tools@[^\s]+\s+deploy\s+--only\s+[^\n]*firestore:rules[^\n]*--project\s+sidokter-soegiri/,
    'Production deploy must publish firestore:rules together with the app so GitHub rules cannot drift from production.'
  );
});

test('named SIDOKTER Firestore database is explicitly bound to firestore.rules', () => {
  assert.match(firebaseConfig, /"database"\s*:\s*"ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3"/);
  assert.match(firebaseConfig, /"rules"\s*:\s*"firestore\.rules"/);
});

test('system_config remains admin-only for writes while authenticated users may read', () => {
  assert.match(
    rules,
    /match \/system_config\/\{configId\}\s*\{\s*allow read:\s*if signedIn\(\);\s*allow write:\s*if isAdmin\(\);\s*\}/s,
    'Do not fix production by opening system_config writes to every signed-in user.'
  );
});

test('users collection remains admin-only for mutations', () => {
  assert.match(
    rules,
    /match \/users\/\{userId\}\s*\{\s*allow read:\s*if signedIn\(\);\s*allow create, update, delete:\s*if isAdmin\(\);\s*\}/s
  );
});
