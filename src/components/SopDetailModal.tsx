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
import { SopDocument, SopStatus, UserSession, UserAccount, getStandardJenisSpo } from '../types';
import { formatBytes } from '../utils/numbering';
import { SOEGIRI_HOSPITAL_INFO, isSopAccessibleByUser, canUserActivateSop } from '../utils/soegiriStructure';
import { HospitalLogo } from './HospitalLogo';
import { DirectorSignature } from './DirectorSignature';
import { triggerFileDownload, openDocumentPreview } from '../utils/fileStorage';
import { RichTextRenderer, hasHtmlTags, cleanSopRichContent } from './RichTextRenderer';
import { getPersistedClientSession, getCurrentAuthToken, refreshUserSessionProfile } from '../lib/authService';
import { shouldShowSignatureAndStamp } from '../utils/documentUtils';
import { DocumentViewer } from './DocumentViewer';
import { AdminTooltip } from './AdminTooltip';

interface SopDetailModalProps {
  isOpen: boolean;
  sop: SopDocument | null;
  onClose: () => void;
  onEdit: (sop: SopDocument) => void;
  onDelete?: (sop: SopDocument) => void;
  onUpdateStatus: (id: string, newStatus: SopStatus) => void;
  onCopyNumber: (num: string) => void;
  onActivateSop?: (sop: SopDocument) => void;
  onProposeActivation?: (sop: SopDocument) => void;
  userSession?: UserSession | null;
  users?: UserAccount[];
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

const PreviewMetadata: React.FC<{ sop: SopDocument; kind: 'BARU' | 'EKSISTING' | 'RIVIU'; users?: UserAccount[] }> = ({ sop, kind, users }) => {
  const fmt = (value?: string) => {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  // Pengusul wajib ditampilkan sebagai Nama Lengkap pada akun user.
  // Data lama yang masih menyimpan username di activationRequestedBy di-resolve
  // kembali ke direktori akun agar preview tidak menampilkan username.
  const proposerAccount = users?.find((u) =>
    String(u.username || '').trim().toLowerCase() === String(sop.activationRequestedBy || '').trim().toLowerCase()
  );
  const proposer = proposerAccount?.name || sop.activationRequestedBy || sop.creatorName || '-';
  const proposerUnit = sop.creatorUnit || sop.divisionName || '-';
  const status = sop.status === 'AKTIF' ? 'Aktif' : sop.status === 'DRAFT' ? 'Draft' : sop.status || '-';
  const typeLabel = kind === 'BARU' ? 'SPO Baru' : kind === 'EKSISTING' ? 'SPO Existing / Lama' : 'SPO Hasil Riviu';
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden no-print" aria-label="Informasi dokumen SPO">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-900 border border-blue-200">{typeLabel}</span>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Informasi Dokumen</span>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border ${sop.status === 'AKTIF' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : sop.status === 'DRAFT' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{status}</span>
      </div>
      <div className="px-4 sm:px-5 py-4 space-y-3">
        <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Judul SPO</div><h3 className="mt-0.5 text-[12px] font-extrabold leading-snug text-slate-900">{sop.title || 'Tanpa Judul SPO'}</h3></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2"><span className="block text-[9px] font-semibold text-slate-500">Nomor SPO</span><span className="mt-0.5 block font-mono text-[11px] font-bold text-blue-900 break-words leading-tight">{sop.sopNumber || '-'}</span></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2"><span className="block text-[9px] font-semibold text-slate-500">Pengusul</span><span className="mt-0.5 block text-[11px] font-semibold text-slate-800 break-words leading-tight">{proposer}</span></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2"><span className="block text-[9px] font-semibold text-slate-500">Unit / Pemilik</span><span className="mt-0.5 block text-[11px] font-semibold text-slate-800 break-words leading-tight">{proposerUnit}</span></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2"><span className="block text-[9px] font-semibold text-slate-500">Revisi</span><span className="mt-0.5 block text-[11px] font-semibold text-slate-800 leading-tight">{sop.revisionNumber || sop.version || '00'}</span></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2"><span className="block text-[9px] font-semibold text-slate-500">Tanggal Pengajuan</span><span className="mt-0.5 block text-[11px] font-semibold text-slate-800 leading-tight">{fmt(sop.activationRequestedAt || sop.createdAt)}</span></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2"><span className="block text-[9px] font-semibold text-slate-500">Tanggal Terbit / Berlaku</span><span className="mt-0.5 block text-[11px] font-semibold text-slate-800 leading-tight">{fmt(sop.effectiveDate)}</span></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2"><span className="block text-[9px] font-semibold text-slate-500">Penetap</span><span className="mt-0.5 block text-[11px] font-semibold text-slate-800 break-words leading-tight">{sop.approverName || sop.direkturNama || SOEGIRI_HOSPITAL_INFO.director.name}</span></div>
        </div>
        {kind === 'RIVIU' && (
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,2fr)] gap-2 pt-0.5">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5">
              <span className="block text-[8px] font-bold uppercase tracking-wide text-slate-400">SPO Lama yang Diriviu</span>
              <span className="mt-0.5 block text-[10px] font-mono font-bold text-blue-900 break-words leading-tight">{sop.oldSopNumber || '-'}</span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5">
              <span className="block text-[8px] font-bold uppercase tracking-wide text-slate-400">Alasan Riviu</span>
              <span className="mt-0.5 block text-[10px] font-medium text-slate-700 leading-snug break-words">{sop.reviewReason || '-'}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
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
  onProposeActivation,
  userSession,
  users
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

  // Existing DOCX is only an import source. Once the LiveForm is populated
  // and the document is approved, it must use the same official preview as
  // SPO Baru/Riviu. Existing PDF remains the original PDF preview.
  const isExistingDocx = Boolean(
    sop &&
    isExisting &&
    (
      sop.existingSourceFormat === 'DOCX' ||
      String(sop.fileType || '').toLowerCase().includes('wordprocessingml') ||
      String(sop.fileType || '').toLowerCase().includes('msword') ||
      String(sop.fileName || '').toLowerCase().endsWith('.docx') ||
      String(sop.fileName || '').toLowerCase().endsWith('.doc')
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

    // Firebase Cloud Storage is the only authoritative file source.
    // Browser-local cache is intentionally NOT used for normal preview; otherwise
    // PC-A can show a document that PC-B cannot access. Legacy records without a
    // cloud reference must be repaired/migrated instead of silently falling back.
    const cloudUrl = (sop as any).fileUrl || (sop as any).signedScanUrl || (sop as any).oldFileUrl;
    if (cloudUrl) {
      setResolvedLegacyFileUrl(cloudUrl);
      setIsLoadingLegacyFile(false);
      return;
    }

    setResolvedLegacyFileUrl(null);
    setIsLoadingLegacyFile(false);
    return () => {
      isCancelled = true;
    };
  }, [sop?.id, sop?.fileUrl, sop?.signedScanUrl, sop?.oldFileUrl, isOpen]);

  const legacyFileUrl = resolvedLegacyFileUrl;
  const legacyFileName = sop ? (sop.signedScanFileName || sop.fileName || sop.oldFileName || 'Dokumen_SPO_Eksisting.pdf') : 'Dokumen_SPO_Eksisting.pdf';
  const legacyFileSize = sop ? (sop.signedScanFileSize || sop.fileSize || sop.oldFileSize) : undefined;

  // Review evidence attachment handlers
  const handleDownloadReviewEvidence = async () => {
    if (!sop) return;
    try {
      let fileUrl = (sop as any).oldFileUrl || null;
      if (!fileUrl) {
        fileUrl = (sop as any).oldFileUrl || null;
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
        const trimmed = inlineBuffer.trim();
        if (trimmed) {
          // If the buffered text is already wrapped in a block tag, push as is; otherwise wrap in <p>
          if (/^<(p|div|h[1-6]|table|ol|ul|blockquote)/i.test(trimmed)) {
            blocks.push(trimmed);
          } else {
            blocks.push(`<p>${trimmed}</p>`);
          }
        }
        inlineBuffer = '';
      };

      const hasBlockDescendant = (el: Element) => {
        return Boolean(el.querySelector('p, ol, ul, table, blockquote, pre, h1, h2, h3, h4, h5, h6, section, article, div, figure, hr'));
      };

      const processNode = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          if ((node.textContent || '').length > 0) inlineBuffer += node.textContent || '';
          return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();

        // Top-level or nested lists: emit as complete list block
        if (/^(ol|ul)$/i.test(tag)) {
          pushInlineBuffer();
          blocks.push(el.outerHTML);
          return;
        }

        // Distinct block structures
        if (/^(table|img|figure|blockquote|pre|h1|h2|h3|h4|h5|h6|hr)$/i.test(tag)) {
          pushInlineBuffer();
          blocks.push(el.outerHTML);
          return;
        }

        if (tag === 'p') {
          // If a paragraph contains nested block tags (common in rich editors), unwrap
          if (hasBlockDescendant(el)) {
            pushInlineBuffer();
            Array.from(el.childNodes).forEach(processNode);
            pushInlineBuffer();
            return;
          }

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
          return;
        }

        // If tag is div, section, or any wrapper tag (span/font) that contains block descendants:
        // Recursively unpack children so that headings, paragraphs, and lists become independent flow blocks!
        if (/^(div|section|article|main|header|footer)$/i.test(tag) || hasBlockDescendant(el)) {
          pushInlineBuffer();
          Array.from(el.childNodes).forEach(processNode);
          pushInlineBuffer();
          return;
        }

        // Pure inline element without block descendants (span, b, strong, em, etc.)
        inlineBuffer += el.outerHTML;
      };

      Array.from(doc.body.childNodes).forEach(processNode);
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
        if (root) {
          const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
          await Promise.all(images.map((img: HTMLImageElement) => img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); resolve(); };
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
              })
          ));
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }

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
        // Optimal safety buffer (24px) guarantees that table cells and padding
        // never overflow past the 20mm A4 boundary while maximizing printable space.
        const safety = 6;
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
          host.style.padding = '0';
          host.style.margin = '0';
          host.style.border = 'none';
          const measuredWidth = template ? template.getBoundingClientRect().width : 0;
          host.style.width = measuredWidth && measuredWidth > 200 && measuredWidth < 650 ? `${measuredWidth}px` : '415px';
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

