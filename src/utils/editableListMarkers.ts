/**
 * Direct editing of visible SPO list markers, without adding marker text to
 * authored paragraphs. The editable HTML retains <ol>/<li value>, and marker
 * display attributes are regenerated for automatic continuation after edits.
 */
export type BulletMarkerKind = 'disc' | 'square' | 'circle' | 'check' | 'arrow';
export type EditableMarkerKind = '1' | 'a' | 'A' | BulletMarkerKind;
export const BULLET_MARKER_GLYPHS: Record<BulletMarkerKind, string> = {
  disc:'•',square:'▪',circle:'○',check:'✓',arrow:'➤'
};
export const isBulletMarkerKind = (value:string):value is BulletMarkerKind =>
  Object.prototype.hasOwnProperty.call(BULLET_MARKER_GLYPHS,value);
export type MarkerParseResult = { kind: EditableMarkerKind; number: number | null };

const numericValue = (input: string): number =>
  [...input.toUpperCase()].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0);

export function parseEditableMarker(input: string): MarkerParseResult | null {
  const raw = input.trim();
  if (/^[1-9]\d{0,3}[.)]?$/.test(raw)) return { kind: '1', number: parseInt(raw, 10) };
  if (/^[a-z]{1,3}[.)]?$/.test(raw)) {
    const number = numericValue(raw.replace(/[.)]$/, ''));
    return number <= 9999 ? { kind: 'a', number } : null;
  }
  if (/^[A-Z]{1,3}[.)]?$/.test(raw)) {
    const number = numericValue(raw.replace(/[.)]$/, ''));
    return number <= 9999 ? { kind: 'A', number } : null;
  }
  if (raw === '•' || raw === '●' || raw === '-' || raw === '*') {
    return { kind: 'disc', number: null };
  }
  if (raw === '▪' || raw === '■' || raw === '□') return {kind:'square',number:null};
  if (raw === '○' || raw === '◦' || raw === '◯') return {kind:'circle',number:null};
  if (raw === '✓' || raw === '✔') return {kind:'check',number:null};
  if (raw === '➤' || raw === '➜' || raw === '→') return {kind:'arrow',number:null};
  return null;
}

const letter = (number: number, upper: boolean): string => {
  let value = Math.max(1, number);
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + value % 26) + label;
    value = Math.floor(value / 26);
  }
  return upper ? label : label.toLowerCase();
};

const formatMarker = (kind: EditableMarkerKind, number: number): string => {
  if (isBulletMarkerKind(kind)) return BULLET_MARKER_GLYPHS[kind];
  if (kind === 'a' || kind === 'A') return letter(number, kind === 'A') + '.';
  return String(number) + '.';
};

const childItems = (list: Element): HTMLLIElement[] =>
  Array.from(list.children).filter((node): node is HTMLLIElement => node.tagName === 'LI');

/** Only touch the target logical list; nested lists are separate sequences. */
export function refreshInlineListMarkers(list: HTMLOListElement | HTMLUListElement): void {
  if (list.getAttribute('data-sop-inline-markers') !== 'true') return;
  const isOrdered = list.tagName === 'OL';
  const initialKind: EditableMarkerKind = isOrdered
    ? (list.getAttribute('data-sop-list-format') || list.getAttribute('type')) === 'a' ? 'a'
      : (list.getAttribute('data-sop-list-format') || list.getAttribute('type')) === 'A' ? 'A' : '1'
    : isBulletMarkerKind(list.getAttribute('data-sop-bullet') || '')
      ? list.getAttribute('data-sop-bullet') as BulletMarkerKind : 'disc';
  const items = childItems(list);
  // Physical A4 pagination can split an OL after a mode switch (e.g. 5. → c.).
  // The first LI of the next physical fragment carries its inherited marker
  // mode, so re-editing page 2 must not silently revert c,d,e to 6,7,8.
  const inherited = items[0]?.getAttribute('data-sop-marker-inherited-kind') as EditableMarkerKind | null;
  let currentKind = inherited && ['1','a','A'].includes(inherited)
    ? inherited : initialKind;
  let next = isOrdered ? Math.max(1, list.start || 1) : 1;
  for (const item of items) {
    const override = item.getAttribute('data-sop-marker-kind') as EditableMarkerKind | null;
    const kind = override && (['1','a','A'].includes(override) || isBulletMarkerKind(override))
      ? override : currentKind;
    if (!isBulletMarkerKind(kind)) {
      currentKind = kind;
      const value = Number(item.getAttribute('value') ?? item.getAttribute('data-sop-manual-number'));
      if (Number.isSafeInteger(value) && value >= 1 && value <= 9999) next = value;
      item.setAttribute('data-sop-marker-label', formatMarker(kind, next));
      next += 1;
    } else {
      item.setAttribute('data-sop-marker-label', formatMarker(kind, next));
    }
    item.setAttribute('data-sop-marker-inherited-kind', currentKind);
  }
}

