import { SPO_A4 } from './a4Layout';
import { splitStructuredTableV2 } from './structuredTablePaginationV2';

export type OfficialSectionKey =
  | 'PENGERTIAN'
  | 'TUJUAN'
  | 'KEBIJAKAN'
  | 'PROSEDUR'
  | 'ALUR / BAGAN ALIR'
  | 'UNIT TERKAIT';

export interface OfficialBlock {
  id: string;
  section: OfficialSectionKey;
  html: string;
  logicalListGroup?: string;
}

export interface SopSectionsInput {
  pengertian?: string;
  tujuan?: string;
  kebijakan?: string;
  prosedur?: string;
  alur?: string;
  unitTerkait?: string;
  summary?: string;
  divisionName?: string;
  categoryName?: string;
}

export interface CanonicalPaginationOptions {
  headerHeightPx?: number;
  publicationHeightPx?: number;
  safetyBufferPx?: number;
}

/** Check if an HTML string contains HTML tags */
export function hasHtmlTags(str: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(str);
}

/**
 * Decomposes authored section HTML into granular flow units (paragraphs,
 * list items, tables, media) so the canonical pagination engine can pack
 * and fill all remaining A4 space before creating a new page.
 */
export function extractProcedureBlocks(html: string): string[] {
  const source = html || '';
  if (!source.trim()) return [];

  // Plain text format with numbered lines: convert early to semantic <ol>
  if (!hasHtmlTags(source)) {
    const lines = source.split(/\r?\n/);
    const isMultiLineList =
      lines.length > 1 &&
      lines.some((l) => /^\s*(?:\d+[\.\)]|[a-zA-Z][\.\)]|[-*•])\s+/.test(l));
    if (isMultiLineList) {
      const listItems: string[] = [];
      let isOrdered = false;
      let listType = '1';
      let firstStartNumber: number | null = null;

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const numMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)$/);
        const alphaMatch = trimmed.match(/^([a-zA-Z])[\.\)]\s+(.*)$/);
        const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);

        if (numMatch) {
          isOrdered = true;
          listType = '1';
          const parsedNum = parseInt(numMatch[1], 10);
          if (
            firstStartNumber === null &&
            Number.isFinite(parsedNum) &&
            parsedNum > 0
          ) {
            firstStartNumber = parsedNum;
          }
          listItems.push(`<li>${numMatch[2]}</li>`);
        } else if (alphaMatch) {
          isOrdered = true;
          listType = 'a';
          listItems.push(`<li>${alphaMatch[2]}</li>`);
        } else if (bulletMatch) {
          listItems.push(`<li>${bulletMatch[1]}</li>`);
        } else {
          listItems.push(`<li>${trimmed}</li>`);
        }
      });

      const startAttrStr =
        isOrdered && firstStartNumber && firstStartNumber > 1
          ? ` start="${firstStartNumber}"`
          : '';
      const listHtml = isOrdered
        ? `<ol type="${listType}"${startAttrStr}>${listItems.join('')}</ol>`
        : `<ul>${listItems.join('')}</ul>`;
      return [listHtml];
    }
    return [source];
  }

  if (typeof DOMParser === 'undefined') return [source];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'text/html');
    const blocks: string[] = [];
    let inlineBuffer = '';

    const pushInlineBuffer = () => {
      const trimmed = inlineBuffer.trim();
      if (trimmed) {
        if (/^<(p|div|h[1-6]|table|ol|ul|blockquote)/i.test(trimmed)) {
          blocks.push(trimmed);
        } else {
          blocks.push(`<p>${trimmed}</p>`);
        }
      }
      inlineBuffer = '';
    };

    const hasBlockDescendant = (el: Element) => {
      return Boolean(
        el.querySelector(
          'p, ol, ul, table, blockquote, pre, h1, h2, h3, h4, h5, h6, section, article, div, figure, hr'
        )
      );
    };

    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.textContent || '').length > 0)
          inlineBuffer += node.textContent || '';
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (/^(ol|ul)$/i.test(tag)) {
        pushInlineBuffer();
        blocks.push(el.outerHTML);
        return;
      }

      if (
        /^(table|img|figure|blockquote|pre|h1|h2|h3|h4|h5|h6|hr)$/i.test(tag)
      ) {
        pushInlineBuffer();
        blocks.push(el.outerHTML);
        return;
      }

      if (tag === 'p') {
        if (hasBlockDescendant(el)) {
          pushInlineBuffer();
          Array.from(el.childNodes).forEach(processNode);
          pushInlineBuffer();
          return;
        }

        pushInlineBuffer();
        const innerHtml = el.innerHTML;
        if (/<br\s*\/?>\s*<br\s*\/?>/i.test(innerHtml)) {
          const parts = innerHtml.split(/<br\s*\/?>\s*<br\s*\/?>/i);
          parts.forEach((part) => {
            if (part.trim()) blocks.push(`<p>${part.trim()}</p>`);
          });
        } else {
          blocks.push(el.outerHTML);
        }
        return;
      }

      if (
        /^(div|section|article|main|header|footer)$/i.test(tag) ||
        hasBlockDescendant(el)
      ) {
        pushInlineBuffer();
        Array.from(el.childNodes).forEach(processNode);
        pushInlineBuffer();
        return;
      }

      inlineBuffer += el.outerHTML;
    };

    Array.from(doc.body.childNodes).forEach(processNode);
    pushInlineBuffer();

    const meaningfulBlocks = blocks.filter((block) => {
      if (!block || !block.trim()) return false;
      try {
        const check = parser.parseFromString(block, 'text/html');
        const body = check.body;
        const hasMediaOrTable = Boolean(
          body.querySelector('img,svg,table,figure,iframe')
        );
        const text = (body.textContent || '').replace(/\u00a0/g, ' ').trim();
        return hasMediaOrTable || text.length > 0;
      } catch {
        return Boolean(block.trim());
      }
    });

    return meaningfulBlocks.length ? meaningfulBlocks : [];
  } catch (error) {
    console.warn('Gagal memecah blok rich-text:', error);
    return [source];
  }
}

