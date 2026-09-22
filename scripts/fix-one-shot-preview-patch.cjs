const fs = require('node:fs');
const path = 'scripts/patch-preview-list-numbering-table-guides.cjs';
let source = fs.readFileSync(path, 'utf8');
const start = source.indexOf('  assert.match(editor, /style=');
const end = source.indexOf('\\n  assert.match(css', start);
if (start < 0 || end < 0 || end <= start) {
  throw new Error('Expected problematic inline style assertion was not found');
}
source = source.slice(0, start) + source.slice(end);
fs.writeFileSync(path, source);
console.log('Repaired one-shot patch script quoting without removing the runtime test.');
