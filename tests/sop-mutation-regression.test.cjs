'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const indexSource = fs.readFileSync('functions/index.js', 'utf8');
const rulesSource = fs.readFileSync('firestore.rules', 'utf8');
const mainSource = fs.readFileSync('src/main.tsx', 'utf8');
const sopServiceSource = fs.readFileSync('src/lib/sopService.ts', 'utf8');
const sopServiceSource = fs.readFileSync('src/lib/sopService.ts', 'utf8');

test('trusted sop-edit keeps storedRaw in transaction scope', () => {
  const blockStart = indexSource.indexOf("if (action === 'sop-edit')");
  const blockEnd = indexSource.indexOf("if (action === 'sop-delete')");
  assert.ok(blockStart >= 0 && blockEnd > blockStart, 'sop-edit block must exist');
  const block = indexSource.slice(blockStart, blockEnd);
  assert.match(block, /let storedRaw;/);
  assert.match(block, /storedRaw = \{ id: snapshot\.id, \.\.\.snapshot\.data\(\) \};/);
  assert.doesNotMatch(block, /const storedRaw = \{ id: snapshot\.id/);
  assert.match(block, /resultingSop = \{ \.\.\.storedRaw, \.\.\.next \};/);
});

test('SPO delete uses creator identity, not hierarchy read authorization', () => {
  const blockStart = indexSource.indexOf("if (action === 'sop-delete')");
  const blockEnd = indexSource.indexOf("if (action === 'migrate-sop-access')");
  assert.ok(blockStart >= 0 && blockEnd > blockStart, 'sop-delete block must exist');
  const block = indexSource.slice(blockStart, blockEnd);
  assert.match(block, /creatorUid && userUid && creatorUid === userUid/);
  assert.match(block, /createdBy && actorUsername && createdBy === actorUsername/);
  assert.doesNotMatch(block, /authorizedUids[^\n]*includes\(userUid\)/);
  assert.match(block, /wasEverActive && !isAdmin/);
});

test('privileged numbering writes remain fail-closed in Firestore Rules', () => {
  assert.match(rulesSource, /match \/system_config\/\{configId\}[\s\S]*?allow write: if isAdmin\(\);/);
  assert.doesNotMatch(rulesSource, /configId\.matches\('\^spo_sequence_/);
  assert.match(rulesSource, /match \/sop_number_reservations\/\{reservationId\}[\s\S]*?allow delete: if isAdmin\(\);/);
});

test('Firebase Auth is restored before React mounts', () => {
  assert.match(mainSource, /restoreFirebaseAuthBeforeRender/);
  assert.match(mainSource, /await refreshUserSessionProfile\(persistedSession\)/);
});


test('activation preparation is asset-only before trusted lifecycle commit', () => {
  assert.match(sopServiceSource, /const isActivationPreparation = Boolean\(/);
  assert.match(sopServiceSource, /if \(isActivationPreparation\) \{\s*return next;\s*\}/);
  const prepIndex = sopServiceSource.indexOf('const isActivationPreparation');
  const authoritativeSaveIndex = sopServiceSource.indexOf('const saved = options?.editActor', prepIndex);
  assert.ok(prepIndex >= 0 && authoritativeSaveIndex > prepIndex, 'activation preparation must return before authoritative edit save');
});
