from pathlib import Path

p = Path('src/components/RichTextEditor.tsx')
s = p.read_text()

def once(old: str, new: str, label: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    s = s.replace(old, new, 1)

once(
'''  const isUpdatingFromPropRef = useRef(false);
  const lastEmittedValueRef = useRef<string | null>(null);
''',
'''  const isUpdatingFromPropRef = useRef(false);
  const lastEmittedValueRef = useRef<string | null>(null);
  // Track the last fragment value actually received from the paginator. A local
  // edit updates parent section state immediately, while physical-page fragments
  // catch up on a debounce. During that gap the child can receive the exact same
  // old fragment again; that is a stale echo, not an external document change.
  const lastReceivedValueRef = useRef(value || '');
''',
'last received ref',
)

old_sync = '''  // Sync value from prop to contentEditable ONLY when prop genuinely changes from outside
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
'''
new_sync = '''  // Sync a genuinely new canonical fragment, but ignore the parent's stale
  // pre-pagination echo after a local contentEditable mutation. Unlike a timed
  // guard, this still accepts the moment pagination produces a different
  // physical fragment, so content cannot remain duplicated across pages.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const incoming = value || '';
    const previousIncoming = lastReceivedValueRef.current;
    const lastEmitted = lastEmittedValueRef.current;

    // Parent section state changed, but calculatedPages has not caught up yet:
    // the prop is byte-for-byte the same fragment we already received while
    // the editor DOM contains our newer local transaction. Preserve it.
    if (
      incoming === previousIncoming &&
      lastEmitted !== null &&
      incoming !== lastEmitted &&
      editor.innerHTML !== incoming
    ) {
      return;
    }

    lastReceivedValueRef.current = incoming;

    // The paginator has acknowledged exactly what this editor emitted. Do not
    // rewrite innerHTML: keeping the same DOM preserves the browser undo stack.
    if (incoming === lastEmitted) return;

    if (editor.innerHTML === incoming) {
      lastEmittedValueRef.current = incoming;
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
'''
once(old_sync, new_sync, 'smart prop sync')

once(
'''          figure = wrapper;
          handleInput();
''',
'''          figure = wrapper;
          // Rehydrating a paginator-produced bare <img> is local UI structure,
          // not a document edit. Serializing here would rerender the parent
          // before object selection finishes. The next real image command will
          // serialize this wrapper through handleInput().
''',
'bare image hydration',
)

once(
'''          if (!figure.getAttribute('data-align')) figure.setAttribute('data-align', 'center');
          handleInput();
''',
'''          if (!figure.getAttribute('data-align')) figure.setAttribute('data-align', 'center');
          // Selection-time normalization stays local until a real mutation.
''',
'figure selection normalization',
)

p.write_text(s)