/**
 * Calculates the exact canonical width (in px) of the Batang Tubuh content cell.
 * A4 width = 210mm, Left/Right margin = 20mm each.
 * Effective content width = 170mm.
 * Batang Tubuh right column = 72% of 170mm = 122.4mm.
 * At 96 DPI: 122.4 * 96 / 25.4 = 462.61px.
 * Minus cell padding (0.625rem = 10px each side = 20px) = 442.6px.
 */
export function getCanonicalContentWidthPx(): number {
  const contentWidthMm = SPO_A4.contentWidthMm; // 170mm
  const colRatio = (SPO_A4.sectionContentPercent || 72) / 100; // 0.72
  const cellWidthMm = contentWidthMm * colRatio; // 122.4mm
  const cellWidthPx = (cellWidthMm * 96) / 25.4; // 462.61px
  return Math.round((cellWidthPx - 20) * 10) / 10; // ~442.6px
}

/**
 * Creates an off-screen measurement host strictly matching canonical A4
 * typography, margins, and the Batang Tubuh content cell geometry.
 */
export function createMeasureHost(template?: HTMLElement | null): HTMLElement {
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.visibility = 'hidden';
  host.style.pointerEvents = 'none';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.height = 'auto';
  host.style.maxHeight = 'none';
  host.style.overflow = 'visible';
  host.style.boxSizing = 'border-box';
  host.style.fontFamily = 'Bookman Old Style, Bookman, Georgia, serif';
  host.style.fontSize = '12pt';
  host.style.lineHeight = '1.5';
  host.style.padding = '0';
  host.style.margin = '0';
  host.style.border = 'none';

  const canonicalWidth = getCanonicalContentWidthPx();
  const measuredWidth = template ? template.getBoundingClientRect().width : 0;
  // If template is within realistic range, use it; otherwise use exact canonical width
  host.style.width =
    measuredWidth && measuredWidth >= 400 && measuredWidth <= 520
      ? `${measuredWidth}px`
      : `${canonicalWidth}px`;

  // Apply classes so compact table rules and typography match Preview and PDF identically
  host.className =
    'sop-batang-tubuh-content font-bookman text-black rich-text-output rich-text-document-content break-words [overflow-wrap:break-word] [word-break:normal] [hyphens:none]';

  if (template?.parentElement) {
    template.parentElement.appendChild(host);
  } else {
    document.body.appendChild(host);
  }
  return host;
}

