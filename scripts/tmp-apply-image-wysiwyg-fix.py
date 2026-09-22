from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    assert count == 1, f"{label}: expected exactly one match, found {count}"
    return text.replace(old, new, 1)

pagination_path = Path('src/utils/canonicalA4Pagination.ts')
test_path = Path('tests/live-sop-content-integrity.test.ts')

pagination = pagination_path.read_text()
old_atomic = """    const el = meaningful[0] as HTMLElement;\n    const tag = el.tagName.toLowerCase();\n    return tag === 'img' || tag === 'figure' || (tag === 'p' && el.children.length === 1 && el.firstElementChild?.tagName.toLowerCase() === 'img');\n"""
new_atomic = """    const el = meaningful[0] as HTMLElement;\n    const tag = el.tagName.toLowerCase();\n    const isEditorImageWrapper = el.classList.contains('figure-wrapper');\n    return (\n      tag === 'img' ||\n      tag === 'figure' ||\n      isEditorImageWrapper ||\n      (tag === 'p' && el.children.length === 1 && el.firstElementChild?.tagName.toLowerCase() === 'img')\n    );\n"""
pagination = replace_once(pagination, old_atomic, new_atomic, 'atomic image wrapper classifier')

old_process = """      const el = node as HTMLElement;\n      const tag = el.tagName.toLowerCase();\n\n      if (/^(ol|ul)$/i.test(tag)) {\n"""
new_process = """      const el = node as HTMLElement;\n      const tag = el.tagName.toLowerCase();\n\n      // LiveSPO image sizing/alignment/wrap metadata lives on .figure-wrapper,\n      // while the nested <img> intentionally stays width:100%. Treat the\n      // wrapper as one authored media unit so Preview/PDF cannot lose the\n      // selected 25/50/75/100% width when canonical flow is decomposed.\n      if (el.classList.contains('figure-wrapper')) {\n        pushInlineBuffer();\n        blocks.push(el.outerHTML);\n        return;\n      }\n\n      if (/^(ol|ul)$/i.test(tag)) {\n"""
pagination = replace_once(pagination, old_process, new_process, 'preserve image wrapper flow unit')
pagination_path.write_text(pagination)

test_src = test_path.read_text()
test_src = replace_once(
    test_src,
    "import { readFileSync } from 'node:fs';\n",
    "import { readFileSync } from 'node:fs';\nimport { DOMParser as LinkedomDOMParser } from 'linkedom';\n",
    'linkedom import',
)
test_src = replace_once(
    test_src,
    "  buildOfficialBlocks,\n",
    "  buildOfficialBlocks,\n  extractProcedureBlocks,\n  isAtomicMediaHtml,\n",
    'pagination function imports',
)

regression = r'''

test('canonical image flow preserves Live editor wrapper width/alignment as atomic media', () => {
  const priorParser = (globalThis as any).DOMParser;
  const priorNode = (globalThis as any).Node;

  class BrowserLikeDOMParser {
    parseFromString(source: string) {
      return new LinkedomDOMParser().parseFromString(
        `<!doctype html><html><body>${source}</body></html>`,
        'text/html'
      );
    }
  }

  (globalThis as any).DOMParser = BrowserLikeDOMParser;
  (globalThis as any).Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };

  try {
    for (const width of [25, 50, 75, 100]) {
      const authored = [
        `<div class="my-3 figure-wrapper figure-wrap-top-bottom" data-wrap="top-bottom" data-width="${width}%" data-align="left"`,
        ` style="display:block;max-width:${width}%;width:${width}%;margin:12px auto 12px 0">`,
        '<img src="data:image/png;base64,iVBORw0KGgo=" style="width:100%;height:auto;display:inline-block">',
        '</div><p><br></p>',
      ].join('');

      const blocks = extractProcedureBlocks(authored);
      assert.equal(blocks.length, 1, `${width}% image must remain one flow unit`);
      assert.match(blocks[0], /figure-wrapper/);
      assert.match(blocks[0], new RegExp(`data-width="${width}%"`));
      assert.match(blocks[0], /data-align="left"/);
      assert.match(blocks[0], new RegExp(`max-width:${width}%`));
      assert.equal(isAtomicMediaHtml(blocks[0]), true);
    }
  } finally {
    (globalThis as any).DOMParser = priorParser;
    (globalThis as any).Node = priorNode;
  }
});
'''
assert "canonical image flow preserves Live editor wrapper width/alignment as atomic media" not in test_src
test_src += regression
test_path.write_text(test_src)
