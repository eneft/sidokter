// Browser-level geometry regression using actual Vite-built CSS and Bookman font.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const paginatorBundle = require('esbuild').buildSync({
  entryPoints: [path.resolve(__dirname, '..', 'src/utils/canonicalA4Pagination.ts')],
  bundle: true, platform: 'browser', format: 'iife',
  globalName: 'SopA4Pagination', write: false
}).outputFiles[0].text;

const liveBundle = require('esbuild').buildSync({
  entryPoints: [path.resolve(__dirname, 'fixtures/live-spo-browser.tsx')],
  bundle: true, platform: 'browser', format: 'iife', write: false,
  define: { 'process.env.NODE_ENV': '"production"' }
}).outputFiles[0].text;

const dist = path.resolve(__dirname, '..', 'dist');
const css = fs.readdirSync(path.join(dist, 'assets')).filter(f => f.endsWith('.css'))
  .sort((a, b) => fs.statSync(path.join(dist, 'assets', b)).size -
                  fs.statSync(path.join(dist, 'assets', a)).size)[0];
assert.ok(css, 'Compile Vite CSS before running the A4 browser check.');

const text = [
  '<p><strong>A. Ruang Bayi Neonatus</strong></p>',
  '<ol type="1" data-sop-list-format="1"><li>Akses masuk ruang Neonatus',
  '<ol type="a" data-sop-list-format="a">',
  '<li>Pintu ruang Neonatus harus selalu terkunci sesuai peraturan keselamatan pasien.</li>',
  '<li>Setiap orang kecuali petugas dan orang tua kandung bayi dilarang masuk ke dalam ruang bayi.</li>',
  '<li value="7" data-sop-manual-number="7" style="--sop-manual-number:7">Orang tua menjalani pemeriksaan identitas sebelum memasuki ruangan.</li>',
  '<li>Ketentuan keamanan tambahan juga berlaku bagi pengunjung yang memerlukan pendampingan.</li>',
  '</ol></li></ol><ul data-sop-bullet="square"><li>Petugas memastikan seluruh pintu aman setiap pergantian jaga.</li></ul>',
  '<p>Prosedur pengamanan harus dilaksanakan secara tertib dan konsisten setiap hari.</p>',
  '<img src="/__image.svg" width="500" height="420" alt="Petunjuk operasional">'
].join('');
const title = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/' + css + '">';
const localStyle = '<style>body{margin:0}.fixture{display:flex;gap:24px;padding:20px;align-items:flex-start}' +
  '.fixture .sop-batang-tubuh-content{width:122.4mm;box-sizing:border-box;border:1px solid #000;padding:3mm}</style>';
const html = title + localStyle + '</head><body><div class="fixture">' +
  '<section class="sop-batang-tubuh-content font-bookman">' +
  '<div id="live" contenteditable="true" class="rich-text-editor-content sop-a4-rich-body font-bookman">' + text + '</div></section>' +
  '<div id="printable-sop-official-document"><section class="sop-batang-tubuh-content font-bookman">' +
  '<div id="preview" class="rich-text-output rich-text-document-content sop-a4-rich-body font-bookman">' + text + '</div></section></div>' +
  '</div><script src="/__paginator.js"></script></body></html>';

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/__a4') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
  }
  if (pathname === '/__live.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    res.end(liveBundle); return;
  }
  if (pathname === '/__paginator.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    res.end(paginatorBundle);
    return;
  }
  if (pathname === '/__image.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="420"><rect width="500" height="420" fill="#ccc"/></svg>');
    return;
  }
  const file = path.resolve(dist, '.' + pathname);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.otf') ? 'font/otf' :
    file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(file).pipe(res);
});

async function snapshot(page) {
  return page.evaluate(() => {
    const get = (id) => {
      const root = document.getElementById(id);
      const origin = root.getBoundingClientRect();
      return {
        width: origin.width, height: origin.height,
        nestedListPadding: parseFloat(getComputedStyle(root.querySelector('ol[type="a"]')).paddingLeft),
        parts: [...root.querySelectorAll('p, ol > li, ul > li, img')].map(node => {
          const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
          return {
            tag: node.tagName, x: rect.left - origin.left, y: rect.top - origin.top,
            w: rect.width, h: rect.height, font: style.fontFamily,
            size: style.fontSize, line: style.lineHeight,
            marginTop: style.marginTop, marginBottom: style.marginBottom
          };
        })
      };
    };
    return [get('live'), get('preview')];
  });
}

