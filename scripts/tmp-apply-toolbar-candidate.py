from pathlib import Path

p = Path('src/components/RichTextEditor.tsx')
s = p.read_text()

def once(old: str, new: str, label: str):
    global s
    n = s.count(old)
    if n != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {n}')
    s = s.replace(old, new, 1)

once(
    "  const lastEmittedValueRef = useRef<string | null>(null);\n",
    "  const lastEmittedValueRef = useRef<string | null>(null);\n  // Parent pagination is intentionally debounced. After a local contentEditable\n  // mutation, the active fragment can briefly receive its previous paginated\n  // value back as a prop. Protect the live DOM/history during that echo window.\n  const localMutationUntilRef = useRef(0);\n",
    'local mutation guard ref',
)

old_sync = """  // Sync value from prop to contentEditable ONLY when prop genuinely changes from outside
  useEffect(() => {
    if (!editorRef.current) return;
    if (value !== lastEmittedValueRef.current) {
      if (editorRef.current.innerHTML === (value || '')) {
        lastEmittedValueRef.current = value || '';
        return;
      }
      lastEmittedValueRef.current = value || '';
      isUpdatingFromPropRef.current = true;
      editorRef.current.innerHTML = value || '';
      savedRangeRef.current = null;
      isUpdatingFromPropRef.current = false;
      if (selectedFigure && !editorRef.current.contains(selectedFigure)) {
        setSelectedFigure(null);
        setFigureRect(null);
      }
    }
  }, [value, selectedFigure]);
"""
new_sync = """  // Sync value from prop to contentEditable ONLY when prop genuinely changes from outside.
  // SopLiveTemplate paginates on a 250ms debounce, so a local edit can be
  // followed by one or more stale fragment props. Replacing innerHTML during
  // that interval destroys the browser undo stack and detaches table/image
  // selections. Keep the active local DOM authoritative for a short echo window.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const incoming = value || '';
    if (incoming === lastEmittedValueRef.current) return;
    if (editor.innerHTML === incoming) {
      lastEmittedValueRef.current = incoming;
      return;
    }

    const selection = window.getSelection();
    const selectionInside = Boolean(
      selection?.rangeCount && selection.anchorNode && editor.contains(selection.anchorNode),
    );
    const ownsInteraction =
      document.activeElement === editor ||
      Boolean(document.activeElement && editor.contains(document.activeElement)) ||
      selectionInside ||
      Boolean(selectedFigure && editor.contains(selectedFigure));

    if (Date.now() < localMutationUntilRef.current && ownsInteraction) {
      return;
    }

    lastEmittedValueRef.current = incoming;
    isUpdatingFromPropRef.current = true;
    editor.innerHTML = incoming;
    savedRangeRef.current = null;
    isUpdatingFromPropRef.current = false;
    if (selectedFigure && !editor.contains(selectedFigure)) {
      setSelectedFigure(null);
      setFigureRect(null);
    }
  }, [value, selectedFigure]);
"""
once(old_sync, new_sync, 'prop sync block')

once(
    "    lastEmittedValueRef.current = cleanHtml;\n    onChange(cleanHtml);\n",
    "    // Keep the native contentEditable transaction alive while the parent\n    // catches up and recomputes physical page fragments. 1500ms comfortably\n    // covers the 250ms pagination debounce plus a heavy multi-page render.\n    localMutationUntilRef.current = Date.now() + 1500;\n    lastEmittedValueRef.current = cleanHtml;\n    onChange(cleanHtml);\n",
    'handleInput mutation guard',
)

p.write_text(s)

t = Path('tests/live-editor-toolbar-regression.test.ts')
tests = t.read_text()
marker = 'active Live SPO fragment ignores stale paginated prop echoes during local mutation'
if marker in tests:
    raise SystemExit('regression test already present unexpectedly')
tests += """

test('active Live SPO fragment ignores stale paginated prop echoes during local mutation', () => {
  const sync = editor.slice(editor.indexOf('// Sync value from prop'), editor.indexOf('// Recalculate overlay'));
  const input = editor.slice(editor.indexOf('const handleInput'), editor.indexOf('// Helper to reliably select'));
  assert.match(sync, /Date\.now\(\) < localMutationUntilRef\.current/);
  assert.match(sync, /ownsInteraction/);
  assert.match(sync, /return;/);
  assert.match(input, /localMutationUntilRef\.current = Date\.now\(\) \+ 1500/);
});
"""
t.write_text(tests)
