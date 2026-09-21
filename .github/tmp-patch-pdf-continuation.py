from pathlib import Path

api_path = Path('api/pdf.ts')
functions_path = Path('functions/index.js')
test_path = Path('tests/pdf-binary-download.test.ts')

api = api_path.read_text()
functions = functions_path.read_text()
tests = test_path.read_text()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)

pdf_override_pretty = r'''
/* Final PDF cascade guard: continuation pages have one authoritative bottom
   rule, drawn by the continuation filler at the canonical page floor. Keep
   this AFTER the generic PDF table/cell border rules above. */
#printable-sop-official-document.pdf-export-document table.sop-official-table.sop-continuation-page-table {
  border-bottom: 0 !important;
}

#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"] > td,
#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"] > th {
  border-bottom: 0 !important;
}
'''

api_anchor = r'''.rich-text-document-content::after,
.rich-text-output::after {
  content: "";
  display: table;
  clear: both;
}

.no-print {
'''
api_replacement = r'''.rich-text-document-content::after,
.rich-text-output::after {
  content: "";
  display: table;
  clear: both;
}
''' + pdf_override_pretty + r'''
.no-print {
'''
api = replace_once(api, api_anchor, api_replacement, 'api/pdf.ts final PDF override')

functions_anchor = r'''.rich-text-document-content::after,.rich-text-output::after{content:"";display:table;clear:both}
.no-print { display: none !important; }
'''
functions_override = r'''.rich-text-document-content::after,.rich-text-output::after{content:"";display:table;clear:both}
/* Final PDF cascade guard: keep continuation floor suppression after every
   generic official-table border rule injected by the server renderer. */
#printable-sop-official-document.pdf-export-document table.sop-official-table.sop-continuation-page-table{border-bottom:0!important}
#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"]>td,#printable-sop-official-document.pdf-export-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"]>th{border-bottom:0!important}
.no-print { display: none !important; }
'''
functions = replace_once(functions, functions_anchor, functions_override, 'functions/index.js final PDF override')

if "PDF server renderers preserve the canonical continuation bottom floor" in tests:
    raise SystemExit('PDF continuation regression test already exists unexpectedly')

tests = tests.replace(
    "import { createRequire } from 'node:module';\n",
    "import { createRequire } from 'node:module';\nimport { readFileSync } from 'node:fs';\n",
    1,
)
tests += r'''

test('PDF server renderers preserve the canonical continuation bottom floor', () => {
  const sources = [
    ['Firebase pdfApi', readFileSync('functions/index.js', 'utf8')],
    ['Vercel api/pdf', readFileSync('api/pdf.ts', 'utf8')],
  ] as const;

  for (const [label, source] of sources) {
    const genericBorderPositions = [
      ...source.matchAll(/border\s*:\s*1px\s+solid\s+#000(?:000)?\s*!important/gi),
    ].map((match) => match.index ?? -1);
    assert.ok(genericBorderPositions.length > 0, `${label}: generic PDF border contract missing`);

    const finalOverride = source.lastIndexOf('table.sop-official-table.sop-continuation-page-table');
    assert.ok(finalOverride > Math.max(...genericBorderPositions), `${label}: continuation override must come after generic PDF borders`);

    assert.match(
      source,
      /table\.sop-official-table\.sop-continuation-page-table[^}]*\{[^}]*border-bottom\s*:\s*0\s*!important/i,
      `${label}: continuation table bottom suppression missing`,
    );
    assert.match(
      source,
      /tr\[data-sop-suppress-bottom-border=[\\\"']?true[\\\"']?\][^\{]*>[\s]*td[\s\S]{0,320}border-bottom\s*:\s*0\s*!important/i,
      `${label}: continuation tail-cell bottom suppression missing`,
    );
  }
});
'''

api_path.write_text(api)
functions_path.write_text(functions)
test_path.write_text(tests)
print('PDF continuation bottom-border patch applied fail-closed.')
