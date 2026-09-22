'use strict';

// Keep every existing Firebase Function export intact, then add the V2
// Master Hirarki endpoint without rewriting the large legacy index module.
Object.assign(exports, require('./index'));
exports.hierarchyApiV2 = require('./hierarchyApiV2').hierarchyApiV2;
