import { tableGrid } from './editorTableCommands';

export const MIN_TABLE_COLUMN_PX = 32;
export const MIN_TABLE_ROW_PX = 12;
export const MIN_TABLE_WIDTH_PX = 80;
const OUTER_EDGE_HIT_PX = 7;

const roundPercent = (value: number) => Number(value.toFixed(4));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type OuterTableEdge = 'left' | 'right' | 'top' | 'bottom';
type OuterResizeDrag = {
  edge: OuterTableEdge;
  pointerId: number;
  startX: number;
  startY: number;
  editorWidth: number;
  startLeft: number;
  startWidth: number;
  startRowHeight: number;
  row: HTMLTableRowElement | null;
  snapshot: string;
};

const outerResizeInstalled = new WeakSet<HTMLTableElement>();

/** Return the nearest draggable outer table edge under a pointer. */
export function tableOuterEdgeAtPoint(
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  clientX: number,
  clientY: number,
  tolerance = OUTER_EDGE_HIT_PX,
): OuterTableEdge | null {
  const distances: Array<[OuterTableEdge, number]> = [
    ['left', Math.abs(clientX - rect.left)],
    ['right', Math.abs(clientX - rect.right)],
    ['top', Math.abs(clientY - rect.top)],
    ['bottom', Math.abs(clientY - rect.bottom)],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][1] <= tolerance ? distances[0][0] : null;
}

/**
 * Read the browser's physical cell borders instead of assuming that authored
 * colgroup percentages equal the rendered grid. This keeps resize guides on
 * top of the black table borders for imported/AutoFit tables and also absorbs
 * browser sub-pixel rounding.
 */
export function renderedLogicalColumnWidths(
  table: HTMLTableElement,
  fallbackWidths: readonly number[],
): number[] {
  const count = fallbackWidths.length;
  if (!count) return [];
  const tableRect = table.getBoundingClientRect();
  if (!Number.isFinite(tableRect.width) || tableRect.width <= 0) return [...fallbackWidths];

  const grid = tableGrid(table);
  const boundaries = new Array<number>(count + 1).fill(Number.NaN);
  boundaries[0] = 0;
  boundaries[count] = tableRect.width;

  let fallbackCursor = 0;
  for (let boundary = 1; boundary < count; boundary += 1) {
    fallbackCursor += fallbackWidths[boundary - 1] || 0;
    const samples: number[] = [];
    grid.forEach((row) => {
      const leftCell = row[boundary - 1];
      const rightCell = row[boundary];
      if (!leftCell || !rightCell || leftCell === rightCell) return;
      const cellRect = leftCell.getBoundingClientRect();
      const position = cellRect.right - tableRect.left;
      if (Number.isFinite(position) && position > 0 && position < tableRect.width) samples.push(position);
    });

    if (samples.length) {
      samples.sort((a, b) => a - b);
      boundaries[boundary] = samples[Math.floor(samples.length / 2)];
    } else {
      boundaries[boundary] = tableRect.width * fallbackCursor / 100;
    }
  }

  for (let index = 1; index < boundaries.length; index += 1) {
    if (!Number.isFinite(boundaries[index]) || boundaries[index] <= boundaries[index - 1]) {
      return [...fallbackWidths];
    }
  }

  const widths = boundaries.slice(1).map((boundary, index) => boundary - boundaries[index]);
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (!Number.isFinite(total) || total <= 0 || widths.some((width) => width <= 0)) return [...fallbackWidths];
  return widths.map((width) => roundPercent(width / total * 100));
}

const setExplicitTableHorizontalGeometry = (
  table: HTMLTableElement,
  editorWidth: number,
  leftPx: number,
  widthPx: number,
) => {
  const safeEditorWidth = Math.max(1, editorWidth);
  const leftPercent = roundPercent(clamp(leftPx / safeEditorWidth * 100, 0, 100));
  const widthPercent = roundPercent(clamp(widthPx / safeEditorWidth * 100, 0, 100 - leftPercent));
  delete table.dataset.tableAutofit;
  table.dataset.tableLeft = String(leftPercent);
  table.dataset.tableWidth = String(widthPercent);
  table.style.setProperty('--table-width', `${widthPercent}%`);
  table.style.marginLeft = `${leftPercent}%`;
  table.style.marginRight = 'auto';
  table.style.tableLayout = 'fixed';
};

