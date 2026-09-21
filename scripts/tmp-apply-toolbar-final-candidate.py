from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    assert count == 1, f"{label}: expected exactly one match, found {count}"
    return text.replace(old, new, 1)

# -----------------------------------------------------------------------------
# RichTextEditor: section-aware history bridge, explicit table ownership,
# atomic image reset. Keep standalone editor native history as fallback.
# -----------------------------------------------------------------------------
editor_path = Path('src/components/RichTextEditor.tsx')
editor = editor_path.read_text()

editor = replace_once(
    editor,
    "/** Canonical font sizes supported by LiveSPOEditor document content. */\nexport type LiveSopFontSize = '8pt' | '10pt' | '12pt';\n",
    "/** Canonical font sizes supported by LiveSPOEditor document content. */\nexport type LiveSopFontSize = '8pt' | '10pt' | '12pt';\nexport type RichTextHistoryCommand = 'undo' | 'redo';\nexport interface RichTextChangeMeta {\n  historyMode: 'coalesce' | 'discrete';\n}\n",
    'editor history types',
)

editor = replace_once(
    editor,
    "  onChange: (val: string) => void;\n",
    "  onChange: (val: string, meta?: RichTextChangeMeta) => void;\n",
    'editor onChange type',
)

editor = replace_once(
    editor,
    "  onFormattingChange?: (formatting: RichTextFormattingState) => void;\n  // Optional canonical pagination generation supplied by SopLiveTemplate.\n",
    "  onFormattingChange?: (formatting: RichTextFormattingState) => void;\n  // Shared multi-page Live A4 supplies section-level history because native\n  // contentEditable history is owned by one physical page fragment. Standalone\n  // editors omit this callback and keep the browser's native history.\n  onHistoryCommand?: (command: RichTextHistoryCommand) => boolean;\n  // Optional canonical pagination generation supplied by SopLiveTemplate.\n",
    'editor history prop',
)

editor = replace_once(
    editor,
    "  onFocus,\n  onFormattingChange,\n  paginationEpoch,\n}, forwardedRef) {",
    "  onFocus,\n  onFormattingChange,\n  onHistoryCommand,\n  paginationEpoch,\n}, forwardedRef) {",
    'editor history prop destructure',
)

editor = replace_once(
    editor,
    "  const handleInput = useCallback(() => {\n    if (isUpdatingFromPropRef.current || !editorRef.current) return;\n    normalizeStructuredTables(editorRef.current);\n    const html = editorRef.current.innerHTML;\n    const cleanHtml = html === '<br>' || html.trim() === '' ? '' : html;\n    lastEmittedValueRef.current = cleanHtml;\n    onChange(cleanHtml);\n    updateFigureRect();\n  }, [onChange, updateFigureRect]);",
    "  const handleInput = useCallback((historyMode: RichTextChangeMeta['historyMode'] = 'discrete') => {\n    if (isUpdatingFromPropRef.current || !editorRef.current) return;\n    normalizeStructuredTables(editorRef.current);\n    const html = editorRef.current.innerHTML;\n    const cleanHtml = html === '<br>' || html.trim() === '' ? '' : html;\n    lastEmittedValueRef.current = cleanHtml;\n    onChange(cleanHtml, { historyMode });\n    updateFigureRect();\n  }, [onChange, updateFigureRect]);",
    'editor handleInput metadata',
)

old_table_pointer = """    const activeTable = activeCell.closest('table') as HTMLTableElement | null;
    if (activeTable) ensureLogicalColumns(activeTable);
    setSelectedTable(activeTable);
    updateTableRect(activeTable);
    const tableAlign = activeTable?.dataset.align;
    const cellPosition = getTableCellPosition(activeCell, activeTable);
    const cellRange = document.createRange();
    cellRange.selectNodeContents(activeCell);
    cellRange.collapse(true);
    // Keep table commands pinned to the cell that was actually clicked. This
    // covers empty cells and padding clicks where the browser leaves its native
    // selection in the previously active cell.
    savedRangeRef.current = cellRange;
    // A click on cell padding or an empty cell may not move the browser
    // selection. Publish table context directly from the pointer target so the
    // shared toolbar switches modes immediately and consistently.
    setActiveFormatting(current => ({
      ...current,
      context: 'table',
      inTable: true,
      tableAutoFit: activeTable?.dataset.tableAutofit === 'true',
      tableAlign: tableAlign === 'center' || tableAlign === 'right' ? tableAlign : 'left',
      tableRow: cellPosition.row,
      tableColumn: cellPosition.column,
      tableColumnCount: cellPosition.columnCount,
      canMerge: Boolean(activeCell.nextElementSibling),
      canSplit: activeCell.rowSpan > 1 || activeCell.colSpan > 1,
    }));
  }, [updateTableRect]);"""
