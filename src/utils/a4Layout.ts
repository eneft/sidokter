/** Canonical geometry used by Live SPO, Preview and Chromium PDF. */
export const SPO_A4 = {
  widthMm: 210,
  heightMm: 297,
  marginTopMm: 20,
  marginRightMm: 20,
  marginBottomMm: 20,
  marginLeftMm: 30,
  contentWidthMm: 160,
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

/** Normalize imported absolute column geometry without changing table semantics. */
export function normalizeStructuredTables(root: ParentNode): void {
  root.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    if (isFullContentWidthTable(table)) table.style.width = '100%';
    table.style.maxWidth = '100%';
    table.style.tableLayout = 'fixed';
    table.style.boxSizing = 'border-box';
    const cols = Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'));
    const values = cols.map((col) => numericWidth(col.style.width || col.getAttribute('width')));
    const total = values.reduce<number>((sum, value) => sum + (value || 0), 0);
    if (total > 0 && values.every((value) => value !== null)) {
      cols.forEach((col, index) => {
        col.style.width = `${((values[index] as number) / total) * 100}%`;
        col.removeAttribute('width');
      });
    }
    const value = table.dataset.align || table.dataset.docxAlign || table.getAttribute('align');
    applyTableAlignment(table, value === 'center' || value === 'right' ? value : 'left');
  });
}

export function applyTableAlignment(table: HTMLTableElement, alignment: TableAlignment): void {
  table.dataset.align = alignment;
  table.removeAttribute('align');
  table.style.marginLeft = alignment === 'left' ? '0' : 'auto';
  table.style.marginRight = alignment === 'right' ? '0' : 'auto';
}

export function normalizeStructuredHtml(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  normalizeStructuredTables(doc.body);
  return doc.body.innerHTML;
}
