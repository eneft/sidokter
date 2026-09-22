import { tableGrid } from './editorTableCommands';

export const MIN_TABLE_COLUMN_PX = 32;
export const MIN_TABLE_ROW_PX = 12;
export const MIN_TABLE_WIDTH_PX = 80;
const OUTER_EDGE_HIT_PX = 7;

const roundPercent = (value: number) => Number(value.toFixed(4));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type OuterTableEdge = 'left' | 'right';
type OuterResizeDrag = {
  edge: OuterTableEdge;
  pointerId: number;
  startX: number;
  editorWidth: number;
  startLeft: number;
  startWidth: number;
  snapshot: string;
};

const outerResizeInstalled = new WeakSet<HTMLTableElement>();

/** Return the nearest draggable horizontal outer table edge under a pointer. */
export function tableOuterEdgeAtPoint(
  rect: Pick<DOMRect, 'left' | 'right'>,
  clientX: number,
  _clientY: number,
  tolerance = OUTER_EDGE_HIT_PX,
): OuterTableEdge | null {
  const leftDistance = Math.abs(clientX - rect.left);
  const rightDistance = Math.abs(clientX - rect.right);
  const nearest: [OuterTableEdge, number] = leftDistance <= rightDistance
    ? ['left', leftDistance]
    : ['right', rightDistance];
  return nearest[1] <= tolerance ? nearest[0] : null;
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
      const leftSlot = row[boundary - 1];
      const rightSlot = row[boundary];
      if (!leftSlot || !rightSlot || leftSlot.cell === rightSlot.cell) return;
      const cellRect = leftSlot.cell.getBoundingClientRect();
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

/** Restore a cancelled drag without replacing the table DOM node. */
export function restoreTableSnapshot(table: HTMLTableElement, snapshot: string): boolean {
  const staging = table.ownerDocument.createElement('div');
  staging.innerHTML = snapshot;
  const original = staging.firstElementChild as HTMLTableElement | null;
  if (!original || original.tagName !== 'TABLE') return false;

  Array.from(table.attributes).forEach((attribute) => table.removeAttribute(attribute.name));
  Array.from(original.attributes).forEach((attribute) => table.setAttribute(attribute.name, attribute.value));
  table.replaceChildren(...Array.from(original.childNodes).map((node) => node.cloneNode(true)));
  return true;
}

const dispatchTableRebind = (table: HTMLTableElement | null) => {
  if (!table || typeof CustomEvent === 'undefined') return;
  table.dispatchEvent(new CustomEvent('sidokter:table-rebind', {
    bubbles: true,
    detail: { table },
  }));
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

  if (!committed) original.outerHTML = finalHtml;

  const next = editor.querySelector<HTMLTableElement>(`table[data-outer-geometry-marker="${marker}"]`);
  next?.removeAttribute('data-outer-geometry-marker');
  if (next) ensureOuterTableBorderResize(next);
  dispatchTableRebind(next);

  // React's contentEditable pipeline serializes only after the temporary marker
  // is gone, and the resize therefore becomes one discrete document change.
  editor.dispatchEvent(new Event('input', { bubbles: true }));
};

/**
 * Make the actual left/right black table border draggable. Row height has one
 * authoritative interaction path: the explicit row boundary handles. Avoiding
 * top/bottom outer-edge resizing prevents two controls from fighting over the
 * same row geometry and avoids the misleading "moving top border" behaviour.
 */
function ensureOuterTableBorderResize(table: HTMLTableElement): void {
  if (outerResizeInstalled.has(table) || typeof window === 'undefined') return;
  outerResizeInstalled.add(table);

  let drag: OuterResizeDrag | null = null;
  const doc = table.ownerDocument;
  const setCursor = (edge: OuterTableEdge | null) => {
    if (!doc.body) return;
    doc.body.style.cursor = edge ? 'col-resize' : '';
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
    drag = {
      edge,
      pointerId: event.pointerId,
      startX: event.clientX,
      editorWidth: editorRect.width,
      startLeft: rect.left - editorRect.left,
      startWidth: rect.width,
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
    refreshOverlay();
  });

  const releaseCapture = (event: PointerEvent) => {
    try {
      if (table.hasPointerCapture?.(event.pointerId)) table.releasePointerCapture(event.pointerId);
    } catch {
      // Detached DOM or browser-specific pointer capture cleanup.
    }
  };

  const finish = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const completed = drag;
    drag = null;
    releaseCapture(event);
    setCursor(null);
    const editor = table.closest<HTMLElement>('[contenteditable="true"]');
    if (editor) commitOuterResizeAsNativeEdit(table, editor, completed.snapshot);
    refreshOverlay();
  };

  const cancel = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const cancelled = drag;
    drag = null;
    releaseCapture(event);
    restoreTableSnapshot(table, cancelled.snapshot);
    setCursor(null);
    refreshOverlay();
  };

  table.addEventListener('pointerup', finish);
  table.addEventListener('pointercancel', cancel);
  table.addEventListener('pointerleave', (event) => {
    if (!drag) setCursor(null);
    else if (event.pointerId === drag.pointerId) setCursor(drag.edge);
  });
}