function compare(data, medium) {
  const [live, preview] = data;
  const near = (a, b, name, tol=1) =>
    assert.ok(Math.abs(a - b) <= tol, medium + ' ' + name + ': Live=' + a + ', Preview=' + b);
  // The real readonly Preview lives under #printable-sop-official-document.
  // Its nested a./b./c. list must retain exactly the same positive indent
  // as contentEditable; a broad official-cell OL reset used to erase it.
  const nestedLive = live.nestedListPadding;
  const nestedPreview = preview.nestedListPadding;
  near(nestedLive, nestedPreview, 'nested alpha list left padding', 0.25);
  assert.ok(nestedPreview >= 20, medium + ': child letters must be indented relative to the parent number');
  near(live.width, preview.width, 'body width');
  assert.equal(live.parts.length, preview.parts.length, medium + ' HTML block count');
  live.parts.forEach((a, i) => {
    const b = preview.parts[i];
    assert.equal(a.tag, b.tag, medium + ' tag ' + i);
    for (const prop of ['font', 'size', 'line'])
      assert.equal(a[prop], b[prop], medium + ' ' + prop + ' ' + i);
    for (const prop of ['x', 'y', 'w', 'h'])
      near(a[prop], b[prop], prop + ' element ' + i, 2);
  });
  near(live.height, preview.height, 'total body height', 2);
  const image = live.parts.at(-1);
  assert.equal(image.tag, 'IMG');
  assert.ok(image.h <= 281, medium + ' image exceeds canonical 280px display cap');
  console.log('A4 ' + medium + ': PASS, ' + live.parts.length + ' blocks, height=' + live.height.toFixed(1) + 'px');
}

