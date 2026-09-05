import mammoth from 'mammoth';
import DOMPurify from 'dompurify';

export interface ParsedSopDocx {
  title?: string;
  effectiveDate?: string; // YYYY-MM-DD
  pengertian?: string;
  tujuan?: string;
  kebijakan?: string;
  prosedur?: string;
  alur?: string;
  unitTerkait?: string;
  extractedFields: string[];
  totalFieldsFound: number;
  fileName?: string;
}

const INDONESIAN_MONTHS: Record<string, string> = {
  januari: '01',
  jan: '01',
  februari: '02',
  feb: '02',
  maret: '03',
  mar: '03',
  april: '04',
  apr: '04',
  mei: '05',
  may: '05',
  juni: '06',
  jun: '06',
  juli: '07',
  jul: '07',
  agustus: '08',
  agu: '08',
  ags: '08',
  september: '09',
  sep: '09',
  oktober: '10',
  okt: '10',
  november: '11',
  nov: '11',
  desember: '12',
  des: '12'
};

/**
 * Extracts and normalizes date from free text or table cell to YYYY-MM-DD.
 */
export function extractDateFromText(text: string): string | null {
  if (!text) return null;

  // Pattern 1: ISO format YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = text.match(/\b(20\d\d)[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const numDateMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](20\d\d)\b/);
  if (numDateMatch) {
    const d = numDateMatch[1].padStart(2, '0');
    const m = numDateMatch[2].padStart(2, '0');
    const y = numDateMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Pattern 3: DD [Indonesian Month] YYYY e.g. "15 Januari 2026", "23 Oktober 2025"
  const indoDateMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])\s+([a-zA-Z]+)\s+(20\d\d)\b/);
  if (indoDateMatch) {
    const d = indoDateMatch[1].padStart(2, '0');
    const monthName = indoDateMatch[2].toLowerCase();
    const y = indoDateMatch[3];
    const m = INDONESIAN_MONTHS[monthName];
    if (m) {
      return `${y}-${m}-${d}`;
    }
  }

  return null;
}

/**
 * Cleans extracted title string by stripping common boilerplate keywords.
 */
function cleanTitle(raw: string): string {
  if (!raw) return '';
  let cleaned = raw
    .replace(/^[\s\r\n\t]+|[\s\r\n\t]+$/g, '')
    .replace(/^(?:judul\s*(?:spo|sop)?|nama\s*(?:spo|sop|prosedur))\s*[:：\-]\s*/gi, '')
    .replace(/^standar\s+prosedur\s+operasional\s*[:：\-]?\s*/gi, '')
    .replace(/^spo\s*[:：\-]\s*/gi, '')
    .trim();

  // If wrapped in quotes, unwrap
  cleaned = cleaned.replace(/^["'“](.*)["'”]$/, '$1').trim();
  return cleaned;
}

/**
 * Cleans HTML content extracted from a section cell or block.
 */
function cleanSectionHtml(html: string, sectionName: string): string {
  if (!html) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Strip scripts, styles, meta
  doc.querySelectorAll('script, style, meta, link').forEach(el => el.remove());

  // Remove leading paragraph or heading if it's just the section header (e.g. "PENGERTIAN", "1. PENGERTIAN", etc.)
  const firstEl = doc.body.firstElementChild;
  if (firstEl) {
    const txt = (firstEl.textContent || '').trim().toLowerCase();
    const normalizedName = sectionName.toLowerCase();
    // If first element only contains the section name or header like "1. PENGERTIAN :"
    const isJustHeader = new RegExp(`^(?:[0-9a-zivx]+[\\.\\)]\\s*)?${normalizedName}\\s*[:：]?$`, 'i').test(txt);
    if (isJustHeader) {
      firstEl.remove();
    } else {
      // Or if it starts with "PENGERTIAN : ...", remove just the prefix
      const prefixRegex = new RegExp(`^(?:[0-9a-zivx]+[\\.\\)]\\s*)?${normalizedName}\\s*[:：]\\s*`, 'i');
      if (prefixRegex.test(txt)) {
        firstEl.innerHTML = firstEl.innerHTML.replace(prefixRegex, '');
      }
    }
  }

  let bodyHtml = doc.body.innerHTML.trim();

  // If empty or only spaces/nbsp
  if (!bodyHtml || doc.body.textContent?.trim() === '') {
    return '';
  }

  // Sanitize with DOMPurify
  return DOMPurify.sanitize(bodyHtml, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
      'ol', 'ul', 'li', 'div', 'span', 'sub', 'sup',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'figure', 'figcaption'
    ],
    ALLOWED_ATTR: ['style', 'start', 'type', 'colspan', 'rowspan', 'src', 'alt', 'width', 'height', 'loading']
  }).trim();
}

