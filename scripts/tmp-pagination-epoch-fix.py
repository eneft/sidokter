from pathlib import Path

editor_path = Path('src/components/RichTextEditor.tsx')
template_path = Path('src/components/SopLiveTemplate.tsx')
s = editor_path.read_text()
t = template_path.read_text()

def once(text: str, old: str, new: str, label: str):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)

s = once(s,
'''  onFocus?: () => void;
  onFormattingChange?: (formatting: RichTextFormattingState) => void;
}
''',
'''  onFocus?: () => void;
  onFormattingChange?: (formatting: RichTextFormattingState) => void;
  // Optional canonical pagination generation supplied by SopLiveTemplate.
  // A new object identity means physical-page fragments have been recomputed.
  paginationEpoch?: object;
}
''',
'props pagination epoch')

s = once(s,
'''  onFocus,
  onFormattingChange,
}, forwardedRef) {
''',
'''  onFocus,
  onFormattingChange,
  paginationEpoch,
}, forwardedRef) {
''',
'destructure pagination epoch')

s = once(s,
'''  const lastReceivedValueRef = useRef(value || '');
''',
'''  const lastReceivedValueRef = useRef(value || '');
  const lastPaginationEpochRef = useRef<object | undefined>(paginationEpoch);
''',
'pagination epoch ref')

old_sync = '''  // Sync a genuinely new canonical fragment, but ignore the parent's stale
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
new_sync = '''  // Sync a genuinely new canonical fragment, but ignore the parent's stale
  // pre-pagination echo after a local contentEditable mutation. The paginator
  // epoch is authoritative: once it changes, even a byte-identical fragment is
  // a fresh canonical result and must be allowed to evict stale local DOM.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const incoming = value || '';
    const previousIncoming = lastReceivedValueRef.current;
    const lastEmitted = lastEmittedValueRef.current;
    const epochChanged = paginationEpoch !== lastPaginationEpochRef.current;

    // Parent section state changed, but debouncedBlocks/calculatedPages has not
    // caught up yet. Ignore only within the SAME pagination epoch.
    if (
      !epochChanged &&
      incoming === previousIncoming &&
      lastEmitted !== null &&
      incoming !== lastEmitted &&
      editor.innerHTML !== incoming
    ) {
      return;
    }

    lastReceivedValueRef.current = incoming;
    lastPaginationEpochRef.current = paginationEpoch;

    // The canonical paginator acknowledged exactly what this editor emitted.
    // Keep the existing DOM so the browser's native undo transaction survives.
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
  }, [value, selectedFigure, paginationEpoch]);
'''
s = once(s, old_sync, new_sync, 'epoch-aware prop sync')

# Supply the debounced block array itself as the generation token. Its identity
# changes exactly when canonical pagination input advances after the 250ms debounce.
t = once(t,
'''                                variant="seamless"
                                onFocus={() => {
''',
'''                                variant="seamless"
                                paginationEpoch={debouncedBlocks}
                                onFocus={() => {
''',
'pass pagination epoch')

editor_path.write_text(s)
template_path.write_text(t)
