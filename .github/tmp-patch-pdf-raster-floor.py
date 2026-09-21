from pathlib import Path

api_path = Path('api/pdf.ts')
fn_path = Path('functions/index.js')
test_path = Path('tests/pdf-binary-download.test.ts')

api = api_path.read_text()
fn = fn_path.read_text()
tests = test_path.read_text()

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

api_old = '''#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"] > td,
#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"] > th {
  border-bottom: 0 !important;
}

.no-print {
'''
api_new = '''#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"] > td,
#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"] > th {
  border-bottom: 0 !important;
}

/* Chromium print can still rasterize the collapsed table edge at the junction
   immediately above the continuation filler. Let the filler overlap that edge
   by exactly one CSS pixel, then draw the authoritative floor as an inner
   raster-safe rule so it cannot be clipped by the A4 overflow boundary. */
#printable-sop-official-document.pdf-export-document [data-sop-page-continuation-fill="true"] {
  margin-top: -1px !important;
  position: relative !important;
  z-index: 1 !important;
  background: #ffffff !important;
  border-bottom: 0 !important;
  box-shadow: 0 -1px 0 #ffffff !important;
}

#printable-sop-official-document.pdf-export-document [data-sop-page-continuation-fill="true"]::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: #000000;
  pointer-events: none;
  z-index: 2;
}

.no-print {
'''
api = replace_once(api, api_old, api_new, 'Vercel PDF raster guard')

fn_old = '''#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"]>td,#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"]>th{border-bottom:0!important}
.no-print { display: none !important; }
'''
fn_new = '''#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"]>td,#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"]>th{border-bottom:0!important}
/* Raster-safe PDF continuation junction: overlap the collapsed table edge by
   one pixel and draw the final floor inside the filler instead of on its clipped border. */
#printable-sop-official-document.pdf-export-document [data-sop-page-continuation-fill="true"]{margin-top:-1px!important;position:relative!important;z-index:1!important;background:#fff!important;border-bottom:0!important;box-shadow:0 -1px 0 #fff!important}
#printable-sop-official-document.pdf-export-document [data-sop-page-continuation-fill="true"]::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:#000;pointer-events:none;z-index:2}
.no-print { display: none !important; }
'''
fn = replace_once(fn, fn_old, fn_new, 'Firebase PDF raster guard')

marker = "PDF continuation filler masks the rasterized junction and redraws one inner floor"
if marker in tests:
    raise SystemExit('PDF raster regression already present unexpectedly')

tests += r'''

test('PDF continuation filler masks the rasterized junction and redraws one inner floor', () => {
  const sources = [
    ['Firebase pdfApi', readFileSync('functions/index.js', 'utf8')],
    ['Vercel api/pdf', readFileSync('api/pdf.ts', 'utf8')],
  ] as const;

  for (const [label, source] of sources) {
    const guard = source.lastIndexOf('[data-sop-page-continuation-fill=');
    const genericBorder = source.lastIndexOf('border:1px solid #000!important');
    assert.ok(guard > genericBorder, `${label}: raster guard must follow generic table borders`);
    assert.match(source, /data-sop-page-continuation-fill[^}]*\{[^}]*margin-top\s*:\s*-1px\s*!important/i, `${label}: 1px junction overlap missing`);
    assert.match(source, /data-sop-page-continuation-fill[^}]*\{[^}]*border-bottom\s*:\s*0\s*!important/i, `${label}: clipped filler border must be disabled`);
    assert.match(source, /data-sop-page-continuation-fill[^}]*::after[^}]*\{[^}]*bottom\s*:\s*0[^}]*height\s*:\s*1px[^}]*background\s*:\s*#(?:000000|000)/i, `${label}: inner canonical floor rule missing`);
  }
});
'''

api_path.write_text(api)
fn_path.write_text(fn)
test_path.write_text(tests)
print('PDF raster floor patch applied fail-closed.')
