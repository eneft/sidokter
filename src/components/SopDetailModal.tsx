import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Printer, 
  Download, 
  FileText, 
  Calendar, 
  User, 
  Building2, 
  ShieldCheck, 
  History, 
  Edit3, 
  Tag, 
  Share2, 
  Clock, 
  FolderArchive,
  FileCheck2,
  AlertCircle,
  Eye,
  ExternalLink,
  Trash2,
  RefreshCw,
  Stamp,
  Lock,
  Loader2,
  Maximize2,
  BookOpen,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { SopDocument, SopStatus, UserSession, getStandardJenisSpo } from '../types';
import { formatBytes } from '../utils/numbering';
import { SOEGIRI_HOSPITAL_INFO, isSopAccessibleByUser } from '../utils/soegiriStructure';
import { HospitalLogo } from './HospitalLogo';
import { DirectorSignature } from './DirectorSignature';
import { triggerFileDownload, openDocumentPreview, getFileFromLocalCache, getFileFromPersistentCacheAsync } from '../utils/fileStorage';
import { RichTextRenderer, hasHtmlTags, cleanSopRichContent } from './RichTextRenderer';
import { getPersistedClientSession } from '../lib/authService';
import { DocumentViewer } from './DocumentViewer';
import { shouldShowSignatureAndStamp, isPdfSopDocument } from '../utils/documentUtils';

interface SopDetailModalProps {
  isOpen: boolean;
  sop: SopDocument | null;
  onClose: () => void;
  onEdit: (sop: SopDocument) => void;
  onDelete?: (sop: SopDocument) => void;
  onUpdateStatus: (id: string, newStatus: SopStatus) => void;
  onCopyNumber: (num: string) => void;
  onActivateSop?: (sop: SopDocument) => void;
  userSession?: UserSession | null;
}

type OfficialBlock = {
  id: string;
  section: 'PENGERTIAN' | 'TUJUAN' | 'KEBIJAKAN' | 'PROSEDUR' | 'ALUR / BAGAN ALIR' | 'UNIT TERKAIT';
  html: string;
  /** True when this fragment is only the visual continuation of the same list item. */
  listItemContinuation?: boolean;
  /** Stable identity for a logical top-level list across pagination fragments/pages. */
  logicalListGroup?: string;
};

