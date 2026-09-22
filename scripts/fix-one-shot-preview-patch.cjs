const fs = require('node:fs');
const path = 'scripts/patch-preview-list-numbering-table-guides.cjs';
let source = fs.readFileSync(path, 'utf8');

// Remove one regex assertion whose backticks cannot safely live inside the
// one-shot template literal. Runtime geometry + CSS assertions remain.
{
  const start = source.indexOf('  assert.match(editor, /style=');
  const end = source.indexOf('\\n  assert.match(css', start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Expected problematic inline style assertion was not found');
  }
  source = source.slice(0, start) + source.slice(end);
}

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing fixer target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Ambiguous fixer target: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

// The JSX map expression closes the arrow-expression and .map call: two ')',
// then the JSX expression '}'. The first generator draft had one extra ')'.
replaceOnce(
  `            )))}`,
  `            ))}`,
  'physical guide JSX closure',
);

// Continuation is allowed only when an actual table bridges two OL siblings.
// Adjacent OL siblings without a table remain independent authored lists.
replaceOnce(
  `  let nextOrderedStart: number | null = null;\\n\\n  const isEmptySpacer`,
  `  let nextOrderedStart: number | null = null;\\n  let bridgeHasTable = false;\\n\\n  const isEmptySpacer`,
  'table bridge state',
);

replaceOnce(
  `      const effectiveStart = hasExplicitStart ? parsedStart : (nextOrderedStart || 1);\\n      if (!hasExplicitStart && nextOrderedStart && nextOrderedStart > 1) {\\n        element.setAttribute('start', String(nextOrderedStart));\\n      }\\n      element.style.setProperty('--sop-start-offset', String(Math.max(0, effectiveStart - 1)));\\n      nextOrderedStart = effectiveStart + directItems.length;\\n      return;`,
  `      const shouldContinue = !hasExplicitStart && bridgeHasTable && nextOrderedStart !== null;\\n      const effectiveStart = hasExplicitStart ? parsedStart : (shouldContinue ? nextOrderedStart! : 1);\\n      if (shouldContinue && effectiveStart > 1) {\\n        element.setAttribute('start', String(effectiveStart));\\n      }\\n      element.style.setProperty('--sop-start-offset', String(Math.max(0, effectiveStart - 1)));\\n      nextOrderedStart = effectiveStart + directItems.length;\\n      bridgeHasTable = false;\\n      return;`,
  'ordered-list continuation condition',
);

replaceOnce(
  `    if (tag === 'table' || isEmptySpacer(element)) return;`,
  `    if (tag === 'table') {\\n      if (nextOrderedStart !== null) bridgeHasTable = true;\\n      return;\\n    }\\n    if (isEmptySpacer(element)) return;`,
  'table bridge activation',
);

replaceOnce(
  `    nextOrderedStart = null;\\n  });`,
  `    nextOrderedStart = null;\\n    bridgeHasTable = false;\\n  });`,
  'meaningful-content bridge reset',
);

fs.writeFileSync(path, source);
console.log('Repaired one-shot quoting/JSX and restricted list continuation to real table bridges.');