new_table_pointer = """    // Table cell clicks can happen while this contentEditable already owns DOM
    // focus, so React onFocus will not fire again. Claim shared-toolbar ownership
    // explicitly, exactly like object/image selection does.
    onFocus?.();
    const activeTable = activeCell.closest('table') as HTMLTableElement | null;
    if (activeTable) ensureLogicalColumns(activeTable);
    setSelectedTable(activeTable);
    updateTableRect(activeTable);
    const tableAlign = activeTable?.dataset.align;
    const cellPosition = getTableCellPosition(activeCell, activeTable);
    const cellRange = document.createRange();
    cellRange.selectNodeContents(activeCell);
    cellRange.collapse(true);
    // Keep table commands pinned to the cell that was actually clicked. This
    // covers empty cells and padding clicks where the browser leaves its native
    // selection in the previously active cell.
    savedRangeRef.current = cellRange;
    // Publish table context synchronously after ownership is claimed. Do not
    // call the parent from a functional state updater (React cross-render hazard).
    const next: RichTextFormattingState = {
      ...activeFormatting,
      context: 'table',
      inTable: true,
      tableAutoFit: activeTable?.dataset.tableAutofit === 'true',
      tableAlign: tableAlign === 'center' || tableAlign === 'right' ? tableAlign : 'left',
      tableRow: cellPosition.row,
      tableColumn: cellPosition.column,
      tableColumnCount: cellPosition.columnCount,
      canMerge: Boolean(activeCell.nextElementSibling),
      canSplit: activeCell.rowSpan > 1 || activeCell.colSpan > 1,
    };
    setActiveFormatting(next);
    onFormattingChange?.(next);
  }, [activeFormatting, onFocus, onFormattingChange, updateTableRect]);"""
editor = replace_once(editor, old_table_pointer, new_table_pointer, 'table ownership bridge')

old_execute = """  const executeCommand = (command: string, arg: string | undefined = undefined) => {
    if (!editorRef.current) return;
    const isHistoryCommand = command === 'undo' || command === 'redo';
    if (selectedFigure && !isHistoryCommand) return;
    const restored = restoreSavedSelection();
    if (!isHistoryCommand && !restored) return;

    try {
      document.execCommand(command, false, arg);
    } catch {
      // Keep the editor usable even if a browser does not support a command.
    }
"""
new_execute = """  const executeCommand = (command: string, arg: string | undefined = undefined) => {
    if (!editorRef.current) return;
    const isHistoryCommand = command === 'undo' || command === 'redo';
    if (selectedFigure && !isHistoryCommand) return;
    if (isHistoryCommand && onHistoryCommand?.(command as RichTextHistoryCommand)) {
      updateActiveFormatting();
      return;
    }
    const restored = restoreSavedSelection();
    if (!isHistoryCommand && !restored) return;

    try {
      document.execCommand(command, false, arg);
    } catch {
      // Keep the editor usable even if a browser does not support a command.
    }
"""
editor = replace_once(editor, old_execute, new_execute, 'history command bridge')

old_keydown = """  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // 1. Tab / Shift+Tab for Indenting & Outdenting in lists (Sub-bullets & Sub-numbers)
"""
new_keydown = """  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const modifier = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (modifier && !e.altKey && (key === 'z' || key === 'y')) {
      e.preventDefault();
      executeCommand(key === 'y' || (key === 'z' && e.shiftKey) ? 'redo' : 'undo');
      return;
    }

    // 1. Tab / Shift+Tab for Indenting & Outdenting in lists (Sub-bullets & Sub-numbers)
"""
editor = replace_once(editor, old_keydown, new_keydown, 'keyboard history bridge')

