/** Canonical geometry used by Live SPO, Preview and Chromium PDF. */
export const SPO_A4 = {
  widthMm: 210,
  heightMm: 297,
  marginTopMm: 20,
  marginRightMm: 20,
  marginBottomMm: 20,
  marginLeftMm: 20,
  contentWidthMm: 170,
  contentHeightMm: 257,
  sectionLabelPercent: 28,
  sectionContentPercent: 72,
} as const;

export type TableAlignment = 'left' | 'center' | 'right';

/**
 * Tables created by LiveSPOEditor are authored against the complete Batang
 * Tubuh content cell.  This marker survives storage and is therefore the
 * renderer-independent width contract for Preview and PDF as well.
 *
 * Imported DOCX tables intentionally do not use this contract: their authored
 * width (which may be narrower than the cell) remains authoritative.
 */
export const isFullContentWidthTable = (table: Pick<HTMLTableElement, 'dataset'>): boolean =>
  table.dataset.editorTable === 'true';

const numericWidth = (value: string | null): number | null => {
  if (!value) return null;
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(?:px|pt|mm|cm|in|%|dxa)?$/i);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const applyExplicitTableLeft = (table: HTMLTableElement): boolean => {
  const raw = table.dataset.tableLeft;
  if (raw === undefined || raw === '') return false;
  const left = Number(raw);
  if (!Number.isFinite(left) || left < 0 || left > 100) {
    delete table.dataset.tableLeft;
    return false;
  }
  table.style.marginLeft = `${left}%`;
  table.style.marginRight = 'auto';
  return true;
};

/** Normalize imported absolute column geometry without changing table semantics. */
export function normalizeStructuredTables(root: ParentNode): void {
  root.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    if (isFullContentWidthTable(table)) table.style.width = '100%';
    table.style.maxWidth = '100%';
    table.style.boxSizing = 'border-box';
    // AutoFit tables retain their authored column hints, but allow the browser
    // to size the grid from cell content instead of forcing the fixed A4 grid.
    table.style.tableLayout = table.dataset.tableAutofit === 'true' ? 'auto' : 'fixed';
    const cols = Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'));
    let values = cols.map((col) => numericWidth(col.style.width || col.getAttribute('width')));
    const allEqual = values.length > 1 && values.every((v) => v !== null && Math.abs((v as number) - (values[0] as number)) < 0.01);

    // If colgroup is absent or contains equal placeholder widths (e.g. 20% each),
    // inspect the first row cells for explicit authored widths.
    const firstRow = table.querySelector('tr');
    const firstRowCells = Array.from(firstRow ? firstRow.querySelectorAll<HTMLTableCellElement>('th, td') : []);
    const cellValues = firstRowCells.map((cell) => numericWidth(cell.style.width || cell.getAttribute('width')));
    const hasValidCellWidths = cellValues.length > 0 && cellValues.every((v) => v !== null && v > 0);
    const cellsUnequal = hasValidCellWidths && cellValues.length > 1 && !cellValues.every((v) => Math.abs((v as number) - (cellValues[0] as number)) < 0.01);

    if (hasValidCellWidths && (allEqual || values.length === 0 || cellsUnequal)) {
      values = cellValues;
    }

    const total = values.reduce<number>((sum, value) => sum + (value || 0), 0);
    if (total > 0 && values.every((value) => value !== null)) {
      let colgroup = table.querySelector<HTMLElement>(':scope > colgroup');
      if (!colgroup) {
        colgroup = table.ownerDocument.createElement('colgroup');
        table.insertBefore(colgroup, table.firstChild);
      }
      colgroup.innerHTML = '';
      values.forEach((val) => {
        const col = table.ownerDocument.createElement('col');
        col.style.width = `${(((val as number) / total) * 100).toFixed(2)}%`;
        colgroup!.appendChild(col);
      });
    }

    // Ensure list items inside table cells inherit font-size from styled child spans
    // so bullet markers and compact rhythm remain proportional.
    table.querySelectorAll('li').forEach((li) => {
      const styledChild = li.querySelector<HTMLElement>('[style*="font-size"]');
      if (styledChild) {
        const match = styledChild.getAttribute('style')?.match(/font-size\s*:\s*([0-9.]+(?:pt|px))/i);
        if (match) {
          li.style.fontSize = match[1];
        }
      }
    });
    table.querySelectorAll<HTMLTableRowElement>('tr[data-row-min-height]').forEach((row) => {
      const minimum = Number(row.dataset.rowMinHeight);
      if (Number.isFinite(minimum) && minimum > 0) {
        row.style.minHeight = `${minimum}px`;
        row.style.height = `${minimum}px`;
      }
    });
    const value = table.dataset.align || table.dataset.docxAlign || table.getAttribute('align');
    // A manually dragged outer left/right border has exact geometry that must
    // survive Live editor -> Preview -> PDF normalization. If there is no
    // explicit horizontal position, keep the normal semantic alignment path.
    if (!applyExplicitTableLeft(table)) {
      applyTableAlignment(table, value === 'center' || value === 'right' ? value : 'left');
    }
  });
}

export function applyTableAlignment(table: HTMLTableElement, alignment: TableAlignment): void {
  // An explicit toolbar/move alignment intentionally exits manual outer-edge
  // positioning; the next normalization follows the requested alignment.
  delete table.dataset.tableLeft;
  table.dataset.align = alignment;
  table.removeAttribute('align');
  table.style.marginLeft = alignment === 'left' ? '0' : 'auto';
  table.style.marginRight = alignment === 'right' ? '0' : 'auto';
}

export function normalizeStructuredHtml(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  normalizeStructuredTables(doc.body);
  doc.body.querySelectorAll('*').forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.style) {
      if (htmlEl.style.overflow) htmlEl.style.overflow = '';
      if (htmlEl.style.overflowY) htmlEl.style.overflowY = '';
      if (htmlEl.style.overflowX) htmlEl.style.overflowX = '';
      if (htmlEl.style.maxHeight) htmlEl.style.maxHeight = '';
    }
  });
  return doc.body.innerHTML;
}
