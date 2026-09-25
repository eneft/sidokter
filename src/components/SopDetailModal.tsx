import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  EyeOff,
  ExternalLink,
  Trash2,
  RefreshCw,
  Stamp,
  Lock,
  Loader2,
  BookOpen,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { canEditExistingSop } from '../lib/sopEditPolicy';
import { SopDocument, SopStatus, UserSession, UserAccount, getStandardJenisSpo } from '../types';
import { formatBytes } from '../utils/numbering';
import { SOEGIRI_HOSPITAL_INFO, isSopAccessibleByUser, canUserActivateSop } from '../utils/soegiriStructure';
import { HospitalLogo } from './HospitalLogo';
import { DirectorSignature } from './DirectorSignature';
import { triggerFileDownload, openDocumentPreview, getFileFromPersistentCacheAsync, resolveProtectedStorageUrl } from '../utils/fileStorage';
import { RichTextRenderer, hasHtmlTags, cleanSopRichContent } from './RichTextRenderer';
import { getPersistedClientSession, getCurrentAuthToken, refreshUserSessionProfile } from '../lib/authService';
import { buildStoragePathUrl } from '../lib/cloudStorageService';
import { shouldShowSignatureAndStamp } from '../utils/documentUtils';
import { DocumentViewer } from './DocumentViewer';
import { AdminTooltip } from './AdminTooltip';
import { normalizeSupportingEvidence } from '../utils/supportingEvidence';
import { SopReviewAction } from '../lib/sopReviewService';
import { getExistingPdfSources, ExistingPdfStorageSlot } from '../lib/existingPdfSource';
import { responseToPdfBlob } from '../utils/pdfBinary';
import { buildOfficialBlocks, computeCanonicalA4Pages } from '../utils/canonicalA4Pagination';

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
  onReviewWorkflow?: (sop: SopDocument, action: SopReviewAction, note?: string) => Promise<void>;
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
    return Number.isNaN(d.getTime())
      ? value
      : d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Data lama yang masih menyimpan username di activationRequestedBy di-resolve
  // kembali ke direktori akun agar preview tidak menampilkan username.
  const proposerAccount = users?.find((u) =>
    String(u.username || '').trim().toLowerCase() === String(sop.activationRequestedBy || '').trim().toLowerCase()
  );
  const proposer = proposerAccount?.name || sop.activationRequestedBy || sop.creatorName || '-';
  const proposerUnit = sop.creatorUnit || sop.divisionName || '-';

  const isActive = sop.status === 'AKTIF';
  const typeLabel = kind === 'BARU' ? 'SPO Baru' : kind === 'EKSISTING' ? 'SPO Existing' : 'SPO Hasil Riviu';

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden no-print" aria-label="Informasi dokumen SPO">
      <div className="px-4 sm:px-5 py-2.5 border-b border-slate-100 flex items-center justify-between gap-3">
        <span className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-900 border border-blue-200">
          {typeLabel}
        </span>
      </div>

      <div className="px-4 sm:px-5 py-3">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-5 gap-y-2.5 text-xs">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold text-slate-500">Nomor</div>
            <div className="mt-0.5 font-mono text-[11px] font-bold text-blue-900 break-words leading-tight">{sop.sopNumber || '-'}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-semibold text-slate-500">Pengusul</div>
            <div className="mt-0.5 text-[11px] font-semibold text-slate-800 break-words leading-tight">{proposer}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-semibold text-slate-500">Unit</div>
            <div className="mt-0.5 text-[11px] font-semibold text-slate-800 break-words leading-tight">{proposerUnit}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-semibold text-slate-500">Tanggal Terbit</div>
            <div className="mt-0.5 text-[11px] font-semibold text-slate-800 leading-tight">{fmt(sop.effectiveDate)}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-semibold text-slate-500">Revisi</div>
            <div className="mt-0.5 text-[11px] font-semibold text-slate-800 leading-tight">{sop.revisionNumber || sop.version || '00'}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-semibold text-slate-500">Penetap</div>
            <div className="mt-0.5 text-[11px] font-semibold text-slate-800 break-words leading-tight">{sop.approverName || sop.direkturNama || SOEGIRI_HOSPITAL_INFO.director.name}</div>
          </div>
        </div>

        {kind === 'RIVIU' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 mt-3 pt-2.5 border-t border-slate-100">
            <div className="min-w-0">
              <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">SPO Lama yang Diriviu</span>
              <span className="mt-0.5 block text-[10px] font-mono font-bold text-blue-900 break-words leading-tight">{sop.oldSopNumber || sop.previousSopNumber || '-'}</span>
            </div>
            <div className="min-w-0">
              <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Alasan Riviu</span>
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
  users,
  onReviewWorkflow
}) => {
  const [copied, setCopied] = useState(false);
  const [officialPdfBlob, setOfficialPdfBlob] = useState<Blob | null>(null);
  const [isOfficialPdfLoading, setIsOfficialPdfLoading] = useState(false);
  const [officialPdfError, setOfficialPdfError] = useState<string | null>(null);
  const [officialPages, setOfficialPages] = useState<OfficialBlock[][]>([]);
  const [layoutBlocks, setLayoutBlocks] = useState<OfficialBlock[]>([]);
  const [isPaginatingOfficial, setIsPaginatingOfficial] = useState(false);
  const measureRootRef = useRef<HTMLDivElement | null>(null);
  const modalBodyRef = useRef<HTMLDivElement | null>(null);

  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [showRevisionRequest, setShowRevisionRequest] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

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
  // The uploaded Existing binary is authoritative.  Some older records have
  // stale/incorrect DOCX metadata even though the stored binary is PDF.
  // Never let a stale DOCX flag force a PDF into the Live/A4 renderer.
  const hasExistingPdfEvidence = Boolean(
    sop &&
    isExisting &&
    (
      sop.existingSourceFormat === 'PDF' ||
      String(sop.fileType || '').toLowerCase() === 'application/pdf' ||
      String(sop.signedScanFileType || '').toLowerCase() === 'application/pdf' ||
      String(sop.fileName || '').toLowerCase().endsWith('.pdf') ||
      String(sop.signedScanFileName || '').toLowerCase().endsWith('.pdf') ||
      String(sop.storagePath || '').toLowerCase().includes('signedscan') ||
      String(sop.signedScanStoragePath || '').toLowerCase().includes('signedscan')
    )
  );

  const isExistingDocx = Boolean(
    sop &&
    isExisting &&
    !hasExistingPdfEvidence &&
    (
      sop.existingSourceFormat === 'DOCX' ||
      String(sop.fileType || '').toLowerCase().includes('wordprocessingml') ||
      String(sop.fileType || '').toLowerCase().includes('msword') ||
      String(sop.fileName || '').toLowerCase().endsWith('.docx') ||
      String(sop.fileName || '').toLowerCase().endsWith('.doc')
    )
  );

  // Existing PDF/scan must be shown as the original uploaded document.
  const isExistingPdf = Boolean(sop && isExisting && !isExistingDocx);

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
  const [resolvedLegacySource, setResolvedLegacySource] = useState<{ storagePath?: string; slot: ExistingPdfStorageSlot } | null>(null);

  // Review evidence preview state
  const [showReviewEvidencePreview, setShowReviewEvidencePreview] = useState<boolean>(false);
  const [resolvedReviewEvidenceUrl, setResolvedReviewEvidenceUrl] = useState<string | null>(null);
  const [isLoadingReviewEvidence, setIsLoadingReviewEvidence] = useState<boolean>(false);
  const [riviuPreviewTab, setRiviuPreviewTab] = useState<'document' | 'evidence'>('document');
  const [selectedEvidenceUrl, setSelectedEvidenceUrl] = useState<string | null>(null);
  const [selectedEvidenceName, setSelectedEvidenceName] = useState<string>('');

  // Canonical A4 visual scale viewer (identik across desktop, tablet, and mobile)
  const [previewZoomMode, setPreviewZoomMode] = useState<'fit' | '50%' | '75%' | '100%' | '125%' | '150%'>('fit');
  const [previewViewportWidth, setPreviewViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  const previewViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!previewViewportRef.current) return;
    const updateWidth = () => {
      if (previewViewportRef.current) {
        setPreviewViewportWidth(previewViewportRef.current.clientWidth);
      }
    };
    updateWidth();
    const obs = new ResizeObserver(updateWidth);
    obs.observe(previewViewportRef.current);
    return () => obs.disconnect();
  }, [isOpen]);

  const calculatedPreviewScale = useMemo(() => {
    if (previewZoomMode === '50%') return 0.5;
    if (previewZoomMode === '75%') return 0.75;
    if (previewZoomMode === '100%') return 1;
    if (previewZoomMode === '125%') return 1.25;
    if (previewZoomMode === '150%') return 1.5;
    // 'fit' mode: 210mm at 96 DPI is ~793.7px
    const a4Px = 793.7;
    if (previewViewportWidth > 0 && previewViewportWidth < a4Px + 32) {
      return Math.max(0.35, Math.min(1, (previewViewportWidth - 32) / a4Px));
    }
    return 1;
  }, [previewZoomMode, previewViewportWidth]);

  useEffect(() => {
    setShowReviewEvidencePreview(false);
    setResolvedReviewEvidenceUrl(null);
    setIsLoadingReviewEvidence(false);
    setRiviuPreviewTab('document');
    setSelectedEvidenceUrl(null);
    setSelectedEvidenceName('');
  }, [sop?.id, isOpen]);

  useEffect(() => {
    let isCancelled = false;

    if (!sop) {
      setResolvedLegacyFileUrl(null);
      setResolvedLegacySource(null);
      setIsLoadingLegacyFile(false);
      return;
    }

    const resolveFile = async () => {
      setIsLoadingLegacyFile(true);
      setResolvedLegacyFileUrl(null);
      setResolvedLegacySource(null);

      // 1. Resolve a protected cloud URL only after validating it with the
      // current authenticated session. Legacy file IDs may be stale while the
      // durable storagePath is still valid.
      const cloudUrl = isExistingPdf
        ? null
        : ((sop as any).signedScanUrl || (sop as any).fileUrl || (sop as any).oldFileUrl);
      const storagePath = isExistingPdf
        ? null
        : ((sop as any).signedScanStoragePath || (sop as any).storagePath || (sop as any).oldStoragePath);
      if (isExistingPdf) {
        for (const source of getExistingPdfSources(sop)) {
          const resolvedCloudUrl = await resolveProtectedStorageUrl(source.url, source.storagePath, source.slot);
          if (resolvedCloudUrl) {
            if (!isCancelled) {
              setResolvedLegacyFileUrl(resolvedCloudUrl);
              setResolvedLegacySource({ storagePath: source.storagePath, slot: source.slot });
              setIsLoadingLegacyFile(false);
            }
            return;
          }
        }
      } else if (cloudUrl) {
        const resolvedCloudUrl = await resolveProtectedStorageUrl(
          cloudUrl,
          storagePath,
          isExistingPdf ? 'signedScan' : undefined
        );
        if (resolvedCloudUrl) {
          if (!isCancelled) {
            setResolvedLegacyFileUrl(resolvedCloudUrl);
            setIsLoadingLegacyFile(false);
          }
          return;
        }
      }

      // 2. Storage path reference
      if (storagePath) {
        const pathUrl = storagePath.startsWith('/api/storage/') ? storagePath : buildStoragePathUrl(storagePath);
        if (!isCancelled) {
          setResolvedLegacyFileUrl(pathUrl);
          setIsLoadingLegacyFile(false);
        }
        return;
      }

      // 3. Metadata fields can be absent on historical SPO records. Ask the
      // server once: it first resolves storage_files.sopId -> objectPath, and
      // only when no metadata exists does it try conventional legacy names.
      // DocumentViewer performs the authenticated GET with SIDOKTER headers.
      const legacyServerUrl = `/api/storage/sop/${encodeURIComponent(sop.id)}`;
      if (!isCancelled) {
        setResolvedLegacyFileUrl(legacyServerUrl);
        setResolvedLegacySource(null);
        setIsLoadingLegacyFile(false);
      }
    };

    resolveFile();

    return () => {
      isCancelled = true;
    };
  }, [sop?.id, (sop as any)?.fileUrl, (sop as any)?.signedScanUrl, (sop as any)?.oldFileUrl, (sop as any)?.storagePath, (sop as any)?.signedScanStoragePath, (sop as any)?.oldStoragePath, isExistingPdf, isOpen]);

  const legacyFileUrl = resolvedLegacyFileUrl;
  const legacyFileName = sop ? (sop.signedScanFileName || sop.fileName || sop.oldFileName || 'Dokumen_SPO_Eksisting.pdf') : 'Dokumen_SPO_Eksisting.pdf';
  const legacyFileSize = sop ? (sop.signedScanFileSize || sop.fileSize || sop.oldFileSize) : undefined;
  const supportingEvidence = sop ? normalizeSupportingEvidence(sop as any) : [];

  const openSupportingEvidence = async (evidence: typeof supportingEvidence[number]) => {
    const resolved = await resolveProtectedStorageUrl(evidence.fileUrl, evidence.storagePath)
      || (evidence.storagePath ? buildStoragePathUrl(evidence.storagePath) : null)
      || evidence.dataUrl
      || null;
    if (!resolved) {
      alert(`Bukti dukung ${evidence.originalName} tidak dapat dimuat.`);
      return;
    }
    setSelectedEvidenceUrl(resolved);
    setSelectedEvidenceName(evidence.originalName);
  };

  // Toggle preview of the legacy evidence in SPO Riviu
  const handleToggleReviewEvidencePreview = async () => {
    if (showReviewEvidencePreview) {
      setShowReviewEvidencePreview(false);
      return;
    }

    if (resolvedReviewEvidenceUrl) {
      setShowReviewEvidencePreview(true);
      return;
    }

    if (!sop) return;
    setIsLoadingReviewEvidence(true);
    try {
      const evidenceUrl =
        (sop as any).oldFileUrl ||
        (sop as any).oldSignedScanUrl ||
        null;
      const evidenceStoragePath =
        (sop as any).oldStoragePath ||
        (sop as any).oldSignedScanStoragePath ||
        null;

      let resolved = await resolveProtectedStorageUrl(evidenceUrl, evidenceStoragePath, 'oldFile');
      if (!resolved && (sop as any).oldFileDataUrl) {
        resolved = (sop as any).oldFileDataUrl;
      }
      if (!resolved) {
        const cleanId = sop.id.replace(/^sop-/, '');
        for (const candId of [sop.id, cleanId, `sop-${cleanId}`]) {
          const cached = await getFileFromPersistentCacheAsync(candId, 'oldFile').catch(() => null);
          if (cached) {
            resolved = cached;
            break;
          }
        }
      }
      if (!resolved && evidenceStoragePath) {
        resolved = buildStoragePathUrl(evidenceStoragePath);
      }
      if (resolved) {
        setResolvedReviewEvidenceUrl(resolved);
        setShowReviewEvidencePreview(true);
      } else {
        alert('Berkas bukti dukung SPO lama tidak dapat dimuat atau belum tersimpan.');
      }
    } catch (err) {
      console.error('Failed to load review evidence preview:', err);
      alert('Gagal memuat pratinjau bukti dukung.');
    } finally {
      setIsLoadingReviewEvidence(false);
    }
  };

  // Review evidence attachment: the old SPO file supplied as supporting evidence.
  const handleDownloadReviewEvidence = async () => {
    if (!sop) return;

    try {
      const evidenceUrl =
        (sop as any).oldFileUrl ||
        (sop as any).oldSignedScanUrl ||
        null;

      const evidenceStoragePath =
        (sop as any).oldStoragePath ||
        (sop as any).oldSignedScanStoragePath ||
        null;

      let resolvedEvidenceUrl = resolvedReviewEvidenceUrl;
      if (!resolvedEvidenceUrl) {
        resolvedEvidenceUrl = await resolveProtectedStorageUrl(
          evidenceUrl,
          evidenceStoragePath,
          'oldFile'
        );
      }

      if (!resolvedEvidenceUrl && (sop as any).oldFileDataUrl) {
        resolvedEvidenceUrl = (sop as any).oldFileDataUrl;
      }

      if (!resolvedEvidenceUrl) {
        const cleanId = sop.id.replace(/^sop-/, '');
        for (const candId of [sop.id, cleanId, `sop-${cleanId}`]) {
          const cached = await getFileFromPersistentCacheAsync(candId, 'oldFile').catch(() => null);
          if (cached) {
            resolvedEvidenceUrl = cached;
            break;
          }
        }
      }

      if (!resolvedEvidenceUrl && evidenceStoragePath) {
        resolvedEvidenceUrl = buildStoragePathUrl(evidenceStoragePath);
      }

      const safeNum = (sop.oldSopNumber || sop.sopNumber || 'SPO')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, '_');

      const fileName =
        sop.oldFileName ||
        `Bukti_Riviu_${safeNum}.pdf`;

      if (!resolvedEvidenceUrl) {
        alert(`Berkas bukti dukung (${fileName}) tidak dapat dimuat atau belum tersimpan.`);
        return;
      }

      triggerFileDownload(
        resolvedEvidenceUrl,
        fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
        evidenceStoragePath || undefined,
        'oldFile'
      );
    } catch (err: any) {
      console.error('Error downloading review evidence:', err);
      alert(
        'Gagal mengunduh berkas bukti dukung: ' +
        (err?.message || 'Terjadi kesalahan')
      );
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
  // Preview and LiveSPO must start from the exact same canonical ordered flow.
  // Do not maintain a second section decomposition here: that previously made
  // empty sections and table/list units diverge between editor and preview.
  const officialBlocks: OfficialBlock[] = buildOfficialBlocks({
    pengertian: sop?.pengertian,
    summary: sop?.summary,
    tujuan: sop?.tujuan,
    kebijakan: sop?.kebijakan,
    prosedur: sop?.prosedur,
    alur: sop?.alur,
    unitTerkait: sop?.unitTerkait,
    divisionName: sop?.divisionName,
    categoryName: sop?.categoryName
  }, { omitEmptyAlur: true }) as OfficialBlock[];

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

  // Canonical A4 pagination shared with SopLiveTemplate. Preview owns only the
  // scoped physical measurement shell; all split/page-boundary decisions live
  // in computeCanonicalA4Pages so Preview and LiveSPO cannot drift apart.
  useEffect(() => {
    if (isExistingPdf) {
      setIsPaginatingOfficial(false);
      return;
    }
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
        const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
        await Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
          const done = () => {
            img.removeEventListener('load', done);
            img.removeEventListener('error', done);
            resolve();
          };
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        })));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const header = root.querySelector<HTMLElement>('[data-measure-header]');
        const publication = root.querySelector<HTMLElement>('[data-measure-publication]');
        if (!header || !publication) return;
        const headerHeightPx = header.getBoundingClientRect().height;
        const publicationHeightPx = publication.getBoundingClientRect().height;
        if (headerHeightPx <= 0 || publicationHeightPx <= 0) return;

        const pages = computeCanonicalA4Pages(layoutBlocks, {
          headerHeightPx,
          publicationHeightPx
        });
        if (!cancelled) {
          setOfficialPages(pages as OfficialBlock[][]);
          setIsPaginatingOfficial(false);
        }
      } catch (error) {
        console.error('Gagal menghitung pagination SPO canonical:', error);
        if (!cancelled) {
          setOfficialPages([layoutBlocks]);
          setIsPaginatingOfficial(false);
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [isOpen, sop?.id, activeTab, layoutBlocks, isExistingPdf]);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !sop || isExisting || isPaginatingOfficial || !officialPages.length) {
      if (!isOpen) setOfficialPdfBlob(null);
      return;
    }
    setIsOfficialPdfLoading(true);
    setOfficialPdfError(null);
    setOfficialPdfBlob(null);
    generateOfficialPdfBlob()
      .then(blob => { if (!cancelled) setOfficialPdfBlob(blob); })
      .catch(err => { if (!cancelled) setOfficialPdfError(err?.message || 'PDF belum dapat dirender.'); })
      .finally(() => { if (!cancelled) setIsOfficialPdfLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, sop?.id, isExisting, officialPages, isPaginatingOfficial]);

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
        data-sop-suppress-bottom-border={!lastInSection ? 'true' : undefined}
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
            boxSizing: 'border-box',
            overflow: 'visible'
          }}
        >
          <div data-measure-content={measure ? representative.id : undefined} style={{ overflow: 'visible', maxHeight: 'none' }}>
            <RichTextRenderer content={html} fallback="-" />
          </div>
        </td>
      </tr>
    );
  };

  // Canonical readonly page chrome. Keep these metrics identical to the
  // readonly geometry used by SopLiveTemplate; only data sources differ.
  const renderOfficialHeader = (pageNumber: number, pageTotal: number) => (
    <thead className="sop-print-header">
      <tr>
        <th rowSpan={2} className="border border-black p-3 text-center align-middle bg-white w-[28%] font-normal">
          <HospitalLogo imgClassName="w-[54px] h-[54px] mx-auto" className="mb-1" />
          <div className="font-extrabold text-[11px] leading-tight uppercase text-black">RSUD Dr. SOEGIRI</div>
          <div className="font-extrabold text-[11px] leading-tight uppercase text-black">LAMONGAN</div>
        </th>
        <th colSpan={3} className="border border-black p-3 text-center align-middle bg-white w-[72%] font-normal">
          <div className="text-center font-extrabold uppercase text-xs sm:text-sm min-h-[20px] whitespace-normal [word-break:normal] [overflow-wrap:break-word] [hyphens:none] font-bookman leading-snug text-black">
            {sop.title || 'JUDUL STANDAR PROSEDUR OPERASIONAL'}
          </div>
        </th>
      </tr>
      <tr>
        <th className="border border-black p-2 text-center align-top bg-white w-[24%] font-normal">
          <div className="font-bold text-[10px] uppercase font-bookman text-black">NO. DOKUMEN</div>
          <div className="text-xs font-bold mt-1 whitespace-normal [word-break:normal] [overflow-wrap:break-word] text-black">{sop.sopNumber || '……/……/……/2026'}</div>
        </th>
        <th className="border border-black p-2 text-center align-top bg-white w-[24%] font-normal">
          <div className="font-bold text-[10px] uppercase font-bookman text-black">NO. REVISI</div>
          <div className="text-xs font-bold mt-1 whitespace-normal [word-break:normal] [overflow-wrap:break-word] text-black">{sop.revisionNumber || sop.version || (getStandardJenisSpo(sop) === 'RIVIU' ? '01' : '00')}</div>
        </th>
        <th className="border border-black p-2 text-center align-top bg-white w-[24%] font-normal">
          <div className="font-bold text-[10px] uppercase font-bookman text-black">HALAMAN</div>
          <div className="text-xs font-bold mt-1 whitespace-normal [word-break:normal] [overflow-wrap:break-word] text-black">{pageNumber} / {pageTotal}</div>
        </th>
      </tr>
    </thead>
  );

  const renderPublicationRow = () => (
    <tr className="sop-first-page-only">
      <td className="border border-black p-0 text-center font-extrabold uppercase align-middle bg-white whitespace-normal [word-break:normal] [overflow-wrap:break-word] sop-document-type-label w-[28%]">
        <div className="sop-document-type-label-inner text-black font-extrabold"><div>STANDAR</div><div>PROSEDUR</div><div>OPERASIONAL</div></div>
      </td>
      <td className="border border-black p-2 text-center align-top bg-white w-[24%]">
        <div className="text-[10px] font-bookman text-black">Tanggal terbit</div>
        <div className="mt-1 text-xs font-bold text-black">{sop.effectiveDate || '……………'}</div>
      </td>
      <td colSpan={2} className="border border-black p-2 text-center align-top bg-white relative overflow-visible w-[48%]">
        <div className="text-[11px] font-bookman text-black leading-tight">Ditetapkan,</div>
        <div className="font-bold text-xs sm:text-[13px] font-bookman text-black leading-tight mt-0.5 relative z-0 whitespace-normal [word-break:normal] [overflow-wrap:break-word]">Direktur RSUD Dr. Soegiri Lamongan</div>
        {showSignatureAndStamp ? (
          <div className="relative -my-5 sm:-my-6 flex items-center justify-center w-full max-w-[260px] mx-auto z-10 pointer-events-none"><DirectorSignature className="h-[96px] sm:h-[106px] w-auto max-w-[260px]" /></div>
        ) : (
          <div className="h-[36px] my-1" aria-hidden="true" />
        )}
        <div className="relative z-0 space-y-0.5">
          <div className="font-bold text-xs sm:text-sm underline font-bookman text-black leading-tight whitespace-normal [word-break:normal] [overflow-wrap:break-word]">{sop.direkturNama || SOEGIRI_HOSPITAL_INFO.director.name}</div>
          <div className="text-[10px] sm:text-[11px] font-bookman text-black leading-tight whitespace-normal [word-break:normal] [overflow-wrap:break-word]">{(!sop.direkturPangkat || sop.direkturPangkat.toLowerCase().includes('direktur')) ? SOEGIRI_HOSPITAL_INFO.director.rank : sop.direkturPangkat}</div>
          <div className="font-bold text-[10px] sm:text-[11px] font-bookman text-black leading-tight whitespace-normal [word-break:normal] [overflow-wrap:break-word]">NIP. {sop.direkturNip || SOEGIRI_HOSPITAL_INFO.director.nip}</div>
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
  // Generate the official PDF in memory so it can be downloaded without
  // changing the locked, server-rendered A4 document workflow.
  const generateOfficialPdfBlob = async (): Promise<Blob> => {
    if (!officialPages.length) throw new Error('Tunggu sampai pagination SPO selesai.');
    const officialRoot = document.getElementById('printable-sop-official-document');
    if (!officialRoot) throw new Error('Dokumen SPO belum siap untuk dibuat PDF.');

    const currentSession = userSession || getPersistedClientSession();
    const authUid = currentSession?.authUid || 'anonymous_user';
    const cssParts: string[] = [];
    for (const style of Array.from(document.querySelectorAll<HTMLStyleElement>('style'))) {
      if (style.textContent) cssParts.push(style.textContent);
    }
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from((sheet as CSSStyleSheet).cssRules || []);
        if (rules.length) cssParts.push(rules.map(rule => rule.cssText).join('\n'));
      } catch { /* cross-origin stylesheet */ }
    }

    const clonedRoot = officialRoot.cloneNode(true) as HTMLElement;
    clonedRoot.querySelectorAll('.no-print').forEach(node => node.remove());
    clonedRoot.querySelectorAll<HTMLImageElement>('img').forEach(img => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
      try { img.setAttribute('src', new URL(src, window.location.href).href); } catch { /* keep original */ }
    });
    const pageNodes = Array.from(clonedRoot.querySelectorAll<HTMLElement>('.sop-preview-page'));
    clonedRoot.innerHTML = '';
    pageNodes.forEach(page => {
      page.style.removeProperty('transform');
      page.style.removeProperty('transform-origin');
      page.style.removeProperty('margin-bottom');
      page.style.margin = '0 auto';
      clonedRoot.appendChild(page);
    });
    clonedRoot.querySelectorAll('.no-print, .sop-measure-root, [data-measure-page]').forEach(node => node.remove());
    clonedRoot.classList.remove('hidden');
    clonedRoot.classList.add('pdf-export-document');

    const buildAuthHeaders = async (forceRefresh = false) => {
      const token = await getCurrentAuthToken(forceRefresh).catch(() => null);
      const persisted = getPersistedClientSession();
      if (!token && !persisted?.sessionId) throw new Error('Sesi login tidak valid. Silakan login kembali.');
      return {
        Accept: 'application/pdf, application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(persisted?.sessionId ? { 'X-Session-Id': persisted.sessionId, 'X-Soegiri-Session-Id': persisted.sessionId } : {}),
        ...(persisted?.authUid ? { 'X-Soegiri-Auth-Uid': persisted.authUid } : {}),
        ...(persisted?.username ? { 'X-User-Username': persisted.username } : {})
      };
    };

    const payload = JSON.stringify({
      html: clonedRoot.outerHTML,
      css: cssParts.join('\n'),
      baseUrl: window.location.origin,
      authUid,
      sopNumber: sop.sopNumber,
      title: sop.title,
      filename: sop.title || sop.sopNumber || `SPO_${sop.id}`
    });
    const endpoints = [
      '/api/pdf',
      'https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/pdfApi',
      'https://pdfapi-n7zygxitla-et.a.run.app'
    ];
    let response: Response | null = null;
    let lastFailure = '';
    for (const endpoint of endpoints) {
      try {
        let res = await fetch(endpoint, { method: 'POST', headers: await buildAuthHeaders(false), body: payload });
        if (res.status === 401) {
          await refreshUserSessionProfile().catch(() => undefined);
          res = await fetch(endpoint, { method: 'POST', headers: await buildAuthHeaders(true), body: payload });
        }
        if (res.ok) { response = res; break; }
        lastFailure = `HTTP ${res.status}`;
      } catch (err: any) {
        lastFailure = err?.message || 'Gagal menghubungi server PDF';
      }
    }
    if (!response?.ok) throw new Error(`PDF gagal dibuat${lastFailure ? ` (${lastFailure})` : ''}.`);
    return responseToPdfBlob(response);
  };

  const handleDownloadExisting = async () => {
    if (!sop) return;

    // Existing PDF: preserve and download the original uploaded PDF.
    if (isExistingPdf) {
      let resolvedExistingUrl = legacyFileUrl;
      let resolvedSource = resolvedLegacySource;

      if (!resolvedExistingUrl) {
        for (const source of getExistingPdfSources(sop)) {
          const resolved = await resolveProtectedStorageUrl(source.url, source.storagePath, source.slot);
          if (resolved) {
            resolvedExistingUrl = resolved;
            resolvedSource = { storagePath: source.storagePath, slot: source.slot };
            break;
          }
        }
      }

      if (!resolvedExistingUrl) {
        alert('Berkas PDF asli SPO Existing belum tersedia atau tidak dapat dimuat.');
        return;
      }

      const safeName = String(legacyFileName || sop.title || 'Dokumen_SPO_Eksisting')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'Dokumen_SPO_Eksisting.pdf';

      await triggerFileDownload(
        resolvedExistingUrl,
        safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`,
        resolvedSource?.storagePath,
        resolvedSource?.slot,
        true
      );
      return;
    }

    // Existing DOCX: DOCX is only the submission/source for LiveForm.
    // Download the resulting official A4 PDF, not the source DOCX.
    await handleDownloadDirectPdf();
  };

  const handleDownloadDirectPdf = async () => {
    if (isPdfGenerating) return;
    setIsPdfGenerating(true);
    try {
      const blob = officialPdfBlob || await generateOfficialPdfBlob();
      const safeTitle = String(sop.title || '').trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/g, '')
        .trim();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${(safeTitle || 'SPO_RSUD_Dr_Soegiri').slice(0, 180)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error: any) {
      console.error('Direct PDF generation failed:', error);
      alert(error?.message || 'PDF gagal dibuat. Silakan coba lagi.');
    } finally {
      setIsPdfGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 printable-modal-active">
      <div className="bg-white w-full h-full sm:h-[94vh] sm:max-w-[1120px] rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-slate-200 overflow-hidden flex flex-col printable-modal-overlay">
        
        {/* Top Bar (Hidden in Print) */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 border-b border-slate-100 bg-slate-50/90 no-print flex-wrap gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-mono font-bold bg-blue-50 text-blue-900 border border-blue-200 shrink-0">
              {sop.divisionCode} {sop.subHierarchyCode ? `/ ${sop.subHierarchyCode}` : ''}
            </span>
            <span className="text-xs text-slate-600 font-semibold truncate max-w-[120px] sm:max-w-[220px]">
              {sop.title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
            {canEditExistingSop(sop, userSession) && (
              <AdminTooltip
                title="Edit Dokumen"
                content="Perbarui isi dokumen SPO dan data registrasinya."
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
                  <span>Edit</span>
                </button>
              </AdminTooltip>
            )}

            {/* ACTION BAR UNIVERSAL: semua SPO = Edit / Simpan PDF / Cetak / Tutup.
                Existing PDF tetap menyimpan PDF asli; Existing DOCX memakai hasil A4 resmi. */}
            <AdminTooltip
              title="Simpan PDF"
              content={isExistingPdf
                ? "Simpan berkas PDF asli SPO Existing yang tersimpan."
                : "Generate dan simpan berkas PDF berstandar A4 sesuai format baku RSUD Dr. Soegiri."}
              side="bottom"
            >
              <button
                type="button"
                onClick={isExisting ? handleDownloadExisting : handleDownloadDirectPdf}
                disabled={
                  isPdfGenerating ||
                  (!isExistingPdf && isPaginatingOfficial) ||
                  (isExistingPdf && (isLoadingLegacyFile || !legacyFileUrl))
                }
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 active:bg-blue-950 disabled:bg-blue-400 rounded-xl shadow-2xs transition-colors cursor-pointer disabled:cursor-wait min-h-[36px]"
              >
                {isPdfGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isPdfGenerating ? 'Membuat PDF…' : 'Simpan PDF'}</span>
                <span className="sm:hidden">{isPdfGenerating ? '...' : 'PDF'}</span>
              </button>
            </AdminTooltip>

            <AdminTooltip
              title="Cetak Naskah"
              content="Cetak dokumen menggunakan tampilan pratinjau yang sedang ditampilkan."
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
        <div ref={modalBodyRef} className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-3">
          
          {isExistingPdf ? (
            <div className="space-y-4 w-full max-w-[920px] mx-auto">
              <PreviewMetadata users={users} sop={sop} kind="EKSISTING" />
              {isLoadingLegacyFile ? (
                <div className="flex flex-col items-center justify-center gap-3 p-12 bg-white rounded-2xl border border-slate-200 min-h-[380px]">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-800" />
                  <p className="text-xs font-semibold text-slate-600">Memuat PDF asli SPO Eksisting...</p>
                </div>
              ) : legacyFileUrl ? (
                <div className="overflow-hidden border border-slate-200 bg-white">
                  <DocumentViewer
                    fileUrl={legacyFileUrl}
                    fileName={legacyFileName}
                    storagePath={resolvedLegacySource?.storagePath}
                    className="w-full"
                    heightClass="h-[70vh] min-h-[420px] sm:min-h-[520px]"
                    showPdfDownloadAction={false}
                  />
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
              <PreviewMetadata users={users} sop={sop} kind={isReviewDoc ? "RIVIU" : isExisting ? "EKSISTING" : "BARU"} />
              {isReviewDoc && (
                <div className="no-print inline-flex rounded-lg border border-slate-200 bg-white p-1">
                  <button type="button" onClick={() => setRiviuPreviewTab('document')} className={`rounded-md px-3 py-1.5 text-xs font-bold ${riviuPreviewTab === 'document' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Dokumen SPO</button>
                  <button type="button" onClick={() => setRiviuPreviewTab('evidence')} className={`rounded-md px-3 py-1.5 text-xs font-bold ${riviuPreviewTab === 'evidence' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Bukti Dukung ({supportingEvidence.length})</button>
                </div>
              )}
              {/* FORMAT RESMI BAKU (Halaman 6 RSUD Soegiri - untuk SPO Baru/Riviu) */}
          {activeTab === 'official_format' && (
            <div className="space-y-4 sm:space-y-6">
              

              {/* BUKTI SPO LAMA — metadata utama sudah digabung di PreviewMetadata agar tidak ada data Riviu yang tampil dua kali */}
              {isReviewDoc && riviuPreviewTab === 'evidence' && (
  ((sop as any)?.oldFileName ||
   (sop as any)?.oldFileUrl ||
   (sop as any)?.oldStoragePath ||
   (sop as any)?.oldSignedScanUrl ||
   (sop as any)?.oldSignedScanStoragePath)
) && (
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs no-print">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-blue-900 flex items-center justify-center shrink-0">
                        <FileCheck2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900">Dokumen Sumber</div>
                        <div className="text-[11px] text-slate-500 truncate">{sop.oldFileName || 'SPO lama yang diriviu'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleReviewEvidencePreview}
                        disabled={isLoadingReviewEvidence || !((sop as any)?.oldFileUrl || (sop as any)?.oldStoragePath || (sop as any)?.oldSignedScanUrl || (sop as any)?.oldSignedScanStoragePath || (sop as any)?.oldFileDataUrl)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors cursor-pointer"
                      >
                        {isLoadingReviewEvidence ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : showReviewEvidencePreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{showReviewEvidencePreview ? 'Tutup' : 'Lihat Sumber'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadReviewEvidence}
                        disabled={!((sop as any)?.oldFileUrl || (sop as any)?.oldStoragePath || (sop as any)?.oldSignedScanUrl || (sop as any)?.oldSignedScanStoragePath || (sop as any)?.oldFileDataUrl)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh Sumber</span>
                      </button>
                    </div>
                  </div>
                  {showReviewEvidencePreview && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                        <span className="truncate">Pratinjau Dokumen SPO Lama: {sop.oldFileName || 'Bukti Riviu'}</span>
                        <button
                          type="button"
                          onClick={() => setShowReviewEvidencePreview(false)}
                          className="text-slate-400 hover:text-slate-600 text-xs font-medium ml-2 shrink-0 cursor-pointer"
                        >
                          Tutup
                        </button>
                      </div>
                      <DocumentViewer
                        fileUrl={resolvedReviewEvidenceUrl || undefined}
                        fileName={sop.oldFileName || 'Bukti_Riviu.pdf'}
                        storagePath={(sop as any)?.oldStoragePath || (sop as any)?.oldSignedScanStoragePath}
                        heightClass="h-[550px] w-full"
                      />
                    </div>
                  )}
                </div>
              )}

              {isReviewDoc && riviuPreviewTab === 'evidence' && (
                <div className="no-print rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-700">Bukti Dukung Riviu</div>
                  {supportingEvidence.length ? supportingEvidence.map((evidence, index) => (
                    <div key={evidence.id || index} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-slate-900 truncate">{index + 1}. {evidence.originalName}</div>
                        <div className="text-[10px] text-slate-500">{evidence.category}{evidence.description ? ` · ${evidence.description}` : ''}</div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button type="button" onClick={() => void openSupportingEvidence(evidence)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700">Preview</button>
                        <button type="button" onClick={() => triggerFileDownload(evidence.fileUrl || buildStoragePathUrl(evidence.storagePath || ''), evidence.originalName, evidence.storagePath)} className="rounded-lg bg-blue-900 px-2.5 py-1.5 text-[11px] font-bold text-white">Unduh</button>
                      </div>
                    </div>
                  )) : <p className="text-xs text-slate-500">Tidak ada bukti dukung tambahan pada data historis ini.</p>}
                  {selectedEvidenceUrl && (
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">{selectedEvidenceName}</div>
                      <DocumentViewer fileUrl={selectedEvidenceUrl} fileName={selectedEvidenceName} heightClass="h-[55vh] w-full" />
                    </div>
                  )}
                </div>
              )}

              {/* Canonical A4 Preview Zoom Toolbar (No-Print) */}
              <div className="no-print w-full max-w-[210mm] mx-auto flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-100/90 border border-slate-200 rounded-xl text-xs mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">Format A4 Resmi (210 × 297 mm)</span>
                  <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-md text-[11px] font-bold">
                    {calculatedTotalPages} Halaman
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-semibold hidden sm:inline">Skala:</span>
                  <select
                    aria-label="Skala Tampilan A4"
                    value={previewZoomMode}
                    onChange={(e) => setPreviewZoomMode(e.target.value as any)}
                    className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="fit">Otomatis (Fit Layar)</option>
                    <option value="50%">50%</option>
                    <option value="75%">75%</option>
                    <option value="100%">100% (A4 Fisik)</option>
                    <option value="125%">125% (Besar)</option>
                    <option value="150%">150% (Sangat Besar)</option>
                  </select>
                  <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-1 py-0.5 rounded">
                    {Math.round(calculatedPreviewScale * 100)}%
                  </span>
                </div>
              </div>

              <div ref={previewViewportRef} className="w-full flex flex-col items-center overflow-x-auto overflow-y-visible">
                <div
                  style={{
                    transform: calculatedPreviewScale !== 1 ? `scale(${calculatedPreviewScale})` : undefined,
                    transformOrigin: 'top center',
                    width: '210mm',
                    marginBottom: calculatedPreviewScale < 1
                      ? `-${Math.round((1 - calculatedPreviewScale) * (pageGroups.length * 1123 + (pageGroups.length - 1) * 24))}px`
                      : calculatedPreviewScale > 1
                      ? `${Math.round((calculatedPreviewScale - 1) * (pageGroups.length * 1123 + (pageGroups.length - 1) * 24))}px`
                      : undefined
                  }}
                  className="transition-transform duration-150"
                >
                  <div 
                    id="printable-sop-official-document" 
                    className={`font-bookman flex flex-col items-center gap-6 mt-2 ${isReviewDoc && riviuPreviewTab === 'evidence' ? 'hidden' : ''}`}
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
                      padding: '20mm 20mm 20mm 20mm',
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
                  const isContinuationPage = pageIndex < calculatedTotalPages - 1;

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
                        padding: '20mm 20mm 20mm 20mm',
                        boxSizing: 'border-box',
                        backgroundColor: '#ffffff',
                        overflow: 'hidden',
                        boxShadow: '0 2px 12px rgba(0,0,0,.08)',
                        border: 'none',
                        position: 'relative'
                      }}
                    >
                      <div
                        className="sop-a4-content-frame"
                        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                      >
                      <table
                        className={`sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed ${isContinuationPage ? 'sop-continuation-page-table' : ''}`}
                        style={{
                          border: '1px solid #000000',
                          borderBottom: isContinuationPage ? '0' : '1px solid #000000',
                          borderCollapse: 'collapse',
                          width: '100%',
                          flexShrink: 0
                        }}
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
                                !(isContinuationPage && groupIndex === groups.length - 1)
                              )
                            );
                          })()}
                        </tbody>
                      </table>
                      {isContinuationPage && (
                        <div
                          aria-hidden="true"
                          data-sop-page-continuation-fill="true"
                          style={{
                            flex: '1 1 auto',
                            minHeight: 0,
                            position: 'relative',
                            boxSizing: 'border-box',
                            backgroundColor: '#ffffff',
                            borderLeft: '1px solid #000000',
                            borderRight: '1px solid #000000',
                            borderBottom: '1px solid #000000'
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute', top: 0, bottom: 0, left: '28%',
                              borderLeft: '1px solid #000000'
                            }}
                          />
                        </div>
                      )}
                      </div>
                    </div>
                  );

                  return pageElement;
                })}
              </div>
            </div>
          </div>
            </div>
          )}
            </>
          )}

          {/* Modal Footer (Hidden in Print) */}
          <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between no-print gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {(userSession?.role === 'admin' || (userSession?.badges || []).some((b) => String(b).toUpperCase() === 'VERIFIKATOR')) && sop.status === 'DRAFT' && onReviewWorkflow && (
                <>
                  {(sop.reviewState === undefined || sop.reviewState === 'NONE' || sop.reviewState === 'REVISION_SUBMITTED' || sop.reviewState === 'VERIFIED') && (
                    <button type="button" onClick={() => setShowRevisionRequest(true)} className="px-3.5 py-2 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-xl">Minta Perbaikan</button>
                  )}
                  {sop.reviewState === 'REVISION_SUBMITTED' && (
                    <button type="button" disabled={reviewBusy} onClick={async () => { setReviewBusy(true); try { await onReviewWorkflow(sop, 'VERIFY'); } finally { setReviewBusy(false); } }} className="px-3.5 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl">Tandai Terverifikasi</button>
                  )}
                </>
              )}
              <span className="text-xs text-slate-500 font-medium">Status Dokumen:</span>
              {canUserActivateSop(sop, userSession) ? (
                isExisting ? (
                  <div className={`text-xs rounded-lg px-2.5 py-1 font-bold ${
                    sop.status === 'AKTIF'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : sop.status === 'DRAFT'
                      ? 'bg-amber-100 border border-amber-300 text-amber-900'
                      : 'bg-slate-100 border border-slate-300 text-slate-700'
                  }`}>
                    {sop.status === 'DRAFT'
                      ? 'Draft'
                      : sop.status === 'DIARSIPKAN'
                      ? 'Diarsipkan'
                      : 'Aktif — SPO Existing'}
                  </div>
                ) : (
                  <select
                    value={sop.status}
                    onChange={(e) => onUpdateStatus(sop.id, e.target.value as SopStatus)}
                    className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="AKTIF">Aktif</option>
                    {userSession?.role === 'admin' && <option value="DIARSIPKAN">Diarsipkan</option>}
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
          {showRevisionRequest && (
            <div className="fixed inset-0 z-[70] bg-slate-900/50 flex items-center justify-center p-4" onClick={() => setShowRevisionRequest(false)}>
              <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <h2 className="text-base font-black text-slate-900">Minta Perbaikan</h2>
                <p className="mt-1 text-xs text-slate-500">Catatan akan dikirim kepada pembuat SPO.</p>
                <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Pembuat: <strong className="text-slate-800">{sop.creatorName || sop.activationRequestedBy || 'Pembuat/Pengusul SPO'}</strong>
                </div>
                <label className="mt-4 block text-xs font-bold text-slate-600">Catatan Perbaikan *</label>
                <textarea rows={4} value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setShowRevisionRequest(false)} className="px-4 py-2 text-xs font-bold text-slate-600">Batal</button>
                  <button type="button" disabled={reviewBusy || !revisionNote.trim()} onClick={async () => { if (!revisionNote.trim()) return; setReviewBusy(true); try { await onReviewWorkflow(sop, 'REQUEST_REVISION', revisionNote.trim()); setRevisionNote(''); setShowRevisionRequest(false); } finally { setReviewBusy(false); } }} className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Kirim</button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
