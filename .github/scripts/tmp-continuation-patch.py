from pathlib import Path

live_path = Path('src/components/SopLiveTemplate.tsx')
preview_path = Path('src/components/SopDetailModal.tsx')
css_path = Path('src/index.css')
test_path = Path('tests/live-sop-content-integrity.test.ts')

live = live_path.read_text()
preview = preview_path.read_text()
css = css_path.read_text()
tests = test_path.read_text()

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

live = replace_once(
    live,
    '''                  <table
                    className="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed"
                    style={{
                      border: '1px solid #000000',
                      borderBottom: isContinuationPage ? '0' : '1px solid #000000',
''',
    '''                  <table
                    className={`sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed ${isContinuationPage ? 'sop-continuation-page-table' : ''}`}
                    style={{
                      border: '1px solid #000000',
                      borderBottom: isContinuationPage ? '0' : '1px solid #000000',
''',
    'Live continuation table marker'
)

live = replace_once(
    live,
    '''                        return (
                          <tr key={`page-${pageIndex}-group-${groupIdx}-${cfg.id}`}>
                            <td
''',
    '''                        return (
                          <tr
                            key={`page-${pageIndex}-group-${groupIdx}-${cfg.id}`}
                            data-sop-suppress-bottom-border={extendToPageBottom ? 'true' : undefined}
                          >
                            <td
''',
    'Live continuation tail-row marker'
)

preview = replace_once(
    preview,
    '''      <tr
        key={key}
        className="sop-section-row"
        data-sop-section={section}
        data-measure-block-row={measure ? key : undefined}
      >
''',
    '''      <tr
        key={key}
        className="sop-section-row"
        data-sop-section={section}
        data-measure-block-row={measure ? key : undefined}
        data-sop-suppress-bottom-border={!lastInSection ? 'true' : undefined}
      >
''',
    'Preview continuation tail-row marker'
)

preview = replace_once(
    preview,
    '''                      <table
                        className="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed"
                        style={{
                          border: '1px solid #000000',
                          borderBottom: isContinuationPage ? '0' : '1px solid #000000',
''',
    '''                      <table
                        className={`sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed ${isContinuationPage ? 'sop-continuation-page-table' : ''}`}
                        style={{
                          border: '1px solid #000000',
                          borderBottom: isContinuationPage ? '0' : '1px solid #000000',
''',
    'Preview continuation table marker'
)

css_anchor = '''table.sop-official-table td,
table.sop-official-table th,
#printable-sop-official-document table.sop-official-table td,
#printable-sop-official-document table.sop-official-table th {
  border: 1px solid #000000 !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
  word-wrap: break-word !important;
  hyphens: none !important;
  -webkit-hyphens: none !important;
  vertical-align: top;
  box-sizing: border-box !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
'''
css_replacement = css_anchor + '''
/* Continuation pages use one authoritative bottom rule: the page filler floor.
   The global official-table border rules above are !important, so inline
   borderBottom: 0 alone cannot suppress the residual line at the table/filler
   junction. These specific markers remove only that duplicate boundary. */
table.sop-official-table.sop-continuation-page-table,
#printable-sop-official-document table.sop-official-table.sop-continuation-page-table {
  border-bottom: 0 !important;
}

table.sop-official-table tr[data-sop-suppress-bottom-border="true"] > td,
#printable-sop-official-document table.sop-official-table tr[data-sop-suppress-bottom-border="true"] > td {
  border-bottom: 0 !important;
}
'''
css = replace_once(css, css_anchor, css_replacement, 'Continuation CSS override')

marker = "continuation pages suppress the duplicate table/tail-row bottom rule"
if marker in tests:
    raise SystemExit('Continuation border regression test already present unexpectedly')
tests += '''

test('continuation pages suppress the duplicate table/tail-row bottom rule', () => {
  const live = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');
  const preview = readFileSync('src/components/SopDetailModal.tsx', 'utf8');
  const css = readFileSync('src/index.css', 'utf8');
  assert.match(live, /sop-continuation-page-table/);
  assert.match(live, /data-sop-suppress-bottom-border=\{extendToPageBottom \? 'true' : undefined\}/);
  assert.match(preview, /sop-continuation-page-table/);
  assert.match(preview, /data-sop-suppress-bottom-border=\{!lastInSection \? 'true' : undefined\}/);
  assert.match(css, /table\.sop-official-table\.sop-continuation-page-table[\s\S]{0,220}border-bottom:\s*0 !important/);
  assert.match(css, /tr\[data-sop-suppress-bottom-border="true"\]\s*>\s*td[\s\S]{0,240}border-bottom:\s*0 !important/);
});
'''

live_path.write_text(live)
preview_path.write_text(preview)
css_path.write_text(css)
test_path.write_text(tests)
print('Continuation bottom-border patch applied fail-closed.')
