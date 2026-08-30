import React from 'react';
import DOMPurify from 'dompurify';

interface RichTextRendererProps {
  content: string | undefined | null;
  fallback?: string;
  className?: string;
}

// Utility to check if string contains HTML tags
export const hasHtmlTags = (str: string): boolean => {
  return /<[a-z][\s\S]*>/i.test(str);
};

// Utility to thoroughly clean HTML from Word artifacts, nested table borders, paragraph boxes, without destroying list numbering
export const cleanSopRichContent = (htmlOrText: string): string => {
  if (!htmlOrText) return '';
  let cleaned = htmlOrText;

  if (!hasHtmlTags(cleaned)) {
    return cleaned;
  }

  // DOMParser based deep sanitation
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(cleaned, 'text/html');

      // A. Strip border, outline, box-shadow inline styles and MS Word classes
      const allElements = doc.body.querySelectorAll('*');
      allElements.forEach((el) => {
        const htmlEl = el as HTMLElement;

        // Remove frame, border, rules HTML attributes
        htmlEl.removeAttribute('border');
        htmlEl.removeAttribute('frame');
        htmlEl.removeAttribute('rules');
        htmlEl.removeAttribute('cellspacing');
        htmlEl.removeAttribute('cellpadding');

        // Clean style attribute while preserving list-style, alignment, text styling, colors
        const currentStyle = htmlEl.getAttribute('style');
        if (currentStyle) {
          const cleanedStyle = currentStyle
            .replace(/\b(?:border|border-top|border-bottom|border-left|border-right|border-width|border-style|border-color|border-image|outline|outline-width|outline-style|outline-color|box-shadow|mso-[^;:]+)\s*:[^;]+;?/gi, '')
            .trim();
          if (cleanedStyle) {
            htmlEl.setAttribute('style', cleanedStyle);
          } else {
            htmlEl.removeAttribute('style');
          }
        }

        // Clean Word classes and unwanted border utility classes
        if (htmlEl.className) {
          const cleanClass = htmlEl.className
            .replace(/\b(?:MsoNormal|MsoTableGrid|TableGrid|table-bordered|border[a-z0-9-_]*)\b/gi, '')
            .trim();
          if (cleanClass) {
            htmlEl.className = cleanClass;
          } else {
            htmlEl.removeAttribute('class');
          }
        }

        // Replace fieldset with a clean div
        if (htmlEl.tagName.toLowerCase() === 'fieldset') {
          const div = doc.createElement('div');
          div.innerHTML = htmlEl.innerHTML;
          htmlEl.replaceWith(div);
        }
      });

      // B. Unwrap single-cell tables or make nested tables borderless
      const tables = doc.body.querySelectorAll('table');
      tables.forEach((tbl) => {
        const rows = tbl.querySelectorAll('tr');
        const cells = tbl.querySelectorAll('td, th');
        if (rows.length <= 1 && cells.length <= 1) {
          const firstCell = cells[0];
          const div = doc.createElement('div');
          div.innerHTML = firstCell ? firstCell.innerHTML : tbl.innerHTML;
          tbl.replaceWith(div);
        } else {
          tbl.removeAttribute('border');
          tbl.style.border = 'none';
          tbl.style.borderCollapse = 'collapse';
          cells.forEach((c) => {
            (c as HTMLElement).style.border = 'none';
          });
        }
      });

      return doc.body.innerHTML;
    } catch {
      // Fallback regex if DOMParser fails
    }
  }

  // Regex Fallback (safe without stripping numbering)
  cleaned = cleaned
    .replace(/\b(?:border|border-top|border-bottom|border-left|border-right|border-width|border-style|border-color|outline|box-shadow)\s*:[^;"]+;?/gi, '')
    .replace(/\bborder=(["'])[0-9a-zA-Z]+\1/gi, '');

  return cleaned;
};

// Backwards compatibility alias
export const cleanRedundantNumbering = cleanSopRichContent;

export const RichTextRenderer: React.FC<RichTextRendererProps> = ({
  content,
  fallback = '-',
  className = '',
}) => {
  if (!content || !content.trim()) {
    return <span className="text-slate-400 italic font-bookman">{fallback}</span>;
  }

  // Preview must render the exact HTML produced by the editor.
  // Security cleanup is handled by DOMPurify below while preserving list types and numbering.
  const raw = content.trim();

  if (hasHtmlTags(raw)) {
    // Sanitize with DOMPurify to prevent XSS attacks while preserving formatting
    const sanitizedHtml = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
        'ol', 'ul', 'li', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'sub', 'sup', 'blockquote'
      ],
      ALLOWED_ATTR: [
        'style', 'class', 'colspan', 'rowspan', 'align', 'start', 'type', 'value',
        'src', 'alt', 'width', 'height', 'data-wrap', 'data-width', 'data-align',
        'data-rotation', 'data-storage-image', 'data-sop-image', 'data-sop-list-group',
        'data-sop-list-continuation', 'data-sop-continuation-li', 'data-sop-continuation-number'
      ],
      ALLOW_DATA_ATTR: true,
      ALLOWED_URI_REGEXP: /^(?:(?:https?|blob):|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);)/i
    });

    const imageSafeHtml = sanitizedHtml.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
      const styleMatch = attrs.match(/\bstyle=(\"|')([^\"']*)(\"|')/i);
      let style = styleMatch ? styleMatch[2] : '';
      style = style.replace(/(?:position|z-index|filter|transform)\s*:[^;]+;?/gi, '').trim();
      if (!/max-width\s*:/i.test(style)) style += ';max-width:100%';
      if (!/height\s*:/i.test(style)) style += ';height:auto';
      if (!/display\s*:/i.test(style)) style += ';display:inline-block';
      const cleanAttrs = attrs.replace(/\sstyle=(\"|')[^\"']*(\"|')/i, '').trim();
      return `<img crossorigin="anonymous" ${cleanAttrs}${cleanAttrs ? ' ' : ''}style=\"${style.replace(/^;|;$/g, '')}\">`;
    });

    const finalRenderHtml = imageSafeHtml.replace(/<ol\b([^>]*)>/gi, (match, attrs) => {
      const startMatch = attrs.match(/\bstart=(\"|')?(\d+)\1?/i);
      if (startMatch) {
        const startVal = parseInt(startMatch[2], 10) || 1;
        const styleMatch = attrs.match(/\bstyle=(\"|')([^\"']*)(\"|')/i);
        let style = styleMatch ? styleMatch[2] : '';
        if (!/counter-reset\s*:/i.test(style)) {
          style += `;counter-reset: sop-list ${startVal - 1};--sop-start-offset: ${startVal - 1}`;
        }
        if (styleMatch) {
          return `<ol ${attrs.replace(/\bstyle=(\"|')[^\"']*(\"|')/i, `style="${style.replace(/^;|;$/g, '')}"`)}>`;
        }
        return `<ol ${attrs} style="${style.replace(/^;|;$/g, '')}">`;
      }
      return match;
    });

    return (
      <div
        className={`font-bookman text-black rich-text-output rich-text-document-content break-words [overflow-wrap:break-word] [word-break:normal] [hyphens:none] ${className}`}
        dangerouslySetInnerHTML={{ __html: finalRenderHtml }}
      />
    );
  }

  // Plain text format: convert numbered/bulleted plain text lines into clean HTML or paragraphs
  const lines = raw.split(/\r?\n/);
  const isMultiLineList = lines.length > 1 && lines.some((l) => /^\s*(?:\d+[\.\)]|[a-zA-Z][\.\)]|[-*•])\s+/.test(l));

  if (isMultiLineList) {
    const listItems: string[] = [];
    let isOrdered = false;
    let listType = '1';
    let firstStartNumber: number | null = null;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const numMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)$/);
      const alphaMatch = trimmed.match(/^([a-zA-Z])[\.\)]\s+(.*)$/);
      const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);

      if (numMatch) {
        isOrdered = true;
        listType = '1';
        const parsedNum = parseInt(numMatch[1], 10);
        if (firstStartNumber === null && Number.isFinite(parsedNum) && parsedNum > 0) {
          firstStartNumber = parsedNum;
        }
        listItems.push(`<li>${numMatch[2]}</li>`);
      } else if (alphaMatch) {
        isOrdered = true;
        listType = 'a';
        listItems.push(`<li>${alphaMatch[2]}</li>`);
      } else if (bulletMatch) {
        listItems.push(`<li>${bulletMatch[1]}</li>`);
      } else {
        listItems.push(`<li>${trimmed}</li>`);
      }
    });

    const startAttrStr = isOrdered && firstStartNumber && firstStartNumber > 1 ? ` start="${firstStartNumber}" style="counter-reset: sop-list ${firstStartNumber - 1};--sop-start-offset: ${firstStartNumber - 1}"` : '';
    const listHtml = isOrdered
      ? `<ol type="${listType}"${startAttrStr}>${listItems.join('')}</ol>`
      : `<ul>${listItems.join('')}</ul>`;

    return (
      <div
        className={`font-bookman text-black rich-text-output rich-text-document-content break-words [overflow-wrap:break-word] [word-break:normal] [hyphens:none] ${className}`}
        dangerouslySetInnerHTML={{ __html: listHtml }}
      />
    );
  }

  // Default plain text format: convert double newlines to paragraphs, single newlines to <br>
  const formattedHtml = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n/g, '\n')
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return (
    <div
      className={`font-bookman text-black rich-text-output rich-text-document-content break-words [overflow-wrap:break-word] [word-break:normal] [hyphens:none] ${className}`}
      dangerouslySetInnerHTML={{ __html: formattedHtml }}
    />
  );
};


