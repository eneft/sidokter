const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('src/App.tsx', 'utf8');
const service = fs.readFileSync('src/lib/notificationService.ts', 'utf8');

test('automatic periodic review notification producers are disabled', () => {
  assert.equal(app.includes('scanDocumentsForPeriodicReviews('), false);
  assert.equal(app.includes("dispatchDocumentEvent('review'"), false);
  assert.equal(service.includes('EVENT 4: PERIODIC REVIEW ALERT'), false);
  assert.equal(service.includes("title: 'Perlu Riviu Berkala'"), false);
});

test('legacy document events cannot create mailbox records on the client', () => {
  assert.match(service, /export function dispatchDocumentEvent/);
  assert.match(service, /sole producer of official workflow mailbox records/);
  assert.doesNotMatch(service, /queuePendingAdminProposal/);
});
