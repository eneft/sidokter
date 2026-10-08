/**
 * Stable caret coordinates for the Live SPO contentEditable A4 editor.
 *
 * Text-only offsets alias the end of "item one" with the start of a newly
 * created EMPTY list item/paragraph after Enter. A canonical HTML refresh
 * consequently restores the caret to the previous item. Count semantic block
 * boundaries as one zero-width coordinate unit in addition to text nodes.
 * This metadata exists only in memory; the authored SPO HTML is unchanged.
 */
const SEMANTIC_BOUNDARY_TAGS = new Set([
  'P', 'DIV', 'LI', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'TR', 'TD', 'TH'
]);

const isBoundary = (node: Node): boolean =>
  node.nodeType === Node.ELEMENT_NODE &&
  SEMANTIC_BOUNDARY_TAGS.has((node as Element).tagName);

/** Count textual + structural units, excluding the artificial editor root. */
export function logicalCaretLength(node: Node, isRoot = false): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').length;
  let length = !isRoot && isBoundary(node) ? 1 : 0;
  node.childNodes.forEach(child => { length += logicalCaretLength(child); });
  return length;
}

/** Position a DOM Selection endpoint in stable, structure-aware coordinates. */
export function logicalCaretOffset(
  root: HTMLElement, anchor: Node, offset: number
): number | null {
  if (root !== anchor && !root.contains(anchor)) return null;

  const walk = (node: Node, isRoot: boolean): number | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node === anchor
        ? Math.max(0, Math.min(offset, (node.textContent || '').length))
        : null;
    }
    let consumed = !isRoot && isBoundary(node) ? 1 : 0;
    if (node === anchor) {
      const count = Math.max(0, Math.min(offset, node.childNodes.length));
      for (let i = 0; i < count; i++) {
        consumed += logicalCaretLength(node.childNodes[i]);
      }
      return consumed;
    }
    for (const child of Array.from(node.childNodes)) {
      if (child === anchor || child.contains(anchor)) {
        const nested = walk(child, false);
        return nested === null ? null : consumed + nested;
      }
      consumed += logicalCaretLength(child);
    }
    return null;
  };
  return walk(root, true);
}

/** Resolve a logical position to a DOM endpoint after a canonical HTML redraw. */
export function resolveLogicalCaretOffset(
  root: HTMLElement, absolute: number
): { node: Node; offset: number } {
  const walk = (node: Node, position: number, isRoot: boolean):
  { node: Node; offset: number } => {
    if (node.nodeType === Node.TEXT_NODE) {
      return { node, offset: Math.max(0, Math.min(position, (node.textContent || '').length)) };
    }
    let remaining = position;
    if (!isRoot && isBoundary(node)) {
      if (remaining <= 1) return { node, offset: 0 };
      remaining -= 1;
    }
    const children = Array.from(node.childNodes);
    for (let index = 0; index < children.length; index++) {
      const child = children[index];
      const length = logicalCaretLength(child);
      if (remaining <= length) return walk(child, remaining, false);
      remaining -= length;
    }
    return { node, offset: children.length };
  };
  return walk(root, Math.max(0, Math.min(absolute, logicalCaretLength(root, true))), true);
}

/** Measure a detached HTML fragment with the same coordinate system. */
export function logicalHtmlLength(html: string): number {
  const fragment = document.createElement('div');
  fragment.innerHTML = html;
  return logicalCaretLength(fragment, true);
}
