const fs = require('node:fs');

const path = 'src/components/RichTextEditor.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceExact(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Ambiguous patch target: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

function removeBetween(start, end, label) {
  const from = source.indexOf(start);
  if (from < 0) throw new Error(`Missing start marker: ${label}`);
  const to = source.indexOf(end, from);
  if (to < 0) throw new Error(`Missing end marker: ${label}`);
  source = source.slice(0, from) + source.slice(to);
}

replaceExact(
  "import { createSemanticTable, mutateTable, type TableCommand } from '../utils/editorTableCommands';",
  "import { canMergeCell, createSemanticTable, mutateTable, type TableCommand } from '../utils/editorTableCommands';",
  'table command import',
);

replaceExact(
`import {
  applyLogicalColumnWidths, ensureLogicalColumns, logicalColumnWidths,
  MIN_TABLE_COLUMN_PX, resizeLogicalBoundary, setRowMinimumHeight,
} from '../utils/tableGeometry';`,
`import {
  applyLogicalColumnWidths, enableTableBorderResize, ensureLogicalColumns, logicalColumnWidths,
  MIN_TABLE_COLUMN_PX, resizeLogicalBoundary, restoreTableSnapshot, setRowMinimumHeight,
} from '../utils/tableGeometry';`,
  'table geometry import',
);

replaceExact(
`  const tableResizeRef = useRef<{ startX: number; startWidth: number; editorWidth: number } | null>(null);
  const gridResizeRef = useRef<{`,
`  const gridResizeRef = useRef<{`,
  'remove legacy table resize ref',
);

replaceExact(
`  } | null>(null);
  const tableMoveRef = useRef<{ startX: number } | null>(null);

  const updateTableRect`,
`  } | null>(null);

  const updateTableRect`,
  'remove legacy table move ref',
);

const rectEffect = `  useEffect(() => {
    updateTableRect();
    const refresh = () => updateTableRect();
    window.addEventListener('resize', refresh);
    containerRef.current?.addEventListener('scroll', refresh, { passive: true });
    return () => {
      window.removeEventListener('resize', refresh);
      containerRef.current?.removeEventListener('scroll', refresh);
    };
  }, [updateTableRect]);`;
replaceExact(
  rectEffect,
`${rectEffect}

  // Native outer-border commits replace the table node so they participate in
  // browser undo. Rebind React selection state to the replacement immediately.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const handleTableRebind = (event: Event) => {
      const table = (event as CustomEvent<{ table?: HTMLTableElement }>).detail?.table;
      if (!table || !editor.contains(table)) return;
      enableTableBorderResize(table);
      setSelectedTable(table);
      updateTableRect(table);
    };
    editor.addEventListener('sidokter:table-rebind', handleTableRebind);
    return () => editor.removeEventListener('sidokter:table-rebind', handleTableRebind);
  }, [updateTableRect]);`,
  'table rebind effect',
);

source = source.replace(
  /canMerge: Boolean\(activeCell\?\.nextElementSibling\),/g,
  "canMerge: Boolean(activeCell && (canMergeCell(activeCell, 'right') || canMergeCell(activeCell, 'down'))),",
);
source = source.replace(
  /canMerge: Boolean\(activeCell\.nextElementSibling\),/g,
  "canMerge: canMergeCell(activeCell, 'right') || canMergeCell(activeCell, 'down'),",
);

replaceExact(
  '    if (activeTable) ensureLogicalColumns(activeTable);',
  '    if (activeTable) enableTableBorderResize(activeTable);',
  'table click must not normalize DOM',
);

