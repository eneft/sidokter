import React, { useState, useEffect, useMemo } from 'react';
import { 
  FilePlus, 
  Eye, 
  LogOut, 
  Building2, 
  User, 
  Sparkles, 
  CheckCircle2, 
  Search, 
  Calendar, 
  FileText,
  ListOrdered,
  PlusCircle,
  Clock,
  X,
  RefreshCw,
  FileCheck2,
  Upload,
  Trash2,
  Shield,
  Lock,
  BookOpen,
  Key,
  FolderOpen,
  Home,
  Star,
  ChevronRight,
  Layers,
  Handshake,
  FileCheck,
  AlertTriangle,
  Info,
  LayoutList,
  Table as TableIcon
} from 'lucide-react';
import { 
  SopDocument, 
  NumberingConfig, 
  UserSession, 
  Division, 
  SopCategory, 
  UserAccount, 
  LibraryDocument,
  MainMenuTab
} from '../types';
import { generateSopNumber, getNextSequenceNumber, formatBytes, standardizeSopDocument, checkDuplicateSopNumber, detectHierarchyFromSopNumber } from '../utils/numbering';
import { saveFileToLocalCache } from '../utils/fileStorage';
import { 
  SOEGIRI_MASTER_CATEGORIES, 
  SOEGIRI_HOSPITAL_INFO,
  buildSubHierarchyCode,
  getSoegiriHierarchyInfo,
  isSopAccessibleByUser,
  SoegiriCategory
} from '../utils/soegiriStructure';
import { subscribeToHierarchyMaster } from '../lib/hierarchyService';
import { Header } from './Header';
import { SopLiveTemplate } from './SopLiveTemplate';
import { PetugasLibraryTab } from './PetugasLibraryTab';
import { PetugasPasswordTab } from './PetugasPasswordTab';
import { SKPage } from './SKPage';
import { MOUPage } from './MOUPage';
import { FinalLibraryPage } from './FinalLibraryPage';
import { DashboardOverviewPage } from './DashboardOverviewPage';
import { AdminHubPage } from './AdminHubPage';
import IssueSopNumberModal from './IssueSopNumberModal';

