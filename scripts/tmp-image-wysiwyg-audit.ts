import assert from 'node:assert/strict';
import { DOMParser as LinkedomDOMParser } from 'linkedom';
import {
  extractProcedureBlocks,
  isAtomicMediaHtml,
} from '../src/utils/canonicalA4Pagination';

class BrowserLikeDOMParser {
  parseFromString(source: string, _type: DOMParserSupportedType): Document {
    return new LinkedomDOMParser().parseFromString(
      `<!doctype html><html><body>${source}</body></html>`,
      'text/html',
    ) as unknown as Document;
  }
}

Object.assign(globalThis, {
  DOMParser: BrowserLikeDOMParser,
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

const sanityDoc = new BrowserLikeDOMParser().parseFromString(authored, 'text/html');
assert.equal(sanityDoc.body.querySelectorAll('img').length, 1, 'parser sanity: authored image must be parsed');
assert.equal(sanityDoc.body.querySelectorAll('.figure-wrapper').length, 1, 'parser sanity: wrapper must be parsed');

const blocks = extractProcedureBlocks(authored);
console.log(JSON.stringify(blocks, null, 2));

assert.equal(blocks.length, 1, 'empty spacer paragraph must not create a second flow block');
assert.match(blocks[0], /class="[^"]*figure-wrapper/, 'canonical flow must preserve the authored image wrapper');
assert.match(blocks[0], /data-width="25%"/, 'canonical flow must preserve authored image width metadata');
assert.match(blocks[0], /data-align="left"/, 'canonical flow must preserve authored image alignment metadata');
assert.match(blocks[0], /max-width:\s*25%/, 'canonical flow must preserve the authored wrapper width style');
assert.equal(isAtomicMediaHtml(blocks[0]), true, 'preserved image wrapper must be classified as atomic media');

console.log('Live SPO image WYSIWYG contract PASS');