export const SopDetailModal: React.FC<SopDetailModalProps> = ({
  isOpen,
  sop,
  onClose,
  onEdit,
  onDelete,
  onUpdateStatus,
  onCopyNumber,
  onActivateSop,
  userSession
}) => {
  const [copied, setCopied] = useState(false);
  const [isFullscreenDocOpen, setIsFullscreenDocOpen] = useState(false);
  const [officialPages, setOfficialPages] = useState<OfficialBlock[][]>([]);
  const [layoutBlocks, setLayoutBlocks] = useState<OfficialBlock[]>([]);
  const [isPaginatingOfficial, setIsPaginatingOfficial] = useState(false);
  const measureRootRef = useRef<HTMLDivElement | null>(null);
  const modalBodyRef = useRef<HTMLDivElement | null>(null);

  // Mobile optimization states
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });
  const [mobileViewMode, setMobileViewMode] = useState<'a4' | 'reader'>('a4');
  const [zoomScale, setZoomScale] = useState<number | 'fit'>('fit');
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [activeReaderSectionId, setActiveReaderSectionId] = useState<string>('reader-pengertian');
  const [activePageNumber, setActivePageNumber] = useState<number>(1);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  // Track window resize and container width for dynamic responsive scaling
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!modalBodyRef.current) return;
    const updateWidth = () => {
      if (modalBodyRef.current) {
        setContainerWidth(modalBodyRef.current.clientWidth || 800);
      }
    };
    updateWidth();
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(modalBodyRef.current);
    return () => ro.disconnect();
  }, [isOpen]);

  // Check if document is a review or legacy document
  const isReviewDoc = Boolean(
    sop && (
      sop.jenis_spo === 'RIVIU' ||
      sop.documentType === 'REVIEW' ||
      sop.documentType === 'RIVIU' ||
      sop.isReviewDocument ||
      getStandardJenisSpo(sop) === 'RIVIU'
    )
  );
  const isExisting = Boolean(
    sop &&
    !isReviewDoc &&
    (
      sop.jenis_spo === 'EKSISTING' ||
      sop.documentType === 'LAMA' ||
      sop.documentType === 'EKSISTING' ||
      sop.isLegacySop ||
      // A new-format Existing replacement keeps documentType=BARU,
      // but must still preview the uploaded Existing PDF.
      sop.isExistingReplacement
    )
  );

  // Existing documents (including new-format Draft replacements) must render
  // the uploaded PDF, never the generated A4 template.
  const isLegacy = Boolean(
    sop &&
    !isReviewDoc &&
    (
      isExisting ||
      (sop.effectiveDate && new Date(sop.effectiveDate).getFullYear() < 2026)
    )
  );

  // Preview selalu menggunakan Format Baku SPO A4. Mode Ringkas dinonaktifkan.
  const activeTab = 'official_format' as const;

  // Retrieve actual uploaded file (supports oldFileDataUrl, fileDataUrl, signedScanDataUrl, or persistent local cache)
  const [resolvedLegacyFileUrl, setResolvedLegacyFileUrl] = useState<string | null>(null);
  const [isLoadingLegacyFile, setIsLoadingLegacyFile] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;

    if (!sop) {
      setResolvedLegacyFileUrl(null);
      setIsLoadingLegacyFile(false);
      return;
    }

    // 1. Direct object or synchronous cache properties
    const directUrl =
      sop.fileDataUrl ||
      sop.signedScanDataUrl ||
      sop.oldFileDataUrl ||
      getFileFromLocalCache(sop.id, 'file') ||
      getFileFromLocalCache(sop.id, 'signedScan') ||
      getFileFromLocalCache(sop.id, 'oldFile');

    if (directUrl) {
      setResolvedLegacyFileUrl(directUrl);
      setIsLoadingLegacyFile(false);
      return;
    }

    // 2. Fetch asynchronously from IndexedDB
    setIsLoadingLegacyFile(true);
    const loadFromIdb = async () => {
      try {
        const file1 = await getFileFromPersistentCacheAsync(sop.id, 'file');
        if (file1 && !isCancelled) {
          setResolvedLegacyFileUrl(file1);
          setIsLoadingLegacyFile(false);
          return;
        }
        const file2 = await getFileFromPersistentCacheAsync(sop.id, 'signedScan');
        if (file2 && !isCancelled) {
          setResolvedLegacyFileUrl(file2);
          setIsLoadingLegacyFile(false);
          return;
        }
        const file3 = await getFileFromPersistentCacheAsync(sop.id, 'oldFile');
        if (file3 && !isCancelled) {
          setResolvedLegacyFileUrl(file3);
          setIsLoadingLegacyFile(false);
          return;
        }
      } catch (err) {
        console.warn('Could not load persistent cache for SOP file:', err);
      }
      if (!isCancelled) {
        setResolvedLegacyFileUrl(null);
        setIsLoadingLegacyFile(false);
      }
    };

    loadFromIdb();

    return () => {
      isCancelled = true;
    };
  }, [sop?.id, sop?.fileDataUrl, sop?.signedScanDataUrl, sop?.oldFileDataUrl, isOpen]);

  const legacyFileUrl = resolvedLegacyFileUrl || (sop ? (sop.signedScanDataUrl || sop.fileDataUrl || sop.oldFileDataUrl || getFileFromLocalCache(sop.id, 'file') || getFileFromLocalCache(sop.id, 'signedScan') || getFileFromLocalCache(sop.id, 'oldFile')) : null);
  const legacyFileName = sop ? (sop.signedScanFileName || sop.fileName || sop.oldFileName || 'Dokumen_SPO_Eksisting.pdf') : 'Dokumen_SPO_Eksisting.pdf';
  const legacyFileSize = sop ? (sop.signedScanFileSize || sop.fileSize || sop.oldFileSize) : undefined;

  // Review evidence attachment handlers
  const handleDownloadReviewEvidence = async () => {
    if (!sop) return;
    try {
      let fileUrl = sop.oldFileDataUrl || getFileFromLocalCache(sop.id, 'oldFile');
      if (!fileUrl) {
        fileUrl = await getFileFromPersistentCacheAsync(sop.id, 'oldFile');
      }
      const safeNum = (sop.oldSopNumber || sop.sopNumber || 'SPO').replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
      const fileName = sop.oldFileName || `Bukti_Riviu_${safeNum}.pdf`;

      if (fileUrl) {
        triggerFileDownload(fileUrl, fileName);
      } else {
        alert(`Berkas bukti fisik riviu (${fileName}) tidak dapat dimuat atau belum tersimpan.`);
      }
    } catch (err: any) {
      console.error('Error downloading review file:', err);
      alert('Gagal mengunduh berkas bukti riviu: ' + (err?.message || 'Terjadi kesalahan'));
    }
  };


  const cleanText = (htmlOrText: string) => (htmlOrText || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const hasAlur = Boolean(sop?.alur && cleanText(sop.alur).length > 0);

  // ============================================================
  // OFFICIAL SPO PRINT LAYOUT — CONTINUOUS A4 FLOW
  // ============================================================
  // ATURAN UTAMA BATANG TUBUH:
  // 1. A4 selalu memiliki area aman 10 mm di keempat sisi.
  // 2. Tidak boleh ada isi yang melewati area aman/margin bawah.
  // 3. Setiap paragraf, langkah prosedur, dan item daftar adalah unit flow.
  // 4. Jika unit tidak cukup di sisa halaman saat ini, unit dipindahkan utuh
  //    ke halaman berikutnya; unit berikutnya tetap meneruskan flow.
  // 5. Jika satu unit sendiri lebih tinggi dari satu halaman isi, unit dipecah
  //    ke child/list item yang lebih kecil sebelum pagination.
  // 6. Kop dokumen diulang pada setiap halaman. Baris tanggal/pengesahan hanya
  //    berada di halaman 1. Tidak ada page-break buatan di antara batang tubuh.
  //
  // Dengan model ini PENGERTIAN → TUJUAN → KEBIJAKAN → PROSEDUR → ALUR →
  // UNIT TERKAIT mengalir terus dari halaman ke halaman sesuai ruang A4 nyata.

  // Split rich-text into safe visual flow units.
  // Kept for legacy content normalization. Visible preview pagination is
  // grouped back into one section row, so numbered procedures remain visually
  // identical to the editor and do not acquire horizontal rules between items.
  const extractProcedureBlocks = (html: string): string[] => {
    const source = html || '';
    if (!source.trim()) return [];

    // Plain text format with numbered lines: convert early to semantic <ol>
    // so splitHtmlForCapacity can measure and split list items cleanly across pages.
    if (!hasHtmlTags(source)) {
      const lines = source.split(/\r?\n/);
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

        const startAttrStr = isOrdered && firstStartNumber && firstStartNumber > 1 ? ` start="${firstStartNumber}"` : '';
        const listHtml = isOrdered
          ? `<ol type="${listType}"${startAttrStr}>${listItems.join('')}</ol>`
          : `<ul>${listItems.join('')}</ul>`;
        return [listHtml];
      }
      return [source];
    }

    if (typeof DOMParser === 'undefined') return [source];

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(source, 'text/html');
      const blocks: string[] = [];
      let inlineBuffer = '';

      const pushInlineBuffer = () => {
        if (inlineBuffer.trim()) {
          blocks.push(inlineBuffer);
        }
        inlineBuffer = '';
      };

      Array.from(doc.body.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          if ((node.textContent || '').length > 0) inlineBuffer += node.textContent || '';
          return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as Element;
        const tag = el.tagName.toLowerCase();

        if (/^(ol|ul)$/i.test(tag)) {
          pushInlineBuffer();
          const items = Array.from(el.children).filter(
            (child) => child.tagName.toLowerCase() === 'li'
          ) as HTMLElement[];

          if (items.length > 0) {
            // IMPORTANT: keep ONE logical list as ONE flow unit.
            // Splitting every <li> into a separate block destroys the list
            // hierarchy at pagination boundaries and makes a new page look
            // like a new list that starts again at 1. The pagination engine
            // below is responsible for splitting a long list only when the
            // actual A4 capacity requires it, while carrying the list start
            // number forward.
            blocks.push(el.outerHTML);
          } else {
            blocks.push(el.outerHTML);
          }
          return;
        }

        if (/^(table|img|figure|blockquote|pre|h1|h2|h3|h4|h5|h6|section|article)$/i.test(tag)) {
          pushInlineBuffer();
          blocks.push(el.outerHTML);
        } else if (tag === 'p') {
          pushInlineBuffer();
          const innerHtml = el.innerHTML;
          // If paragraph has double line breaks, split into paragraphs
          if (/<br\s*\/?>\s*<br\s*\/?>/i.test(innerHtml)) {
            const parts = innerHtml.split(/<br\s*\/?>\s*<br\s*\/?>/i);
            parts.forEach((part) => {
              if (part.trim()) {
                blocks.push(`<p>${part.trim()}</p>`);
              }
            });
          } else {
            blocks.push(el.outerHTML);
          }
        } else if (tag === 'div') {
          const childNodes = Array.from(el.childNodes);
          const blockChildren = childNodes.filter((child) =>
            child.nodeType === Node.ELEMENT_NODE &&
            /^(p|ol|ul|table|blockquote|pre|h1|h2|h3|h4|h5|h6|section|article|div)$/i.test((child as Element).tagName)
          ) as Element[];
          const hasMeaningfulDirectText = childNodes.some((child) =>
            child.nodeType === Node.TEXT_NODE && Boolean((child.textContent || '').trim())
          );

          if (blockChildren.length >= 1 && !hasMeaningfulDirectText) {
            pushInlineBuffer();
            blockChildren.forEach((child) => {
              const childTag = child.tagName.toLowerCase();
              if (/^(ol|ul)$/i.test(childTag)) {
                // Keep nested/top-level lists intact as one logical hierarchy.
                // Do NOT turn each <li> into a separate flow block.
                blocks.push(child.outerHTML);
              } else {
                blocks.push(child.outerHTML);
              }
            });
          } else {
            pushInlineBuffer();
            blocks.push(el.outerHTML);
          }
        } else {
          inlineBuffer += el.outerHTML;
        }
      });

      pushInlineBuffer();

      const meaningfulBlocks = blocks.filter((block) => {
        if (!block || !block.trim()) return false;
        try {
          const check = parser.parseFromString(block, 'text/html');
          const body = check.body;
          const hasMediaOrTable = Boolean(body.querySelector('img,svg,table,figure,iframe'));
          const text = (body.textContent || '').replace(/\u00a0/g, ' ').trim();
          return hasMediaOrTable || text.length > 0;
        } catch {
          return Boolean(block.trim());
        }
      });

      return meaningfulBlocks.length ? meaningfulBlocks : [];
    } catch (error) {
      console.warn('Gagal memecah blok rich-text:', error);
      return [source];
    }
  };
  const officialPengertianHtml = (sop?.pengertian || sop?.summary || '').trim();
  const officialTujuanHtml = (sop?.tujuan || '').trim();
  const officialKebijakanHtml = (sop?.kebijakan || 'SK Direktur RSUD Dr. Soegiri Lamongan Nomor 188/SPO/DIR/2026').trim();
  const officialProcedureHtml = (sop?.prosedur || '').trim();
  const officialAlurHtml = (sop?.alur || '').trim();
  const officialUnitHtml = (sop?.unitTerkait || (sop?.divisionName ? `${sop.divisionName}${sop.categoryName ? `, ${sop.categoryName}` : ''}` : '')).trim();

  const sectionsData = [
    { id: 'pengertian', section: 'PENGERTIAN' as const, html: officialPengertianHtml },
    { id: 'tujuan', section: 'TUJUAN' as const, html: officialTujuanHtml },
    { id: 'kebijakan', section: 'KEBIJAKAN' as const, html: officialKebijakanHtml },
    { id: 'prosedur', section: 'PROSEDUR' as const, html: officialProcedureHtml },
    { id: 'alur', section: 'ALUR / BAGAN ALIR' as const, html: officialAlurHtml },
    { id: 'unit-terkait', section: 'UNIT TERKAIT' as const, html: officialUnitHtml }
  ];

  // Decompose each section into granular flow units (paragraphs, list items, tables)
  // so pagination can pack and fill all remaining A4 space before creating a new page.
  const officialBlocks: OfficialBlock[] = sectionsData
    .filter((sec) => sec.html.trim().length > 0)
    .flatMap((sec) => {
      const units = extractProcedureBlocks(sec.html);
      return units.map((unitHtml, unitIdx) => {
        let logicalListGroup: string | undefined;
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(unitHtml, 'text/html');
          const first = doc.body.firstElementChild;
          if (first && /^(ol|ul)$/i.test(first.tagName)) {
            // unitIdx is stable for the source document. Pagination may clone this
            // block many times, but the logical list identity must remain identical.
            logicalListGroup = `${sec.id}-logical-list-${unitIdx}`;
          }
        } catch {
          // Keep non-list blocks unchanged.
        }
        return {
          id: units.length <= 1 ? sec.id : `${sec.id}-${unitIdx}`,
          section: sec.section,
          html: unitHtml,
          logicalListGroup
        };
      });
    });

  // Reset the flow model whenever the source SPO changes.  The pagination
  // engine works only from these blocks, so no content is ever discarded.
  useEffect(() => {
    if (!isOpen || !sop || activeTab !== 'official_format') {
      setLayoutBlocks([]);
      setOfficialPages([]);
      return;
    }
    setLayoutBlocks(officialBlocks);
  }, [
    isOpen,
    activeTab,
    sop?.id,
    sop?.pengertian,
    sop?.summary,
    sop?.tujuan,
    sop?.kebijakan,
    sop?.prosedur,
    sop?.alur,
    sop?.unitTerkait,
    sop?.divisionName,
    sop?.categoryName
  ]);

  // Give every top-level ordered/unordered list a stable logical identity.
  // A page break must never create a new logical list. These attributes travel
  // with every fragment produced by splitHtmlForCapacity(), allowing numbering
  // state to continue across A4 pages.
  const annotateLogicalLists = (html: string, blockId: string): string => {
    if (!html || typeof DOMParser === 'undefined') return html;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const topLevelLists = Array.from(doc.body.querySelectorAll('ol, ul')).filter((list) => {
        let parent = list.parentElement;
        while (parent && parent !== doc.body) {
          const tag = parent.tagName.toLowerCase();
          if (tag === 'ol' || tag === 'ul') return false;
          parent = parent.parentElement;
        }
        return true;
      });

      topLevelLists.forEach((list, index) => {
        if (!list.hasAttribute('data-sop-list-group')) {
          list.setAttribute('data-sop-list-group', `${blockId}-list-${index}`);
        }
      });

      return doc.body.innerHTML;
    } catch {
      return html;
    }
  };

  // Unlimited A4 pagination.  We paginate the exact rows rendered in the
  // hidden measurement table, with a small safety allowance so the visible
  // preview never clips the bottom border of a page.
  useEffect(() => {
    if (!isOpen || !sop || activeTab !== 'official_format' || layoutBlocks.length === 0) return;

    let cancelled = false;

    const run = async () => {
      setIsPaginatingOfficial(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        if (document.fonts?.ready) await document.fonts.ready;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const root = measureRootRef.current;
        if (!root) return;

        // Preserve the original logical-list identity throughout the entire
        // pagination pass. The measured DOM does not need these attributes;
        // they are only used by the flow/pagination model.
        const flowLayoutBlocks: OfficialBlock[] = layoutBlocks.map((block) => ({
          ...block,
          html: annotateLogicalLists(
            block.html,
            block.logicalListGroup || block.id
          )
        }));

        const page = root.querySelector<HTMLElement>('[data-measure-page]');
        const header = root.querySelector<HTMLElement>('[data-measure-header]');
        const publication = root.querySelector<HTMLElement>('[data-measure-publication]');
        const table = root.querySelector<HTMLTableElement>('[data-measure-table]');
        const measured = Array.from(root.querySelectorAll('[data-measure-block-row]')) as HTMLElement[];

        if (!page || !header || !publication || !table || measured.length !== layoutBlocks.length) return;

        const pageHeight = page.getBoundingClientRect().height;
        const pageStyle = getComputedStyle(page);
        const availableHeight =
          pageHeight -
          parseFloat(pageStyle.paddingTop || '0') -
          parseFloat(pageStyle.paddingBottom || '0');

        const headerHeight = header.getBoundingClientRect().height;
        const publicationHeight = publication.getBoundingClientRect().height;
        // Optimal safety buffer (16px) guarantees that table cells and padding
        // never overflow past the 10mm A4 boundary while maximizing printable space.
        const safety = 16;
        const bodyCapacity = Math.max(1, availableHeight - headerHeight - safety);
        const firstCapacity = Math.max(1, bodyCapacity - publicationHeight);
        const normalCapacity = bodyCapacity;

        const measuredContent = measured.map((row) =>
          row.querySelector<HTMLElement>('[data-measure-content]')
        );
        const contentHeights = measured.map((row, index) => {
          const content = measuredContent[index];
          return Math.max(0, (content || row).getBoundingClientRect().height);
        });

        // Chrome = border + cell padding + the left section-label cell's minimum height.
        const rowChrome = measured.map((row, index) => {
          const content = contentHeights[index];
          const full = row.getBoundingClientRect().height;
          return Math.max(0, full - content);
        });

        const sectionChrome = (section: OfficialBlock['section'], index: number) => {
          const base = rowChrome[index] || 0;
          let maxChrome = base;
          flowLayoutBlocks.forEach((block, i) => {
            if (block.section === section) maxChrome = Math.max(maxChrome, rowChrome[i] || 0);
          });
          return maxChrome || 24;
        };

        const createMeasureHost = (template: HTMLElement | null): HTMLElement => {
          const host = document.createElement('div');
          host.style.position = 'absolute';
          host.style.visibility = 'hidden';
          host.style.pointerEvents = 'none';
          host.style.height = 'auto';
          host.style.maxHeight = 'none';
          host.style.overflow = 'visible';
          host.style.boxSizing = 'border-box';
          host.style.fontFamily = 'Bookman Old Style, Bookman, Georgia, serif';
          host.style.fontSize = '12pt';
          host.style.lineHeight = '1.5';
          host.style.width = template ? `${template.getBoundingClientRect().width || 480}px` : '480px';
          host.className = 'font-bookman text-black rich-text-output rich-text-document-content break-words [overflow-wrap:break-word] [word-break:normal] [hyphens:none]';
          if (template?.parentElement) {
            template.parentElement.appendChild(host);
          } else {
            document.body.appendChild(host);
          }
          return host;
        };

        // Preserve the identity of the logical list across every pagination fragment.
        // A visual page fragment is never allowed to become a new numbering sequence.
        const forceLogicalListMetadata = (html: string, block: OfficialBlock): string => {
          if (!html || typeof DOMParser === 'undefined') return html;
          const group = block.logicalListGroup || `${block.section}-logical-list-${block.id}`;
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const lists = Array.from(doc.body.querySelectorAll('ol, ul')).filter((list) => {
              let parent = list.parentElement;
              while (parent && parent !== doc.body) {
                const tag = parent.tagName.toLowerCase();
                if (tag === 'ol' || tag === 'ul') return false;
                parent = parent.parentElement;
              }
              return true;
            });
            lists.forEach((list, index) => {
              if (!list.getAttribute('data-sop-list-group')) {
                list.setAttribute('data-sop-list-group', `${group}-${index}`);
              }
            });
            return doc.body.innerHTML;
          } catch {
            return html;
          }
        };

        // Split a rich-text block to fit a specific amount of remaining A4 space.
        /**
         * Split an oversized rich-text element by word boundaries WITHOUT using
         * textContent() as the source of the rendered fragment. Range.cloneContents()
         * keeps the original inline/block markup, attributes and nested formatting.
         * This helper is page-agnostic: it is invoked whenever the current page has
         * insufficient capacity, regardless of whether the break happens on page 2,
         * 3, 4, or any later page.
         */
        const splitElementPreservingMarkup = (
          element: HTMLElement,
          maxHeight: number,
          buildWrapper: (fragment: DocumentFragment, isFirstChunk: boolean) => string,
          template: HTMLElement | null
        ): string[] => {
          const textNodes: Text[] = [];
          const ownerDocument = element.ownerDocument || document;
          const walker = ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          let currentNode: Node | null = walker.nextNode();
          while (currentNode) {
            const textNode = currentNode as Text;
            if ((textNode.textContent || '').trim()) textNodes.push(textNode);
            currentNode = walker.nextNode();
          }

          type WordRange = { node: Text; start: number; end: number };
          const words: WordRange[] = [];
          textNodes.forEach((node) => {
            const value = node.textContent || '';
            const re = /\S+/g;
            let match: RegExpExecArray | null;
            while ((match = re.exec(value)) !== null) {
              words.push({ node, start: match.index, end: match.index + match[0].length });
            }
          });

          if (!words.length) return [element.outerHTML];

          const host = createMeasureHost(template);
          const safetyLimit = Math.max(1, maxHeight - 4);
          const buildCandidate = (startWord: number, endWord: number): string => {
            const range = ownerDocument.createRange();
            range.setStart(words[startWord].node, words[startWord].start);
            range.setEnd(words[endWord - 1].node, words[endWord - 1].end);
            const fragment = range.cloneContents();
            return buildWrapper(fragment, startWord === 0);
          };
          const fits = (candidate: string) => {
            host.innerHTML = candidate;
            return host.getBoundingClientRect().height <= safetyLimit;
          };

          const chunks: string[] = [];
          let startWord = 0;
          while (startWord < words.length) {
            let low = startWord + 1;
            let high = words.length;
            let best = startWord;

            while (low <= high) {
              const mid = Math.floor((low + high) / 2);
              const candidate = buildCandidate(startWord, mid);
              if (fits(candidate)) {
                best = mid;
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }

            // A single word can be wider/taller than the available area. Keep it
            // intact rather than producing an empty fragment or dropping content.
            if (best === startWord) best = startWord + 1;

            chunks.push(buildCandidate(startWord, best));
            startWord = best;
          }

          host.remove();
          return chunks.length > 1 ? chunks : [element.outerHTML];
        };

        // Split a rich-text block to fit a specific amount of remaining A4 space.
        // Page numbers are deliberately NOT referenced here. The same splitter is
        // used for every page boundary detected by the flow paginator.
        const splitHtmlForCapacity = (
          html: string,
          maxHeight: number,
          template: HTMLElement | null
        ): string[] => {
          const source = (html || '').trim();
          if (!source || maxHeight <= 0 || typeof DOMParser === 'undefined') return [source];

          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(source, 'text/html');
            const topLevelNodes = Array.from(doc.body.childNodes);
            const hasTopLevelText = topLevelNodes.some((node) =>
              node.nodeType === Node.TEXT_NODE && Boolean((node.textContent || '').trim())
            );
            const elements = Array.from(doc.body.children) as HTMLElement[];
            const first = elements[0];
            if (!first) return [source];

            const safetyLimit = Math.max(1, maxHeight - 4);
            const host = createMeasureHost(template);
            const fits = (candidate: string) => {
              host.innerHTML = candidate;
              return host.getBoundingClientRect().height <= safetyLimit;
            };

            // Multiple independent top-level blocks are already safe page units.
            if (elements.length > 1 && !hasTopLevelText) {
              host.remove();
              return elements.map((el) => el.outerHTML).filter(Boolean);
            }

            // Ordered/unordered lists: keep the actual list structure. Only split
            // between items or, when one item itself is too tall, inside that LI
            // while preserving its markup via Range.cloneContents().
            if (/^(ol|ul)$/i.test(first.tagName)) {
              const isOl = first.tagName.toLowerCase() === 'ol';
              const explicitStart = isOl
                ? (parseInt(first.getAttribute('start') || '1', 10) || 1)
                : 1;
              const items = Array.from(first.children).filter((el) =>
                el.tagName.toLowerCase() === 'li'
              ) as HTMLElement[];

              const listTag = first.tagName.toLowerCase();
              const listAttrs = Array.from(first.attributes)
                .filter((attr) => !(isOl && attr.name.toLowerCase() === 'start'))
                .map((attr) => ` ${attr.name}="${attr.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
                .join('');

              const makeList = (itemHtmls: string[], startIndex: number, continuation = false, continuationNumber?: number) =>
                `<${listTag}${listAttrs}${isOl ? ` start="${continuationNumber ?? (explicitStart + startIndex)}"` : ''}${continuation ? ` data-sop-list-continuation="true" data-sop-continuation-number="${continuationNumber ?? (explicitStart + startIndex)}"` : ''}>${itemHtmls.join('')}</${listTag}>`;

              if (items.length > 0) {
                const fullList = first.outerHTML;
                if (fits(fullList)) {
                  host.remove();
                  return [source];
                }

                const fragments: string[] = [];
                let currentItems: string[] = [];
                let currentStartIndex = 0;

                const flush = () => {
                  if (currentItems.length) {
                    fragments.push(makeList(currentItems, currentStartIndex));
                    currentItems = [];
                  }
                };

                items.forEach((item, itemIndex) => {
                  const candidateItem = item.outerHTML;
                  const candidateList = makeList([...currentItems, candidateItem], currentStartIndex);

                  if (fits(candidateList)) {
                    if (!currentItems.length) currentStartIndex = itemIndex;
                    currentItems.push(candidateItem);
                    return;
                  }

                  flush();
                  const singleList = makeList([candidateItem], itemIndex);
                  if (fits(singleList)) {
                    currentStartIndex = itemIndex;
                    currentItems = [candidateItem];
                    return;
                  }

                  // The individual LI is taller than the remaining page. Split
                  // its words without flattening inline markup, nested paragraphs,
                  // emphasis, links, etc.
                  const itemNumber = explicitStart + itemIndex;
                  const itemParts = splitElementPreservingMarkup(
                    item,
                    maxHeight,
                    (fragment, isFirstChunk) => {
                      const li = item.cloneNode(false) as HTMLElement;
                      li.removeAttribute('id');
                      li.innerHTML = '';
                      li.appendChild(fragment);
                      return makeList(
                        [li.outerHTML],
                        itemIndex,
                        !isFirstChunk,
                        itemNumber
                      );
                    },
                    template
                  );

                  itemParts.forEach((part) => fragments.push(part));
                });

                flush();
                host.remove();
                return fragments.length > 1 ? fragments : (fragments.length === 1 ? fragments : [source]);
              }
            }

            // A wrapper containing multiple real block elements must retain those
            // elements. Never convert a mixed <p>/<ul>/<p> structure to plain text.
            const nestedBlockElements = Array.from(first.children).filter((child) =>
              /^(p|ol|ul|table|blockquote|pre|h1|h2|h3|h4|h5|h6|section|article|div|figure)$/i.test(child.tagName)
            ) as HTMLElement[];

            if (nestedBlockElements.length > 0) {
              const preservedParts: string[] = [];
              let inlineBuffer = '';

              const flushInlineBuffer = () => {
                if (inlineBuffer.trim()) preservedParts.push(`<p>${inlineBuffer}</p>`);
                inlineBuffer = '';
              };

              Array.from(first.childNodes).forEach((child) => {
                if (child.nodeType === Node.TEXT_NODE) {
                  inlineBuffer += child.textContent || '';
                  return;
                }
                if (child.nodeType !== Node.ELEMENT_NODE) return;
                const childEl = child as HTMLElement;
                if (/^(p|ol|ul|table|blockquote|pre|h1|h2|h3|h4|h5|h6|section|article|div|figure)$/i.test(childEl.tagName)) {
                  flushInlineBuffer();
                  preservedParts.push(childEl.outerHTML);
                } else {
                  inlineBuffer += childEl.outerHTML;
                }
              });
              flushInlineBuffer();

              host.remove();
              return preservedParts.length > 1 ? preservedParts : (preservedParts.length === 1 ? preservedParts : [source]);
            }

            // Last-resort oversized single element. Even here, preserve the
            // element's markup instead of rebuilding it from textContent().
            if (!fits(source)) {
              const wrapperTag = first.tagName.toLowerCase();
              const attrs = Array.from(first.attributes)
                .map((attr) => ` ${attr.name}="${attr.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
                .join('');
              const parts = splitElementPreservingMarkup(
                first,
                maxHeight,
                (fragment) => `<${wrapperTag}${attrs}>${Array.from(fragment.childNodes).map((node) => (node as HTMLElement).outerHTML || node.textContent || '').join('')}</${wrapperTag}>`,
                template
              );
              host.remove();
              return parts;
            }

            host.remove();
            return [source];
          } catch (error) {
            console.warn('Gagal memecah blok SPO berdasarkan ruang A4:', error);
            return [source];
          }
        };

        // First normalize blocks that exceed a full printable body.
        const oversized = contentHeights.some((h, i) => {
          const capacity = normalCapacity - sectionChrome(flowLayoutBlocks[i].section, i);
          return h > Math.max(1, capacity);
        });

        if (oversized) {
          const expanded: OfficialBlock[] = [];
          let changed = false;

          flowLayoutBlocks.forEach((block, index) => {
            const capacityForBlock = normalCapacity - sectionChrome(block.section, index);
            if (contentHeights[index] > Math.max(1, capacityForBlock)) {
              const parts = splitHtmlForCapacity(
                block.html,
                Math.max(1, capacityForBlock),
                measuredContent[index] || null
              );
              if (parts.length > 1) {
                changed = true;
                parts.forEach((html, partIndex) => {
                  expanded.push({
                    ...block,
                    id: `${block.id}-flow-${partIndex}`,
                    html: forceLogicalListMetadata(html, block)
                  });
                });
              } else {
                expanded.push(block);
              }
            } else {
              expanded.push(block);
            }
          });

          if (changed && !cancelled) {
            setLayoutBlocks(expanded);
            setOfficialPages([]);
            return;
          }
        }

        // FLOW PAGINATION:
        const pages: OfficialBlock[][] = [];
        const flowBlocks: OfficialBlock[] = [...flowLayoutBlocks];
        const flowHeights: number[] = [...contentHeights];
        const chromeBySection = (section: OfficialBlock['section']) => {
          let maxChrome = 0;
          flowLayoutBlocks.forEach((candidate, candidateIndex) => {
            if (candidate.section === section) {
              maxChrome = Math.max(maxChrome, rowChrome[candidateIndex] || 0);
            }
          });
          return maxChrome || 24;
        };

        let currentPageBlocks: OfficialBlock[] = [];
        let used = 0;
        let capacity = firstCapacity;
        let currentSection: OfficialBlock['section'] | null = null;
        let detectedPageBreaks = 0;

        // One and only one transition point for a natural A4 page break. The
        // paginator never knows or cares whether this is page 2, 3, 4, etc.;
        // every page uses the exact same reset rules.
        const commitCurrentPageAndStartNext = () => {
          if (currentPageBlocks.length) {
            pages.push(currentPageBlocks);
            detectedPageBreaks += 1;
          }
          currentPageBlocks = [];
          used = 0;
          capacity = normalCapacity;
          currentSection = null;
        };

        const measureFlowPart = (html: string, template: HTMLElement | null): number => {
          if (!html) return 0;
          const host = createMeasureHost(template);
          host.innerHTML = html;
          const height = host.getBoundingClientRect().height;
          host.remove();
          return Math.max(0, height);
        };

        let index = 0;
        let guard = 0;
        while (index < flowBlocks.length && guard < 10000) {
          guard += 1;
          const block = flowBlocks[index];
          const startsNewSectionRow = currentPageBlocks.length === 0 || block.section !== currentSection;
          // A continuation fragment of the same section is rendered inside the
          // SAME table row/cell. Therefore it has no additional row chrome.
          // Only the first fragment of a section pays the table border/padding.
          const chrome = startsNewSectionRow ? chromeBySection(block.section) : 0;
          const needed = flowHeights[index] + chrome;

          if (currentPageBlocks.length > 0 && used + needed > capacity) {
            const remaining = capacity - used - chrome;
            const template = measuredContent[Math.min(index, measuredContent.length - 1)] || null;

            // If there's enough room (>= 35px) on the current A4 page, attempt to split
            // this block so that as much content as possible fills the remaining A4 space!
            if (remaining >= 35 && template) {
              const parts = splitHtmlForCapacity(block.html, remaining, template);
              if (parts.length > 1) {
                const firstPart = parts[0];
                const restParts = parts.slice(1);
                const firstHeight = measureFlowPart(firstPart, template);

                const firstNeeded = firstHeight + chrome;
                if (firstHeight > 0 && used + firstNeeded <= capacity) {
                  const fittedFirstBlock = {
                    ...block,
                    id: `${block.id}-fit-1`,
                    html: forceLogicalListMetadata(firstPart, block)
                  };
                  flowBlocks[index] = fittedFirstBlock;
                  flowHeights[index] = firstHeight;

                  const continuationBlocks = restParts.map((html, partIndex) => ({
                    ...block,
                    id: `${block.id}-fit-${partIndex + 2}`,
                    html: forceLogicalListMetadata(html, block)
                  }));
                  const continuationHeights = continuationBlocks.map((part) =>
                    measureFlowPart(part.html, template)
                  );
                  flowBlocks.splice(index + 1, 0, ...continuationBlocks);
                  flowHeights.splice(index + 1, 0, ...continuationHeights);

                  currentPageBlocks.push(fittedFirstBlock);
                  used += firstNeeded;
                  currentSection = block.section;
                  index += 1;
                  continue;
                }
              }
            }

            // A natural page boundary has been detected. Commit the current
            // page and apply the same reset for EVERY subsequent page.
            commitCurrentPageAndStartNext();
            continue;
          }

          currentPageBlocks.push(block);
          used += needed;
          currentSection = block.section;
          index += 1;
        }

        if (guard >= 10000) {
          throw new Error('Pagination SPO berhenti karena batas pengaman tercapai.');
        }

        if (currentPageBlocks.length) pages.push(currentPageBlocks);
        const nonEmptyPages = pages.filter((page) => page.length > 0);

        // Invariant: every page boundary above is produced by the same flow
        // transition. This keeps pagination page-number agnostic and prevents
        // a fix intended for page 2 from becoming a different rule on page 3+.
        if (detectedPageBreaks > 0 && nonEmptyPages.length !== detectedPageBreaks + 1) {
          console.warn('Pagination SPO: jumlah boundary halaman tidak konsisten.');
        }

        if (!cancelled) {
          // Final pass: numbering is based on logical document order across all sections,
          // not on individual HTML fragments. This prevents page 2 (and subsequent pages)
          // from restarting at 1 even when the pagination engine created a new <ol>.
          setOfficialPages(normalizeOfficialPages(nonEmptyPages));
          setIsPaginatingOfficial(false);
        }
      } catch (error) {
        console.error('Gagal menghitung pagination SPO:', error);
        if (!cancelled) {
          setOfficialPages([layoutBlocks]);
          setIsPaginatingOfficial(false);
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [isOpen, sop?.id, activeTab, layoutBlocks]);

  if (!isOpen || !sop) return null;

  // Enforce access control for non-admin users
  const isAccessible = !userSession || userSession.role === 'admin' || isSopAccessibleByUser(sop, userSession);

  if (!isAccessible) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 text-center shadow-xl space-y-4 border border-rose-200 animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-bold text-slate-900 text-base">Akses Naskah SPO Terkunci</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Naskah SPO <strong>"{sop.title}"</strong> ({sop.sopNumber}) berada di luar wewenang dan batasan unit kerja akun Anda (<strong>{userSession?.unitName || userSession?.divisionCode}</strong>).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Tutup Pratinjau
          </button>
        </div>
      </div>
    );
  }

  const renderSectionLabel = (section: OfficialBlock['section']) => {
    if (section === 'ALUR / BAGAN ALIR') {
      return <><div>ALUR /</div><div>BAGAN ALIR</div></>;
    }
    if (section === 'UNIT TERKAIT') {
      return <><div>UNIT</div><div>TERKAIT</div></>;
    }
    return section;
  };

  // Render visible fragments grouped by section. This is the important distinction:
  // pagination may split the HTML internally, but the PREVIEW must show all
  // fragments of one batang tubuh as ONE table row/cell. This preserves ordered
  // numbering (1, 2, 3, ...) and prevents horizontal lines between procedure items.
  const mergeVisibleFragments = (blocks: OfficialBlock[]): string => {
    if (blocks.length === 0) return '';

    // IMPORTANT: the official preview must render the same rich-text structure
    // produced by the editor. Do not parse, flatten, merge, or reconstruct the
    // HTML here. Pagination fragments already carry their own <ol>/<ul> start
    // and continuation metadata, so concatenating the original fragments is
    // sufficient and preserves bullets, nested lists, paragraphs, line breaks,
    // spacing, emphasis, tables, and inline formatting exactly as authored.
    return blocks.map((block) => block.html || '').join('');
  };

  const normalizeOfficialPages = (pages: OfficialBlock[][]): OfficialBlock[][] => {
    if (!pages.length || typeof DOMParser === 'undefined') return pages;

    // Track sequential numbering per logical list across ALL pages.
    // Crucially, state lives OUTSIDE the page loop so page changes are visual only
    // and never reset or collide numbers across separate lists or sections.
    const listCounters = new Map<string, number>();

    return pages.map((page) => page.map((block) => {
      if (!block.html) return block;

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(block.html, 'text/html');

        // Find all top-level lists in this block (including those wrapped in divs/tables)
        const topLists = Array.from(doc.body.querySelectorAll('ol, ul')).filter((list) => {
          let parent = list.parentElement;
          while (parent && parent !== doc.body) {
            const tag = parent.tagName.toLowerCase();
            if (tag === 'ol' || tag === 'ul') return false;
            parent = parent.parentElement;
          }
          return true;
        }) as HTMLElement[];

        if (!topLists.length) {
          return block;
        }

        let hasContinuation = false;
        topLists.forEach((list, listIndex) => {
          const tag = list.tagName.toLowerCase() as 'ol' | 'ul';
          const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === 'li') as HTMLElement[];
          if (!items.length) return;

          const isContinuation =
            list.getAttribute('data-sop-list-continuation') === 'true' ||
            list.hasAttribute('data-sop-list-continuation') ||
            items.every((li) => li.getAttribute('data-sop-continuation-li') === 'true');

          const explicitStartAttr = parseInt(list.getAttribute('start') || '', 10);
          const explicitStart = Number.isFinite(explicitStartAttr) && explicitStartAttr > 0 ? explicitStartAttr : 1;
          const continuationNumAttr = parseInt(list.getAttribute('data-sop-continuation-number') || '', 10);
          const continuationNumber = Number.isFinite(continuationNumAttr) && continuationNumAttr > 0 ? continuationNumAttr : explicitStart;

          // Stable unique identity for this logical list
          const listGroup =
            list.getAttribute('data-sop-list-group') ||
            block.logicalListGroup ||
            `${block.section}-list-${listIndex}`;

          list.setAttribute('data-sop-list-group', listGroup);

          if (tag === 'ol') {
            if (isContinuation) {
              // Same LI continued across page break: keep the exact same number and DO NOT advance counter.
              list.setAttribute('start', String(continuationNumber));
              list.style.counterReset = `sop-list ${continuationNumber - 1}`;
              list.style.setProperty('--sop-start-offset', String(continuationNumber - 1));
              hasContinuation = true;
              if (!listCounters.has(listGroup)) {
                listCounters.set(listGroup, continuationNumber + 1);
              }
            } else {
              // Same logical list on a later page: use the tracked continuous counter!
              const prior = listCounters.get(listGroup);
              const start = prior !== undefined ? prior : explicitStart;
              list.setAttribute('start', String(start));
              list.style.counterReset = `sop-list ${start - 1}`;
              list.style.setProperty('--sop-start-offset', String(start - 1));

              // Count regular (non-continuation) li items to advance the counter
              const regularCount = items.filter(
                (li) => !(li.getAttribute('data-sop-continuation-li') === 'true' || li.hasAttribute('data-sop-continuation-li'))
              ).length;
              listCounters.set(listGroup, start + regularCount);
            }
          }
        });

        return {
          ...block,
          html: doc.body.innerHTML,
          listItemContinuation: hasContinuation
        };
      } catch {
        return block;
      }
    }));
  };

  const renderSectionRow = (
    section: OfficialBlock['section'],
    blocks: OfficialBlock[],
    key: string,
    measure = false,
    showLabel = true,
    continuation = false,
    lastInSection = true
  ) => {
    // IMPORTANT: each paginated fragment remains its own content cell so an
    // ordered-list fragment can keep its native 1., 2., 3. marker. The table
    // borders are then suppressed between fragments of the SAME batang tubuh,
    // making them look like one continuous cell without horizontal rules.
    const html = mergeVisibleFragments(blocks);
    const representative = blocks[0];
    const topBorder = continuation ? '0' : '1px solid #000000';
    const bottomBorder = lastInSection ? '1px solid #000000' : '0';
    return (
      <tr
        key={key}
        className="sop-section-row"
        data-sop-section={section}
        data-measure-block-row={measure ? key : undefined}
      >
        <td
          className={`${showLabel ? 'p-2.5' : 'p-0'} font-bold uppercase align-top text-black font-bookman sop-batang-tubuh-title`}
          style={{
            borderLeft: '1px solid #000000',
            borderRight: '1px solid #000000',
            borderTop: topBorder,
            borderBottom: bottomBorder,
            verticalAlign: 'top',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            fontSize: '12px',
            lineHeight: '1.4',
            width: '28%',
            boxSizing: 'border-box'
          }}
        >
          {showLabel ? renderSectionLabel(section) : null}
        </td>
        <td
          colSpan={3}
          className="p-2.5 text-black align-top font-bookman sop-batang-tubuh-content"
          style={{
            borderLeft: '1px solid #000000',
            borderRight: '1px solid #000000',
            borderTop: topBorder,
            borderBottom: bottomBorder,
            verticalAlign: 'top',
            wordBreak: 'normal',
            overflowWrap: 'break-word',
            fontSize: '12pt',
            lineHeight: '1.5',
            boxSizing: 'border-box'
          }}
        >
          <div data-measure-content={measure ? representative.id : undefined}>
            <RichTextRenderer content={html} fallback="-" />
          </div>
        </td>
      </tr>
    );
  };

  const renderOfficialHeader = (pageNumber: number, pageTotal: number) => (
    <thead className="sop-print-header">
      <tr>
        <td
          rowSpan={2}
          className="p-2 text-center align-middle bg-white"
          style={{ border: '1px solid #000000', verticalAlign: 'middle' }}
        >
          <div className="flex flex-col items-center justify-center">
            <HospitalLogo imgClassName="w-[56px] h-[56px]" className="mb-1" />
            <div className="font-extrabold text-xs sm:text-sm leading-tight tracking-tight uppercase font-bookman text-black">
              <div>RSUD Dr. SOEGIRI</div>
              <div>LAMONGAN</div>
            </div>
          </div>
        </td>
        <td
          colSpan={3}
          className="p-2 text-center align-middle bg-white"
          style={{ border: '1px solid #000000', verticalAlign: 'middle' }}
        >
          <div className="font-extrabold text-sm sm:text-[15px] uppercase tracking-tight font-bookman text-black leading-tight break-words [overflow-wrap:break-word] [word-break:normal] [hyphens:none]">
            {(sop.title || 'JUDUL STANDAR PROSEDUR OPERASIONAL').toUpperCase()}
          </div>
        </td>
      </tr>
      <tr className="text-center">
        <td className="p-1.5 align-top bg-white" style={{ border: '1px solid #000000', verticalAlign: 'top' }}>
          <div className="font-bold text-[11px] uppercase font-bookman text-black">NO. DOKUMEN</div>
          <div className="font-bold text-xs sm:text-sm font-bookman text-black mt-1 break-words [overflow-wrap:break-word] [word-break:normal]">
            {sop.sopNumber || '/……./….. /2026'}
          </div>
        </td>
        <td className="p-1.5 align-top bg-white" style={{ border: '1px solid #000000', verticalAlign: 'top' }}>
          <div className="font-bold text-[11px] uppercase font-bookman text-black">NO. REVISI</div>
          <div className="font-bold text-xs sm:text-sm font-bookman text-black mt-1 break-words">
            {sop.revisionNumber || sop.version || (getStandardJenisSpo(sop) === 'RIVIU' ? '01' : '00')}
          </div>
        </td>
        <td className="p-1.5 align-top bg-white" style={{ border: '1px solid #000000', verticalAlign: 'top' }}>
          <div className="font-bold text-[11px] uppercase font-bookman text-black">HALAMAN</div>
          <div className="font-bold text-xs sm:text-sm font-bookman text-black mt-1">{pageNumber} / {pageTotal}</div>
        </td>
      </tr>
    </thead>
  );

  const renderPublicationRow = () => (
    <tr className="sop-first-page-only">
      <td
        className="p-1.5 text-center align-middle font-extrabold text-xs sm:text-[13px] leading-tight uppercase font-bookman text-black bg-white"
        style={{ border: '1px solid #000000', verticalAlign: 'middle' }}
      >
        <div>STANDAR</div><div>PROSEDUR</div><div>OPERASIONAL</div>
      </td>
      <td className="p-1.5 text-center align-top bg-white" style={{ border: '1px solid #000000', verticalAlign: 'top' }}>
        <div className="text-[11px] font-bookman text-black">Tanggal terbit</div>
        <div className="font-bold text-xs sm:text-sm font-bookman text-black mt-1 break-words">{sop.effectiveDate || '…………….2026'}</div>
      </td>
      <td colSpan={2} className="p-1.5 text-center align-top bg-white relative overflow-visible" style={{ border: '1px solid #000000', verticalAlign: 'top' }}>
        <div className="text-[11px] font-bookman text-black leading-tight">Ditetapkan,</div>
        <div className="font-bold text-xs sm:text-[13px] font-bookman text-black leading-tight mt-0.5 relative z-0">Direktur RSUD Dr. Soegiri Lamongan</div>
        {shouldShowSignatureAndStamp(sop) ? (
          <div className="relative -my-5 sm:-my-6 flex items-center justify-center w-full max-w-[260px] mx-auto z-10 pointer-events-none">
            <DirectorSignature className="h-[96px] sm:h-[106px] w-auto max-w-[260px] object-contain mix-blend-multiply opacity-95" />
          </div>
        ) : (
          <div className="h-[46px] my-1 flex items-center justify-center text-slate-400 italic text-[10px] font-bookman">
            {sop.status === 'DIARSIPKAN'
              ? '(Dokumen Diarsipkan)'
              : isPdfSopDocument(sop)
              ? '(Dokumen Berkas PDF)'
              : '(Draf / Belum Ditetapkan)'}
          </div>
        )}
        <div className="relative z-0 space-y-0.5">
          <div className="font-bold text-xs sm:text-sm underline font-bookman text-black leading-tight whitespace-normal break-words">{sop.direkturNama || SOEGIRI_HOSPITAL_INFO.director.name}</div>
          <div className="text-[10px] sm:text-[11px] font-bookman text-black leading-tight whitespace-normal break-words">
            {(!sop.direkturPangkat || sop.direkturPangkat.toLowerCase().includes('direktur')) ? SOEGIRI_HOSPITAL_INFO.director.rank : sop.direkturPangkat}
          </div>
          <div className="font-bold text-[10px] sm:text-[11px] font-bookman text-black leading-tight whitespace-normal break-words">NIP. {sop.direkturNip || SOEGIRI_HOSPITAL_INFO.director.nip}</div>
        </div>
      </td>
    </tr>
  );

  const pageGroups = officialPages;
  const calculatedTotalPages = pageGroups.length || 1;

  const handleCopy = () => {
    navigator.clipboard.writeText(sop.sopNumber);
    setCopied(true);
    onCopyNumber(sop.sopNumber);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrintOfficialSop = () => {
    setTimeout(() => window.print(), 200);
  };

  // Official PDF flow: send the exact, already-paginated A4 document DOM and
  // the application's compiled CSS to the authenticated Chromium renderer.
  // No print dialog, canvas, JPEG, or jsPDF is involved.
  const handleDownloadDirectPdf = async () => {
    if (!officialPages.length) {
      alert('Tunggu sampai pagination SPO selesai.');
      return;
    }
    if (isPdfGenerating) return;

    const officialRoot = document.getElementById('printable-sop-official-document');
    if (!officialRoot) {
      alert('Dokumen SPO belum siap untuk dibuat PDF.');
      return;
    }

    const currentSession = userSession || getPersistedClientSession();
    const authUid = currentSession?.authUid || 'anonymous_user';
    const sessionId = currentSession?.sessionId || 'default_session';
    const username = currentSession?.username || 'user';

    setIsPdfGenerating(true);
    try {

      // Snapshot application styles (style tags + same-origin stylesheet rules)
      const cssParts: string[] = [];
      for (const style of Array.from(document.querySelectorAll<HTMLStyleElement>('style'))) {
        if (style.textContent) cssParts.push(style.textContent);
      }
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = Array.from((sheet as CSSStyleSheet).cssRules || []);
          if (rules.length) cssParts.push(rules.map(rule => rule.cssText).join('\n'));
        } catch {
          // Cross-origin stylesheet rules are protected, ignore safely
        }
      }

      const clonedRoot = officialRoot.cloneNode(true) as HTMLElement;

      // Filename source of truth: the TITLE THAT IS ACTUALLY RENDERED IN THE
      // official A4 preview. Do not depend on sop.title or a fragile CSS selector.
      // Find the first header row and choose the cell that spans the title area.
      const readPreviewTitle = (root: HTMLElement): string => {
        const firstTable = root.querySelector('table') as HTMLTableElement | null;
        const firstHeaderRow = firstTable?.querySelector('thead tr:first-child') as HTMLTableRowElement | null;
        if (!firstHeaderRow) return '';

        const cells = Array.from(firstHeaderRow.querySelectorAll('th,td')) as HTMLTableCellElement[];
        const titleCell =
          cells.find((cell) => Number(cell.colSpan || cell.getAttribute('colspan') || 1) >= 3) ||
          cells[1] ||
          cells[0];

        return String(titleCell?.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();
      };

      const previewTitle =
        readPreviewTitle(officialRoot) ||
        readPreviewTitle(clonedRoot) ||
        String(sop.title || '').trim();

      console.log('[PDF] Preview title used for filename:', previewTitle || '(empty)');

      clonedRoot.querySelectorAll('.no-print').forEach(node => node.remove());

      // Make the PDF payload self-contained. local/Chromium must not depend
      // on Vite/local asset routing for logos or signatures. Convert every
      // same-origin image in the cloned document to a data URL before upload.
      const exportImages = Array.from(clonedRoot.querySelectorAll<HTMLImageElement>('img'));
      await Promise.all(exportImages.map(async (img) => {
        const src = img.getAttribute('src');
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
        try {
          const absoluteUrl = new URL(src, window.location.href).href;
          const response = await fetch(absoluteUrl, { credentials: 'same-origin' });
          if (!response.ok) return;
          const blob = await response.blob();
          await new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') img.setAttribute('src', reader.result);
              resolve();
            };
            reader.onerror = () => resolve();
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.warn('[PDF] Could not inline image asset:', src, error);
        }
      }));

      // PDF MUST use the real A4 page nodes, never the responsive screen-scale
      // wrappers used by the preview. Those wrappers can contain an inline
      // transform: scale(...) which makes Chromium shrink/offset the entire
      // official document and destroys the intended A4 structure. Unwrap any
      // wrapper whose only purpose is responsive preview scaling.
      clonedRoot.querySelectorAll('.sop-scaled-page-wrap').forEach(wrapper => {
        const page = wrapper.querySelector('.sop-preview-page');
        if (page && wrapper.parentNode) {
          wrapper.parentNode.insertBefore(page, wrapper);
          wrapper.remove();
        }
      });

      // Remove any remaining responsive transform/margin styles from export
      // wrappers while preserving the exact A4 page dimensions/padding.
      clonedRoot.querySelectorAll('[style]').forEach((node) => {
        const el = node as HTMLElement;
        if (el.style.transform || el.style.marginBottom) {
          el.style.removeProperty('transform');
          el.style.removeProperty('transform-origin');
          el.style.removeProperty('margin-bottom');
        }
      });

      clonedRoot.classList.add('pdf-export-document');

      const response = await fetch('/api/pdf', {
        method: 'POST',
        headers: {
          'Accept': 'application/pdf',
          'Content-Type': 'application/json',
          'X-Soegiri-Auth-Uid': authUid,
          'X-Soegiri-Session-Id': sessionId,
          'X-Soegiri-Username': username
        },
        body: JSON.stringify({
          html: clonedRoot.outerHTML,
          css: cssParts.join('\n'),
          baseUrl: window.location.origin,
          authUid,
          sopNumber: sop.sopNumber,
          title: previewTitle,
          filename: previewTitle || sop.sopNumber || `SPO_${sop.id}`
        })
      });

      if (!response.ok) {
        let message = `PDF gagal dibuat (HTTP ${response.status}).`;
        try {
          const payload = await response.json();
          if (payload?.message) {
            message = payload.detail && payload.detail !== payload.message
              ? `${payload.message} — ${payload.detail}`
              : payload.message;
          }
        } catch {
          const raw = await response.text().catch(() => '');
          if (raw) message += ` ${raw.slice(0, 500)}`;
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      if (!blob.size) throw new Error('File PDF yang diterima kosong.');

      // The downloaded filename must come from the SPO record itself.
      // Do not trust/parse Content-Disposition here: some production proxies
      // rewrite or strip that header, which can result in an empty filename.
      const safeTitle = String(previewTitle || '').trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/g, '')
        .trim();

      const filename = `${(safeTitle || 'SPO_RSUD_Dr_Soegiri').slice(0, 180)}.pdf`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.style.display = 'none';
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error: any) {
      console.error('Direct PDF generation failed:', error);
      alert(error?.message || 'PDF gagal dibuat. Silakan coba lagi.');
    } finally {
      setIsPdfGenerating(false);
    }
  };

  const a4PixelWidth = 794;
  const availableContentWidth = Math.max(280, containerWidth - (isMobile ? 16 : 48));
  const fitScale = Math.min(1, Math.max(0.35, availableContentWidth / a4PixelWidth));
  const effectiveScale = zoomScale === 'fit' ? fitScale : zoomScale;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-5 printable-modal-active">
      <div className="bg-white w-full max-w-4xl h-full sm:h-auto sm:max-h-[92vh] rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-slate-200 overflow-hidden flex flex-col printable-modal-overlay">
        
        {/* Top Bar (Hidden in Print) */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3.5 border-b border-slate-100 bg-slate-50/90 no-print flex-wrap gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
              {sop.divisionCode} {sop.subHierarchyCode ? `/ ${sop.subHierarchyCode}` : ''}
            </span>
            <span className="text-xs text-slate-600 font-semibold truncate max-w-[120px] sm:max-w-[220px]">
              {sop.title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
            {/* EDIT DOKUMEN / UBAH NOMOR */}
            {(!userSession || userSession.role === 'admin' || isSopAccessibleByUser(sop, userSession)) && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(sop);
                }}
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 rounded-xl shadow-2xs transition-colors cursor-pointer min-h-[36px]"
                title="Edit data SPO atau ubah nomor registrasi"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                <span className="hidden sm:inline">Edit / Ubah Nomor</span>
                <span className="sm:hidden">Edit</span>
              </button>
            )}

            {/* DOWNLOAD PDF RESMI — hanya untuk SPO Baru/Riviu */}
            {!isExisting && (
              <button
                type="button"
                onClick={handleDownloadDirectPdf}
                disabled={isPdfGenerating || isPaginatingOfficial}
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-400 rounded-xl shadow-2xs transition-colors cursor-pointer disabled:cursor-wait min-h-[36px]"
                title="Simpan Naskah Standar SPO sebagai PDF A4"
              >
                {isPdfGenerating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{isPdfGenerating ? 'Membuat PDF…' : 'Simpan PDF'}</span>
                <span className="sm:hidden">{isPdfGenerating ? '...' : 'PDF'}</span>
              </button>
            )}

            {/* PREVIEW PDF ASLI — khusus SPO Eksisting */}
            {isExisting && legacyFileUrl && (
              <button
                type="button"
                onClick={() => setIsFullscreenDocOpen(true)}
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 rounded-xl shadow-2xs transition-colors cursor-pointer min-h-[36px]"
                title="Pratinjau PDF asli SPO Eksisting"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview PDF</span>
              </button>
            )}

            {!isExisting && (
              <button
                type="button"
                onClick={handlePrintOfficialSop}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 active:bg-slate-200 rounded-xl border border-slate-300 transition-colors cursor-pointer min-h-[36px]"
                title="Cetak Fisik / Buka Print Preview Browser"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-colors cursor-pointer ml-1 min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Tutup Pratinjau"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div ref={modalBodyRef} className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
          
          {isExisting ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-purple-900 bg-purple-200/80 px-2 py-0.5 rounded-md border border-purple-300">
                        SPO Eksisting / Lama
                      </span>
                      <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {sop.status === 'AKTIF' ? 'AKTIF' : (sop.status || 'AKTIF')}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 leading-snug">{sop.title}</h3>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                      <div className="min-w-0">
                        <span className="font-semibold text-purple-900">Nomor SPO:</span>
                        <span className="ml-1.5 font-mono font-bold text-slate-800">{sop.sopNumber || '-'}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-purple-900">Penerbit:</span>
                        <span className="ml-1.5 font-semibold text-slate-700">{sop.divisionName || '-'}</span>
                      </div>
                    </div>
                  </div>

                  {legacyFileUrl && (
                    <div className="flex items-center gap-2 shrink-0 self-start">
                      <button
                        type="button"
                        onClick={() => openDocumentPreview(legacyFileUrl, legacyFileName)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-900 bg-purple-200/90 hover:bg-purple-300 rounded-xl transition-colors cursor-pointer"
                        title="Buka PDF di tab baru peramban"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka Tab Baru</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => triggerFileDownload(legacyFileUrl, legacyFileName)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl transition-colors cursor-pointer shadow-xs"
                        title="Unduh berkas PDF asli"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh PDF</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isLoadingLegacyFile ? (
                <div className="flex flex-col items-center justify-center gap-3 p-12 bg-white rounded-2xl border border-slate-200 min-h-[380px]">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                  <p className="text-xs font-semibold text-slate-600">Memuat berkas PDF asli SPO Eksisting...</p>
                </div>
              ) : legacyFileUrl ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white min-h-[560px]">
                  <DocumentViewer fileUrl={legacyFileUrl} fileName={legacyFileName} heightClass="h-[68vh] w-full" />
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
                  <AlertCircle className="mx-auto h-8 w-8 text-amber-500" />
                  <p className="mt-2 text-sm font-bold text-amber-900">Berkas PDF Asli Belum Tersimpan di Peramban Ini</p>
                  <p className="mt-1 text-xs text-amber-700">Metadata SPO tetap tersimpan. Silakan unggah kembali berkas scan PDF untuk pratinjau langsung.</p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* FORMAT RESMI BAKU (Halaman 6 RSUD Soegiri - untuk SPO Baru/Riviu) */}
          {activeTab === 'official_format' && (
            <div className="space-y-4 sm:space-y-6">
              

              {/* BANNER INFORMASI DOKUMEN RIVIU & BUKTI SPO LAMA */}
              {isReviewDoc && (
                <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/60 p-3.5 sm:p-5 text-slate-800 shadow-xs no-print space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                        <FileCheck2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-md border border-amber-300">
                            Dokumen Hasil Riviu
                          </span>
                          <span className="text-xs font-bold text-amber-800">
                            Revisi Ke: {sop.revisionNumber || sop.version || '01'}
                          </span>
                        </div>
                        <p className="text-xs text-amber-950 font-medium mt-0.5">
                          SPO ini merupakan hasil peninjauan/perubahan dari naskah SPO terdahulu.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleDownloadReviewEvidence}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl transition-all shadow-xs cursor-pointer"
                        title="Unduh dokumen berkas bukti SPO lama / bukti riviu yang telah diunggah"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh Bukti</span>
                      </button>
                    </div>
                  </div>

                  {/* Detail Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-amber-200/70 text-xs">
                    <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/60">
                      <span className="font-bold text-amber-900 block text-[11px]">SPO Lama yang Diriviu:</span>
                      <span className="font-mono font-bold text-slate-800 break-words mt-0.5 block">
                        {sop.oldSopNumber || '(Tidak dicantumkan)'}
                      </span>
                    </div>

                    <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/60 sm:col-span-2">
                      <span className="font-bold text-amber-900 block text-[11px]">Alasan & Pedoman Perubahan:</span>
                      <span className="text-slate-700 mt-0.5 block leading-relaxed">
                        {sop.reviewReason || 'Penyesuaian tata laksana operasional dan regulasi terbaru.'}
                      </span>
                    </div>

                    {sop.oldFileName && (
                      <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/60 sm:col-span-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-amber-700 shrink-0" />
                          <span className="font-medium text-slate-800 truncate text-xs">
                            Berkas Bukti: <strong>{sop.oldFileName}</strong>
                          </span>
                          {sop.oldFileSize ? (
                            <span className="text-[11px] text-slate-500 shrink-0">
                              ({formatBytes(sop.oldFileSize)})
                            </span>
                          ) : null}
                        </div>

                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ==========================================================
                  VIEW MODE: READER MODE (FOR MOBILE VIEWPORT)
                 ========================================================== */}
              {mobileViewMode === 'reader' && (
                <div className="space-y-4 animate-fade-in no-print relative">
                  <div className="flex justify-end -mb-2">
                    <button
                      type="button"
                      onClick={() => setMobileViewMode('a4')}
                      className="px-2 py-1 rounded-md text-[9px] font-semibold text-indigo-700 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 cursor-pointer"
                      title="Kembali ke lembar A4"
                    >
                      A4
                    </button>
                  </div>
                  {/* Hospital Kop Card */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                      <div className="w-12 h-12 flex items-center justify-center shrink-0">
                        <HospitalLogo className="w-11 h-11 object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-tight">
                          {SOEGIRI_HOSPITAL_INFO.hospitalName}
                        </h4>
                        <p className="text-[10px] text-slate-500">{SOEGIRI_HOSPITAL_INFO.government}</p>
                        <span className="inline-block mt-0.5 text-[9px] font-bold bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.2 rounded">
                          RSUD KELAS B LAMONGAN
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                        {sop.title}
                      </h3>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg">
                          {sop.sopNumber}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
                          title="Salin Nomor Dokumen"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span className="text-[11px]">{copied ? 'Tersalin' : 'Salin'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-200/60">
                        <span className="text-[10px] text-slate-500 block font-medium">No. Revisi</span>
                        <span className="font-semibold text-slate-800">{sop.revisionNumber || sop.version || '00'}</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-200/60">
                        <span className="text-[10px] text-slate-500 block font-medium">Halaman</span>
                        <span className="font-semibold text-slate-800">{calculatedTotalPages} Hal</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-200/60">
                        <span className="text-[10px] text-slate-500 block font-medium">Tanggal Terbit</span>
                        <span className="font-semibold text-slate-800">{sop.effectiveDate || '-'}</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-200/60">
                        <span className="text-[10px] text-slate-500 block font-medium">Unit Kerja</span>
                        <span className="font-semibold text-slate-800 truncate block">{sop.divisionName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Horizontal Jump Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar sticky top-[60px] z-20 bg-slate-50/95 backdrop-blur-md -mx-1 px-1">
                    {sectionsData.filter(sec => sec.html.trim().length > 0).map((sec, idx) => (
                      <a
                        key={sec.id}
                        href={`#reader-${sec.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveReaderSectionId(`reader-${sec.id}`);
                          const el = document.getElementById(`reader-${sec.id}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          activeReaderSectionId === `reader-${sec.id}`
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {idx + 1}. {sec.section}
                      </a>
                    ))}
                  </div>

                  {/* Section Cards */}
                  <div className="space-y-3">
                    {sectionsData.filter(sec => sec.html.trim().length > 0).map((sec, idx) => (
                      <div
                        key={sec.id}
                        id={`reader-${sec.id}`}
                        className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3 scroll-mt-28"
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
                              {idx + 1}
                            </span>
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-tight">
                              {sec.section}
                            </h4>
                          </div>
                        </div>

                        <div className="text-slate-800 text-xs sm:text-sm leading-relaxed overflow-x-auto">
                          <RichTextRenderer content={sec.html} isIndonesianSopList={true} />
                        </div>
                      </div>
                    ))}

                    {/* Official Approval & Director Signature Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 text-center space-y-3">
                      <div className="text-xs font-bold text-slate-700 uppercase tracking-wider relative z-0">
                        Ditetapkan oleh: Direktur {SOEGIRI_HOSPITAL_INFO.hospitalName}
                      </div>

                      <div className="py-2 flex flex-col items-center justify-center">
                        {shouldShowSignatureAndStamp(sop) ? (
                          <div className="relative -my-5 sm:-my-6 flex items-center justify-center w-full max-w-[260px] mx-auto z-10 pointer-events-none">
                            <DirectorSignature className="h-[96px] sm:h-[106px] w-auto max-w-[260px] object-contain mix-blend-multiply opacity-95" />
                          </div>
                        ) : (
                          <div className="h-[44px] flex items-center justify-center text-slate-400 italic text-xs">
                            {sop.status === 'DIARSIPKAN'
                              ? '(Dokumen Diarsipkan)'
                              : isPdfSopDocument(sop)
                              ? '(Dokumen Berkas PDF)'
                              : '(Draf / Belum Ditetapkan)'}
                          </div>
                        )}
                        <div className="relative z-0 space-y-0.5">
                          <div className="font-bold text-sm underline text-slate-900">
                            {sop.direkturNama || SOEGIRI_HOSPITAL_INFO.director.name}
                          </div>
                          <div className="text-xs text-slate-600">
                            {(!sop.direkturPangkat || sop.direkturPangkat.toLowerCase().includes('direktur'))
                              ? SOEGIRI_HOSPITAL_INFO.director.rank
                              : sop.direkturPangkat}
                          </div>
                          <div className="text-xs font-mono font-semibold text-slate-700">
                            NIP. {sop.direkturNip || SOEGIRI_HOSPITAL_INFO.director.nip}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div 
                id="printable-sop-official-document" 
                className={`font-bookman flex flex-col items-center gap-6 ${
                  mobileViewMode === 'reader' ? 'hidden' : ''
                }`}
              >

                {/* ==========================================================
                    MEASUREMENT CANVAS
                    Hidden off-screen, but rendered by the browser exactly with
                    the same typography and widths as the real A4 pages.
                   ========================================================== */}
                <div
                  ref={measureRootRef}
                  aria-hidden="true"
                  className="sop-measure-root"
                  style={{
                    position: 'absolute',
                    left: '-100000px',
                    top: 0,
                    visibility: 'hidden',
                    pointerEvents: 'none',
                    width: '210mm'
                  }}
                >
                  <div
                    data-measure-page
                    className="bg-white printable-paper font-bookman"
                    style={{
                      width: '210mm',
                      minHeight: '297mm',
                      height: '297mm',
                      maxHeight: '297mm',
                      overflow: 'hidden',
                      padding: '20mm 20mm 20mm 30mm',
                      boxSizing: 'border-box',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    <table
                      className="sop-official-table w-full border-collapse font-bookman text-black text-xs sm:text-sm bg-white table-fixed"
                      data-measure-table="true"
                      style={{ border: '1px solid #000000', borderCollapse: 'collapse', width: '100%' }}
                    >
                      <colgroup>
                        <col style={{ width: '28%' }} />
                        <col style={{ width: '24%' }} />
                        <col style={{ width: '24%' }} />
                        <col style={{ width: '24%' }} />
                      </colgroup>
                      {React.cloneElement(renderOfficialHeader(1, 1), { 'data-measure-header': true })}
                      <tbody>
                        {React.cloneElement(renderPublicationRow(), { 'data-measure-publication': true })}
                        {layoutBlocks.map((block, index) =>
                          renderSectionRow(block.section, [block], `measure-${index}`, true, true)
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {isPaginatingOfficial && officialPages.length === 0 && (
                  <div className="no-print text-xs text-slate-500 py-2">Menyiapkan pagination A4…</div>
                )}

                {/* ==========================================================
                    REAL A4 PREVIEW PAGES
                    These are the exact pages that will be printed/exported.
                   ========================================================== */}
                {pageGroups.map((pageBlocks, pageIndex) => {
                  if (!pageBlocks.length) return null;

                  const pageElement = (
                    <div
                      key={`sop-preview-page-${pageIndex}`}
                      data-page-index={pageIndex}
                      className="sop-preview-page bg-white font-bookman"
                      style={{
                        width: '210mm',
                        height: '297mm',
                        minHeight: '297mm',
                        maxHeight: '297mm',
                        padding: '20mm 20mm 20mm 30mm',
                        boxSizing: 'border-box',
                        backgroundColor: '#ffffff',
                        overflow: 'hidden',
                        boxShadow: '0 2px 12px rgba(0,0,0,.08)',
                        border: '1px solid #e2e8f0',
                        position: 'relative'
                      }}
                    >
                      {/* Preview controls live visually on the A4 sheet but are UI-only.
                          The no-print class removes them before browser print/PDF export,
                          so they never affect pagination or the generated SPO. */}
                      {pageIndex === 0 && (
                        <div
                          className="no-print absolute top-[6mm] right-[6mm] z-10 inline-flex items-center gap-0.5 rounded-md bg-white/90 px-1 py-0.5 shadow-sm border border-slate-200/70 backdrop-blur-sm"
                          style={{ lineHeight: 1 }}
                          aria-label="Kontrol preview dokumen"
                        >
                          <button
                            type="button"
                            onClick={() => setMobileViewMode('a4')}
                            className={`px-1.5 py-1 rounded text-[9px] font-semibold transition-colors cursor-pointer ${
                              mobileViewMode === 'a4' ? 'bg-slate-100 text-indigo-700' : 'text-slate-500 hover:text-slate-800'
                            }`}
                            title="Lembar A4"
                          >
                            A4
                          </button>
                          <button
                            type="button"
                            onClick={() => setMobileViewMode('reader')}
                            className={`px-1.5 py-1 rounded text-[9px] font-semibold transition-colors cursor-pointer ${
                              mobileViewMode === 'reader' ? 'bg-slate-100 text-teal-700' : 'text-slate-500 hover:text-slate-800'
                            }`}
                            title="Mode baca HP"
                          >
                            HP
                          </button>
                          {mobileViewMode === 'a4' && (
                            <button
                              type="button"
                              onClick={() => setZoomScale(zoomScale === 'fit' ? 1.0 : 'fit')}
                              className="px-1.5 py-1 rounded text-[9px] font-semibold text-slate-500 hover:text-indigo-700 transition-colors cursor-pointer"
                              title="Ganti Fit / 100%"
                            >
                              {zoomScale === 'fit' ? `Fit ${Math.round(fitScale * 100)}%` : `${Math.round((zoomScale as number) * 100)}%`}
                            </button>
                          )}
                        </div>
                      )}

                      <table
                        className="sop-official-table w-full border-collapse font-bookman text-black text-xs sm:text-sm bg-white table-fixed"
                        style={{ border: '1px solid #000000', borderCollapse: 'collapse', width: '100%' }}
                      >
                        <colgroup>
                          <col style={{ width: '28%' }} />
                          <col style={{ width: '24%' }} />
                          <col style={{ width: '24%' }} />
                          <col style={{ width: '24%' }} />
                        </colgroup>
                        {renderOfficialHeader(pageIndex + 1, calculatedTotalPages)}
                        <tbody>
                          {pageIndex === 0 && renderPublicationRow()}
                          {(() => {
                            const groups: OfficialBlock[][] = [];
                            pageBlocks.forEach((block) => {
                              const last = groups[groups.length - 1];
                              if (last && last[0].section === block.section) last.push(block);
                              else groups.push([block]);
                            });
                            return groups.map((group, groupIndex) =>
                              renderSectionRow(
                                group[0].section,
                                group,
                                `page-${pageIndex}-section-${groupIndex}-${group[0].id}`,
                                false,
                                true,
                                false,
                                true
                              )
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  );

                  if (effectiveScale < 0.99) {
                    return (
                      <div
                        key={`sop-scaled-page-wrap-${pageIndex}`}
                        className="w-full flex flex-col items-center justify-center overflow-x-auto touch-pan-x"
                        style={{
                          height: `${Math.ceil(1122 * effectiveScale) + 12}px`,
                          minHeight: `${Math.ceil(1122 * effectiveScale) + 12}px`
                        }}
                      >
                        <div
                          style={{
                            transform: `scale(${effectiveScale})`,
                            transformOrigin: 'top center',
                            width: '210mm',
                            height: '297mm',
                            minHeight: '297mm',
                            maxHeight: '297mm',
                            marginBottom: `-${Math.round(1122 * (1 - effectiveScale))}px`
                          }}
                        >
                          {pageElement}
                        </div>
                      </div>
                    );
                  }

                  return pageElement;
                })}
              </div>
            </div>
          )}
            </>
          )}

          {/* Modal Footer (Hidden in Print) */}
          <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between no-print gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Status Dokumen:</span>
              {userSession?.role === 'admin' ? (
                isExisting ? (
                  <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 font-bold text-emerald-800">
                    {sop.status === 'DIARSIPKAN' ? 'Diarsipkan' : 'Aktif — SPO Eksisting'}
                  </div>
                ) : (
                  <select
                    value={sop.status}
                    onChange={(e) => onUpdateStatus(sop.id, e.target.value as SopStatus)}
                    className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="AKTIF">Aktif</option>
                    <option value="DIARSIPKAN">Diarsipkan</option>
                  </select>
                )
              ) : (
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      sop.status === 'AKTIF'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : sop.status === 'DRAFT'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : sop.status === 'DRAFT' || sop.isNumberReservation
                        ? 'bg-sky-100 text-sky-800 border border-sky-300'
                        : 'bg-slate-100 text-slate-700 border border-slate-300'
                    }`}
                  >
                    {sop.status === 'DRAFT'
                      ? 'Draft'
                      : sop.status === 'DRAFT' || sop.isNumberReservation
                      ? 'Draft'
                      : sop.status === 'DIARSIPKAN'
                      ? 'Diarsipkan'
                      : 'Aktif'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {userSession?.role === 'admin' && !isExisting && sop.status === 'DRAFT' && onActivateSop && (
                <button
                  onClick={() => onActivateSop(sop)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors cursor-pointer shadow-sm"
                  title="Aktivasi Dokumen SPO oleh Admin Tata Naskah"
                >
                  <Stamp className="w-3.5 h-3.5" />
                  <span>Aktivasi Dokumen</span>
                </button>
              )}

              {userSession?.role === 'admin' && onDelete && (
                <button
                  onClick={() => onDelete(sop)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
                  title="Hapus Dokumen SPO"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>

        </div>

        {/* FULLSCREEN DOCUMENT PREVIEW MODAL (RENDERED ON CANVAS - 100% IMMUNE TO MICROSOFT EDGE IFRAME BLOCKS) */}
        {isFullscreenDocOpen && (
          <div className="fixed inset-0 z-60 bg-slate-100/95 backdrop-blur-sm flex flex-col p-2 sm:p-4 animate-fade-in">
            <div className="flex items-center justify-between px-4 py-2.5 bg-white rounded-t-2xl border border-slate-200 text-slate-800 shrink-0 shadow-sm">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-600" />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                    {legacyFileName}
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    {'Pratinjau PDF Asli SPO Eksisting'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsFullscreenDocOpen(false);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                title="Tutup Layar Penuh"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden rounded-b-2xl border-b border-x border-slate-200 bg-white shadow-sm">
              <DocumentViewer
                fileUrl={legacyFileUrl || ''}
                fileName={legacyFileName}
                heightClass="h-full w-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};