import React, { useRef, useEffect, useState, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ListOrdered,
  List,
  Palette,
  RotateCcw,
  Undo2,
  Redo2,
  IndentIncrease,
  IndentDecrease,
  Type,
  ImagePlus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  X,
  Move,
  RotateCw,
  Layers,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Check,
  ImageIcon,
  Maximize,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export type WordWrapMode =
  | 'inline'
  | 'square'
  | 'tight'
  | 'through'
  | 'top-bottom'
  | 'behind'
  | 'in-front';

// Microsoft Word Layout Options Button Icon (Exact match to MS Word UI)
const WordLayoutOptionsIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-5' }) => (
  <svg viewBox="0 0 20 22" fill="none" className={className}>
    {/* Top text lines */}
    <rect x="2" y="2" width="16" height="1.5" rx="0.5" fill="#2563eb" />
    <rect x="2" y="5" width="16" height="1.5" rx="0.5" fill="#2563eb" />
    {/* Center object arch & vertical divider */}
    <path d="M5 13 C5 8.5 15 8.5 15 13" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <line x1="10" y1="8.5" x2="10" y2="13" stroke="#2563eb" strokeWidth="1.4" />
    {/* Bottom text lines */}
    <rect x="2" y="15.5" width="16" height="1.5" rx="0.5" fill="#2563eb" />
    <rect x="2" y="18.5" width="16" height="1.5" rx="0.5" fill="#2563eb" />
  </svg>
);

interface RichTextEditorProps {
  label?: string;
  required?: boolean;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  helperText?: string;
  allowImageUpload?: boolean;
  imageUploadNote?: string;
  hideToolbar?: boolean;
  variant?: 'default' | 'seamless';
  onFocus?: () => void;
}


/**
 * Normalize rich text pasted from Word/Google Docs/Web into the SPO document model.
 *
 * Preserves structural formatting: paragraphs, line breaks, lists (with start & type),
 * tables, emphasis (bold, italic, underline, strike), sub/sup, and text alignment (justify, left, center, right).
 * Correctly translates Word / Google Docs bullet and numbered lists into standard HTML <ol> and <ul> tags.
 */
const normalizePastedRichText = (source: string): string => {
  if (!source) return '';

  const parser = new DOMParser();
  // Pre-clean Word conditional comments
  const cleanComments = source.replace(/<!--[\s\S]*?-->/gi, '');
  const doc = parser.parseFromString(cleanComments, 'text/html');

  // Remove external styles, scripts, links, meta, and xml tags
  doc.querySelectorAll('meta, link, style, script, xml').forEach((el) => el.remove());

  // Unwrap or replace <o:p> Word paragraph markers with spans
  doc.querySelectorAll('o\\:p').forEach((el) => {
    const span = doc.createElement('span');
    span.innerHTML = el.innerHTML;
    el.replaceWith(span);
  });

  // Process Microsoft Word list paragraphs (<p class="MsoListParagraph"> or style containing mso-list)
  const msoListParas = Array.from(doc.querySelectorAll('p[class*="MsoList"], p[style*="mso-list"], li[class*="MsoList"]')) as HTMLElement[];
  if (msoListParas.length > 0) {
    let currentList: HTMLElement | null = null;
    let currentListType = 'ul';

    msoListParas.forEach((p) => {
      // Find list marker inside mso-list:Ignore or leading text
      const ignoreSpan = p.querySelector('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]');
      let markerText = ignoreSpan ? (ignoreSpan.textContent || '').trim() : '';

      // If no ignoreSpan, check beginning text of paragraph
      if (!markerText) {
        const text = (p.textContent || '').trim();
        const m = text.match(/^((?:\d+|[a-zA-Z]|[ivxIVX]+)[\.\)]|[-*•·§o])\s+/);
        if (m) markerText = m[1];
      }

      let isOrdered = false;
      let listTypeAttr = '1';

      if (/^\d+[\.\)]?$/.test(markerText)) {
        isOrdered = true;
        listTypeAttr = '1';
      } else if (/^[a-zA-Z][\.\)]?$/.test(markerText) && (markerText.length === 1 || (markerText.length === 2 && /[\.\)]/.test(markerText[1])))) {
        isOrdered = true;
        listTypeAttr = markerText[0] === markerText[0].toUpperCase() ? 'A' : 'a';
      } else if (/^[ivxIVX]+[\.\)]?$/.test(markerText)) {
        isOrdered = true;
        listTypeAttr = markerText === markerText.toUpperCase() ? 'I' : 'i';
      }

      const neededTag = isOrdered ? 'ol' : 'ul';

      // Clean the ignore span from paragraph
      if (ignoreSpan) {
        ignoreSpan.remove();
      } else if (markerText) {
        // Strip leading marker from first text node
        const firstText = p.firstChild;
        if (firstText && firstText.nodeType === Node.TEXT_NODE && firstText.textContent) {
          firstText.textContent = firstText.textContent.replace(new RegExp('^\\s*' + markerText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'), '');
        }
      }

      const li = doc.createElement('li');
      li.innerHTML = p.innerHTML;

      const prev = p.previousElementSibling;
      if (currentList && prev === currentList && currentListType === neededTag) {
        currentList.appendChild(li);
        p.remove();
      } else {
        currentList = doc.createElement(neededTag);
        currentListType = neededTag;
        if (isOrdered && listTypeAttr !== '1') {
          currentList.setAttribute('type', listTypeAttr);
        }
        currentList.appendChild(li);
        p.replaceWith(currentList);
      }
    });
  }

  // Remove any remaining Word list ignore markers
  doc.querySelectorAll<HTMLElement>('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]').forEach((el) => {
    el.remove();
  });

  // Preserve text alignment & formatting (bold, italic, underline, colors)
  doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const textAlign = el.style.textAlign || el.getAttribute('align') || '';
    const validAlign = ['left', 'center', 'right', 'justify', 'start', 'end'].find(
      (a) => a === textAlign.toLowerCase().trim()
    );

    const color = el.style.color;
    const isBold = el.style.fontWeight === 'bold' || parseInt(el.style.fontWeight || '0', 10) >= 600;
    const isItalic = el.style.fontStyle === 'italic';
    const isUnderline = el.style.textDecoration?.includes('underline');

    el.removeAttribute('style');
    el.removeAttribute('class');
    el.removeAttribute('id');
    el.removeAttribute('lang');
    el.removeAttribute('dir');

    if (validAlign) {
      el.style.textAlign = validAlign;
    }
    if (color && !['windowtext', 'auto', 'inherit', 'initial'].includes(color.toLowerCase())) {
      el.style.color = color;
    }
    if (isBold && el.tagName.toLowerCase() !== 'b' && el.tagName.toLowerCase() !== 'strong') {
      el.style.fontWeight = 'bold';
    }
    if (isItalic && el.tagName.toLowerCase() !== 'i' && el.tagName.toLowerCase() !== 'em') {
      el.style.fontStyle = 'italic';
    }
    if (isUnderline && el.tagName.toLowerCase() !== 'u') {
      el.style.textDecoration = 'underline';
    }
  });

  // Remove unwanted attributes except safe list & table attributes
  doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (!['style', 'start', 'type', 'value', 'colspan', 'rowspan', 'align'].includes(name)) {
        el.removeAttribute(attr.name);
      }
    });
  });

  const normalized = DOMPurify.sanitize(doc.body.innerHTML, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'ol', 'ul', 'li', 'div', 'span', 'sub', 'sup',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote'
    ],
    ALLOWED_ATTR: ['style', 'start', 'type', 'value', 'colspan', 'rowspan', 'align'],
    ALLOW_DATA_ATTR: false,
  });

  return normalized
    .replace(/<div>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>')
    .replace(/<p>\s*<\/p>/gi, '<br>')
    .trim();
};

export const PRESET_COLORS = [
  { name: 'Hitam Dokumen', color: '#0f172a' },
  { name: 'Abu-Abu Gelap', color: '#475569' },
  { name: 'Biru Medis', color: '#1d4ed8' },
  { name: 'Merah / Kritis', color: '#dc2626' },
  { name: 'Hijau / Aman', color: '#16a34a' },
  { name: 'Amber / Perhatian', color: '#d97706' },
  { name: 'Ungu Khusus', color: '#7c3aed' },
];

export const FONT_SIZES = [
  { label: '10pt (Kecil)', value: '10pt' },
  { label: '12pt (Standar SPO)', value: '12pt' },
  { label: '13pt (Sedang)', value: '13pt' },
  { label: '14pt (Normal)', value: '14pt' },
  { label: '16pt (Sub Judul)', value: '16pt' },
  { label: '18pt (Besar)', value: '18pt' },
];

export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // Up to 20 MB allowed (will be auto-compressed to ~30-60 KB)