# Insert one atomic image reset helper immediately before deleteSelectedFigure.
old_delete_anchor = """  const deleteSelectedFigure = () => {
    if (!selectedFigure) return;
"""
new_delete_anchor = """  const resetSelectedFigure = () => {
    if (!selectedFigure) return;
    const width = 75;
    const wrap: WordWrapMode = 'top-bottom';
    const align: 'center' = 'center';

    selectedFigure.setAttribute('data-rotation', '0');
    selectedFigure.setAttribute('data-width', `${width}%`);
    selectedFigure.setAttribute('data-wrap', wrap);
    selectedFigure.style.transform = '';
    selectedFigure.style.maxWidth = `${width}%`;
    selectedFigure.style.width = `${width}%`;
    selectedFigure.style.float = 'none';
    selectedFigure.style.clear = 'both';
    selectedFigure.style.marginLeft = 'auto';
    selectedFigure.style.marginRight = 'auto';
    selectedFigure.style.position = 'relative';
    selectedFigure.style.opacity = '1';
    selectedFigure.style.zIndex = '1';
    selectedFigure.style.mixBlendMode = 'normal';
    selectedFigure.style.boxShadow = 'none';
    selectedFigure.style.top = 'auto';
    selectedFigure.style.left = 'auto';
    selectedFigure.style.verticalAlign = '';
    applyFigureAlignment(selectedFigure, align, wrap);

    setCurrentRotation(0);
    setCurrentWrapMode(wrap);
    setShowWrapTextMenu(false);
    setActiveFormatting(current => ({
      ...current,
      context: 'image',
      inTable: false,
      imageWidth: width,
      imageAlign: align,
      imageWrap: wrap,
    }));
    handleInput();
    updateFigureRect();
  };

  const deleteSelectedFigure = () => {
    if (!selectedFigure) return;
"""
editor = replace_once(editor, old_delete_anchor, new_delete_anchor, 'atomic image reset helper')

editor = replace_once(
    editor,
    """    resetImage: () => {
      if (!selectedFigure) return;
      selectedFigure.style.transform = '';
      selectedFigure.setAttribute('data-rotation', '0');
      applyFigurePercentWidth(75);
      applyWordWrapMode('top-bottom', 'center');
    },
""",
    """    resetImage: resetSelectedFigure,
""",
    'imperative image reset bridge',
)

editor = replace_once(
    editor,
    """          onPointerUp={handleEditorPointerUp}
          onInput={handleInput}
          onBlur={handleInput}
          onKeyDown={handleEditorKeyDown}
""",
    """          onPointerUp={handleEditorPointerUp}
          onInput={(event) => {
            const inputType = (event.nativeEvent as InputEvent).inputType || '';
            const historyMode: RichTextChangeMeta['historyMode'] = [
              'insertText', 'insertCompositionText', 'deleteContentBackward', 'deleteContentForward'
            ].includes(inputType) ? 'coalesce' : 'discrete';
            handleInput(historyMode);
          }}
          onBlur={() => handleInput('discrete')}
          onKeyDown={handleEditorKeyDown}
""",
    'contentEditable input history metadata',
)

editor_path.write_text(editor)

# -----------------------------------------------------------------------------
# SopLiveTemplate: full-section bounded history for a section that can migrate
# across physical RichTextEditor page fragments.
# -----------------------------------------------------------------------------
template_path = Path('src/components/SopLiveTemplate.tsx')
template = template_path.read_text()

history_refs_anchor = """  const editorRefs = useRef<{ [key: string]: RichTextEditorHandle | null }>({});
  const activeEditorRef = useRef<RichTextEditorHandle | null>(null);
  const activeEditorKeyRef = useRef<string | null>(null);

  const [activeFormatting, setActiveFormatting] = useState<RichTextFormattingState>({
"""
history_refs_new = """  const editorRefs = useRef<{ [key: string]: RichTextEditorHandle | null }>({});
  const activeEditorRef = useRef<RichTextEditorHandle | null>(null);
  const activeEditorKeyRef = useRef<string | null>(null);
  type LiveSectionId = 'pengertian' | 'tujuan' | 'kebijakan' | 'prosedur' | 'alur' | 'unitTerkait';
  type HistoryMode = 'coalesce' | 'discrete';
  type SectionHistoryBucket = {
    undo: string[];
    redo: string[];
    lastMode: HistoryMode | null;
    lastAt: number;
  };
  const makeHistoryBucket = (): SectionHistoryBucket => ({ undo: [], redo: [], lastMode: null, lastAt: 0 });
  const sectionHistoryRef = useRef<Record<LiveSectionId, SectionHistoryBucket>>({
    pengertian: makeHistoryBucket(), tujuan: makeHistoryBucket(), kebijakan: makeHistoryBucket(),
    prosedur: makeHistoryBucket(), alur: makeHistoryBucket(), unitTerkait: makeHistoryBucket(),
  });
  const latestSectionValuesRef = useRef<Record<LiveSectionId, string>>({
    pengertian, tujuan, kebijakan, prosedur, alur, unitTerkait,
  });
  const pendingSectionValuesRef = useRef<Partial<Record<LiveSectionId, string>>>({});

  useEffect(() => {
    const incoming: Record<LiveSectionId, string> = { pengertian, tujuan, kebijakan, prosedur, alur, unitTerkait };
    (Object.keys(incoming) as LiveSectionId[]).forEach((section) => {
      const hasPending = Object.prototype.hasOwnProperty.call(pendingSectionValuesRef.current, section);
      if (!hasPending) {
        latestSectionValuesRef.current[section] = incoming[section];
        return;
      }
      if (pendingSectionValuesRef.current[section] === incoming[section]) {
        latestSectionValuesRef.current[section] = incoming[section];
        delete pendingSectionValuesRef.current[section];
      }
    });
  }, [pengertian, tujuan, kebijakan, prosedur, alur, unitTerkait]);

  const [activeFormatting, setActiveFormatting] = useState<RichTextFormattingState>({
"""
template = replace_once(template, history_refs_anchor, history_refs_new, 'template section history refs')

