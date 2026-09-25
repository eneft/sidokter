import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FileEdit,
  CheckCircle2,
  History,
  Tag,
  Calendar,
  Building2,
  AlertCircle,
  BookOpen,
  FileText,
  Wand2,
  Hash,
  RotateCcw,
  Lock,
  ShieldCheck,
  Layers,
  Check,
  Clock,
  Upload,
  FileUp,
  Trash2,
  Eye,
  Download,
  Loader2
} from 'lucide-react';

import {
  SopDocument,
  SopCategory,
  Division,
  RevisionLog,
  UserSession
} from '../types';

import { SopLiveTemplate } from './SopLiveTemplate';
import {
  standardizeSopDocument,
  checkDuplicateSopNumber,
  getNextSequenceNumber,
  getPaddedNumber,
  parseSopNumber,
  formatBytes,
  normalizeSopNumberInput
} from '../utils/numbering';
import { SOEGIRI_HOSPITAL_INFO, SOEGIRI_MASTER_CATEGORIES } from '../utils/soegiriStructure';
import { HierarchyPicker } from './HierarchyPicker';
import { saveFileToLocalCache, openDocumentPreview } from '../utils/fileStorage';
import { canEditExistingSop } from '../lib/sopEditPolicy';
import { findAuthoritativeRiviuPredecessor, getAuthoritativeRiviuRevision, isRecognizedLegacySopNumber } from '../utils/riviuRevision';
import { parseSopFromDocx } from '../utils/docxParser';
import {
  SupportingEvidenceInput,
  PendingEvidence,
  getSupportingEvidenceCategoryLabel,
} from './SupportingEvidenceInput';

export interface EditSopModalProps {
  isOpen: boolean;
  sop: SopDocument | null;
  onClose: () => void;
  onSubmit: (updatedSop: SopDocument) => void | Promise<void>;
  divisions: Division[];
  categories: SopCategory[];
  userSession?: UserSession | null;
  sops?: SopDocument[];
}

