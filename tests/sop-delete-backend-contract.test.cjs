const fs = require('fs');
const path = require('path');

const client = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'firestoreService.ts'), 'utf8');
const helper = fs.readFileSync(path.join(__dirname, '..', 'functions', 'sopDelete.js'), 'utf8');

if (!client.includes("callAuthenticatedAuthApi('sop-delete', { sopId: id })")) {
  throw new Error('deleteSopFromFirestore must route through trusted authApi sop-delete action');
}
if (!helper.includes("tx.delete(sopRef)")) {
  throw new Error('backend delete helper must delete eligible draft atomically');
}
if (!helper.includes("reusableSequences")) {
  throw new Error('backend delete helper must return released sequence to reusable queue');
}
if (!helper.includes("reservation.status === 'USED'")) {
  throw new Error('backend delete helper must only release matching consumed reservations');
}
console.log('SOP delete backend contract OK');
