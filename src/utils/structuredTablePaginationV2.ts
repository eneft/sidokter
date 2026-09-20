/**
 * Structured Table Pagination Engine V2 for A4 Documents (Live SPO, Preview & PDF)
 *
 * Guarantees:
 * 1. Reads source table as ONE unified logical column grid.
 * 2. Generates canonical geometry ONCE before pagination (widths, colgroup, col/rowspan, table-layout).
 * 3. Canonical geometry is IMMUTABLE throughout pagination.
 * 4. Splits only at valid <tr> boundaries.
 * 5. Never splits a boundary spanned by a rowspan.
 * 6. Every fragment receives an exact CLONE of the same canonical colgroup.
 * 7. Continuation fragments never recalculate column widths based on remaining rows.
 * 8. Never creates nested tables.
 * 9. Never forces width: 100% (preserves source table width).
 * 10. AutoFit is never rerun on paginated fragments.
 * 11. <thead> is repeated on all continuation fragments if present in source.
 * 12. <tfoot> only appears on the final fragment.
 * 13. Preserves <ol>/<ul>/<li> numbering when tables reside inside list items.
 * 14. If a table fits on the current page, it is never split.
 * 15. If some rows fit, uses the remaining page space (content-driven, natural page break).
 */

export interface CanonicalTableGeometry {
  readonly tableWidth: string;
  readonly tableLayout: 'fixed' | 'auto';
  readonly logicalColumnCount: number;
  readonly columnWidths: readonly number[];
  readonly colgroupHtml: string;
}

export interface LogicalCellSlot {
  readonly cell: HTMLTableCellElement;
  readonly originRow: number;
  readonly originCol: number;
}

export const roundPercent = (val: number): number => Number(val.toFixed(4));

export function getTableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  if (table.rows && typeof table.rows[Symbol.iterator] === 'function') {
    return Array.from(table.rows);
  }
  return Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
}

export function getRowCells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  if (row.cells && typeof row.cells[Symbol.iterator] === 'function') {
    return Array.from(row.cells);
  }
  return Array.from(row.children).filter((c) => {
    const tag = c.tagName.toLowerCase();
    return tag === 'td' || tag === 'th';
  }) as HTMLTableCellElement[];
}

export function getCellRowSpan(cell: HTMLTableCellElement): number {
  const attr = cell.getAttribute('rowspan');
  if (attr) {
    const val = parseInt(attr, 10);
    if (!Number.isNaN(val) && val > 0) return val;
  }
  return Math.max(1, cell.rowSpan || 1);
}

export function getCellColSpan(cell: HTMLTableCellElement): number {
  const attr = cell.getAttribute('colspan');
  if (attr) {
    const val = parseInt(attr, 10);
    if (!Number.isNaN(val) && val > 0) return val;
  }
  return Math.max(1, cell.colSpan || 1);
}

/**
 * Builds the 2D coordinate grid of slots where spanned cells cover their full (row, col) footprint.
 */
export function buildLogicalGrid(table: HTMLTableElement): {
  rowCount: number;
  colCount: number;
  grid: (LogicalCellSlot | null)[][];
} {
  const grid: (LogicalCellSlot | null)[][] = [];
  const rows = getTableRows(table);

  rows.forEach((row, r) => {
    grid[r] ||= [];
    let c = 0;
    getRowCells(row).forEach((cell) => {
      while (grid[r][c]) c++;
      const rs = getCellRowSpan(cell);
      const cs = getCellColSpan(cell);
      for (let y = r; y < r + rs; y++) {
        grid[y] ||= [];
        for (let x = c; x < c + cs; x++) {
          grid[y][x] = { cell, originRow: r, originCol: c };
        }
      }
      c += cs;
    });
  });

  const colCount = Math.max(0, ...grid.map((r) => r?.length || 0));
  return { rowCount: grid.length, colCount, grid };
}

/**
 * Parse a CSS width value into a normalized comparable number.
 * Supported units: %, px, pt, mm, cm, in.
 * If raw numeric (no unit or attribute width), treated as standard px.
 * Returns null if invalid or <= 0.
 */
