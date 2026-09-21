from pathlib import Path

p = Path('src/components/RichTextEditor.tsx')
s = p.read_text()
old = '''    figure.classList.add('figure-selected');
    // Image selection originates from a native capture listener. Publish the
    // object context synchronously after onFocus() claims toolbar ownership;
    // relying only on the later effect can race a parent toolbar rerender and
    // leave the shared Image Tool disabled even though the figure is selected.
    setActiveFormatting(current => {
      const next: RichTextFormattingState = {
        ...current,
        context: 'image',
        inTable: false,
        imageWidth: Math.min(Math.max(parsedPercent, 10), 100),
        imageAlign: (figure.getAttribute('data-align') as 'left' | 'center' | 'right') || 'center',
        imageWrap: wrapMode,
      };
      onFormattingChange?.(next);
      return next;
    });
  }, [onFocus, onFormattingChange]);
'''
new = '''    figure.classList.add('figure-selected');
    // Image selection originates from a native capture listener. onFocus()
    // above claims the exact fragment synchronously through the parent's refs.
    // Publish the same image state to the shared toolbar outside the React
    // state updater so we never update SopLiveTemplate while RichTextEditor is
    // rendering its own state transition.
    const next: RichTextFormattingState = {
      ...activeFormatting,
      context: 'image',
      inTable: false,
      imageWidth: Math.min(Math.max(parsedPercent, 10), 100),
      imageAlign: (figure.getAttribute('data-align') as 'left' | 'center' | 'right') || 'center',
      imageWrap: wrapMode,
    };
    setActiveFormatting(next);
    onFormattingChange?.(next);
  }, [activeFormatting, onFocus, onFormattingChange]);
'''
if s.count(old) != 1:
    raise SystemExit(f'image context candidate block: expected 1 match, found {s.count(old)}')
s = s.replace(old, new, 1)
p.write_text(s)

t = Path('tests/live-editor-toolbar-regression.test.ts')
tests = t.read_text()
old_test = r'''test('image selection publishes shared toolbar context synchronously after claiming ownership', () => {
  const selectFigure = editor.slice(editor.indexOf('const selectFigureElement'), editor.indexOf('const clearFigureSelection'));
  assert.match(selectFigure, /onFocus\?\.\(\)/);
  assert.match(selectFigure, /onFormattingChange\?\.\(next\)/);
  assert.match(selectFigure, /context:\s*'image'/);
});
'''
new_test = r'''test('image selection publishes shared toolbar context synchronously without parent update inside state updater', () => {
  const selectFigure = editor.slice(editor.indexOf('const selectFigureElement'), editor.indexOf('const clearFigureSelection'));
  assert.match(selectFigure, /onFocus\?\.\(\)/);
  assert.match(selectFigure, /const next:\s*RichTextFormattingState/);
  assert.match(selectFigure, /setActiveFormatting\(next\)/);
  assert.match(selectFigure, /onFormattingChange\?\.\(next\)/);
  assert.match(selectFigure, /context:\s*'image'/);
  assert.doesNotMatch(selectFigure, /setActiveFormatting\(current\s*=>[\s\S]*onFormattingChange/);
});
'''
if tests.count(old_test) != 1:
    raise SystemExit(f'image context regression test: expected 1 match, found {tests.count(old_test)}')
tests = tests.replace(old_test, new_test, 1)
t.write_text(tests)
