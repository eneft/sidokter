import fs from 'node:fs';
import { parseHTML } from 'linkedom';

const { document, DOMParser, Node } = parseHTML('<!DOCTYPE html><html><body></body></html>');

const source = fs.readFileSync('crossmatch_prosedur.html', 'utf-8');

function extractProcedureBlocks(source: string): string[] {
  if (!source || !source.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(source, 'text/html');
  const blocks: string[] = [];
  let inlineBuffer = '';

  const pushInlineBuffer = () => {
    const trimmed = inlineBuffer.trim();
    if (trimmed) {
      if (/^<(p|div|h[1-6]|table|ol|ul|blockquote)/i.test(trimmed)) {
        blocks.push(trimmed);
      } else {
        blocks.push(`<p>${trimmed}</p>`);
      }
    }
    inlineBuffer = '';
  };

  const hasBlockDescendant = (el: any) => {
    return Boolean(el.querySelector('p, ol, ul, table, blockquote, pre, h1, h2, h3, h4, h5, h6, section, article, div, figure, hr'));
  };

  const processNode = (node: any) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent || '').length > 0) inlineBuffer += node.textContent || '';
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    const tag = el.tagName.toLowerCase();

    if (/^(ol|ul)$/i.test(tag)) {
      pushInlineBuffer();
      blocks.push(el.outerHTML);
      return;
    }

    if (/^(table|img|figure|blockquote|pre|h1|h2|h3|h4|h5|h6|hr)$/i.test(tag)) {
      pushInlineBuffer();
      blocks.push(el.outerHTML);
      return;
    }

    if (tag === 'p') {
      if (hasBlockDescendant(el)) {
        pushInlineBuffer();
        Array.from(el.childNodes).forEach(processNode);
        pushInlineBuffer();
        return;
      }

      pushInlineBuffer();
      const innerHtml = el.innerHTML;
      if (/<br\s*\/?>\s*<br\s*\/?>/i.test(innerHtml)) {
        const parts = innerHtml.split(/<br\s*\/?>\s*<br\s*\/?>/i);
        parts.forEach((part) => {
          if (part.trim()) {
            blocks.push(`<p>${part.trim()}</p>`);
          }
        });
        return;
      }

      blocks.push(el.outerHTML);
      return;
    }

    if (tag === 'div') {
      pushInlineBuffer();
      Array.from(el.childNodes).forEach(processNode);
      pushInlineBuffer();
      return;
    }

    inlineBuffer += el.outerHTML;
  };

  Array.from(doc.body.childNodes).forEach(processNode);
  pushInlineBuffer();

  return blocks;
}

const blocks = extractProcedureBlocks(source);
console.log('Extracted blocks count:', blocks.length);
blocks.forEach((b, i) => {
  console.log(`Block ${i} [tag: ${b.slice(0, 10)}]: length=${b.length}`);
  console.log(b.slice(0, 150));
  console.log('---');
});
