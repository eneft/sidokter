import { normalizeStructuredHtml, SPO_A4 } from './a4Layout';
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

export interface BuildOfficialBlocksOptions {
  /** Output-only mode: ALUR/BAGAN ALIR is optional and must disappear when empty. */
  omitEmptyAlur?: boolean;
}

export interface CanonicalPaginationOptions {
  headerHeightPx?: number;
  publicationHeightPx?: number;
  safetyBufferPx?: number;
}

/**
 * Empty/short LiveSPO sections keep exactly one canonical 12pt / 1.5 line.
 * Cell inset/border are page-row chrome and are accounted separately so Live,
 * Preview/PDF and the paginator use the same physical geometry.
 */
export const LIVE_SOP_SECTION_MIN_HEIGHT_PX = 24;

/** Canonical Batang Tubuh content-cell inset used by Preview/PDF and Live A4. */
export const SOP_SECTION_CELL_PADDING_MM = 3;
const CSS_PX_PER_MM = 96 / 25.4;
const OFFICIAL_CELL_HORIZONTAL_BORDER_PX = 2;

/** 3mm top + 3mm bottom + the collapsed official-table border. */
export function getCanonicalSectionRowChromePx(): number {
  return SOP_SECTION_CELL_PADDING_MM * 2 * CSS_PX_PER_MM + 1;
}

/**
 * Returns the incremental rendered content height contributed by one flow unit.
 * The one-line editor minimum belongs to the whole section fragment on a page,
 * not to every extracted paragraph/list/table block inside that section.
 */
export function sectionFlowContributionPx(
  previousRawHeightPx: number,
  nextRawHeightPx: number,
  startsNewSectionFragment: boolean
): number {
  const previous = Number.isFinite(previousRawHeightPx) ? Math.max(0, previousRawHeightPx) : 0;
  const next = Number.isFinite(nextRawHeightPx) ? Math.max(0, nextRawHeightPx) : 0;
  if (startsNewSectionFragment) {
    return Math.max(LIVE_SOP_SECTION_MIN_HEIGHT_PX, next);
  }
  const before = Math.max(LIVE_SOP_SECTION_MIN_HEIGHT_PX, previous);
  const after = Math.max(LIVE_SOP_SECTION_MIN_HEIGHT_PX, previous + next);
  return Math.max(0, after - before);
}


/**
 * Keep a complete flow unit together when it can fit on a fresh canonical page.
 * This prevents the current page's overflow:hidden safety guard from ever
 * becoming the thing that visually "paginates" short text, tables, or media.
 */
export function shouldDeferWholeBlockToNextPage(
  blockHeightPx: number,
  remainingHeightPx: number,
  freshPageCapacityPx: number
): boolean {
  return (
    blockHeightPx > remainingHeightPx &&
    blockHeightPx <= freshPageCapacityPx
  );
}

/**
 * Text/rich-text flow is allowed to consume the remaining space on the current
 * page before continuing on the next page. Tables and media keep their own
 * atomic/safe-row rules and are deliberately excluded here.
 */
export function isSplittableTextFlowHtml(html: string): boolean {
  if (!html || typeof DOMParser === 'undefined') return false;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (doc.body.querySelector('table, img, figure')) return false;
    const first = doc.body.firstElementChild;
    if (!first) return Boolean((doc.body.textContent || '').trim());
    return /^(p|div|blockquote|h[1-6]|ol|ul)$/i.test(first.tagName);
  } catch {
    return false;
  }
}

/** True when this flow unit contains a table that may split at safe row boundaries. */
export function hasStructuredTableFlowHtml(html: string): boolean {
  if (!html || typeof DOMParser === 'undefined') return false;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Boolean(doc.body.querySelector('table'));
  } catch {
    return false;
  }
}

