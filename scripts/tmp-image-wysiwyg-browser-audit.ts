import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { DOMParser as LinkedomDOMParser } from 'linkedom';
import { extractProcedureBlocks } from '../src/utils/canonicalA4Pagination';

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

const widths = [25, 50, 75, 100];
const fragments = widths.map((width) => {
  const html = [
    `<div class="figure-wrapper figure-wrap-top-bottom" data-wrap="top-bottom" data-width="${width}%" data-align="center"`,
    ` style="display:block;margin:12px auto;text-align:center;max-width:${width}%;width:${width}%;clear:both;position:relative">`,
    '<img alt="" style="width:100%;height:auto;display:inline-block">',
    '</div>',
  ].join('');
  const blocks = extractProcedureBlocks(html);
  assert.equal(blocks.length, 1, `${width}% must stay a single canonical block`);
  return `<div class="host" data-expected="${width}">${blocks[0]}</div>`;
});

const executable = [
  process.env.CHROME_BIN,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
].filter((value): value is string => Boolean(value)).find(existsSync);
assert.ok(executable, 'Chromium/Chrome executable is required for the WYSIWYG geometry audit');

const browser = await puppeteer.launch({
  executablePath: executable,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; }
    .host { width: 400px; margin: 10px 0; padding: 0; }
  </style></head><body>${fragments.join('')}</body></html>`);

  const results = await page.$$eval('.host', (hosts) => hosts.map((host) => {
    const figure = host.querySelector<HTMLElement>('.figure-wrapper');
    if (!figure) return null;
    const hostRect = (host as HTMLElement).getBoundingClientRect();
    const figureRect = figure.getBoundingClientRect();
    return {
      expected: Number((host as HTMLElement).dataset.expected),
      actualPercent: (figureRect.width / hostRect.width) * 100,
      dataWidth: figure.dataset.width,
      dataAlign: figure.dataset.align,
      wrap: figure.dataset.wrap,
    };
  }));

  console.log(JSON.stringify(results, null, 2));
  assert.equal(results.length, widths.length);
  for (const result of results) {
    assert.ok(result, 'figure wrapper must survive canonical render');
    assert.ok(Math.abs(result.actualPercent - result.expected) < 0.25,
      `${result.expected}% authored width rendered as ${result.actualPercent}%`);
    assert.equal(result.dataWidth, `${result.expected}%`);
    assert.equal(result.dataAlign, 'center');
    assert.equal(result.wrap, 'top-bottom');
  }
  console.log('Chromium image WYSIWYG geometry PASS');
} finally {
  await browser.close();
}