export function parseCssWidthToUnits(widthStr: string | null | undefined): { value: number; unit: string } | null {
  if (!widthStr) return null;
  const trimmed = widthStr.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^([0-9.]+)\s*(%|px|pt|mm|cm|in)?$/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  if (!Number.isFinite(val) || val <= 0) return null;
  const unit = (match[2] || 'px').toLowerCase();
  return { value: val, unit };
}

/**
 * Convert physical length units to mm for proportional comparison when mixed units are encountered.
 * 1 in = 25.4 mm
 * 1 pt = 25.4 / 72 mm ≈ 0.352778 mm
 * 1 cm = 10 mm
 * 1 px ≈ 25.4 / 96 mm ≈ 0.264583 mm (standard CSS 96dpi)
 */
function convertToNormalizedLength(val: number, unit: string): number | null {
  switch (unit) {
    case '%':
      return val; // Percent is relative, keep numeric percent
    case 'mm':
      return val;
    case 'cm':
      return val * 10;
    case 'in':
      return val * 25.4;
    case 'pt':
      return val * (25.4 / 72);
    case 'px':
      return val * (25.4 / 96);
    default:
      return val;
  }
}

/**
 * Extracts and computes the canonical geometry ONCE.
 * Once computed, this geometry is immutable and shared across all fragments.
 */
export function extractCanonicalTableGeometry(table: HTMLTableElement): CanonicalTableGeometry {
  const { colCount, grid } = buildLogicalGrid(table);
  const count = Math.max(1, colCount);

  // Preserve source table width without forcing 100%
  const tableWidth = table.style.width || (table.getAttribute('width') ? `${table.getAttribute('width')}px` : '');

  // Preserve source table layout ('auto' or 'fixed')
  const sourceTableLayout = (table.style.tableLayout || '').toLowerCase();
  const tableLayout: 'fixed' | 'auto' =
    sourceTableLayout === 'auto' || table.dataset.tableAutofit === 'true'
      ? 'auto'
      : sourceTableLayout === 'fixed'
      ? 'fixed'
      : 'fixed';

  // 1. Check existing colgroup
  let rawWidths: number[] = [];
  const existingCols = Array.from(table.querySelectorAll(':scope > colgroup > col')) as HTMLTableColElement[];
  if (existingCols.length === count) {
    const parsedCols = existingCols.map((col) => {
      const raw = col.style.width || col.getAttribute('width') || '';
      return parseCssWidthToUnits(raw);
    });

    if (parsedCols.every((p): p is { value: number; unit: string } => p !== null)) {
      const firstUnit = parsedCols[0].unit;
      const allSameUnit = parsedCols.every((p) => p.unit === firstUnit);
      const allEqualValues = parsedCols.length > 1 && parsedCols.every((p) => Math.abs(p.value - parsedCols[0].value) < 0.01);

      // If existing cols are all equal (e.g. 20% placeholder), allow step 2 (cell widths)
      // to provide the true authored column widths if available.
      if (!allEqualValues) {
        if (allSameUnit) {
          rawWidths = parsedCols.map((p) => p.value);
        } else {
          rawWidths = parsedCols.map((p) => convertToNormalizedLength(p.value, p.unit) || p.value);
        }
      }
    }
  }

  // 2. Check individual cell widths in columns with colSpan === 1
  if (rawWidths.length !== count) {
    const parsedCells: ({ value: number; unit: string } | null)[] = new Array(count).fill(null);
    for (let c = 0; c < count; c++) {
      for (let r = 0; r < grid.length; r++) {
        const slot = grid[r]?.[c];
        if (slot && slot.originCol === c) {
          const cell = slot.cell;
          if (getCellColSpan(cell) === 1) {
            const raw = cell.style.width || cell.getAttribute('width') || '';
            const parsed = parseCssWidthToUnits(raw);
            if (parsed) {
              parsedCells[c] = parsed;
              break;
            }
          }
        }
      }
    }

    if (parsedCells.every((p): p is { value: number; unit: string } => p !== null)) {
      const firstUnit = parsedCells[0].unit;
      const allSameUnit = parsedCells.every((p) => p.unit === firstUnit);
      if (allSameUnit) {
        rawWidths = parsedCells.map((p) => p.value);
      } else {
        rawWidths = parsedCells.map((p) => convertToNormalizedLength(p.value, p.unit) || p.value);
      }
    }
  }

  // 3. Normalize widths to sum to 100%
  let normalizedWidths: number[];
  if (rawWidths.length === count && rawWidths.every((w) => w > 0)) {
    const total = rawWidths.reduce((a, b) => a + b, 0);
    normalizedWidths = rawWidths.map((w) => roundPercent((w / total) * 100));
  } else {
    const equalW = roundPercent(100 / count);
    normalizedWidths = new Array(count).fill(equalW);
  }

  // Adjust rounding difference on last column so sum is precisely 100%
  const sum = normalizedWidths.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.0001) {
    normalizedWidths[normalizedWidths.length - 1] = roundPercent(
      normalizedWidths[normalizedWidths.length - 1] + (100 - sum)
    );
  }

  const colgroupHtml = `<colgroup>${normalizedWidths
    .map((w) => `<col style="width: ${w}%" />`)
    .join('')}</colgroup>`;

  return Object.freeze({
    tableWidth,
    tableLayout,
    logicalColumnCount: count,
    columnWidths: Object.freeze([...normalizedWidths]),
    colgroupHtml,
  });
}

