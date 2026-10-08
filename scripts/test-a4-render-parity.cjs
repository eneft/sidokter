// Browser-level geometry regression using actual Vite-built CSS and Bookman font.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const esbuild = require('esbuild');

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
  '</div></body></html>';

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/__a4') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
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

    // Regression from real SOP: parent 2. Pemantauan is at the end of page 2
    // while an entire nested a./b./c. list is deferred to page 3 despite
    // enough space for the first nested rows. Exercise the actual TS paginator.
    const compiled = esbuild.buildSync({
      entryPoints: [path.resolve(__dirname, '..', 'src/utils/canonicalA4Pagination.ts')],
      bundle: true, write: false, format: 'iife', platform: 'browser',
      globalName: 'A4Canonical', target: 'es2022'
    }).outputFiles[0].text;
    await page.addScriptTag({ content: compiled });
    await page.emulateMediaType('screen');
    const pagination = await page.evaluate(() => {
      const childTexts = [
        'Petugas keamanan di RSUD Dr. Soegiri Lamongan melakukan pemantauan terhadap ruang Neonatus dan ruang tunggu.',
        'Akses masuk ruang Neonatus dilakukan pemantauan 24 jam menggunakan CCTV dan pemeriksaan petugas.',
        'Koridor ruangan selalu dilengkapi dengan titik pengawasan dan laporan pengamanan.',
        'Petugas memeriksa identitas serta menegakkan tata tertib pengunjung rumah sakit.',
        'Pengamanan dilakukan secara berkala selama pergantian jadwal dinas.'
      ];
      const childItems = childTexts.map(t => '<li>' + t + '</li>');
      const source = '<ol type="1" data-sop-list-format="1" start="2"><li>Pemantauan Oleh petugas keamanan' +
        '<ol type="a" data-sop-list-format="a">' + childItems.join('') + '</ol></li></ol>';
      const doc = new DOMParser().parseFromString(source, 'text/html');
      const firstList = doc.body.firstElementChild;
      const prefix = firstList.cloneNode(true);
      [...prefix.querySelectorAll('ol[type="a"] > li')].slice(2).forEach(li => li.remove());
      const host = A4Canonical.createMeasureHost();
      host.innerHTML = prefix.outerHTML;
      const capacity = Math.ceil(host.getBoundingClientRect().height + 18);
      host.innerHTML = source;
      const completeHeight = host.getBoundingClientRect().height;
      const parts = A4Canonical.splitHtmlForCapacity(source, capacity, null);
      host.remove();
      const firstDoc = new DOMParser().parseFromString(parts[0] || '', 'text/html');
      const firstChildCount = firstDoc.querySelectorAll('ol[type="a"] > li').length;
      const joinedText = parts.map(html => new DOMParser().parseFromString(html, 'text/html').body.textContent || '').join('');
      const sourceText = doc.body.textContent || '';
      return { capacity, completeHeight, numberOfParts: parts.length, firstChildCount,
        sameText: joinedText === sourceText, firstHtml: parts[0]?.slice(0, 360) };
    });
    console.log('A4 nested-list page-fill debug:', pagination);
    assert.ok(pagination.completeHeight > pagination.capacity + 20,
      'Regression fixture must exceed remaining page space');
    assert.ok(pagination.numberOfParts > 1,
      'Nested procedure lists should paginate rather than move whole block');
    assert.ok(pagination.firstChildCount >= 1,
      'Use dead space for at least one nested a./b./c. item');
    assert.ok(pagination.sameText, 'Split must preserve every authored word exactly');
    console.log('A4 nested procedure page-fill: PASS');

    const pagePacking = await page.evaluate(() => {
      const texts = [
        'Pintu ruang Neonatus harus selalu terkunci bagi siapa pun yang tidak berkepentingan.',
        'Setiap orang kecuali petugas dan orang tua kandung bayi dilarang masuk ke ruang bayi.',
        'Orang tua menjalani pemeriksaan identitas Oleh perawat sebelum mengakses ruangan.',
        'Khusus untuk ayah kandung yang datang tidak bersamaan dengan ibu bayi dilakukan konfirmasi identitas tambahan.',
        'Selama ada bayi di ruang bayi, perawat tidak boleh meninggalkan ruangan tanpa pengawasan.'
      ];
      const prelude = texts.map(t => '<li>' + t + '</li>').join('');
      const nextItems = Array.from({length: 11}, (_,i) =>
        '<li>Petugas keamanan di RSUD Dr. Soegiri Lamongan melakukan pemantauan terhadap ruang Neonatus dan ruang tunggu sesuai jam dinas bagian ' + (i+1) + '.</li>').join('');
      const source = '<ol type="1"><li>Akses masuk ruang Neonatus' +
        '<ol type="a" data-sop-list-format="a">' + prelude + '</ol></li>' +
        '<li>Pemantauan Oleh petugas keamanan' +
        '<ol type="a" data-sop-list-format="a">' + nextItems + '</ol></li></ol>';
      const blocks = [
        { id:'pengertian', section:'PENGERTIAN', html:'<p>Keamanan ruang bayi adalah suatu sistem yang diberlakukan untuk melakukan pengamanan.</p>' },
        { id:'tujuan', section:'TUJUAN', html:'<p>Untuk pencegahan terjadinya gangguan keamanan terhadap bayi.</p>' },
        { id:'kebijakan', section:'KEBIJAKAN', html:'<ol><li>Peraturan Menteri Kesehatan Republik Indonesia Tahun 2017.</li><li>Keputusan Direktur RSUD Dr. Soegiri tentang kebijakan keamanan.</li></ol>' },
        { id:'prosedur', section:'PROSEDUR', html:source }
      ];
      const headerHeight=125, publicationHeight=185, safety=24;
      const pages=A4Canonical.computeCanonicalA4Pages(blocks,{
        headerHeightPx:headerHeight, publicationHeightPx:publicationHeight, safetyBufferPx:safety
      });
      const bodyCap=1122.5-151.2-headerHeight-safety;
      const host=A4Canonical.createMeasureHost();
      const reports=pages.map((groups,i)=>{
        let used=0, section=null, raw=0;
        for(const block of groups){
          host.innerHTML=block.html;
          const h=host.getBoundingClientRect().height;
          const first=section!==block.section;
          const floor=Math.max(A4Canonical.LIVE_SOP_SECTION_MIN_HEIGHT_PX,
            A4Canonical.getCanonicalSectionLabelMinimumHeightPx(block.section));
          const diff=A4Canonical.sectionFlowContributionPx(raw,h,first,floor);
          used+=diff+(first?A4Canonical.getCanonicalSectionRowChromePx():0);
          raw=first?h:raw+h;
          section=block.section;
        }
        const text=groups.map(x=>new DOMParser().parseFromString(x.html,'text/html').body.textContent||'').join('');
        return {page:i+1, blocks:groups.length, sections:groups.map(x=>x.section),
          remaining: Math.round((bodyCap-(i===0?publicationHeight:0)-used)*10)/10,
          used:Math.round(used), hasParent2:text.includes('Pemantauan Oleh petugas keamanan'),
          hasChild1:text.includes('bagian 1.'), chars:text.length, tail:text.slice(-90)};
      });
      host.remove();
      return reports;
    });
    console.log('A4 real-procedure page packing diagnostic:', pagePacking);

  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
