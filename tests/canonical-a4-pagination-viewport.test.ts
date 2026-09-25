import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  buildOfficialBlocks,
  computeCanonicalA4Pages,
  getCanonicalSectionRowChromePx,
  LIVE_SOP_SECTION_MIN_HEIGHT_PX,
  type OfficialBlock,
} from '../src/utils/canonicalA4Pagination';

const installDeterministicLayout = () => {
  const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
  class FixtureDOMParser {
    parseFromString(html: string) {
      return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
    }
  }
  Object.assign(globalThis, {
    window,
    document,
    DOMParser: FixtureDOMParser,
    Node: window.Node,
    NodeFilter: window.NodeFilter,
  });

  Object.defineProperty(window.HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const itemCount = this.querySelectorAll('li').length;
      const paragraphCount = this.querySelectorAll('p').length;
      const ownText = (this.textContent || '').trim();
      const height = itemCount > 0
        ? itemCount * 44 + 8
        : paragraphCount > 0
          ? paragraphCount * 30
          : ownText ? 24 : 0;
      return { x: 0, y: 0, top: 0, right: 440, bottom: height, left: 0, width: 440, height, toJSON() {} };
    },
  });
  return window;
};

const pageHeight = (page: OfficialBlock[]) => {
  let total = 0;
  let section: OfficialBlock['section'] | null = null;
  let raw = 0;
  for (const block of page) {
    const root = document.createElement('div');
    root.innerHTML = block.html;
    const next = root.getBoundingClientRect().height;
    const starts = section !== block.section;
    total += starts
      ? Math.max(LIVE_SOP_SECTION_MIN_HEIGHT_PX, next) + getCanonicalSectionRowChromePx()
      : Math.max(LIVE_SOP_SECTION_MIN_HEIGHT_PX, raw + next) - Math.max(LIVE_SOP_SECTION_MIN_HEIGHT_PX, raw);
    raw = starts ? next : raw + next;
    section = block.section;
  }
  return total;
};

test('CRYOTHERAPY long PROSEDUR has identical safe A4 boundaries on desktop and mobile', () => {
  const window = installDeterministicLayout();
  const steps = Array.from({ length: 36 }, (_, index) =>
    `<li>CRYOTHERAPY-${String(index + 1).padStart(2, '0')} tindakan lengkap tanpa teks hilang</li>`
  ).join('');
  const blocks = buildOfficialBlocks({
    pengertian: '<p>Definisi cryotherapy.</p>',
    tujuan: '<p>Tujuan pelayanan.</p>',
    kebijakan: '<p>Kebijakan pelayanan.</p>',
    prosedur: `<ol start="1">${steps}</ol>`,
    alur: '',
    unitTerkait: '<p>Unit Rawat Jalan.</p>',
  });
  const metrics = { headerHeightPx: 180, publicationHeightPx: 90 };
  const probe = document.createElement('div');
  probe.innerHTML = `<ol>${steps}</ol>`;
  assert.ok(probe.getBoundingClientRect().height > 1500, 'layout fixture must measure the long list');
  assert.match(blocks.map((block) => block.html).join(''), /CRYOTHERAPY-36/);

  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  const desktop = computeCanonicalA4Pages(blocks, metrics);
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  const mobile = computeCanonicalA4Pages(blocks, metrics);

  assert.deepEqual(mobile, desktop, 'viewport width must not alter physical A4 page boundaries');
  assert.ok(desktop.length >= 2, `fixture must exercise multiple physical pages (got ${desktop.length})`);

  const allHtml = desktop.flat().map((block) => block.html).join('');
  for (let index = 1; index <= 36; index += 1) {
    const marker = `CRYOTHERAPY-${String(index).padStart(2, '0')}`;
    assert.equal(allHtml.split(marker).length - 1, 1, `${marker} must occur exactly once`);
  }

  const starts = desktop.flatMap((page) => page.flatMap((block) => {
    const root = document.createElement('div');
    root.innerHTML = block.html;
    return Array.from(root.querySelectorAll('ol')).map((list) => Number(list.getAttribute('start') || '1'));
  }));
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  assert.equal(new Set(starts).size, starts.length, 'ordered-list continuation must not reset');

  const safeHeight = (297 - 40) * 96 / 25.4;
  desktop.forEach((page, index) => {
    const capacity = safeHeight - metrics.headerHeightPx - (index === 0 ? metrics.publicationHeightPx : 0);
    assert.ok(pageHeight(page) <= capacity + 0.01, `page ${index + 1} must fit its physical safe-area`);
  });
});
