import { tableGrid } from './editorTableCommands';

export const MIN_TABLE_COLUMN_PX = 32;
export const MIN_TABLE_ROW_PX = 12;

const roundPercent = (value: number) => Number(value.toFixed(4));

/** Make every semantic table use one authoritative logical column grid. */
export function ensureLogicalColumns(table: HTMLTableElement): HTMLTableColElement[] {
  const count = Math.max(0, ...tableGrid(table).map((row) => row.length));
  let group = table.querySelector<HTMLTableColElement>(':scope > colgroup');
  if (!group) {
    group = table.ownerDocument.createElement('colgroup');
    table.insertBefore(group, table.firstChild);
  }
  const existing = Array.from(group.querySelectorAll<HTMLTableColElement>(':scope > col'));
  while (existing.length < count) {
    const col = table.ownerDocument.createElement('col');
    group.appendChild(col);
    existing.push(col);
  }
  while (existing.length > count) existing.pop()?.remove();

  const parsed = existing.map((col) => Number.parseFloat(col.style.width));
  const valid = parsed.every((width) => Number.isFinite(width) && width > 0);
  const total = valid ? parsed.reduce((sum, width) => sum + width, 0) : count;
  existing.forEach((col, index) => {
    col.style.width = `${roundPercent((valid ? parsed[index] : 1) / total * 100)}%`;
    col.removeAttribute('width');
  });
  return existing;
}

export function logicalColumnWidths(table: HTMLTableElement): number[] {
  return ensureLogicalColumns(table).map((col) => Number.parseFloat(col.style.width));
}

/** Move one internal boundary. Only its adjacent logical columns may change. */
export function resizeLogicalBoundary(
  widths: readonly number[], boundary: number, deltaPercent: number, minPercent: number,
): number[] {
  if (boundary < 0 || boundary >= widths.length - 1) return [...widths];
  const result = [...widths];
  const pairTotal = widths[boundary] + widths[boundary + 1];
  const left = Math.min(pairTotal - minPercent, Math.max(minPercent, widths[boundary] + deltaPercent));
  result[boundary] = roundPercent(left);
  result[boundary + 1] = roundPercent(pairTotal - left);
  return result;
}

export function applyLogicalColumnWidths(table: HTMLTableElement, widths: readonly number[]): void {
  ensureLogicalColumns(table).forEach((col, index) => { col.style.width = `${roundPercent(widths[index])}%`; });
  delete table.dataset.tableAutofit;
  table.style.tableLayout = 'fixed';
}

/** Persist a logical row floor; min-height deliberately permits natural content growth. */
export function setRowMinimumHeight(row: HTMLTableRowElement, pixels: number): number {
  const value = Math.max(MIN_TABLE_ROW_PX, Math.round(pixels));
  row.dataset.rowMinHeight = String(value);
  row.style.minHeight = `${value}px`;
  // CSS table row `height` is a minimum constraint: taller content still grows.
  row.style.height = `${value}px`;
  return value;
}