history_helpers_anchor = """  const [debouncedBlocks, setDebouncedBlocks] = useState<OfficialBlock[]>(officialBlocks);

  useEffect(() => {
"""
history_helpers_new = """  const [debouncedBlocks, setDebouncedBlocks] = useState<OfficialBlock[]>(officialBlocks);

  const pushBounded = (stack: string[], value: string) => {
    stack.push(value);
    if (stack.length > 100) stack.shift();
  };

  const recordSectionHistory = (section: LiveSectionId, nextValue: string, mode: HistoryMode = 'discrete') => {
    const previousValue = latestSectionValuesRef.current[section];
    if (previousValue === nextValue) return;
    const bucket = sectionHistoryRef.current[section];
    const now = Date.now();
    const coalesce = mode === 'coalesce' && bucket.lastMode === 'coalesce' && now - bucket.lastAt < 1200;
    if (!coalesce) pushBounded(bucket.undo, previousValue);
    bucket.redo = [];
    bucket.lastMode = mode;
    bucket.lastAt = now;
    latestSectionValuesRef.current[section] = nextValue;
    pendingSectionValuesRef.current[section] = nextValue;
  };

  const applySectionValue = (section: LiveSectionId, value: string) => {
    switch (section) {
      case 'pengertian': onPengertianChange(value); break;
      case 'tujuan': onTujuanChange(value); break;
      case 'kebijakan': onKebijakanChange(value); break;
      case 'prosedur': onProsedurChange(value); break;
      case 'alur': onAlurChange(value); break;
      case 'unitTerkait': onUnitTerkaitChange(value); break;
    }
  };

  const handleSectionHistory = (section: LiveSectionId, command: 'undo' | 'redo') => {
    const bucket = sectionHistoryRef.current[section];
    const source = command === 'undo' ? bucket.undo : bucket.redo;
    // Shared A4 always owns history. Swallow an empty history command instead
    // of falling through to a stale physical-fragment native stack.
    if (source.length === 0) return true;

    const currentValue = latestSectionValuesRef.current[section];
    const targetValue = source.pop() as string;
    const opposite = command === 'undo' ? bucket.redo : bucket.undo;
    pushBounded(opposite, currentValue);
    bucket.lastMode = null;
    bucket.lastAt = 0;
    latestSectionValuesRef.current[section] = targetValue;
    pendingSectionValuesRef.current[section] = targetValue;

    const nextSections = { ...latestSectionValuesRef.current };
    // History changes must be visible immediately; do not wait for the normal
    // 250 ms pagination debounce before remapping the physical page fragments.
    setDebouncedBlocks(buildOfficialBlocks(nextSections));
    applySectionValue(section, targetValue);
    return true;
  };

  useEffect(() => {
"""
template = replace_once(template, history_helpers_anchor, history_helpers_new, 'template section history helpers')

old_onchange = """                                onChange={(newPartHtml) => {
                                  // If this section is split across multiple pages, reassemble it cleanly
                                  if (totalPages > 1 && calculatedPages.length > 1) {
                                    const allPartsForSection: string[] = [];
                                    calculatedPages.forEach((p, pIdx) => {
                                      if (pIdx === pageIndex) {
                                        allPartsForSection.push(newPartHtml);
                                      } else {
                                        const otherBlocks = p.filter((b) => b.section === group.section);
                                        if (otherBlocks.length > 0) {
                                          allPartsForSection.push(otherBlocks.map((b) => b.html).join(''));
                                        }
                                      }
                                    });
                                    cfg.onChange(allPartsForSection.join(''));
                                  } else {
                                    cfg.onChange(newPartHtml);
                                  }
                                }}
"""
new_onchange = """                                onChange={(newPartHtml, changeMeta) => {
                                  // If this section is split across multiple pages, reassemble it cleanly
                                  // before recording history. History belongs to the logical section,
                                  // never to one transient physical page fragment.
                                  let nextSectionHtml = newPartHtml;
                                  if (totalPages > 1 && calculatedPages.length > 1) {
                                    const allPartsForSection: string[] = [];
                                    calculatedPages.forEach((p, pIdx) => {
                                      if (pIdx === pageIndex) {
                                        allPartsForSection.push(newPartHtml);
                                      } else {
                                        const otherBlocks = p.filter((b) => b.section === group.section);
                                        if (otherBlocks.length > 0) {
                                          allPartsForSection.push(otherBlocks.map((b) => b.html).join(''));
                                        }
                                      }
                                    });
                                    nextSectionHtml = allPartsForSection.join('');
                                  }
                                  recordSectionHistory(cfg.id, nextSectionHtml, changeMeta?.historyMode || 'discrete');
                                  cfg.onChange(nextSectionHtml);
                                }}
"""
template = replace_once(template, old_onchange, new_onchange, 'template logical section onChange history')