export async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    // 1. Try URL.createObjectURL (fastest, lowest memory overhead)
    const objectUrl = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : null;
    
    const cleanup = () => {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }
    };

    const processImg = (src: string) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDimension = 1000;
          let width = img.naturalWidth || img.width || 800;
          let height = img.naturalHeight || img.height || 600;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            resolve(src);
            return;
          }

          // For JPEGs/general photos, fill white background to avoid dark artifacts
          const isPng = file.type === 'image/png' || file.type === 'image/svg+xml';
          if (!isPng) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
          }

          ctx.drawImage(img, 0, 0, width, height);
          cleanup();

          let dataUrl = '';
          try {
            if (isPng) {
              dataUrl = canvas.toDataURL('image/png');
              // If PNG is still larger than 250KB, compress to high-quality JPEG to preserve local storage limits
              if (dataUrl.length > 250 * 1024) {
                const bgCanvas = document.createElement('canvas');
                bgCanvas.width = width;
                bgCanvas.height = height;
                const bgCtx = bgCanvas.getContext('2d');
                if (bgCtx) {
                  bgCtx.fillStyle = '#ffffff';
                  bgCtx.fillRect(0, 0, width, height);
                  bgCtx.drawImage(img, 0, 0, width, height);
                  dataUrl = bgCanvas.toDataURL('image/jpeg', 0.84);
                }
              }
            } else {
              dataUrl = canvas.toDataURL('image/jpeg', 0.84);
            }
          } catch {
            dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          }

          resolve(dataUrl || src);
        } catch {
          cleanup();
          resolve(src);
        }
      };

      img.onerror = () => {
        cleanup();
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      };

      img.src = src;
    };

    if (objectUrl) {
      processImg(objectUrl);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = (e.target?.result as string) || '';
        if (!result) resolve('');
        else processImg(result);
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    }
  });
}

// MS Word Authentic Vector Icons for Wrap Text
const WrapIconInLine: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <line x1="2" y1="4" x2="22" y2="4" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <path d="M4 18 C4 11, 12 11, 12 18" stroke="#0284c7" strokeWidth="2.5" fill="none" />
    <line x1="14" y1="18" x2="22" y2="18" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="21" x2="22" y2="21" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const WrapIconSquare: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <line x1="2" y1="4" x2="22" y2="4" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <path d="M4 19 C4 12, 12 12, 12 19" stroke="#0284c7" strokeWidth="2.5" fill="none" />
    <line x1="15" y1="9" x2="22" y2="9" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="15" y1="13" x2="22" y2="13" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="15" y1="17" x2="22" y2="17" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="21" x2="22" y2="21" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const WrapIconTight: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <line x1="2" y1="4" x2="22" y2="4" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <path d="M3 19 C3 11, 11 11, 11 19" stroke="#0284c7" strokeWidth="2.5" fill="none" />
    <line x1="13" y1="8" x2="22" y2="8" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="12" y1="12" x2="22" y2="12" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="13" y1="16" x2="22" y2="16" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="21" x2="22" y2="21" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const WrapIconThrough: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <line x1="2" y1="4" x2="22" y2="4" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="8" x2="11" y2="8" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <path d="M13 19 C13 11, 21 11, 21 19" stroke="#0284c7" strokeWidth="2.5" fill="none" />
    <line x1="2" y1="12" x2="11" y2="12" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="16" x2="11" y2="16" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="21" x2="22" y2="21" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const WrapIconTopBottom: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <line x1="2" y1="4" x2="22" y2="4" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="8" x2="22" y2="8" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <path d="M7 16 C7 10, 17 10, 17 16" stroke="#0284c7" strokeWidth="2.5" fill="none" />
    <line x1="2" y1="20" x2="22" y2="20" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const WrapIconBehindText: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    {/* Faint arch behind text */}
    <path d="M6 19 C6 10, 18 10, 18 19" stroke="#93c5fd" strokeWidth="4" fill="none" />
    {/* Full width text lines crossing over the arch */}
    <line x1="2" y1="5" x2="22" y2="5" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="9" x2="22" y2="9" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="13" x2="22" y2="13" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="17" x2="22" y2="17" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="21" x2="22" y2="21" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const WrapIconInFrontText: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    {/* Broken text lines */}
    <line x1="2" y1="5" x2="22" y2="5" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="9" x2="5" y2="9" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
    <line x1="19" y1="9" x2="22" y2="9" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="13" x2="5" y2="13" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
    <line x1="19" y1="13" x2="22" y2="13" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="17" x2="5" y2="17" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
    <line x1="19" y1="17" x2="22" y2="17" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
    {/* Solid bold arch in front of text */}
    <path d="M6 19 C6 9, 18 9, 18 19" stroke="#0284c7" strokeWidth="3" fill="#ffffff" />
    <line x1="2" y1="21" x2="22" y2="21" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Main Wrap Text Options Definition matching MS Word UI
