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
 * Split a rich-text table at safe row boundaries.
 *
 * The returned fragments are complete tables: table/section/cell attributes are
 * cloned, an explicit header is repeated, and a rowspan is never cut between
 * pages. Returning one fragment means that the table must be moved intact (or,
 * for a table taller than an empty page, left to the browser rather than
 * corrupting its structure).
 */
export function splitStructuredTable(
  table: HTMLTableElement,
  fits: (html: string) => boolean
): string[] {
  if (fits(table.outerHTML)) return [table.outerHTML];

  const headerSections = Array.from(table.children).filter(
    (child) => child.tagName.toLowerCase() === 'thead'
  ) as HTMLTableSectionElement[];
  const bodySections = Array.from(table.children).filter(
    (child) => child.tagName.toLowerCase() === 'tbody'
  ) as HTMLTableSectionElement[];
  const footerSections = Array.from(table.children).filter(
    (child) => child.tagName.toLowerCase() === 'tfoot'
  ) as HTMLTableSectionElement[];

  // HTML authored without tbody is normalized by the browser to tbody. Keep a
  // defensive fallback for XML-like editor DOMs.
  const rows = (bodySections.length
    ? bodySections.flatMap((section) => Array.from(section.rows))
    : Array.from(table.rows).filter((row) => !headerSections.some((head) => head.contains(row)) && !footerSections.some((foot) => foot.contains(row)))) as HTMLTableRowElement[];

  if (rows.length < 2) return [table.outerHTML];

  const sectionForRow = new Map<HTMLTableRowElement, HTMLTableSectionElement | null>();
  rows.forEach((row) => sectionForRow.set(row, row.parentElement?.tagName.toLowerCase() === 'tbody' ? row.parentElement as HTMLTableSectionElement : null));

  const structuralChildren = Array.from(table.children).filter((child) => {
    const tag = child.tagName.toLowerCase();
    return tag !== 'thead' && tag !== 'tbody' && tag !== 'tfoot' && tag !== 'tr';
  });

  const buildFragment = (start: number, end: number, final: boolean): string => {
    const clone = table.cloneNode(false) as HTMLTableElement;
    structuralChildren.forEach((child) => clone.appendChild(child.cloneNode(true)));
    headerSections.forEach((head) => clone.appendChild(head.cloneNode(true)));

    let activeOriginal: HTMLTableSectionElement | null | undefined;
    let activeClone: HTMLTableSectionElement | null = null;
    rows.slice(start, end).forEach((row) => {
      const original = sectionForRow.get(row);
      if (original !== activeOriginal || !activeClone) {
        activeOriginal = original;
        activeClone = original
          ? original.cloneNode(false) as HTMLTableSectionElement
          : table.ownerDocument.createElement('tbody');
        clone.appendChild(activeClone);
      }
      activeClone.appendChild(row.cloneNode(true));
    });
    if (final) footerSections.forEach((foot) => clone.appendChild(foot.cloneNode(true)));
    return clone.outerHTML;
  };

  // Find the largest safe row prefix that fits. This keeps the table on the
  // current page whenever possible and avoids arbitrary row cuts.
  const fitCount = largestFittingTablePrefix(
    rows.map((row) => Array.from(row.cells).map((cell) => cell.rowSpan || 1)),
    (count) => fits(buildFragment(0, count, false))
  );
  if (!fitCount) return [table.outerHTML];

  return [buildFragment(0, fitCount, false), buildFragment(fitCount, rows.length, true)];
}