          // If too few words, keep intact
          if (words.length < 4) return [element.outerHTML];

          const host = createMeasureHost(template);
          const safetyLimit = Math.max(1, maxHeight - 1);
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

          // Binary search for how many words [0 .. best] fit into maxHeight
          let low = 1;
          let high = words.length - 1;
          let best = 0;

          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const candidate = buildCandidate(0, mid);
            if (fits(candidate)) {
              best = mid;
              low = mid + 1;
            } else {
              high = mid - 1;
            }
          }

          host.remove();

          if (best < 2 || best >= words.length) {
            return [element.outerHTML];
          }

          const chunk0 = buildCandidate(0, best);
          const chunk1 = buildCandidate(best, words.length);
          return [chunk0, chunk1];
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

            const safetyLimit = Math.max(1, maxHeight - 1);
            const host = createMeasureHost(template);
            const fits = (candidate: string) => {
              host.innerHTML = candidate;
              return host.getBoundingClientRect().height <= safetyLimit;
            };

            // Multiple independent top-level blocks: fit as many whole blocks as possible
            if (elements.length > 1 && !hasTopLevelText) {
              if (fits(source)) {
                host.remove();
                return [source];
              }

              let fitCount = 0;
              for (let i = 0; i < elements.length; i++) {
                const candidate = elements.slice(0, i + 1).map((el) => el.outerHTML).join('');
                if (fits(candidate)) {
                  fitCount = i + 1;
                } else {
                  break;
                }
              }

              host.remove();
              if (fitCount > 0 && fitCount < elements.length) {
                return [
                  elements.slice(0, fitCount).map((el) => el.outerHTML).join(''),
                  elements.slice(fitCount).map((el) => el.outerHTML).join('')
                ];
              }
              // If the first element itself is taller than the remaining space,
              // try the same content-driven splitter on that element
              if (fitCount === 0 && elements.length > 0 && maxHeight >= 20) {
                const firstParts = splitHtmlForCapacity(elements[0].outerHTML, maxHeight, template);
                if (firstParts.length > 1) {
                  return [firstParts[0], [firstParts[1], ...elements.slice(1).map((el) => el.outerHTML)].join('')];
                }
              }
              return [source];
            }

            // Table splitting row-by-row: allows procedures or tables to continue naturally to next page
            if (first.tagName.toLowerCase() === 'table') {
              const table = first;
              const thead = table.querySelector('thead');
              const theadHtml = thead ? thead.outerHTML : '';
              const allRows = Array.from(table.querySelectorAll('tr'));
              const bodyRows = allRows.filter((r) => !thead || !thead.contains(r));

              if (bodyRows.length > 1) {
                if (fits(table.outerHTML)) {
                  host.remove();
                  return [source];
                }

                const tableTag = 'table';
                const tableAttrs = Array.from(table.attributes)
                  .map((attr) => ` ${attr.name}="${attr.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
                  .join('');

                const makeTable = (rowHtmls: string[], includeThead = true) => {
                  return `<${tableTag}${tableAttrs}>${includeThead ? theadHtml : ''}<tbody>${rowHtmls.join('')}</tbody></${tableTag}>`;
                };

                let fitCount = 0;
                for (let i = 0; i < bodyRows.length; i++) {
                  const candidate = makeTable(bodyRows.slice(0, i + 1).map((r) => r.outerHTML), true);
                  if (fits(candidate)) {
                    fitCount = i + 1;
                  } else {
                    break;
                  }
                }

                if (fitCount > 0 && fitCount < bodyRows.length) {
                  host.remove();
                  const firstTable = makeTable(bodyRows.slice(0, fitCount).map((r) => r.outerHTML), true);
                  const secondTable = makeTable(bodyRows.slice(fitCount).map((r) => r.outerHTML), Boolean(theadHtml));
                  return [firstTable, secondTable];
                }
              }
            }

            // Ordered/unordered lists: keep list structure and ONLY split at WHOLE <li> item boundaries.
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
                .filter((attr) => {
                  const n = attr.name.toLowerCase();
                  return !(isOl && n === 'start') && n !== 'style' && n !== 'data-sop-list-continuation' && n !== 'data-sop-continuation-number';
                })
                .map((attr) => ` ${attr.name}="${attr.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
                .join('');

              const makeList = (itemHtmls: string[], startIndex: number, continuation = false, continuationNumber?: number) => {
                const number = continuationNumber ?? (explicitStart + startIndex);
                const itemsWithContinuationMarker = continuation
                  ? itemHtmls.map((itemHtml) => itemHtml.replace(/^<li\b/i, '<li data-sop-continuation-li="true"'))
                  : itemHtmls;
                const counterStyle = isOl ? ` style="counter-reset: sop-list ${number - 1};--sop-start-offset: ${number - 1};"` : '';
                return `<${listTag}${listAttrs}${isOl && !continuation ? ` start="${number}"` : ''}${counterStyle}${continuation ? ` data-sop-list-continuation="true" data-sop-continuation-number="${number}"` : ''}>${itemsWithContinuationMarker.join('')}</${listTag}>`;
              };

              if (items.length > 0) {
                const fullList = first.outerHTML;
                if (fits(fullList)) {
                  host.remove();
                  return [source];
                }

                // Greedily find how many whole items fit into maxHeight
                let fitCount = 0;
                for (let i = 0; i < items.length; i++) {
                  const candidate = makeList(items.slice(0, i + 1).map((el) => el.outerHTML), 0);
                  if (fits(candidate)) {
                    fitCount = i + 1;
                  } else {
                    break;
                  }
                }

                // Case 1: At least 1 whole item fits, and some items remain for next page
                if (fitCount > 0 && fitCount < items.length) {
                  host.remove();
                  const firstPart = makeList(items.slice(0, fitCount).map((el) => el.outerHTML), 0);
                  const remainingPart = makeList(items.slice(fitCount).map((el) => el.outerHTML), fitCount, false, explicitStart + fitCount);
                  return [firstPart, remainingPart];
                }

                // Case 2: Not even the first item fits in maxHeight
                if (fitCount === 0) {
                  const item = items[0];
                  const itemParts = splitElementPreservingMarkup(
                    item,
                    maxHeight,
                    (fragment, isFirstChunk) => {
                      const li = item.cloneNode(false) as HTMLElement;
                      li.removeAttribute('id');
                      li.innerHTML = '';
                      li.appendChild(fragment);
                      return makeList([li.outerHTML], 0, !isFirstChunk, explicitStart);
                    },
                    template
                  );
                  if (itemParts.length > 1) {
                    const firstPart = itemParts[0];
                    const restItemParts = itemParts.slice(1);
                    const remainingItems = items.slice(1).map((el) => el.outerHTML);
                    const continuation = [
                      ...restItemParts,
                      ...(remainingItems.length ? [makeList(remainingItems, 1, false, explicitStart + 1)] : [])
                    ].join('');
                    host.remove();
                    return [firstPart, continuation];
                  }
                  host.remove();
                  return [source];
                }

                host.remove();
                return [source];
              }
            }

            // Descendant lists (nested inside divs/sections)
            const descendantLists = Array.from(doc.body.querySelectorAll('ol, ul')).filter((list) => {
              let parent = list.parentElement;
              while (parent && parent !== doc.body) {
                if (/^(ol|ul)$/i.test(parent.tagName)) return false;
                parent = parent.parentElement;
              }
              return true;
            }) as HTMLElement[];

            if (descendantLists.length > 0 && !/^(ol|ul)$/i.test(first.tagName)) {
              const targetList = descendantLists[0];

              let surroundingHeight = 0;
              try {
                const surrounding = doc.body.cloneNode(true) as HTMLElement;
                const surroundingLists = Array.from(surrounding.querySelectorAll('ol, ul')).filter((list) => {
                  let parent = list.parentElement;
                  while (parent && parent !== surrounding) {
                    if (/^(ol|ul)$/i.test(parent.tagName)) return false;
                    parent = parent.parentElement;
                  }
                  return true;
                }) as HTMLElement[];
                const surroundingTarget = surroundingLists[0];
                if (surroundingTarget) {
                  surroundingTarget.innerHTML = '';
                  const surroundingHost = createMeasureHost(template);
                  surroundingHost.innerHTML = surrounding.innerHTML;
                  surroundingHeight = surroundingHost.getBoundingClientRect().height;
                  surroundingHost.remove();
                }
              } catch {
                surroundingHeight = 0;
              }

              const listCapacity = Math.max(1, maxHeight - surroundingHeight);
              const listParts = splitHtmlForCapacity(targetList.outerHTML, listCapacity, template);

              if (listParts.length > 1) {
                const makeFragmentWithList = (replacement: string) => {
                  const cloned = doc.body.cloneNode(true) as HTMLElement;
                  const lists = Array.from(cloned.querySelectorAll('ol, ul')).filter((list) => {
                    let parent = list.parentElement;
                    while (parent && parent !== cloned) {
                      if (/^(ol|ul)$/i.test(parent.tagName)) return false;
                      parent = parent.parentElement;
                    }
                    return true;
                  }) as HTMLElement[];
                  const target = lists[0];
                  if (!target) return cloned.innerHTML;
                  const replacementDoc = parser.parseFromString(replacement, 'text/html');
                  const replacementNodes = Array.from(replacementDoc.body.childNodes).map((node) =>
                    cloned.ownerDocument.importNode(node, true)
                  );
                  const parent = target.parentNode;
                  if (!parent) return cloned.innerHTML;
                  const marker = cloned.ownerDocument.createDocumentFragment();
                  replacementNodes.forEach((node) => marker.appendChild(node));
                  parent.replaceChild(marker, target);
                  return cloned.innerHTML;
                };

                let chosenFirst = '';
                let chosenSecond = '';
                for (let i = listParts.length - 1; i >= 1; i--) {
                  const firstCandidate = makeFragmentWithList(listParts.slice(0, i).join(''));
                  if (fits(firstCandidate)) {
                    chosenFirst = firstCandidate;
                    const secondReplacement = listParts.slice(i).join('');
                    chosenSecond = makeFragmentWithList(secondReplacement);
                    break;
                  }
                }

                if (chosenFirst && chosenSecond) {
                  host.remove();
                  return [chosenFirst, chosenSecond];
                }
              }
            }

            // A wrapper containing multiple real block elements: fit as many whole blocks as possible
            const nestedBlockElements = Array.from(first.children).filter((child) =>
              /^(p|ol|ul|table|blockquote|pre|h1|h2|h3|h4|h5|h6|section|article|div|figure)$/i.test(child.tagName)
            ) as HTMLElement[];

            if (nestedBlockElements.length > 0) {
              const childBlocks: string[] = [];
              let inlineBuffer = '';

              const flushInlineBuffer = () => {
                if (inlineBuffer.trim()) childBlocks.push(`<p>${inlineBuffer}</p>`);
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
                  childBlocks.push(childEl.outerHTML);
                } else {
                  inlineBuffer += childEl.outerHTML;
                }
              });
              flushInlineBuffer();

              if (childBlocks.length > 1) {
                if (fits(childBlocks.join(''))) {
                  host.remove();
                  return [source];
                }

                let fitCount = 0;
                for (let i = 0; i < childBlocks.length; i++) {
                  const candidate = childBlocks.slice(0, i + 1).join('');
                  if (fits(candidate)) {
                    fitCount = i + 1;
                  } else {
                    break;
                  }
                }

                host.remove();
                if (fitCount > 0 && fitCount < childBlocks.length) {
                  return [
                    childBlocks.slice(0, fitCount).join(''),
                    childBlocks.slice(fitCount).join('')
                  ];
                }
                return [source];
              }
            }

            // Single paragraph or element: split by word boundary preserving markup
            if (!fits(source)) {
              if (maxHeight < 24) {
                host.remove();
                return [source];
              }

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

        // FLOW PAGINATION:
        // Purely content-driven, natural page breaks. No forced section breaks.
        // A section continues seamlessly across pages when space permits.
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

        const hasVisibleContent = (blocks: OfficialBlock[]) => {
          return blocks.some((b) => {
            const raw = (b.html || '').trim();
            if (!raw) return false;
            if (/<(img|table|svg|figure|iframe)\b/i.test(raw)) return true;
            const text = raw.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/g, '').trim();
            return text.length > 0;
          });
        };

        const commitCurrentPageAndStartNext = () => {
          if (currentPageBlocks.length && hasVisibleContent(currentPageBlocks)) {
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
          const chrome = startsNewSectionRow ? chromeBySection(block.section) : 0;
          const needed = flowHeights[index] + chrome;

          // Check if this block exceeds remaining capacity on the current page
          if (used + needed > capacity) {
            const remaining = capacity - used - chrome;
            const template = measuredContent[Math.min(index, measuredContent.length - 1)] || null;

            // Content-driven: if space remains on the current page (>= 20px), fill it as much as possible!
            if (remaining >= 20 && template) {
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

            // Current page already has content and cannot fit more of this block:
            // Naturally commit current page and continue on next page!
            if (currentPageBlocks.length > 0) {
              commitCurrentPageAndStartNext();
              continue;
            }

            // If currentPageBlocks is empty (fresh page) and block is taller than the whole page:
            if (currentPageBlocks.length === 0 && capacity >= 40 && template) {
              const pageRemaining = capacity - chrome;
              const parts = splitHtmlForCapacity(block.html, pageRemaining, template);
              if (parts.length > 1) {
                const firstPart = parts[0];
                const restParts = parts.slice(1);
                const firstHeight = measureFlowPart(firstPart, template);
                const firstNeeded = firstHeight + chrome;

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
                commitCurrentPageAndStartNext();
                continue;
              }
            }

            // Indivisible block fallback
            currentPageBlocks.push(block);
            used += needed;
            currentSection = block.section;
            index += 1;
            commitCurrentPageAndStartNext();
            continue;
          }

          // Content fits comfortably on current page
          currentPageBlocks.push(block);
          used += needed;
          currentSection = block.section;
          index += 1;
        }

        if (guard >= 10000) {
          throw new Error('Pagination SPO berhenti karena batas pengaman tercapai.');
        }

        if (currentPageBlocks.length && hasVisibleContent(currentPageBlocks)) {
          pages.push(currentPageBlocks);
        }
        const validPages = pages.filter((page) => page.length > 0 && hasVisibleContent(page));
        const finalPages = validPages.length > 0 ? validPages : [flowBlocks];

        if (!cancelled) {
          setOfficialPages(normalizeOfficialPages(finalPages));
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
  const isAccessible = Boolean(userSession) && (userSession.role === 'admin' || isSopAccessibleByUser(sop, userSession));
  const showSignatureAndStamp = shouldShowSignatureAndStamp(sop) || Boolean(isExistingDocx && sop.status === 'AKTIF');

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
              // SAME LI CONTINUES ON THE NEXT PAGE: this fragment is continuation text,
              // not a new procedure item. Never render a second number (e.g. another "3.").
              // The CSS selector for data-sop-continuation-li removes the marker entirely.
              list.removeAttribute('start');
              list.style.removeProperty('counter-reset');
              list.style.removeProperty('--sop-start-offset');
              items.forEach((li) => {
                li.setAttribute('data-sop-continuation-li', 'true');
              });
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
            <div className="font-extrabold text-[13px] leading-tight tracking-tight uppercase font-bookman text-black">
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
          <div className="font-extrabold text-[14px] uppercase tracking-tight font-bookman text-black leading-tight break-words [overflow-wrap:break-word] [word-break:normal] [hyphens:none]">
            {(sop.title || 'JUDUL STANDAR PROSEDUR OPERASIONAL').toUpperCase()}
          </div>
        </td>
      </tr>
      <tr className="text-center">
        <td className="p-1.5 align-top bg-white" style={{ border: '1px solid #000000', verticalAlign: 'top' }}>
          <div className="font-bold text-[11px] uppercase font-bookman text-black">NO. DOKUMEN</div>
          <div className="font-bold text-[12px] font-bookman text-black mt-1 break-words [overflow-wrap:break-word] [word-break:normal]">
            {sop.sopNumber || '/……./….. /2026'}
          </div>
        </td>
        <td className="p-1.5 align-top bg-white" style={{ border: '1px solid #000000', verticalAlign: 'top' }}>
          <div className="font-bold text-[11px] uppercase font-bookman text-black">NO. REVISI</div>
          <div className="font-bold text-[12px] font-bookman text-black mt-1 break-words">
            {sop.revisionNumber || sop.version || (getStandardJenisSpo(sop) === 'RIVIU' ? '01' : '00')}
          </div>
        </td>
        <td className="p-1.5 align-top bg-white" style={{ border: '1px solid #000000', verticalAlign: 'top' }}>
          <div className="font-bold text-[11px] uppercase font-bookman text-black">HALAMAN</div>
          <div className="font-bold text-[12px] font-bookman text-black mt-1">{pageNumber} / {pageTotal}</div>
        </td>
      </tr>
    </thead>
  );

  const renderPublicationRow = () => (
    <tr className="sop-first-page-only">
      <td
        className="p-1.5 text-center align-middle font-extrabold uppercase font-bookman text-black bg-white sop-document-type-label"
        style={{ border: '1px solid #000000', verticalAlign: 'middle' }}
      >
        <div>STANDAR</div><div>PROSEDUR</div><div>OPERASIONAL</div>
      </td>
      <td className="p-1.5 text-center align-top bg-white" style={{ border: '1px solid #000000', verticalAlign: 'top' }}>
        <div className="text-[11px] font-bookman text-black">Tanggal terbit</div>
        <div className="font-bold text-[12px] font-bookman text-black mt-1 break-words">{sop.effectiveDate || '…………….2026'}</div>
      </td>
      <td colSpan={2} className="p-1.5 text-center align-top bg-white relative overflow-visible" style={{ border: '1px solid #000000', verticalAlign: 'top' }}>
        <div className="text-[11px] font-bookman text-black leading-tight">Ditetapkan,</div>
        <div className="font-bold text-[13px] font-bookman text-black leading-tight mt-0.5 relative z-0">Direktur RSUD Dr. Soegiri Lamongan</div>
        {showSignatureAndStamp ? (
          <div className="relative -my-5 flex items-center justify-center w-full max-w-[260px] mx-auto z-10 pointer-events-none">
            <DirectorSignature className="h-[100px] w-auto max-w-[260px]" />
          </div>
        ) : (
          <div className="h-[38px] my-1 flex items-center justify-center text-slate-400 italic text-[10px] font-bookman">(Dokumen Diarsipkan)</div>
        )}
        <div className="relative z-0 space-y-0.5">
          <div className="font-bold text-[13px] underline font-bookman text-black leading-tight whitespace-normal break-words">{sop.direkturNama || SOEGIRI_HOSPITAL_INFO.director.name}</div>
          <div className="text-[11px] font-bookman text-black leading-tight whitespace-normal break-words">
            {(!sop.direkturPangkat || sop.direkturPangkat.toLowerCase().includes('direktur')) ? SOEGIRI_HOSPITAL_INFO.director.rank : sop.direkturPangkat}
          </div>
          <div className="font-bold text-[11px] font-bookman text-black leading-tight whitespace-normal break-words">NIP. {sop.direkturNip || SOEGIRI_HOSPITAL_INFO.director.nip}</div>
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

      // Keep public image assets as normal URLs. Do NOT inline them as base64:
      // the official director signature/stamp can be large enough to push the
      // JSON request over the server/proxy 413 limit. The trusted PDF renderer
      // resolves the official local assets server-side.
      // Existing data/blob URLs are intentionally preserved.
      const exportImages = Array.from(clonedRoot.querySelectorAll<HTMLImageElement>('img'));
      exportImages.forEach((img) => {
        const src = img.getAttribute('src');
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
        try {
          img.setAttribute('src', new URL(src, window.location.href).href);
        } catch {
          // Leave the original source untouched; Chromium may still resolve it
          // through the document base URL.
        }
      });

      // PDF MUST use the real A4 page nodes, never the responsive screen-scale
      // wrappers used by the preview. Those wrappers can contain an inline
      // transform: scale(...) which makes Chromium shrink/offset the entire
      // official document and destroys the intended A4 structure.
      // Extract ONLY clean A4 pages from clonedRoot, stripping ALL preview scaling wrappers.
      const pageNodes = Array.from(clonedRoot.querySelectorAll<HTMLElement>('.sop-preview-page'));
      if (pageNodes.length > 0) {
        clonedRoot.innerHTML = '';
        pageNodes.forEach((page) => {
          page.style.removeProperty('transform');
          page.style.removeProperty('transform-origin');
          page.style.removeProperty('margin-bottom');
          page.style.margin = '0 auto';
          clonedRoot.appendChild(page);
        });
      }

      // Crucial: remove all measurement artifacts and no-print elements
      clonedRoot.querySelectorAll('.no-print, .sop-measure-root, [data-measure-page]').forEach(node => node.remove());

      clonedRoot.classList.add('pdf-export-document');

      const buildAuthHeaders = async (forceRefresh = false) => {
        const token = await getCurrentAuthToken(forceRefresh).catch(() => null);
        const persisted = getPersistedClientSession();
        if (!token && !persisted?.sessionId) {
          throw new Error('Sesi login tidak valid. Silakan login kembali.');
        }
        return {
          'Accept': 'application/pdf, application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(persisted?.sessionId ? { 'X-Session-Id': persisted.sessionId, 'X-Soegiri-Session-Id': persisted.sessionId } : {}),
          ...(persisted?.authUid ? { 'X-Soegiri-Auth-Uid': persisted.authUid } : {}),
          ...(persisted?.username ? { 'X-User-Username': persisted.username } : {})
        };
      };

      const pdfPayload = JSON.stringify({
        html: clonedRoot.outerHTML,
        css: cssParts.join('\n'),
        baseUrl: window.location.origin,
        authUid,
        sopNumber: sop.sopNumber,
        title: previewTitle,
        filename: previewTitle || sop.sopNumber || `SPO_${sop.id}`
      });

      const candidateEndpoints = [
        '/api/pdf',
        'https://asia-southeast2-gen-lang-client-0880840770.cloudfunctions.net/pdfApi',
        'https://pdfapi-n7zygxitla-et.a.run.app'
      ];

      let response: Response | null = null;
      let lastFailureMsg = '';

      for (const endpoint of candidateEndpoints) {
        try {
          const headers = await buildAuthHeaders(false);
          let res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: pdfPayload
          });

          // If session expired, refresh once and retry
          if (res.status === 401) {
            try {
              await refreshUserSessionProfile().catch(() => undefined);
              const refreshedHeaders = await buildAuthHeaders(true);
              res = await fetch(endpoint, {
                method: 'POST',
                headers: refreshedHeaders,
                body: pdfPayload
              });
            } catch (err) {
              console.warn('[PDF Download] Token refresh attempt failed:', err);
            }
          }

          if (res.ok) {
            response = res;
            break;
          }

          const rawErr = await res.text().catch(() => '');
          lastFailureMsg = `HTTP ${res.status}: ${rawErr.slice(0, 200)}`;
          console.warn(`[PDF Download] Endpoint ${endpoint} failed with ${res.status}`);
        } catch (fetchErr: any) {
          lastFailureMsg = fetchErr?.message || 'Gagal menghubungi server PDF';
          console.warn(`[PDF Download] Endpoint ${endpoint} request failed:`, fetchErr);
        }
      }

      if (!response || !response.ok) {
        let message = `PDF gagal dibuat. Silakan coba kembali sesaat lagi.`;
        if (response) {
          const rawText = await response.text().catch(() => '');
          try {
            const payload = JSON.parse(rawText);
            if (payload?.message) {
              message = payload.detail && payload.detail !== payload.message
                ? `${payload.message} (${payload.detail})`
                : payload.message;
            } else if (rawText) {
              message = `PDF gagal dibuat (${rawText.slice(0, 250)})`;
            }
          } catch {
            if (rawText && !rawText.includes('<!DOCTYPE html>')) {
              message = `PDF gagal dibuat: ${rawText.slice(0, 250)}`;
            } else if (lastFailureMsg) {
              message = `PDF gagal dibuat: ${lastFailureMsg}`;
            }
          }
        } else if (lastFailureMsg) {
          message = `PDF gagal dibuat: ${lastFailureMsg}`;
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
      const userMsg = error?.message || 'PDF gagal dibuat. Silakan coba lagi.';
      const shouldFallback = window.confirm(
        `${userMsg}\n\nIngin membuka pratinjau cetak / simpan PDF melalui browser sekarang?`
      );
      if (shouldFallback) {
        handlePrintOfficialSop();
      }
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
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-mono font-bold bg-blue-50 text-blue-900 border border-blue-200 shrink-0">
              {sop.divisionCode} {sop.subHierarchyCode ? `/ ${sop.subHierarchyCode}` : ''}
            </span>
            <span className="text-xs text-slate-600 font-semibold truncate max-w-[120px] sm:max-w-[220px]">
              {sop.title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
            {/* EDIT DOKUMEN / UBAH NOMOR */}
            {(Boolean(userSession) && (userSession.role === 'admin' || isSopAccessibleByUser(sop, userSession))) && (
              <AdminTooltip
                title="Edit & Registrasi Nomor"
                content="Perbarui isi dokumen SPO atau sesuaikan nomor registrasi naskah."
                side="bottom"
              >
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEdit(sop);
                  }}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 border border-blue-300 rounded-xl shadow-2xs transition-colors cursor-pointer min-h-[36px]"
                >
                  <Edit3 className="w-3.5 h-3.5 text-blue-800" />
                  <span className="hidden sm:inline">Edit / Ubah Nomor</span>
                  <span className="sm:hidden">Edit</span>
                </button>
              </AdminTooltip>
            )}

            {/* DOWNLOAD PDF RESMI — hanya untuk SPO Baru/Riviu */}
            {!isExisting && (
              <AdminTooltip
                title="Simpan PDF Standar Resmi"
                content="Generate berkas PDF berstandar cetak A4 sesuai format baku RSUD Dr. Soegiri."
                side="bottom"
              >
                <button
                  type="button"
                  onClick={handleDownloadDirectPdf}
                  disabled={isPdfGenerating || isPaginatingOfficial}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 active:bg-blue-950 disabled:bg-blue-400 rounded-xl shadow-2xs transition-colors cursor-pointer disabled:cursor-wait min-h-[36px]"
                >
                  {isPdfGenerating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">{isPdfGenerating ? 'Membuat PDF…' : 'Simpan PDF'}</span>
                  <span className="sm:hidden">{isPdfGenerating ? '...' : 'PDF'}</span>
                </button>
              </AdminTooltip>
            )}

            {/* PREVIEW PDF ASLI — khusus SPO Eksisting */}
            {isExisting && legacyFileUrl && (
              <AdminTooltip
                title="Buka PDF Asli"
                content="Pratinjau naskah PDF asli bertanda tangan fisik basah pada tampilan layar penuh."
                side="bottom"
              >
                <button
                  type="button"
                  onClick={() => setIsFullscreenDocOpen(true)}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 active:bg-blue-950 rounded-xl shadow-2xs transition-colors cursor-pointer min-h-[36px]"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview PDF</span>
                </button>
              </AdminTooltip>
            )}

            {!isExisting && (
              <AdminTooltip
                title="Cetak Naskah"
                content="Kirim dokumen langsung ke jendela cetak peramban atau mesin pencetak fisik."
                side="bottom"
              >
                <button
                  type="button"
                  onClick={handlePrintOfficialSop}
                  className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 active:bg-slate-200 rounded-xl border border-slate-300 transition-colors cursor-pointer min-h-[36px]"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak</span>
                </button>
              </AdminTooltip>
            )}

            <AdminTooltip
              title="Tutup Pratinjau"
              content="Tutup dialog pratinjau dan kembali ke katalog naskah."
              side="bottom"
            >
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-colors cursor-pointer ml-1 min-h-[36px] min-w-[36px] flex items-center justify-center"
                aria-label="Tutup Pratinjau"
              >
                <X className="w-5 h-5" />
              </button>
            </AdminTooltip>
          </div>
        </div>

        {/* Modal Body */}
        <div ref={modalBodyRef} className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
          
          {isExisting && !isExistingDocx ? (
            <div className="space-y-4">
              <PreviewMetadata users={users} sop={sop} kind="EKSISTING" />
              {isLoadingLegacyFile ? (
                <div className="flex flex-col items-center justify-center gap-3 p-12 bg-white rounded-2xl border border-slate-200 min-h-[380px]">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-800" />
                  <p className="text-xs font-semibold text-slate-600">Memuat PDF asli SPO Eksisting...</p>
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
              <PreviewMetadata users={users} sop={sop} kind={isReviewDoc ? "RIVIU" : isExistingDocx ? "EKSISTING" : "BARU"} />
              {isExistingDocx && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-semibold text-blue-900">
                  DOCX digunakan sebagai sumber pengisian LiveForm. Pratinjau menampilkan dokumen final dengan format resmi SPO.
                </div>
              )}

              {/* FORMAT RESMI BAKU (Halaman 6 RSUD Soegiri - untuk SPO Baru/Riviu) */}
          {activeTab === 'official_format' && (
            <div className="space-y-4 sm:space-y-6">
              

              {/* BUKTI SPO LAMA — metadata utama sudah digabung di PreviewMetadata agar tidak ada data Riviu yang tampil dua kali */}
              {isReviewDoc && (sop.oldFileName || legacyFileUrl) && (
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs no-print">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-blue-900 flex items-center justify-center shrink-0">
                        <FileCheck2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900">Berkas Bukti SPO Lama</div>
                        <div className="text-[11px] text-slate-500 truncate">{sop.oldFileName || 'Bukti Riviu'}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => legacyFileUrl && triggerFileDownload(legacyFileUrl, sop.oldFileName || 'Bukti-Riviu.pdf')}
                      disabled={!legacyFileUrl}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh Bukti</span>
                    </button>
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
                        {showSignatureAndStamp ? (
                          <div className="relative -my-5 sm:-my-6 flex items-center justify-center w-full max-w-[260px] mx-auto z-10 pointer-events-none">
                            <DirectorSignature className="h-[96px] sm:h-[106px] w-auto max-w-[260px]" />
                          </div>
                        ) : (
                          <div className="h-[44px] flex items-center justify-center text-slate-400 italic text-xs">
                            (Dokumen Diarsipkan)
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
                      className="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed"
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
                          <AdminTooltip
                            title="Tata Letak A4"
                            content="Tampilkan lembar resmi sesuai proporsi kertas cetak A4."
                            side="bottom"
                          >
                            <button
                              type="button"
                              onClick={() => setMobileViewMode('a4')}
                              className={`px-1.5 py-1 rounded text-[9px] font-semibold transition-colors cursor-pointer ${
                                mobileViewMode === 'a4' ? 'bg-slate-100 text-indigo-700' : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              A4
                            </button>
                          </AdminTooltip>

                          <AdminTooltip
                            title="Mode Baca HP"
                            content="Format baca responsif yang nyaman untuk layar smartphone."
                            side="bottom"
                          >
                            <button
                              type="button"
                              onClick={() => setMobileViewMode('reader')}
                              className={`px-1.5 py-1 rounded text-[9px] font-semibold transition-colors cursor-pointer ${
                                mobileViewMode === 'reader' ? 'bg-slate-100 text-teal-700' : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              HP
                            </button>
                          </AdminTooltip>

                          {mobileViewMode === 'a4' && (
                            <AdminTooltip
                              title="Skala Lembar"
                              content="Beralih antara tampilan pas lebar layar (Fit) atau ukuran asli (100%)."
                              side="bottom"
                            >
                              <button
                                type="button"
                                onClick={() => setZoomScale(zoomScale === 'fit' ? 1.0 : 'fit')}
                                className="px-1.5 py-1 rounded text-[9px] font-semibold text-slate-500 hover:text-indigo-700 transition-colors cursor-pointer"
                              >
                                {zoomScale === 'fit' ? `Fit ${Math.round(fitScale * 100)}%` : `${Math.round((zoomScale as number) * 100)}%`}
                              </button>
                            </AdminTooltip>
                          )}
                        </div>
                      )}

                      <table
                        className="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed"
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
                        className="sop-scaled-page-wrap w-full flex flex-col items-center justify-center overflow-x-auto touch-pan-x"
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
              {canUserActivateSop(sop, userSession) ? (
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
              {canUserActivateSop(sop, userSession) && sop.status === 'DRAFT' && onActivateSop && (
                <AdminTooltip
                  title={isExisting ? "Setujui & Terbitkan Naskah" : "Aktivasi Dokumen SPO Resmi"}
                  content={isExisting ? "Validasi arsip SPO eksisting dan ubah status menjadi AKTIF." : "Sahkan naskah standar SPO ini agar resmi berlaku di RSUD Dr. Soegiri."}
                  side="top"
                >
                  <button
                    onClick={() => onActivateSop(sop)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors cursor-pointer shadow-sm"
                  >
                    <Stamp className="w-3.5 h-3.5" />
                    <span>{isExisting ? 'Setujui Dokumen' : 'Aktivasi Dokumen'}</span>
                  </button>
                </AdminTooltip>
              )}

              {!canUserActivateSop(sop, userSession) && sop.status === 'DRAFT' && (
                sop.activationRequestedAt ? (
                  <AdminTooltip
                    title="Menunggu Persetujuan"
                    content={`Naskah telah diusulkan oleh ${sop.activationRequestedBy || 'Pengguna'} pada ${new Date(sop.activationRequestedAt).toLocaleDateString('id-ID')}. Menunggu pengesahan Admin.`}
                    side="top"
                  >
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200/80 rounded-xl cursor-default"
                    >
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Menunggu Persetujuan Admin</span>
                    </span>
                  </AdminTooltip>
                ) : onProposeActivation ? (
                  <AdminTooltip
                    title="Usulkan Pengesahan SPO"
                    content="Kirimkan naskah draf ini ke administrator / Direktur untuk ditinjau dan diaktifkan."
                    side="top"
                  >
                    <button
                      type="button"
                      onClick={() => onProposeActivation(sop)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-xl transition-colors cursor-pointer shadow-sm"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Usulkan Aktivasi</span>
                    </button>
                  </AdminTooltip>
                ) : null
              )}

              {(userSession?.role === 'admin' || canUserActivateSop(sop, userSession)) && onDelete && (
                <AdminTooltip
                  title="Hapus Naskah SPO"
                  content="Hapus dokumen SPO ini secara permanen dari pangkalan data."
                  side="top"
                >
                  <button
                    onClick={() => onDelete(sop)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                </AdminTooltip>
              )}

              <AdminTooltip
                title="Tutup Modal"
                content="Tutup tampilan pratinjau dokumen."
                side="top"
              >
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </AdminTooltip>
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