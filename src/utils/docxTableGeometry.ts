import JSZip from 'jszip';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const direct = (element: Element | null, name: string): Element | null =>
  element ? Array.from(element.children).find((child) => child.localName === name) || null : null;

const wordAttr = (element: Element | null, name: string): string =>
  element?.getAttributeNS(WORD_NS, name) || element?.getAttribute(`w:${name}`) || '';

const twipsToMm = (value: string): number | null => {
  const twips = Number(value);
  return Number.isFinite(twips) && twips > 0 ? twips * 25.4 / 1440 : null;
};

const cssLength = (node: Element | null): string | null => {
  const value = wordAttr(node, 'w');
  const type = wordAttr(node, 'type') || 'dxa';
  if (!value || type === 'auto' || type === 'nil') return null;
  if (type === 'pct') return `${Number(value) / 50}%`;
  const mm = twipsToMm(value);
  return mm ? `${mm.toFixed(3)}mm` : null;
};

const borderStyle = (border: Element | null): string | null => {
  if (!border || ['nil', 'none'].includes(wordAttr(border, 'val'))) return border ? 'none' : null;
  const size = Number(wordAttr(border, 'sz') || 4) / 8;
  const color = wordAttr(border, 'color');
  return `${Math.max(size, 0.5)}pt solid #${!color || color === 'auto' ? '000000' : color}`;
};

const setStyle = (element: HTMLElement, property: string, value: string | null) => {
  if (value) element.style.setProperty(property, value);
};

const explicitRunFontSize = (run: Element): string | null => {
  const halfPoints = Number(wordAttr(direct(direct(run, 'rPr'), 'sz'), 'val'));
  if (!Number.isFinite(halfPoints)) return null;
  const points = halfPoints / 2;
  return points >= 6 && points <= 72 ? `${Number(points.toFixed(2))}pt` : null;
};

/** Wrap a character interval without replacing the paragraph's existing
 * strong/em/u hierarchy. Ranges are applied from right to left by the caller,
 * so earlier OOXML offsets remain stable. */
const wrapTextInterval = (root: HTMLElement, start: number, end: number, fontSize: string) => {
  if (end <= start) return;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let offset = 0;
  let current = walker.nextNode() as Text | null;
  while (current) {
    const length = current.data.length;
    nodes.push({ node: current, start: offset, end: offset + length });
    offset += length;
    current = walker.nextNode() as Text | null;
  }
  const first = nodes.find((entry) => entry.end > start);
  const last = [...nodes].reverse().find((entry) => entry.start < end);
  if (!first || !last) return;
  const range = root.ownerDocument.createRange();
  range.setStart(first.node, Math.max(0, start - first.start));
  range.setEnd(last.node, Math.min(last.node.data.length, end - last.start));
  const span = root.ownerDocument.createElement('span');
  span.style.fontSize = fontSize;
  span.appendChild(range.extractContents());
  range.insertNode(span);
};

const applyExplicitRunTypography = (wordParagraph: Element, htmlParagraph: HTMLElement) => {
  let offset = 0;
  const intervals: Array<{ start: number; end: number; fontSize: string }> = [];
  Array.from(wordParagraph.children).forEach((child) => {
    if (child.localName !== 'r') return;
    const textLength = Array.from(child.getElementsByTagNameNS(WORD_NS, 't'))
      .reduce((sum, text) => sum + (text.textContent || '').length, 0);
    const breakLength = Array.from(child.children)
      .filter((node) => node.localName === 'tab' || node.localName === 'br').length;
    const length = textLength + breakLength;
    const fontSize = explicitRunFontSize(child);
    if (fontSize && length) intervals.push({ start: offset, end: offset + length, fontSize });
    offset += length;
  });
  intervals.reverse().forEach((interval) => {
    wrapTextInterval(htmlParagraph, interval.start, interval.end, interval.fontSize);
  });
};

function applyBoxProperties(target: HTMLElement, properties: Element | null) {
  if (!properties) return;
  const borders = direct(properties, properties.localName === 'tblPr' ? 'tblBorders' : 'tcBorders');
  if (borders) {
    for (const [wordSide, cssSide] of [['top', 'top'], ['right', 'right'], ['bottom', 'bottom'], ['left', 'left']] as const) {
      setStyle(target, `border-${cssSide}`, borderStyle(direct(borders, wordSide)));
    }
  }
  const margins = direct(properties, properties.localName === 'tblPr' ? 'tblCellMar' : 'tcMar');
  if (margins) {
    for (const [wordSide, cssSide] of [['top', 'top'], ['end', 'right'], ['bottom', 'bottom'], ['start', 'left'], ['right', 'right'], ['left', 'left']] as const) {
      const length = cssLength(direct(margins, wordSide));
      if (length) target.style.setProperty(`padding-${cssSide}`, length);
    }
  }
}