const MS_WORD_WRAP_OPTIONS: Array<{
  id: WordWrapMode;
  label: string;
  shortcut: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    id: 'inline',
    label: 'In Line with Text',
    shortcut: 'I',
    desc: 'Gambar sejajar dengan aliran baris teks',
    icon: WrapIconInLine,
  },
  {
    id: 'square',
    label: 'Square',
    shortcut: 'S',
    desc: 'Teks mengalir mengelilingi batas persegi gambar',
    icon: WrapIconSquare,
  },
  {
    id: 'tight',
    label: 'Tight',
    shortcut: 'T',
    desc: 'Teks merapat mengikuti kontur tepi gambar',
    icon: WrapIconTight,
  },
  {
    id: 'through',
    label: 'Through',
    shortcut: 'h',
    desc: 'Teks mengalir menembus area tepi gambar',
    icon: WrapIconThrough,
  },
  {
    id: 'top-bottom',
    label: 'Top and Bottom',
    shortcut: 'o',
    desc: 'Teks berada di atas dan di bawah gambar saja',
    icon: WrapIconTopBottom,
  },
  {
    id: 'behind',
    label: 'Behind Text',
    shortcut: 'B',
    desc: 'Gambar berada di belakang teks (latar belakang)',
    icon: WrapIconBehindText,
  },
  {
    id: 'in-front',
    label: 'In Front of Text',
    shortcut: 'n',
    desc: 'Gambar berada di depan teks (mengambang)',
    icon: WrapIconInFrontText,
  },
];

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  label,
  required = false,
  value,
  onChange,
  placeholder = 'Ketik isi batang tubuh SPO di sini...',
  minHeight = '100px',
  className = '',
  helperText,
  allowImageUpload = true,
  imageUploadNote,
  hideToolbar = false,
  variant = 'default',
  onFocus,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [activeColor, setActiveColor] = useState('#0f172a');
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSuccess, setImageSuccess] = useState<string | null>(null);
  const isUpdatingFromPropRef = useRef(false);
  const lastEmittedValueRef = useRef<string | null>(null);
  // Keep the user's text selection alive when a toolbar button takes focus.
  // This is critical for long SPO documents: formatting must apply to the
  // selection that was made in the editor, not to the caret created by the button.
  const savedRangeRef = useRef<Range | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Active text formatting state (for toolbar button active states)
  const [activeFormatting, setActiveFormatting] = useState<{
    bold: boolean;
    italic: boolean;
    underline: boolean;
    align: 'left' | 'center' | 'right' | 'justify';
    orderedList: boolean;
    unorderedList: boolean;
  }>({
    bold: false,
    italic: false,
    underline: false,
    align: 'left',
    orderedList: false,
    unorderedList: false,
  });

  const updateActiveFormatting = useCallback(() => {
    if (!editorRef.current) return;
    try {
      const isBold = document.queryCommandState('bold');
      const isItalic = document.queryCommandState('italic');
      const isUnderline = document.queryCommandState('underline');
      const isOrdered = document.queryCommandState('insertOrderedList');
      const isUnordered = document.queryCommandState('insertUnorderedList');

      let align: 'left' | 'center' | 'right' | 'justify' = 'left';
      if (document.queryCommandState('justifyFull')) align = 'justify';
      else if (document.queryCommandState('justifyCenter')) align = 'center';
      else if (document.queryCommandState('justifyRight')) align = 'right';
      else if (document.queryCommandState('justifyLeft')) align = 'left';

      setActiveFormatting({
        bold: isBold,
        italic: isItalic,
        underline: isUnderline,
        align,
        orderedList: isOrdered,
        unorderedList: isUnordered,
      });
    } catch {
      // Browser safety fallback
    }
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || !editorRef.current) return;
      if (editorRef.current.contains(selection.anchorNode)) {
        savedRangeRef.current = selection.getRangeAt(0).cloneRange();
        updateActiveFormatting();
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [updateActiveFormatting]);

  // Selected Figure state for MS Word style interactive selection overlay
  const [selectedFigure, setSelectedFigure] = useState<HTMLElement | null>(null);
  const [showWrapTextMenu, setShowWrapTextMenu] = useState(false);
  const [currentWrapMode, setCurrentWrapMode] = useState<WordWrapMode>('top-bottom');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    figure: HTMLElement;
  } | null>(null);
  const [isDraggingFileOver, setIsDraggingFileOver] = useState(false);
  const [figureRect, setFigureRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    percentWidth: number;
  } | null>(null);

  // Live on-canvas resizing interaction state (8 handles: NW, N, NE, E, SE, S, SW, W)
  const isResizingRef = useRef<{
    handle: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's';
    startX: number;
    startY: number;
    startWidthPx: number;
    startHeightPx: number;
    editorWidthPx: number;
  } | null>(null);

  // Live rotation state (MS Word top rotation circle handle)
  const isRotatingRef = useRef<{
    centerX: number;
    centerY: number;
    startAngle: number;
    initialRotation: number;
  } | null>(null);
  const [currentRotation, setCurrentRotation] = useState<number>(0);

  // Live on-canvas dragging/moving interaction state for free positioning
  const isDraggingMoveRef = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    hasMoved: boolean;
  } | null>(null);

  const [livePercent, setLivePercent] = useState<number | null>(null);

  // Drag-and-drop indicator target: exact visual drop indicator (range / element bounding)
  const [dropIndicator, setDropIndicator] = useState<{
    x: number;
    y: number;
    height: number;
    width: number;
    type: 'vertical' | 'horizontal';
  } | null>(null);
  const activeDropRangeRef = useRef<Range | null>(null);

  // Update Figure Rect relative to editor container
  const updateFigureRect = useCallback(() => {
    if (!selectedFigure || !containerRef.current || !editorRef.current) {
      setFigureRect(null);
      return;
    }
    if (!editorRef.current.contains(selectedFigure)) {
      setSelectedFigure(null);
      setFigureRect(null);
      setShowWrapTextMenu(false);
      return;
    }

    const containerBound = containerRef.current.getBoundingClientRect();
    const figBound = selectedFigure.getBoundingClientRect();
    const editorBound = editorRef.current.getBoundingClientRect();

    const currentWidthAttr = selectedFigure.getAttribute('data-width') || selectedFigure.style.maxWidth || '75%';
    const parsedPercent = parseInt(currentWidthAttr.replace('%', ''), 10) || Math.round((figBound.width / editorBound.width) * 100) || 75;
    const wrapAttr = (selectedFigure.getAttribute('data-wrap') as WordWrapMode) || 'top-bottom';
    const rotAttr = selectedFigure.getAttribute('data-rotation');
    setCurrentRotation(rotAttr ? parseFloat(rotAttr) : 0);

    setCurrentWrapMode(wrapAttr);

    setFigureRect({
      top: figBound.top - containerBound.top + containerRef.current.scrollTop,
      left: figBound.left - containerBound.left + containerRef.current.scrollLeft,
      width: figBound.width,
      height: figBound.height,
      percentWidth: Math.min(Math.max(parsedPercent, 10), 100),
    });
  }, [selectedFigure]);

  // Preserve the current selection/range whenever the user selects text in the editor.
  useEffect(() => {
    const saveSelection = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    };

    document.addEventListener('selectionchange', saveSelection);
    return () => document.removeEventListener('selectionchange', saveSelection);
  }, []);

  const restoreSavedSelection = useCallback(() => {
    const editor = editorRef.current;
    const saved = savedRangeRef.current;
    if (!editor || !saved || !editor.contains(saved.commonAncestorContainer)) {
      editor?.focus();
      return false;
    }
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(saved.cloneRange());
    editor.focus();
    return true;
  }, []);

  // Sync value from prop to contentEditable ONLY when prop genuinely changes from outside
  useEffect(() => {
    if (!editorRef.current) return;
    if (value !== lastEmittedValueRef.current) {
      lastEmittedValueRef.current = value || '';
      isUpdatingFromPropRef.current = true;
      editorRef.current.innerHTML = value || '';
      isUpdatingFromPropRef.current = false;
      if (selectedFigure && !editorRef.current.contains(selectedFigure)) {
        setSelectedFigure(null);
        setFigureRect(null);
      }
    }
  }, [value, selectedFigure]);

  // Recalculate overlay on scroll or window resize
  useEffect(() => {
    const handleScrollOrResize = () => {
      updateFigureRect();
    };

    window.addEventListener('resize', handleScrollOrResize);
    const scrollContainer = containerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScrollOrResize, { passive: true });
    }
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScrollOrResize);
      }
    };
  }, [updateFigureRect]);

  const handleInput = useCallback(() => {
    if (isUpdatingFromPropRef.current || !editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const cleanHtml = html === '<br>' || html.trim() === '' ? '' : html;
    lastEmittedValueRef.current = cleanHtml;
    onChange(cleanHtml);
    updateFigureRect();
  }, [onChange, updateFigureRect]);

  // Helper to reliably select a figure element and sync overlay immediately
  const selectFigureElement = useCallback((figure: HTMLElement) => {
    if (!containerRef.current || !editorRef.current) return;

    setSelectedFigure(figure);
    const figBound = figure.getBoundingClientRect();
    const containerBound = containerRef.current.getBoundingClientRect();
    const editorBound = editorRef.current.getBoundingClientRect();

    const currentWidthAttr = figure.getAttribute('data-width') || figure.style.maxWidth || '75%';
    const parsedPercent = parseInt(currentWidthAttr.replace('%', ''), 10) || Math.round((figBound.width / editorBound.width) * 100) || 75;
    const wrapMode = (figure.getAttribute('data-wrap') as WordWrapMode) || 'top-bottom';
    const rotAttr = figure.getAttribute('data-rotation');
    
    setCurrentWrapMode(wrapMode);
    setCurrentRotation(rotAttr ? parseFloat(rotAttr) : 0);

    // Calculate figureRect directly right away
    setFigureRect({
      top: figBound.top - containerBound.top + containerRef.current.scrollTop,
      left: figBound.left - containerBound.left + containerRef.current.scrollLeft,
      width: figBound.width,
      height: figBound.height,
      percentWidth: Math.min(Math.max(parsedPercent, 10), 100),
    });

    // Mark active class
    if (editorRef.current) {
      editorRef.current.querySelectorAll('.figure-wrapper').forEach((f) => f.classList.remove('figure-selected'));
    }
    figure.classList.add('figure-selected');
  }, []);

  const clearFigureSelection = useCallback(() => {
    setSelectedFigure(null);
    setFigureRect(null);
    setShowWrapTextMenu(false);
    if (editorRef.current) {
      editorRef.current.querySelectorAll('.figure-wrapper').forEach((f) => f.classList.remove('figure-selected'));
    }
  }, []);

  // Direct native capture listener on editor to guarantee 100% click/pointer capture on images and context menu
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleNativePointerDown = (e: MouseEvent | PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const figure = target.closest('.figure-wrapper') as HTMLElement | null;

      if (figure && editor.contains(figure)) {
        if (e.button === 2) {
          // Right click
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        selectFigureElement(figure);
        setContextMenu(null);
      } else if (!target.closest('.figure-wrapper') && !target.closest('.figure-control-overlay') && !target.closest('.figure-context-menu') && !target.closest('.figure-quick-toolbar')) {
        clearFigureSelection();
        setContextMenu(null);
      }
    };

    const handleNativeContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const figure = target.closest('.figure-wrapper') as HTMLElement | null;
      const overlay = target.closest('.figure-control-overlay') as HTMLElement | null;

      if ((figure && editor.contains(figure)) || (overlay && selectedFigure)) {
        e.preventDefault();
        e.stopPropagation();
        const activeFig = figure || selectedFigure;
        if (activeFig) {
          selectFigureElement(activeFig);
          setContextMenu({
            x: Math.min(e.clientX, window.innerWidth - 240),
            y: Math.min(e.clientY, window.innerHeight - 340),
            figure: activeFig,
          });
        }
      } else {
        setContextMenu(null);
      }
    };

    editor.addEventListener('pointerdown', handleNativePointerDown, { capture: true });
    editor.addEventListener('click', handleNativePointerDown, { capture: true });
    editor.addEventListener('contextmenu', handleNativeContextMenu, { capture: true });

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('.figure-context-menu')) {
        setContextMenu(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);

    return () => {
      editor.removeEventListener('pointerdown', handleNativePointerDown, { capture: true });
      editor.removeEventListener('click', handleNativePointerDown, { capture: true });
      editor.removeEventListener('contextmenu', handleNativeContextMenu, { capture: true });
      window.removeEventListener('click', handleGlobalClick);
    };
  }, [selectFigureElement, clearFigureSelection, selectedFigure]);

  // Keyboard handler for delete / backspace and Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearFigureSelection();
        setContextMenu(null);
        if (isFullscreen) setIsFullscreen(false);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFigure) {
        if (
          document.activeElement === editorRef.current ||
          containerRef.current?.contains(document.activeElement) ||
          document.activeElement === document.body
        ) {
          e.preventDefault();
          selectedFigure.remove();
          setSelectedFigure(null);
          setFigureRect(null);
          setShowWrapTextMenu(false);
          setContextMenu(null);
          handleInput();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFigure, handleInput, clearFigureSelection, isFullscreen]);

  // Helper to apply horizontal positioning (left, center, right) for wrapping modes
  const applyFigureAlignment = (fig: HTMLElement, align: 'left' | 'center' | 'right', mode: WordWrapMode) => {
    const widthAttr = fig.getAttribute('data-width') || '75%';
    const widthNum = parseInt(widthAttr.replace('%', ''), 10) || 75;

    fig.setAttribute('data-align', align);

    if (mode === 'top-bottom') {
      fig.style.display = 'block';
      fig.style.clear = 'both';
      fig.style.float = 'none';
      if (align === 'left') {
        fig.style.margin = '12px auto 12px 0';
        fig.style.textAlign = 'left';
      } else if (align === 'right') {
        fig.style.margin = '12px 0 12px auto';
        fig.style.textAlign = 'right';
      } else {
        fig.style.margin = '12px auto';
        fig.style.textAlign = 'center';
      }
    } else if (mode === 'square' || mode === 'tight' || mode === 'through') {
      fig.style.display = 'block';
      fig.style.clear = 'none';
      if (align === 'right') {
        fig.style.float = 'right';
        fig.style.margin = '4px 0 8px 16px';
        fig.style.width = `${Math.min(widthNum, 60)}%`;
        fig.style.maxWidth = `${Math.min(widthNum, 60)}%`;
      } else if (align === 'center') {
        fig.style.float = 'none';
        fig.style.clear = 'both';
        fig.style.margin = '10px auto';
        fig.style.textAlign = 'center';
        fig.style.width = 'auto';
        fig.style.maxWidth = `${widthNum}%`;
      } else {
        // default left
        fig.style.float = 'left';
        fig.style.margin = '4px 16px 8px 0';
        fig.style.width = `${Math.min(widthNum, 60)}%`;
        fig.style.maxWidth = `${Math.min(widthNum, 60)}%`;
      }
    } else if (mode === 'inline') {
      fig.style.display = 'inline-block';
      fig.style.verticalAlign = 'middle';
      fig.style.margin = '4px 8px';
      fig.style.float = 'none';
      fig.style.clear = 'none';
    }
  };

  // MS Word Wrap Text Application Logic
  const applyWordWrapMode = (mode: WordWrapMode, customAlign?: 'left' | 'center' | 'right') => {
    if (!selectedFigure) return;

    selectedFigure.setAttribute('data-wrap', mode);
    setCurrentWrapMode(mode);

    const currentWidth = figureRect?.percentWidth || 75;
    selectedFigure.setAttribute('data-width', `${currentWidth}%`);

    const align = customAlign || (selectedFigure.getAttribute('data-align') as 'left' | 'center' | 'right') || 'center';

    // Reset base properties
    selectedFigure.style.maxWidth = `${currentWidth}%`;
    selectedFigure.style.width = 'auto';
    selectedFigure.style.float = 'none';
    selectedFigure.style.clear = 'both';
    selectedFigure.style.marginLeft = 'auto';
    selectedFigure.style.marginRight = 'auto';
    selectedFigure.style.position = 'relative';
    selectedFigure.style.opacity = '1';
    selectedFigure.style.zIndex = '1';
    selectedFigure.style.mixBlendMode = 'normal';
    selectedFigure.style.boxShadow = 'none';
    selectedFigure.style.top = 'auto';
    selectedFigure.style.left = 'auto';

    switch (mode) {
      case 'inline':
        selectedFigure.style.display = 'inline-block';
        selectedFigure.style.verticalAlign = 'middle';
        selectedFigure.style.margin = '4px 8px';
        selectedFigure.style.float = 'none';
        selectedFigure.style.clear = 'none';
        selectedFigure.style.maxWidth = `${Math.min(currentWidth, 50)}%`;
        break;

      case 'square':
      case 'tight':
      case 'through':
        applyFigureAlignment(selectedFigure, align === 'center' ? 'left' : align, mode);
        break;

      case 'top-bottom':
        applyFigureAlignment(selectedFigure, align, 'top-bottom');
        break;

      case 'behind':
        selectedFigure.style.display = 'block';
        selectedFigure.style.margin = '8px auto';
        selectedFigure.style.textAlign = 'center';
        selectedFigure.style.float = 'none';
        selectedFigure.style.clear = 'none';
        selectedFigure.style.opacity = '0.55';
        selectedFigure.style.zIndex = '0';
        selectedFigure.style.mixBlendMode = 'multiply';
        break;

      case 'in-front':
        selectedFigure.style.display = 'block';
        selectedFigure.style.margin = '8px auto';
        selectedFigure.style.textAlign = 'center';
        selectedFigure.style.float = 'none';
        selectedFigure.style.clear = 'none';
        selectedFigure.style.zIndex = '10';
        selectedFigure.style.boxShadow = 'none';
        break;
    }

    setShowWrapTextMenu(false);
    handleInput();
    updateFigureRect();
  };

  const applyFigurePercentWidth = (percent: number) => {
    if (!selectedFigure) return;
    const clamped = Math.min(Math.max(percent, 10), 100);
    selectedFigure.setAttribute('data-width', `${clamped}%`);
    selectedFigure.style.maxWidth = `${clamped}%`;
    if (currentWrapMode === 'square' || currentWrapMode === 'tight' || currentWrapMode === 'through') {
      selectedFigure.style.width = `${clamped}%`;
    }
    handleInput();
    updateFigureRect();
  };

  const applyFigureRotation = (deg: number) => {
    if (!selectedFigure) return;
    const normalized = (deg % 360 + 360) % 360;
    setCurrentRotation(normalized);
    selectedFigure.setAttribute('data-rotation', normalized.toString());
    selectedFigure.style.transform = normalized ? `rotate(${normalized}deg)` : '';
    handleInput();
    updateFigureRect();
  };

  const deleteSelectedFigure = () => {
    if (!selectedFigure) return;
    selectedFigure.remove();
    setSelectedFigure(null);
    setFigureRect(null);
    setShowWrapTextMenu(false);
    setContextMenu(null);
    handleInput();
  };

  // Text formatting commands. Restore selection first so toolbar clicks never
  // collapse formatting onto the wrong caret position.
  const executeCommand = (command: string, arg: string | undefined = undefined) => {
    if (!editorRef.current) return;
    restoreSavedSelection();

    try {
      document.execCommand(command, false, arg);
    } catch {
      // Keep the editor usable even if a browser does not support a command.
    }

    handleInput();
    updateActiveFormatting();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  // Helper for 1-tap SPO list hierarchies (1. Utama, a. Sub-poin, i. Sub-sub-poin)
  const insertCustomList = (listType: '1' | 'a' | 'i') => {
    if (!editorRef.current) return;
    restoreSavedSelection();
    try {
      document.execCommand('insertOrderedList', false);
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node: Node | null = sel.anchorNode;
        while (node && node !== editorRef.current) {
          if (node.nodeName === 'OL') {
            (node as HTMLOListElement).type = listType;
            (node as HTMLElement).style.listStyleType =
              listType === 'a' ? 'lower-alpha' : listType === 'i' ? 'lower-roman' : 'decimal';
            break;
          }
          node = node.parentNode;
        }
      }
    } catch {
      // safe fallback
    }
    handleInput();
    updateActiveFormatting();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // 1. Tab / Shift+Tab for Indenting & Outdenting in lists (Sub-bullets & Sub-numbers)
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        executeCommand('outdent');
      } else {
        executeCommand('indent');
      }
      return;
    }

    // 2. Space key: Auto-convert typed markdown/prefixes like "1. ", "a. ", "- " into native lists
    if (e.key === ' ') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        if (node && node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          const offset = range.startOffset;
          const textBefore = text.slice(0, offset);

          // Numeric ordered list: "1." or "1)"
          const numMatch = textBefore.match(/^(\d+)[\.\)]$/);
          // Alphabetical ordered list: "a." or "a)" or "A." or "A)"
          const alphaMatch = textBefore.match(/^([a-zA-Z])[\.\)]$/);
          // Roman ordered list: "i." or "i)" or "iv."
          const romanMatch = textBefore.match(/^([ivxIVX]+)[\.\)]$/);
          // Unordered list / bullet: "-", "*", "•", "·"
          const bulletMatch = textBefore.match(/^[-*•·]$/);

          if (numMatch || alphaMatch || romanMatch || bulletMatch) {
            e.preventDefault();
            // Remove the typed prefix
            node.textContent = text.slice(offset);
            const newRange = document.createRange();
            newRange.setStart(node, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);

            if (bulletMatch) {
              executeCommand('insertUnorderedList');
            } else {
              executeCommand('insertOrderedList');
              const curSelection = window.getSelection();
              const li = curSelection?.anchorNode ? (curSelection.anchorNode as HTMLElement).parentElement?.closest('li') : null;
              const ol = li?.closest('ol');
              if (ol) {
                if (alphaMatch) {
                  const isUpper = alphaMatch[1] === alphaMatch[1].toUpperCase();
                  ol.setAttribute('type', isUpper ? 'A' : 'a');
                } else if (romanMatch) {
                  const isUpper = romanMatch[1] === romanMatch[1].toUpperCase();
                  ol.setAttribute('type', isUpper ? 'I' : 'i');
                } else if (numMatch) {
                  const startVal = parseInt(numMatch[1], 10);
                  if (startVal > 1) {
                    ol.setAttribute('start', String(startVal));
                  }
                }
              }
            }
            return;
          }
        }
      }
    }

    // 3. Enter key on empty list item: exit list cleanly
    if (e.key === 'Enter' && !e.shiftKey) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && selection.isCollapsed) {
        const anchor = selection.anchorNode;
        const li = anchor ? (anchor.nodeType === Node.ELEMENT_NODE ? (anchor as HTMLElement).closest('li') : anchor.parentElement?.closest('li')) : null;
        if (li) {
          const text = (li.textContent || '').trim();
          if (!text || text === '') {
            e.preventDefault();
            executeCommand('outdent');
            return;
          }
        }
      }
    }

    // 4. Alignment shortcuts:
    // Ctrl+J / Cmd+J -> Align Justify
    if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
      e.preventDefault();
      executeCommand('justifyFull');
      return;
    }
    // Ctrl+L / Cmd+L -> Align Left
    if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      executeCommand('justifyLeft');
      return;
    }
    // Ctrl+E / Cmd+E -> Align Center
    if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      executeCommand('justifyCenter');
      return;
    }
    // Ctrl+R / Cmd+R -> Align Right
    if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      executeCommand('justifyRight');
      return;
    }
  };

  const handleApplyColor = (color: string) => {
    setActiveColor(color);
    setShowColorPicker(false);
    executeCommand('foreColor', color);
  };

  // --- MS WORD STYLE 8-POINT LIVE RESIZE ENGINE ---
  const handleResizeStart = (
    e: React.PointerEvent<HTMLDivElement>,
    handle: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedFigure || !editorRef.current) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const editorWidth = editorRef.current.getBoundingClientRect().width;
    const figureWidth = selectedFigure.getBoundingClientRect().width;
    const figureHeight = selectedFigure.getBoundingClientRect().height;

    isResizingRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startWidthPx: figureWidth,
      startHeightPx: figureHeight,
      editorWidthPx: editorWidth,
    };

    setLivePercent(Math.round((figureWidth / editorWidth) * 100));
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizingRef.current || !selectedFigure || !editorRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const { handle, startX, startY, startWidthPx, startHeightPx, editorWidthPx } = isResizingRef.current;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    let newWidthPx = startWidthPx;
    if (handle === 'se' || handle === 'ne' || handle === 'e') {
      newWidthPx = startWidthPx + deltaX * 2;
    } else if (handle === 'sw' || handle === 'nw' || handle === 'w') {
      newWidthPx = startWidthPx - deltaX * 2;
    } else if (handle === 's') {
      const scaleFactor = 1 + (deltaY / Math.max(startHeightPx, 20));
      newWidthPx = startWidthPx * scaleFactor;
    } else if (handle === 'n') {
      const scaleFactor = 1 - (deltaY / Math.max(startHeightPx, 20));
      newWidthPx = startWidthPx * scaleFactor;
    }

    let percent = Math.round((newWidthPx / editorWidthPx) * 100);
    percent = Math.min(Math.max(percent, 10), 100);

    setLivePercent(percent);

    selectedFigure.style.maxWidth = `${percent}%`;
    selectedFigure.setAttribute('data-width', `${percent}%`);
    if (currentWrapMode === 'square' || currentWrapMode === 'tight' || currentWrapMode === 'through') {
      selectedFigure.style.width = `${percent}%`;
    }
    updateFigureRect();
  };

  const handleResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizingRef.current || !selectedFigure) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    isResizingRef.current = null;
    setLivePercent(null);
    handleInput();
  };

  // --- MS WORD STYLE ROTATION ENGINE (TOP CIRCULAR HANDLE) ---
  const handleRotateStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedFigure) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = selectedFigure.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const initialRotationAttr = selectedFigure.getAttribute('data-rotation');
    const initialRotation = initialRotationAttr ? parseFloat(initialRotationAttr) : 0;

    const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

    isRotatingRef.current = {
      centerX,
      centerY,
      startAngle: currentAngle,
      initialRotation,
    };
  };

  const handleRotateMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isRotatingRef.current || !selectedFigure) return;
    e.preventDefault();
    e.stopPropagation();

    const { centerX, centerY, startAngle, initialRotation } = isRotatingRef.current;
    const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    const delta = currentAngle - startAngle;

    let totalRotation = Math.round((initialRotation + delta) % 360);
    if (totalRotation < 0) totalRotation += 360;

    // Magnetic snap to 0, 90, 180, 270 degrees
    if (Math.abs(totalRotation - 0) < 4 || Math.abs(totalRotation - 360) < 4) totalRotation = 0;
    else if (Math.abs(totalRotation - 90) < 4) totalRotation = 90;
    else if (Math.abs(totalRotation - 180) < 4) totalRotation = 180;
    else if (Math.abs(totalRotation - 270) < 4) totalRotation = 270;

    setCurrentRotation(totalRotation);
    selectedFigure.setAttribute('data-rotation', totalRotation.toString());
    selectedFigure.style.transform = totalRotation ? `rotate(${totalRotation}deg)` : '';
  };

  const handleRotateEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isRotatingRef.current) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    isRotatingRef.current = null;
    handleInput();
    updateFigureRect();
  };

  // Helper to extract Caret Range or closest Element from viewport coordinates
  const getDropLocationFromPoint = (clientX: number, clientY: number) => {
    if (!editorRef.current) return null;

    const editorRect = editorRef.current.getBoundingClientRect();
    const relX = (clientX - editorRect.left) / editorRect.width;
    const align: 'left' | 'center' | 'right' =
      relX < 0.35 ? 'left' : relX > 0.65 ? 'right' : 'center';

    // 1. Try Caret Range (Webkit / Blink / Modern browsers)
    let range: Range | null = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(clientX, clientY);
    } else if ((document as unknown as { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }).caretPositionFromPoint) {
      const pos = (document as unknown as { caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number } | null }).caretPositionFromPoint(clientX, clientY);
      if (pos && pos.offsetNode) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }

    if (range && editorRef.current.contains(range.startContainer)) {
      // Ensure range is not inside the figure being dragged
      if (!selectedFigure || !selectedFigure.contains(range.startContainer)) {
        return { type: 'range' as const, range, align, clientX, clientY };
      }
    }

    // 2. Fallback: Find closest block element inside editor
    const children = Array.from(editorRef.current.children) as HTMLElement[];
    let closestChild: HTMLElement | null = null;
    let closestDist = Infinity;
    let position: 'before' | 'after' = 'before';

    for (const child of children) {
      if (child === selectedFigure) continue;
      const rect = child.getBoundingClientRect();
      const childMiddleY = rect.top + rect.height / 2;
      const dist = Math.abs(clientY - childMiddleY);

      if (dist < closestDist) {
        closestDist = dist;
        closestChild = child;
        position = clientY < childMiddleY ? 'before' : 'after';
      }
    }

    if (closestChild) {
      return { type: 'element' as const, elem: closestChild, position, align, clientX, clientY };
    }

    return { type: 'append' as const, align, clientX, clientY };
  };

  // --- PROCESS AND INSERT IMAGE FILES (FOR UPLOAD BUTTON, DESKTOP DRAG & DROP, & CLIPBOARD PASTE) ---
  const processAndInsertImageFiles = async (
    files: FileList | File[],
    targetCoords?: { clientX: number; clientY: number } | null
  ) => {
    if (!files || files.length === 0 || !editorRef.current) return;

    setImageError(null);
    setImageSuccess(null);

    const fileList: File[] = Array.from(files);
    let successfullyUploaded = 0;
    const errors: string[] = [];
    let lastInsertedFigure: HTMLElement | null = null;

    for (const file of fileList) {
      if (!file.type.startsWith('image/')) {
        errors.push(`"${file.name}" bukan file gambar.`);
        continue;
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        errors.push(`"${file.name}" (${sizeMb} MB) melebihi batas maksimal 20 MB.`);
        continue;
      }

      try {
        // Offline prototype: images are embedded locally as compressed data URLs.
        const imageUrl = await compressImageToDataUrl(file);

        if (!imageUrl) {
          errors.push(`Gagal memproses gambar "${file.name}".`);
          continue;
        }

        if (editorRef.current) {
          editorRef.current.focus();

          const figureWrapper = document.createElement('div');
          figureWrapper.className = 'my-3 figure-wrapper figure-wrap-top-bottom cursor-pointer select-none';
          figureWrapper.setAttribute('data-wrap', 'top-bottom');
          figureWrapper.setAttribute('data-width', '75%');
          figureWrapper.setAttribute('data-align', 'center');
          figureWrapper.contentEditable = 'false';
          figureWrapper.draggable = false;
          figureWrapper.style.cssText = 'display: block; margin: 12px auto; text-align: center; max-width: 75%; clear: both; cursor: pointer; position: relative;';

          const imgEl = document.createElement('img');
          imgEl.src = imageUrl;
          imgEl.crossOrigin = 'anonymous';
          imgEl.setAttribute('data-local-image', 'true');
          imgEl.alt = '';
          imgEl.draggable = false;
          imgEl.style.cssText = 'width: 100%; height: auto; border: none; border-radius: 0; display: inline-block; box-shadow: none; cursor: pointer; pointer-events: auto;';

          figureWrapper.appendChild(imgEl);

          const spacerP = document.createElement('p');
          spacerP.innerHTML = '<br>';

          let inserted = false;

          // 1. If target coordinate is specified (dropped at specific point)
          if (targetCoords) {
            const loc = getDropLocationFromPoint(targetCoords.clientX, targetCoords.clientY);
            if (loc) {
              if (loc.type === 'range' && loc.range) {
                loc.range.insertNode(figureWrapper);
                loc.range.collapse(false);
                loc.range.insertNode(spacerP);
                inserted = true;
              } else if (loc.type === 'element' && loc.elem) {
                if (loc.position === 'before') {
                  editorRef.current.insertBefore(figureWrapper, loc.elem);
                } else {
                  editorRef.current.insertBefore(figureWrapper, loc.elem.nextSibling);
                }
                inserted = true;
              }
            }
          }

          // 2. Active selection in editor
          if (!inserted) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
              const range = selection.getRangeAt(0);
              range.insertNode(figureWrapper);
              range.collapse(false);
              range.insertNode(spacerP);
              inserted = true;
            }
          }

          // 3. Fallback append
          if (!inserted) {
            editorRef.current.appendChild(figureWrapper);
            editorRef.current.appendChild(spacerP);
          }

          lastInsertedFigure = figureWrapper;
          successfullyUploaded++;
        }
      } catch {
        errors.push(`Gagal memproses gambar "${file.name}".`);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    handleInput();

    if (lastInsertedFigure) {
      const figToSelect = lastInsertedFigure;
      setTimeout(() => {
        selectFigureElement(figToSelect);
      }, 50);
    }

    if (errors.length > 0) {
      setImageError(errors.join(' '));
    } else if (successfullyUploaded > 0) {
      setImageSuccess(`Berhasil menyisipkan ${successfullyUploaded} gambar.`);
      setTimeout(() => setImageSuccess(null), 3000);
    }
  };

  // --- MS WORD STYLE DIRECT DRAG AND DROP REPOSITIONING & FILE DRAG ---
  const handleEditorDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();

    // If external files are being dragged from desktop / OS
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDraggingFileOver(true);
      return;
    }

    e.dataTransfer.dropEffect = 'move';
    setIsDraggingFileOver(false);

    if (!editorRef.current || !selectedFigure || !containerRef.current) return;

    const loc = getDropLocationFromPoint(e.clientX, e.clientY);
    if (!loc) return;

    const containerRect = containerRef.current.getBoundingClientRect();

    if (loc.type === 'range' && loc.range) {
      activeDropRangeRef.current = loc.range;
      const rangeRect = loc.range.getBoundingClientRect();
      if (rangeRect.height > 0) {
        setDropIndicator({
          x: rangeRect.left - containerRect.left,
          y: rangeRect.top - containerRect.top,
          width: 3,
          height: Math.max(rangeRect.height, 18),
          type: 'vertical',
        });
        return;
      }
    }

    if (loc.type === 'element' && loc.elem) {
      activeDropRangeRef.current = null;
      const elemRect = loc.elem.getBoundingClientRect();
      const topPos =
        loc.position === 'after'
          ? elemRect.bottom - containerRect.top
          : elemRect.top - containerRect.top;

      setDropIndicator({
        x: 16,
        y: topPos,
        width: containerRect.width - 32,
        height: 3,
        type: 'horizontal',
      });
      return;
    }

    // Default bottom indicator
    const editorRect = editorRef.current.getBoundingClientRect();
    setDropIndicator({
      x: 16,
      y: editorRect.bottom - containerRect.top - 4,
      width: containerRect.width - 32,
      height: 3,
      type: 'horizontal',
    });
  };

  const handleEditorDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsDraggingFileOver(false);
    }
    setDropIndicator(null);
    activeDropRangeRef.current = null;
  };

  // --- POINTER-BASED DIRECT MOVE ENGINE (CLICK & DRAG TO REPOSITION ANYWHERE) ---
  const handleMoveStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedFigure || !containerRef.current) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const figRect = selectedFigure.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    isDraggingMoveRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: figRect.left - containerRect.left,
      startTop: figRect.top - containerRect.top,
      hasMoved: false,
    };
  };

  const handleMovePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingMoveRef.current || !selectedFigure || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const dist = Math.hypot(
      e.clientX - isDraggingMoveRef.current.startX,
      e.clientY - isDraggingMoveRef.current.startY
    );
    if (dist < 4) return;
    isDraggingMoveRef.current.hasMoved = true;

    const loc = getDropLocationFromPoint(e.clientX, e.clientY);
    if (!loc) return;

    const containerRect = containerRef.current.getBoundingClientRect();

    if (loc.type === 'range' && loc.range) {
      activeDropRangeRef.current = loc.range;
      const rangeRect = loc.range.getBoundingClientRect();
      if (rangeRect.height > 0) {
        setDropIndicator({
          x: rangeRect.left - containerRect.left,
          y: rangeRect.top - containerRect.top,
          width: 3,
          height: Math.max(rangeRect.height, 18),
          type: 'vertical',
        });
        return;
      }
    }

    if (loc.type === 'element' && loc.elem) {
      activeDropRangeRef.current = null;
      const elemRect = loc.elem.getBoundingClientRect();
      const topPos =
        loc.position === 'after'
          ? elemRect.bottom - containerRect.top
          : elemRect.top - containerRect.top;

      setDropIndicator({
        x: 16,
        y: topPos,
        width: containerRect.width - 32,
        height: 3,
        type: 'horizontal',
      });
      return;
    }

    const editorRect = editorRef.current?.getBoundingClientRect();
    if (editorRect) {
      setDropIndicator({
        x: 16,
        y: editorRect.bottom - containerRect.top - 4,
        width: containerRect.width - 32,
        height: 3,
        type: 'horizontal',
      });
    }
  };

  const handleMovePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingMoveRef.current || !selectedFigure || !editorRef.current) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const didMove = isDraggingMoveRef.current.hasMoved;
    isDraggingMoveRef.current = null;

    if (!didMove) {
      // User simply clicked the image/bounding box, keep selected
      return;
    }

    const loc = getDropLocationFromPoint(e.clientX, e.clientY);

    if (currentWrapMode === 'in-front' || currentWrapMode === 'behind') {
      const editorRect = editorRef.current.getBoundingClientRect();
      const figRect = selectedFigure.getBoundingClientRect();
      const newLeft = Math.max(0, Math.min(e.clientX - editorRect.left - figRect.width / 2, editorRect.width - figRect.width));
      const newTop = Math.max(0, e.clientY - editorRect.top - figRect.height / 2);
      
      selectedFigure.style.position = 'relative';
      selectedFigure.style.margin = `${Math.round(newTop)}px 0 0 ${Math.round(newLeft)}px`;
    } else if (loc) {
      if (loc.type === 'range' && loc.range) {
        loc.range.insertNode(selectedFigure);
      } else if (loc.type === 'element' && loc.elem) {
        if (loc.position === 'before') {
          editorRef.current.insertBefore(selectedFigure, loc.elem);
        } else {
          editorRef.current.insertBefore(selectedFigure, loc.elem.nextSibling);
        }
      } else {
        editorRef.current.appendChild(selectedFigure);
      }

      if (currentWrapMode === 'square' || currentWrapMode === 'tight' || currentWrapMode === 'through') {
        applyFigureAlignment(selectedFigure, loc.align === 'center' ? 'left' : loc.align, currentWrapMode);
      } else if (currentWrapMode === 'top-bottom') {
        applyFigureAlignment(selectedFigure, loc.align, 'top-bottom');
      }
    }

    setDropIndicator(null);
    activeDropRangeRef.current = null;
    handleInput();
    updateFigureRect();
  };

  const handleEditorDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFileOver(false);

    // 1. If dropping image files directly from file explorer / desktop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files) as File[];
      const imageFiles = droppedFiles.filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        processAndInsertImageFiles(imageFiles, { clientX: e.clientX, clientY: e.clientY });
        setDropIndicator(null);
        activeDropRangeRef.current = null;
        return;
      }
    }

    // 2. If moving an existing image figure in the editor
    if (!selectedFigure || !editorRef.current) return;

    const loc = getDropLocationFromPoint(e.clientX, e.clientY);

    // Free floating modes
    if (currentWrapMode === 'in-front' || currentWrapMode === 'behind') {
      const editorRect = editorRef.current.getBoundingClientRect();
      const figRect = selectedFigure.getBoundingClientRect();
      const newLeft = Math.max(0, Math.min(e.clientX - editorRect.left - figRect.width / 2, editorRect.width - figRect.width));
      const newTop = Math.max(0, e.clientY - editorRect.top - figRect.height / 2);
      
      selectedFigure.style.position = 'relative';
      selectedFigure.style.margin = `${Math.round(newTop)}px 0 0 ${Math.round(newLeft)}px`;
    } else if (loc) {
      if (loc.type === 'range' && loc.range) {
        loc.range.insertNode(selectedFigure);
      } else if (loc.type === 'element' && loc.elem) {
        if (loc.position === 'before') {
          editorRef.current.insertBefore(selectedFigure, loc.elem);
        } else {
          editorRef.current.insertBefore(selectedFigure, loc.elem.nextSibling);
        }
      } else {
        editorRef.current.appendChild(selectedFigure);
      }

      // Automatically adjust alignment based on where the user dropped horizontally
      if (currentWrapMode === 'square' || currentWrapMode === 'tight' || currentWrapMode === 'through') {
        applyFigureAlignment(selectedFigure, loc.align === 'center' ? 'left' : loc.align, currentWrapMode);
      } else if (currentWrapMode === 'top-bottom') {
        applyFigureAlignment(selectedFigure, loc.align, 'top-bottom');
      }
    }

    setDropIndicator(null);
    activeDropRangeRef.current = null;
    handleInput();
    updateFigureRect();
  };

  // Clipboard support: images are inserted as images; text/HTML is sanitized
  // before insertion so Word/Google Docs styles do not pollute the SPO.
  const handleEditorPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const pastedFiles = Array.from(e.clipboardData.files) as File[];
      const imageFiles = pastedFiles.filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        e.preventDefault();
        processAndInsertImageFiles(imageFiles);
        return;
      }
    }

    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');
    const source = html || plain;
    if (!source || !editorRef.current) return;

    const safeHtml = html
      ? normalizePastedRichText(html)
      : plain
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\r?\n/g, '<br>');

    restoreSavedSelection();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const fragment = range.createContextualFragment(safeHtml);
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    if (lastNode) {
      const after = document.createRange();
      after.setStartAfter(lastNode);
      after.collapse(true);
      selection.removeAllRanges();
      selection.addRange(after);
      savedRangeRef.current = after.cloneRange();
    }
    handleInput();
  };

  // Clean Image Upload Button Handler
  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processAndInsertImageFiles(files);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between flex-wrap gap-1">
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          {helperText && (
            <span className="text-[11px] text-slate-500 italic">{helperText}</span>
          )}
        </div>
      )}

      {/* ERROR / SUCCESS ALERTS */}
      {imageError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-xl flex items-start gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{imageError}</p>
            <p className="text-[11px] text-rose-600 mt-0.5">Batas maksimal ukuran gambar adalah 1 MB per gambar.</p>
          </div>
          <button
            type="button"
            onClick={() => setImageError(null)}
            className="text-rose-400 hover:text-rose-700 text-xs font-bold ml-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {imageSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-1.5 rounded-xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span className="font-medium text-[11px]">{imageSuccess}</span>
        </div>
      )}

      <div
        ref={containerRef}
        className={`relative transition-colors w-full overflow-hidden ${
          variant === 'seamless'
            ? 'border-0 rounded-none bg-transparent'
            : 'border border-slate-200 hover:border-slate-300 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-400 rounded-lg bg-white'
        } ${
          isFullscreen ? 'fixed inset-0 z-[100] flex flex-col bg-white overflow-hidden p-2 sm:p-4 rounded-none border-0' : ''
        }`}
      >
        {/* Fullscreen Mobile Header Bar */}
        {isFullscreen && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-indigo-50 border-b border-indigo-200 mb-1 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                <Maximize2 className="w-3 h-3" />
              </span>
              <div>
                <span className="text-xs font-bold text-slate-900 block leading-tight">
                  {label ? `Mode Fokus: ${label}` : 'Mode Fokus Mengetik Batang Tubuh SPO'}
                </span>
                <span className="text-[10px] text-slate-500">
                  Layar penuh responsif untuk pengetikan panjang & touch screen
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-[11px] font-bold rounded-lg shadow-xs transition-all flex items-center gap-1 cursor-pointer touch-manipulation"
            >
              <Check className="w-3 h-3" />
              <span>Selesai</span>
            </button>
          </div>
        )}

        {/* TOOLBAR — compact editor controls without an intrusive toggle */}
        {(!hideToolbar || isFullscreen) && (
          <div className="rich-text-toolbar sticky top-0 z-30 bg-slate-100/95 backdrop-blur-xs border-b border-slate-200/90 px-1.5 py-0.5 flex items-center gap-0.5 overflow-x-auto no-scrollbar touch-pan-x text-slate-700 select-none shrink-0">
          {!selectedFigure ? (
            <>
              {/* Riwayat Undo/Redo */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('undo')}
                  title="Undo (Ctrl+Z)"
                  className="w-5.5 h-5.5 min-w-[22px] p-0.5 hover:bg-slate-200/80 hover:text-indigo-600 rounded text-slate-600 transition-colors cursor-pointer touch-manipulation flex items-center justify-center"
                >
                  <Undo2 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('redo')}
                  title="Redo (Ctrl+Y)"
                  className="w-5.5 h-5.5 min-w-[22px] p-0.5 hover:bg-slate-200/80 hover:text-indigo-600 rounded text-slate-600 transition-colors cursor-pointer touch-manipulation flex items-center justify-center"
                >
                  <Redo2 className="w-3 h-3" />
                </button>
              </div>

              <div className="w-px h-3 bg-slate-300 mx-0.5 shrink-0" />

              {/* Gaya Huruf (B, I, U) */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('bold')}
                  title="Tebal / Bold (Ctrl+B)"
                  className={`w-5.5 h-5.5 min-w-[22px] p-0.5 rounded transition-colors cursor-pointer touch-manipulation flex items-center justify-center ${activeFormatting.bold ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-slate-200/80 hover:text-indigo-600 text-slate-700'}`}
                >
                  <Bold className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('italic')}
                  title="Miring / Italic (Ctrl+I)"
                  className={`w-5.5 h-5.5 min-w-[22px] p-0.5 rounded transition-colors cursor-pointer touch-manipulation flex items-center justify-center ${activeFormatting.italic ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-slate-200/80 hover:text-indigo-600 text-slate-700'}`}
                >
                  <Italic className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('underline')}
                  title="Garis Bawah / Underline (Ctrl+U)"
                  className={`w-5.5 h-5.5 min-w-[22px] p-0.5 rounded transition-colors cursor-pointer touch-manipulation flex items-center justify-center ${activeFormatting.underline ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-slate-200/80 hover:text-indigo-600 text-slate-700'}`}
                >
                  <Underline className="w-3 h-3" />
                </button>
              </div>

              <div className="w-px h-3 bg-slate-300 mx-0.5 shrink-0" />

              {/* Warna Teks */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  title="Warna Teks"
                  className="w-5.5 h-5.5 min-w-[22px] p-0.5 hover:bg-slate-200/80 rounded text-slate-700 transition-colors cursor-pointer flex items-center justify-center gap-0.5 touch-manipulation"
                >
                  <Palette className="w-3 h-3" />
                  <span
                    className="w-1.5 h-1.5 rounded-full border border-slate-300 inline-block shrink-0"
                    style={{ backgroundColor: activeColor }}
                  />
                </button>

                {showColorPicker && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-44 space-y-1.5">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                      Pilih Warna Teks:
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c.color}
                          type="button"
                          onClick={() => handleApplyColor(c.color)}
                          title={c.name}
                          className="w-7 h-7 rounded border border-slate-300 hover:scale-105 transition-transform cursor-pointer flex items-center justify-center touch-manipulation"
                          style={{ backgroundColor: c.color }}
                        />
                      ))}
                    </div>
                    <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[10px]">
                      <span className="text-slate-600">Kustom:</span>
                      <input
                        type="color"
                        value={activeColor}
                        onChange={(e) => handleApplyColor(e.target.value)}
                        className="w-5 h-5 rounded cursor-pointer border-0 p-0"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="w-px h-3 bg-slate-300 mx-0.5 shrink-0" />

              {/* Perataan Teks */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('justifyLeft')}
                  title="Rata Kiri (Ctrl+L)"
                  className={`w-5.5 h-5.5 min-w-[22px] p-0.5 rounded transition-colors cursor-pointer touch-manipulation flex items-center justify-center ${activeFormatting.align === 'left' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-slate-200/80 hover:text-indigo-600 text-slate-700'}`}
                >
                  <AlignLeft className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('justifyCenter')}
                  title="Rata Tengah (Ctrl+E)"
                  className={`w-5.5 h-5.5 min-w-[22px] p-0.5 rounded transition-colors cursor-pointer touch-manipulation flex items-center justify-center ${activeFormatting.align === 'center' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-slate-200/80 hover:text-indigo-600 text-slate-700'}`}
                >
                  <AlignCenter className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('justifyRight')}
                  title="Rata Kanan (Ctrl+R)"
                  className={`w-5.5 h-5.5 min-w-[22px] p-0.5 rounded transition-colors cursor-pointer touch-manipulation flex items-center justify-center ${activeFormatting.align === 'right' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-slate-200/80 hover:text-indigo-600 text-slate-700'}`}
                >
                  <AlignRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('justifyFull')}
                  title="Rata Kiri Kanan / Justify (Ctrl+J)"
                  className={`w-5.5 h-5.5 min-w-[22px] p-0.5 rounded transition-colors cursor-pointer touch-manipulation flex items-center justify-center ${activeFormatting.align === 'justify' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-slate-200/80 hover:text-indigo-600 text-slate-700'}`}
                >
                  <AlignJustify className="w-3 h-3" />
                </button>
              </div>

              <div className="w-px h-3 bg-slate-300 mx-0.5 shrink-0" />

              {/* Indentasi (Tab / Shift+Tab) */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('outdent')}
                  title="Kurangi Indentasi (Shift+Tab)"
                  className="w-5.5 h-5.5 min-w-[22px] p-0.5 hover:bg-slate-200/80 hover:text-indigo-600 rounded text-slate-600 transition-colors cursor-pointer touch-manipulation flex items-center justify-center"
                >
                  <IndentDecrease className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('indent')}
                  title="Tambah Indentasi (Tab)"
                  className="w-5.5 h-5.5 min-w-[22px] p-0.5 hover:bg-slate-200/80 hover:text-indigo-600 rounded text-slate-600 transition-colors cursor-pointer touch-manipulation flex items-center justify-center"
                >
                  <IndentIncrease className="w-3 h-3" />
                </button>
              </div>

              <div className="w-px h-3 bg-slate-300 mx-0.5 shrink-0" />

              {/* Presets Penomoran Standar SPO (1., a., •) */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertCustomList('1')}
                  title="Nomor Utama (1., 2., 3...)"
                  className={`h-5.5 px-1.5 text-[10px] font-bold rounded transition-colors cursor-pointer touch-manipulation flex items-center justify-center ${activeFormatting.orderedList ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-200/80 text-indigo-700'}`}
                >
                  1.
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertCustomList('a')}
                  title="Sub-Poin Huruf (a., b., c...)"
                  className="h-5.5 px-1.5 text-[10px] font-bold rounded transition-colors cursor-pointer touch-manipulation flex items-center justify-center hover:bg-slate-200/80 text-indigo-700"
                >
                  a.
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('insertUnorderedList')}
                  title="Poin / Bullet List (•)"
                  className={`w-5.5 h-5.5 min-w-[22px] p-0.5 rounded transition-colors cursor-pointer touch-manipulation flex items-center justify-center ${activeFormatting.unorderedList ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-slate-200/80 hover:text-indigo-600 text-slate-700'}`}
                >
                  <List className="w-3 h-3 text-indigo-600" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => executeCommand('removeFormat')}
                  title="Reset Format"
                  className="w-5.5 h-5.5 min-w-[22px] p-0.5 hover:bg-rose-50 hover:text-rose-600 rounded text-slate-400 transition-colors cursor-pointer touch-manipulation flex items-center justify-center"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>

              {/* SISIPKAN GAMBAR */}
              {allowImageUpload && (
                <>
                  <div className="w-px h-3 bg-slate-300 mx-0.5 shrink-0" />
                  <div className="flex items-center shrink-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml"
                      multiple
                      onChange={handleImageFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                          fileInputRef.current.click();
                        }
                      }}
                      title="Sisipkan Gambar / Bagan (JPG, PNG, WebP)"
                      className="h-5.5 px-1.5 inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 active:scale-95 text-indigo-700 border border-indigo-200/80 rounded text-[10px] font-semibold transition-all cursor-pointer touch-manipulation"
                    >
                      <ImagePlus className="w-3 h-3 text-indigo-600" />
                      <span>Gambar</span>
                    </button>
                  </div>
                </>
              )}

              {/* TOMBOL LAYAR PENUH / FULLSCREEN FOCUS */}
              <div className="flex items-center shrink-0 ml-auto pl-1">
                <button
                  type="button"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  title={isFullscreen ? 'Keluar Layar Penuh (Esc)' : 'Mode Layar Penuh Fokus'}
                  className={`w-5.5 h-5.5 min-w-[22px] p-0.5 rounded transition-colors cursor-pointer touch-manipulation flex items-center justify-center ${
                    isFullscreen ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200/80 text-slate-600'
                  }`}
                >
                  {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* PICTURE TOOLS — Ultra-Compact & Streamlined */}
              <div className="flex items-center gap-1 w-full">
                <span
                  className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-indigo-600 text-white shrink-0"
                  title="Picture Tools Aktif"
                >
                  <ImageIcon className="w-2.5 h-2.5" />
                  <span>Foto</span>
                </span>

                <div className="w-px h-3 bg-indigo-200 mx-0.5 shrink-0" />

                {/* Alignment buttons */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (!selectedFigure) return;
                      applyFigureAlignment(selectedFigure, 'left', 'top-bottom');
                      handleInput();
                      updateFigureRect();
                    }}
                    title="Rata Kiri"
                    className={`w-5.5 h-5.5 min-w-[22px] p-0.5 rounded transition-colors cursor-pointer flex items-center justify-center ${
                      selectedFigure?.getAttribute('data-align') === 'left'
                        ? 'bg-white border border-indigo-300 text-indigo-700'
                        : 'hover:bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    <AlignLeft className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (!selectedFigure) return;
                      applyFigureAlignment(selectedFigure, 'center', 'top-bottom');
                      handleInput();
                      updateFigureRect();
                    }}
                    title="Rata Tengah"
                    className={`w-5.5 h-5.5 min-w-[22px] p-0.5 rounded transition-colors cursor-pointer flex items-center justify-center ${
                      selectedFigure?.getAttribute('data-align') === 'center' || !selectedFigure?.getAttribute('data-align')
                        ? 'bg-white border border-indigo-300 text-indigo-700'
                        : 'hover:bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    <AlignCenter className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (!selectedFigure) return;
                      applyFigureAlignment(selectedFigure, 'right', 'top-bottom');
                      handleInput();
                      updateFigureRect();
                    }}
                    title="Rata Kanan"
                    className={`w-5.5 h-5.5 min-w-[22px] p-0.5 rounded transition-colors cursor-pointer flex items-center justify-center ${
                      selectedFigure?.getAttribute('data-align') === 'right'
                        ? 'bg-white border border-indigo-300 text-indigo-700'
                        : 'hover:bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    <AlignRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="w-px h-3 bg-indigo-200 mx-0.5 shrink-0" />

                {/* Size dropdown */}
                <div className="flex items-center shrink-0">
                  <select
                    value={selectedFigure?.getAttribute('data-width') || '100%'}
                    onChange={(e) => {
                      if (!selectedFigure) return;
                      const pct = e.target.value;
                      selectedFigure.setAttribute('data-width', pct);
                      selectedFigure.style.width = pct;
                      selectedFigure.style.maxWidth = '100%';
                      selectedFigure.style.height = 'auto';
                      handleInput();
                      updateFigureRect();
                    }}
                    className="h-5.5 text-[9px] font-semibold text-slate-700 bg-white border border-slate-200 rounded px-1 py-0 focus:outline-none focus:border-indigo-400 cursor-pointer"
                    title="Ukuran Gambar"
                  >
                    <option value="25%">25%</option>
                    <option value="50%">50%</option>
                    <option value="75%">75%</option>
                    <option value="100%">100%</option>
                  </select>
                </div>

                <div className="w-px h-3 bg-indigo-200 mx-0.5 shrink-0" />

                {/* Reset & Delete */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (!selectedFigure) return;
                      selectedFigure.style.width = '';
                      selectedFigure.style.maxWidth = '100%';
                      selectedFigure.style.height = 'auto';
                      selectedFigure.style.margin = '8px auto';
                      selectedFigure.style.float = 'none';
                      selectedFigure.style.clear = 'both';
                      selectedFigure.setAttribute('data-width', '100%');
                      selectedFigure.setAttribute('data-align', 'center');
                      handleInput();
                      updateFigureRect();
                    }}
                    title="Reset Ukuran & Posisi"
                    className="w-5.5 h-5.5 min-w-[22px] p-0.5 rounded hover:bg-slate-200/80 text-slate-600 cursor-pointer flex items-center justify-center transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={deleteSelectedFigure}
                    title="Hapus Gambar"
                    className="w-5.5 h-5.5 min-w-[22px] p-0.5 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Return to Text Tools */}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => clearFigureSelection()}
                  title="Kembali ke Text Tools"
                  className="ml-auto h-5.5 px-1.5 text-[9px] font-medium inline-flex items-center gap-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0"
                >
                  <Type className="w-2.5 h-2.5" />
                  <span>Teks</span>
                </button>
              </div>
            </>
          )}
        </div>
        )}

        {/* CONTENT EDITABLE AREA */}
        <div
          ref={editorRef}
          contentEditable
          onFocus={onFocus}
          onInput={handleInput}
          onBlur={handleInput}
          onKeyDown={handleEditorKeyDown}
          onKeyUp={updateActiveFormatting}
          onMouseUp={updateActiveFormatting}
          onPaste={handleEditorPaste}
          onDragOver={handleEditorDragOver}
          onDragLeave={handleEditorDragLeave}
          onDrop={handleEditorDrop}
          style={{ minHeight }}
          data-placeholder={placeholder}
          className={`rich-text-editor-content p-2 sm:p-2.5 text-xs sm:text-[13px] text-slate-900 focus:outline-none font-bookman leading-normal empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none [word-break:normal] [overflow-wrap:break-word] [word-wrap:break-word] [hyphens:none] ${isFullscreen ? "flex-1 min-h-0" : ""}`}
        />

        {/* DRAG-AND-DROP FILE OVERLAY */}
        {isDraggingFileOver && (
          <div className="absolute inset-0 bg-blue-50/90 border-2 border-dashed border-blue-500 rounded-lg flex flex-col items-center justify-center z-40 pointer-events-none animate-fadeIn">
            <div className="bg-white p-3 rounded-full shadow-lg text-blue-600 mb-2">
              <ImagePlus className="w-8 h-8" />
            </div>
            <p className="font-bold text-sm text-blue-900">Lepaskan file gambar di sini</p>
            <p className="text-xs text-blue-600">Format PNG, JPG, WebP, SVG (Maks. 1 MB per gambar)</p>
          </div>
        )}

        {/* SIMPLE IMAGE SELECTION + RESIZE: drag sudut untuk mengubah ukuran */}
        {selectedFigure && figureRect && (
          <div
            className="figure-control-overlay pointer-events-none absolute z-40 border border-indigo-500"
            style={{
              top: `${figureRect.top}px`,
              left: `${figureRect.left}px`,
              width: `${figureRect.width}px`,
              height: `${figureRect.height}px`,
            }}
          >
            {(['nw', 'ne', 'sw', 'se'] as const).map((dir) => {
              const positionClass = {
                nw: '-left-1.5 -top-1.5 cursor-nwse-resize',
                ne: '-right-1.5 -top-1.5 cursor-nesw-resize',
                sw: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
                se: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
              }[dir];
              return (
                <div
                  key={dir}
                  onPointerDown={(e) => handleResizeStart(e, dir)}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeEnd}
                  onPointerCancel={handleResizeEnd}
                  title="Ubah ukuran gambar"
                  className={`pointer-events-auto absolute h-3 w-3 rounded-full border border-indigo-600 bg-white shadow-sm ${positionClass}`}
                />
              );
            })}
          </div>
        )}

        {/* PRECISION DROP TARGET INDICATOR LINE */}
        {dropIndicator && (
          <div
            style={{
              position: 'absolute',
              top: `${dropIndicator.y}px`,
              left: `${dropIndicator.x}px`,
              width: `${dropIndicator.width}px`,
              height: `${dropIndicator.height}px`,
              backgroundColor: '#2563eb',
              borderRadius: '2px',
              boxShadow: '0 0 10px rgba(37, 99, 235, 0.8), 0 0 4px #2563eb',
              pointerEvents: 'none',
              zIndex: 40,
            }}
          />
        )}
      </div>
    </div>
  );
};
