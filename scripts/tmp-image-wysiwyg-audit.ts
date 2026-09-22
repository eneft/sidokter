import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  extractProcedureBlocks,
  isAtomicMediaHtml,
} from '../src/utils/canonicalA4Pagination';

const { window } = parseHTML('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  DOMParser: window.DOMParser,
  // canonicalA4Pagination only needs the DOM nodeType constants here.
  // linkedom's exported Node constructor does not expose them consistently.
  Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
});

const authored = [
  '<div class="my-3 figure-wrapper figure-wrap-top-bottom cursor-pointer select-none"',
  ' data-wrap="top-bottom" data-width="25%" data-align="left" contenteditable="false"',
  ' style="display:block;margin:12px auto 12px 0;text-align:left;max-width:25%;width:25%;clear:both;position:relative">',
  '<img src="data:image/png;base64,iVBORw0KGgo=" data-local-image="true"',
  ' style="width:100%;height:auto;display:inline-block">',
  '</div><p><br></p>',
].join('');

const blocks = extractProcedureBlocks(authored);
console.log(JSON.stringify(blocks, null, 2));

assert.equal(blocks.length, 1, 'empty spacer paragraph must not create a second flow block');
assert.match(blocks[0], /class="[^"]*figure-wrapper/, 'canonical flow must preserve the authored image wrapper');
assert.match(blocks[0], /data-width="25%"/, 'canonical flow must preserve authored image width metadata');
assert.match(blocks[0], /data-align="left"/, 'canonical flow must preserve authored image alignment metadata');
assert.match(blocks[0], /max-width:\s*25%/, 'canonical flow must preserve the authored wrapper width style');
assert.equal(isAtomicMediaHtml(blocks[0]), true, 'preserved image wrapper must be classified as atomic media');

console.log('Live SPO image WYSIWYG contract PASS');