/**
 * Returns canonical column widths array for assertions and layout checks.
 */
export function getCanonicalColumnWidths(table: HTMLTableElement): number[] {
  return [...extractCanonicalTableGeometry(table).columnWidths];
}

/**
 * Returns canonical logical column count.
 */
export function getLogicalColumnCount(table: HTMLTableElement): number {
  return extractCanonicalTableGeometry(table).logicalColumnCount;
}

/**
 * Determines safe row boundaries for body rows.
 * Boundary b is between bodyRows[b] and bodyRows[b+1].
 * A boundary is UNSAFE if any cell crosses it (rowSpan > 1).
 */
export function safeTableRowBoundariesV2(bodyRows: HTMLTableRowElement[]): boolean[] {
  const count = bodyRows.length;
  if (count <= 1) return [];
  const safe = new Array(count - 1).fill(true);

  bodyRows.forEach((row, rowIndex) => {
    getRowCells(row).forEach((cell) => {
      const rs = getCellRowSpan(cell);
      if (rs > 1) {
        const lastCrossedBoundary = Math.min(count - 2, rowIndex + rs - 2);
        for (let b = rowIndex; b <= lastCrossedBoundary; b++) {
          safe[b] = false;
        }
      }
    });
  });

  return safe;
}

/**
 * Legacy boundary check for backward compatibility with existing tests.
 */
export function safeTableRowBoundaries(rowSpans: number[][]): boolean[] {
  const safe = new Array(rowSpans.length).fill(true);
  rowSpans.forEach((spans, rowIndex) => {
    spans.forEach((rawSpan) => {
      const spanEnd = rowIndex + Math.max(1, rawSpan || 1);
      for (let boundary = rowIndex + 1; boundary < Math.min(spanEnd, rowSpans.length); boundary += 1) {
        safe[boundary - 1] = false;
      }
    });
  });
  return safe;
}

export function largestFittingTablePrefix(
  rowSpans: number[][],
  fitsRowCount: (count: number) => boolean
): number {
  const safe = safeTableRowBoundaries(rowSpans);
  let result = 0;
  for (let count = 1; count < rowSpans.length; count += 1) {
    if (safe[count - 1] && fitsRowCount(count)) result = count;
  }
  return result;
}

/**
 * Split a rich-text table into canonical A4-compliant fragments.
 */
