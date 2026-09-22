export type TableCommand =
  | 'add-row-before' | 'add-row' | 'add-column-before' | 'add-column'
  | 'delete-row' | 'delete-column'
  | 'merge-right' | 'merge-down' | 'split-cell' | 'delete-table';

export type MergeDirection = 'right' | 'down';
export type { TableAlignment } from './a4Layout';

type Slot = { cell: HTMLTableCellElement; originRow: number; originCol: number };
type CellLocation = { grid: Slot[][]; rowIndex: number; colIndex: number };

const span = (cell: HTMLTableCellElement, name: 'rowSpan' | 'colSpan') => Math.max(1, cell[name] || 1);
const roundPercent = (value: number) => Number(value.toFixed(4));

/** Build a logical grid; every covered coordinate points at its originating cell. */
export function tableGrid(table: HTMLTableElement): Slot[][] {
  const grid: Slot[][] = [];
  Array.from(table.rows).forEach((row, r) => {
    grid[r] ||= [];
    let c = 0;
    Array.from(row.cells).forEach((cell) => {
      while (grid[r][c]) c++;
      const rs = span(cell, 'rowSpan');
      const cs = span(cell, 'colSpan');
      for (let y = r; y < r + rs; y++) {
        grid[y] ||= [];
        for (let x = c; x < c + cs; x++) grid[y][x] = { cell, originRow: r, originCol: c };
      }
      c += cs;
    });
  });
  return grid;
}

const locateCell = (table: HTMLTableElement, cell: HTMLTableCellElement): CellLocation | null => {
  const grid = tableGrid(table);
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length || 0); c++) {
      const slot = grid[r]?.[c];
      if (slot?.cell === cell && slot.originRow === r && slot.originCol === c) {
        return { grid, rowIndex: r, colIndex: c };
      }
    }
  }
  return null;
};

const nodeHasMeaningfulContent = (node: Node): boolean => {
  if (node.nodeType === Node.TEXT_NODE) return Boolean((node.textContent || '').trim());
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const element = node as Element;
  if (element.tagName === 'BR') return false;
  if (element.matches('img,figure,table,svg,canvas,video,audio,hr')) return true;
  return Array.from(element.childNodes).some(nodeHasMeaningfulContent);
};

const cellHasMeaningfulContent = (cell: HTMLTableCellElement): boolean =>
  Array.from(cell.childNodes).some(nodeHasMeaningfulContent);

/** Move all meaningful source content, including image-only/figure-only cells. */
const appendContent = (target: HTMLTableCellElement, source: HTMLTableCellElement) => {
  if (!cellHasMeaningfulContent(source)) return;
  if (!cellHasMeaningfulContent(target)) target.replaceChildren();
  else target.appendChild(target.ownerDocument.createElement('br'));
  while (source.firstChild) target.appendChild(source.firstChild);
};

function insertAtLogicalColumn(row: HTMLTableRowElement, cell: HTMLTableCellElement, column: number, gridRow: Slot[]) {
  const next = gridRow.find((slot) => slot.originCol >= column && slot.originRow === row.rowIndex)?.cell;
  row.insertBefore(cell, next || null);
}