/** True when the authored block is a single atomic media object. */
export function isAtomicMediaHtml(html: string): boolean {
  if (!html || typeof DOMParser === 'undefined') return false;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const meaningful = Array.from(doc.body.childNodes).filter((node) => {
      if (node.nodeType === Node.TEXT_NODE) return Boolean((node.textContent || '').trim());
      return node.nodeType === Node.ELEMENT_NODE;
    });
    if (meaningful.length !== 1 || meaningful[0].nodeType !== Node.ELEMENT_NODE) return false;
    const el = meaningful[0] as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const isEditorImageWrapper = el.classList.contains('figure-wrapper');
    return (
      tag === 'img' ||
      tag === 'figure' ||
      isEditorImageWrapper ||
      (tag === 'p' && el.children.length === 1 && el.firstElementChild?.tagName.toLowerCase() === 'img')
    );
  } catch {
    return false;
  }
}

/**
 * Oversized images are atomic: never crop/split them. On a fresh page only,
 * scale them down proportionally to the canonical content box.
 */
export function constrainAtomicMediaHtml(
  html: string,
  maxHeightPx: number
): string {
  if (!html || maxHeightPx <= 0 || typeof DOMParser === 'undefined') return html;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const images = Array.from(doc.body.querySelectorAll('img')) as HTMLImageElement[];
    if (images.length !== 1) return html;
    const img = images[0];
    img.style.maxWidth = '100%';
    img.style.maxHeight = `${Math.max(1, Math.floor(maxHeightPx))}px`;
    img.style.width = 'auto';
    img.style.height = 'auto';
    img.style.objectFit = 'contain';
    img.setAttribute('data-sop-page-fit-image', 'true');
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

/** Check if an HTML string contains HTML tags */
export function hasHtmlTags(str: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(str);
}

/**
 * contentEditable may split one ordered list into OL / TABLE / OL siblings when
 * a table is inserted between numbered items. Live DOM can still look correct,
 * but Preview/PDF canonical blocks render each OL independently and would reset
 * the second fragment to 1. Carry the next number only across tables and empty
 * spacer paragraphs; meaningful prose/headings deliberately terminate the list.
 */
export function normalizeOrderedListContinuityAroundTables(root: ParentNode): void {
  const children = Array.from(root.children || []) as HTMLElement[];
  let nextOrderedStart: number | null = null;
  let bridgeHasTable = false;

  const isEmptySpacer = (element: HTMLElement) => {
    const tag = element.tagName.toLowerCase();
    if (tag !== 'p' && tag !== 'div') return false;
    if (element.querySelector('table,ol,ul,img,figure')) return false;
    return !(element.textContent || '').replace(/\u00a0/g, ' ').trim();
  };

  children.forEach((element) => {
    const tag = element.tagName.toLowerCase();
    if (tag === 'ol') {
      const directItems = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === 'li');
      const rawStart = element.getAttribute('start');
      const parsedStart = rawStart ? Number.parseInt(rawStart, 10) : Number.NaN;
      const hasExplicitStart = Number.isFinite(parsedStart) && parsedStart > 0;
      const shouldContinue = !hasExplicitStart && bridgeHasTable && nextOrderedStart !== null;
      const effectiveStart = hasExplicitStart ? parsedStart : (shouldContinue ? nextOrderedStart! : 1);
      if (shouldContinue && effectiveStart > 1) {
        element.setAttribute('start', String(effectiveStart));
      }
      element.style.setProperty('--sop-start-offset', String(Math.max(0, effectiveStart - 1)));
      nextOrderedStart = effectiveStart + directItems.length;
      bridgeHasTable = false;
      return;
    }

    if (tag === 'table') {
      if (nextOrderedStart !== null) bridgeHasTable = true;
      return;
    }
    if (isEmptySpacer(element)) return;

    // Normalize nested block containers independently; their numbering context
    // must not leak into or out of this sibling sequence.
    if (/^(div|section|article|main)$/i.test(tag)) {
      normalizeOrderedListContinuityAroundTables(element);
    }
    nextOrderedStart = null;
    bridgeHasTable = false;
  });
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
    normalizeOrderedListContinuityAroundTables(doc.body);
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

      // LiveSPO image sizing/alignment/wrap metadata lives on .figure-wrapper,
      // while the nested <img> intentionally stays width:100%. Treat the
      // wrapper as one authored media unit so Preview/PDF cannot lose the
      // selected 25/50/75/100% width when canonical flow is decomposed.
      if (el.classList.contains('figure-wrapper')) {
        pushInlineBuffer();
        blocks.push(el.outerHTML);
        return;
      }

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
 * Calculates the exact canonical authored-content width (in px) inside the
 * Batang Tubuh content cell. The official cell is 72% of 170mm = 122.4mm and
 * Preview/PDF apply 3mm inset on both sides, leaving 116.4mm for authored HTML.
 */
export function getCanonicalContentWidthPx(): number {
  const contentWidthMm = SPO_A4.contentWidthMm;
  const colRatio = (SPO_A4.sectionContentPercent || 72) / 100;
  const cellWidthMm = contentWidthMm * colRatio;
  const innerWidthMm = cellWidthMm - SOP_SECTION_CELL_PADDING_MM * 2;
  // The content box also excludes the official 1px left/right cell borders.
  // In Chromium's collapsed table layout this keeps the measurement width
  // within a sub-pixel of the actual Preview/Live authored-content box.
  const innerWidthPx = innerWidthMm * CSS_PX_PER_MM - OFFICIAL_CELL_HORIZONTAL_BORDER_PX;
  return Math.round(innerWidthPx * 10) / 10;
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
  // Physical A4 typography must not participate in mobile text autosizing.
  // Otherwise Chromium can enlarge an off-screen 116.4mm measurement host on
  // narrow viewports and produce different page boundaries for the same SPO.
  host.style.setProperty('text-size-adjust', 'none');
  host.style.setProperty('-webkit-text-size-adjust', 'none');

  const canonicalWidth = getCanonicalContentWidthPx();
  const measuredWidth = template ? template.getBoundingClientRect().width : 0;
  // If template is within realistic range, use it; otherwise use exact canonical width
  host.style.width =
    measuredWidth && measuredWidth >= 400 && measuredWidth <= 520
      ? `${measuredWidth}px`
      : `${canonicalWidth}px`;

  // Measure authored HTML only. The official 3mm cell inset belongs to the
  // section row and is counted once by getCanonicalSectionRowChromePx(). If
  // this host carries sop-batang-tubuh-content, CSS adds 3mm here and every
  // extracted paragraph/list/table block gets the inset again.
  host.className =
    'font-bookman text-black rich-text-output rich-text-document-content break-words [overflow-wrap:break-word] [word-break:normal] [hyphens:none]';

  if (template?.parentElement) {
    template.parentElement.appendChild(host);
  } else {
    document.body.appendChild(host);
  }
  return host;
}

/**
 * Measure a complete rendered section fragment, rather than adding the heights
 * of its extracted blocks. CSS such as `p:last-child` makes those operations
 * observably different: every separately measured paragraph loses its bottom
 * margin, while only the final paragraph loses it in the composed preview.
 */
export function measureCanonicalFlowHtml(
  htmlFragments: readonly string[],
  template?: HTMLElement | null
): number {
  if (typeof document === 'undefined') return 0;
  const host = createMeasureHost(template);
  host.innerHTML = normalizeStructuredHtml(htmlFragments.join(''));
  const height = host.getBoundingClientRect().height;
  host.remove();
  return Math.max(0, height);
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

  // Normal prose splits at word boundaries. Pathological/unbroken authored
  // tokens (common in stress tests and pasted identifiers) still need a safe
  // continuation instead of forcing the whole section onto the next page.
  // For those only, fall back to character ranges.
  let ranges: WordRange[] = words;
  if (ranges.length < 4) {
    const chars: WordRange[] = [];
    textNodes.forEach((node) => {
      const value = node.textContent || '';
      for (let i = 0; i < value.length; i += 1) {
        if (!/\s/.test(value[i])) chars.push({ node, start: i, end: i + 1 });
      }
    });
    if (chars.length < 20) return [element.outerHTML];
    ranges = chars;
  }

  const host = createMeasureHost(template);
  const safetyLimit = Math.max(1, maxHeight - 1);
  const buildCandidate = (startWord: number, endWord: number): string => {
    const range = ownerDocument.createRange();

    // Preserve the exact authored stream around a page boundary. Starting the
    // continuation at the next word/character used to drop the whitespace (or
    // inline markup) between both chunks, so concatenating paginated text was
    // not guaranteed to equal the source. Use the previous fitted token end as
    // the continuation boundary and the element edges for the outer chunks.
    if (startWord <= 0) {
      range.setStart(element, 0);
    } else {
      const previous = ranges[startWord - 1];
      range.setStart(previous.node, previous.end);
    }

    if (endWord >= ranges.length) {
      range.setEnd(element, element.childNodes.length);
    } else {
      const lastIncluded = ranges[endWord - 1];
      range.setEnd(lastIncluded.node, lastIncluded.end);
    }

    const fragment = range.cloneContents();
    return buildWrapper(fragment, startWord === 0);
  };
  const fits = (candidate: string) => {
    host.innerHTML = candidate;
    return host.getBoundingClientRect().height <= safetyLimit;
  };

  let low = 1;
  let high = ranges.length - 1;
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

  if (best < 2 || best >= ranges.length) {
    return [element.outerHTML];
  }

  const chunk0 = buildCandidate(0, best);
  const chunk1 = buildCandidate(best, ranges.length);
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
          const prefixItemHtmls = items
            .slice(0, fitCount)
            .map((el) => el.outerHTML);
          const nextItem = items[fitCount];

          // Strict pack-first: after whole list items have filled most of the
          // page, use the remaining space for as much of the next text item as
          // safely fits. Nested tables keep the dedicated V2 safe-row path.
          if (nextItem && !nextItem.querySelector('table')) {
            const partialNextItem = splitElementPreservingMarkup(
              nextItem,
              maxHeight,
              (fragment, isFirstChunk) => {
                const li = nextItem.cloneNode(false) as HTMLElement;
                li.removeAttribute('id');
                li.innerHTML = '';
                li.appendChild(fragment);
                if (isFirstChunk) {
                  return makeList(
                    [...prefixItemHtmls, li.outerHTML],
                    0,
                    false,
                    explicitStart
                  );
                }
                return makeList(
                  [li.outerHTML],
                  fitCount,
                  true,
                  explicitStart + fitCount
                );
              },
              template
            );

            if (partialNextItem.length > 1) {
              host.remove();
              const laterItems = items
                .slice(fitCount + 1)
                .map((el) => el.outerHTML);
              const laterList = laterItems.length
                ? makeList(
                    laterItems,
                    fitCount + 1,
                    false,
                    explicitStart + fitCount + 1
                  )
                : '';
              return [
                partialNextItem[0],
                [...partialNextItem.slice(1), laterList].filter(Boolean).join('')
              ];
            }
          }

          host.remove();
          const firstPart = makeList(prefixItemHtmls, 0);
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
  input: SopSectionsInput,
  options: BuildOfficialBlocksOptions = {}
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

  return sectionsData.flatMap((sec) => {
      // Empty sections are structural parts of the official SPO body and must
      // remain editable after an earlier section spans multiple pages.
      const extracted = extractProcedureBlocks(sec.html);
      // ALUR / BAGAN ALIR is optional in the finalized document. Live/editor
      // callers keep the empty structural row by default; Preview/PDF callers
      // explicitly opt in to omitting it. This also treats editor-empty HTML
      // such as <p><br></p> as empty because extractProcedureBlocks returns [].
      if (sec.id === 'alur' && options.omitEmptyAlur && extracted.length === 0) {
        return [];
      }
      const units = extracted.length > 0 ? extracted : [''];
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

  // Header/publication measurements MUST be supplied by the renderer that owns
  // the current SPO. Never query the global document here: another Preview,
  // hidden measurement tree, or modal can otherwise donate the wrong header
  // height and shift every continuation-page boundary.
  // Pagination is intentionally disabled until the owning renderer supplies
  // its scoped physical header/publication metrics. Guessing these values makes
  // page boundaries differ between LiveSPO and Preview.
  if (!options || !Number.isFinite(options.headerHeightPx) || !Number.isFinite(options.publicationHeightPx)) {
    return [blocks];
  }
  const headerHeight = Math.max(0, options.headerHeightPx!);
  const publicationHeight = Math.max(0, options.publicationHeightPx!);
  const safety = options?.safetyBufferPx ?? 4;

  const bodyCapacity = Math.max(1, availableHeight - headerHeight - safety);
  const firstCapacity = Math.max(1, bodyCapacity - publicationHeight);
  const normalCapacity = bodyCapacity;

  // Measure all source blocks using canonical measurement host
  const host = createMeasureHost();
  const measuredHeights = blocks.map((block) => {
    host.innerHTML = normalizeStructuredHtml(block.html);
    // Raw content height only. The section minimum is accounted once per
    // rendered section fragment by sectionFlowContributionPx below.
    return Math.max(0, host.getBoundingClientRect().height);
  });
  host.remove();

  // Official Batang Tubuh row chrome is 3mm top/bottom plus collapsed border.
  // Count it once when a section fragment starts; authored content is measured
  // separately by the content-only measurement host above.
  const baseRowPadding = getCanonicalSectionRowChromePx();

  const measureFlowPart = (html: string): number => {
    if (!html) return 0;
    return measureCanonicalFlowHtml([html]);
  };

  const pages: OfficialBlock[][] = [];
  let currentPageBlocks: OfficialBlock[] = [];
  let used = 0;
  let capacity = firstCapacity;
  let currentSection: OfficialBlock['section'] | null = null;
  let currentSectionRawHeight = 0;
  let currentSectionHtml: string[] = [];

  const flowBlocks: OfficialBlock[] = [...blocks];
  const flowHeights: number[] = [...measuredHeights];

  const commitCurrentPageAndStartNext = () => {
    if (currentPageBlocks.length) {
      // Structural empty sections are real editable rows, not blank pages.
      pages.push(currentPageBlocks);
    }
    currentPageBlocks = [];
    used = 0;
    capacity = normalCapacity;
    currentSection = null;
    currentSectionRawHeight = 0;
    currentSectionHtml = [];
  };

  let index = 0;
  let guard = 0;
  while (index < flowBlocks.length && guard < 10000) {
    guard += 1;
    const block = flowBlocks[index];
    const startsNewSectionRow =
      currentPageBlocks.length === 0 || block.section !== currentSection;
    const chrome = startsNewSectionRow ? baseRowPadding : 0;
    const nextSectionRawHeight = startsNewSectionRow
      ? flowHeights[index]
      : measureCanonicalFlowHtml([...currentSectionHtml, block.html]);
    const contentContribution = sectionFlowContributionPx(
      currentSectionRawHeight,
      startsNewSectionRow
        ? nextSectionRawHeight
        : Math.max(0, nextSectionRawHeight - currentSectionRawHeight),
      startsNewSectionRow
    );
    const needed = contentContribution + chrome;

    if (used + needed > capacity) {
      const remaining = Math.max(0, capacity - used - chrome);

      // Rich text is a continuous document flow. If a section is longer than
      // the remaining space, first try to consume that space and continue the
      // same section on the next page. This prevents large blank bottoms such
      // as moving an entire PROSEDUR paragraph to the next page.
      //
      // Tables/media are intentionally excluded: tables use safe row boundaries
      // and images are atomic. Short text that cannot be split safely still
      // falls through to the whole-block defer rule below.
      if (
        currentPageBlocks.length > 0 &&
        remaining >= 40 &&
        isSplittableTextFlowHtml(block.html)
      ) {
        const textParts = splitHtmlForCapacity(block.html, remaining, null);
        if (textParts.length > 1) {
          const firstPart = textParts[0];
          const restParts = textParts.slice(1);
          const firstHeight = measureFlowPart(firstPart);
          const firstAggregateHeight = startsNewSectionRow
            ? firstHeight
            : measureCanonicalFlowHtml([...currentSectionHtml, firstPart]);
          const firstNeeded = sectionFlowContributionPx(
            currentSectionRawHeight,
            startsNewSectionRow
              ? firstAggregateHeight
              : Math.max(0, firstAggregateHeight - currentSectionRawHeight),
            startsNewSectionRow
          ) + chrome;
          if (firstHeight > 0 && used + firstNeeded <= capacity) {
            const fittedFirstBlock: OfficialBlock = {
              ...block,
              id: `${block.id}-text-fit-1`,
              html: forceLogicalListMetadata(firstPart, block)
            };
            const continuationBlocks: OfficialBlock[] = restParts.map(
              (html, partIndex) => ({
                ...block,
                id: `${block.id}-text-fit-${partIndex + 2}`,
                html: forceLogicalListMetadata(html, block)
              })
            );
            const continuationHeights = continuationBlocks.map((part) =>
              measureFlowPart(part.html)
            );

            flowBlocks[index] = fittedFirstBlock;
            flowHeights[index] = firstHeight;
            flowBlocks.splice(index + 1, 0, ...continuationBlocks);
            flowHeights.splice(index + 1, 0, ...continuationHeights);

            currentPageBlocks.push(fittedFirstBlock);
            used += firstNeeded;
            currentSectionRawHeight = firstAggregateHeight;
            currentSectionHtml = startsNewSectionRow ? [firstPart] : [...currentSectionHtml, firstPart];
            currentSection = block.section;
            index += 1;
            continue;
          }
        }
      }

      // Structured tables are continuous row flow. Before considering a whole-
      // block defer, let the V2 table paginator consume every safe row that fits
      // in the remaining page space. If no body row can fit, the normal defer
      // rule below still moves the table intact to the next page.
      if (
        currentPageBlocks.length > 0 &&
        remaining >= 24 &&
        hasStructuredTableFlowHtml(block.html)
      ) {
        const tableParts = splitHtmlForCapacity(block.html, remaining, null);
        if (tableParts.length > 1) {
          const firstPart = tableParts[0];
          const restParts = tableParts.slice(1);
          const firstHeight = measureFlowPart(firstPart);
          const firstAggregateHeight = startsNewSectionRow
            ? firstHeight
            : measureCanonicalFlowHtml([...currentSectionHtml, firstPart]);
          const firstNeeded = sectionFlowContributionPx(
            currentSectionRawHeight,
            startsNewSectionRow
              ? firstAggregateHeight
              : Math.max(0, firstAggregateHeight - currentSectionRawHeight),
            startsNewSectionRow
          ) + chrome;
          if (firstHeight > 0 && used + firstNeeded <= capacity) {
            const fittedFirstBlock: OfficialBlock = {
              ...block,
              id: `${block.id}-table-fit-1`,
              html: forceLogicalListMetadata(firstPart, block)
            };
            const continuationBlocks: OfficialBlock[] = restParts.map(
              (html, partIndex) => ({
                ...block,
                id: `${block.id}-table-fit-${partIndex + 2}`,
                html: forceLogicalListMetadata(html, block)
              })
            );
            const continuationHeights = continuationBlocks.map((part) =>
              measureFlowPart(part.html)
            );

            flowBlocks[index] = fittedFirstBlock;
            flowHeights[index] = firstHeight;
            flowBlocks.splice(index + 1, 0, ...continuationBlocks);
            flowHeights.splice(index + 1, 0, ...continuationHeights);

            currentPageBlocks.push(fittedFirstBlock);
            used += firstNeeded;
            currentSectionRawHeight = firstAggregateHeight;
            currentSectionHtml = startsNewSectionRow ? [firstPart] : [...currentSectionHtml, firstPart];
            currentSection = block.section;
            index += 1;
            continue;
          }
        }
      }

      // A complete unit that fits on a fresh page moves there intact only after
      // rich text and structured tables have had a chance to consume the current
      // page. Images/media and genuinely unsplittable units remain atomic.
      if (
        currentPageBlocks.length > 0 &&
        shouldDeferWholeBlockToNextPage(
          flowHeights[index],
          remaining,
          Math.max(1, normalCapacity - baseRowPadding)
        )
      ) {
        commitCurrentPageAndStartNext();
        continue;
      }

      // Images/figures are atomic. Never split/crop them at the bottom edge.
      // If one is too tall even for a fresh page, scale the image itself down
      // proportionally to the canonical content box, then re-measure.
      if (currentPageBlocks.length === 0 && isAtomicMediaHtml(block.html)) {
        const pageRemaining = Math.max(1, capacity - chrome);
        const constrainedHtml = constrainAtomicMediaHtml(block.html, pageRemaining);
        if (constrainedHtml !== block.html) {
          const constrainedHeight = measureFlowPart(constrainedHtml);
          flowBlocks[index] = {
            ...block,
            html: constrainedHtml
          };
          flowHeights[index] = Math.min(constrainedHeight, pageRemaining);
          continue;
        }
      }

      if (remaining >= 24) {
        const parts = splitHtmlForCapacity(block.html, remaining, null);
        if (parts.length > 1) {
          const firstPart = parts[0];
          const restParts = parts.slice(1);
          const firstHeight = measureFlowPart(firstPart);
          const firstAggregateHeight = startsNewSectionRow
            ? firstHeight
            : measureCanonicalFlowHtml([...currentSectionHtml, firstPart]);
          const firstNeeded = sectionFlowContributionPx(
            currentSectionRawHeight,
            startsNewSectionRow
              ? firstAggregateHeight
              : Math.max(0, firstAggregateHeight - currentSectionRawHeight),
            startsNewSectionRow
          ) + chrome;

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
            currentSectionRawHeight = firstAggregateHeight;
            currentSectionHtml = startsNewSectionRow ? [firstPart] : [...currentSectionHtml, firstPart];
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

      // Fresh page but block exceeds full page: split only at safe content
      // boundaries. Tables use safe <tr>/rowspan boundaries; lists use whole
      // <li> items; long text uses markup-preserving text ranges.
      if (currentPageBlocks.length === 0 && capacity >= 40) {
        const pageRemaining = Math.max(1, capacity - chrome);
        const parts = splitHtmlForCapacity(block.html, pageRemaining, null);
        if (parts.length > 1) {
          const firstPart = parts[0];
          const restParts = parts.slice(1);
          const firstHeight = measureFlowPart(firstPart);
          const firstAggregateHeight = firstHeight;
          const firstNeeded = sectionFlowContributionPx(
            currentSectionRawHeight,
            firstAggregateHeight,
            startsNewSectionRow
          ) + chrome;

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
          currentSectionRawHeight = firstAggregateHeight;
          currentSectionHtml = [firstPart];
          currentSection = block.section;
          index += 1;
          continue;
        }

        // An unsplittable block must NEVER fall through and be clipped by the
        // physical A4 page. This should only be reachable for pathological
        // authored content (for example one table row taller than a full page).
        // Keep it visible instead of silently cropping it; the normal table and
        // media paths above prevent this for valid content.
        const unsplittable: OfficialBlock = {
          ...block,
          html: block.html.replace(
            /^(<(?:table|ol|ul|p|div|blockquote)\b)/i,
            '$1 data-sop-unsplittable-overflow="true"'
          )
        };
        currentPageBlocks.push(unsplittable);
        used = capacity;
        currentSection = block.section;
        index += 1;
        commitCurrentPageAndStartNext();
        continue;
      }
    }

    // Block fits on current page
    currentPageBlocks.push(block);
    used += needed;
    currentSectionRawHeight = nextSectionRawHeight;
    currentSectionHtml = startsNewSectionRow ? [block.html] : [...currentSectionHtml, block.html];
    currentSection = block.section;
    index += 1;
  }

  if (currentPageBlocks.length) {
    pages.push(currentPageBlocks);
  }

  return pages.length ? pages : [[]];
}