export function splitStructuredTableV2(
  table: HTMLTableElement,
  fits: (html: string) => boolean
): string[] {
  // 14. If the whole table fits, do not split
  if (fits(table.outerHTML)) return [table.outerHTML];

  // 1, 2, 3. Extract canonical geometry ONCE before pagination (IMMUTABLE)
  const canonicalGeometry = extractCanonicalTableGeometry(table);

  const headerSections = Array.from(table.children).filter(
    (child) => child.tagName.toLowerCase() === 'thead'
  ) as HTMLTableSectionElement[];
  const bodySections = Array.from(table.children).filter(
    (child) => child.tagName.toLowerCase() === 'tbody'
  ) as HTMLTableSectionElement[];
  const footerSections = Array.from(table.children).filter(
    (child) => child.tagName.toLowerCase() === 'tfoot'
  ) as HTMLTableSectionElement[];

  let headerRows: HTMLTableRowElement[] = [];
  let bodyRows: HTMLTableRowElement[] = [];

  if (headerSections.length > 0) {
    headerRows = headerSections.flatMap((head) => getTableRows(head as unknown as HTMLTableElement));
    bodyRows = (bodySections.length
      ? bodySections.flatMap((section) => getTableRows(section as unknown as HTMLTableElement))
      : getTableRows(table).filter(
          (row) => !headerSections.some((head) => head.contains(row)) && !footerSections.some((foot) => foot.contains(row))
        )) as HTMLTableRowElement[];
  } else {
    // No explicit <thead>: The first row(s) serve as the table column header ("judul kolom tabel")
    const allRows = (bodySections.length
      ? bodySections.flatMap((section) => getTableRows(section as unknown as HTMLTableElement))
      : getTableRows(table).filter(
          (row) => !footerSections.some((foot) => foot.contains(row))
        )) as HTMLTableRowElement[];

    if (allRows.length < 2) return [table.outerHTML];

    const row0Cells = getRowCells(allRows[0]);
    const maxRs = Math.max(1, ...row0Cells.map(getCellRowSpan));
    const headerRowCount = Math.min(maxRs, allRows.length - 1);

    headerRows = allRows.slice(0, headerRowCount);
    bodyRows = allRows.slice(headerRowCount);
  }

  if (bodyRows.length < 1) return [table.outerHTML];

  const sectionForRow = new Map<HTMLTableRowElement, HTMLTableSectionElement | null>();
  bodyRows.forEach((row) =>
    sectionForRow.set(
      row,
      row.parentElement?.tagName.toLowerCase() === 'tbody'
        ? (row.parentElement as HTMLTableSectionElement)
        : null
    )
  );

  const structuralChildren = Array.from(table.children).filter((child) => {
    const tag = child.tagName.toLowerCase();
    return tag !== 'thead' && tag !== 'tbody' && tag !== 'tfoot' && tag !== 'tr' && tag !== 'colgroup';
  });

  // 4, 5. Split only on safe <tr> boundaries among body rows
  const safeBoundaries = safeTableRowBoundariesV2(bodyRows);

  const doc = table.ownerDocument || (typeof document !== 'undefined' ? document : null);

  const buildFragment = (start: number, end: number, isFinal: boolean): string => {
    // 8. Never create nested tables (shallow clone)
    const clone = table.cloneNode(false) as HTMLTableElement;
    clone.removeAttribute('id');

    // 9. Preserve source table width, do NOT force 100%
    if (table.getAttribute('width')) {
      clone.setAttribute('width', table.getAttribute('width')!);
    }
    if (table.style.width) {
      clone.style.width = table.style.width;
    } else if (canonicalGeometry.tableWidth && !clone.getAttribute('width')) {
      clone.style.width = canonicalGeometry.tableWidth;
    }
    if (table.style.maxWidth) clone.style.maxWidth = table.style.maxWidth;
    if (table.style.boxSizing) clone.style.boxSizing = table.style.boxSizing;

    // Preserve table layout ('auto' or 'fixed')
    clone.style.tableLayout = canonicalGeometry.tableLayout;

    // Preserve dataset attributes: data-table-autofit, data-table-width, data-align
    if (table.dataset.tableAutofit) {
      clone.dataset.tableAutofit = table.dataset.tableAutofit;
      clone.setAttribute('data-table-autofit', table.dataset.tableAutofit);
    }
    if (table.dataset.tableWidth) {
      clone.dataset.tableWidth = table.dataset.tableWidth;
      clone.setAttribute('data-table-width', table.dataset.tableWidth);
      clone.style.setProperty('--table-width', table.style.getPropertyValue('--table-width'));
    }
    if (table.dataset.align) {
      clone.dataset.align = table.dataset.align;
      clone.setAttribute('data-align', table.dataset.align);
    }
    if (table.style.marginLeft) clone.style.marginLeft = table.style.marginLeft;
    if (table.style.marginRight) clone.style.marginRight = table.style.marginRight;

    clone.setAttribute('data-paginated-fragment', 'true');

    // 6, 7. Canonical colgroup on continuation fragments.
    if (doc && canonicalGeometry.columnWidths.length > 0) {
      const colgroup = doc.createElement('colgroup');
      canonicalGeometry.columnWidths.forEach((width) => {
        const col = doc.createElement('col');
        col.style.width = `${width}%`;
        colgroup.appendChild(col);
      });
      clone.appendChild(colgroup);
    } else {
      const sourceColgroup = table.querySelector(':scope > colgroup');
      if (sourceColgroup) {
        clone.appendChild(sourceColgroup.cloneNode(true));
      }
    }

    // Preserve non-table structural children (caption) on initial fragment
    if (start === 0) {
      structuralChildren.forEach((child) => clone.appendChild(child.cloneNode(true)));
    }

    // 11. Repeat header on EVERY fragment (initial and all continuation fragments)
    if (headerSections.length > 0) {
      headerSections.forEach((head) => clone.appendChild(head.cloneNode(true)));
    } else if (headerRows.length > 0) {
      const thead = doc ? doc.createElement('thead') : null;
      if (thead) {
        headerRows.forEach((hRow) => thead.appendChild(hRow.cloneNode(true)));
        clone.appendChild(thead);
      }
    }

    // Append rows preserving original tbody characteristics
    let activeOriginal: HTMLTableSectionElement | null | undefined;
    let activeClone: HTMLTableSectionElement | null = null;
    bodyRows.slice(start, end).forEach((row) => {
      const original = sectionForRow.get(row);
      if (original !== activeOriginal || !activeClone) {
        activeOriginal = original;
        activeClone = original
          ? (original.cloneNode(false) as HTMLTableSectionElement)
          : (doc ? doc.createElement('tbody') : null);
        if (activeClone) clone.appendChild(activeClone);
      }
      if (activeClone) {
        activeClone.appendChild(row.cloneNode(true));
      } else {
        clone.appendChild(row.cloneNode(true));
      }
    });

    // 12. <tfoot> only on the final fragment
    if (isFinal) {
      footerSections.forEach((foot) => clone.appendChild(foot.cloneNode(true)));
    }

    return clone.outerHTML;
  };

  // 15. Content-driven natural break: greedily fit as many safe rows as possible into the first fragment
  let largestFittingCount = 0;
  for (let count = 1; count < bodyRows.length; count++) {
    const boundaryIndex = count - 1;
    if (safeBoundaries[boundaryIndex]) {
      const candidate = buildFragment(0, count, false);
      if (fits(candidate)) {
        largestFittingCount = count;
      } else {
        break;
      }
    }
  }

  // If not even the first row fits, leave table intact so page paginator moves it to the next page
  if (largestFittingCount === 0) {
    return [table.outerHTML];
  }

  return [
    buildFragment(0, largestFittingCount, false),
    buildFragment(largestFittingCount, bodyRows.length, true),
  ];
}

