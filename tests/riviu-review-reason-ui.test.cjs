'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'src/components/UserView.tsx'), 'utf8');

test('Riviu submit reconciles visible review reason and persists it', () => {
  assert.match(source, /const reviewReasonRef = useRef<HTMLTextAreaElement>\(null\)/);
  assert.match(source, /const reviewReasonFromDom = String\(reviewReasonRef\.current\?\.value \|\| ''\)\.trim\(\)/);
  assert.match(source, /if \(!normalizedReviewReason\)/);
  assert.match(source, /reviewReason: isReview \? normalizedReviewReason : undefined/);
});

test('Riviu reason input clears stale validation feedback', () => {
  assert.match(source, /ref=\{reviewReasonRef\}/);
  assert.match(source, /name="reviewReason"/);
  assert.match(source, /submitError\?\.includes\('Alasan Riviu'\)/);
});