const authoredColumnWidths = (table: HTMLTableElement, expectedCount: number): number[] | null => {
  const cols = Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'));
  if (!expectedCount || cols.length !== expectedCount) return null;
  const parsed = cols.map((col) => Number.parseFloat(col.style.width || col.getAttribute('width') || ''));
  if (parsed.some((width) => !Number.isFinite(width) || width <= 0)) return null;
  const total = parsed.reduce((sum, width) => sum + width, 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  return parsed.map((width) => roundPercent(width / total * 100));
};

const writeColumnWidths = (table: HTMLTableElement, widths: readonly number[]) => {
  const cols = Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'));
  if (cols.length !== widths.length || !widths.length) return;
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (!Number.isFinite(total) || total <= 0) return;
  cols.forEach((col, index) => {
    col.style.width = `${roundPercent(widths[index] / total * 100)}%`;
    col.removeAttribute('width');
  });
};

const mergeCandidate = (
  cell: HTMLTableCellElement,
  direction: MergeDirection,
): { other: Slot; rowIndex: number; colIndex: number } | null => {
  const table = cell.closest('table') as HTMLTableElement | null;
  if (!table) return null;
  const location = locateCell(table, cell);
  if (!location) return null;
  const { grid, rowIndex, colIndex } = location;
  const other = direction === 'right'
    ? grid[rowIndex]?.[colIndex + span(cell, 'colSpan')]
    : grid[rowIndex + span(cell, 'rowSpan')]?.[colIndex];
  if (!other || other.cell === cell) return null;
  const sameHeight = span(cell, 'rowSpan') === span(other.cell, 'rowSpan') && other.originRow === rowIndex;
  const sameWidth = span(cell, 'colSpan') === span(other.cell, 'colSpan') && other.originCol === colIndex;
  if ((direction === 'right' && !sameHeight) || (direction === 'down' && !sameWidth)) return null;
  return { other, rowIndex, colIndex };
};

export const canMergeCell = (cell: HTMLTableCellElement, direction: MergeDirection): boolean =>
  Boolean(mergeCandidate(cell, direction));

export function createSemanticTable(rows: number, columns: number): HTMLTableElement {
  const table = document.createElement('table');
  table.style.width = '100%';
  table.setAttribute('data-editor-table', 'true');
  const colgroup = document.createElement('colgroup');
  for (let c = 0; c < columns; c++) {
    const col = document.createElement('col');
    col.style.width = `${100 / columns}%`;
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);
  const body = table.createTBody();
  for (let r = 0; r < rows; r++) {
    const row = body.insertRow();
    for (let c = 0; c < columns; c++) row.insertCell().appendChild(document.createElement('br'));
  }
  return table;
}

/** Deterministic, span-aware structural mutations. Returns the cell to focus. */
export function mutateTable(cell: HTMLTableCellElement, command: TableCommand): HTMLTableCellElement | null {
  const table = cell.closest('table') as HTMLTableElement | null;
  if (!table) return null;
  const location = locateCell(table, cell);
  if (!location) return null;
  const { grid, rowIndex, colIndex } = location;

  if (command === 'delete-table') { table.remove(); return null; }

  if (command === 'add-row' || command === 'add-row-before') {
    const boundary = command === 'add-row-before' ? rowIndex : rowIndex + span(cell, 'rowSpan');
    const row = table.insertRow(Math.min(boundary, table.rows.length));
    const width = Math.max(0, ...grid.map((gridRow) => gridRow.length));
    const extended = new Set<HTMLTableCellElement>();
    for (let c = 0; c < width; c++) {
      const above = grid[boundary - 1]?.[c];
      if (above && above.originRow + span(above.cell, 'rowSpan') > boundary) {
        if (!extended.has(above.cell)) {
          above.cell.rowSpan += 1;
          extended.add(above.cell);
        }
      } else {
        row.insertCell().appendChild(document.createElement('br'));
      }
    }
    return row.cells[0] || cell;
  }

  if (command === 'add-column' || command === 'add-column-before') {
    const logicalCount = Math.max(0, ...grid.map((gridRow) => gridRow.length));
    const previousWidths = authoredColumnWidths(table, logicalCount);
    const boundary = command === 'add-column-before' ? colIndex : colIndex + span(cell, 'colSpan');
    const donorIndex = command === 'add-column-before'
      ? Math.min(colIndex, Math.max(0, logicalCount - 1))
      : Math.min(Math.max(0, boundary - 1), Math.max(0, logicalCount - 1));
    const widened = new Set<HTMLTableCellElement>();

    Array.from(table.rows).forEach((row, r) => {
      const covering = grid[r]?.[boundary - 1];
      if (covering && covering.originCol + span(covering.cell, 'colSpan') > boundary) {
        if (!widened.has(covering.cell)) {
          covering.cell.colSpan += 1;
          widened.add(covering.cell);
        }
      } else if (!grid[r]?.[boundary] || grid[r][boundary].originRow === r) {
        const fresh = document.createElement(row.cells[0]?.tagName.toLowerCase() === 'th' ? 'th' : 'td') as HTMLTableCellElement;
        fresh.appendChild(document.createElement('br'));
        insertAtLogicalColumn(row, fresh, boundary, grid[r] || []);
      }
    });

    const cols = Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'));
    if (cols.length) {
      const fresh = document.createElement('col');
      cols[0].parentElement?.insertBefore(fresh, cols[boundary] || null);
      if (previousWidths && previousWidths[donorIndex] > 0) {
        const nextWidths = [...previousWidths];
        const insertedWidth = nextWidths[donorIndex] / 2;
        nextWidths[donorIndex] -= insertedWidth;
        nextWidths.splice(boundary, 0, insertedWidth);
        writeColumnWidths(table, nextWidths);
      }
    }
    return cell;
  }

  if (command === 'delete-row') {
    if (table.rows.length === 1) { table.remove(); return null; }
    const row = table.rows[rowIndex];
    const origins = Array.from(row.cells).map((origin) => ({ origin, rowSpan: span(origin, 'rowSpan') }));
    const crossing = new Set<HTMLTableCellElement>();
    grid[rowIndex].forEach((slot) => {
      if (slot.originRow < rowIndex) crossing.add(slot.cell);
    });
    crossing.forEach((crossingCell) => {
      crossingCell.rowSpan = Math.max(1, span(crossingCell, 'rowSpan') - 1);
    });
    origins.forEach(({ origin, rowSpan }) => {
      if (rowSpan > 1) {
        origin.rowSpan = rowSpan - 1;
        const targetRow = table.rows[rowIndex + 1];
        if (targetRow) {
          insertAtLogicalColumn(targetRow, origin, grid[rowIndex].findIndex((slot) => slot.cell === origin), grid[rowIndex + 1] || []);
        }
      }
    });
    row.remove();
    return table.rows[Math.min(rowIndex, table.rows.length - 1)]?.cells[0] || null;
  }

  if (command === 'delete-column') {
    const logicalCount = Math.max(0, ...grid.map((gridRow) => gridRow.length));
    const previousWidths = authoredColumnWidths(table, logicalCount);
    const victims = new Set(grid.map((gridRow) => gridRow[colIndex]?.cell).filter(Boolean));
    victims.forEach((victim) => span(victim, 'colSpan') > 1 ? victim.colSpan -= 1 : victim.remove());

    table.querySelectorAll(':scope > colgroup > col')[colIndex]?.remove();
    if (previousWidths && previousWidths.length > 1) {
      const nextWidths = [...previousWidths];
      const [removedWidth] = nextWidths.splice(colIndex, 1);
      const recipient = colIndex > 0 ? colIndex - 1 : 0;
      if (nextWidths[recipient] !== undefined) nextWidths[recipient] += removedWidth;
      writeColumnWidths(table, nextWidths);
    }

    const nextGrid = tableGrid(table);
    const nextLogicalCount = Math.max(0, ...nextGrid.map((gridRow) => gridRow.length));
    if (!nextLogicalCount || !table.rows[0]?.cells.length) { table.remove(); return null; }
    return table.rows[Math.min(rowIndex, table.rows.length - 1)]?.cells[0] || null;
  }

  if (command === 'merge-right' || command === 'merge-down') {
    const direction: MergeDirection = command === 'merge-right' ? 'right' : 'down';
    const candidate = mergeCandidate(cell, direction);
    if (!candidate) return cell;
    appendContent(cell, candidate.other.cell);
    if (direction === 'right') cell.colSpan += span(candidate.other.cell, 'colSpan');
    else cell.rowSpan += span(candidate.other.cell, 'rowSpan');
    candidate.other.cell.remove();
    return cell;
  }

  if (command === 'split-cell') {
    const rs = span(cell, 'rowSpan');
    const cs = span(cell, 'colSpan');
    if (rs === 1 && cs === 1) return cell;
    cell.rowSpan = 1;
    cell.colSpan = 1;
    for (let r = rowIndex; r < rowIndex + rs; r++) {
      for (let c = colIndex; c < colIndex + cs; c++) {
        if (r === rowIndex && c === colIndex) continue;
        const row = table.rows[r];
        if (!row) continue;
        const fresh = document.createElement(cell.tagName.toLowerCase()) as HTMLTableCellElement;
        fresh.appendChild(document.createElement('br'));
        insertAtLogicalColumn(row, fresh, c, tableGrid(table)[r] || []);
      }
    }
    return cell;
  }

  return cell;
}