/**
 * Split an oversized rich-text element by word boundaries using Range.cloneContents()
 * so original inline/block formatting and attributes are preserved.
 */
export function splitElementPreservingMarkup(
  element: HTMLElement,
  maxHeight: number,
  buildWrapper: (fragment: DocumentFragment, isFirstChunk: boolean) => string,
  template: HTMLElement | null
): string[] {
  const textNodes: Text[] = [];
  const ownerDocument = element.ownerDocument || document;
  const walker = ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let currentNode: Node | null = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    if ((textNode.textContent || '').trim()) textNodes.push(textNode);
    currentNode = walker.nextNode();
  }

  type WordRange = { node: Text; start: number; end: number };
  const words: WordRange[] = [];
  textNodes.forEach((node) => {
    const value = node.textContent || '';
    const re = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(value)) !== null) {
      words.push({
        node,
        start: match.index,
        end: match.index + match[0].length
      });
    }
  });

  if (words.length < 4) return [element.outerHTML];

  const host = createMeasureHost(template);
  const safetyLimit = Math.max(1, maxHeight - 1);
  const buildCandidate = (startWord: number, endWord: number): string => {
    const range = ownerDocument.createRange();
    range.setStart(words[startWord].node, words[startWord].start);
    range.setEnd(words[endWord - 1].node, words[endWord - 1].end);
    const fragment = range.cloneContents();
    return buildWrapper(fragment, startWord === 0);
  };
  const fits = (candidate: string) => {
    host.innerHTML = candidate;
    return host.getBoundingClientRect().height <= safetyLimit;
  };

  let low = 1;
  let high = words.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = buildCandidate(0, mid);
    if (fits(candidate)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  host.remove();

  if (best < 2 || best >= words.length) {
    return [element.outerHTML];
  }

  const chunk0 = buildCandidate(0, best);
  const chunk1 = buildCandidate(best, words.length);
  return [chunk0, chunk1];
}

/**
 * Split a rich-text block to fit remaining A4 page capacity using the
 * canonical A4 geometry and typography contract.
 */