const EditSopModalContent: React.FC<EditSopModalProps> = ({
  isOpen,
  sop,
  onClose,
  onSubmit,
  divisions,
  categories,
  userSession,
  sops = []
}) => {
  if (!sop || !canEditExistingSop(sop, userSession)) return null;

  const isAdmin = userSession?.role === 'admin';
  const isExisting = Boolean(
    sop.documentType === 'LAMA' ||
    sop.jenis_spo === 'EKSISTING' ||
    sop.isLegacySop ||
    sop.documentType === 'EKSISTING'
  );
  const isReview = Boolean(
    sop.isReviewDocument ||
    sop.jenis_spo === 'RIVIU' ||
    sop.documentType === 'REVIEW' ||
    sop.documentType === 'RIVIU' ||
    sop.oldSopNumber
  );

  const [activeTab, setActiveTab] = useState<'info' | 'konten' | 'revisi' | 'berkas'>('info');
  const [validationMessage, setValidationMessage] = useState<string[]>([]);

  // =========================================================
  // UPLOAD / PERBAIKAN BERKAS. Existing dan scan final tetap khusus Admin;
  // PDF sumber Riviu yang wajib dapat dilengkapi oleh pemilik Draft.
  // =========================================================
  const [reuploadExistingFile, setReuploadExistingFile] = useState<File | null>(null);
  const [reuploadExistingDataUrl, setReuploadExistingDataUrl] = useState<string | null>(null);
  const [reuploadExistingName, setReuploadExistingName] = useState<string>('');
  const [reuploadExistingSize, setReuploadExistingSize] = useState<number>(0);
  const [isProcessingExistingFile, setIsProcessingExistingFile] = useState<boolean>(false);
  const [isDraggingExisting, setIsDraggingExisting] = useState<boolean>(false);

  const [reuploadOldFile, setReuploadOldFile] = useState<File | null>(null);
  const [reuploadOldDataUrl, setReuploadOldDataUrl] = useState<string | null>(null);
  const [reuploadOldName, setReuploadOldName] = useState<string>('');
  const [reuploadOldSize, setReuploadOldSize] = useState<number>(0);
  const [isProcessingOldFile, setIsProcessingOldFile] = useState<boolean>(false);
  const [isDraggingOld, setIsDraggingOld] = useState<boolean>(false);

  const [reuploadRiviuScanFile, setReuploadRiviuScanFile] = useState<File | null>(null);
  const [reuploadRiviuScanDataUrl, setReuploadRiviuScanDataUrl] = useState<string | null>(null);
  const [reuploadRiviuScanName, setReuploadRiviuScanName] = useState<string>('');
  const [reuploadRiviuScanSize, setReuploadRiviuScanSize] = useState<number>(0);
  const [isProcessingRiviuScanFile, setIsProcessingRiviuScanFile] = useState<boolean>(false);
  const [isDraggingRiviuScan, setIsDraggingRiviuScan] = useState<boolean>(false);
  const [newSupportingEvidence, setNewSupportingEvidence] = useState<PendingEvidence[]>([]);

  const currentExistingFileName = sop.signedScanFileName || sop.fileName || sop.oldFileName || 'Dokumen_SPO_Eksisting.pdf';
  const currentExistingFileSize = sop.signedScanFileSize || sop.fileSize || sop.oldFileSize;
  const hasCurrentExistingFile = Boolean(sop.signedScanUrl || sop.fileUrl || sop.signedScanDataUrl || sop.fileDataUrl || sop.storagePath || sop.signedScanStoragePath);

  const currentOldFileName = sop.oldFileName || 'Bukti_Dokumen_SPO_Lama.pdf';
  const currentOldFileSize = sop.oldFileSize;
  const hasCurrentOldFile = Boolean(sop.oldFileUrl || sop.oldFileDataUrl || sop.oldStoragePath || sop.oldSignedScanUrl || sop.oldSignedScanStoragePath);

  const currentRiviuScanFileName = sop.signedScanFileName || '';
  const currentRiviuScanFileSize = sop.signedScanFileSize;
  const hasCurrentRiviuScanFile = Boolean(sop.signedScanUrl || sop.signedScanDataUrl || sop.signedScanStoragePath);

  const processExistingFile = (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Hanya berkas berformat PDF (.pdf) yang diperbolehkan untuk dokumen SPO Eksisting.');
      return;
    }
    setIsProcessingExistingFile(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setReuploadExistingFile(file);
      setReuploadExistingDataUrl(dataUrl);
      setReuploadExistingName(file.name);
      setReuploadExistingSize(file.size);
      setIsProcessingExistingFile(false);
    };
    reader.onerror = () => {
      alert('Gagal membaca berkas PDF yang dipilih.');
      setIsProcessingExistingFile(false);
    };
    reader.readAsDataURL(file);
  };

  const handleExistingFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processExistingFile(file);
  };

  const handleClearExistingFile = () => {
    setReuploadExistingFile(null);
    setReuploadExistingDataUrl(null);
    setReuploadExistingName('');
    setReuploadExistingSize(0);
    const el = document.getElementById('edit-reupload-existing-input') as HTMLInputElement | null;
    if (el) el.value = '';
  };

  const processOldFile = (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Hanya berkas berformat PDF (.pdf) yang diperbolehkan untuk Bukti Dokumen SPO Lama.');
      return;
    }
    setIsProcessingOldFile(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setReuploadOldFile(file);
      setReuploadOldDataUrl(dataUrl);
      setReuploadOldName(file.name);
      setReuploadOldSize(file.size);
      setIsProcessingOldFile(false);
    };
    reader.onerror = () => {
      alert('Gagal membaca berkas PDF bukti dukung.');
      setIsProcessingOldFile(false);
    };
    reader.readAsDataURL(file);
  };

  const handleOldFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processOldFile(file);
  };

  const handleClearOldFile = () => {
    setReuploadOldFile(null);
    setReuploadOldDataUrl(null);
    setReuploadOldName('');
    setReuploadOldSize(0);
    const el = document.getElementById('edit-reupload-old-file-input') as HTMLInputElement | null;
    if (el) el.value = '';
  };

  const processRiviuScanFile = (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Hanya berkas berformat PDF (.pdf) yang diperbolehkan untuk Scan Berkas Bertanda Tangan.');
      return;
    }
    setIsProcessingRiviuScanFile(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setReuploadRiviuScanFile(file);
      setReuploadRiviuScanDataUrl(dataUrl);
      setReuploadRiviuScanName(file.name);
      setReuploadRiviuScanSize(file.size);
      setIsProcessingRiviuScanFile(false);
    };
    reader.onerror = () => {
      alert('Gagal membaca berkas PDF pindaian.');
      setIsProcessingRiviuScanFile(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRiviuScanSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processRiviuScanFile(file);
  };

  const handleClearRiviuScanFile = () => {
    setReuploadRiviuScanFile(null);
    setReuploadRiviuScanDataUrl(null);
    setReuploadRiviuScanName('');
    setReuploadRiviuScanSize(0);
    const el = document.getElementById('edit-reupload-riviu-scan-input') as HTMLInputElement | null;
    if (el) el.value = '';
  };

  // =========================================================
  // INFORMASI DOKUMEN
  // =========================================================
  const [title, setTitle] = useState(sop.title || '');
  const [version, setVersion] = useState(sop.revisionNumber || sop.version || '00');
  const [effectiveDate, setEffectiveDate] = useState(sop.effectiveDate || '');
  const [reviewPeriodMonths, setReviewPeriodMonths] = useState(sop.reviewPeriodMonths || 36);
  const [creatorName, setCreatorName] = useState(sop.creatorName || userSession?.name || '');
  const [approverName, setApproverName] = useState(sop.approverName || '');
  const [summary, setSummary] = useState(sop.summary || '');
  const [tags, setTags] = useState<string[]>(sop.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [confidentialityLevel, setConfidentialityLevel] = useState<'Publik' | 'Internal' | 'Rahasia'>(
    sop.confidentialityLevel || 'Internal'
  );
  const [locationOrFolder, setLocationOrFolder] = useState(sop.locationOrFolder || '');
  const [oldSopNumber, setOldSopNumber] = useState(sop.oldSopNumber || sop.previousSopNumber || '');
  const [previousRevisionNumber, setPreviousRevisionNumber] = useState(sop.previousRevisionNumber || '');
  const [reviewReason, setReviewReason] = useState(sop.reviewReason || '');
  const [externalReviewSignedConfirmed, setExternalReviewSignedConfirmed] = useState(Boolean(sop.externalReviewSignedConfirmed));

  // =========================================================
  // BATANG TUBUH SPO
  // =========================================================
  const [pengertian, setPengertian] = useState(sop.pengertian || sop.summary || '');
  const [tujuan, setTujuan] = useState(sop.tujuan || '');
  const [kebijakan, setKebijakan] = useState(
    sop.kebijakan || 'SK Direktur RSUD Dr. Soegiri Lamongan Nomor 188/SPO/DIR/2026'
  );
  const [prosedur, setProsedur] = useState(sop.prosedur || '');
  const [alur, setAlur] = useState(sop.alur || '');
  const [unitTerkait, setUnitTerkait] = useState(
    sop.unitTerkait ||
      (sop.divisionName ? `${sop.divisionName}${sop.categoryName ? `, ${sop.categoryName}` : ''}` : '')
  );

  // Upload ulang Word saat Edit Batang Tubuh. File Word hanya dipakai untuk
  // ekstraksi ulang isi Live SPO; binary DOCX tidak disimpan sebagai dokumen.
  const [isReimportingBodyDocx, setIsReimportingBodyDocx] = useState(false);
  const [bodyDocxImportSummary, setBodyDocxImportSummary] = useState<{ fileName: string; fields: string[] } | null>(null);
  const bodyDocxInputRef = useRef<HTMLInputElement>(null);

  const handleBodyDocxReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.docx')) {
      setValidationMessage(['Upload Word ulang hanya mendukung format .docx.']);
      e.target.value = '';
      return;
    }

    try {
      setIsReimportingBodyDocx(true);
      setValidationMessage([]);
      const parsed = await parseSopFromDocx(file);
      const updatedFields: string[] = [];

      // Hanya batang tubuh yang diganti. Judul, tanggal, nomor, hirarki, status,
      // revisi, dan identitas workflow tetap berasal dari dokumen yang sedang diedit.
      if (parsed.pengertian) { setPengertian(parsed.pengertian); updatedFields.push('PENGERTIAN'); }
      if (parsed.tujuan) { setTujuan(parsed.tujuan); updatedFields.push('TUJUAN'); }
      if (parsed.kebijakan) { setKebijakan(parsed.kebijakan); updatedFields.push('KEBIJAKAN'); }
      if (parsed.prosedur) { setProsedur(parsed.prosedur); updatedFields.push('PROSEDUR'); }
      if (parsed.alur) { setAlur(parsed.alur); updatedFields.push('ALUR'); }
      if (parsed.unitTerkait) { setUnitTerkait(parsed.unitTerkait); updatedFields.push('UNIT TERKAIT'); }

      if (updatedFields.length === 0) {
        throw new Error('Batang tubuh SPO tidak terdeteksi pada file Word tersebut. Pastikan dokumen memiliki bagian Pengertian, Tujuan, Kebijakan, Prosedur, Alur, atau Unit Terkait.');
      }

      setBodyDocxImportSummary({ fileName: file.name, fields: updatedFields });
    } catch (error) {
      console.error('Error re-importing DOCX body:', error);
      setValidationMessage([error instanceof Error ? error.message : 'Gagal membaca ulang batang tubuh dari file Word.']);
    } finally {
      setIsReimportingBodyDocx(false);
      if (e.target) e.target.value = '';
    }
  };

  // =========================================================
  // NOMOR SPO & UNIT
  // =========================================================
  const [divisionId, setDivisionId] = useState(sop.divisionId || '');
  const [divisionCode, setDivisionCode] = useState(sop.divisionCode || '');
  const [divisionName, setDivisionName] = useState(sop.divisionName || '');
  const [categoryId, setCategoryId] = useState(sop.categoryId || '');
  const [categoryName, setCategoryName] = useState(sop.categoryName || '');
  const [sopNumber, setSopNumber] = useState(sop.sopNumber || '');
  const [subHierarchyCode, setSubHierarchyCode] = useState(sop.subHierarchyCode || '');
  const [hierarchyPath, setHierarchyPath] = useState<string[]>(sop.subHierarchyPath || []);

  // =========================================================
  // LOG REVISI
  // =========================================================
  const [addRevisionLog, setAddRevisionLog] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [revisionAuthor, setRevisionAuthor] = useState(userSession?.name || sop.creatorName || '');

  // SINKRONISASI DATA SAAT DOKUMEN BERUBAH
  useEffect(() => {
    if (!sop) return;
    setActiveTab('info');
    setTitle(sop.title || '');
    setDivisionId(sop.divisionId || '');
    setDivisionCode(sop.divisionCode || '');
    setDivisionName(sop.divisionName || '');
    setCategoryId(sop.categoryId || '');
    setCategoryName(sop.categoryName || '');
    setSopNumber(sop.sopNumber || '');
    setSubHierarchyCode(sop.subHierarchyCode || '');
    setHierarchyPath(sop.subHierarchyPath || []);
    setVersion(sop.revisionNumber || sop.version || '00');
    setEffectiveDate(sop.effectiveDate || '');
    setReviewPeriodMonths(sop.reviewPeriodMonths || 36);
    setCreatorName(sop.creatorName || userSession?.name || '');
    setApproverName(sop.approverName || '');
    setSummary(sop.summary || '');
    setTags(sop.tags || []);
    setConfidentialityLevel(sop.confidentialityLevel || 'Internal');
    setLocationOrFolder(sop.locationOrFolder || '');
    setOldSopNumber(sop.oldSopNumber || sop.previousSopNumber || '');
    setPreviousRevisionNumber(sop.previousRevisionNumber || '');
    setReviewReason(sop.reviewReason || '');
    setExternalReviewSignedConfirmed(Boolean(sop.externalReviewSignedConfirmed));
    setPengertian(sop.pengertian || sop.summary || '');
    setTujuan(sop.tujuan || '');
    setKebijakan(sop.kebijakan || 'SK Direktur RSUD Dr. Soegiri Lamongan Nomor 188/SPO/DIR/2026');
    setProsedur(sop.prosedur || '');
    setAlur(sop.alur || '');
    setUnitTerkait(
      sop.unitTerkait ||
        (sop.divisionName ? `${sop.divisionName}${sop.categoryName ? `, ${sop.categoryName}` : ''}` : '')
    );
    setAddRevisionLog(false);
    setRevisionNotes('');
    setRevisionAuthor(userSession?.name || sop.creatorName || '');
    setTagInput('');
    setValidationMessage([]);
    setIsReimportingBodyDocx(false);
    setBodyDocxImportSummary(null);

    // Reset upload states
    setReuploadExistingFile(null);
    setReuploadExistingDataUrl(null);
    setReuploadExistingName('');
    setReuploadExistingSize(0);
    setIsProcessingExistingFile(false);
    setIsDraggingExisting(false);

    setReuploadOldFile(null);
    setReuploadOldDataUrl(null);
    setReuploadOldName('');
    setReuploadOldSize(0);
    setIsProcessingOldFile(false);
    setIsDraggingOld(false);

    setReuploadRiviuScanFile(null);
    setReuploadRiviuScanDataUrl(null);
    setReuploadRiviuScanName('');
    setReuploadRiviuScanSize(0);
    setIsProcessingRiviuScanFile(false);
    setIsDraggingRiviuScan(false);
    setNewSupportingEvidence([]);
  }, [sop, isOpen]);

  // Content checkers
  const stripHtml = (html: string = '') => {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return (temp.textContent || temp.innerText || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const hasRichContent = (html: string = '') => {
    if (!html || !html.trim()) return false;
    const source = html.trim();
    if (
      /<img\b/i.test(source) ||
      /data-sop-image\s*=\s*["']true["']/i.test(source) ||
      /data-storage-image\s*=\s*["']true["']/i.test(source) ||
      /class\s*=\s*["'][^"']*figure-wrapper/i.test(source) ||
      /<figure\b/i.test(source)
    ) {
      return true;
    }
    const temp = document.createElement('div');
    temp.innerHTML = source;
    const text = (temp.textContent || temp.innerText || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 0;
  };

  const normalizeHtml = (html: string = '') => {
    if (!html) return '';
    return html.replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, '').replace(/<div>\s*(?:&nbsp;|\s)*<\/div>/gi, '').trim();
  };

  // Check duplicate number
  const duplicateCheck = checkDuplicateSopNumber(sops, sopNumber, sop.id);
  const normalizedOldSopNumber = normalizeSopNumberInput(oldSopNumber);
  const matchedReviewSource = isReview
    ? findAuthoritativeRiviuPredecessor(sops, {
        existingSopId: sop.existingSopId,
        oldSopNumber: normalizedOldSopNumber,
      })
    : undefined;
  const requiresExternalReviewPdf = isReview && !matchedReviewSource;
  const isLegacyReviewNumber = isReview && isRecognizedLegacySopNumber(normalizedOldSopNumber);
  const hasDurableOrPendingOldFile = hasCurrentOldFile || Boolean(reuploadOldDataUrl);
  const reviewRevisionPreview = (() => {
    if (!isReview) return version;
    try {
      return getAuthoritativeRiviuRevision(matchedReviewSource, previousRevisionNumber).revisionNumber || version;
    } catch {
      return version;
    }
  })();
  const reviewRequiredItems = isReview ? [
    { label: 'Nomor SPO lama', complete: Boolean(normalizedOldSopNumber) },
    { label: 'Nomor revisi dokumen lama', complete: /^\d+$/.test(previousRevisionNumber.trim()) },
    { label: 'Alasan Riviu & catatan perubahan', complete: Boolean(reviewReason.trim()) },
    ...(requiresExternalReviewPdf ? [
      { label: 'PDF sumber SPO lama (rujukan eksternal)', complete: hasDurableOrPendingOldFile },
      { label: 'Konfirmasi PDF sumber bertanda tangan', complete: externalReviewSignedConfirmed },
    ] : []),
  ] : [];

  const handleStandardizeCurrentNumber = () => {
    const activeDivCode = (divisionCode || sop.divisionCode || 'PEL').trim().toUpperCase();
    const std = standardizeSopDocument({
      ...sop,
      divisionCode: activeDivCode,
      title,
      sopNumber,
      subHierarchyCode,
      effectiveDate
    });
    setSopNumber(std.sopNumber);
    setSubHierarchyCode(std.subHierarchyCode || '');
  };

  const handleUseNextAvailableNumber = () => {
    const divCode = (divisionCode || sop.divisionCode || 'PEL').trim().toUpperCase();
    const cleanSub = (subHierarchyCode || '').trim();
    const nextSeq = getNextSequenceNumber(undefined, divCode, cleanSub, sops, effectiveDate ? effectiveDate.slice(0, 4) : undefined);
    const padded = getPaddedNumber(nextSeq, 3);
    const year = effectiveDate ? effectiveDate.split('-')[0] : (SOEGIRI_HOSPITAL_INFO.year || '2026');
    const newNum = cleanSub
      ? `${divCode} / ${cleanSub} / ${padded} / ${year}`
      : `${divCode} / ${padded} / ${year}`;
    setSopNumber(newNum);
  };

  const handleAdminHierarchyChange = (value: { divisionCode: string; hierarchyCode: string; hierarchyPath: string[] }) => {
    const newDivision = value.divisionCode.trim().toUpperCase();
    const newHierarchy = value.hierarchyCode.trim();
    const oldDivision = (sop.divisionCode || '').trim().toUpperCase();
    const oldHierarchy = (sop.subHierarchyCode || '').trim();

    setDivisionCode(newDivision);
    setSubHierarchyCode(newHierarchy);
    setHierarchyPath(value.hierarchyPath || []);

    const matched = SOEGIRI_MASTER_CATEGORIES.find((c) => c.code === newDivision);
    if (matched) {
      setDivisionId(matched.id);
      setDivisionName(matched.name);
      setCategoryId(matched.code);
      if (!categoryName || categoryName === sop.categoryName) setCategoryName(matched.name);
    }

    if (newDivision !== oldDivision || newHierarchy !== oldHierarchy) {
      const year = effectiveDate ? effectiveDate.slice(0, 4) : (SOEGIRI_HOSPITAL_INFO.year || '2026');
      const nextSeq = getNextSequenceNumber(undefined, newDivision, newHierarchy, sops, year);
      const padded = getPaddedNumber(nextSeq, 3);
      const newNumber = newHierarchy
        ? `${newDivision} / ${newHierarchy} / ${padded} / ${year}`
        : `${newDivision} / ${padded} / ${year}`;
      setSopNumber(newNumber);
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setActiveTab('info');
      setValidationMessage(['Judul SPO wajib diisi.']);
      return;
    }

    let resolvedRiviuRevision: { previousRevisionNumber: string; revisionNumber: string } | null = null;
    if (isReview && sop.status === 'DRAFT') {
      const riviuErrors: string[] = [];
      if (!normalizedOldSopNumber) riviuErrors.push('Nomor SPO lama wajib diisi.');
      if (!/^\d+$/.test(previousRevisionNumber.trim())) riviuErrors.push('Nomor revisi dokumen lama wajib berupa angka.');
      if (!reviewReason.trim()) riviuErrors.push('Alasan Riviu dan catatan perubahan wajib diisi.');
      if (matchedReviewSource && matchedReviewSource.status !== 'AKTIF') {
        riviuErrors.push('SPO pendahulu internal harus masih berstatus AKTIF.');
      }
      if (requiresExternalReviewPdf && !hasDurableOrPendingOldFile) {
        riviuErrors.push('PDF sumber SPO lama wajib diunggah untuk rujukan eksternal/legacy.');
      }
      if (requiresExternalReviewPdf && !externalReviewSignedConfirmed) {
        riviuErrors.push('Konfirmasi PDF sumber SPO lama bertanda tangan wajib dicentang.');
      }
      if (riviuErrors.length > 0) {
        setValidationMessage(riviuErrors);
        setActiveTab(riviuErrors.some((item) => item.includes('PDF sumber')) ? 'berkas' : 'info');
        return;
      }
      resolvedRiviuRevision = getAuthoritativeRiviuRevision(matchedReviewSource, previousRevisionNumber);
      if (!resolvedRiviuRevision.previousRevisionNumber || !resolvedRiviuRevision.revisionNumber) {
        setValidationMessage(['Nomor revisi dokumen lama tidak valid.']);
        setActiveTab('info');
        return;
      }
    }

    if (!isExisting) {
      const missingSections: string[] = [];
      if (!hasRichContent(pengertian)) missingSections.push('PENGERTIAN');
      if (!hasRichContent(tujuan)) missingSections.push('TUJUAN');
      if (!hasRichContent(kebijakan)) missingSections.push('KEBIJAKAN');
      if (!hasRichContent(prosedur)) missingSections.push('PROSEDUR');
      if (!hasRichContent(unitTerkait)) missingSections.push('UNIT TERKAIT');

      if (missingSections.length > 0) {
        setValidationMessage(missingSections);
        setActiveTab('konten');
        return;
      }
    }

    if (isReview && newSupportingEvidence.some((item) => !item.file)) {
      setValidationMessage(['Pilih berkas pada setiap lampiran opsional, atau hapus baris yang masih kosong.']);
      setActiveTab('berkas');
      return;
    }

    setValidationMessage([]);

    // Revision Log
    const updatedHistory: RevisionLog[] = [...(sop.revisionHistory || [])];
    if (addRevisionLog && revisionNotes.trim()) {
      const newLog: RevisionLog = {
        id: `rev-${Date.now()}`,
        version: version.trim() || sop.version || '00',
        date: new Date().toISOString().split('T')[0],
        author: revisionAuthor.trim() || userSession?.name || 'Staf SPO',
        notes: revisionNotes.trim()
      };
      updatedHistory.push(newLog);
    }

    // Next review date
    let nextReview = sop.nextReviewDate;
    if (effectiveDate) {
      const d = new Date(`${effectiveDate}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        d.setMonth(d.getMonth() + Number(reviewPeriodMonths || 36));
        nextReview = d.toISOString().split('T')[0];
      }
    }

    const normalizedPengertian = normalizeHtml(pengertian);
    const normalizedTujuan = normalizeHtml(tujuan);
    const normalizedKebijakan = normalizeHtml(kebijakan);
    const normalizedProsedur = normalizeHtml(prosedur);
    const normalizedAlur = normalizeHtml(alur);
    const normalizedUnitTerkait = normalizeHtml(unitTerkait);

    const trimmedSopNumber = sopNumber.trim() || sop.sopNumber || '';
    const parsed = parseSopNumber(trimmedSopNumber);
    const seqNum = parsed && parsed.sequenceNumber > 0 ? parsed.sequenceNumber : sop.sequenceNumber;

    const updated: SopDocument = {
      ...sop,
      divisionId: divisionId || sop.divisionId,
      divisionCode: divisionCode || sop.divisionCode,
      divisionName: divisionName || sop.divisionName,
      categoryId: categoryId || sop.categoryId,
      categoryName: categoryName || sop.categoryName,
      title: title.trim(),
      sopNumber: trimmedSopNumber,
      sequenceNumber: seqNum,
      subHierarchyCode: subHierarchyCode.trim(),
      version: version.trim() || '00',
      revisionNumber: version.trim() || '00',
      // Editing content never changes lifecycle. Activation/archive use the
      // dedicated authoritative workflows in App/Firestore.
      status: sop.status || 'DRAFT',
      effectiveDate,
      reviewPeriodMonths: Number(reviewPeriodMonths) || 36,
      nextReviewDate: nextReview,
      creatorName: creatorName.trim(),
      approverName: approverName.trim(),
      summary: summary.trim() || stripHtml(normalizedPengertian),
      tags,
      confidentialityLevel,
      locationOrFolder: locationOrFolder.trim(),
      ...(isReview ? { reviewReason: reviewReason.trim() } : {}),
      ...(isReview && sop.status === 'DRAFT' ? {
        oldSopNumber: normalizedOldSopNumber,
        previousSopNumber: normalizedOldSopNumber,
        previousRevisionNumber: resolvedRiviuRevision?.previousRevisionNumber || previousRevisionNumber.trim(),
        revisionNumber: resolvedRiviuRevision?.revisionNumber || version.trim() || '00',
        version: resolvedRiviuRevision?.revisionNumber || version.trim() || '00',
        existingSopId: matchedReviewSource?.id,
        externalReviewSignedConfirmed: requiresExternalReviewPdf ? externalReviewSignedConfirmed : false,
      } : {}),
      pengertian: normalizedPengertian,
      tujuan: normalizedTujuan,
      kebijakan: normalizedKebijakan,
      prosedur: normalizedProsedur,
      // Empty ALUR is an intentional edit (for example after deleting the last bagan/image).
      // Persist an explicit empty string so Firestore merge semantics clear the old HTML instead
      // of silently retaining the previous image when an undefined field is omitted.
      alur: normalizedAlur,
      unitTerkait: normalizedUnitTerkait,
      revisionHistory: updatedHistory,
      updatedAt: new Date().toISOString()
    };

    if (isReview && newSupportingEvidence.length > 0) {
      try {
        const uploadBatchId = Date.now();
        const appendedEvidence = await Promise.all(newSupportingEvidence.map(async (item, index) => {
          const file = item.file!;
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error(`Gagal membaca lampiran ${file.name}.`));
            reader.readAsDataURL(file);
          });
          return {
            id: `evidence-${uploadBatchId}-${index + 1}`,
            category: item.category,
            description: item.description.trim() || undefined,
            originalName: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            dataUrl,
          };
        }));
        updated.supportingEvidence = [...(sop.supportingEvidence || []), ...appendedEvidence];
      } catch (error) {
        setValidationMessage([error instanceof Error ? error.message : 'Gagal membaca lampiran pendukung.']);
        setActiveTab('berkas');
        return;
      }
    }

    // =========================================================
    // PEMROSESAN BERKAS UPLOAD ULANG (KHUSUS ROLE ADMIN)
    // =========================================================
    if (isAdmin && isExisting && reuploadExistingDataUrl) {
      updated.signedScanFileName = reuploadExistingName;
      updated.signedScanFileSize = reuploadExistingSize;
      updated.signedScanFileType = 'application/pdf';
      updated.signedScanDataUrl = reuploadExistingDataUrl;
      delete (updated as any).signedScanUrl;
      delete (updated as any).signedScanStoragePath;

      updated.fileName = reuploadExistingName;
      updated.fileSize = reuploadExistingSize;
      updated.fileType = 'application/pdf';
      updated.fileDataUrl = reuploadExistingDataUrl;
      delete (updated as any).fileUrl;
      delete (updated as any).storagePath;

      updated.existingSourceFormat = 'PDF';
      updated.isExistingReplacement = true;

      saveFileToLocalCache(sop.id, 'signedScan', reuploadExistingDataUrl);
      saveFileToLocalCache(sop.id, 'file', reuploadExistingDataUrl);
    }

    if (isReview && reuploadOldDataUrl) {
      updated.oldFileName = reuploadOldName;
      updated.oldFileSize = reuploadOldSize;
      updated.oldFileType = 'application/pdf';
      updated.oldFileDataUrl = reuploadOldDataUrl;
      delete (updated as any).oldFileUrl;
      delete (updated as any).oldStoragePath;
      delete (updated as any).oldSignedScanUrl;
      delete (updated as any).oldSignedScanStoragePath;

      saveFileToLocalCache(sop.id, 'oldFile', reuploadOldDataUrl);
    }

    if (isAdmin && isReview && reuploadRiviuScanDataUrl) {
      updated.signedScanFileName = reuploadRiviuScanName;
      updated.signedScanFileSize = reuploadRiviuScanSize;
      updated.signedScanFileType = 'application/pdf';
      updated.signedScanDataUrl = reuploadRiviuScanDataUrl;
      delete (updated as any).signedScanUrl;
      delete (updated as any).signedScanStoragePath;

      saveFileToLocalCache(sop.id, 'signedScan', reuploadRiviuScanDataUrl);
    }

    // Auto-record revision log if PDF file was changed and manual log wasn't checked
    if (isAdmin && (reuploadExistingDataUrl || reuploadOldDataUrl || reuploadRiviuScanDataUrl) && !addRevisionLog) {
      const notesParts: string[] = [];
      if (reuploadExistingDataUrl) notesParts.push(`Upload ulang berkas PDF SPO Eksisting (${reuploadExistingName})`);
      if (reuploadOldDataUrl) notesParts.push(`Upload ulang berkas bukti dukung SPO lama (${reuploadOldName})`);
      if (reuploadRiviuScanDataUrl) notesParts.push(`Upload ulang scan berkas bertanda tangan (${reuploadRiviuScanName})`);

      updatedHistory.push({
        id: `rev-${Date.now()}`,
        version: version.trim() || sop.version || '00',
        date: new Date().toISOString().split('T')[0],
        author: revisionAuthor.trim() || userSession?.name || 'Administrator',
        notes: notesParts.join('; ')
      });
      updated.revisionHistory = updatedHistory;
    }

    await onSubmit(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* ================================================= */}
        {/* MODAL HEADER: Standard & Professional RSUD Soegiri */}
        {/* ================================================= */}
        <div className="px-6 py-4 border-b border-slate-100 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200/80 flex items-center justify-center text-teal-700 shrink-0 shadow-2xs">
              <FileEdit className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                  Edit &amp; Revisi Dokumen SPO
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  Rev {version || '00'}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  sop.status === 'AKTIF'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : sop.status === 'DIARSIPKAN'
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {sop.status || 'DRAFT'}
                </span>
                {isAdmin ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Mode Admin
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    Mode Staf / Unit
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
                {sop.sopNumber || 'Nomor SPO'} · {sop.title}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0 ml-2"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================================================= */}
        {/* STANDARDIZED TAB BAR */}
        {/* ================================================= */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-6 pt-2.5 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'info'
                ? 'border-teal-600 text-teal-700 bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 rounded-t-lg'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Informasi Dokumen</span>
          </button>

          {!isExisting && (
            <button
              type="button"
              onClick={() => setActiveTab('konten')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'konten'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t-xl shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 rounded-t-lg'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Isi Naskah SPO (Batang Tubuh)</span>
              {validationMessage.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-extrabold animate-pulse">
                  !
                </span>
              )}
            </button>
          )}

          {(isReview || (isAdmin && isExisting)) && (
            <button
              type="button"
              onClick={() => setActiveTab('berkas')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'berkas'
                  ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-xl shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 rounded-t-lg'
              }`}
            >
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>{isReview ? 'Berkas Riviu' : 'Upload Ulang PDF'}</span>
              {isAdmin && (
                <span className="px-1.5 py-0.2 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase border border-indigo-200">
                  Admin
                </span>
              )}
              {(reuploadExistingFile || reuploadOldFile || reuploadRiviuScanFile) && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('revisi')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'revisi'
                ? 'border-teal-600 text-teal-700 bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 rounded-t-lg'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Catatan Log Revisi</span>
            {(sop.revisionHistory?.length || 0) > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                {sop.revisionHistory?.length}
              </span>
            )}
          </button>
        </div>

        {/* ================================================= */}
        {/* MODAL BODY (FORM) */}
        {/* ================================================= */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-slate-50/40">
          
          {/* Validation Alert Box */}
          {validationMessage.length > 0 && (
            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-900 flex items-start gap-3 shadow-2xs animate-in fade-in duration-150">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold text-rose-950">
                  Perhatian: Terdapat kolom wajib yang belum terisi lengkap!
                </p>
                <ul className="mt-1.5 list-disc pl-4 space-y-0.5 font-semibold text-rose-800">
                  {validationMessage.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-rose-700">
                  Silakan lengkapi bagian di atas (dapat berupa teks maupun gambar). Bagian ALUR bersifat opsional.
                </p>
              </div>
            </div>
          )}

          {/* =============================================== */}
          {/* TAB 1: INFORMASI DOKUMEN                         */}
          {/* =============================================== */}
          {activeTab === 'info' && (
            <div className="space-y-4">

              {isReview && (
                <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between gap-3 border-b border-amber-100 pb-3">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                        Identitas &amp; Kelengkapan Wajib Riviu
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      sop.status === 'DRAFT'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {sop.status === 'DRAFT' ? 'Dapat dilengkapi' : 'Identitas terkunci'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Nomor SPO Lama <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={oldSopNumber}
                        readOnly={sop.status !== 'DRAFT' || Boolean(sop.oldSopNumber)}
                        onChange={(e) => setOldSopNumber(e.target.value)}
                        onBlur={() => setOldSopNumber(normalizeSopNumberInput(oldSopNumber))}
                        placeholder="Contoh: PEL / 1.1.3 / 015 / 2023"
                        className="w-full text-xs font-mono font-bold border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 bg-white read-only:bg-slate-100 read-only:text-slate-600 focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                      {normalizedOldSopNumber && (
                        matchedReviewSource ? (
                          <div className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800">
                            ✓ Terdeteksi sebagai SPO SIDOKTER: {matchedReviewSource.sopNumber || matchedReviewSource.legacySopNumber} — status {matchedReviewSource.status}.
                          </div>
                        ) : isLegacyReviewNumber ? (
                          <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
                            ✓ Terdeteksi sebagai format nomor SPO legacy/eksternal: {normalizedOldSopNumber}.
                          </div>
                        ) : (
                          <div className="mt-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-800">
                            Nomor belum ditemukan di register dan format legacy belum dikenali otomatis. Jika ini dokumen lama resmi, lengkapi PDF sumber pada tab Berkas.
                          </div>
                        )
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Revisi Lama <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={previousRevisionNumber}
                        readOnly={sop.status !== 'DRAFT' || Boolean(sop.previousRevisionNumber)}
                        onChange={(e) => setPreviousRevisionNumber(e.target.value)}
                        placeholder="00"
                        className="w-full text-xs font-mono font-bold border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 bg-white read-only:bg-slate-100 read-only:text-slate-600 focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Revisi Hasil Riviu
                      </label>
                      <div className="w-full text-xs font-mono font-bold border border-slate-200 rounded-xl px-3 py-2.5 text-teal-800 bg-teal-50">
                        {reviewRevisionPreview || '—'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Alasan Riviu &amp; Catatan Perubahan <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={reviewReason}
                      onChange={(e) => setReviewReason(e.target.value)}
                      placeholder="Jelaskan dasar kebijakan, alasan Riviu, dan perubahan utama."
                      className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>

                  {sop.status === 'DRAFT' && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-2">
                        Status Data Wajib
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {reviewRequiredItems.map((item) => (
                          <div key={item.label} className="flex items-center gap-2 text-xs">
                            {item.complete
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                            <span className={item.complete ? 'text-slate-700' : 'font-bold text-rose-700'}>
                              {item.label}: {item.complete ? 'Lengkap' : 'Belum lengkap'}
                            </span>
                          </div>
                        ))}
                      </div>
                      {requiresExternalReviewPdf && !hasDurableOrPendingOldFile && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('berkas')}
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Unggah PDF Sumber Wajib
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Nomor resmi sudah tampil di header. Kontrol registrasi hanya relevan untuk Admin saat Riviu. */}
              {(!isReview || isAdmin) && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-teal-600" />
                    <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                      Nomor Registrasi &amp; Hirarki SPO
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleStandardizeCurrentNumber}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
                        title="Format nomor otomatis sesuai kaidah Tata Naskah 2026"
                      >
                        <Wand2 className="w-3 h-3" />
                        <span>Format Tata Naskah</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleUseNextAvailableNumber}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer"
                        title="Ambil nomor urut berikutnya yang bebas duplikasi"
                      >
                        <span>Cari No. Bebas Duplikat</span>
                      </button>

                      {sopNumber !== sop.sopNumber && (
                        <button
                          type="button"
                          onClick={() => {
                            setSopNumber(sop.sopNumber || '');
                            setSubHierarchyCode(sop.subHierarchyCode || '');
                            setDivisionCode(sop.divisionCode || '');
                            setDivisionId(sop.divisionId || '');
                            setDivisionName(sop.divisionName || '');
                            setCategoryId(sop.categoryId || '');
                            setCategoryName(sop.categoryName || '');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                          title="Kembalikan ke nomor semula"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {duplicateCheck.isDuplicate && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      Nomor <strong className="font-mono">{sopNumber}</strong> saat ini juga digunakan oleh dokumen{' '}
                      <em>"{duplicateCheck.duplicateWith?.title}"</em>. Anda dapat memperbaikinya atau memilih nomor bebas duplikat.
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nomor SPO Resmi <span className="text-rose-500">*</span>
                  </label>
                  {isAdmin ? (
                    <input
                      type="text"
                      value={sopNumber}
                      onChange={(e) => setSopNumber(e.target.value)}
                      className="w-full text-sm font-mono font-bold border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none"
                      placeholder="Contoh: PEL / 1.1 / 001 / 2026"
                      required
                    />
                  ) : (
                    <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="font-mono font-bold text-sm text-slate-800">{sopNumber}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                        <Lock className="w-3 h-3 text-slate-400" /> Terkunci (Kelolaan Admin)
                      </span>
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {isAdmin
                      ? 'Sebagai Admin, Anda dapat mengedit nomor registrasi atau menggunakan format penomoran tata naskah RSUD Dr. Soegiri.'
                      : 'Nomor registrasi dikelola terpusat oleh Admin Tata Naskah RSUD Dr. Soegiri Lamongan.'}
                  </p>
                </div>

                {isAdmin && (
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <HierarchyPicker
                      value={{ divisionCode, hierarchyCode: subHierarchyCode, hierarchyPath }}
                      onChange={handleAdminHierarchyChange}
                      label="Hirarki & Klasifikasi SPO"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Unit / Kategori Penyusun
                        </label>
                        <input
                          type="text"
                          value={categoryName || sop.categoryName || ''}
                          onChange={(e) => setCategoryName(e.target.value)}
                          className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                          placeholder="Contoh: Instalasi Rawat Jalan"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Jalur Hirarki Aktif
                        </label>
                        <div className="w-full min-h-[38px] text-xs border border-slate-200 rounded-xl px-3 py-2 text-slate-600 bg-slate-50 flex items-center">
                          {hierarchyPath.length ? hierarchyPath.join(' → ') : 'Semua hirarki unit'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Card 2: Informasi Judul & Data Pokok */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    Data Dokumen Standar
                  </span>
                </div>

                {/* Judul Dokumen */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Judul Standar Prosedur Operasional (SPO) <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Masukkan judul SPO secara jelas, lugas, dan terstandar..."
                    className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-y transition-all"
                  />
                </div>

                {/* Metadata ini tidak perlu diulang pada Riviu: revisi ada di identitas, status ada di header, kerahasiaan tetap mengikuti dokumen. */}
                {!isReview && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      No. Revisi
                    </label>
                    <input
                      type="text"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      placeholder="00"
                      className="w-full text-xs font-mono font-bold border border-slate-300 rounded-xl px-3 py-2 text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Status Dokumen
                    </label>
                    <div className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-100 text-slate-700">
                      {sop.status === 'AKTIF' ? 'AKTIF' : sop.status === 'DIARSIPKAN' ? 'DIARSIPKAN' : 'DRAFT'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Tingkat Kerahasiaan
                    </label>
                    <select
                      value={confidentialityLevel}
                      onChange={(e) => setConfidentialityLevel(e.target.value as 'Publik' | 'Internal' | 'Rahasia')}
                      className="w-full text-xs font-medium border border-slate-300 rounded-xl px-3 py-2 text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                    >
                      <option value="Internal">Internal RSUD Soegiri</option>
                      <option value="Publik">Publik</option>
                      <option value="Rahasia">Rahasia</option>
                    </select>
                  </div>
                </div>
                )}

                {/* Grid Baris: Tanggal & Penyusun */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Tanggal Terbit / Ditetapkan
                    </label>
                    <input
                      type="date"
                      value={effectiveDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Penyusun / Inisiator
                    </label>
                    <input
                      type="text"
                      value={creatorName}
                      onChange={(e) => setCreatorName(e.target.value)}
                      placeholder="Nama staf atau nama unit..."
                      className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>
                </div>

                {/* Lokasi fisik bukan data proses Riviu; tetap tersedia untuk jenis dokumen lain. */}
                {!isReview && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Lokasi Fisik / Binder Penyimpanan (Opsional)
                  </label>
                  <input
                    type="text"
                    value={locationOrFolder}
                    onChange={(e) => setLocationOrFolder(e.target.value)}
                    placeholder="Contoh: Lemari Arsip SPO Unit IGD / Binder 2026"
                    className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
                )}
              </div>
            </div>
          )}

          {/* =============================================== */}
          {/* TAB 2: BATANG TUBUH SPO (ISI NASKAH)             */}
          {/* =============================================== */}
          {activeTab === 'konten' && !isExisting && (
            <div className="space-y-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                      <FileUp className="w-4 h-4 text-teal-700" />
                      <span>Perbarui Batang Tubuh dari Word</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      Upload ulang DOCX untuk mendeteksi kembali isi batang tubuh. Hanya bagian yang terdeteksi yang diganti; nomor SPO, hirarki, status, judul, tanggal, dan metadata lainnya tetap.
                    </p>
                  </div>

                  <input
                    ref={bodyDocxInputRef}
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleBodyDocxReupload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => bodyDocxInputRef.current?.click()}
                    disabled={isReimportingBodyDocx}
                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-teal-200 bg-teal-50 text-teal-800 text-xs font-bold hover:bg-teal-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {isReimportingBodyDocx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {isReimportingBodyDocx ? 'Mendeteksi...' : 'Upload Word Ulang'}
                  </button>
                </div>

                {bodyDocxImportSummary && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
                    <div className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{bodyDocxImportSummary.fileName}</span>
                    </div>
                    <div className="mt-1 text-emerald-800">
                      Bagian diperbarui: {bodyDocxImportSummary.fields.join(', ')}. Bagian yang tidak terdeteksi tetap menggunakan isi sebelumnya.
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-teal-50/80 border border-teal-200/90 rounded-xl p-3 text-xs text-teal-950 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-teal-700 shrink-0" />
                <span>
                  Format resmi tata naskah SPO RSUD Dr. Soegiri (A4). Silakan lengkapi Pengertian, Tujuan, Kebijakan, Prosedur, dan Unit Terkait secara teliti.
                </span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-2 sm:p-4 shadow-2xs">
                <SopLiveTemplate
                  title={title}
                  onTitleChange={setTitle}
                  sopNumber={sopNumber}
                  version={version}
                  effectiveDate={effectiveDate}
                  onEffectiveDateChange={setEffectiveDate}
                  approverName={approverName}
                  pengertian={pengertian}
                  onPengertianChange={setPengertian}
                  tujuan={tujuan}
                  onTujuanChange={setTujuan}
                  kebijakan={kebijakan}
                  onKebijakanChange={setKebijakan}
                  prosedur={prosedur}
                  onProsedurChange={setProsedur}
                  alur={alur}
                  onAlurChange={setAlur}
                  unitTerkait={unitTerkait}
                  onUnitTerkaitChange={setUnitTerkait}
                  missingSections={validationMessage}
                  showSignatureAndStamp={status === 'AKTIF'}
                />
              </div>
            </div>
          )}

          {/* =============================================== */}
          {/* TAB 3: CATATAN LOG REVISI                        */}
          {/* =============================================== */}
          {activeTab === 'revisi' && (
            <div className="space-y-4">
              {/* Tambah Catatan Baru */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer font-bold text-xs text-slate-800 select-none">
                  <input
                    type="checkbox"
                    checked={addRevisionLog}
                    onChange={(e) => setAddRevisionLog(e.target.checked)}
                    className="w-4 h-4 text-teal-600 rounded-md border-slate-300 focus:ring-teal-500 cursor-pointer"
                  />
                  <span>Tambahkan catatan riwayat revisi untuk pembaruan ini</span>
                </label>

                {addRevisionLog && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Keterangan Perubahan / Alasan Revisi <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={revisionNotes}
                        onChange={(e) => setRevisionNotes(e.target.value)}
                        placeholder="Contoh: Pembaruan alur rujukan dan penyelarasan regulasi Kemenkes terbaru..."
                        className="w-full text-xs border border-slate-300 rounded-xl p-2.5 text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nama Pegawai / User Perevisi
                      </label>
                      <input
                        type="text"
                        value={revisionAuthor}
                        onChange={(e) => setRevisionAuthor(e.target.value)}
                        placeholder="Nama staf perevisi..."
                        className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Riwayat Revisi Terdahulu */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <History className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Riwayat Revisi Terdahulu
                  </span>
                </div>

                <div className="space-y-2">
                  {sop.revisionHistory?.length ? (
                    sop.revisionHistory.map((log, idx) => (
                      <div
                        key={log.id || `rev-${idx}`}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-bold text-slate-800">
                          <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-900 text-[10px] font-mono">
                            Revisi: {log.version || '00'}
                          </span>
                          <span className="text-[10px] text-slate-500 inline-flex items-center gap-1 font-medium">
                            <Clock className="w-3 h-3" /> {log.date}
                          </span>
                        </div>
                        <p className="text-slate-700 text-xs leading-relaxed pt-0.5">
                          {log.notes || 'Tanpa keterangan'}
                        </p>
                        <div className="text-[10px] text-slate-400 font-medium">
                          Oleh: {log.author || 'Staf'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-xs text-slate-400 italic">
                      Belum ada catatan riwayat revisi pada dokumen ini.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =============================================== */}
          {/* TAB 4: BERKAS RIVIU / UPLOAD ULANG PDF          */}
          {/* =============================================== */}
          {activeTab === 'berkas' && (isReview || (isAdmin && isExisting)) && (
            <div className="space-y-5 animate-in fade-in duration-150">
              
              {/* Header Banner */}
              <div className="bg-gradient-to-r from-indigo-50/90 via-indigo-50/60 to-purple-50/40 border border-indigo-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-extrabold text-indigo-950">
                        {isExisting ? 'Upload Ulang Berkas SPO Eksisting (PDF)' : 'Kelengkapan Berkas SPO Riviu'}
                      </h4>
                      {isAdmin && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-300">
                          Administrator
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-indigo-900/80 leading-relaxed">
                      {isExisting
                        ? 'Administrator dapat mengganti PDF asli SPO Eksisting dengan hasil digitalisasi yang lebih bersih dan lengkap.'
                        : 'Wajib hanya untuk sumber eksternal/legacy: PDF SPO lama resmi bertanda tangan. Sumber internal SIDOKTER tidak perlu diunggah ulang. Notulen, pedoman, audit, surat, dan dokumen lain dapat ditambahkan sebagai lampiran opsional.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* =============================================== */}
              {/* KASUS 1: SPO EKSISTING                          */}
              {/* =============================================== */}
              {isExisting && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-5">
                  
                  {/* Status Berkas Saat Ini */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
                      <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        Berkas PDF Terdaftar Saat Ini
                      </span>
                      {hasCurrentExistingFile ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Check className="w-3 h-3 text-emerald-600" />
                          Berkas Tersedia
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          Belum Ada Berkas Terunggah
                        </span>
                      )}
                    </div>

                    <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0 font-bold text-xs font-mono">
                          PDF
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate" title={currentExistingFileName}>
                            {currentExistingFileName}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Ukuran: {formatBytes(currentExistingFileSize)} · Format: Dokumen PDF SPO Eksisting
                          </p>
                        </div>
                      </div>

                      {(sop.signedScanUrl || sop.signedScanDataUrl || sop.fileUrl || sop.fileDataUrl) && (
                        <button
                          type="button"
                          onClick={() => openDocumentPreview((sop.signedScanUrl || sop.signedScanDataUrl || sop.fileUrl || sop.fileDataUrl)!, currentExistingFileName)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-indigo-700 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg shadow-2xs transition-colors shrink-0 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Pratinjau Berkas Lama</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Upload Berkas Baru / Pengganti */}
                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2">
                      Pilih Berkas PDF Baru untuk Menggantikan Berkas di Atas
                    </label>

                    {reuploadExistingDataUrl ? (
                      /* File Selected Card */
                      <div className="p-4 rounded-xl border-2 border-emerald-300 bg-emerald-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-emerald-950 truncate">
                                {reuploadExistingName}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold uppercase bg-emerald-200 text-emerald-900">
                                Berkas Baru Siap Disimpan
                              </span>
                            </div>
                            <p className="text-[11px] text-emerald-800 mt-0.5">
                              Ukuran: {formatBytes(reuploadExistingSize)} · Berkas ini akan menggantikan berkas lama saat Anda menekan tombol "Simpan Perubahan".
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => openDocumentPreview(reuploadExistingDataUrl, reuploadExistingName)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-100/80 border border-emerald-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Pratinjau PDF Baru</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleClearExistingFile}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                            title="Batalkan berkas baru"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Batal</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Drag and Drop Zone */
                      <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingExisting(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingExisting(false); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingExisting(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) processExistingFile(file);
                        }}
                        onClick={() => {
                          const input = document.getElementById('edit-reupload-existing-input') as HTMLInputElement | null;
                          if (input) input.click();
                        }}
                        className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                          isDraggingExisting
                            ? 'border-indigo-600 bg-indigo-50/70 scale-[1.01]'
                            : 'border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-indigo-50/30'
                        }`}
                      >
                        <input
                          id="edit-reupload-existing-input"
                          type="file"
                          accept=".pdf,application/pdf"
                          className="hidden"
                          onChange={handleExistingFileSelect}
                        />
                        {isProcessingExistingFile ? (
                          <div className="flex flex-col items-center justify-center gap-2 py-4">
                            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                            <p className="text-xs font-bold text-slate-700">Membaca berkas PDF...</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-2.5">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shadow-2xs">
                              <FileUp className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800">
                                Klik untuk memilih berkas PDF atau seret berkas ke sini
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Format wajib: dokumen PDF (.pdf) · Ukuran maks: 50MB
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-indigo-700 shadow-2xs hover:bg-slate-50">
                              <Upload className="w-3.5 h-3.5" />
                              Pilih Berkas PDF Pengganti
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Informational Guidance */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed">
                      <strong>Catatan Administrator:</strong> Setelah Anda mengunggah berkas PDF baru dan menekan tombol <em>"Simpan Perubahan"</em>, sistem akan langsung memperbarui berkas di pangkalan data dan mengarsipkan berkas lama ke riwayat revisi.
                    </p>
                  </div>
                </div>
              )}

              {/* =============================================== */}
              {/* KASUS 2: SPO RIVIU                              */}
              {/* =============================================== */}
              {isReview && (
                <div className="space-y-4">
                  
                  {/* Bagian A: Pindaian Bertanda Tangan (khusus Admin) */}
                  {isAdmin && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-teal-600" />
                        <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                          Scan Final SPO Bertanda Tangan (Opsional — Admin)
                        </span>
                      </div>
                      {hasCurrentRiviuScanFile ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Check className="w-3 h-3 text-emerald-600" />
                          Terdaftar
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          Belum Diunggah
                        </span>
                      )}
                    </div>

                    {/* Status Saat ini */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {currentRiviuScanFileName || 'Belum ada pindaian bertanda tangan tersimpan'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {currentRiviuScanFileSize ? `Ukuran: ${formatBytes(currentRiviuScanFileSize)} · ` : ''}Dokumen scan resmi penetapan Direktur
                        </p>
                      </div>
                      {(sop.signedScanUrl || sop.signedScanDataUrl) && (
                        <button
                          type="button"
                          onClick={() => openDocumentPreview((sop.signedScanUrl || sop.signedScanDataUrl)!, currentRiviuScanFileName || 'Scan_SPO_Bertanda_Tangan.pdf')}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-teal-800 bg-white hover:bg-teal-50 border border-teal-200 rounded-lg shadow-2xs transition-colors shrink-0 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Pratinjau Saat Ini</span>
                        </button>
                      )}
                    </div>

                    {/* Upload / Replace Area */}
                    {reuploadRiviuScanDataUrl ? (
                      <div className="p-4 rounded-xl border-2 border-emerald-300 bg-emerald-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-emerald-950 truncate">
                              {reuploadRiviuScanName}
                            </p>
                            <p className="text-[11px] text-emerald-800">
                              Ukuran: {formatBytes(reuploadRiviuScanSize)} · Siap disimpan menggantikan scan sebelumnya
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => openDocumentPreview(reuploadRiviuScanDataUrl, reuploadRiviuScanName)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Pratinjau</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleClearRiviuScanFile}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Batal</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingRiviuScan(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingRiviuScan(false); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingRiviuScan(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) processRiviuScanFile(file);
                        }}
                        onClick={() => {
                          const input = document.getElementById('edit-reupload-riviu-scan-input') as HTMLInputElement | null;
                          if (input) input.click();
                        }}
                        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                          isDraggingRiviuScan
                            ? 'border-teal-600 bg-teal-50/70 scale-[1.01]'
                            : 'border-slate-300 hover:border-teal-400 bg-slate-50/50 hover:bg-teal-50/30'
                        }`}
                      >
                        <input
                          id="edit-reupload-riviu-scan-input"
                          type="file"
                          accept=".pdf,application/pdf"
                          className="hidden"
                          onChange={handleRiviuScanSelect}
                        />
                        {isProcessingRiviuScanFile ? (
                          <div className="flex items-center justify-center gap-2 py-2">
                            <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
                            <span className="text-xs font-bold text-slate-700">Membaca berkas PDF...</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-3">
                            <FileUp className="w-5 h-5 text-teal-600" />
                            <span className="text-xs font-bold text-slate-700">
                              Upload Ulang Scan SPO Bertanda Tangan (PDF)
                            </span>
                            <span className="text-[11px] text-slate-400">| Klik atau seret berkas</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  {/* PDF sumber hanya perlu diunggah untuk pendahulu eksternal/legacy. */}
                  {requiresExternalReviewPdf ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-amber-600" />
                        <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                          PDF Sumber SPO Lama (Wajib)
                        </span>
                      </div>
                      {hasCurrentOldFile ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Check className="w-3 h-3 text-emerald-600" />
                          Terdaftar
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          Belum Diunggah
                        </span>
                      )}
                    </div>

                    {/* Status Saat ini */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {currentOldFileName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {currentOldFileSize ? `Ukuran: ${formatBytes(currentOldFileSize)} · ` : ''}Nomor Acuan Lama: {oldSopNumber || 'Belum diisi'}
                        </p>
                      </div>
                      {(sop.oldFileUrl || sop.oldFileDataUrl || sop.oldSignedScanUrl) && (
                        <button
                          type="button"
                          onClick={() => openDocumentPreview((sop.oldFileUrl || sop.oldFileDataUrl || sop.oldSignedScanUrl)!, currentOldFileName)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-800 bg-white hover:bg-amber-50 border border-amber-200 rounded-lg shadow-2xs transition-colors shrink-0 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Pratinjau PDF Sumber</span>
                        </button>
                      )}
                    </div>

                    {/* Upload / Replace Area */}
                    {reuploadOldDataUrl ? (
                      <div className="p-4 rounded-xl border-2 border-emerald-300 bg-emerald-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-emerald-950 truncate">
                              {reuploadOldName}
                            </p>
                            <p className="text-[11px] text-emerald-800">
                              Ukuran: {formatBytes(reuploadOldSize)} · Siap disimpan menggantikan berkas bukti lama
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => openDocumentPreview(reuploadOldDataUrl, reuploadOldName)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Pratinjau</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleClearOldFile}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Batal</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOld(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOld(false); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingOld(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) processOldFile(file);
                        }}
                        onClick={() => {
                          const input = document.getElementById('edit-reupload-old-file-input') as HTMLInputElement | null;
                          if (input) input.click();
                        }}
                        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                          isDraggingOld
                            ? 'border-amber-600 bg-amber-50/70 scale-[1.01]'
                            : 'border-slate-300 hover:border-amber-400 bg-slate-50/50 hover:bg-amber-50/30'
                        }`}
                      >
                        <input
                          id="edit-reupload-old-file-input"
                          type="file"
                          accept=".pdf,application/pdf"
                          className="hidden"
                          onChange={handleOldFileSelect}
                        />
                        {isProcessingOldFile ? (
                          <div className="flex items-center justify-center gap-2 py-2">
                            <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                            <span className="text-xs font-bold text-slate-700">Membaca berkas PDF...</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-3">
                            <FileUp className="w-5 h-5 text-amber-600" />
                            <span className="text-xs font-bold text-slate-700">
                              {hasCurrentOldFile ? 'Ganti PDF Sumber SPO Lama' : 'Unggah PDF Sumber SPO Lama'}
                            </span>
                            <span className="text-[11px] text-slate-400">| Klik atau seret berkas</span>
                          </div>
                        )}
                      </div>
                    )}

                    <label className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                      <input
                        type="checkbox"
                        checked={externalReviewSignedConfirmed}
                        onChange={(e) => setExternalReviewSignedConfirmed(e.target.checked)}
                        className="mt-0.5 accent-amber-600"
                      />
                      <span>
                        Saya memastikan PDF sumber SPO lama merupakan dokumen resmi yang telah ditandatangani Direktur. <strong>Wajib untuk Riviu eksternal/legacy.</strong>
                      </span>
                    </label>
                  </div>
                  ) : (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-2xs">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                        <div>
                          <p className="text-xs font-extrabold text-emerald-950">Sumber SPO internal sudah terhubung</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">
                            {matchedReviewSource?.sopNumber || normalizedOldSopNumber} — {matchedReviewSource?.title || 'Dokumen SIDOKTER'}. PDF sumber tidak perlu diunggah ulang karena arsip internal menjadi rujukan resmi.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {(sop.supportingEvidence?.length || 0) > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                      <div className="mb-3 text-xs font-extrabold uppercase tracking-wider text-slate-800">
                        Lampiran Pendukung Tersimpan
                      </div>
                      <div className="space-y-2">
                        {sop.supportingEvidence?.map((evidence) => (
                          <div key={evidence.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-slate-800">{evidence.originalName}</p>
                              <p className="text-[10px] text-slate-500">
                                {getSupportingEvidenceCategoryLabel(evidence.category)} · {formatBytes(evidence.size)}
                                {evidence.description ? ` · ${evidence.description}` : ''}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              Tersimpan
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <SupportingEvidenceInput
                    value={newSupportingEvidence}
                    onChange={setNewSupportingEvidence}
                    showPrimary={false}
                    title="Tambah Lampiran Pendukung (Opsional)"
                    description="Boleh dikosongkan. Format: PDF, Word, Excel, JPG, atau PNG. Pilih kategori Notulen/BA, Peraturan/Pedoman, Evaluasi/Audit, Surat/Instruksi, atau Dokumen Lainnya."
                  />

                </div>
              )}

            </div>
          )}

          {/* =============================================== */}
          {/* MODAL STICKY FOOTER                             */}
          {/* =============================================== */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-slate-50/40">
            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>

              <button
                type="submit"
                className="flex-1 sm:flex-initial px-5 py-2.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{sop.reviewState === 'REVISION_REQUESTED' ? 'Simpan & Kirim Perbaikan' : 'Simpan Perubahan'}</span>
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};

export const EditSopModal: React.FC<EditSopModalProps> = (props) => {
  if (!props.isOpen || !props.sop || !canEditExistingSop(props.sop, props.userSession)) return null;
  return <EditSopModalContent {...props} />;
};