const commitOuterResizeAsNativeEdit = (
  table: HTMLTableElement,
  editor: HTMLElement,
  snapshot: string,
) => {
  if (table.outerHTML === snapshot) return;
  const doc = table.ownerDocument;
  const staging = doc.createElement('div');
  staging.innerHTML = snapshot;
  const original = staging.firstElementChild as HTMLTableElement | null;
  if (!original || !table.parentNode) return;

  const marker = `table-outer-geometry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  table.dataset.outerGeometryMarker = marker;
  const finalHtml = table.outerHTML;
  delete table.dataset.outerGeometryMarker;

  table.replaceWith(original);
  const selection = doc.getSelection?.();
  const range = doc.createRange();
  range.selectNode(original);
  selection?.removeAllRanges();
  selection?.addRange(range);

  let committed = false;
  try {
    committed = Boolean(doc.execCommand?.('insertHTML', false, finalHtml));
  } catch {
    committed = false;
  }

  if (!committed) {
    original.outerHTML = finalHtml;
  }
  const next = editor.querySelector<HTMLTableElement>(`table[data-outer-geometry-marker="${marker}"]`);
  next?.removeAttribute('data-outer-geometry-marker');
  // React's contentEditable pipeline serializes only after the temporary marker
  // is gone, and the resize therefore becomes one discrete document change.
  editor.dispatchEvent(new Event('input', { bubbles: true }));
};

/**
 * Make the actual outer black table border draggable. The listener is attached
 * only once per live table and keeps transient cursor/drag state out of saved
 * document HTML. Horizontal outer edges resize/reposition the whole table;
 * top/bottom edges resize the first/last row floor.
 */
function ensureOuterTableBorderResize(table: HTMLTableElement): void {
  if (outerResizeInstalled.has(table) || typeof window === 'undefined') return;
  outerResizeInstalled.add(table);

  let drag: OuterResizeDrag | null = null;
  const doc = table.ownerDocument;
  const setCursor = (edge: OuterTableEdge | null) => {
    if (!doc.body) return;
    doc.body.style.cursor = edge === 'left' || edge === 'right' ? 'col-resize' : edge ? 'row-resize' : '';
  };
  const refreshOverlay = () => window.dispatchEvent(new Event('resize'));

  table.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const editor = table.closest<HTMLElement>('[contenteditable="true"]');
    if (!editor) return;
    const rect = table.getBoundingClientRect();
    const edge = tableOuterEdgeAtPoint(rect, event.clientX, event.clientY);
    if (!edge) return;

    const editorRect = editor.getBoundingClientRect();
    const row = edge === 'top' ? table.rows[0] || null : edge === 'bottom' ? table.rows[table.rows.length - 1] || null : null;
    drag = {
      edge,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      editorWidth: editorRect.width,
      startLeft: rect.left - editorRect.left,
      startWidth: rect.width,
      startRowHeight: row?.getBoundingClientRect().height || 0,
      row,
      snapshot: table.outerHTML,
    };
    event.preventDefault();
    table.setPointerCapture?.(event.pointerId);
    setCursor(edge);
  });

  table.addEventListener('pointermove', (event) => {
    if (!drag) {
      setCursor(tableOuterEdgeAtPoint(table.getBoundingClientRect(), event.clientX, event.clientY));
      return;
    }
    if (event.pointerId !== drag.pointerId) return;
    event.preventDefault();

    if (drag.edge === 'left' || drag.edge === 'right') {
      const startRight = drag.startLeft + drag.startWidth;
      let nextLeft = drag.startLeft;
      let nextWidth = drag.startWidth;
      if (drag.edge === 'left') {
        nextLeft = clamp(drag.startLeft + event.clientX - drag.startX, 0, startRight - MIN_TABLE_WIDTH_PX);
        nextWidth = startRight - nextLeft;
      } else {
        nextWidth = clamp(drag.startWidth + event.clientX - drag.startX, MIN_TABLE_WIDTH_PX, drag.editorWidth - drag.startLeft);
      }
      setExplicitTableHorizontalGeometry(table, drag.editorWidth, nextLeft, nextWidth);
    } else if (drag.row) {
      const delta = event.clientY - drag.startY;
      setRowMinimumHeight(drag.row, drag.startRowHeight + (drag.edge === 'top' ? -delta : delta));
    }
    refreshOverlay();
  });

  const finish = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const completed = drag;
    drag = null;
    try {
      if (table.hasPointerCapture?.(event.pointerId)) table.releasePointerCapture(event.pointerId);
    } catch {
      // Detached DOM or browser-specific pointer capture cleanup.
    }
    setCursor(null);
    const editor = table.closest<HTMLElement>('[contenteditable="true"]');
    if (editor) commitOuterResizeAsNativeEdit(table, editor, completed.snapshot);
    refreshOverlay();
  };

  table.addEventListener('pointerup', finish);
  table.addEventListener('pointercancel', finish);
  table.addEventListener('pointerleave', (event) => {
    if (!drag) setCursor(null);
    else if (event.pointerId === drag.pointerId) setCursor(drag.edge);
  });
}

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
  ensureOuterTableBorderResize(table);
  return existing;
}

export function logicalColumnWidths(table: HTMLTableElement): number[] {
  const authored = ensureLogicalColumns(table).map((col) => Number.parseFloat(col.style.width));
  return renderedLogicalColumnWidths(table, authored);
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