/**
 * Converts plain text into clean HTML paragraphs or lists if HTML was not structured.
 */
function plainTextToHtml(text: string): string {
  if (!text || !text.trim()) return '';
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';

  const isNumbered = lines.every(l => /^(?:\d+|[a-zA-Z])[\.\)]\s+/.test(l));
  const isBullet = lines.every(l => /^[-*•·]\s+/.test(l));

  if (isNumbered) {
    const items = lines.map(l => `<li>${l.replace(/^(?:\d+|[a-zA-Z])[\.\)]\s+/, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  } else if (isBullet) {
    const items = lines.map(l => `<li>${l.replace(/^[-*•·]\s+/, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  }

  return lines.map(l => `<p>${l}</p>`).join('');
}

/**
 * Identifies standard Indonesian SPO section from label text.
 */
function identifySection(label: string): 'pengertian' | 'tujuan' | 'kebijakan' | 'prosedur' | 'alur' | 'unitTerkait' | null {
  const norm = label.toLowerCase().replace(/[^a-z]/g, ' ').trim();

  if (/^(?:\d+|[a-z]|ivx)+\s*pengertian\b|\bpengertian\b/.test(norm)) {
    return 'pengertian';
  }
  if (/^(?:\d+|[a-z]|ivx)+\s*tujuan\b|\btujuan\b/.test(norm)) {
    return 'tujuan';
  }
  if (/^(?:\d+|[a-z]|ivx)+\s*kebijakan\b|\bkebijakan\b/.test(norm)) {
    return 'kebijakan';
  }
  if (/^(?:\d+|[a-z]|ivx)+\s*prosedur\b|\bprosedur\b|\blangkah\s*langkah\b/.test(norm)) {
    return 'prosedur';
  }
  if (/\balur\b|\bdiagram\s*alir\b|\bbagan\s*alir\b|\bflow\s*chart\b/.test(norm)) {
    return 'alur';
  }
  if (/\bunit\s*terkait\b|\bunit\s*kerja\s*terkait\b|\binstalasi\s*terkait\b/.test(norm)) {
    return 'unitTerkait';
  }

  return null;
}

/**
 * Parses an Indonesian SPO Word (.docx) file buffer and extracts all standard fields:
 * - Judul (Title)
 * - Tanggal (Effective Date YYYY-MM-DD)
 * - Pengertian
 * - Tujuan
 * - Kebijakan
 * - Prosedur
 * - Alur
 * - Unit Terkait
 */
export async function parseSopFromDocx(file: File): Promise<ParsedSopDocx> {
  const arrayBuffer = await file.arrayBuffer();

  // Convert to HTML (preserves tables, lists, formatting)
  const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
  const rawHtml = htmlResult.value || '';

  // Extract raw text as backup
  const textResult = await mammoth.extractRawText({ arrayBuffer });
  const rawText = textResult.value || '';

  const parsed: ParsedSopDocx = {
    extractedFields: [],
    totalFieldsFound: 0,
    fileName: file.name
  };

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  // 1. Check Tables (Primary format for Indonesian hospital SPOs)
  const tables = Array.from(doc.querySelectorAll('table'));
  let tableHeaderFound = false;
  const tableSectionHtml: Record<string, string[]> = {
    pengertian: [],
    tujuan: [],
    kebijakan: [],
    prosedur: [],
    alur: [],
    unitTerkait: []
  };

  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll('tr'));
    for (const tr of rows) {
      const cells = Array.from(tr.querySelectorAll('td, th'));
      if (cells.length === 0) continue;

      // Extract text content of cells
      const cellTexts = cells.map(c => (c.textContent || '').trim());
      const cellHtmls = cells.map(c => c.innerHTML.trim());

      // Case A: Row has 2 or more columns, check if first cell is a Section Label
      if (cells.length >= 2) {
        // Col 0 or Col 1 might be the section label (if Col 0 is number like "1.")
        const col0Label = identifySection(cellTexts[0]);
        const col1Label = cells.length >= 3 && !col0Label ? identifySection(cellTexts[1]) : null;

        const matchedSection = col0Label || col1Label;
        if (matchedSection) {
          // Content is in the next cell or combined remaining cells
          const contentStartIndex = col0Label ? 1 : 2;
          const contentHtml = cleanSectionHtml(
            cellHtmls.slice(contentStartIndex).join('') || cellHtmls[1] || '',
            matchedSection
          );
          const contentText = cellTexts.slice(contentStartIndex).join(' ').trim() || cellTexts[1] || '';

          if (contentText) {
            const value = contentHtml || plainTextToHtml(contentText);
            if (value) tableSectionHtml[matchedSection].push(value);
          }
          continue;
        }
      }

      // Case B: Search for Date in cells
      if (!parsed.effectiveDate) {
        for (const ct of cellTexts) {
          if (
            ct.toLowerCase().includes('tanggal') ||
            ct.toLowerCase().includes('terbit') ||
            ct.toLowerCase().includes('ditetapkan') ||
            /\b20\d\d\b/.test(ct)
          ) {
            const foundDate = extractDateFromText(ct);
            if (foundDate) {
              parsed.effectiveDate = foundDate;
              break;
            }
          }
        }
      }

      // Case C: Search for Title in cells
      if (!parsed.title) {
        for (let i = 0; i < cells.length; i++) {
          const ct = cellTexts[i];
          const lower = ct.toLowerCase();

          // Explicit title cell indicator
          if (lower.includes('judul') || lower.includes('nama prosedur') || lower.includes('nama spo')) {
            const clean = cleanTitle(ct);
            // A table label such as "Judul SPO" is not itself the title.
            // Prefer the value in the following cell when the label has no value.
            const labelOnly = /^(?:judul\s*(?:spo|sop)?|nama\s*(?:prosedur|spo))\s*[:：]?$/i.test(ct);
            const nextValue = labelOnly ? (cellTexts[i + 1] || '').trim() : '';
            const candidate = labelOnly ? cleanTitle(nextValue) : clean;
            if (candidate && candidate.length > 3 && !/^(?:judul\s*(?:spo|sop)?|nama\s*(?:prosedur|spo))$/i.test(candidate)) {
              parsed.title = candidate;
              tableHeaderFound = true;
              break;
            }
          }

          // In hospital SOP table headers, the center cell often has the bold title
          const strongEl = cells[i].querySelector('strong, b, h1, h2, h3');
          if (strongEl) {
            const stText = (strongEl.textContent || '').trim();
            const stLower = stText.toLowerCase();
            if (
              stText.length > 5 &&
              !stLower.includes('standar prosedur operasional') &&
              !stLower.includes('rsud') &&
              !stLower.includes('kabupaten') &&
              !stLower.includes('direktur') &&
              !stLower.includes('dokumen') &&
              !stLower.includes('revisi') &&
              !stLower.includes('halaman') &&
              !stLower.includes('pengertian') &&
              !stLower.includes('tujuan') &&
              !stLower.includes('kebijakan') &&
              !stLower.includes('prosedur')
            ) {
              parsed.title = cleanTitle(stText);
              tableHeaderFound = true;
            }
          }
        }
      }
    }
  }

  // Combine repeated rows belonging to the same section. Hospital SPO Word
  // templates often split PROSEDUR/UNIT TERKAIT across several table rows.
  (Object.keys(tableSectionHtml) as Array<keyof typeof tableSectionHtml>).forEach((sec) => {
    const parts = tableSectionHtml[sec].filter(Boolean);
    if (parts.length > 0) {
      const combined = cleanSectionHtml(parts.join(''), sec);
      if (combined) parsed[sec] = combined;
    }
  });

  // 2. Linear Paragraph / Heading extraction (if any fields are still missing)
  const missingSections: Array<'pengertian' | 'tujuan' | 'kebijakan' | 'prosedur' | 'alur' | 'unitTerkait'> = [];
  if (!parsed.pengertian) missingSections.push('pengertian');
  if (!parsed.tujuan) missingSections.push('tujuan');
  if (!parsed.kebijakan) missingSections.push('kebijakan');
  if (!parsed.prosedur) missingSections.push('prosedur');
  if (!parsed.alur) missingSections.push('alur');
  if (!parsed.unitTerkait) missingSections.push('unitTerkait');

  if (missingSections.length > 0) {
    // Scan all top-level elements
    const elements = Array.from(doc.body.children);
    let currentSection: 'pengertian' | 'tujuan' | 'kebijakan' | 'prosedur' | 'alur' | 'unitTerkait' | null = null;
    const sectionBuffers: Record<string, string[]> = {
      pengertian: [],
      tujuan: [],
      kebijakan: [],
      prosedur: [],
      alur: [],
      unitTerkait: []
    };

    for (const el of elements) {
      const text = (el.textContent || '').trim();
      if (!text) continue;

      // Check if this element is a section marker
      const identified = identifySection(text);
      if (identified && text.length < 80) {
        currentSection = identified;
        continue;
      }

      // If we are inside an active section, collect innerHTML
      if (currentSection && missingSections.includes(currentSection)) {
        sectionBuffers[currentSection].push(el.outerHTML);
      }
    }

    for (const sec of missingSections) {
      if (sectionBuffers[sec].length > 0) {
        const combined = sectionBuffers[sec].join('');
        const cleaned = cleanSectionHtml(combined, sec);
        if (cleaned) {
          parsed[sec] = cleaned;
        }
      }
    }
  }

  // 3. Fallback to Raw Text Regex Parsing (if any section is still empty)
  const remainingMissing = missingSections.filter(sec => !parsed[sec]);
  if (remainingMissing.length > 0 && rawText) {
    // Regex for standard Indonesian section markers
    const sectionPatterns: Record<string, RegExp> = {
      pengertian: /(?:^|\n)\s*(?:[0-9a-zivx]+[\.\)]\s*)?PENGERTIAN\s*[:：]?([\s\S]*?)(?=(?:\n\s*(?:[0-9a-zivx]+[\.\)]\s*)?(?:TUJUAN|KEBIJAKAN|PROSEDUR|ALUR|UNIT\s+TERKAIT)|$))/i,
      tujuan: /(?:^|\n)\s*(?:[0-9a-zivx]+[\.\)]\s*)?TUJUAN\s*[:：]?([\s\S]*?)(?=(?:\n\s*(?:[0-9a-zivx]+[\.\)]\s*)?(?:KEBIJAKAN|PROSEDUR|ALUR|UNIT\s+TERKAIT)|$))/i,
      kebijakan: /(?:^|\n)\s*(?:[0-9a-zivx]+[\.\)]\s*)?KEBIJAKAN\s*[:：]?([\s\S]*?)(?=(?:\n\s*(?:[0-9a-zivx]+[\.\)]\s*)?(?:PROSEDUR|ALUR|UNIT\s+TERKAIT)|$))/i,
      prosedur: /(?:^|\n)\s*(?:[0-9a-zivx]+[\.\)]\s*)?PROSEDUR\s*[:：]?([\s\S]*?)(?=(?:\n\s*(?:[0-9a-zivx]+[\.\)]\s*)?(?:ALUR|UNIT\s+TERKAIT)|$))/i,
      alur: /(?:^|\n)\s*(?:[0-9a-zivx]+[\.\)]\s*)?(?:ALUR|BAGAN\s+ALIR|DIAGRAM\s+ALIR)\s*[:：]?([\s\S]*?)(?=(?:\n\s*(?:[0-9a-zivx]+[\.\)]\s*)?UNIT\s+TERKAIT|$))/i,
      unitTerkait: /(?:^|\n)\s*(?:[0-9a-zivx]+[\.\)]\s*)?(?:UNIT\s+TERKAIT|UNIT\s+KERJA\s+TERKAIT)\s*[:：]?([\s\S]*?)$/i
    };

    for (const sec of remainingMissing) {
      const match = rawText.match(sectionPatterns[sec]);
      if (match && match[1]?.trim()) {
        const textContent = match[1].trim();
        parsed[sec] = plainTextToHtml(textContent);
      }
    }
  }

  // 4. Fallback Date extraction if not found in table
  if (!parsed.effectiveDate && rawText) {
    const dateMatch = rawText.match(/(?:tanggal\s*terbit|tanggal\s*ditetapkan|ditetapkan|tanggal)\s*[:：\-]?\s*([^\r\n]+)/i);
    if (dateMatch && dateMatch[1]) {
      const parsedDate = extractDateFromText(dateMatch[1]);
      if (parsedDate) {
        parsed.effectiveDate = parsedDate;
      }
    }
    // If still not found, search entire text for standard date
    if (!parsed.effectiveDate) {
      const anyDate = extractDateFromText(rawText);
      if (anyDate) {
        parsed.effectiveDate = anyDate;
      }
    }
  }

  // 5. Fallback Title extraction if not found in table
  if (!parsed.title && rawText) {
    // Check lines for explicit "JUDUL :"
    const titleMatch = rawText.match(/(?:judul\s*(?:spo|sop)?|nama\s*(?:prosedur|spo))\s*[:：\-]\s*([^\r\n]+)/i);
    const titleLabelThenValue = rawText.match(/(?:^|\n)\s*(?:judul\s*(?:spo|sop)?|nama\s*(?:prosedur|spo))\s*[:：]?\s*\n\s*([^\r\n]+)/i);
    if (titleMatch && titleMatch[1]?.trim()) {
      parsed.title = cleanTitle(titleMatch[1].trim());
    } else if (titleLabelThenValue && titleLabelThenValue[1]?.trim()) {
      parsed.title = cleanTitle(titleLabelThenValue[1].trim());
    } else {
      // Look at the first 10 non-empty lines
      const lines = rawText
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0);

      for (const line of lines.slice(0, 10)) {
        const lower = line.toLowerCase();
        if (
          lower.includes('standar prosedur operasional') ||
          lower.includes('rsud') ||
          lower.includes('pemerintah') ||
          lower.includes('nomor') ||
          lower.includes('halaman') ||
          lower.includes('revisi') ||
          lower.includes('ditetapkan') ||
          lower.includes('direktur') ||
          lower.includes('pengertian') ||
          /^(?:judul\s*(?:spo|sop)?|nama\s*(?:prosedur|spo))\s*[:：-]?$/i.test(line) ||
          line.length < 5
        ) {
          continue;
        }
        parsed.title = cleanTitle(line);
        break;
      }
    }
  }

  // Build summary of extracted fields
  const fieldList: Array<{ key: keyof ParsedSopDocx; name: string }> = [
    { key: 'title', name: 'Judul' },
    { key: 'effectiveDate', name: 'Tanggal' },
    { key: 'pengertian', name: 'Pengertian' },
    { key: 'tujuan', name: 'Tujuan' },
    { key: 'kebijakan', name: 'Kebijakan' },
    { key: 'prosedur', name: 'Prosedur' },
    { key: 'alur', name: 'Alur' },
    { key: 'unitTerkait', name: 'Unit Terkait' }
  ];

  parsed.extractedFields = [];
  for (const f of fieldList) {
    if (parsed[f.key]) {
      parsed.extractedFields.push(f.name);
    }
  }
  parsed.totalFieldsFound = parsed.extractedFields.length;

  return parsed;
}
