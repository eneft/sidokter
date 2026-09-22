import { parseHTML } from 'linkedom';

const directRows = (table: Element): HTMLElement[] => {
  const rows: HTMLElement[] = [];
  Array.from(table.children).forEach((child) => {
    if (child.tagName === 'TR') {
      rows.push(child as HTMLElement);
      return;
    }
    if (child.tagName === 'THEAD' || child.tagName === 'TBODY' || child.tagName === 'TFOOT') {
      Array.from(child.children).forEach((row) => {
        if (row.tagName === 'TR') rows.push(row as HTMLElement);
      });
    }
  });
  return rows;
};

const directCells = (row: Element): HTMLElement[] =>
  Array.from(row.children).filter((child) => child.tagName === 'TD' || child.tagName === 'TH') as HTMLElement[];

const define = (target: object, name: PropertyKey, descriptor: PropertyDescriptor) => {
  const existing = Object.getOwnPropertyDescriptor(target, name);
  if (!existing || existing.configurable) Object.defineProperty(target, name, { configurable: true, ...descriptor });
};

/**
 * linkedom intentionally implements only a subset of the browser HTMLTable API.
 * Production uses the native table collections/mutators, so tests install the
 * missing browser-compatible surface instead of changing production semantics.
 */
const installTableDomCompatibility = (table: HTMLTableElement) => {
  const doc = table.ownerDocument;
  const sampleRow = table.querySelector('tr') || doc.createElement('tr');
  const sampleCell = table.querySelector('td,th') || doc.createElement('td');
  const tableProto = Object.getPrototypeOf(table);
  const rowProto = Object.getPrototypeOf(sampleRow);
  const cellProto = Object.getPrototypeOf(sampleCell);

  define(tableProto, 'rows', {
    get(this: HTMLTableElement) {
      return directRows(this) as unknown as HTMLCollectionOf<HTMLTableRowElement>;
    },
  });
  define(tableProto, 'createTBody', {
    value(this: HTMLTableElement) {
      const body = this.ownerDocument.createElement('tbody');
      this.appendChild(body);
      return body;
    },
  });
  define(tableProto, 'insertRow', {
    value(this: HTMLTableElement, requestedIndex = -1) {
      const rows = directRows(this);
      const index = requestedIndex < 0 ? rows.length : requestedIndex;
      if (index < 0 || index > rows.length) throw new DOMException('IndexSizeError');
      const row = this.ownerDocument.createElement('tr');
      const reference = rows[index] || null;
      if (reference?.parentNode) reference.parentNode.insertBefore(row, reference);
      else {
        const sections = Array.from(this.children).filter((child) =>
          child.tagName === 'THEAD' || child.tagName === 'TBODY' || child.tagName === 'TFOOT');
        (sections.at(-1) || this).appendChild(row);
      }
      return row;
    },
  });

  define(rowProto, 'cells', {
    get(this: HTMLTableRowElement) {
      return directCells(this) as unknown as HTMLCollectionOf<HTMLTableCellElement>;
    },
  });
  define(rowProto, 'rowIndex', {
    get(this: HTMLTableRowElement) {
      const owner = this.closest('table');
      return owner ? directRows(owner).indexOf(this as unknown as HTMLElement) : -1;
    },
  });
  define(rowProto, 'insertCell', {
    value(this: HTMLTableRowElement, requestedIndex = -1) {
      const cells = directCells(this);
      const index = requestedIndex < 0 ? cells.length : requestedIndex;
      if (index < 0 || index > cells.length) throw new DOMException('IndexSizeError');
      const cell = this.ownerDocument.createElement('td');
      this.insertBefore(cell, cells[index] || null);
      return cell;
    },
  });

  define(cellProto, 'cellIndex', {
    get(this: HTMLTableCellElement) {
      const row = this.parentElement;
      return row ? directCells(row).indexOf(this as unknown as HTMLElement) : -1;
    },
  });
  for (const [property, attribute] of [['rowSpan', 'rowspan'], ['colSpan', 'colspan']] as const) {
    define(cellProto, property, {
      get(this: HTMLTableCellElement) {
        const parsed = Number.parseInt(this.getAttribute(attribute) || '1', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      },
      set(this: HTMLTableCellElement, value: number) {
        const normalized = Math.max(1, Math.trunc(Number(value) || 1));
        this.setAttribute(attribute, String(normalized));
      },
    });
  }
};

export const makeTestTable = (markup: string) => {
  const { document, window } = parseHTML(`<html><body>${markup}</body></html>`);
  const table = document.querySelector('table') as unknown as HTMLTableElement | null;
  if (!table) throw new Error('fixture must contain a table');
  installTableDomCompatibility(table);
  (globalThis as any).document = document;
  (globalThis as any).Node = (window as any).Node;
  (globalThis as any).DOMException = (window as any).DOMException || globalThis.DOMException;
  return { document, window, table };
};