async function main() {
  const chrome = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium']
    .find(x => x && fs.existsSync(x));
  assert.ok(chrome, 'Chromium/Chrome required to verify actual A4 geometry');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1100, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:' + server.address().port + '/__a4', { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => Promise.all([...document.images].map(img => img.complete
      ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; }))));
    const screen = await snapshot(page);
    compare(screen, 'screen');
    await page.emulateMediaType('print');
    const printed = await snapshot(page);
    compare(printed, 'print/PDF');
    // A4 content must not reflow on export. The physical page-break engine
    // operates on screen CSS geometry; PDF must preserve those same positions.
    const screenPreview = screen[1], printPreview = printed[1];
    console.log('A4 screen/print deltas:',
      screenPreview.parts.map((part, i) => {
        const other = printPreview.parts[i];
        return {
          index: i, tag: part.tag,
          dy: Number((other.y - part.y).toFixed(2)),
          dh: Number((other.h - part.h).toFixed(2)),
          marginScreen: [part.marginTop, part.marginBottom],
          marginPrint: [other.marginTop, other.marginBottom]
        };
      }).filter(part => Math.abs(part.dy) > 0.1 || Math.abs(part.dh) > 0.1 ||
        String(part.marginScreen) !== String(part.marginPrint)));
    const near = (a, b, label) =>
      assert.ok(Math.abs(a - b) <= 1, 'screen/print mismatch ' + label + ': ' + a + ' vs ' + b);
    near(screenPreview.width, printPreview.width, 'body width');
    near(screenPreview.height, printPreview.height, 'body height');
    screenPreview.parts.forEach((part, i) => {
      const other = printPreview.parts[i];
      for (const prop of ['x', 'y', 'w', 'h'])
        near(part[prop], other[prop], 'element ' + i + ' ' + prop);
    });
    console.log('A4 screen-to-PDF geometry: PASS');
    await page.emulateMediaType('screen');
    const paginationCases = await page.evaluate(() => {
      const pager = window.SopA4Pagination;
      const subitems = [
        'Petugas keamanan di RSUD Dr. Soegiri Lamongan melakukan pemantauan terhadap ruang Neonatus dan ruang tunggu setiap pergantian jaga.',
        'Akses masuk ruang Neonatus dilakukan pemantauan 24 jam menggunakan CCTV dan dicatat petugas keamanan.',
        'Koridor ruang bayi dilengkapi titik pemeriksaan dan setiap pengunjung harus diverifikasi identitasnya.',
        'Setiap kejadian keamanan dalam ruang bayi dilaporkan secara berjenjang kepada atasan dan manajemen rumah sakit.'
      ];
      const nested = '<ol type="1" start="2"><li>Pemantauan oleh petugas keamanan<ol type="a" data-sop-list-format="a">' +
        subitems.map(x => '<li>' + x + '</li>').join('') + '</ol></li></ol>';
      const separate = '<ol type="a" data-sop-list-format="a">' +
        subitems.map(x => '<li>' + x + '</li>').join('') + '</ol>';
      const cases = {};
      for (const cap of [135, 190, 250, 325]) {
        const variants = [
          ['nested', nested],
          ['separate', separate],
          ['wrappedNested', '<div>' + nested + '</div>'],
          ['wrappedSeparate', '<div><p>2. Pemantauan oleh petugas keamanan</p>' + separate + '</div>'],
          ['adjacent', '<p>2. Pemantauan oleh petugas keamanan</p>' + separate],
          ['nestedInsideP', '<div><p>2. Pemantauan oleh petugas keamanan</p><div>' + separate + '</div></div>'],
          ['tableWrapped', '<table><tbody><tr><td>' + separate + '</td></tr></tbody></table>']
        ];
        for (const [name, source] of variants) {
          const parts = pager.splitHtmlForCapacity(source, cap, null);
          const summaries = parts.map((html) => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const host = pager.createMeasureHost();
            host.innerHTML = html;
            const height = host.getBoundingClientRect().height;
            host.remove();
            return { height: Number(height.toFixed(1)), nAlpha: doc.body.querySelectorAll('ol[type="a"] > li').length,
              nParent: doc.body.querySelectorAll('ol[type="1"] > li').length, text: doc.body.textContent.slice(0, 90) };
          });
          cases[name + ':' + cap] = summaries;
        }
      }
      return cases;
    });
    console.log('A4 nested-list page-break diagnostics:', JSON.stringify(paginationCases));
    const layoutTable = paginationCases['tableWrapped:135'];
    assert.ok(layoutTable.length > 1 && layoutTable[0].nAlpha >= 1,
      'A4: split a one-cell Word layout table and keep nested alpha lines on the current page');
    assert.ok(layoutTable[0].height <= 135,
      'A4: the first table fragment must fit the available physical height');
    const wrappedIntegrity = await page.evaluate(() => {
      const src = '<table class="word-layout" style="width:100%;border:0"><tbody><tr><td style="padding:4px">' +
        '<ol type="a" data-sop-list-format="a">' +
        '<li>Petugas keamanan melakukan pemeriksaan pada ruang Neonatus dan ruang tunggu setiap pergantian jaga.</li>' +
        '<li value="7" data-sop-manual-number="7" style="--sop-manual-number:7">Akses masuk ruang Neonatus dilakukan pemantauan dua puluh empat jam menggunakan kamera CCTV dan daftar pengunjung.</li>' +
        '<li>Koridor ruang bayi diperiksa dan dilaporkan kepada koordinator apabila ada kondisi tidak aman.</li>' +
        '</ol></td></tr></tbody></table>';
      window.__wordTableListFixture = src;
      const fragments = window.SopA4Pagination.splitHtmlForCapacity(src, 140, null);
      const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
      const text = (html) => parse(html).body.textContent;
      const values = fragments.flatMap(html => [...parse(html).querySelectorAll('li[value]')]
        .map(li => ({ value: li.getAttribute('value'), manual: li.getAttribute('data-sop-manual-number') })));
      const sizes = fragments.map(html => {
        const host = window.SopA4Pagination.createMeasureHost();
        host.innerHTML = html;
        const height = host.getBoundingClientRect().height;
        host.remove();
        return Number(height.toFixed(2));
      });
      return {
        parts: fragments.length,
        sameText: fragments.map(text).join('') === text(src),
        allTables: fragments.every(html => parse(html).querySelectorAll('table > tbody > tr > td').length === 1),
        manualPreserved: values.some(value => value.value === '7' && value.manual === '7'),
        sizes
      };
    });
    const persistence = await page.evaluate(() => {
      const pager = window.SopA4Pagination;
      const source = window.__wordTableListFixture;
      const parts = pager.splitHtmlForCapacity(source, 140, null);
      // Reproduce LiveSPO: edit one displayed page, then save the logical section.
      parts[parts.length - 1] = parts.at(-1).replace('koordinator', 'koordinator jaga');
      const saved = pager.reassemblePaginatedSection
        ? pager.reassemblePaginatedSection(parts.join('')) : parts.join('');
      const doc = new DOMParser().parseFromString(saved, 'text/html');
      return { tables: doc.querySelectorAll('table').length,
        lists: doc.querySelectorAll('ol').length, items: doc.querySelectorAll('li').length,
        text: doc.body.textContent, expected: new DOMParser().parseFromString(source,
          'text/html').body.textContent.replace('koordinator', 'koordinator jaga'),
        artifacts: doc.querySelectorAll('[data-sop-table-continuation], [data-sop-continuation-li], [data-sop-rejoin]').length,
        manual: doc.querySelector('li[value="7"]')?.getAttribute('data-sop-manual-number') };
    });
    assert.equal(persistence.tables, 1, 'edit/save must restore one authored table');
    assert.equal(persistence.lists, 1, 'edit/save must restore one authored list');
    assert.equal(persistence.items, 3, 'edit/save must restore split LI text');
    assert.equal(persistence.text, persistence.expected, 'edit must survive reassembly');
    assert.equal(persistence.artifacts, 0, 'pagination metadata must not be saved');
    assert.equal(persistence.manual, '7', 'manual numbering must survive edit/save');
    console.log('A4 edit/save table roundtrip: PASS');
    const repeatSave = await page.evaluate(() => {
      const pager = window.SopA4Pagination;
      const original = window.__wordTableListFixture.replace('<tbody>', '\n<tbody>\n').replace('</tr>', '</tr>\n').replace('</tbody>', '</tbody>\n');
      let saved = original;
      for (let cycle = 0; cycle < 3; cycle++) {
        const blocks = pager.computeCanonicalA4Pages([{ id:'table', section:'PROSEDUR', html:saved }],
          {headerHeightPx:850, publicationHeightPx:0, safetyBufferPx:24});
        saved = pager.reassemblePaginatedSection(blocks.flat().map(b=>b.html).join(''));
      }
      const parse = s => new DOMParser().parseFromString(s, 'text/html');
      // Two different authored tables are NOT one continuation even if identical.
      const independent = pager.reassemblePaginatedSection([
        ...pager.splitHtmlForCapacity(original,140,null),
        ...pager.splitHtmlForCapacity(original,140,null)
      ].join(''));
      const parts = pager.splitHtmlForCapacity(original, 140, null);
      const edited = parse(parts.at(-1));
      const li = edited.querySelector('li');
      li.setAttribute('value','12'); li.setAttribute('data-sop-manual-number','12');
      const changed = edited.body.innerHTML;
      parts[parts.length-1] = changed;
      const manual = parse(pager.reassemblePaginatedSection(parts.join(''), changed));
      return { tables: parse(saved).querySelectorAll('table').length,
        items: parse(saved).querySelectorAll('li').length,
        sameText: parse(saved).body.textContent === parse(original).body.textContent,
        independent: parse(independent).querySelectorAll('table').length,
        manual: !!manual.querySelector('li[value="12"][data-sop-manual-number="12"]') };
    });
    assert.deepEqual(repeatSave, { tables:1, items:3, sameText:true, independent:2, manual:true });
    console.log('A4 repeated save/reopen and independent tables: PASS');

    const protectedTables = await page.evaluate(() => {
      const pager = window.SopA4Pagination;
      const alpha = '<ol type="a"><li>Pemeriksaan identitas dilakukan untuk setiap pengunjung rumah sakit.</li>' +
        '<li>Petugas wajib melaporkan potensi gangguan keamanan kepada koordinator.</li>' +
        '<li>Pemantauan CCTV dan jalur akses dilakukan setiap pergantian jaga.</li></ol>';
      const cases = {
        multiCell: '<table><tbody><tr><td>' + alpha + '</td><td>Kolom data lain</td></tr></tbody></table>',
        mediaCell: '<table><tbody><tr><td><img src="/__image.svg" width="500" height="420">' +
          alpha + '</td></tr></tbody></table>',
        nestedTable: '<table><tbody><tr><td><table><tbody><tr><td>Subtabel</td></tr></tbody></table>' +
          alpha + '</td></tr></tbody></table>',
        colspan: '<table><tbody><tr><td colspan="2">' + alpha + '</td></tr></tbody></table>',
        headerOnly: '<table><thead><tr><th>' + alpha + '</th></tr></thead></table>',
        footerOnly: '<table><tfoot><tr><td>' + alpha + '</td></tr></tfoot></table>'
      };
      const parts = {};
      for (const [name, html] of Object.entries(cases)) {
        parts[name] = pager.splitHtmlForCapacity(html, 90, null).length;
      }
      return parts;
    });
    console.log('A4 protected table structures:', protectedTables);
    for (const name of ['multiCell','mediaCell','nestedTable','colspan','headerOnly','footerOnly']) {
      assert.equal(protectedTables[name], 1,
        'A4: do not split protected ' + name + ' table internals');
    }
    console.log('A4 Word-wrapped numbering integrity:', wrappedIntegrity);
    assert.ok(wrappedIntegrity.parts > 1, 'single-cell list requires fragmentation');
    assert.ok(wrappedIntegrity.sameText, 'all authored text must survive table fragmentation');
    assert.ok(wrappedIntegrity.allTables, 'the original table/cell wrapper must survive each fragment');
    assert.ok(wrappedIntegrity.manualPreserved, 'manual LI[value] numbering must survive pagination');
    assert.ok(wrappedIntegrity.sizes[0] <= 140, 'first Word table fragment must fit the page budget');
    await page.emulateMediaType('print');
    const wrappedPrint = await page.evaluate(() => {
      const pager = window.SopA4Pagination;
      const source = window.__wordTableListFixture;
      const parts = pager.splitHtmlForCapacity(source, 140, null);
      const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
      const height = parts.map(html => {
        const host = pager.createMeasureHost();
        host.innerHTML = html;
        const value = host.getBoundingClientRect().height;
        host.remove();
        return Number(value.toFixed(2));
      });
      return {
        parts: parts.length,
        textPreserved:parts.map(h=>parse(h).body.textContent).join('')===parse(source).body.textContent,
        firstHeight:height[0]
      };
    });
    console.log('A4 Word-table print/PDF continuation:', wrappedPrint);
    assert.ok(wrappedPrint.parts > 1 && wrappedPrint.textPreserved,
      'print/PDF must split Word layout lists without dropping text');
    assert.ok(wrappedPrint.firstHeight <= 140,
      'print/PDF table fragment must fit the same physical page budget');
    await page.emulateMediaType('screen');

    const pagePacking = await page.evaluate(() => {
      const pager = window.SopA4Pagination;
      const alpha = '<ol type="a" data-sop-list-format="a">' +
        ['Petugas keamanan di RSUD Dr. Soegiri Lamongan melakukan pemantauan terhadap ruang Neonatus dan ruang tunggu.',
         'Akses masuk ruang Neonatus dilakukan pemantauan 24 jam menggunakan CCTV dan pemeriksaan oleh petugas.',
         'Koridor ruang bayi dilengkapi dengan titik pengawasan, catatan, dan pemeriksaan identitas setiap pengunjung.',
         'Petugas juga melakukan pelaporan berjenjang terhadap seluruh kejadian keamanan di area rawat inap.']
          .map(x => '<li>' + x + '</li>').join('') + '</ol>';
      const result = [];
      for (const fillerCount of [8, 12, 16, 20, 24]) {
        const blocks = [];
        for (let i = 0; i < fillerCount; i++) {
          blocks.push({id:'intro-'+i, section:'PROSEDUR',
            html:'<p>Petugas melakukan pemeriksaan serta pemantauan keamanan rumah sakit secara berkala dan terkoordinasi.</p>'});
        }
        blocks.push({id:'parent-2',section:'PROSEDUR',html:'<ol type="1" start="2"><li>Pemantauan Oleh petugas keamanan</li></ol>'});
        blocks.push({id:'children-a',section:'PROSEDUR',html:alpha});
        const pages = pager.computeCanonicalA4Pages(blocks, {headerHeightPx:125,publicationHeightPx:0,safetyBufferPx:24});
        const parentIndex=pages.findIndex(x=>x.some(y=>y.id==='parent-2'));
        const childIndex=pages.findIndex(x=>x.some(y=>y.id.startsWith('children-a')));
        const summaries=pages.map((p,i)=>({
          page:i+1,blocks:p.map(b=>b.id).slice(-5),
          childLi:p.filter(b=>b.id.startsWith('children-a')).reduce((n,b)=>{
            const d=new DOMParser().parseFromString(b.html,'text/html');return n+d.querySelectorAll('ol[type="a"] > li:not([data-sop-continuation-li])').length;
          },0)
        }));
        result.push({fillerCount,parentIndex,childIndex,summaries});
      }
      return result;
    });
    console.log('A4 complete pagination page-pack diagnostics:', JSON.stringify(pagePacking));
    const tablePagePacking = await page.evaluate(() => {
      const pager = window.SopA4Pagination;
      const alpha = '<ol type="a" data-sop-list-format="a">' +
        ['Petugas keamanan di RSUD Dr. Soegiri Lamongan melakukan pemantauan terhadap ruang Neonatus dan ruang tunggu.',
         'Akses masuk ruang Neonatus dilakukan pemantauan 24 jam menggunakan CCTV dan pemeriksaan oleh petugas.',
         'Koridor ruang bayi dilengkapi dengan titik pengawasan, catatan, dan pemeriksaan identitas setiap pengunjung.',
         'Petugas juga melakukan pelaporan berjenjang terhadap seluruh kejadian keamanan di area rawat inap.']
          .map(x => '<li>' + x + '</li>').join('') + '</ol>';
      const blocks = Array.from({length:8}, (_,i) => ({
        id:'intro-'+i, section:'PROSEDUR',
        html:'<p>Petugas melakukan pemeriksaan serta pemantauan keamanan rumah sakit secara berkala dan terkoordinasi.</p>'
      }));
      blocks.push({id:'parent-2', section:'PROSEDUR',
        html:'<ol type="1" start="2"><li>Pemantauan Oleh petugas keamanan</li></ol>'});
      blocks.push({id:'alpha-table', section:'PROSEDUR',
        html:'<table><tbody><tr><td>' + alpha + '</td></tr></tbody></table>'});
      const pages=pager.computeCanonicalA4Pages(blocks,
        {headerHeightPx:125,publicationHeightPx:0,safetyBufferPx:24});
      const parentPage=pages.findIndex(blocks => blocks.some(block => block.id==='parent-2'));
      const childOnParentPage=pages[parentPage]?.filter(block=>block.id.startsWith('alpha-table'))||[];
      const childCount=childOnParentPage.reduce((count,block)=>{
        const doc=new DOMParser().parseFromString(block.html,'text/html');
        return count+doc.querySelectorAll('ol[type="a"] > li:not([data-sop-continuation-li])').length;
      },0);
      const nextPageCount=pages.slice(parentPage+1).reduce((sum,p)=>sum+p
        .filter(b=>b.id.startsWith('alpha-table')).reduce((n,b)=>{
          const doc=new DOMParser().parseFromString(b.html,'text/html');
          return n+doc.querySelectorAll('ol[type="a"] > li').length;
        },0),0);
      const parseText = (html) => new DOMParser().parseFromString(html,'text/html').body.textContent || '';
      const sourceText = blocks.map(b=>parseText(b.html)).join('');
      const outputText = pages.flat().map(b=>parseText(b.html)).join('');
      const distinctAlphaItems = pages.flat().filter(b=>b.id.startsWith('alpha-table')).reduce((sum,b)=>{
        const doc=new DOMParser().parseFromString(b.html,'text/html');
        return sum+doc.querySelectorAll('ol[type="a"] > li:not([data-sop-continuation-li])').length;
      },0);
      return {parentPage:parentPage+1, childOnParentPage:childCount,
        nextPageCount, totalPages:pages.length,
        textPreserved:sourceText===outputText, distinctAlphaItems,
        idList:pages.map(p=>p.map(b=>b.id))};
    });
    console.log('A4 Word-table full page packing:', tablePagePacking);
    assert.ok(tablePagePacking.parentPage > 0, 'fixture parent heading must be present');
    assert.ok(tablePagePacking.childOnParentPage >= 1,
      'A4 must place some nested child numbering below parent 2 on same page when space remains');
    assert.ok(tablePagePacking.nextPageCount >= 1,
      'fixture must still have later list items requiring a next page');
    assert.ok(tablePagePacking.textPreserved,
      'full pagination must preserve source text across all A4 pages');
    assert.equal(tablePagePacking.distinctAlphaItems, 4,
      'a/b/c/d numbering must remain four distinct items even when text continues across pages');
    // Regression for actual SPO: a numbered parent with alpha children.
    // Ordinary paragraphs can flow correctly while this NESTED list used to
    // move all children to the following page, leaving half a page empty.
    const nestedNumbering = await page.evaluate(() => {
      const pager = window.SopA4Pagination;
      const alpha = [
        'Petugas keamanan di RSUD Dr. Soegiri Lamongan melakukan pemantauan terhadap ruang Neonatus dan ruang tunggu.',
        'Akses masuk ruang Neonatus dilakukan pemantauan 24 jam menggunakan CCTV dan pemeriksaan petugas.',
        'Koridor ruang bayi dilengkapi titik pengawasan serta pencatatan pemeriksaan identitas pengunjung.',
        'Petugas melaporkan semua kejadian keamanan secara berjenjang kepada koordinator jaga.'
      ];
      // This is the HTML emitted by browser numbering and also by copy/paste.
      const source = '<ol type="1" start="2"><li value="2">Pemantauan Oleh petugas keamanan' +
        '<ol type="a">' + alpha.map((x,i)=>'<li'+(i===2?' value="7" data-sop-manual-number="7"':'')+'>'+x+'</li>').join('') +
        '</ol></li></ol>';
      const intro = Array.from({length:8},(_,i)=>({id:'intro-'+i,
        section:'PROSEDUR',html:'<p>Petugas melakukan pemeriksaan serta pemantauan keamanan rumah sakit secara berkala dan terkoordinasi.</p>'}));
      const blocks=[...intro,{id:'nested-numbering',section:'PROSEDUR',html:source}];
      const pages=pager.computeCanonicalA4Pages(blocks,
        {headerHeightPx:125,publicationHeightPx:0,safetyBufferPx:24});
      const containing=pages.findIndex(p=>p.some(b=>b.id.startsWith('nested-numbering')));
      const firstPage=pages[containing].filter(b=>b.id.startsWith('nested-numbering'));
      const firstNestedCount=firstPage.reduce((acc,b)=>{
        const d=new DOMParser().parseFromString(b.html,'text/html');
        return acc+d.querySelectorAll('ol[type="a"] > li:not([data-sop-continuation-li])').length;
      },0);
      const parse=(html)=>new DOMParser().parseFromString(html,'text/html');
      const pieces=pages.flat().filter(b=>b.id.startsWith('nested-numbering')).map(b=>b.html);
      const saved=pager.reassemblePaginatedSection(pieces.join(''));
      const doc=parse(saved);
      const sourceText=parse(source).body.textContent;
      const outputText=parse(pieces.join('')).body.textContent;
      let repeated = saved;
      for (let cycle=0; cycle<3; cycle++) {
        const again=pager.computeCanonicalA4Pages(
          [...intro,{id:'nested-numbering',section:'PROSEDUR',html:repeated}],
          {headerHeightPx:125,publicationHeightPx:0,safetyBufferPx:24});
        repeated=pager.reassemblePaginatedSection(again.flat()
          .filter(b=>b.id.startsWith('nested-numbering')).map(b=>b.html).join(''));
      }
      const roundTrip=parse(repeated);
      return {firstNestedCount, page:containing+1, totalPages:pages.length,
        roundTripText:roundTrip.body.textContent,
        roundTripRoots:roundTrip.body.querySelectorAll(':scope > ol').length,
        roundTripParents:roundTrip.querySelectorAll('ol[type="1"] > li').length,
        roundTripChildren:roundTrip.querySelectorAll('ol[type="a"] > li').length,
        sourceText,outputText,
        sourceItems:parse(source).querySelectorAll('ol[type="a"] > li').length,
        restoredItems:doc.querySelectorAll('ol[type="a"] > li').length,
        restoredParents:doc.querySelectorAll('ol[type="1"] > li').length,
        rootLists:doc.body.querySelectorAll(':scope > ol').length,
        manual:doc.querySelector('li[value="7"]')?.getAttribute('data-sop-manual-number')};
    });
    console.log('A4 nested parent/alpha page packing:', nestedNumbering);
    assert.ok(nestedNumbering.page > 0, 'nested list parent must exist');
    assert.ok(nestedNumbering.firstNestedCount > 0,
      'nested alpha children must occupy remaining A4 space below numbered parent');
    assert.equal(nestedNumbering.sourceText, nestedNumbering.outputText,
      'nested list page fragments must preserve complete text in order');
    assert.equal(nestedNumbering.restoredParents, 1,
      'edit/save must restore one numbered parent, not clone it per page');
    assert.equal(nestedNumbering.restoredItems, nestedNumbering.sourceItems,
      'nested manual and automatic list items must survive edit/save');
    assert.equal(nestedNumbering.rootLists, 1,
      'pagination must not permanently split a logical nested list');
    assert.equal(nestedNumbering.manual, '7',
      'nonsequential manual alpha value must remain editable and intact');
    assert.equal(nestedNumbering.roundTripText,nestedNumbering.sourceText,
      'repeated pagination/save must preserve nested authored text');
    assert.equal(nestedNumbering.roundTripRoots,1,
      'three save/reopen cycles must not multiply root lists');
    assert.equal(nestedNumbering.roundTripParents,1,
      'three save/reopen cycles must preserve the single decimal parent');
    assert.equal(nestedNumbering.roundTripChildren,nestedNumbering.sourceItems,
      'three save/reopen cycles must preserve all alpha children');
    // Mount the production React editor and TYPE using real keyboard events.
    await page.evaluate(() => {
      document.body.innerHTML = '<div id="live-app"></div>';
    });
    await page.addScriptTag({ url: '/__live.js' });
    await page.waitForSelector('[contenteditable="true"][data-placeholder*="Langkah persiapan"]');
    const procedureSelector = '[contenteditable="true"][data-placeholder*="Langkah persiapan"]';
    await page.click(procedureSelector);
    await page.keyboard.type('Pemantauan petugas keamanan');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Pemeriksaan akses ruang bayi dan pengunjung.');
    await page.waitForFunction(() => window.__savedProcedure?.includes('pengunjung.'));
    assert.ok((await page.evaluate(() => window.__savedProcedure)).includes('Pemantauan'),
      'direct typing must reach the logical section callback');
    console.log('LiveSPO actual keyboard input: PASS');
    // Type a long procedure from an empty editor (no DOCX/imported HTML).
    await page.evaluate(() => window.__mountLive());
    await page.waitForFunction(() => window.__savedProcedure === '');
    await page.waitForSelector(procedureSelector);
    await page.click(procedureSelector);
    await page.evaluate(() => document.execCommand('insertOrderedList'));
    for (let i = 1; i <= 18; i++) {
      await page.keyboard.sendCharacter(`Butir ${i}: Petugas melakukan pemantauan ruang bayi, memeriksa akses pengunjung, mencatat hasil pemeriksaan dan melaporkan kondisi keamanan kepada koordinator jaga. `);
      if (i < 18) await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.__savedProcedure?.includes('Butir 18:'));
    // Wait for the actual production debounced paginator to settle.
    await page.waitForFunction(selector => document.querySelectorAll(selector).length > 1, {}, procedureSelector);
    const typed = await page.evaluate(() => {
      const saved = window.__savedProcedure;
      const doc = new DOMParser().parseFromString(saved, 'text/html');
      return { text: doc.body.textContent, tables: doc.querySelectorAll('table').length };
    });
    for (let i = 1; i <= 18; i++) assert.equal(typed.text.split(`Butir ${i}:`).length - 1, 1,
      'typing across pages preserves each authored item exactly once');
    assert.equal(typed.tables, 0, 'direct typing must not fabricate DOCX layout tables');
    console.log('LiveSPO direct typing across A4 pages: PASS');
    const typedGaps = await page.evaluate(() => [...document.querySelectorAll('.sop-live-a4-page')]
      .slice(0, -1).map(page => {
        const editors = page.querySelectorAll('[contenteditable="true"]');
        const last = editors[editors.length - 1];
        const frame = page.querySelector('.sop-a4-content-frame');
        const scale = page.getBoundingClientRect().width / page.offsetWidth;
        return (frame.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom) / scale;
      }));
    for (const gap of typedGaps) assert.ok(gap < 100,
      'typed text must fill a nonterminal page; unused bottom=' + gap.toFixed(1));
    console.log('LiveSPO typed-page unused bottoms (including safety/inset):', typedGaps);


    // Reopen a multi-page table and edit a continuation using the real React callback.
    await page.evaluate(() => window.__mountLive(window.__wordTableListFixture.replace(
      'koordinator', 'koordinator ' + 'pemeriksaan keamanan berjenjang '.repeat(100))));
    await page.waitForFunction(selector => [...document.querySelectorAll(selector)]
      .some(e => e.querySelector('[data-sop-table-continuation]')), {}, procedureSelector);
    const continuation = await page.$(procedureSelector + ' [data-sop-table-continuation] td');
    await continuation.click();
    await page.keyboard.press('End');
    await page.keyboard.sendCharacter(' EDIT-ULANG ');
    await page.waitForFunction(() => window.__savedProcedure?.includes('EDIT-ULANG'));
    const actualSaved = await page.evaluate(() => {
      const doc = new DOMParser().parseFromString(window.__savedProcedure, 'text/html');
      return { tables: doc.querySelectorAll('table').length, lists: doc.querySelectorAll('ol').length,
        items: doc.querySelectorAll('li').length,
        metadata: doc.querySelectorAll('[data-sop-rejoin], [data-sop-table-continuation], [data-sop-continuation-li]').length };
    });
    assert.deepEqual(actualSaved, { tables: 1, lists: 1, items: 3, metadata: 0 });
    console.log('LiveSPO continuation keyboard edit/save: PASS');
    await page.waitForFunction(selector => [...document.querySelectorAll(selector)]
      .some(e => e.querySelector('[data-sop-table-continuation] li')), {}, procedureSelector);
    const continuedItem = await page.$(procedureSelector + ' [data-sop-table-continuation] li');
    await continuedItem.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.sendCharacter('BUTIR BARU DARI ENTER');
    await page.waitForFunction(() => window.__savedProcedure?.includes('BUTIR BARU DARI ENTER'));
    const afterEnter = await page.evaluate(() => {
      const doc = new DOMParser().parseFromString(window.__savedProcedure, 'text/html');
      return doc.querySelectorAll('li').length;
    });
    assert.equal(afterEnter, 4, 'Enter in a table continuation must create a NEW logical list item');
    console.log('LiveSPO continuation Enter: PASS');

    // A canonical HTML reflow must not discard selected text while editing.
    // This reproduces the toolbar/selection UX regression: the document text
    // stays identical but its inline markup changes during re-render.
    await page.evaluate(() => window.__mountRichEditor(
      '<p>Jangan mengubah seleksi teks di editor SPO.</p>'));
    await page.waitForSelector('[contenteditable="true"][data-placeholder="Uji seleksi editor"]');
    const selectedBefore = await page.evaluate(() => {
      const editor = document.querySelector('[data-placeholder="Uji seleksi editor"]');
      const textNode = editor.querySelector('p').firstChild;
      const start = textNode.textContent.indexOf('seleksi');
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, start + 'seleksi teks'.length);
      editor.focus();
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      window.__setRichHtml('<p><strong>Jangan</strong> mengubah seleksi teks di editor SPO.</p>');
      return selection.toString();
    });
    assert.equal(selectedBefore, 'seleksi teks');
    await page.waitForFunction(() => !!document.querySelector('[data-placeholder="Uji seleksi editor"] strong'));
    const selectedAfter = await page.evaluate(() => {
      const editor = document.querySelector('[data-placeholder="Uji seleksi editor"]');
      return { selected: window.getSelection()?.toString(),
        active: document.activeElement === editor };
    });
    assert.equal(selectedAfter.selected, 'seleksi teks',
      'canonical HTML refresh must preserve an expanded text selection');
    assert.equal(selectedAfter.active, true,
      'canonical HTML refresh must not steal editor focus');
    console.log('LiveSPO selection across rich HTML refresh: PASS');






  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
