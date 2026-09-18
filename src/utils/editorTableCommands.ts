export type TableCommand =
  | 'add-row' | 'add-column' | 'delete-row' | 'delete-column'
  | 'merge-right' | 'merge-down' | 'split-cell' | 'delete-table';

type Slot = { cell: HTMLTableCellElement; originRow: number; originCol: number };

const span = (cell: HTMLTableCellElement, name: 'rowSpan' | 'colSpan') => Math.max(1, cell[name] || 1);

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

const appendContent = (target: HTMLTableCellElement, source: HTMLTableCellElement) => {
  if (!source.childNodes.length || !(source.textContent || '').trim()) return;
  if (target.childNodes.length && (target.textContent || '').trim()) target.appendChild(document.createElement('br'));
  while (source.firstChild) target.appendChild(source.firstChild);
};

function insertAtLogicalColumn(row: HTMLTableRowElement, cell: HTMLTableCellElement, column: number, gridRow: Slot[]) {
  const next = gridRow.find((slot) => slot.originCol >= column && slot.originRow === row.rowIndex)?.cell;
  row.insertBefore(cell, next || null);
}

export function createSemanticTable(rows: number, columns: number): HTMLTableElement {
  const table = document.createElement('table');
  table.style.width = '100%';
  table.setAttribute('data-editor-table', 'true');
  const colgroup = table.createTHead ? document.createElement('colgroup') : document.createElement('colgroup');
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
  let grid = tableGrid(table);
  const location = grid.flat().find((slot) => slot?.cell === cell && slot.originRow === grid.indexOf(grid.find(row => row.some(s => s?.cell === cell))!));
  let rowIndex = -1, colIndex = -1;
  grid.some((row, r) => row.some((slot, c) => {
    if (slot?.cell === cell && slot.originRow === r && slot.originCol === c) { rowIndex = r; colIndex = c; return true; }
    return false;
  }));
  if (!location || rowIndex < 0) return null;

  if (command === 'delete-table') { table.remove(); return null; }
  if (command === 'add-row') {
    const boundary = rowIndex + span(cell, 'rowSpan');
    const row = table.insertRow(Math.min(boundary, table.rows.length));
    const width = Math.max(...grid.map(r => r.length));
    for (let c = 0; c < width; c++) {
      const above = grid[boundary - 1]?.[c];
      if (above && above.originRow + span(above.cell, 'rowSpan') > boundary) {
        if (c === above.originCol) above.cell.rowSpan += 1;
      } else row.insertCell().appendChild(document.createElement('br'));
    }
    return row.cells[0] || cell;
  }
  if (command === 'add-column') {
    const boundary = colIndex + span(cell, 'colSpan');
    const widened = new Set<HTMLTableCellElement>();
    Array.from(table.rows).forEach((row, r) => {
      const covering = grid[r]?.[boundary - 1];
      if (covering && covering.originCol + span(covering.cell, 'colSpan') > boundary) {
        if (!widened.has(covering.cell)) { covering.cell.colSpan += 1; widened.add(covering.cell); }
      } else if (!grid[r]?.[boundary] || grid[r][boundary].originRow === r) {
        const fresh = document.createElement(row.cells[0]?.tagName.toLowerCase() === 'th' ? 'th' : 'td') as HTMLTableCellElement;
        fresh.appendChild(document.createElement('br'));
        insertAtLogicalColumn(row, fresh, boundary, grid[r] || []);
      }
    });
    const cols = table.querySelectorAll(':scope > colgroup > col');
    if (cols.length) {
      const fresh = document.createElement('col');
      cols[0].parentElement?.insertBefore(fresh, cols[boundary] || null);
      table.querySelectorAll(':scope > colgroup > col').forEach((col) => (col as HTMLElement).style.width = `${100 / (cols.length + 1)}%`);
    }
    return cell;
  }
  if (command === 'delete-row') {
    if (table.rows.length === 1) { table.remove(); return null; }
    const row = table.rows[rowIndex];
    const origins = Array.from(row.cells).map(origin => ({ origin, rowSpan: span(origin, 'rowSpan') }));
    grid[rowIndex].forEach((slot) => {
      if (slot.originRow < rowIndex && slot.originCol === grid[rowIndex].indexOf(slot)) slot.cell.rowSpan -= 1;
    });
    origins.forEach(({ origin, rowSpan }) => {
      if (rowSpan > 1) {
        origin.rowSpan = rowSpan - 1;
        insertAtLogicalColumn(table.rows[rowIndex + 1], origin, grid[rowIndex].findIndex(s => s.cell === origin), grid[rowIndex + 1]);
      }
    });
    row.remove();
    return table.rows[Math.min(rowIndex, table.rows.length - 1)]?.cells[0] || null;
  }
  if (command === 'delete-column') {
    const victims = new Set(grid.map(row => row[colIndex]?.cell).filter(Boolean));
    victims.forEach(victim => span(victim, 'colSpan') > 1 ? victim.colSpan -= 1 : victim.remove());
    table.querySelectorAll(':scope > colgroup > col')[colIndex]?.remove();
    const cols = table.querySelectorAll(':scope > colgroup > col');
    cols.forEach(col => (col as HTMLElement).style.width = `${100 / cols.length}%`);
    if (!table.rows[0]?.cells.length) { table.remove(); return null; }
    return table.rows[Math.min(rowIndex, table.rows.length - 1)].cells[0] || null;
  }
  if (command === 'merge-right' || command === 'merge-down') {
    const other = command === 'merge-right' ? grid[rowIndex]?.[colIndex + span(cell, 'colSpan')] : grid[rowIndex + span(cell, 'rowSpan')]?.[colIndex];
    if (!other || other.cell === cell) return cell;
    const sameHeight = span(cell, 'rowSpan') === span(other.cell, 'rowSpan') && other.originRow === rowIndex;
    const sameWidth = span(cell, 'colSpan') === span(other.cell, 'colSpan') && other.originCol === colIndex;
    if ((command === 'merge-right' && !sameHeight) || (command === 'merge-down' && !sameWidth)) return cell;
    appendContent(cell, other.cell);
    if (command === 'merge-right') cell.colSpan += span(other.cell, 'colSpan'); else cell.rowSpan += span(other.cell, 'rowSpan');
    other.cell.remove();
    return cell;
  }
  if (command === 'split-cell') {
    const rs = span(cell, 'rowSpan'), cs = span(cell, 'colSpan');
    if (rs === 1 && cs === 1) return cell;
    cell.rowSpan = 1; cell.colSpan = 1;
    for (let r = rowIndex; r < rowIndex + rs; r++) for (let c = colIndex; c < colIndex + cs; c++) {
      if (r === rowIndex && c === colIndex) continue;
      const fresh = document.createElement(cell.tagName.toLowerCase()) as HTMLTableCellElement;
      fresh.appendChild(document.createElement('br'));
      insertAtLogicalColumn(table.rows[r], fresh, c, tableGrid(table)[r] || []);
    }
    return cell;
  }
  return cell;
}
