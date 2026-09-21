from pathlib import Path

p = Path('src/components/RichTextEditor.tsx')
s = p.read_text()
old = '''    figure.classList.add('figure-selected');
    setActiveFormatting(current => ({
      ...current, context: 'image', inTable: false,
      imageWidth: Math.min(Math.max(parsedPercent, 10), 100),
      imageAlign: (figure.getAttribute('data-align') as 'left' | 'center' | 'right') || 'center',
      imageWrap: wrapMode,
    }));
  }, [onFocus]);
'''
new = '''    figure.classList.add('figure-selected');
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
if s.count(old) != 1:
    raise SystemExit(f'image context block: expected 1 match, found {s.count(old)}')
s = s.replace(old, new, 1)
p.write_text(s)

t = Path('tests/live-editor-toolbar-regression.test.ts')
tests = t.read_text()
marker = 'image selection publishes shared toolbar context synchronously after claiming ownership'
if marker in tests:
    raise SystemExit('image bridge regression already present')
tests += r'''

test('image selection publishes shared toolbar context synchronously after claiming ownership', () => {
  const selectFigure = editor.slice(editor.indexOf('const selectFigureElement'), editor.indexOf('const clearFigureSelection'));
  assert.match(selectFigure, /onFocus\?\.\(\)/);
  assert.match(selectFigure, /onFormattingChange\?\.\(next\)/);
  assert.match(selectFigure, /context:\s*'image'/);
});
'''
t.write_text(tests)
