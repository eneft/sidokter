/** Ephemeral identity for cloned nodes, used only by the one-cell layout splitter. */
let nextFragmentGroup = 0;
const ID = 'data-sop-rejoin';
const ORIGINAL = 'data-sop-rejoin-list';

export function markLayoutTableForReassembly(table: HTMLElement): void {
  const group = `layout-${++nextFragmentGroup}`;
  [table, ...Array.from(table.querySelectorAll<HTMLElement>('*'))].forEach((node, index) => {
    // A continuation can itself be split on later pages. Keep its first identity.
    if (!node.hasAttribute(ID)) node.setAttribute(ID, `${group}-${index}`);
    if (/^(OL|UL)$/.test(node.tagName) && !node.hasAttribute(ORIGINAL)) {
      node.setAttribute(ORIGINAL, JSON.stringify({
        start: node.getAttribute('start'),
        counter: node.style.getPropertyValue('counter-reset'),
        offset: node.style.getPropertyValue('--sop-start-offset'),
      }));
    }
  });
}

/** Browser Enter can clone custom attributes onto a NEW list item/paragraph.
 * Only the identities already present in that displayed fragment may rejoin. */
export function prepareEditedPaginationFragment(html: string, previousHtml: string): string {
  if (!html.includes(ID)) return html;
  const previous = new DOMParser().parseFromString(previousHtml, 'text/html');
  const budget = new Map<string, number>();
  previous.querySelectorAll(`[${ID}]`).forEach(node => {
    const id = node.getAttribute(ID)!;
    budget.set(id, (budget.get(id) || 0) + 1);
  });
  const edited = new DOMParser().parseFromString(html, 'text/html');
  edited.querySelectorAll(`[${ID}]`).forEach(node => {
    const id = node.getAttribute(ID);
    if (!id) return;
    const remaining = budget.get(id) || 0;
    if (remaining > 0) { budget.set(id, remaining - 1); return; }
    // Enter splits the logical item too: later page continuations now belong
    // to the new item, not to the part preceding the caret.
    [node, ...Array.from(node.querySelectorAll(`[${ID}]`))].forEach(fresh => {
      const sourceId = fresh.getAttribute(ID)!;
      fresh.setAttribute(ID, `edit-${++nextFragmentGroup}`);
      fresh.setAttribute('data-sop-rejoin-from', sourceId);
      for (const attr of ['data-sop-continuation-li',
        'data-sop-list-continuation', 'data-sop-continuation-number']) fresh.removeAttribute(attr);
    });
  });
  return edited.body.innerHTML;
}

/** Join only adjacent clones of the SAME source node, never unrelated tables/lists. */
export function reassemblePaginatedSection(html: string, editedPartHtml?: string): string {
  if (!html.includes(ID)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // The edited fragment owns attribute changes too (manual number, alignment,
  // cell width). A later unedited clone must not overwrite those changes.
  const edited = new Map<string, Element>();
  if (editedPartHtml !== undefined) {
    const part = new DOMParser().parseFromString(editedPartHtml, 'text/html');
    part.querySelectorAll(`[${ID}]`).forEach(node => edited.set(node.getAttribute(ID)!, node));
  }
  const redirected = new Map<string, string>();
  doc.querySelectorAll(`[${ID}]`).forEach(node => {
    const id = node.getAttribute(ID)!;
    const from = node.getAttribute('data-sop-rejoin-from');
    if (from) redirected.set(from, id);
    else if (redirected.has(id)) node.setAttribute(ID, redirected.get(id)!);
  });
  const join = (parent: Element) => {
    let node = parent.firstChild;
    while (node) {
      const next = node.nextSibling;
      if (node.nodeType === 1 && next?.nodeType === 1) {
        const left = node as Element;
        const right = next as Element;
        const identity = left.getAttribute(ID);
        if (identity && identity === right.getAttribute(ID) && left.tagName === right.tagName) {
          if (left.tagName === 'TABLE' && left.querySelectorAll('tr').length === 1 &&
              right.querySelectorAll('tr').length === 1 && left.querySelectorAll('td').length === 1 &&
              right.querySelectorAll('td').length === 1) {
            // Only cell contents were split. The surrounding whitespace,
            // colgroup and caption are cloned scaffolding, not repeated content.
            const target = left.querySelector('td')!;
            const source = right.querySelector('td')!;
            while (source.firstChild) target.appendChild(source.firstChild);
          } else {
            while (right.firstChild) left.appendChild(right.firstChild);
          }
          right.remove();
          continue;
        }
      }
      if (node.nodeType === 1) join(node as Element);
      node = next;
    }
  };
  join(doc.body);
  doc.body.querySelectorAll<HTMLElement>(`[${ID}]`).forEach(node => {
    const changed = edited.get(node.getAttribute(ID)!);
    if (changed && changed.tagName === node.tagName) {
      for (const attr of Array.from(node.attributes)) node.removeAttribute(attr.name);
      for (const attr of Array.from(changed.attributes)) node.setAttribute(attr.name, attr.value);
    }
    const original = node.getAttribute(ORIGINAL);
    if (original) {
      try {
        const attrs = JSON.parse(original);
        if (attrs.start === null) node.removeAttribute('start');
        else if (typeof attrs.start === 'string') node.setAttribute('start', attrs.start);
        for (const [property, value] of [['counter-reset', attrs.counter], ['--sop-start-offset', attrs.offset]]) {
          if (typeof value === 'string' && value) node.style.setProperty(property, value);
          else node.style.removeProperty(property);
        }
        if (!node.getAttribute('style')?.trim()) node.removeAttribute('style');
      } catch { /* Malformed transient metadata cannot discard authored content. */ }
    }
    for (const attr of [ID, ORIGINAL, 'data-sop-rejoin-from', 'data-sop-table-continuation',
      'data-sop-list-continuation', 'data-sop-continuation-number', 'data-sop-continuation-li']) {
      node.removeAttribute(attr);
    }
  });
  return doc.body.innerHTML;
}
