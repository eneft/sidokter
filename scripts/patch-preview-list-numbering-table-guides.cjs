const fs = require('node:fs');

function replaceExact(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Ambiguous patch target: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

// 1) Physical table-guide coordinates: derive pixel boundaries from adjacent rendered cell borders.
{
  const path = 'src/utils/tableGeometry.ts';
  let source = fs.readFileSync(path, 'utf8');
  const marker = '\nconst setExplicitTableHorizontalGeometry = (';
  const insert = `\n/**\n * Return the physical X positions (px from the rendered table left edge) of\n * every internal logical column boundary. The midpoint between the adjacent\n * rendered cell borders is authoritative, so the visible resize guide sits\n * exactly on the black table rule even with border-collapse/sub-pixel rounding.\n */\nexport function renderedLogicalColumnBoundaryPositions(table: HTMLTableElement): number[] {\n  const grid = tableGrid(table);\n  const count = Math.max(0, ...grid.map((row) => row.length));\n  if (count <= 1) return [];\n\n  const tableRect = table.getBoundingClientRect();\n  if (!Number.isFinite(tableRect.width) || tableRect.width <= 0) return [];\n\n  const cols = Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'));\n  const parsed = cols.map((col) => Number.parseFloat(col.style.width || col.getAttribute('width') || ''));\n  const validAuthored = cols.length === count && parsed.every((width) => Number.isFinite(width) && width > 0);\n  const authoredTotal = validAuthored ? parsed.reduce((sum, width) => sum + width, 0) : count;\n  const authored = validAuthored\n    ? parsed.map((width) => width / Math.max(1, authoredTotal))\n    : new Array(count).fill(1 / count);\n\n  const positions: number[] = [];\n  let fallbackRatio = 0;\n  let previous = 0;\n  for (let boundary = 1; boundary < count; boundary += 1) {\n    fallbackRatio += authored[boundary - 1] || 0;\n    const samples: number[] = [];\n    grid.forEach((row) => {\n      const leftSlot = row[boundary - 1];\n      const rightSlot = row[boundary];\n      if (!leftSlot || !rightSlot || leftSlot.cell === rightSlot.cell) return;\n      const leftRect = leftSlot.cell.getBoundingClientRect();\n      const rightRect = rightSlot.cell.getBoundingClientRect();\n      const position = ((leftRect.right + rightRect.left) / 2) - tableRect.left;\n      if (Number.isFinite(position) && position > 0 && position < tableRect.width) samples.push(position);\n    });\n\n    samples.sort((a, b) => a - b);\n    let position = samples.length\n      ? samples[Math.floor(samples.length / 2)]\n      : tableRect.width * fallbackRatio;\n    if (!Number.isFinite(position) || position <= previous || position >= tableRect.width) {\n      position = tableRect.width * fallbackRatio;\n    }\n    if (!Number.isFinite(position) || position <= previous || position >= tableRect.width) return [];\n    positions.push(position);\n    previous = position;\n  }\n  return positions;\n}\n`;
  if (!source.includes(marker)) throw new Error('Missing tableGeometry insertion marker');
  source = source.replace(marker, insert + marker);
  fs.writeFileSync(path, source);
}

// 2) Overlay uses those physical px coordinates, not reconstructed percentages.
{
  const path = 'src/components/RichTextEditor.tsx';
  let source = fs.readFileSync(path, 'utf8');
  source = replaceExact(
    source,
    `  applyLogicalColumnWidths, enableTableBorderResize, ensureLogicalColumns, logicalColumnWidths,\n  MIN_TABLE_COLUMN_PX, resizeLogicalBoundary, restoreTableSnapshot, setRowMinimumHeight,`,
    `  applyLogicalColumnWidths, enableTableBorderResize, ensureLogicalColumns, logicalColumnWidths,\n  MIN_TABLE_COLUMN_PX, renderedLogicalColumnBoundaryPositions, resizeLogicalBoundary, restoreTableSnapshot, setRowMinimumHeight,`,
    'table geometry import',
  );
  source = replaceExact(
    source,
    `            {logicalColumnWidths(selectedTable, false).slice(0, -1).map((_, boundary, widths) => {\n              const left = widths.slice(0, boundary + 1).reduce((sum, width) => sum + width, 0);\n              return <button key={\`column-\${boundary}\`} type="button" tabIndex={-1}\n                className="table-column-boundary pointer-events-auto" style={{ left: \`\${left}%\` }}\n                title={\`Ubah batas kolom \${boundary + 1}/\${boundary + 2}\`}\n                onPointerDown={(event) => startColumnResize(event, boundary)}\n                onPointerMove={moveGridResize} onPointerUp={finishGridResize} onPointerCancel={cancelGridResize} />;\n            })}`,
    `            {renderedLogicalColumnBoundaryPositions(selectedTable).map((left, boundary) => (\n              <button key={\`column-\${boundary}\`} type="button" tabIndex={-1}\n                className="table-column-boundary pointer-events-auto" style={{ left: \`\${left}px\` }}\n                title={\`Ubah batas kolom \${boundary + 1}/\${boundary + 2}\`}\n                onPointerDown={(event) => startColumnResize(event, boundary)}\n                onPointerMove={moveGridResize} onPointerUp={finishGridResize} onPointerCancel={cancelGridResize} />\n            )))}`,
    'physical column guide rendering',
  );
  fs.writeFileSync(path, source);
}

// 3) Keep a generous hit target but draw only a 1px purple guide on the true border center.
{
  const path = 'src/index.css';
  let source = fs.readFileSync(path, 'utf8');
  source = replaceExact(
    source,
    `.table-selection-overlay .table-column-boundary:hover,\n.table-selection-overlay .table-row-boundary:hover { background: rgb(79 70 229 / 25%); }`,
    `.table-selection-overlay .table-column-boundary:hover,\n.table-selection-overlay .table-row-boundary:hover { background: transparent; }\n.table-selection-overlay .table-column-boundary::after,\n.table-selection-overlay .table-row-boundary::after {\n  content: '';\n  position: absolute;\n  pointer-events: none;\n  background: transparent;\n}\n.table-selection-overlay .table-column-boundary::after {\n  top: 0;\n  bottom: 0;\n  left: 4px;\n  width: 1px;\n}\n.table-selection-overlay .table-row-boundary::after {\n  left: 0;\n  right: 0;\n  top: 4px;\n  height: 1px;\n}\n.table-selection-overlay .table-column-boundary:hover::after,\n.table-selection-overlay .table-column-boundary:active::after,\n.table-selection-overlay .table-row-boundary:hover::after,\n.table-selection-overlay .table-row-boundary:active::after {\n  background: rgb(79 70 229 / 75%);\n}`,
    'one-pixel table guide css',
  );
  fs.writeFileSync(path, source);
}

// 4) Preview/PDF canonical flow: preserve numbering when a table interrupts one ordered list.
{
  const path = 'src/utils/canonicalA4Pagination.ts';
  let source = fs.readFileSync(path, 'utf8');
  const marker = `/**\n * Decomposes authored section HTML into granular flow units (paragraphs,\n * list items, tables, media) so the canonical pagination engine can pack\n * and fill all remaining A4 space before creating a new page.\n */\nexport function extractProcedureBlocks(html: string): string[] {`;
  const helper = `/**\n * contentEditable may split one ordered list into OL / TABLE / OL siblings when\n * a table is inserted between numbered items. Live DOM can still look correct,\n * but Preview/PDF canonical blocks render each OL independently and would reset\n * the second fragment to 1. Carry the next number only across tables and empty\n * spacer paragraphs; meaningful prose/headings deliberately terminate the list.\n */\nexport function normalizeOrderedListContinuityAroundTables(root: ParentNode): void {\n  const children = Array.from(root.children || []) as HTMLElement[];\n  let nextOrderedStart: number | null = null;\n\n  const isEmptySpacer = (element: HTMLElement) => {\n    const tag = element.tagName.toLowerCase();\n    if (tag !== 'p' && tag !== 'div') return false;\n    if (element.querySelector('table,ol,ul,img,figure')) return false;\n    return !(element.textContent || '').replace(/\\u00a0/g, ' ').trim();\n  };\n\n  children.forEach((element) => {\n    const tag = element.tagName.toLowerCase();\n    if (tag === 'ol') {\n      const directItems = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === 'li');\n      const rawStart = element.getAttribute('start');\n      const parsedStart = rawStart ? Number.parseInt(rawStart, 10) : Number.NaN;\n      const hasExplicitStart = Number.isFinite(parsedStart) && parsedStart > 0;\n      const effectiveStart = hasExplicitStart ? parsedStart : (nextOrderedStart || 1);\n      if (!hasExplicitStart && nextOrderedStart && nextOrderedStart > 1) {\n        element.setAttribute('start', String(nextOrderedStart));\n      }\n      element.style.setProperty('--sop-start-offset', String(Math.max(0, effectiveStart - 1)));\n      nextOrderedStart = effectiveStart + directItems.length;\n      return;\n    }\n\n    if (tag === 'table' || isEmptySpacer(element)) return;\n\n    // Normalize nested block containers independently; their numbering context\n    // must not leak into or out of this sibling sequence.\n    if (/^(div|section|article|main)$/i.test(tag)) {\n      normalizeOrderedListContinuityAroundTables(element);\n    }\n    nextOrderedStart = null;\n  });\n}\n\n${marker}`;
  source = replaceExact(source, marker, helper, 'canonical ordered-list continuity helper');
  source = replaceExact(
    source,
    `    const parser = new DOMParser();\n    const doc = parser.parseFromString(source, 'text/html');\n    const blocks: string[] = [];`,
    `    const parser = new DOMParser();\n    const doc = parser.parseFromString(source, 'text/html');\n    normalizeOrderedListContinuityAroundTables(doc.body);\n    const blocks: string[] = [];`,
    'normalize ordered-list continuity before block extraction',
  );
  fs.writeFileSync(path, source);
}

// 5) Runtime/regression coverage for both bugs.
{
  const path = 'tests/table-geometry-resize.test.ts';
  let source = fs.readFileSync(path, 'utf8');
  source = replaceExact(
    source,
    `import { renderedLogicalColumnWidths, resizeLogicalBoundary, tableOuterEdgeAtPoint } from '../src/utils/tableGeometry';`,
    `import { renderedLogicalColumnBoundaryPositions, renderedLogicalColumnWidths, resizeLogicalBoundary, tableOuterEdgeAtPoint } from '../src/utils/tableGeometry';`,
    'table geometry test import',
  );
  const marker = `test('production editor separates read-only selection from geometry mutation', () => {`;
  const runtimeTest = `test('purple column guide uses the midpoint of the actual adjacent rendered borders', () => {\n  const leftCell = {\n    rowSpan: 1,\n    colSpan: 1,\n    getBoundingClientRect: () => ({ left: 0, right: 41 }),\n  } as unknown as HTMLTableCellElement;\n  const rightCell = {\n    rowSpan: 1,\n    colSpan: 1,\n    getBoundingClientRect: () => ({ left: 39, right: 100 }),\n  } as unknown as HTMLTableCellElement;\n  const table = {\n    rows: [{ cells: [leftCell, rightCell] }],\n    querySelectorAll: () => [],\n    getBoundingClientRect: () => ({ left: 0, width: 100 }),\n  } as unknown as HTMLTableElement;\n\n  assert.deepEqual(renderedLogicalColumnBoundaryPositions(table), [40]);\n  assert.match(editor, /renderedLogicalColumnBoundaryPositions\\(selectedTable\\)/);\n  assert.match(editor, /style=\\{\\{ left: \\`\\$\\{left\\}px\\` \\}\\}/);\n  assert.match(css, /table-column-boundary::after[\\s\\S]*width:\\s*1px/);\n});\n\n${marker}`;
  source = replaceExact(source, marker, runtimeTest, 'physical table guide regression test');
  source = source.replace(
    `assert.match(editor, /logicalColumnWidths\\(selectedTable, false\\)/);`,
    `assert.match(editor, /renderedLogicalColumnBoundaryPositions\\(selectedTable\\)/);`,
  );
  fs.writeFileSync(path, source);
}

{
  const path = 'tests/live-sop-content-integrity.test.ts';
  let source = fs.readFileSync(path, 'utf8');
  const addition = `\n\ntest('Preview/PDF numbering continues across an inserted table but resets after meaningful prose', () => {\n  const priorParser = (globalThis as any).DOMParser;\n  const priorNode = (globalThis as any).Node;\n  class BrowserLikeDOMParser {\n    parseFromString(source: string) {\n      return new LinkedomDOMParser().parseFromString(\n        \`<!doctype html><html><body>\${source}</body></html>\`,\n        'text/html'\n      );\n    }\n  }\n  (globalThis as any).DOMParser = BrowserLikeDOMParser;\n  (globalThis as any).Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };\n\n  try {\n    const interrupted = extractProcedureBlocks(\n      '<ol><li>Satu</li><li>Dua</li></ol>' +\n      '<table><tbody><tr><td>Tabel</td></tr></tbody></table>' +\n      '<p><br></p>' +\n      '<ol><li>Tiga</li><li>Empat</li></ol>'\n    );\n    const ordered = interrupted.filter((block) => /^<ol\\b/i.test(block));\n    assert.equal(ordered.length, 2);\n    const second = new LinkedomDOMParser().parseFromString(\n      \`<!doctype html><html><body>\${ordered[1]}</body></html>\`,\n      'text/html'\n    ).body.querySelector('ol');\n    assert.equal(second?.getAttribute('start'), '3');\n    assert.equal(second?.style.getPropertyValue('--sop-start-offset'), '2');\n\n    const separateLists = extractProcedureBlocks(\n      '<ol><li>Pertama</li></ol>' +\n      '<p>Paragraf baru yang memutus daftar.</p>' +\n      '<table><tbody><tr><td>Tabel</td></tr></tbody></table>' +\n      '<ol><li>Daftar baru</li></ol>'\n    );\n    const separateOrdered = separateLists.filter((block) => /^<ol\\b/i.test(block));\n    const reset = new LinkedomDOMParser().parseFromString(\n      \`<!doctype html><html><body>\${separateOrdered[1]}</body></html>\`,\n      'text/html'\n    ).body.querySelector('ol');\n    assert.equal(reset?.getAttribute('start'), null);\n    assert.equal(reset?.style.getPropertyValue('--sop-start-offset'), '0');\n  } finally {\n    (globalThis as any).DOMParser = priorParser;\n    (globalThis as any).Node = priorNode;\n  }\n});\n`;
  source += addition;
  fs.writeFileSync(path, source);
}

console.log('Patched Preview/PDF list numbering and physical table guide alignment.');
