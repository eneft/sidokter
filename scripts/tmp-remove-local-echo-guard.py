from pathlib import Path

p = Path('src/components/RichTextEditor.tsx')
s = p.read_text()

ref_block = '''  // Parent pagination is intentionally debounced. After a local contentEditable
  // mutation, the active fragment can briefly receive its previous paginated
  // value back as a prop. Protect the live DOM/history during that echo window.
  const localMutationUntilRef = useRef(0);
'''
if s.count(ref_block) != 1:
    raise SystemExit(f'guard ref block: expected 1, found {s.count(ref_block)}')
s = s.replace(ref_block, '', 1)

start = s.index('  // Sync value from prop to contentEditable ONLY when prop genuinely changes from outside.')
end = s.index('  // Recalculate overlay on scroll or window resize', start)
baseline_sync = '''  // Sync value from prop to contentEditable ONLY when prop genuinely changes from outside
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
s = s[:start] + baseline_sync + s[end:]

mutation_block = '''    // Keep the native contentEditable transaction alive while the parent
    // catches up and recomputes physical page fragments. 1500ms comfortably
    // covers the 250ms pagination debounce plus a heavy multi-page render.
    localMutationUntilRef.current = Date.now() + 1500;
'''
if s.count(mutation_block) != 1:
    raise SystemExit(f'mutation guard block: expected 1, found {s.count(mutation_block)}')
s = s.replace(mutation_block, '', 1)
p.write_text(s)
