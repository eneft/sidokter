import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser as LinkedomDOMParser } from 'linkedom';
import { normalizeOrderedListContinuityAroundTables } from '../src/utils/canonicalA4Pagination';

const parseBody = (html: string): HTMLElement => {
  const doc = new LinkedomDOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html'
  );
  return doc.body as unknown as HTMLElement;
};

test('ordered numbering continues only when a table interrupts one authored list', () => {
  const body = parseBody(
    '<ol><li>Satu</li><li>Dua</li></ol>' +
    '<table><tbody><tr><td>Tabel</td></tr></tbody></table>' +
    '<p><br></p>' +
    '<ol><li>Tiga</li><li>Empat</li></ol>'
  );

  normalizeOrderedListContinuityAroundTables(body);
  const lists = body.querySelectorAll('ol');
  assert.equal(lists.length, 2);
  assert.equal(lists[0].getAttribute('start'), null);
  assert.equal(lists[1].getAttribute('start'), '3');
  assert.equal((lists[1] as HTMLElement).style.getPropertyValue('--sop-start-offset'), '2');
});

test('adjacent ordered lists without an inserted table stay independent', () => {
  const body = parseBody(
    '<ol><li>Satu</li><li>Dua</li></ol>' +
    '<p><br></p>' +
    '<ol><li>Daftar baru</li></ol>'
  );

  normalizeOrderedListContinuityAroundTables(body);
  const lists = body.querySelectorAll('ol');
  assert.equal(lists[1].getAttribute('start'), null);
  assert.equal((lists[1] as HTMLElement).style.getPropertyValue('--sop-start-offset'), '0');
});

test('meaningful prose terminates numbering continuity even if a table follows', () => {
  const body = parseBody(
    '<ol start="4"><li>Empat</li><li>Lima</li></ol>' +
    '<p>Paragraf baru yang memutus daftar.</p>' +
    '<table><tbody><tr><td>Tabel</td></tr></tbody></table>' +
    '<ol><li>Daftar baru</li></ol>'
  );

  normalizeOrderedListContinuityAroundTables(body);
  const lists = body.querySelectorAll('ol');
  assert.equal(lists[0].getAttribute('start'), '4');
  assert.equal(lists[1].getAttribute('start'), null);
  assert.equal((lists[1] as HTMLElement).style.getPropertyValue('--sop-start-offset'), '0');
});

test('explicit list item value survives a table interruption', () => {
  const body = parseBody(
    '<ol start="4"><li>Empat</li><li value="9">Sembilan</li></ol>' +
    '<table><tbody><tr><td>Lampiran</td></tr></tbody></table>' +
    '<ol><li>Sepuluh</li></ol>'
  );
  normalizeOrderedListContinuityAroundTables(body);
  const lists = body.querySelectorAll('ol');
  assert.equal(lists[1].getAttribute('start'), '10');
  assert.equal((lists[1] as HTMLElement).style.getPropertyValue('--sop-start-offset'), '9');
});

test('numbering style change after a table starts a new sequence', () => {
  const body = parseBody(
    '<ol type="1"><li>Angka</li><li>Angka</li></ol>' +
    '<table><tbody><tr><td>Lampiran</td></tr></tbody></table>' +
    '<ol type="a"><li>Huruf</li></ol>'
  );
  normalizeOrderedListContinuityAroundTables(body);
  const lists = body.querySelectorAll('ol');
  assert.equal(lists[1].getAttribute('start'), null);
  assert.equal((lists[1] as HTMLElement).style.getPropertyValue('--sop-start-offset'), '0');
});

test('matching alphabetical lists continue across a table', () => {
  const body = parseBody(
    '<ol type="a"><li>Huruf a</li><li>Huruf b</li></ol>' +
    '<table><tbody><tr><td>Lampiran</td></tr></tbody></table>' +
    '<ol type="a"><li>Huruf c</li></ol>'
  );
  normalizeOrderedListContinuityAroundTables(body);
  const lists = body.querySelectorAll('ol');
  assert.equal(lists[1].getAttribute('start'), '3');
});