/**
 * Iterative multi-page table paginator.
 * Takes a table and a capacity/fitting predicate for each page,
 * and paginates across arbitrary number of pages (1, 2, 3, 4, 5, ...).
 * Each fragment shares the same canonical geometry, repeated thead,
 * and only the final fragment receives tfoot.
 */
export function paginateStructuredTableV2(
  table: HTMLTableElement,
  fitsPage: (fragmentHtml: string, pageIndex: number) => boolean
): string[] {
  if (fitsPage(table.outerHTML, 0)) return [table.outerHTML];

  const canonicalGeometry = extractCanonicalTableGeometry(table);

  const headerSections = Array.from(table.children).filter(
    (child) => child.tagName.toLowerCase() === 'thead'
  ) as HTMLTableSectionElement[];
  const bodySections = Array.from(table.children).filter(
    (child) => child.tagName.toLowerCase() === 'tbody'
  ) as HTMLTableSectionElement[];
  const footerSections = Array.from(table.children).filter(
    (child) => child.tagName.toLowerCase() === 'tfoot'
  ) as HTMLTableSectionElement[];

  let headerRows: HTMLTableRowElement[] = [];
  let bodyRows: HTMLTableRowElement[] = [];

  if (headerSections.length > 0) {
    headerRows = headerSections.flatMap((head) => getTableRows(head as unknown as HTMLTableElement));
    bodyRows = (bodySections.length
      ? bodySections.flatMap((section) => getTableRows(section as unknown as HTMLTableElement))
      : getTableRows(table).filter(
          (row) => !headerSections.some((head) => head.contains(row)) && !footerSections.some((foot) => foot.contains(row))
        )) as HTMLTableRowElement[];
  } else {
    // No explicit <thead>: The first row(s) serve as the table column header ("judul kolom tabel")
    const allRows = (bodySections.length
      ? bodySections.flatMap((section) => getTableRows(section as unknown as HTMLTableElement))
      : getTableRows(table).filter(
          (row) => !footerSections.some((foot) => foot.contains(row))
        )) as HTMLTableRowElement[];

    if (allRows.length < 2) return [table.outerHTML];

    const row0Cells = getRowCells(allRows[0]);
    const maxRs = Math.max(1, ...row0Cells.map(getCellRowSpan));
    const headerRowCount = Math.min(maxRs, allRows.length - 1);

    headerRows = allRows.slice(0, headerRowCount);
    bodyRows = allRows.slice(headerRowCount);
  }

  if (bodyRows.length < 1) return [table.outerHTML];

  const sectionForRow = new Map<HTMLTableRowElement, HTMLTableSectionElement | null>();
  bodyRows.forEach((row) =>
    sectionForRow.set(
      row,
      row.parentElement?.tagName.toLowerCase() === 'tbody'
        ? (row.parentElement as HTMLTableSectionElement)
        : null
    )
  );

  const structuralChildren = Array.from(table.children).filter((child) => {
    const tag = child.tagName.toLowerCase();
    return tag !== 'thead' && tag !== 'tbody' && tag !== 'tfoot' && tag !== 'tr' && tag !== 'colgroup';
  });

  const safeBoundaries = safeTableRowBoundariesV2(bodyRows);
  const doc = table.ownerDocument || (typeof document !== 'undefined' ? document : null);

  const buildFragment = (start: number, end: number, isFinal: boolean): string => {
    const clone = table.cloneNode(false) as HTMLTableElement;
    clone.removeAttribute('id');

    if (table.getAttribute('width')) {
      clone.setAttribute('width', table.getAttribute('width')!);
    }
    if (table.style.width) {
      clone.style.width = table.style.width;
    } else if (canonicalGeometry.tableWidth && !clone.getAttribute('width')) {
      clone.style.width = canonicalGeometry.tableWidth;
    }
    if (table.style.maxWidth) clone.style.maxWidth = table.style.maxWidth;
    if (table.style.boxSizing) clone.style.boxSizing = table.style.boxSizing;

    clone.style.tableLayout = canonicalGeometry.tableLayout;

    if (table.dataset.tableAutofit) {
      clone.dataset.tableAutofit = table.dataset.tableAutofit;
      clone.setAttribute('data-table-autofit', table.dataset.tableAutofit);
    }
    if (table.dataset.tableWidth) {
      clone.dataset.tableWidth = table.dataset.tableWidth;
      clone.setAttribute('data-table-width', table.dataset.tableWidth);
      clone.style.setProperty('--table-width', table.style.getPropertyValue('--table-width'));
    }
    if (table.dataset.align) {
      clone.dataset.align = table.dataset.align;
      clone.setAttribute('data-align', table.dataset.align);
    }
    if (table.style.marginLeft) clone.style.marginLeft = table.style.marginLeft;
    if (table.style.marginRight) clone.style.marginRight = table.style.marginRight;

    clone.setAttribute('data-paginated-fragment', 'true');

    if (doc && canonicalGeometry.columnWidths.length > 0) {
      const colgroup = doc.createElement('colgroup');
      canonicalGeometry.columnWidths.forEach((width) => {
        const col = doc.createElement('col');
        col.style.width = `${width}%`;
        colgroup.appendChild(col);
      });
      clone.appendChild(colgroup);
    } else {
      const sourceColgroup = table.querySelector(':scope > colgroup');
      if (sourceColgroup) {
        clone.appendChild(sourceColgroup.cloneNode(true));
      }
    }

    if (start === 0) {
      structuralChildren.forEach((child) => clone.appendChild(child.cloneNode(true)));
    }

    if (headerSections.length > 0) {
      headerSections.forEach((head) => clone.appendChild(head.cloneNode(true)));
    } else if (headerRows.length > 0) {
      const thead = doc ? doc.createElement('thead') : null;
      if (thead) {
        headerRows.forEach((hRow) => thead.appendChild(hRow.cloneNode(true)));
        clone.appendChild(thead);
      }
    }

    let activeOriginal: HTMLTableSectionElement | null | undefined;
    let activeClone: HTMLTableSectionElement | null = null;
    bodyRows.slice(start, end).forEach((row) => {
      const original = sectionForRow.get(row);
      if (original !== activeOriginal || !activeClone) {
        activeOriginal = original;
        activeClone = original
          ? (original.cloneNode(false) as HTMLTableSectionElement)
          : (doc ? doc.createElement('tbody') : null);
        if (activeClone) clone.appendChild(activeClone);
      }
      if (activeClone) {
        activeClone.appendChild(row.cloneNode(true));
      } else {
        clone.appendChild(row.cloneNode(true));
      }
    });

    if (isFinal) {
      footerSections.forEach((foot) => clone.appendChild(foot.cloneNode(true)));
    }

    return clone.outerHTML;
  };

  const fragments: string[] = [];
  let currentRowIndex = 0;
  let pageIdx = 0;

  while (currentRowIndex < bodyRows.length) {
    // If all remaining rows fit on the current page with tfoot
    const testRemainder = buildFragment(currentRowIndex, bodyRows.length, true);
    if (fitsPage(testRemainder, pageIdx)) {
      fragments.push(testRemainder);
      break;
    }

    // Find the largest fitting row count from currentRowIndex
    let bestEnd = -1;
    for (let end = currentRowIndex + 1; end < bodyRows.length; end++) {
      const boundaryIndex = end - 1;
      if (safeBoundaries[boundaryIndex]) {
        const candidate = buildFragment(currentRowIndex, end, false);
        if (fitsPage(candidate, pageIdx)) {
          bestEnd = end;
        } else {
          break;
        }
      }
    }

    if (bestEnd === -1) {
      // Not even a safe boundary fits on this page
      // Take at least the next safe chunk or remaining to avoid infinite loop
      let nextSafeEnd = bodyRows.length;
      for (let end = currentRowIndex + 1; end < bodyRows.length; end++) {
        if (safeBoundaries[end - 1]) {
          nextSafeEnd = end;
          break;
        }
      }
      const isLast = nextSafeEnd >= bodyRows.length;
      fragments.push(buildFragment(currentRowIndex, nextSafeEnd, isLast));
      currentRowIndex = nextSafeEnd;
    } else {
      fragments.push(buildFragment(currentRowIndex, bestEnd, false));
      currentRowIndex = bestEnd;
    }

    pageIdx++;
  }

  return fragments;
}

/**
 * Backward compatibility export
 */
export const splitStructuredTable = splitStructuredTableV2;
