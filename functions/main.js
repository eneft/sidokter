'use strict';

// Keep every existing Firebase Function export intact, then add the V2
// Master Hirarki endpoint and trusted SPO numbering boundary without rewriting
// the large legacy index module.
Object.assign(exports, require('./index'));
exports.hierarchyApiV2 = require('./hierarchyApiV2').hierarchyApiV2;
exports.allocateSopNumber = require('./sopNumberAllocator').allocateSopNumber;

// Server-authoritative mailbox workflow. This overrides the legacy client-authored
// notification callable and adds backend lifecycle/cleanup functions.
const mailboxWorkflow = require('./mailboxWorkflow');
exports.createNotification = mailboxWorkflow.createNotificationBlocked;
exports.clearNotificationMailbox = mailboxWorkflow.clearNotificationMailbox;
exports.sopMailboxWorkflow = mailboxWorkflow.sopMailboxWorkflow;