/**
 * Enrich Mammoth's semantic table HTML with the OOXML geometry Mammoth omits.
 * The resulting HTML is the canonical representation stored in the SPO and is
 * consumed unchanged by the live editor, preview paginator, and PDF renderer.
 */
export async function preserveDocxTableGeometry(arrayBuffer: ArrayBuffer, html: string): Promise<string> {
  if (!html || typeof DOMParser === 'undefined') return html;
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) return html;

  const xml = new DOMParser().parseFromString(documentXml, 'application/xml');
  if (xml.querySelector('parsererror')) return html;
  const htmlDocument = new DOMParser().parseFromString(html, 'text/html');
  const wordTables = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'tbl'));
  const htmlTables = Array.from(htmlDocument.querySelectorAll<HTMLTableElement>('table'));

  wordTables.forEach((wordTable, tableIndex) => {
    const table = htmlTables[tableIndex];
    if (!table) return;
    table.dataset.docxTable = 'true';
    table.style.borderCollapse = 'collapse';
    table.style.tableLayout = 'fixed';

    const properties = direct(wordTable, 'tblPr');
    const width = cssLength(direct(properties!, 'tblW'));
    setStyle(table, 'width', width);
    if (width) table.dataset.docxWidth = width;

    const indent = cssLength(direct(properties!, 'tblInd'));
    const alignment = wordAttr(direct(properties!, 'jc'), 'val');
    if (alignment === 'center') {
      table.style.marginLeft = 'auto';
      table.style.marginRight = 'auto';
    } else if (alignment === 'right' || alignment === 'end') {
      table.style.marginLeft = 'auto';
      table.style.marginRight = indent || '0';
    } else if (indent) {
      table.style.marginLeft = indent;
      table.style.marginRight = '0';
    }
    table.dataset.docxAlign = alignment || 'left';
    if (indent) table.dataset.docxIndent = indent;
    applyBoxProperties(table, properties);

    const grid = direct(wordTable, 'tblGrid');
    const gridWidths = grid ? Array.from(grid.children).filter((node) => node.localName === 'gridCol').map((node) => Number(wordAttr(node, 'w')) || 0) : [];
    const gridTotal = gridWidths.reduce((sum, current) => sum + current, 0);
    if (gridTotal > 0) {
      const colgroup = htmlDocument.createElement('colgroup');
      gridWidths.forEach((gridWidth) => {
        const col = htmlDocument.createElement('col');
        col.style.width = `${(gridWidth / gridTotal * 100).toFixed(4)}%`;
        col.dataset.docxGridTwips = String(gridWidth);
        colgroup.appendChild(col);
      });
      table.insertBefore(colgroup, table.firstChild);
    }

    const wordRows = Array.from(wordTable.children).filter((node) => node.localName === 'tr');
    const htmlRows = Array.from(table.rows);
    wordRows.forEach((wordRow, rowIndex) => {
      const wordCells = Array.from(wordRow.children).filter((node) => node.localName === 'tc');
      const htmlCells = htmlRows[rowIndex] ? Array.from(htmlRows[rowIndex].cells) : [];
      wordCells.forEach((wordCell, cellIndex) => {
        const cell = htmlCells[cellIndex];
        if (!cell) return;
        const cellProperties = direct(wordCell, 'tcPr');
        const cellWidth = cssLength(direct(cellProperties!, 'tcW'));
        if (!gridTotal) setStyle(cell, 'width', cellWidth);
        if (cellWidth) cell.dataset.docxCellWidth = cellWidth;
        const vertical = wordAttr(direct(cellProperties!, 'vAlign'), 'val');
        setStyle(cell, 'vertical-align', vertical === 'center' ? 'middle' : vertical || null);
        applyBoxProperties(cell, cellProperties);

        const wordParagraphs = Array.from(wordCell.children).filter((node) => node.localName === 'p');
        const htmlParagraphs = Array.from(cell.children).filter((node) => node.tagName === 'P') as HTMLElement[];
        wordParagraphs.forEach((paragraph, paragraphIndex) => {
          const paragraphAlignment = wordAttr(direct(direct(paragraph, 'pPr')!, 'jc'), 'val');
          if (htmlParagraphs[paragraphIndex] && paragraphAlignment) {
            htmlParagraphs[paragraphIndex].style.textAlign = paragraphAlignment === 'both' ? 'justify' : paragraphAlignment;
          }
          if (htmlParagraphs[paragraphIndex]) {
            applyExplicitRunTypography(paragraph, htmlParagraphs[paragraphIndex]);
          }
        });
      });
    });
  });

  return htmlDocument.body.innerHTML;
}
