'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'src', 'lib', 'sopReviewService.ts'), 'utf8');
const mailClient = fs.readFileSync(path.join(root, 'src', 'lib', 'notificationService.ts'), 'utf8');
const firebase = fs.readFileSync(path.join(root, 'src', 'lib', 'firebase.ts'), 'utf8');
const firestoreClient = fs.readFileSync(path.join(root, 'src', 'lib', 'firestoreService.ts'), 'utf8');
const applet = JSON.parse(fs.readFileSync(path.join(root, 'firebase-applet-config.json'), 'utf8'));
const rc = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));

assert.equal(applet.projectId, 'sidokter-soegiri', 'frontend Firebase project must be authoritative project');
assert.equal(rc.projects.default, 'sidokter-soegiri', 'Firebase CLI default must be authoritative project');
assert.equal(config.firestore[0].database, applet.firestoreDatabaseId, 'Admin and client must use configured named database');
assert.match(source, /exports\.sopReviewWorkflow\s*=\s*onCall\(\{\s*region:\s*'asia-southeast2'/, 'callable export/region mismatch');
assert.match(client, /httpsCallable\(functions,\s*'sopReviewWorkflow'\)/, 'client callable name mismatch');
assert.match(source, /exports\.replyInternalMail\s*=\s*onCall\(\{\s*region:\s*'asia-southeast2'/, 'mail callable export/region mismatch');
assert.match(mailClient, /httpsCallable\(functions,\s*'replyInternalMail'\)/, 'mail client callable name mismatch');
assert.match(firebase, /getFunctions\(app,\s*'asia-southeast2'\)/, 'client Functions region mismatch');
assert.match(source, /exports\.updateSopNumber\s*=\s*onCall\(\{\s*region:\s*'asia-southeast2'/, 'SOP number callable export/region mismatch');
assert.match(firestoreClient, /httpsCallable\(functions,\s*'updateSopNumber'\)/, 'SOP number client callable name mismatch');

console.log('Functions verification passed: sidokter-soegiri / asia-southeast2 / sopReviewWorkflow / updateSopNumber');