export function refreshInlineMarkersInEditor(editor: HTMLElement): void {
  editor.querySelectorAll<HTMLOListElement | HTMLUListElement>(
    'ol[data-sop-inline-markers="true"],ul[data-sop-inline-markers="true"]'
  ).forEach(refreshInlineListMarkers);
}

export function currentInlineMarker(item: HTMLLIElement): string {
  if (item.hasAttribute('data-sop-marker-label')) return item.getAttribute('data-sop-marker-label') || '';
  const list = item.parentElement;
  if (!list || !/^(OL|UL)$/.test(list.tagName)) return '';
  const isOrdered = list.tagName === 'OL';
  if (!isOrdered) {
    const style = list.getAttribute('data-sop-bullet') || 'disc';
    return BULLET_MARKER_GLYPHS[isBulletMarkerKind(style) ? style : 'disc'];
  }
  const kind = (list.getAttribute('data-sop-list-format') || list.getAttribute('type')) === 'a'
    ? 'a' : (list.getAttribute('data-sop-list-format') || list.getAttribute('type')) === 'A' ? 'A' : '1';
  let next = Math.max(1, (list as HTMLOListElement).start || 1);
  for (const li of childItems(list)) {
    const value = Number(li.getAttribute('value') ?? li.getAttribute('data-sop-manual-number'));
    if (Number.isSafeInteger(value) && value >= 1) next = value;
    if (li === item) return formatMarker(kind, next);
    next += 1;
  }
  return '';
}

/** Apply a typed marker, leaving every list item's body text untouched. */
export function applyInlineMarker(item: HTMLLIElement, typed: string): boolean {
  const parsed = parseEditableMarker(typed);
  if (!parsed) return false;
  let list = item.parentElement;
  if (!list || !/^(OL|UL)$/.test(list.tagName)) return false;

  // If an existing bullet list begins receiving numbered markers, turn it
  // into a semantic OL, while retaining earlier bullet markers individually.
  if (list.tagName === 'UL' && parsed.number !== null) {
    const replacement = list.ownerDocument.createElement('ol');
    for (const attr of Array.from(list.attributes)) {
      if (attr.name !== 'data-sop-bullet') replacement.setAttribute(attr.name, attr.value);
    }
    replacement.setAttribute('type', '1');
    replacement.setAttribute('data-sop-list-format', '1');
    const initialBullet = list.getAttribute('data-sop-bullet') || 'disc';
    const originalBullet = isBulletMarkerKind(initialBullet) ? initialBullet : 'disc';
    const priorItems = childItems(list);
    for (const li of priorItems) {
      if (li !== item && !li.hasAttribute('data-sop-marker-kind')) {
        li.setAttribute('data-sop-marker-kind', originalBullet);
      }
      replacement.appendChild(li);
    }
    list.replaceWith(replacement);
    list = replacement;
  }

  if (parsed.number === null) {
    item.removeAttribute('value');
    item.removeAttribute('data-sop-manual-number');
    item.style.removeProperty('--sop-manual-number');
  } else {
    item.setAttribute('value', String(parsed.number));
    item.setAttribute('data-sop-manual-number', String(parsed.number));
    item.style.setProperty('--sop-manual-number', String(parsed.number));
  }
  item.setAttribute('data-sop-marker-kind', parsed.kind);
  list.setAttribute('data-sop-inline-markers', 'true');
  refreshInlineListMarkers(list as HTMLOListElement | HTMLUListElement);
  return true;
}
