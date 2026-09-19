import { splitStructuredTableV2 } from './structuredTablePaginationV2';
export { splitStructuredTableV2 };

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
 * Split a rich-text table at safe row boundaries using the V2 canonical geometry engine.
 */
export function splitStructuredTable(
  table: HTMLTableElement,
  fits: (html: string) => boolean
): string[] {
  if (fits(table.outerHTML)) return [table.outerHTML];
  return splitStructuredTableV2(table, fits);
}
