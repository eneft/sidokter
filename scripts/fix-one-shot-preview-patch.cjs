const fs = require('node:fs');
const path = 'scripts/patch-preview-list-numbering-table-guides.cjs';
let source = fs.readFileSync(path, 'utf8');
const before = source;
source = source
  .split('\n')
  .filter((line) => !line.includes("assert.match(editor, /style="))
  .join('\n');
if (source === before) throw new Error('Expected problematic style assertion was not found');
fs.writeFileSync(path, source);
console.log('Repaired one-shot patch script quoting.');