/** Attach border interactions without changing serialized table geometry. */
export function enableTableBorderResize(table: HTMLTableElement): void {
  ensureOuterTableBorderResize(table);
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
  const valid = parsed.length === count && parsed.every((width) => Number.isFinite(width) && width > 0);
  const total = valid ? parsed.reduce((sum, width) => sum + width, 0) : count;
  existing.forEach((col, index) => {
    col.style.width = `${roundPercent((valid ? parsed[index] : 1) / Math.max(1, total) * 100)}%`;
    col.removeAttribute('width');
  });
  ensureOuterTableBorderResize(table);
  return existing;
}

/**
 * Read logical column geometry. Pass ensure=false from React render paths so
 * measuring overlay guides can never mutate the contentEditable document.
 */
export function logicalColumnWidths(table: HTMLTableElement, ensure = true): number[] {
  const count = Math.max(0, ...tableGrid(table).map((row) => row.length));
  if (!count) return [];

  let authored: number[];
  if (ensure) {
    authored = ensureLogicalColumns(table).map((col) => Number.parseFloat(col.style.width));
  } else {
    const cols = Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'));
    const parsed = cols.map((col) => Number.parseFloat(col.style.width || col.getAttribute('width') || ''));
    const valid = cols.length === count && parsed.every((width) => Number.isFinite(width) && width > 0);
    if (valid) {
      const total = parsed.reduce((sum, width) => sum + width, 0);
      authored = parsed.map((width) => roundPercent(width / total * 100));
    } else {
      authored = new Array(count).fill(roundPercent(100 / count));
    }
  }
  return renderedLogicalColumnWidths(table, authored);
}

/** Move one internal boundary. Only its adjacent logical columns may change. */
export function resizeLogicalBoundary(
  widths: readonly number[], boundary: number, deltaPercent: number, minPercent: number,
): number[] {
  if (boundary < 0 || boundary >= widths.length - 1) return [...widths];
  const result = [...widths];
  const pairTotal = widths[boundary] + widths[boundary + 1];
  const safeMinimum = Math.min(Math.max(0, minPercent), pairTotal / 2);
  const left = Math.min(pairTotal - safeMinimum, Math.max(safeMinimum, widths[boundary] + deltaPercent));
  result[boundary] = roundPercent(left);
  result[boundary + 1] = roundPercent(pairTotal - left);
  return result;
}

export function applyLogicalColumnWidths(table: HTMLTableElement, widths: readonly number[]): void {
  const cols = ensureLogicalColumns(table);
  if (cols.length !== widths.length) return;
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (!Number.isFinite(total) || total <= 0 || widths.some((width) => !Number.isFinite(width) || width <= 0)) return;
  cols.forEach((col, index) => {
    col.style.width = `${roundPercent(widths[index] / total * 100)}%`;
  });
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