replaceExact(
`    const autoFit = table.dataset.tableAutofit !== 'true';
    if (autoFit) {
      table.dataset.tableAutofit = 'true';
      delete table.dataset.tableWidth;
      table.style.removeProperty('--table-width');
    }
    else delete table.dataset.tableAutofit;
    handleInput();`,
`    const autoFit = table.dataset.tableAutofit !== 'true';
    const currentAlign: TableAlignment = table.dataset.align === 'center' || table.dataset.align === 'right'
      ? table.dataset.align
      : 'left';
    if (autoFit) {
      table.dataset.tableAutofit = 'true';
      delete table.dataset.tableWidth;
      table.style.removeProperty('--table-width');
      applyTableAlignment(table, currentAlign);
      table.style.tableLayout = 'auto';
    } else {
      delete table.dataset.tableAutofit;
      ensureLogicalColumns(table);
      table.style.tableLayout = 'fixed';
    }
    handleInput();`,
  'autofit geometry reset',
);

removeBetween(
  '  const handleTableResizeStart = useCallback',
  '  const finishGridResize = useCallback',
  'remove legacy corner table resize engine',
);

replaceExact(
`    document.execCommand('insertHTML', false, finalHtml);
    const next = editorRef.current.querySelector<HTMLTableElement>(\`table[data-geometry-marker="\${marker}"]\`);
    delete next?.dataset.geometryMarker;`,
`    let committed = false;
    try {
      committed = Boolean(document.execCommand('insertHTML', false, finalHtml));
    } catch {
      committed = false;
    }
    if (!committed) original.outerHTML = finalHtml;
    const next = editorRef.current.querySelector<HTMLTableElement>(\`table[data-geometry-marker="\${marker}"]\`);
    delete next?.dataset.geometryMarker;
    if (next) enableTableBorderResize(next);`,
  'grid resize native fallback',
);

replaceExact(
`  const startColumnResize = useCallback((event: React.PointerEvent<HTMLButtonElement>, boundary: number) => {`,
`  const cancelGridResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = gridResizeRef.current;
    if (!drag || !selectedTable) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    gridResizeRef.current = null;
    restoreTableSnapshot(selectedTable, drag.snapshot);
    enableTableBorderResize(selectedTable);
    updateTableRect(selectedTable);
  }, [selectedTable, updateTableRect]);

  const startColumnResize = useCallback((event: React.PointerEvent<HTMLButtonElement>, boundary: number) => {`,
  'grid cancel transaction',
);

removeBetween(
  '  const handleTableMoveStart = useCallback',
  '  // The desktop Live A4 uses one shared toolbar',
  'remove ambiguous drag-to-align table control',
);

const legacyOverlayControls = `            <button
              type="button"
              tabIndex={-1}
              className="table-move-handle pointer-events-auto"
              title="Geser posisi tabel"
              onPointerDown={handleTableMoveStart}
              onPointerMove={handleTableMove}
              onPointerUp={handleTableMoveEnd}
              onPointerCancel={handleTableMoveEnd}
            ><Move /></button>
            <button
              type="button"
              tabIndex={-1}
              className="table-resize-handle pointer-events-auto"
              title="Ubah lebar tabel"
              onPointerDown={handleTableResizeStart}
              onPointerMove={handleTableResizeMove}
              onPointerUp={handleTableResizeEnd}
              onPointerCancel={handleTableResizeEnd}
            />
`;
replaceExact(legacyOverlayControls, '', 'remove duplicate overlay controls');

replaceExact(
  '            {logicalColumnWidths(selectedTable).slice(0, -1).map((_, boundary, widths) => {',
  '            {logicalColumnWidths(selectedTable, false).slice(0, -1).map((_, boundary, widths) => {',
  'pure overlay column measurement',
);

const cancelCount = (source.match(/onPointerCancel=\{finishGridResize\}/g) || []).length;
if (cancelCount !== 2) throw new Error(`Expected 2 grid pointer-cancel handlers, found ${cancelCount}`);
source = source.replace(/onPointerCancel=\{finishGridResize\}/g, 'onPointerCancel={cancelGridResize}');

// Manual horizontal position is a first-class saved geometry attribute.
source = source.replace(
  /'data-table-width', 'data-row-min-height'/g,
  "'data-table-width', 'data-table-left', 'data-row-min-height'",
);

fs.writeFileSync(path, source);
console.log('Patched RichTextEditor table stabilization successfully.');