interface PetugasViewProps {
  userSession: UserSession;
  onLogout: () => void;
  sops: SopDocument[];
  libraryDocuments: LibraryDocument[];
  onAddSop: (sop: Omit<SopDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'> & { id?: string }) => Promise<SopDocument>;
  onIssueSopNumber?: (params: { divisionCode: string; subHierarchyCode?: string; dateStr?: string; title: string; revisionNumber: string }) => Promise<SopDocument>;
  numberingConfig: NumberingConfig;
  divisions: Division[];
  categories: SopCategory[];
  onViewDetail: (sop: SopDocument) => void;
  onCopyNumber: (sopNumber: string) => void;
  users?: UserAccount[];
  onUpdatePassword?: (currentPass: string, newPass: string) => Promise<{ success: boolean; message: string }>;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const PetugasView: React.FC<PetugasViewProps> = ({
  userSession,
  onLogout,
  sops,
  libraryDocuments,
  onAddSop,
  onIssueSopNumber,
  numberingConfig,
  divisions,
  categories,
  onViewDetail,
  onCopyNumber,
  users,
  onUpdatePassword,
  onShowToast
}) => {
  const [showIssueNumberModal, setShowIssueNumberModal] = useState(false);
  // Active Navigation Tab State: Menu structure Dashboard | SPO | SK | MOU | Library | Admin
  const [activeTab, setActiveTab] = useState<MainMenuTab>('dashboard');
  const [spoSubTab, setSpoSubTab] = useState<'input' | 'list'>('list');

  // Multi-hierarchy access: one account may have several independent assignments.
  const legacyAssignment = userSession.role === 'admin' || userSession.divisionCode
    ? {
        id: `legacy-${userSession.divisionCode || 'ADMIN'}`,
        divisionCode: userSession.divisionCode,
        subCode: userSession.subCode,
        instCode: userSession.instCode,
        poliCode: userSession.poliCode,
        subUnitCode: userSession.subUnitCode,
        hierarchyCode: [userSession.subCode, userSession.instCode, userSession.poliCode, userSession.subUnitCode].filter(Boolean).join('.') || undefined,
        unitName: userSession.unitName
      }
    : null;

  const rawAssignments = (Array.isArray(userSession.assignments) && userSession.assignments.length
    ? userSession.assignments
    : legacyAssignment ? [legacyAssignment] : []).filter((a) => a.divisionCode);

  const normalizedAssignments = rawAssignments.map((a) => {
    let subCode = a.subCode;
    let instCode = a.instCode;
    let poliCode = a.poliCode;
    let subUnitCode = a.subUnitCode;
    let hierarchyCode = a.hierarchyCode;

    if (hierarchyCode && (!subCode || !instCode || !poliCode)) {
      const parts = hierarchyCode.split('.');
      if (!subCode && parts[0]) subCode = parts[0];
      if (!instCode && parts[1]) instCode = parts[1];
      if (!poliCode && parts[2]) poliCode = parts[2];
      if (!subUnitCode && parts[3]) subUnitCode = parts[3];
    }

    if (!hierarchyCode && (subCode || instCode || poliCode || subUnitCode)) {
      hierarchyCode = [subCode, instCode, poliCode, subUnitCode].filter(Boolean).join('.');
    }

    return {
      ...a,
      subCode,
      instCode,
      poliCode,
      subUnitCode,
      hierarchyCode
    };
  });

  const userDivisionCodes = Array.from(new Set(
    [
      ...(userSession.divisionCodes || []),
      userSession.divisionCode,
      ...(normalizedAssignments || []).map((a) => a.divisionCode)
    ].filter((c): c is string => Boolean(c) && c !== 'ALL')
  ));

  const [categoriesList, setCategoriesList] = useState<SoegiriCategory[]>(() => SOEGIRI_MASTER_CATEGORIES);

  useEffect(() => {
    return subscribeToHierarchyMaster((cats) => {
      setCategoriesList(cats);
    });
  }, []);

  const hasAllDivisionsAccess = userSession.role === 'admin';

  // ALL is a global Admin marker. A Petugas account must never inherit
  // global access from legacy divisionCode/divisionCodes/assignments.
  const petugasAssignments = normalizedAssignments.filter(
    (a) => String(a.divisionCode || '').toUpperCase() !== 'ALL'
  );

  const accessibleCategories = hasAllDivisionsAccess
    ? categoriesList
    : (userDivisionCodes.length > 0 
        ? categoriesList.filter((c) => userDivisionCodes.includes(c.code))
        : []);

  const effectiveAssignments = userSession.role === 'admin' ? normalizedAssignments : petugasAssignments;
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>(effectiveAssignments[0]?.id || '');
  const activeAssignment = effectiveAssignments.find((a) => a.id === selectedAssignmentId) || effectiveAssignments[0];

  const getDefaultSelectionForAssignment = (assignment: typeof normalizedAssignments[number]) => {
    const division = assignment?.divisionCode && assignment.divisionCode !== 'ALL'
      ? assignment.divisionCode
      : '';
    const parts = String(assignment?.hierarchyCode || '').split('.').filter(Boolean);
    return {
      division,
      subCode: assignment?.subCode || parts[0] || '',
      instCode: assignment?.instCode || parts[1] || '',
      poliCode: assignment?.poliCode || parts[2] || '',
      subUnitCode: assignment?.subUnitCode || parts[3] || ''
    };
  };

  // Returns only the immediate children of a hierarchy node. Petugas can
  // descend only from the branch assigned to the account.
  const getHierarchyChildren = (divisionCode: string, pathCodes: string[]) => {
    const category = categoriesList.find((c) => c.code === divisionCode);
    if (!category) return [];
    let current: any = category;
    for (const code of pathCodes) {
      const children = Array.isArray(current?.children) && current.children.length
        ? current.children
        : (current?.subs || current?.instalasis || current?.polis || current?.subUnits || []);
      const found = children.find((node: any) => String(node.code) === String(code));
      if (!found) return [];
      current = found;
    }
    return Array.isArray(current?.children) && current.children.length
      ? current.children
      : (current?.subs || current?.instalasis || current?.polis || current?.subUnits || []);
  };

  const getAssignmentPath = (assignment: typeof normalizedAssignments[number]) =>
    String(assignment?.hierarchyCode || [assignment?.subCode, assignment?.instCode, assignment?.poliCode, assignment?.subUnitCode].filter(Boolean).join('.'))
      .split('.').filter(Boolean);

  const assignedDivisionCode = activeAssignment?.divisionCode || '';
  const hasValidPetugasAssignment = userSession.role === 'admin' || effectiveAssignments.length > 0;
  const assignedSubCode = activeAssignment?.subCode;
  const assignedInstCode = activeAssignment?.instCode;
  const assignedPoliCode = activeAssignment?.poliCode;
  const assignedSubUnitCode = activeAssignment?.subUnitCode;

  // Cascading Selection State
  const [selectedCatCode, setSelectedCatCode] = useState<string>(assignedDivisionCode);
  const [selectedSubCode, setSelectedSubCode] = useState<string>(assignedSubCode || '');
  const [selectedInstCode, setSelectedInstCode] = useState<string>(assignedInstCode || '');
  const [selectedPoliCode, setSelectedPoliCode] = useState<string>(assignedPoliCode || '');
  const [selectedSubUnitCode, setSelectedSubUnitCode] = useState<string>(assignedSubUnitCode || '');
  const [selectedHierarchyOverride, setSelectedHierarchyOverride] = useState<string>(activeAssignment?.hierarchyCode || '');

  useEffect(() => {
    const assignment = effectiveAssignments.find((a) => a.id === selectedAssignmentId) || effectiveAssignments[0];
    if (!assignment) return;
    setSelectedAssignmentId(assignment.id);
    const defaults = getDefaultSelectionForAssignment(assignment);
    setSelectedCatCode(defaults.division);
    setSelectedSubCode(defaults.subCode);
    setSelectedInstCode(defaults.instCode);
    setSelectedPoliCode(defaults.poliCode);
    setSelectedSubUnitCode(defaults.subUnitCode);
    setSelectedHierarchyOverride(assignment?.hierarchyCode || '');
  }, [selectedAssignmentId, userSession.username]);

  const activeCategory = categoriesList.find((c) => c.code === selectedCatCode);

  // Form State
  const [documentType, setDocumentType] = useState<'BARU' | 'LAMA' | 'REVIEW'>('BARU');
  const [title, setTitle] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [reviewPeriodMonths, setReviewPeriodMonths] = useState('12');
  const [summary, setSummary] = useState('');
  const [pengertian, setPengertian] = useState('');
  const [tujuan, setTujuan] = useState('');
  const [kebijakan, setKebijakan] = useState('');
  const [prosedur, setProsedur] = useState('');
  const [alur, setAlur] = useState('');
  const [unitTerkait, setUnitTerkait] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Mode Lama & Review fields
  const [manualLegacyNumber, setManualLegacyNumber] = useState('');
  const [revisionNumber, setRevisionNumber] = useState('00');
  const [legacyApprover, setLegacyApprover] = useState('Direktur RSUD Dr. Soegiri');
  const [legacySignedDate, setLegacySignedDate] = useState(new Date().toISOString().split('T')[0]);
  const [existingSopId, setExistingSopId] = useState('');
  const [oldSopNumber, setOldSopNumber] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [selectedExistingSopIdForReview, setSelectedExistingSopIdForReview] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIssuingNumber, setIsIssuingNumber] = useState(false);
  const [issuedSopNumber, setIssuedSopNumber] = useState<string | null>(null);
  const [issuedSopId, setIssuedSopId] = useState<string | null>(null);
  const [issuedSopSequence, setIssuedSopSequence] = useState<number | null>(null);
  const [issuedSopDivision, setIssuedSopDivision] = useState<string | null>(null);
  const [issuedSopHierarchy, setIssuedSopHierarchy] = useState<string | null>(null);
  const [issuedSopDate, setIssuedSopDate] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [latestCreatedSop, setLatestCreatedSop] = useState<SopDocument | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  // Validation helper for rich text and image content
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
    const text = (temp.textContent || temp.innerText || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > 0;
  };

  const missingSections = useMemo(() => {
    if (documentType === 'LAMA') return [];
    const list: string[] = [];
    if (!hasRichContent(pengertian)) list.push('PENGERTIAN');
    if (!hasRichContent(tujuan)) list.push('TUJUAN');
    if (!hasRichContent(kebijakan)) list.push('KEBIJAKAN');
    if (!hasRichContent(prosedur)) list.push('PROSEDUR');
    if (!hasRichContent(unitTerkait)) list.push('UNIT TERKAIT');
    return list;
  }, [documentType, pengertian, tujuan, kebijakan, prosedur, unitTerkait]);

  // Accessible SOPs count
  const accessibleSops = useMemo(() => {
    return sops.filter((s) => isSopAccessibleByUser(s, userSession));
  }, [sops, userSession]);

  const skCount = useMemo(() => libraryDocuments.filter((d) => d.type === 'SK').length, [libraryDocuments]);
  const mouCount = useMemo(() => libraryDocuments.filter((d) => d.type === 'MOU').length, [libraryDocuments]);
  const activeSopCount = useMemo(() => sops.filter((s) => s.status === 'AKTIF').length, [sops]);
  const finalDocCount = activeSopCount + libraryDocuments.length;

  const subHierarchyCode = buildSubHierarchyCode({
    categoryCode: selectedCatCode,
    hierarchyCode: selectedHierarchyOverride,
    subCode: selectedSubCode,
    instalasiCode: selectedInstCode,
    poliCode: selectedPoliCode,
    subUnitCode: selectedSubUnitCode
  });

  const hierarchyInfo = getSoegiriHierarchyInfo({
    categoryCode: selectedCatCode,
    hierarchyCode: selectedHierarchyOverride,
    subCode: selectedSubCode,
    instalasiCode: selectedInstCode,
    poliCode: selectedPoliCode,
    subUnitCode: selectedSubUnitCode
  });

  const handleIssueNumber = async () => {
    if (!onIssueSopNumber || !hasValidPetugasAssignment) return;
    if (!title.trim()) { onShowToast?.('error', 'Data Belum Lengkap', 'Judul SPO wajib diisi.'); return; }
    if (!effectiveDate) { onShowToast?.('error', 'Data Belum Lengkap', 'Tanggal berlaku wajib diisi.'); return; }
    if (!String(revisionNumber).trim()) { onShowToast?.('error', 'Data Belum Lengkap', 'Revisi wajib diisi.'); return; }
    try {
      setIsIssuingNumber(true);
      setSubmitError(null);
      const issued = await onIssueSopNumber({
        divisionCode: selectedCatCode,
        subHierarchyCode: subHierarchyCode || undefined,
        dateStr: effectiveDate,
        title: title.trim(),
        revisionNumber: String(revisionNumber).trim()
      });
      setIssuedSopNumber(issued.sopNumber);
      setIssuedSopId(issued.id);
      setIssuedSopSequence(issued.sequenceNumber);
      setIssuedSopDivision(issued.divisionCode);
      setIssuedSopHierarchy(issued.subHierarchyCode || '');
      setIssuedSopDate(issued.effectiveDate);
      setShowIssueNumberModal(false);
      onShowToast?.('success', 'Nomor SPO Diterbitkan', `Nomor ${issued.sopNumber} berhasil diterbitkan dengan status "Belum Upload".`);
    } catch (err: any) {
      const message = err?.message || 'Nomor SPO gagal diterbitkan.';
      setSubmitError(message);
      onShowToast?.('error', 'Penerbitan Nomor Gagal', message);
    } finally {
      setIsIssuingNumber(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (documentType === 'LAMA' && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        onShowToast?.('error', 'Format File Salah', 'SPO Eksisting wajib berupa file PDF asli.');
        e.target.value = '';
        return;
      }
      setSelectedFile(file);
      if (!title) {
        const cleanName = file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .trim();
        setTitle(cleanName);
      }
    }
  };

  const resetForm = () => {
    setTitle('');
    setSummary('');
    setPengertian('');
    setTujuan('');
    setKebijakan('');
    setProsedur('');
    setAlur('');
    setUnitTerkait('');
    setSelectedFile(null);
    setManualLegacyNumber('');
    setRevisionNumber('00');
    setExistingSopId('');
    setOldSopNumber('');
    setReviewReason('');
    setSelectedExistingSopIdForReview('');
    setSubmitError(null);
    setIssuedSopNumber(null);
    setIssuedSopId(null);
    setIssuedSopSequence(null);
    setIssuedSopDivision(null);
    setIssuedSopHierarchy(null);
    setIssuedSopDate(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const isLegacy = documentType === 'LAMA';
    const isReview = documentType === 'REVIEW';

    // Validasi hirarki hanya untuk SPO Baru dan SPO Riviu (SPO Eksisting tidak wajib isi hirarki/unit)
    if (!isLegacy) {
      if (!hasValidPetugasAssignment || !activeAssignment?.divisionCode || String(activeAssignment.divisionCode).toUpperCase() === 'ALL') {
        setSubmitError('Akun Petugas belum memiliki hirarki yang valid. Pengajuan SPO tidak dapat dilakukan.');
        return;
      }

      const selectedPath = [selectedSubCode, selectedInstCode, selectedPoliCode, selectedSubUnitCode].filter(Boolean);
      const assignmentPath = getAssignmentPath(activeAssignment);
      const selectedFollowsAssignment = assignmentPath.every((v, i) => selectedPath[i] === v);
      if (!selectedFollowsAssignment) {
        setSubmitError('Hirarki yang dipilih tidak sesuai dengan assignment akun Petugas.');
        return;
      }
      if (getHierarchyChildren(selectedCatCode, selectedPath).length > 0) {
        setSubmitError('Pilih sampai tingkat unit terakhir yang tersedia sebelum mengajukan SPO.');
        return;
      }

      if (!title.trim()) {
        setSubmitError('Judul SPO wajib diisi.');
        return;
      }

      if (missingSections.length > 0) {
        setSubmitError(`Bagian batang tubuh SPO berikut belum lengkap (wajib diisi teks atau gambar):\n• ${missingSections.join('\n• ')}`);
        return;
      }
    }

    let finalIssuedId = issuedSopId;
    let finalIssuedSequence = issuedSopSequence;
    let finalIssuedNumber = issuedSopNumber;

    if (issuedSopId && documentType === 'BARU') {
      if (issuedSopDivision !== selectedCatCode || (issuedSopHierarchy || '') !== (subHierarchyCode || '') || issuedSopDate !== effectiveDate) {
        // Jika hirarki/tanggal berubah setelah reservasi nomor sebelumnya,
        // alokasikan nomor urut baru secara otomatis sesuai hirarki dan tanggal aktif
        finalIssuedId = null;
        finalIssuedSequence = null;
        finalIssuedNumber = null;
      }
    }

    let matchedExistingDoc: SopDocument | undefined = undefined;
    let detectedInfo: ReturnType<typeof detectHierarchyFromSopNumber> = null;

    if (isLegacy) {
      const cleanNum = manualLegacyNumber.trim();
      if (!cleanNum) {
        setSubmitError('Nomor SPO Lama / Eksisting resmi wajib diisi.');
        return;
      }
      if (!selectedFile) {
        setSubmitError('Wajib mengunggah scan file PDF asli SPO Eksisting yang sudah bertanda tangan.');
        return;
      }

      // Deteksi dokumen terdaftar yang sudah ada di sistem
      matchedExistingDoc = sops?.find((s) => 
        (s.sopNumber && s.sopNumber.trim().toLowerCase() === cleanNum.toLowerCase()) ||
        (s.legacySopNumber && s.legacySopNumber.trim().toLowerCase() === cleanNum.toLowerCase()) ||
        (existingSopId && s.id === existingSopId)
      );

      // Aturan: SPO Eksisting TIDAK BISA menggantikan SPO yang sudah berstatus AKTIF
      if (matchedExistingDoc && matchedExistingDoc.status === 'AKTIF') {
        setSubmitError(
          `Nomor SPO "${cleanNum}" sudah terdaftar dengan status AKTIF ("${matchedExistingDoc.title}"). Sesuai aturan rumah sakit, dokumen berstatus Aktif tidak dapat digantikan melalui alur SPO Eksisting. Silakan gunakan alur "SPO Riviu" untuk melakukan revisi dokumen aktif.`
        );
        return;
      }

      // Deteksi hirarki otomatis dari nomor SPO
      detectedInfo = detectHierarchyFromSopNumber(cleanNum);

      if (!title.trim() && !matchedExistingDoc?.title) {
        setSubmitError('Judul SPO Eksisting wajib diisi.');
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const cleanNum = manualLegacyNumber.trim();

      // Tentukan field hirarki dan metadata
      const finalDivCode = isLegacy
        ? (matchedExistingDoc?.divisionCode || detectedInfo?.divisionCode || selectedCatCode || 'PEL')
        : selectedCatCode;
      const finalDivName = isLegacy
        ? (matchedExistingDoc?.divisionName || (matchedExistingDoc as any)?.categoryName || detectedInfo?.divisionName || activeCategory?.name || finalDivCode)
        : (activeCategory?.name || selectedCatCode);
      const finalSubHierarchy = isLegacy
        ? (matchedExistingDoc?.subHierarchyCode !== undefined ? matchedExistingDoc.subHierarchyCode : (detectedInfo?.subHierarchyCode !== undefined ? detectedInfo.subHierarchyCode : (subHierarchyCode || '')))
        : subHierarchyCode;
      const finalSubCode = isLegacy
        ? (matchedExistingDoc?.subCode || detectedInfo?.subCode || selectedSubCode)
        : selectedSubCode;
      const finalInstCode = isLegacy
        ? (matchedExistingDoc?.instalasiCode || (matchedExistingDoc as any)?.instCode || detectedInfo?.instalasiCode || selectedInstCode)
        : selectedInstCode;
      const finalPoliCode = isLegacy
        ? (matchedExistingDoc?.poliCode || detectedInfo?.poliCode || selectedPoliCode)
        : selectedPoliCode;
      const finalSubUnitCode = isLegacy
        ? (matchedExistingDoc?.subUnitCode || detectedInfo?.subUnitCode || selectedSubUnitCode)
        : selectedSubUnitCode;
      const finalHierarchyDesc = isLegacy
        ? (matchedExistingDoc?.hierarchyDescription || detectedInfo?.hierarchyDescription || hierarchyInfo.conclusion)
        : hierarchyInfo.conclusion;
      const finalTitle = title.trim() || matchedExistingDoc?.title || `SPO Eksisting ${cleanNum}`;

      const sopData: Omit<SopDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'> & { id?: string } = {
        sequenceNumber: isLegacy ? 0 : (finalIssuedSequence || 0),
        id: isLegacy ? (matchedExistingDoc?.id || undefined) : (finalIssuedId || undefined),
        title: finalTitle,
        divisionId: finalDivCode,
        divisionCode: finalDivCode,
        divisionName: finalDivName,
        categoryId: finalDivCode,
        categoryName: finalDivName,
        version: isReview ? (revisionNumber || '01') : isLegacy ? (revisionNumber || matchedExistingDoc?.version || '00') : (revisionNumber || '00'),
        status: isLegacy ? 'AKTIF' : 'MENUNGGU_PENGESAHAN',
        effectiveDate: effectiveDate || (isLegacy ? matchedExistingDoc?.effectiveDate : undefined) || new Date().toISOString().split('T')[0],
        reviewPeriodMonths: Number(reviewPeriodMonths) || 12,
        nextReviewDate: '',
        creatorName: userSession.name,
        creatorUnit: userSession.unitName || finalDivName,
        approverName: isLegacy ? (legacyApprover || matchedExistingDoc?.approverName || SOEGIRI_HOSPITAL_INFO.director.name) : SOEGIRI_HOSPITAL_INFO.director.name,
        summary: isReview && reviewReason ? `Riviu SPO: ${reviewReason}` : summary.trim() || `Standar Prosedur Operasional ${finalTitle}`,
        tags: [finalDivCode, finalSubHierarchy, isReview ? 'riviu' : isLegacy ? 'eksisting' : ''].filter(Boolean),
        subHierarchyCode: finalSubHierarchy,
        subCode: finalSubCode,
        instalasiCode: finalInstCode,
        poliCode: finalPoliCode,
        subUnitCode: finalSubUnitCode || undefined,
        hierarchyDescription: finalHierarchyDesc || undefined,
        documentType: isLegacy ? 'LAMA' : 'BARU',
        jenis_spo: isLegacy ? 'EKSISTING' : isReview ? 'RIVIU' : 'BARU',
        isLegacySop: isLegacy,
        legacySopNumber: isLegacy ? cleanNum : undefined,
        sopNumber: isLegacy ? cleanNum : (finalIssuedNumber || oldSopNumber || ''),
        existingSopId: isReview ? (selectedExistingSopIdForReview || existingSopId || undefined) : isLegacy ? matchedExistingDoc?.id : undefined,
        pengertian: pengertian.trim() || (isLegacy ? matchedExistingDoc?.pengertian : undefined) || undefined,
        tujuan: tujuan.trim() || (isLegacy ? matchedExistingDoc?.tujuan : undefined) || undefined,
        kebijakan: kebijakan.trim() || (isLegacy ? matchedExistingDoc?.kebijakan : undefined) || undefined,
        prosedur: prosedur.trim() || (isLegacy ? matchedExistingDoc?.prosedur : undefined) || undefined,
        unitTerkait: unitTerkait.trim() || (isLegacy ? matchedExistingDoc?.unitTerkait : undefined) || undefined,
        confidentialityLevel: 'Internal',
      };

      // Alur is optional in the SPO standard. Keep it in the saved object when
      // present, without forcing a shared-type change in this UI-only refactor.
      if (alur.trim()) {
        (sopData as any).alur = alur.trim();
      }

      if (selectedFile) {
        const reader = new FileReader();
        const dataUrlPromise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });

        const dataUrl = await dataUrlPromise;
        if (isLegacy) {
          sopData.fileName = selectedFile.name;
          sopData.fileSize = selectedFile.size;
          sopData.fileType = selectedFile.type || 'application/pdf';
          sopData.fileDataUrl = dataUrl;
          sopData.oldFileName = selectedFile.name;
          sopData.oldFileSize = selectedFile.size;
          sopData.oldFileType = selectedFile.type || 'application/pdf';
          sopData.oldFileDataUrl = dataUrl;
          sopData.signedScanFileName = selectedFile.name;
          sopData.signedScanFileSize = selectedFile.size;
          sopData.signedScanFileType = selectedFile.type || 'application/pdf';
          sopData.signedScanDataUrl = dataUrl;
        } else {
          sopData.fileName = selectedFile.name;
          sopData.fileSize = selectedFile.size;
          sopData.fileType = selectedFile.type;
          sopData.fileDataUrl = dataUrl;
        }
      }

      const created = await onAddSop(sopData);
      setLatestCreatedSop(created);
      setIsSuccessModalOpen(true);
      resetForm();
      onShowToast?.('success', 'SPO Berhasil Diajukan', `Nomor ${created.sopNumber || 'resmi'} tercatat.`);
    } catch (err: any) {
      setSubmitError(err?.message || 'Gagal menyimpan dokumen SPO.');
      onShowToast?.('error', 'Gagal Simpan', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* 1. Global Header with the 6 Unified Menus */}
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        totalSopCount={accessibleSops.length}
        activeSopCount={activeSopCount}
        skCount={skCount}
        mouCount={mouCount}
        finalDocCount={finalDocCount}
        onOpenUpload={() => {
          setActiveTab('spo');
          setSpoSubTab('input');
        }}
        userSession={userSession}
        onLogout={onLogout}
      />

      {/* 2. Main Page Container */}
      <main className="flex-1 min-w-0 w-full lg:ml-72 lg:w-[calc(100%-18rem)] max-w-none mx-0 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <DashboardOverviewPage
            sops={sops}
            documents={libraryDocuments}
            userSession={userSession}
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenUploadSop={() => {
              setActiveTab('spo');
              setSpoSubTab('input');
            }}
            onViewSop={onViewDetail}
          />
        )}

        {/* TAB 2: SPO (Workspace Petugas) */}
        {activeTab === 'spo' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Sub-header / toggle */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                    Standar Prosedur Operasional (SPO)
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ruang kerja penyusunan dan arsip SPO unit kerja Anda: <strong>{userSession.unitName || userSession.divisionCode}</strong>
                  </p>
                </div>
              </div>

              {/* Subtabs Switcher */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setSpoSubTab('list')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    spoSubTab === 'list'
                      ? 'bg-white text-emerald-800 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ListOrdered className="w-4 h-4" />
                  <span>Daftar SPO Unit ({accessibleSops.length})</span>
                </button>

                {spoSubTab === 'input' && documentType === 'BARU' && (
                  <button
                    type="button"
                    onClick={() => setShowIssueNumberModal(true)}
                    disabled={isIssuingNumber}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black transition-all cursor-pointer"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    <span>{isIssuingNumber ? 'Menerbitkan...' : 'Terbitkan Nomor SPO'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* SubTab List: Petugas Library Tab */}
            {spoSubTab === 'list' && (
              <PetugasLibraryTab
                sops={sops}
                userSession={userSession}
                onViewDetail={onViewDetail}
                onSwitchToInputTab={() => setSpoSubTab('input')}
              />
            )}

            {/* SubTab Input: Form Input SPO — compact workspace */}
            {spoSubTab === 'input' && (
              <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 shadow-xs max-w-6xl mx-auto space-y-5">
                <div className="border-b border-slate-100 pb-4 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Formulir Pengajuan / Input SPO</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Lengkapi jenis dokumen, unit kerja, dan rincian SPO.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSpoSubTab('list')}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 shrink-0"
                  >
                    Batal
                  </button>
                </div>

                {submitError && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                    {submitError}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* 1. Jenis SPO */}
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">1. Jenis Dokumen SPO</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setDocumentType('BARU')}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                          documentType === 'BARU'
                            ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <FileText className={`w-5 h-5 shrink-0 ${documentType === 'BARU' ? 'text-emerald-700' : 'text-slate-400'}`} />
                        <div>
                          <div className="text-xs font-black">SPO Baru (2026)</div>
                          <div className="text-[10px] text-slate-400">Penomoran otomatis</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDocumentType('LAMA')}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                          documentType === 'LAMA'
                            ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-500/20 text-purple-950'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <BookOpen className={`w-5 h-5 shrink-0 ${documentType === 'LAMA' ? 'text-purple-700' : 'text-slate-400'}`} />
                        <div>
                          <div className="text-xs font-black">SPO Eksisting</div>
                          <div className="text-[10px] text-slate-400">Scan PDF sah bertandatangan</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDocumentType('REVIEW');
                          if (!revisionNumber || revisionNumber === '00') setRevisionNumber('01');
                        }}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                          documentType === 'REVIEW'
                            ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 text-amber-950'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <RefreshCw className={`w-5 h-5 shrink-0 ${documentType === 'REVIEW' ? 'text-amber-700' : 'text-slate-400'}`} />
                        <div>
                          <div className="text-xs font-black">SPO Riviu</div>
                          <div className="text-[10px] text-slate-400">Revisi berkala / tahunan</div>
                        </div>
                      </button>
                    </div>
                  </section>

                  {/* 2. Unit / Hierarchy — hanya untuk SPO Baru/Riviu.
                      SPO Eksisting otomatis mengikuti unit dari nomor SPO yang sudah ada. */}
                  {(documentType === 'BARU' || documentType === 'REVIEW') && (
                  <section className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-emerald-600" />
                        <span>2. Unit Kerja / Hierarki SPO</span>
                      </h3>
                    </div>

                    {hasValidPetugasAssignment ? (
                      <>


                        <div className={effectiveAssignments.length > 1 ? 'grid grid-cols-1 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.15fr)] gap-3 items-stretch' : 'grid grid-cols-1 gap-3'}>
                          {effectiveAssignments.length > 1 && (
                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                              <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Pilih Cabang Akses</label>
                              <select
                                value={selectedAssignmentId}
                                onChange={(e) => setSelectedAssignmentId(e.target.value)}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                              >
                                {effectiveAssignments.map((assignment) => {
                                  const info = getSoegiriHierarchyInfo({
                                    categoryCode: assignment.divisionCode,
                                    hierarchyCode: assignment.hierarchyCode || '',
                                    subCode: assignment.subCode,
                                    instalasiCode: assignment.instCode,
                                    poliCode: assignment.poliCode,
                                    subUnitCode: assignment.subUnitCode
                                  });
                                  const name = (assignment.unitName || info.path?.[info.path.length - 1] || info.label || assignment.divisionCode)
                                    .replace(/^Inst\.\s*/i, 'Instalasi ');
                                  return <option key={assignment.id} value={assignment.id}>{name}</option>;
                                })}
                              </select>
                            </div>
                          )}

                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 px-4 py-3 flex flex-col justify-center min-w-0">
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Hirarki Akun</div>
                            <div className="text-base sm:text-lg font-black text-slate-900 truncate">
                              {activeAssignment?.unitName || activeCategory?.name || selectedCatCode}
                            </div>
                            <div className="mt-2 inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs sm:text-sm font-extrabold text-emerald-700">
                              {selectedCatCode}{selectedHierarchyOverride ? ` ${selectedHierarchyOverride}` : ''}
                            </div>
                          </div>
                        </div>

                        {(() => {
                          const assignmentPath = getAssignmentPath(activeAssignment);
                          const currentPath = [selectedSubCode, selectedInstCode, selectedPoliCode, selectedSubUnitCode].filter(Boolean);
                          const prefix = assignmentPath;
                          const prefixIsValid = prefix.every((v, i) => currentPath[i] === v);
                          const safeCurrent = prefixIsValid ? currentPath : [...prefix];

                          const selectors: React.ReactNode[] = [];
                          let level = prefix.length;

                          while (level < 4) {
                            const parentPath = safeCurrent.slice(0, level);
                            const children = getHierarchyChildren(selectedCatCode, parentPath);
                            if (!children.length) break;

                            const value = safeCurrent[level] || '';
                            const levelLabel = level === 0
                              ? 'Pilih Sub Bagian / Unit'
                              : level === 1
                                ? 'Pilih Instalasi / Unit'
                                : level === 2
                                  ? 'Pilih Poli / Unit'
                                  : 'Pilih Sub Unit';
                            const selectorLevel = level;

                            selectors.push(
                              <div key={`hierarchy-level-${selectorLevel}`}>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1.5">{levelLabel}</label>
                                <select
                                  value={value}
                                  onChange={(e) => {
                                    const selected = e.target.value;
                                    const next = safeCurrent.slice(0, selectorLevel);
                                    if (selected) next.push(selected);

                                    setSelectedSubCode(next[0] || '');
                                    setSelectedInstCode(next[1] || '');
                                    setSelectedPoliCode(next[2] || '');
                                    setSelectedSubUnitCode(next[3] || '');
                                    setSelectedHierarchyOverride(next.join('.'));
                                  }}
                                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                  <option value="">{selectorLevel === prefix.length ? 'Pilih...' : 'Pilih turunan...'}</option>
                                  {children.map((node: any) => (
                                    <option key={`${selectedCatCode}-${selectorLevel}-${node.code}`} value={node.code}>
                                      {node.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );

                            if (!value) break;
                            level += 1;
                          }

                          if (!selectors.length) return null;

                          return (
                            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                                Pilihan Turunan
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-end">
                                {selectors}
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-xs text-amber-800 font-semibold">
                        Akun Petugas belum memiliki assignment hirarki yang valid. Pengajuan SPO tidak dapat dilanjutkan.
                      </div>
                    )}
                  </section>

                  )}

                  {/* Nomor SPO diterbitkan ditampilkan ringkas di bawah form setelah berhasil. */}
                  {documentType === 'BARU' && issuedSopNumber && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Nomor SPO diterbitkan</div>
                        <div className="font-mono text-sm font-black text-slate-900 mt-0.5">{issuedSopNumber}</div>
                      </div>
                      <button type="button" onClick={() => navigator.clipboard?.writeText(issuedSopNumber)} className="text-xs font-bold text-emerald-700 hover:underline">Salin Nomor</button>
                    </div>
                  )}

                  {/* 3. Formulir SPO EKSISTING (Tanpa Batang Tubuh, Cukup Nomor & Upload File PDF) */}
                  {documentType === 'LAMA' ? (
                    <section className="rounded-2xl border border-purple-200 bg-purple-50/70 p-4 sm:p-6 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-950">
                          <BookOpen className="w-4 h-4 text-purple-700" />
                          <span>3. Rincian & Berkas SPO Eksisting</span>
                        </div>
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-100/80 px-2.5 py-1 rounded-full border border-purple-200">
                          Format Penomoran Asli / Lama
                        </span>
                      </div>

                      {/* Dropdown Opsional: Pilih dokumen terdaftar untuk digantikan */}
                      {sops && sops.length > 0 && (
                        <div className="rounded-xl border border-purple-200 bg-white/80 p-3">
                          <label className="block text-[11px] font-bold text-purple-950 mb-1">
                            Pilih Dokumen Terdaftar untuk Diganti / Diperbarui (Opsional)
                          </label>
                          <select
                            value={existingSopId || ''}
                            onChange={(e) => {
                              const pickedId = e.target.value;
                              setExistingSopId(pickedId);
                              if (pickedId) {
                                const doc = sops.find((s) => s.id === pickedId);
                                if (doc) {
                                  setManualLegacyNumber(doc.sopNumber || doc.legacySopNumber || '');
                                  if (doc.title) setTitle(doc.title);
                                  if (doc.effectiveDate) setEffectiveDate(doc.effectiveDate);
                                  if (doc.divisionCode) setSelectedCatCode(doc.divisionCode);
                                  if (doc.subCode) setSelectedSubCode(doc.subCode);
                                  if (doc.instalasiCode || (doc as any).instCode) setSelectedInstCode(doc.instalasiCode || (doc as any).instCode);
                                  if (doc.poliCode) setSelectedPoliCode(doc.poliCode);
                                  if (doc.subUnitCode) setSelectedSubUnitCode(doc.subUnitCode);
                                }
                              }
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-purple-300 bg-white text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-purple-500"
                          >
                            <option value="">-- Ketik nomor manual di bawah, atau pilih dari daftar --</option>
                            {sops.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.sopNumber || s.legacySopNumber || 'Tanpa Nomor'} - {s.title} ({s.status || 'Belum Aktif'})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Nomor SPO Lama */}
                        <div>
                          <label className="block text-xs font-bold text-purple-950 mb-1.5">
                            Nomor SPO Eksisting / Lama <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={manualLegacyNumber}
                            onChange={(e) => {
                              const val = e.target.value;
                              setManualLegacyNumber(val);
                              const clean = val.trim();
                              if (clean) {
                                const matched = sops?.find((s) => 
                                  (s.sopNumber && s.sopNumber.trim().toLowerCase() === clean.toLowerCase()) ||
                                  (s.legacySopNumber && s.legacySopNumber.trim().toLowerCase() === clean.toLowerCase())
                                );
                                if (matched) {
                                  setExistingSopId(matched.id);
                                  if (!title.trim() && matched.title) {
                                    setTitle(matched.title);
                                  }
                                  if (matched.effectiveDate) {
                                    setEffectiveDate(matched.effectiveDate);
                                  }
                                }
                              }
                            }}
                            placeholder="Contoh: 440/102/SPO/PEL/2023 atau PEL/1.1.3/008/2024"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-purple-300 bg-white font-mono text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                          />

                          {/* Informasi Deteksi Otomatis Nomor & Hirarki */}
                          {manualLegacyNumber.trim() && (() => {
                            const clean = manualLegacyNumber.trim();
                            const matched = sops?.find((s) => 
                              (s.sopNumber && s.sopNumber.trim().toLowerCase() === clean.toLowerCase()) ||
                              (s.legacySopNumber && s.legacySopNumber.trim().toLowerCase() === clean.toLowerCase()) ||
                              (existingSopId && s.id === existingSopId)
                            );

                            if (matched) {
                              const isAktif = matched.status === 'AKTIF';
                              const statusLabel =
                                matched.status === 'MENUNGGU_PENGESAHAN'
                                  ? 'Menunggu Pengesahan'
                                  : matched.status === 'DRAFT' || matched.status === 'BELUM_UPLOAD' || matched.isNumberReservation
                                  ? 'Belum Upload'
                                  : matched.status === 'AKTIF'
                                  ? 'Aktif'
                                  : matched.status || 'Belum Aktif';
                              const unitName = matched.hierarchyDescription || matched.divisionName || (matched as any).unitName || matched.divisionCode || 'Unit kerja terdaftar';

                              if (isAktif) {
                                return (
                                  <div className="mt-2 rounded-xl border border-rose-300 bg-rose-50/95 p-3 space-y-1 text-rose-950">
                                    <div className="flex items-center gap-1.5 text-xs font-black text-rose-700">
                                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                      <span>Nomor Terdaftar dengan Status AKTIF (Tidak Dapat Diganti)</span>
                                    </div>
                                    <div className="text-xs font-bold text-slate-900 line-clamp-1">{matched.title}</div>
                                    <div className="text-[11px] text-rose-800">
                                      <span className="font-semibold">Unit/Hirarki:</span> {unitName}
                                    </div>
                                    <div className="text-[10px] font-semibold text-rose-700">
                                      Sesuai aturan, SPO berstatus <strong>Aktif</strong> tidak dapat diganti melalui SPO Eksisting. Silakan gunakan alur <strong>SPO Riviu</strong> untuk memperbarui dokumen aktif.
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 space-y-1">
                                  <div className="flex items-center gap-1.5 text-xs font-black text-emerald-900">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span>Dokumen Terdaftar Ditemukan ({statusLabel})</span>
                                  </div>
                                  <div className="text-xs font-bold text-slate-900 line-clamp-1">{matched.title}</div>
                                  <div className="text-[11px] text-emerald-800">
                                    <span className="font-semibold">Hirarki Terdaftar:</span> {unitName}
                                  </div>
                                  <div className="text-[10px] text-slate-500 italic">
                                    Unggahan berkas ini akan melengkapi dan mengaktifkan dokumen berstatus {statusLabel} ini di sistem.
                                  </div>
                                </div>
                              );
                            }

                            // Jika belum terdaftar, deteksi hirarki dari string nomor
                            const detected = detectHierarchyFromSopNumber(clean);
                            return (
                              <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50/90 p-3 space-y-1">
                                <div className="flex items-center gap-1.5 text-xs font-black text-blue-900">
                                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                                  <span>Nomor SPO Belum Terdaftar (Otomatis Registrasi)</span>
                                </div>
                                <div className="text-[11px] text-blue-950">
                                  <span className="font-semibold">Hirarki Terdeteksi:</span>{' '}
                                  {detected?.hierarchyDescription || detected?.divisionName || 'Bidang Pelayanan RSUD Dr. Soegiri'}
                                </div>
                                <div className="text-[10px] text-slate-500 italic">
                                  Dokumen akan otomatis didaftarkan sebagai SPO Eksisting Aktif dengan nomor ini tetap dipertahankan.
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Tanggal Penetapan/Pengesahan */}
                        <div>
                          <label className="block text-xs font-bold text-purple-950 mb-1.5">
                            Tanggal Ditetapkan / Pengesahan Asli
                          </label>
                          <input
                            type="date"
                            value={effectiveDate}
                            onChange={(e) => setEffectiveDate(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-purple-300 bg-white text-xs outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                          />
                          <p className="mt-1 text-[10px] text-slate-500">
                            Tanggal pengesahan sesuai yang tercantum di lembar tanda tangan dokumen fisik.
                          </p>
                        </div>
                      </div>

                      {/* Judul Dokumen */}
                      <div>
                        <label className="block text-xs font-bold text-purple-950 mb-1.5">
                          Judul SPO Eksisting <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Contoh: Prosedur Pelayanan Rekam Medis Rawat Jalan"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-purple-300 bg-white text-xs sm:text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                        />
                      </div>

                      {/* File Upload PDF SPO Eksisting */}
                      <div className="p-4 rounded-xl border-2 border-dashed border-purple-300 bg-white space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                            <Upload className="w-4 h-4 text-purple-700" />
                            Upload File Scan PDF SPO Eksisting (Wajib) <span className="text-rose-500">*</span>
                          </span>
                          {selectedFile && (
                            <button
                              type="button"
                              onClick={() => setSelectedFile(null)}
                              className="text-[11px] font-bold text-rose-600 hover:text-rose-800"
                            >
                              Hapus File
                            </button>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={handleFileChange}
                          className="text-xs text-slate-700 w-full file:mr-3 file:py-1.5 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer shadow-2xs"
                        />
                        {selectedFile ? (
                          <p className="text-xs font-bold text-emerald-800 bg-emerald-50 p-2 rounded-lg border border-emerald-200 truncate">
                            ✓ {selectedFile.name} ({formatBytes(selectedFile.size)})
                          </p>
                        ) : (
                          <p className="text-[11px] text-purple-900">
                            * Cukup unggah berkas pindaian scan PDF SPO resmi yang sudah bertanda tangan untuk langsung menggantikan dan mengaktifkan dokumen di Library.
                          </p>
                        )}
                      </div>
                    </section>
                  ) : (
                    <>
                      {/* Rujukan & Identitas SPO Riviu */}
                      {documentType === 'REVIEW' && (
                        <section className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 sm:p-5 space-y-4">
                          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-950">
                            <RefreshCw className="w-4 h-4 text-amber-700" />
                            <span>Rujukan Dokumen SPO Lama yang Direview</span>
                          </div>

                          {/* Dropdown pilih SPO terdaftar untuk auto-populate */}
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-bold text-amber-950 mb-1.5">
                                Pilih SPO Terdaftar untuk Diriviu (Otomatis Isi Data)
                              </label>
                              <select
                                value={selectedExistingSopIdForReview}
                                onChange={(e) => {
                                  const chosenId = e.target.value;
                                  setSelectedExistingSopIdForReview(chosenId);
                                  setExistingSopId(chosenId);
                                  const found = sops.find((s) => s.id === chosenId);
                                  if (found) {
                                    setTitle(found.title || '');
                                    setOldSopNumber(found.sopNumber || '');
                                    setPengertian(found.pengertian || '');
                                    setTujuan(found.tujuan || '');
                                    setKebijakan(found.kebijakan || '');
                                    setProsedur(found.prosedur || '');
                                    setAlur((found as any).alur || '');
                                    setUnitTerkait(found.unitTerkait || '');
                                    const currentRevNum = parseInt(found.version || '0', 10);
                                    const nextRev = isNaN(currentRevNum) ? '01' : String(currentRevNum + 1).padStart(2, '0');
                                    setRevisionNumber(nextRev);
                                    onShowToast?.('info', 'Data SPO Dimuat', `Data dari "${found.title}" telah dimuat untuk proses riviu.`);
                                  }
                                }}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 bg-white text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                              >
                                <option value="">-- Pilih dari Daftar Dokumen SPO Tersedia --</option>
                                {accessibleSops.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    [{s.sopNumber || 'Tanpa No'}] {s.title} (Rev: {s.version || '00'})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-amber-950 mb-1.5">
                                  Nomor / Judul Rujukan SPO Lama <span className="text-rose-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  required={documentType === 'REVIEW'}
                                  value={oldSopNumber}
                                  onChange={(e) => setOldSopNumber(e.target.value)}
                                  placeholder="Contoh: PEL / 1.1.3 / 015 / 2023 - SPO Rekam Jantung"
                                  className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 bg-white text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-amber-950 mb-1.5">
                                  Nomor Revisi Baru <span className="text-rose-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  required={documentType === 'REVIEW'}
                                  value={revisionNumber}
                                  onChange={(e) => setRevisionNumber(e.target.value)}
                                  placeholder="01"
                                  className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 bg-white font-mono text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-amber-950 mb-1.5">
                                Dasar Kebijakan / Alasan Riviu & Catatan Perubahan
                              </label>
                              <textarea
                                rows={2}
                                value={reviewReason}
                                onChange={(e) => setReviewReason(e.target.value)}
                                placeholder="Contoh: Penyesuaian regulasi berdasarkan Permenkes terbaru dan SK Direktur RSUD Dr. Soegiri tahun 2026."
                                className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 bg-white text-xs text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                              />
                            </div>
                          </div>
                        </section>
                      )}

                      {/* 3. Batang Tubuh SPO — Mode Lembar Tabel Format Resmi A4 (Sesuai Standar EditSopModal) */}
                      <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                          <div>
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                              <FileText className="w-4 h-4 text-emerald-600" />
                              <span>3. Isi Standar Batang Tubuh SPO {documentType === 'REVIEW' ? '(Riviu)' : '(Baru)'}</span>
                            </h3>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Format resmi lembar naskah A4 RSUD Dr. Soegiri Lamongan lengkap dengan kop logo dan penetapan Direktur.
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                              <label className="text-[11px] font-bold text-slate-600">Periode Riviu:</label>
                              <select
                                value={reviewPeriodMonths}
                                onChange={(e) => setReviewPeriodMonths(e.target.value)}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                              >
                                <option value="12">1 Tahun (12 Bln)</option>
                                <option value="24">2 Tahun (24 Bln)</option>
                                <option value="36">3 Tahun (36 Bln)</option>
                              </select>
                            </div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black shrink-0 border border-emerald-200">
                              <TableIcon className="w-3.5 h-3.5" />
                              <span>Format Resmi A4</span>
                            </span>
                          </div>
                        </div>

                        <div className="pt-1">
                          <SopLiveTemplate
                            title={title}
                            onTitleChange={setTitle}
                            sopNumber={issuedSopNumber || (documentType === 'REVIEW' ? (oldSopNumber || 'SPO Riviu') : 'Otomatis')}
                            version={revisionNumber || (documentType === 'REVIEW' ? '01' : '00')}
                            effectiveDate={effectiveDate}
                            onEffectiveDateChange={setEffectiveDate}
                            approverName={SOEGIRI_HOSPITAL_INFO.director.name}
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
                            titleEditable={true}
                            dateEditable={true}
                            showPageHint={true}
                            missingSections={missingSections}
                          />
                        </div>
                      </section>

                      {/* File upload untuk SPO Baru / Riviu */}
                      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-black text-slate-700">
                              Lampiran Dokumen (Opsional)
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">PDF, Word, atau dokumen pendukung.</div>
                          </div>
                          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer hover:bg-slate-50">
                            <Upload className="w-4 h-4" />
                            Pilih File
                            <input
                              type="file"
                              accept="application/pdf,.pdf,.doc,.docx"
                              onChange={handleFileChange}
                              className="hidden"
                            />
                          </label>
                        </div>
                        {selectedFile && (
                          <p className="mt-2 text-[11px] font-bold text-emerald-700 truncate">
                            ✓ {selectedFile.name} ({formatBytes(selectedFile.size)})
                          </p>
                        )}
                      </section>
                    </>
                  )}

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setSpoSubTab('list')}
                      className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !hasValidPetugasAssignment}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black shadow-xs cursor-pointer"
                    >
                      {isSubmitting ? 'Menyimpan...' : (
                        <>
                          <PlusCircle className="w-4 h-4" />
                          <span>Daftarkan & Usulkan SPO</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SK (Halaman Terpisah) */}
        {activeTab === 'sk' && (
          <SKPage
            documents={libraryDocuments}
            userSession={userSession}
            onBack={() => setActiveTab('dashboard')}
            onShowToast={onShowToast}
          />
        )}

        {/* TAB 4: MOU (Halaman Terpisah) */}
        {activeTab === 'mou' && (
          <MOUPage
            documents={libraryDocuments}
            userSession={userSession}
            onBack={() => setActiveTab('dashboard')}
            onShowToast={onShowToast}
          />
        )}

        {/* TAB 5: LIBRARY (Hanya Dokumen Final) */}
        {activeTab === 'library' && (
          <FinalLibraryPage
            sops={sops}
            documents={libraryDocuments}
            userSession={userSession}
            onViewSop={onViewDetail}
            onShowToast={onShowToast}
          />
        )}

        {/* TAB PROFIL */}
        {activeTab === 'profile' && (
          <PetugasPasswordTab
            userSession={userSession}
            onLogout={onLogout}
            onUpdatePassword={onUpdatePassword}
            onShowToast={onShowToast}
          />
        )}
      </main>


      {/* Issue SOP Number Modal */}
      <IssueSopNumberModal
        open={showIssueNumberModal}
        title={title}
        effectiveDate={effectiveDate}
        revisionNumber={revisionNumber}
        isIssuingNumber={isIssuingNumber}
        onTitleChange={setTitle}
        onEffectiveDateChange={setEffectiveDate}
        onRevisionChange={setRevisionNumber}
        onClose={() => setShowIssueNumberModal(false)}
        onSubmit={handleIssueNumber}
      />

      {/* Success Modal */}
      {isSuccessModalOpen && latestCreatedSop && (
        <div className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-900">SPO Berhasil Didaftarkan!</h3>
            <p className="text-xs text-slate-500 mt-1">
              Nomor resmi dokumen telah tercatat di sistem register SIDOKTER SOEGIRI.
            </p>

            <div className="mt-4 p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Nomor SPO Resmi</div>
              <div className="mt-1 font-mono text-base font-black text-emerald-900">{latestCreatedSop.sopNumber || 'Menunggu'}</div>
              <div className="text-xs font-bold text-slate-700 mt-1 truncate">{latestCreatedSop.title}</div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsSuccessModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSuccessModalOpen(false);
                  onViewDetail(latestCreatedSop);
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs cursor-pointer"
              >
                Buka Dokumen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