export function splitHtmlForCapacity(
  html: string,
  maxHeight: number,
  template: HTMLElement | null
): string[] {
  const source = (html || '').trim();
  if (!source || maxHeight <= 0 || typeof DOMParser === 'undefined')
    return [source];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'text/html');
    const topLevelNodes = Array.from(doc.body.childNodes);
    const hasTopLevelText = topLevelNodes.some(
      (node) =>
        node.nodeType === Node.TEXT_NODE &&
        Boolean((node.textContent || '').trim())
    );
    const elements = Array.from(doc.body.children) as HTMLElement[];
    const first = elements[0];
    if (!first) return [source];

    const safetyLimit = Math.max(1, maxHeight - 1);
    const host = createMeasureHost(template);
    const fits = (candidate: string) => {
      host.innerHTML = candidate;
      return host.getBoundingClientRect().height <= safetyLimit;
    };

    // Multiple independent top-level blocks
    if (elements.length > 1 && !hasTopLevelText) {
      if (fits(source)) {
        host.remove();
        return [source];
      }

      let fitCount = 0;
      for (let i = 0; i < elements.length; i++) {
        const candidate = elements
          .slice(0, i + 1)
          .map((el) => el.outerHTML)
          .join('');
        if (fits(candidate)) {
          fitCount = i + 1;
        } else {
          break;
        }
      }

      if (fitCount > 0 && fitCount < elements.length) {
        const nextEl = elements[fitCount];
        // If the next element is a table, attempt to split it cleanly
        if (nextEl && nextEl.tagName.toLowerCase() === 'table') {
          const prefixHtml = elements
            .slice(0, fitCount)
            .map((el) => el.outerHTML)
            .join('');
          const tableParts = splitStructuredTableV2(
            nextEl as HTMLTableElement,
            (tableCandidate) => fits(prefixHtml + tableCandidate)
          );
          if (tableParts.length > 1) {
            host.remove();
            const headingCandidate = elements[fitCount - 1];
            const repeatHeading =
              headingCandidate &&
              /^(p|h1|h2|h3|h4|h5|h6)$/i.test(headingCandidate.tagName)
                ? headingCandidate.outerHTML
                : '';
            const firstPart = prefixHtml + tableParts[0];
            const continuationPrefix = repeatHeading
              ? repeatHeading.replace(
                  /^<([a-z0-9]+)\b/i,
                  '<$1 data-sop-table-continuation-heading="true"'
                )
              : '';
            const secondPart = [
              continuationPrefix,
              tableParts[1],
              ...elements.slice(fitCount + 1).map((el) => el.outerHTML)
            ].join('');
            const laterParts = tableParts
              .slice(2)
              .map((part) => `${continuationPrefix}${part}`);
            return [firstPart, secondPart, ...laterParts];
          }

          // Table could NOT fit even 1 row on this page (tableParts.length <= 1):
          // Check if the element right before the table is a heading (e.g. "C. INTERPRETASI HASIL").
          // If so, do NOT leave an orphan heading on this page with an empty gap!
          // Move both the heading and the table to the next page!
          const headingCandidate = elements[fitCount - 1];
          const isHeadingBeforeTable =
            headingCandidate &&
            /^(p|h1|h2|h3|h4|h5|h6)$/i.test(headingCandidate.tagName);
          if (isHeadingBeforeTable && fitCount >= 1) {
            const itemsBeforeHeading = elements.slice(0, fitCount - 1);
            if (itemsBeforeHeading.length > 0) {
              host.remove();
              return [
                itemsBeforeHeading.map((el) => el.outerHTML).join(''),
                elements.slice(fitCount - 1).map((el) => el.outerHTML).join('')
              ];
            }
          }
        } else if (nextEl) {
          // If next element is an ol/ul, div, or splittable block:
          // Fill the remaining space on the current page to eliminate wide bottom gaps!
          const prefixHtml = elements
            .slice(0, fitCount)
            .map((el) => el.outerHTML)
            .join('');
          host.innerHTML = prefixHtml;
          const prefixHeight = host.getBoundingClientRect().height;
          const remainingForNext = Math.max(0, maxHeight - prefixHeight);

          if (remainingForNext >= 20) {
            const nextParts = splitHtmlForCapacity(
              nextEl.outerHTML,
              remainingForNext,
              template
            );
            if (nextParts.length > 1 && fits(prefixHtml + nextParts[0])) {
              host.remove();
              const firstPart = prefixHtml + nextParts[0];
              const remainingElements = elements
                .slice(fitCount + 1)
                .map((el) => el.outerHTML);
              const secondPart = [
                nextParts.slice(1).join(''),
                ...remainingElements
              ].join('');
              return [firstPart, secondPart];
            }
          }
        }

        host.remove();
        return [
          elements.slice(0, fitCount).map((el) => el.outerHTML).join(''),
          elements.slice(fitCount).map((el) => el.outerHTML).join('')
        ];
      }

      if (fitCount === 0 && elements.length > 0 && maxHeight >= 20) {
        host.remove();
        const firstParts = splitHtmlForCapacity(
          elements[0].outerHTML,
          maxHeight,
          template
        );
        if (firstParts.length > 1) {
          return [
            firstParts[0],
            [
              firstParts[1],
              ...elements.slice(1).map((el) => el.outerHTML)
            ].join('')
          ];
        }
        return [source];
      }
      host.remove();
      return [source];
    }

    // Structured tables: split only at safe row boundaries using V2 engine
    if (first.tagName.toLowerCase() === 'table') {
      const tableParts = splitStructuredTableV2(
        first as HTMLTableElement,
        fits
      );
      host.remove();
      if (tableParts.length > 1) {
        return tableParts;
      }
      return [source];
    }

    // Ordered/unordered lists: split ONLY at WHOLE <li> item boundaries
    if (/^(ol|ul)$/i.test(first.tagName)) {
      const isOl = first.tagName.toLowerCase() === 'ol';
      const explicitStart = isOl
        ? parseInt(first.getAttribute('start') || '1', 10) || 1
        : 1;
      const items = Array.from(first.children).filter(
        (el) => el.tagName.toLowerCase() === 'li'
      ) as HTMLElement[];

      const listTag = first.tagName.toLowerCase();
      const listAttrs = Array.from(first.attributes)
        .filter((attr) => {
          const n = attr.name.toLowerCase();
          return (
            !(isOl && n === 'start') &&
            n !== 'style' &&
            n !== 'data-sop-list-continuation' &&
            n !== 'data-sop-continuation-number'
          );
        })
        .map(
          (attr) =>
            ` ${attr.name}="${attr.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
        )
        .join('');

      const makeList = (
        itemHtmls: string[],
        startIndex: number,
        continuation = false,
        continuationNumber?: number
      ) => {
        const number = continuationNumber ?? explicitStart + startIndex;
        const itemsWithContinuationMarker = continuation
          ? itemHtmls.map((itemHtml) =>
              itemHtml.replace(
                /^<li\b/i,
                '<li data-sop-continuation-li="true"'
              )
            )
          : itemHtmls;
        const counterStyle = isOl
          ? ` style="counter-reset: sop-list ${number - 1};--sop-start-offset: ${number - 1};"`
          : '';
        return `<${listTag}${listAttrs}${isOl && !continuation ? ` start="${number}"` : ''}${counterStyle}${continuation ? ` data-sop-list-continuation="true" data-sop-continuation-number="${number}"` : ''}>${itemsWithContinuationMarker.join('')}</${listTag}>`;
      };

      if (items.length > 0) {
        const fullList = first.outerHTML;
        if (fits(fullList)) {
          host.remove();
          return [source];
        }

        let fitCount = 0;
        for (let i = 0; i < items.length; i++) {
          const candidate = makeList(
            items.slice(0, i + 1).map((el) => el.outerHTML),
            0
          );
          if (fits(candidate)) {
            fitCount = i + 1;
          } else {
            break;
          }
        }

        if (fitCount > 0 && fitCount < items.length) {
          host.remove();
          const firstPart = makeList(
            items.slice(0, fitCount).map((el) => el.outerHTML),
            0
          );
          const remainingPart = makeList(
            items.slice(fitCount).map((el) => el.outerHTML),
            fitCount,
            false,
            explicitStart + fitCount
          );
          return [firstPart, remainingPart];
        }

        // Case 2: Not even the first item fits in maxHeight
        if (fitCount === 0) {
          const item = items[0];
          const nestedTable = item.querySelector('table');
          if (nestedTable) {
            const wrapTable = (
              tableHtml: string,
              continuation: boolean
            ) => {
              const clonedItem = item.cloneNode(true) as HTMLElement;
              const clonedTable = clonedItem.querySelector('table');
              if (clonedTable) clonedTable.outerHTML = tableHtml;
              return makeList(
                [clonedItem.outerHTML],
                0,
                continuation,
                explicitStart
              );
            };
            const tableParts = splitStructuredTableV2(
              nestedTable as HTMLTableElement,
              (tableHtml) => fits(wrapTable(tableHtml, false))
            );
            if (tableParts.length > 1) {
              const firstPart = wrapTable(tableParts[0], false);
              const continuationParts = tableParts
                .slice(1)
                .map((part) => wrapTable(part, true));
              const remainingItems = items
                .slice(1)
                .map((el) => el.outerHTML);
              const remainingList = remainingItems.length
                ? makeList(remainingItems, 1, false, explicitStart + 1)
                : '';
              host.remove();
              return [
                firstPart,
                [...continuationParts, remainingList].filter(Boolean).join('')
              ];
            }
          }
          const itemParts = splitElementPreservingMarkup(
            item,
            maxHeight,
            (fragment, isFirstChunk) => {
              const li = item.cloneNode(false) as HTMLElement;
              li.removeAttribute('id');
              li.innerHTML = '';
              li.appendChild(fragment);
              return makeList([li.outerHTML], 0, !isFirstChunk, explicitStart);
            },
            template
          );
          if (itemParts.length > 1) {
            const firstPart = itemParts[0];
            const restItemParts = itemParts.slice(1);
            const remainingItems = items.slice(1).map((el) => el.outerHTML);
            const continuation = [
              ...restItemParts,
              ...(remainingItems.length
                ? [makeList(remainingItems, 1, false, explicitStart + 1)]
                : [])
            ].join('');
            host.remove();
            return [firstPart, continuation];
          }
          host.remove();
          return [source];
        }

        host.remove();
        return [source];
      }
    }

    // Single paragraph or block
    if (/^(p|h[1-6]|blockquote|div)$/i.test(first.tagName)) {
      const parts = splitElementPreservingMarkup(
        first,
        maxHeight,
        (fragment, isFirstChunk) => {
          const wrapper = first.cloneNode(false) as HTMLElement;
          wrapper.removeAttribute('id');
          wrapper.innerHTML = '';
          wrapper.appendChild(fragment);
          return wrapper.outerHTML;
        },
        template
      );
      host.remove();
      if (parts.length > 1) return parts;
      return [source];
    }

    host.remove();
    return [source];
  } catch (error) {
    console.warn('splitHtmlForCapacity error:', error);
    return [source];
  }
}

/**
 * Preserves logical list continuation metadata across page fragments.
 */
export function forceLogicalListMetadata(
  html: string,
  block: OfficialBlock
): string {
  if (!html || typeof DOMParser === 'undefined') return html;
  const group =
    block.logicalListGroup || `${block.section}-logical-list-${block.id}`;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const lists = Array.from(doc.body.querySelectorAll('ol, ul')).filter(
      (list) => {
        let parent = list.parentElement;
        while (parent && parent !== doc.body) {
          if (/^(ol|ul|table|tbody|thead|tfoot|tr|td|th)$/i.test(parent.tagName))
            return false;
          parent = parent.parentElement;
        }
        return true;
      }
    ) as HTMLElement[];
    if (lists.length === 0) return html;
    lists.forEach((list) => {
      list.setAttribute('data-sop-logical-group', group);
    });
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

/**
 * Builds the array of official section blocks from the raw sections input.
 */
export function buildOfficialBlocks(
  input: SopSectionsInput
): OfficialBlock[] {
  const pengertianHtml = (input.pengertian || input.summary || '').trim();
  const tujuanHtml = (input.tujuan || '').trim();
  const kebijakanHtml = (
    input.kebijakan ||
    'SK Direktur RSUD Dr. Soegiri Lamongan Nomor 188/SPO/DIR/2026'
  ).trim();
  const procedureHtml = (input.prosedur || '').trim();
  const alurHtml = (input.alur || '').trim();
  const unitHtml = (
    input.unitTerkait ||
    (input.divisionName
      ? `${input.divisionName}${input.categoryName ? `, ${input.categoryName}` : ''}`
      : '')
  ).trim();

  const sectionsData: {
    id: string;
    section: OfficialSectionKey;
    html: string;
  }[] = [
    { id: 'pengertian', section: 'PENGERTIAN', html: pengertianHtml },
    { id: 'tujuan', section: 'TUJUAN', html: tujuanHtml },
    { id: 'kebijakan', section: 'KEBIJAKAN', html: kebijakanHtml },
    { id: 'prosedur', section: 'PROSEDUR', html: procedureHtml },
    { id: 'alur', section: 'ALUR / BAGAN ALIR', html: alurHtml },
    { id: 'unit-terkait', section: 'UNIT TERKAIT', html: unitHtml }
  ];

  return sectionsData
    .filter((sec) => sec.html.trim().length > 0)
    .flatMap((sec) => {
      const units = extractProcedureBlocks(sec.html);
      return units.map((unitHtml, unitIdx) => {
        let logicalListGroup: string | undefined;
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(unitHtml, 'text/html');
          const first = doc.body.firstElementChild;
          if (first && /^(ol|ul)$/i.test(first.tagName)) {
            logicalListGroup = `${sec.id}-logical-list-${unitIdx}`;
          }
        } catch {
          // ignore
        }
        return {
          id: units.length <= 1 ? sec.id : `${sec.id}-${unitIdx}`,
          section: sec.section,
          html: unitHtml,
          logicalListGroup
        };
      });
    });
}

/**
 * Computes the canonical A4 pagination for an SPO document.
 * Returns an array of pages where each page is an array of OfficialBlock items.
 * Guaranteed:
 * - 210mm x 297mm physical A4 pages
 * - 20mm margins on all sides (170mm content width)
 * - Identical page boundaries across Live Editor, Preview, and PDF.
 */
export function computeCanonicalA4Pages(
  blocks: OfficialBlock[],
  options?: CanonicalPaginationOptions
): OfficialBlock[][] {
  if (!blocks || blocks.length === 0) return [[]];

  // In a non-browser environment, return all blocks in 1 page
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return [blocks];
  }

  // Canonical page dimensions at 96 DPI:
  // 297mm = 1122.5px
  // Margins: 20mm top + 20mm bottom = 40mm = 151.2px
  // Available height inside margin box = 1122.5 - 151.2 = 971.3px
  const pageHeightPx = 1122.5;
  const marginVerticalPx = 151.2;
  const availableHeight = pageHeightPx - marginVerticalPx; // 971.3px

  let measuredHeaderHeight = options?.headerHeightPx;
  if (!measuredHeaderHeight && typeof document !== 'undefined') {
    const existingHeader = document.querySelector<HTMLElement>(
      '.sop-official-table thead, .sop-print-header, [data-measure-header]'
    );
    if (existingHeader) {
      const rectH = existingHeader.getBoundingClientRect().height;
      if (rectH >= 80 && rectH <= 250) {
        measuredHeaderHeight = rectH;
      }
    }
  }
  const headerHeight = measuredHeaderHeight || 148;

  let measuredPubHeight = options?.publicationHeightPx;
  if (!measuredPubHeight && typeof document !== 'undefined') {
    const existingPub = document.querySelector<HTMLElement>(
      '.sop-first-page-only, [data-measure-publication]'
    );
    if (existingPub) {
      const rectH = existingPub.getBoundingClientRect().height;
      if (rectH >= 50 && rectH <= 250) {
        measuredPubHeight = rectH;
      }
    }
  }
  const publicationHeight = measuredPubHeight || 80;
  const safety = options?.safetyBufferPx ?? 4;

  const bodyCapacity = Math.max(1, availableHeight - headerHeight - safety);
  const firstCapacity = Math.max(1, bodyCapacity - publicationHeight);
  const normalCapacity = bodyCapacity;

  // Measure all source blocks using canonical measurement host
  const host = createMeasureHost();
  const measuredHeights = blocks.map((block) => {
    host.innerHTML = block.html;
    return Math.max(0, host.getBoundingClientRect().height);
  });
  host.remove();

  // Content cell padding is 20px (10px top + 10px bottom)
  const baseRowPadding = 20;

  const measureFlowPart = (html: string): number => {
    if (!html) return 0;
    const mHost = createMeasureHost();
    mHost.innerHTML = html;
    const h = mHost.getBoundingClientRect().height;
    mHost.remove();
    return Math.max(0, h);
  };

  const hasVisibleContent = (pageBlocks: OfficialBlock[]) => {
    return pageBlocks.some((b) => {
      const raw = (b.html || '').trim();
      if (!raw) return false;
      if (/<(img|svg|table|figure|canvas|iframe)\b/i.test(raw)) return true;
      const text = raw.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/g, '').trim();
      return text.length > 0;
    });
  };

  const pages: OfficialBlock[][] = [];
  let currentPageBlocks: OfficialBlock[] = [];
  let used = 0;
  let capacity = firstCapacity;
  let currentSection: OfficialBlock['section'] | null = null;

  const flowBlocks: OfficialBlock[] = [...blocks];
  const flowHeights: number[] = [...measuredHeights];

  const commitCurrentPageAndStartNext = () => {
    if (currentPageBlocks.length && hasVisibleContent(currentPageBlocks)) {
      pages.push(currentPageBlocks);
    }
    currentPageBlocks = [];
    used = 0;
    capacity = normalCapacity;
    currentSection = null;
  };

  let index = 0;
  let guard = 0;
  while (index < flowBlocks.length && guard < 10000) {
    guard += 1;
    const block = flowBlocks[index];
    const startsNewSectionRow =
      currentPageBlocks.length === 0 || block.section !== currentSection;
    const chrome = startsNewSectionRow ? baseRowPadding : 0;
    const needed = flowHeights[index] + chrome;

    if (used + needed > capacity) {
      const remaining = capacity - used - chrome;

      if (remaining >= 24) {
        const parts = splitHtmlForCapacity(block.html, remaining, null);
        if (parts.length > 1) {
          const firstPart = parts[0];
          const restParts = parts.slice(1);
          const firstHeight = measureFlowPart(firstPart);
          const firstNeeded = firstHeight + chrome;

          if (firstHeight > 0 && used + firstNeeded <= capacity) {
            const fittedFirstBlock: OfficialBlock = {
              ...block,
              id: `${block.id}-fit-1`,
              html: forceLogicalListMetadata(firstPart, block)
            };
            flowBlocks[index] = fittedFirstBlock;
            flowHeights[index] = firstHeight;

            const continuationBlocks: OfficialBlock[] = restParts.map(
              (html, partIndex) => ({
                ...block,
                id: `${block.id}-fit-${partIndex + 2}`,
                html: forceLogicalListMetadata(html, block)
              })
            );
            const continuationHeights = continuationBlocks.map((part) =>
              measureFlowPart(part.html)
            );
            flowBlocks.splice(index + 1, 0, ...continuationBlocks);
            flowHeights.splice(index + 1, 0, ...continuationHeights);

            currentPageBlocks.push(fittedFirstBlock);
            used += firstNeeded;
            currentSection = block.section;
            index += 1;
            continue;
          }
        }
      }

      if (currentPageBlocks.length > 0) {
        commitCurrentPageAndStartNext();
        continue;
      }

      // Fresh page but block exceeds full page: split to fill the page
      if (currentPageBlocks.length === 0 && capacity >= 40) {
        const pageRemaining = capacity - chrome;
        const parts = splitHtmlForCapacity(block.html, pageRemaining, null);
        if (parts.length > 1) {
          const firstPart = parts[0];
          const restParts = parts.slice(1);
          const firstHeight = measureFlowPart(firstPart);
          const firstNeeded = firstHeight + chrome;

          const fittedFirstBlock: OfficialBlock = {
            ...block,
            id: `${block.id}-fit-1`,
            html: forceLogicalListMetadata(firstPart, block)
          };
          flowBlocks[index] = fittedFirstBlock;
          flowHeights[index] = firstHeight;

          const continuationBlocks: OfficialBlock[] = restParts.map(
            (html, partIndex) => ({
              ...block,
              id: `${block.id}-fit-${partIndex + 2}`,
              html: forceLogicalListMetadata(html, block)
            })
          );
          const continuationHeights = continuationBlocks.map((part) =>
            measureFlowPart(part.html)
          );
          flowBlocks.splice(index + 1, 0, ...continuationBlocks);
          flowHeights.splice(index + 1, 0, ...continuationHeights);

          currentPageBlocks.push(fittedFirstBlock);
          used += firstNeeded;
          currentSection = block.section;
          index += 1;
          continue;
        }
      }
    }

    // Block fits on current page
    currentPageBlocks.push(block);
    used += needed;
    currentSection = block.section;
    index += 1;
  }

  if (currentPageBlocks.length && hasVisibleContent(currentPageBlocks)) {
    pages.push(currentPageBlocks);
  }

  return pages.length ? pages : [[]];
}