template = replace_once(
    template,
    """                                paginationEpoch={debouncedBlocks}
                                onFocus={() => {
""",
    """                                paginationEpoch={debouncedBlocks}
                                onHistoryCommand={(command) => handleSectionHistory(cfg.id, command)}
                                onFocus={() => {
""",
    'template history callback prop',
)

template_path.write_text(template)

# -----------------------------------------------------------------------------
# Regression contract: remove stale timeout expectation, load template source,
# and assert the actual pagination-epoch/history ownership contracts.
# -----------------------------------------------------------------------------
test_path = Path('tests/live-editor-toolbar-regression.test.ts')
test = test_path.read_text()

test = replace_once(
    test,
    "const editor = readFileSync('src/components/RichTextEditor.tsx', 'utf8');\n",
    "const editor = readFileSync('src/components/RichTextEditor.tsx', 'utf8');\nconst template = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');\n",
    'test template source',
)

old_epoch_test = """test('active Live SPO fragment ignores stale paginated prop echoes during local mutation', () => {
  const syncEffect = between(editor, '// Sync value from prop', '// Recalculate overlay');
  assert.match(syncEffect, /lastEmittedValueRef\.current/);
  assert.match(syncEffect, /Date\.now\(\) < localMutationUntilRef\.current/);
  assert.match(syncEffect, /editorRef\.current\.innerHTML === \(value \|\| ''\)/);
  assert.match(syncEffect, /lastEmittedValueRef\.current = value \|\| ''/);
  assert.match(editor, /localMutationUntilRef\.current = Date\.now\(\) \+ 1500/);
});
"""
new_epoch_test = """test('active Live SPO fragment ignores only same-epoch stale echoes and accepts canonical repagination', () => {
  const syncEffect = between(editor, '// Sync value from prop', '// Recalculate overlay');
  assert.match(editor, /paginationEpoch\?: object/);
  assert.match(editor, /lastPaginationEpochRef/);
  assert.match(syncEffect, /const epochChanged = paginationEpoch !== lastPaginationEpochRef\.current/);
  assert.match(syncEffect, /!epochChanged/);
  assert.match(syncEffect, /incoming === previousIncoming/);
  assert.match(syncEffect, /lastPaginationEpochRef\.current = paginationEpoch/);
  assert.doesNotMatch(editor, /localMutationUntilRef/);
});
"""
test = replace_once(test, old_epoch_test, new_epoch_test, 'test epoch contract')

# Add one focused regression contract before the image synchronous publication test.
anchor = """test('image selection publishes shared toolbar context synchronously without parent update inside state updater', () => {
"""
addition = """test('shared multi-page history is logical-section scoped and table clicks reclaim toolbar ownership', () => {
  assert.match(editor, /onHistoryCommand\?: \(command: RichTextHistoryCommand\) => boolean/);
  assert.match(editor, /isHistoryCommand && onHistoryCommand\?\.\(command as RichTextHistoryCommand\)/);
  assert.match(editor, /onFocus\?\.\(\);[\s\S]*const activeTable = activeCell\.closest\('table'\)/);
  assert.match(editor, /onFormattingChange\?\.\(next\)/);
  assert.match(template, /const handleSectionHistory = \(section: LiveSectionId, command: 'undo' \| 'redo'\)/);
  assert.match(template, /setDebouncedBlocks\(buildOfficialBlocks\(nextSections\)\)/);
  assert.match(template, /onHistoryCommand=\{\(command\) => handleSectionHistory\(cfg\.id, command\)\}/);
});

test('image selection publishes shared toolbar context synchronously without parent update inside state updater', () => {
"""
test = replace_once(test, anchor, addition, 'test logical history ownership contract')

test_path.write_text(test)

print('Applied proven toolbar candidate to RichTextEditor, SopLiveTemplate, and regression contract.')
