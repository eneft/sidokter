import React, { useState, useEffect, useMemo } from 'react';
import { 
  FilePlus, 
  Eye, 
  LogOut, 
  Building2, 
  User, 
  Sparkles, 
  CheckCircle2,
  Copy,
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
  Table as TableIcon,
  FileUp,
  Loader2,
  ExternalLink
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
import { generateSopNumber, getNextSequenceNumber, formatBytes, standardizeSopDocument, checkDuplicateSopNumber, detectHierarchyFromSopNumber, isNewSopFormat, normalizeSopNumberInput, matchMasterHierarchyPattern } from '../utils/numbering';
import { saveFileToLocalCache } from '../utils/fileStorage';
import { parseSopFromDocx } from '../utils/docxParser';
import { parseSopMetadataFromPdf } from '../utils/pdfParser';
import { 
  SOEGIRI_MASTER_CATEGORIES, 
  SOEGIRI_HOSPITAL_INFO,
  buildSubHierarchyCode,
  getSoegiriHierarchyInfo,
  isSopAccessibleByUser,
  SoegiriCategory
} from '../utils/soegiriStructure';
import { flattenHierarchy, getNodeChildren } from '../utils/hierarchyTree';
import { subscribeToHierarchyMaster } from '../lib/hierarchyService';
import { Header } from './Header';
import { SopLiveTemplate } from './SopLiveTemplate';
import { UserLibraryTab } from './UserLibraryTab';
import { UserPasswordTab } from './UserPasswordTab';
import { SKPage } from './SKPage';
import { MOUPage } from './MOUPage';
import { FinalLibraryPage } from './FinalLibraryPage';
import { DashboardOverviewPage } from './DashboardOverviewPage';
import { DocumentViewer } from './DocumentViewer';
import { AdminHubPage } from './AdminHubPage';
import IssueSopNumberModal from './IssueSopNumberModal';
import { getAllNumberReservations, SopNumberReservation } from '../lib/sopService';
import { AdminTooltip, AdminHelpHint } from './AdminTooltip';

interface UserViewProps {
  userSession: UserSession;
  onLogout: () => void;
  sops: SopDocument[];
  libraryDocuments: LibraryDocument[];
  onAddSop: (sop: Omit<SopDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'> & { id?: string }) => Promise<SopDocument>;
  onIssueSopNumber?: (params: { divisionCode: string; subHierarchyCode?: string; dateStr?: string; title: string; revisionNumber: string }) => Promise<SopDocument>;
  onCheckReservedNumber?: (sopNumber: string) => Promise<boolean>;
  numberingConfig: NumberingConfig;
  divisions: Division[];
  categories: SopCategory[];
  onViewDetail: (sop: SopDocument) => void;
  onCopyNumber: (sopNumber: string) => void;
  users?: UserAccount[];
  onUpdatePassword?: (currentPass: string, newPass: string) => Promise<{ success: boolean; message: string }>;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
  onOpenUserManagement?: () => void;
  onOpenMasterData?: () => void;
  onOpenSecurity?: () => void;
  onOpenBackupRestore?: () => void;
  onOpenMaintenance?: () => void;
  onStandardizeAllNumbers?: () => void;
}

export const UserView: React.FC<UserViewProps> = ({
  userSession,
  onLogout,
  sops,
  libraryDocuments,
  onAddSop,
  onIssueSopNumber,
  onCheckReservedNumber,
  numberingConfig,
  divisions,
  categories,
  onViewDetail,
  onCopyNumber,
  users,
  onUpdatePassword,
  onShowToast,
  onOpenUserManagement,
  onOpenMasterData,
  onOpenSecurity,
  onOpenBackupRestore,
  onOpenMaintenance,
  onStandardizeAllNumbers
}) => {
  const [showIssueNumberModal, setShowIssueNumberModal] = useState(false);
  const [showIssuedNumbers, setShowIssuedNumbers] = useState(false);
  const [issuedNumberSearch, setIssuedNumberSearch] = useState('');
  const [issuedNumberRegister, setIssuedNumberRegister] = useState<SopNumberReservation[]>([]);
  const [issueHierarchyId, setIssueHierarchyId] = useState('');
  // Terbitkan Nomor memiliki state sendiri agar tidak bocor ke form SPO.
  const [issueTitle, setIssueTitle] = useState('');
  const [issueEffectiveDate, setIssueEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
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

  // Nomor Terbit adalah register nomor, bukan dokumen SPO. Hanya tampilkan
  // nomor yang masih RESERVED/belum dipakai; nomor USED tetap tersimpan di
  // database untuk mencegah penerbitan ulang tetapi tidak tampil di daftar ini.
  useEffect(() => {
    let cancelled = false;
    const loadIssuedNumbers = async () => {
      try {
        const rows = await getAllNumberReservations();
        if (cancelled) return;
        const allowedDivisions = new Set(
          userSession.role === 'admin'
            ? []
            : userDivisionCodes.map((code) => String(code).toUpperCase())
        );
        const visible = rows
          .filter((row) => row.status === 'RESERVED' && (row.purpose === 'EXISTING_REPLACE_ONLY' || !row.purpose))
          .filter((row) => userSession.role === 'admin' || allowedDivisions.has(String(row.divisionCode || '').toUpperCase()))
          .sort((a, b) => String(b.reservedAt).localeCompare(String(a.reservedAt)));
        setIssuedNumberRegister(visible);
      } catch (error) {
        console.error('Gagal membaca Daftar Nomor:', error);
      }
    };
    loadIssuedNumbers();
    return () => { cancelled = true; };
  }, [sops, userSession.role, userDivisionCodes.join('|')]);

  useEffect(() => {
    return subscribeToHierarchyMaster((cats) => {
      setCategoriesList(cats);
    });
  }, []);

  // Catatan: Badge STRUKTURAL hanya memberikan hak akses untuk SK dan MOU.
  // Untuk SPO, akses dan kategori tujuan tetap mengikuti hirarki penugasan pengguna.
  const hasAllHierarchyAssignment = normalizedAssignments.some((a) => String(a.divisionCode || '').toUpperCase() === 'ALL');
  const hasGlobalHierarchyAccess = userSession.role === 'admin' || hasAllHierarchyAssignment;
  const hasAllDivisionsAccess = hasGlobalHierarchyAccess;

  // ALL is a global Admin marker. A User account must never inherit
  // global access from legacy divisionCode/divisionCodes/assignments.
  const userAssignments = normalizedAssignments.filter(
    (a) => String(a.divisionCode || '').toUpperCase() !== 'ALL'
  );

  const accessibleCategories = hasAllDivisionsAccess
    ? categoriesList
    : (userDivisionCodes.length > 0 
        ? categoriesList.filter((c) => userDivisionCodes.includes(c.code))
        : []);

  // Administrator selalu memakai assignment global sintetis (ALL).
  // Jangan mewarisi hirarki lama dari profil/session Admin karena Admin tidak
  // dibatasi oleh satu unit. Target hirarki SPO tetap dipilih di form.
  const globalHierarchyAssignment = hasGlobalHierarchyAccess
    ? {
        id: userSession.role === 'admin' ? 'admin-global-all' : 'user-global-all',
        divisionCode: 'ALL',
        hierarchyCode: undefined,
        unitName: 'Semua Hirarki',
        subCode: undefined,
        instCode: undefined,
        poliCode: undefined,
        subUnitCode: undefined
      }
    : null;
  // Jika user memiliki assignment ALL, jangan tampilkan assignment cabang lama
  // sebagai pembatas. ALL menjadi sumber cakupan hirarki global.
  const effectiveAssignments = hasGlobalHierarchyAccess
    ? [globalHierarchyAssignment!]
    : userAssignments;
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

  // Returns only the immediate children of a hierarchy node. User can
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

  // Terbitkan Nomor wajib menggunakan hirarki paling bawah (leaf).
  // Parent yang masih memiliki child tidak boleh dipilih sebagai hirarki akhir.
  const issueHierarchyOptions = useMemo(() => {
    const rows: Array<{ id: string; label: string; divisionCode: string; subHierarchyCode: string; pathCodes: string[]; pathNames: string[] }> = [];
    const seen = new Set<string>();

    const addLeavesForAssignment = (assignment: typeof normalizedAssignments[number], category: SoegiriCategory) => {
      const assignedPath = getAssignmentPath(assignment);
      const categoryChildren = getNodeChildren(category).filter((child) => child.active !== false);

      // Jika kategori sendiri tidak memiliki child, kategori tersebut sudah merupakan level terakhir.
      if (!categoryChildren.length && !assignedPath.length) {
        const key = `${category.code}|`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({
            id: key,
            label: `${category.code} — ${category.name}`,
            divisionCode: category.code,
            subHierarchyCode: '',
            pathCodes: [],
            pathNames: []
          });
        }
        return;
      }

      flattenHierarchy(category).filter((item) => {
        if (item.node.active === false) return false;
        if (assignedPath.length && !item.pathCodes.slice(0, assignedPath.length).every((code, i) => String(code) === String(assignedPath[i]))) return false;
        return getNodeChildren(item.node).filter((child) => child.active !== false).length === 0;
      }).forEach((leaf) => {
        const key = `${category.code}|${leaf.code}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({
          id: key,
          label: `${category.code} / ${leaf.code} — ${leaf.pathNames.join(' → ')}`,
          divisionCode: category.code,
          subHierarchyCode: leaf.code,
          pathCodes: leaf.pathCodes || [],
          pathNames: leaf.pathNames || []
        });
      });
    };

    effectiveAssignments.forEach((assignment) => {
      const assignmentDivision = String(assignment.divisionCode || '').toUpperCase();

      // Assignment ALL boleh menerbitkan nomor untuk seluruh master hirarki,
      // tetapi tetap wajib memilih hirarki tujuan sampai leaf.
      const targetCategories = assignmentDivision === 'ALL'
        ? categoriesList.filter((c) => c.active !== false)
        : categoriesList.filter((c) => String(c.code).toUpperCase() === assignmentDivision && c.active !== false);

      targetCategories.forEach((category) => addLeavesForAssignment(
        assignmentDivision === 'ALL' ? { ...assignment, hierarchyCode: undefined } : assignment,
        category
      ));
    });

    return rows;
  }, [effectiveAssignments, categoriesList]);

  const assignedDivisionCode = hasGlobalHierarchyAccess ? '' : (activeAssignment?.divisionCode || '');
  const hasValidUserAssignment = userSession.role === 'admin' || effectiveAssignments.length > 0;
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
  const [externalReviewSignedConfirmed, setExternalReviewSignedConfirmed] = useState(false);
  const [selectedExistingSopIdForReview, setSelectedExistingSopIdForReview] = useState('');

  // Progressive input workflow.
  const [workflowStep, setWorkflowStep] = useState<1 | 2 | 3>(1);
  const [documentTypeChosen, setDocumentTypeChosen] = useState(false);

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
  const activeSopCount = useMemo(() => accessibleSops.filter((s) => s.status === 'AKTIF').length, [accessibleSops]);
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
    if (userSession.role !== 'admin') {
      onShowToast?.('error', 'Akses Ditolak', 'Hanya Administrator yang dapat menerbitkan nomor.');
      return;
    }
    if (!onIssueSopNumber || !hasValidUserAssignment) return;
    if (!issueTitle.trim()) { onShowToast?.('error', 'Data Belum Lengkap', 'Judul SPO wajib diisi.'); return; }
    if (!issueEffectiveDate) { onShowToast?.('error', 'Data Belum Lengkap', 'Tanggal berlaku wajib diisi.'); return; }
    const selectedIssueHierarchy = issueHierarchyOptions.find((option) => option.id === issueHierarchyId);
    if (!selectedIssueHierarchy) {
      onShowToast?.('error', 'Hirarki Belum Lengkap', 'Pilih hirarki sampai tingkat unit terakhir yang tersedia.');
      return;
    }
    try {
      setIsIssuingNumber(true);
      setSubmitError(null);
      const issued = await onIssueSopNumber({
        divisionCode: selectedIssueHierarchy.divisionCode,
        subHierarchyCode: selectedIssueHierarchy.subHierarchyCode || undefined,
        dateStr: issueEffectiveDate,
        title: issueTitle.trim(),
        revisionNumber: '00'
      });
      setIssuedSopNumber(issued.sopNumber);
      // Reservation nomor bukan Draft dan tidak diikat ke form SPO Baru.
      setIssuedSopId(null);
      setIssuedSopSequence(null);
      setIssuedSopDivision(null);
      setIssuedSopHierarchy(null);
      setIssuedSopDate(null);
      // Clear only the Terbitkan Nomor workflow; never clear/reuse SPO form state.
      setIssueTitle('');
      setIssueEffectiveDate(new Date().toISOString().split('T')[0]);
      setIssueHierarchyId('');
      setShowIssueNumberModal(false);
      const refreshedReservations = await getAllNumberReservations();
      setIssuedNumberRegister(refreshedReservations.filter((row) => row.status === 'RESERVED' && (row.purpose === 'EXISTING_REPLACE_ONLY' || !row.purpose)).filter((row) => userSession.role === 'admin' || userDivisionCodes.map((code) => String(code).toUpperCase()).includes(String(row.divisionCode || '').toUpperCase())).sort((a, b) => String(b.reservedAt).localeCompare(String(a.reservedAt))));
      setIssuedNumberSearch('');
      onShowToast?.('success', 'Nomor SPO Diterbitkan', `Nomor ${issued.sopNumber} berhasil diterbitkan dan masuk ke Daftar Nomor.`);
    } catch (err: any) {
      const message = err?.message || 'Nomor SPO gagal diterbitkan.';
      setSubmitError(message);
      onShowToast?.('error', 'Penerbitan Nomor Gagal', message);
    } finally {
      setIsIssuingNumber(false);
    }
  };

  const [isParsingDocx, setIsParsingDocx] = useState(false);
  const [parsedDocxSummary, setParsedDocxSummary] = useState<{ fileName: string; fields: string[] } | null>(null);
  const docxInputRef = React.useRef<HTMLInputElement>(null);

  // Khusus SPO Existing: 2 Opsi (DOCX -> Live Form A4, atau PDF -> Pratinjau Asli)
  const [existingMode, setExistingMode] = useState<'docx' | 'pdf'>('docx');
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [parsedPdfSummary, setParsedPdfSummary] = useState<{ fileName: string; fields: string[] } | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const pdfInputRef = React.useRef<HTMLInputElement>(null);

  const handleDocxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.docx')) {
      onShowToast?.('error', 'Format File Tidak Didukung', 'Harap pilih berkas Microsoft Word dengan ekstensi .docx.');
      e.target.value = '';
      return;
    }

    try {
      setIsParsingDocx(true);
      const parsed = await parseSopFromDocx(file);

      if (parsed.title) setTitle(parsed.title);
      if (parsed.effectiveDate) setEffectiveDate(parsed.effectiveDate);
      if (parsed.pengertian) setPengertian(parsed.pengertian);
      if (parsed.tujuan) setTujuan(parsed.tujuan);
      if (parsed.kebijakan) setKebijakan(parsed.kebijakan);
      if (parsed.prosedur) setProsedur(parsed.prosedur);
      if (parsed.alur) setAlur(parsed.alur);
      if (parsed.unitTerkait) setUnitTerkait(parsed.unitTerkait);

      // Deteksi nomor SPO lama & nomor revisi dari dokumen DOCX jika tersedia
      if (parsed.sopNumber) {
        setManualLegacyNumber(parsed.sopNumber);
      }
      if (parsed.revisionNumber) {
        setRevisionNumber(parsed.revisionNumber);
      }

      // Aturan: Dokumen .docx hanya digunakan untuk mengekstrak data naskah SPO,
      // BUKAN untuk disimpan atau diunggah sebagai berkas biner ke Firebase Cloud Storage.
      setSelectedFile(null);

      setParsedDocxSummary({
        fileName: file.name,
        fields: parsed.extractedFields
      });

      onShowToast?.(
        'success',
        'Naskah Word (.docx) Berhasil Diimpor',
        parsed.sopNumber
          ? `Terdeteksi nomor "${parsed.sopNumber}" dan ${parsed.totalFieldsFound} bagian naskah dari ${file.name}.`
          : `Berhasil mengekstrak ${parsed.totalFieldsFound} bagian naskah dari ${file.name} ke dalam formulir.`
      );
    } catch (err: any) {
      console.error('Error parsing DOCX:', err);
      onShowToast?.(
        'error',
        'Gagal Membaca File DOCX',
        err?.message || 'File Word tidak dapat dibaca. Pastikan file berformat .docx valid.'
      );
    } finally {
      setIsParsingDocx(false);
      if (e.target) e.target.value = '';
    }
  };

  const handlePdfUploadForExisting = async (file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      onShowToast?.('error', 'Format File Salah', 'Harap pilih berkas scan PDF asli.');
      return;
    }

    setSelectedFile(file);

    if (pdfPreviewUrl) {
      try { URL.revokeObjectURL(pdfPreviewUrl); } catch {}
    }
    try {
      const url = URL.createObjectURL(file);
      setPdfPreviewUrl(url);
    } catch (err) {
      console.warn('Gagal membuat URL pratinjau PDF:', err);
    }

    try {
      setIsParsingPdf(true);
      const meta = await parseSopMetadataFromPdf(file);
      const extractedFields: string[] = [];

      if (meta.sopNumber) {
        setManualLegacyNumber(meta.sopNumber);
        extractedFields.push(`Nomor: ${meta.sopNumber}`);
      }
      if (meta.title && (!title || title.trim() === '')) {
        setTitle(meta.title);
        extractedFields.push(`Judul: ${meta.title}`);
      } else if (!title) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
        setTitle(cleanName);
        extractedFields.push(`Judul: ${cleanName}`);
      }
      if (meta.effectiveDate) {
        setEffectiveDate(meta.effectiveDate);
        extractedFields.push(`Tanggal: ${meta.effectiveDate}`);
      }
      if (meta.revisionNumber) {
        setRevisionNumber(meta.revisionNumber);
        extractedFields.push(`Revisi: ${meta.revisionNumber}`);
      }

      setParsedPdfSummary({
        fileName: file.name,
        fields: extractedFields.length > 0 ? extractedFields : ['Pratinjau PDF Asli Dimuat']
      });

      onShowToast?.(
        'success',
        'Berkas PDF Asli Berhasil Dimuat',
        meta.sopNumber
          ? `Nomor naskah "${meta.sopNumber}" terdeteksi. Silakan verifikasi data sebelum menyimpan sebagai Existing Aktif.`
          : 'PDF berhasil dimuat untuk pratinjau. Silakan periksa nomor naskah asli sebelum menyimpan.'
      );
    } catch (err: any) {
      console.error('Error parsing PDF:', err);
      onShowToast?.('error', 'Gagal Membaca Metadata PDF', err?.message || 'Gagal memproses file PDF.');
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isDocx = file.name.toLowerCase().endsWith('.docx') ||
                     file.name.toLowerCase().endsWith('.doc') ||
                     file.type?.includes('wordprocessingml') ||
                     file.type?.includes('msword');

      // Dokumen Word (.docx) di formulir SPO hanya untuk ekstraksi data naskah, bukan untuk disimpan
      if (isDocx) {
        handleDocxUpload(e);
        e.target.value = '';
        return;
      }

      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        onShowToast?.('error', 'Format File Salah', 'Dokumen fisik/scan SPO resmi wajib berupa file PDF asli.');
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
    setExternalReviewSignedConfirmed(false);
    setSelectedExistingSopIdForReview('');
    setSubmitError(null);
    setIssuedSopNumber(null);
    setIssuedSopId(null);
    setIssuedSopSequence(null);
    setIssuedSopDivision(null);
    setIssuedSopHierarchy(null);
    setIssuedSopDate(null);
    setEffectiveDate(new Date().toISOString().split('T')[0]);
    setWorkflowStep(1);
    setDocumentTypeChosen(false);
    setParsedDocxSummary(null);
    setIsParsingDocx(false);
    if (pdfPreviewUrl) {
      try { URL.revokeObjectURL(pdfPreviewUrl); } catch {}
    }
    setPdfPreviewUrl(null);
    setParsedPdfSummary(null);
    setIsParsingPdf(false);
  };

  const openSpoInput = () => {
    resetForm();
    setDocumentTypeChosen(false);
    setWorkflowStep(1);
    setSpoSubTab('input');
  };

  // Every workflow entry starts from a clean SPO form. Data is inherited only
  // by an explicit action (for example, selecting a source SPO for Riviu).
  const startDocumentWorkflow = (nextType: 'BARU' | 'LAMA' | 'REVIEW') => {
    resetForm();
    setDocumentType(nextType);
    setDocumentTypeChosen(true);
    setWorkflowStep(1);
    if (nextType === 'LAMA') {
      setEffectiveDate('2024-01-02');
    } else if (nextType === 'REVIEW') {
      setRevisionNumber('01');
    }
  };

  const goBackWorkflow = () => {
    setWorkflowStep((current) => current === 3 ? 2 : 1);
  };

  const hierarchyReady = useMemo(() => {
    if (!documentTypeChosen || !hasValidUserAssignment || !activeAssignment?.divisionCode) return false;
    if (hasGlobalHierarchyAccess && !selectedCatCode) return false;
    const selectedPath = [selectedSubCode, selectedInstCode, selectedPoliCode, selectedSubUnitCode].filter(Boolean);
    const assignmentPath = getAssignmentPath(activeAssignment);
    const followsAssignment = assignmentPath.every((v, i) => selectedPath[i] === v);
    return followsAssignment && getHierarchyChildren(selectedCatCode, selectedPath).length === 0;
  }, [documentTypeChosen, hasValidUserAssignment, activeAssignment, selectedSubCode, selectedInstCode, selectedPoliCode, selectedSubUnitCode, selectedCatCode, userSession.role, hasGlobalHierarchyAccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const isLegacy = documentType === 'LAMA';
    const isReview = documentType === 'REVIEW';

    // Validasi hirarki hanya untuk SPO Baru dan SPO Riviu (SPO Eksisting tidak wajib isi hirarki/unit)
    if (!isLegacy) {
      const isAdmin = userSession.role === 'admin';
      if (!hasValidUserAssignment || !activeAssignment?.divisionCode) {
        setSubmitError('Akun User belum memiliki hirarki yang valid. Pengajuan SPO tidak dapat dilakukan.');
        return;
      }
      if (hasGlobalHierarchyAccess && !selectedCatCode) {
        setSubmitError('Akses global (ALL). Pilih HIRARKI TUJUAN SPO terlebih dahulu.');
        return;
      }

      const selectedPath = [selectedSubCode, selectedInstCode, selectedPoliCode, selectedSubUnitCode].filter(Boolean);
      const assignmentPath = getAssignmentPath(activeAssignment);
      const selectedFollowsAssignment = assignmentPath.every((v, i) => selectedPath[i] === v);
      if (!hasGlobalHierarchyAccess && !selectedFollowsAssignment) {
        setSubmitError('Hirarki yang dipilih tidak sesuai dengan assignment akun User.');
        return;
      }
      if (getHierarchyChildren(selectedCatCode, selectedPath).length > 0) {
        setSubmitError('Pilih sampai tingkat unit terakhir yang tersedia sebelum mengajukan SPO.');
        return;
      }

      if (isReview) {
        const reviewNumber = normalizeSopNumberInput(oldSopNumber);
        const referenced = (selectedExistingSopIdForReview && sops.find((s) => s.id === selectedExistingSopIdForReview))
          || sops.find((s) => normalizeSopNumberInput(s.sopNumber) === reviewNumber || normalizeSopNumberInput(s.legacySopNumber) === reviewNumber);
        const hasExternalSignedPdf = Boolean(
          selectedFile &&
          (selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf')) &&
          externalReviewSignedConfirmed
        );
        if (!reviewNumber || (!referenced && !hasExternalSignedPdf)) {
          setSubmitError('SPO rujukan Riviu harus berupa SPO AKTIF di aplikasi, atau PDF SPO lama yang sudah ditandatangani Direktur dan dikonfirmasi keabsahannya.');
          return;
        }
        if (referenced && referenced.status !== 'AKTIF') {
          setSubmitError('SPO rujukan Riviu harus berstatus AKTIF.');
          return;
        }
        const isNewFormat = isNewSopFormat(reviewNumber);
        const pattern = matchMasterHierarchyPattern(reviewNumber);
        const selectedDiv = String(selectedCatCode || '').trim().toUpperCase();
        const selectedSub = String(subHierarchyCode || '').trim();
        // Deteksi otomatis format nomor SPO rujukan:
        // Format Baru -> Harus sesuai dengan hirarki yang dipilih
        // Format Lama -> Abaikan validasi ketidaksesuaian hirarki; hirarki SPO Riviu tetap mengikuti hirarki yang dipilih
        if (isNewFormat && pattern.isMatch) {
          if (String(pattern.categoryCode || '').trim().toUpperCase() !== selectedDiv || String(pattern.subHierarchyCode || '').trim() !== selectedSub) {
            setSubmitError(`Nomor SPO rujukan tidak sesuai dengan hirarki yang dipilih. Nomor: ${pattern.categoryCode}${pattern.subHierarchyCode ? ` / ${pattern.subHierarchyCode}` : ''}; pilihan: ${selectedDiv}${selectedSub ? ` / ${selectedSub}` : ''}.`);
            return;
          }
        }
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

    // Nomor dari menu Terbitkan Nomor adalah reservation terpisah. Nomor ini
    // tidak boleh otomatis dipakai oleh SPO Baru. Untuk SPO Baru, nomor resmi
    // dialokasikan oleh App saat submit melalui mekanisme penomoran terintegrasi.
    const finalIssuedId = null;
    const finalIssuedSequence = null;
    const finalIssuedNumber = null;

    let matchedExistingDoc: SopDocument | undefined = undefined;
    let detectedInfo: ReturnType<typeof detectHierarchyFromSopNumber> = null;

    if (isLegacy) {
      const cleanNum = normalizeSopNumberInput(manualLegacyNumber);
      if (!cleanNum) {
        setSubmitError('Nomor SPO Lama / Eksisting resmi wajib diisi.');
        return;
      }
      if (!title.trim() && !matchedExistingDoc?.title) {
        setSubmitError('Judul SPO Eksisting wajib diisi.');
        return;
      }
      if (existingMode === 'pdf') {
        if (!selectedFile) {
          setSubmitError('Wajib mengunggah scan file PDF asli SPO Eksisting yang sudah bertanda tangan.');
          return;
        }
      } else {
        // existingMode === 'docx' (Live Form A4)
        if (missingSections.length > 0) {
          setSubmitError(`Bagian batang tubuh SPO Live Form berikut belum lengkap:\n• ${missingSections.join('\n• ')}`);
          return;
        }
      }

      // Deteksi dokumen terdaftar yang sudah ada di sistem
      matchedExistingDoc = sops?.find((s) => 
        (s.sopNumber && normalizeSopNumberInput(s.sopNumber) === cleanNum) ||
        (s.legacySopNumber && normalizeSopNumberInput(s.legacySopNumber) === cleanNum) ||
        (existingSopId && s.id === existingSopId)
      );

      const isNewFormat = isNewSopFormat(cleanNum);

      // Format baru tanpa dokumen hanya boleh jika nomor sudah RESERVED.
      // Reservation bukan Draft; nomor akan dikonsumsi saat Existing berhasil diregistrasi.
      const isReservedNumber = !matchedExistingDoc && onCheckReservedNumber
        ? await onCheckReservedNumber(cleanNum)
        : false;
      if (isNewFormat && !matchedExistingDoc && !isReservedNumber) {
        setSubmitError(
          `Nomor dengan pola penomoran baru Master Hirarki ("${cleanNum}") belum terdaftar atau belum di-reserve. Gunakan menu "Terbitkan Nomor" terlebih dahulu.`
        );
        return;
      }

      // Aturan: SPO Eksisting TIDAK BISA menggantikan SPO yang sudah berstatus AKTIF
      if (matchedExistingDoc && matchedExistingDoc.status === 'AKTIF') {
        setSubmitError(
          `Nomor SPO "${cleanNum}" sudah terdaftar dengan status AKTIF ("${matchedExistingDoc.title}"). Sesuai aturan rumah sakit, dokumen berstatus Aktif tidak dapat digantikan melalui alur SPO Eksisting. Silakan gunakan alur "SPO Riviu" untuk melakukan revisi dokumen aktif.`
        );
        return;
      }

      // Deteksi hirarki otomatis dari nomor SPO sebagai pelengkap
      detectedInfo = detectHierarchyFromSopNumber(cleanNum);

      if (!title.trim() && !matchedExistingDoc?.title) {
        setSubmitError('Judul SPO Eksisting wajib diisi.');
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const cleanNum = normalizeSopNumberInput(manualLegacyNumber);
      const isNewFormat = isLegacy ? isNewSopFormat(cleanNum) : false;

      // Tentukan field hirarki dan metadata:
      // - Jika menggantikan dokumen terdaftar: gunakan hirarki dokumen terdaftar (atau form jika disesuaikan)
      // - Jika Format Lama + belum ada: MENGIKUTI HIRARKI YANG DIPILIH USER DI FORM (dengan fallback deteksi)
      const finalDivCode = isLegacy
        ? (matchedExistingDoc ? (matchedExistingDoc.divisionCode || selectedCatCode) : (selectedCatCode || detectedInfo?.divisionCode || 'PEL'))
        : selectedCatCode;
      const finalDivName = isLegacy
        ? (matchedExistingDoc ? (matchedExistingDoc.divisionName || activeCategory?.name || finalDivCode) : (activeCategory?.name || detectedInfo?.divisionName || finalDivCode))
        : (activeCategory?.name || selectedCatCode);
      const finalSubHierarchy = isLegacy
        ? (matchedExistingDoc ? (matchedExistingDoc.subHierarchyCode !== undefined ? matchedExistingDoc.subHierarchyCode : subHierarchyCode) : (subHierarchyCode !== undefined ? subHierarchyCode : (detectedInfo?.subHierarchyCode || '')))
        : subHierarchyCode;
      const finalSubCode = isLegacy
        ? (matchedExistingDoc ? (matchedExistingDoc.subCode || selectedSubCode) : (selectedSubCode || detectedInfo?.subCode))
        : selectedSubCode;
      const finalInstCode = isLegacy
        ? (matchedExistingDoc ? (matchedExistingDoc.instalasiCode || (matchedExistingDoc as any)?.instCode || selectedInstCode) : (selectedInstCode || detectedInfo?.instalasiCode))
        : selectedInstCode;
      const finalPoliCode = isLegacy
        ? (matchedExistingDoc ? (matchedExistingDoc.poliCode || selectedPoliCode) : (selectedPoliCode || detectedInfo?.poliCode))
        : selectedPoliCode;
      const finalSubUnitCode = isLegacy
        ? (matchedExistingDoc ? (matchedExistingDoc.subUnitCode || selectedSubUnitCode) : (selectedSubUnitCode || detectedInfo?.subUnitCode))
        : selectedSubUnitCode;
      const finalHierarchyDesc = isLegacy
        ? (matchedExistingDoc ? (matchedExistingDoc.hierarchyDescription || hierarchyInfo.conclusion) : (hierarchyInfo.conclusion || detectedInfo?.hierarchyDescription))
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
        status: isLegacy ? 'AKTIF' : 'DRAFT',
        activatedAt: isLegacy ? new Date().toISOString() : undefined,
        activatedBy: isLegacy ? userSession.name : undefined,
        activationRequestedAt: new Date().toISOString(),
        activationRequestedBy: userSession.name,
        activationRequestedByUsername: userSession.username,
        activationRequestedUid: userSession.authUid || userSession.id,
        effectiveDate: effectiveDate || (isLegacy ? matchedExistingDoc?.effectiveDate : undefined) || new Date().toISOString().split('T')[0],
        reviewPeriodMonths: Number(reviewPeriodMonths) || 12,
        nextReviewDate: '',
        creatorName: userSession.name,
        creatorUsername: userSession.username,
        creatorUid: userSession.authUid || userSession.id,
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
        // Workflow identity is authoritative: data inherited from an existing
        // document must NEVER turn the Existing workflow into Riviu/Review.
        // App.tsx will finalize an Existing replacement's document identity later
        // (for example, a replacement of a Draft may remain documentType=BARU),
        // but the submit boundary itself is always explicitly EKSISTING.
        documentType: isLegacy ? 'LAMA' : (isReview ? 'RIVIU' : 'BARU'),
        jenis_spo: isLegacy ? 'EKSISTING' : (isReview ? 'RIVIU' : 'BARU'),
        isLegacySop: isLegacy ? true : false,
        existingSourceFormat: isLegacy ? (existingMode === 'docx' || Boolean(parsedDocxSummary) ? 'DOCX' : 'PDF') : undefined,
        legacySopNumber: isLegacy ? cleanNum : undefined,
        sopNumber: isLegacy ? cleanNum : (finalIssuedNumber || oldSopNumber || ''),
        existingSopId: isReview ? (selectedExistingSopIdForReview || existingSopId || undefined) : undefined,
        // Preserve the distinction: Existing replacement of a DRAFT is still a BARU document type,
        // but preview must use the uploaded original PDF instead of generating the official template.
        isExistingReplacement: isLegacy && existingMode === 'pdf' && Boolean(matchedExistingDoc),
        pengertian: pengertian.trim() || (isLegacy ? matchedExistingDoc?.pengertian : undefined) || undefined,
        tujuan: tujuan.trim() || (isLegacy ? matchedExistingDoc?.tujuan : undefined) || undefined,
        kebijakan: kebijakan.trim() || (isLegacy ? matchedExistingDoc?.kebijakan : undefined) || undefined,
        prosedur: prosedur.trim() || (isLegacy ? matchedExistingDoc?.prosedur : undefined) || undefined,
        unitTerkait: unitTerkait.trim() || (isLegacy ? matchedExistingDoc?.unitTerkait : undefined) || undefined,
        confidentialityLevel: 'Internal',
      };

      // HARD RULE: Existing must carry the exact Nomor Terbit reservation identity
      // through the submit boundary. A boolean-only check is not sufficient because
      // the parent save handler must know which reservation is authoritative.
      if (isLegacy) {
        (sopData as any).numberReservationPurpose = 'EXISTING_REPLACE_ONLY';
        try {
          const reservations = await getAllNumberReservations();
          const matchedReservation = reservations.find((row) =>
            row.status === 'RESERVED' &&
            (row.purpose === 'EXISTING_REPLACE_ONLY' || !row.purpose) &&
            normalizeSopNumberInput(row.sopNumber) === cleanNum
          );
          if (matchedReservation) {
            (sopData as any).numberReservationId = matchedReservation.id;
            // The reservation is authoritative: never let a later save path
            // infer a different sequence from the current numbering state.
            sopData.sopNumber = matchedReservation.sopNumber;
            sopData.sequenceNumber = matchedReservation.sequenceNumber;
          }
        } catch (reservationError) {
          console.warn('Gagal membaca identitas Nomor Terbit untuk Existing:', reservationError);
        }
      }

      // Alur is optional in the SPO standard. Keep it in the saved object when
      // present, without forcing a shared-type change in this UI-only refactor.
      if (alur.trim()) {
        (sopData as any).alur = alur.trim();
      }

      if (isReview) {
        (sopData as any).externalReviewSignedConfirmed = externalReviewSignedConfirmed;
      }

      const isDocxFile = selectedFile && (
        selectedFile.name.toLowerCase().endsWith('.docx') ||
        selectedFile.name.toLowerCase().endsWith('.doc') ||
        selectedFile.type?.includes('wordprocessingml') ||
        selectedFile.type?.includes('msword')
      );

      if (selectedFile && !isDocxFile) {
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
          sopData.signedScanFileName = selectedFile.name;
          sopData.signedScanFileSize = selectedFile.size;
          sopData.signedScanFileType = selectedFile.type || 'application/pdf';
          sopData.signedScanDataUrl = dataUrl;
        } else if (isReview) {
          // For Riviu, the uploaded PDF is the OLD/SOURCE document, not the new Riviu PDF.
          // Keep it as evidence so the generated Riviu document does not accidentally preview the old file.
          (sopData as any).oldFileName = selectedFile.name;
          (sopData as any).oldFileSize = selectedFile.size;
          (sopData as any).oldFileType = selectedFile.type || 'application/pdf';
          (sopData as any).oldFileDataUrl = dataUrl;
        } else {
          sopData.fileName = selectedFile.name;
          sopData.fileSize = selectedFile.size;
          sopData.fileType = selectedFile.type || 'application/pdf';
          sopData.fileDataUrl = dataUrl;
        }
      } else if (isLegacy && (existingMode === 'docx' || Boolean(parsedDocxSummary))) {
        sopData.fileName = `SPO_${finalDivCode}_${cleanNum || 'EKSISTING'}.pdf`;
        sopData.fileType = 'application/pdf';
        delete sopData.fileDataUrl;
        delete sopData.signedScanDataUrl;
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
        onOpenUserManagement={onOpenUserManagement}
        onOpenMasterData={onOpenMasterData}
        onOpenSecurity={onOpenSecurity}
        onOpenBackupRestore={onOpenBackupRestore}
        onOpenMaintenance={onOpenMaintenance}
        onStandardizeAllNumbers={onStandardizeAllNumbers}
        onSelectDocument={(docId, docNumber) => {
          const found = sops.find((s) => s.id === docId || (docNumber && s.sopNumber === docNumber));
          if (found) {
            setActiveTab('spo');
            onViewDetail(found);
            return;
          }
          const foundLib = libraryDocuments?.find((d) => d.id === docId || (docNumber && d.documentNumber === docNumber));
          if (foundLib) {
            if (foundLib.category === 'SK') setActiveTab('sk');
            else if (foundLib.category === 'MOU') setActiveTab('mou');
          }
        }}
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

        {/* TAB 2: SPO (Workspace User) */}
        {activeTab === 'spo' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Sub-header / toggle */}
            <div className="bg-white rounded-2xl border border-slate-200 px-4 sm:px-5 py-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-black text-slate-900">SPO</h1>
                  <p className="text-[11px] text-slate-500 mt-0.5">Standar Prosedur Operasional · {userSession.unitName || userSession.divisionCode}</p>
                </div>
              </div>

              {/* Subtabs Switcher */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shrink-0">
                <AdminTooltip
                  title="+ SPO Baru"
                  content="Mulai buat pengajuan SPO baru, registrasi SPO lama/eksisting, atau revisi SPO riviu."
                  side="bottom"
                >
                  <button
                    type="button"
                    onClick={() => {
                      openSpoInput();
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>+ SPO Baru</span>
                  </button>
                </AdminTooltip>

                {userSession.role === 'admin' && (
                  <>
                    <AdminTooltip
                      title="Terbitkan Nomor Resmi"
                      content="Terbitkan alokasi nomor register SPO resmi secara langsung untuk kebutuhan fisik/mendesak."
                      side="bottom"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSubmitError(null);
                          setIssueTitle('');
                          setIssueEffectiveDate(new Date().toISOString().split('T')[0]);
                          setIssueHierarchyId(issueHierarchyOptions[0]?.id || '');
                          setShowIssueNumberModal(true);
                        }}
                        disabled={isIssuingNumber}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black transition-all cursor-pointer"
                      >
                        <FileCheck2 className="w-4 h-4" />
                        <span>{isIssuingNumber ? 'Menerbitkan...' : 'Terbitkan Nomor'}</span>
                      </button>
                    </AdminTooltip>

                    <AdminTooltip
                      title="Buku Register Nomor"
                      content="Lihat daftar seluruh nomor SPO yang telah dialokasikan dan status penggunaannya."
                      side="bottom"
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          const rows = await getAllNumberReservations();
                          const allowed = userSession.role === 'admin' ? true : null;
                          const visible = rows
                            .filter((row) => row.status === 'RESERVED' && (row.purpose === 'EXISTING_REPLACE_ONLY' || !row.purpose))
                            .filter((row) => allowed || userDivisionCodes.map((code) => String(code).toUpperCase()).includes(String(row.divisionCode || '').toUpperCase()))
                            .sort((a, b) => String(b.reservedAt).localeCompare(String(a.reservedAt)));
                          setIssuedNumberRegister(visible);
                          setIssuedNumberSearch('');
                          setShowIssuedNumbers(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-black transition-all cursor-pointer"
                      >
                        <ListOrdered className="w-4 h-4" />
                        <span>Nomor Terbit</span>
                        <span className="min-w-5 h-5 px-1 rounded-full bg-amber-100 text-amber-800 text-[10px] flex items-center justify-center">{issuedNumberRegister.length}</span>
                      </button>
                    </AdminTooltip>
                  </>
                )}
              </div>
            </div>

            {/* SubTab List: User Library Tab */}
            {spoSubTab === 'list' && (
              <UserLibraryTab
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
                  <AdminTooltip
                    title="Batal Pengisian"
                    content="Tutup formulir dan kembali ke daftar naskah SPO tanpa menyimpan."
                    side="left"
                  >
                    <button
                      type="button"
                      onClick={() => setSpoSubTab('list')}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 shrink-0 cursor-pointer"
                    >
                      Batal
                    </button>
                  </AdminTooltip>
                </div>

                {submitError && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                    {submitError}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* 1. Jenis SPO — tahap pertama, lalu otomatis menjadi summary setelah lanjut. */}
                  <section className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                        <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </span>
                        <span>1. Jenis Dokumen SPO</span>
                        <AdminHelpHint text="Pilih jenis alur SPO sesuai kebutuhan: baru (penomoran otomatis), eksisting (arsip scan tanda tangan), atau riviu (pembaruan tahunan)." />
                      </h3>
                      {workflowStep >= 2 && documentTypeChosen && <span className="text-[10px] font-bold text-emerald-700 shrink-0">✓ Selesai</span>}
                    </div>
                    {workflowStep === 1 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <AdminTooltip
                          title="SPO Baru Format 2026"
                          content="Penyusunan naskah prosedur baru dengan format standar RSUD Dr. Soegiri dan penomoran otomatis."
                          side="top"
                          className="w-full"
                        >
                          <button type="button" onClick={() => startDocumentWorkflow('BARU')} className={`w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${documentTypeChosen && documentType === 'BARU' ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                            <FileText className="w-5 h-5 shrink-0 text-emerald-600" />
                            <div><div className="text-xs font-black">SPO Baru (2026)</div><div className="text-[10px] text-slate-400">Penomoran otomatis</div></div>
                          </button>
                        </AdminTooltip>

                        <AdminTooltip
                          title="SPO Lama / Scan Asli"
                          content="Pendaftaran arsip SPO fisik yang sudah ada dan bertanda tangan Direktur (unggah PDF scan asli)."
                          side="top"
                          className="w-full"
                        >
                          <button type="button" onClick={() => startDocumentWorkflow('LAMA')} className={`w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${documentTypeChosen && documentType === 'LAMA' ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-500/20 text-purple-950' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                            <BookOpen className="w-5 h-5 shrink-0 text-purple-600" />
                            <div><div className="text-xs font-black">SPO Eksisting</div><div className="text-[10px] text-slate-400">Scan PDF sah bertandatangan</div></div>
                          </button>
                        </AdminTooltip>

                        <AdminTooltip
                          title="SPO Hasil Riviu"
                          content="Pembaruan atau kaji ulang berkala dari SPO eksisting sebelumnya dengan nomor revisi baru."
                          side="top"
                          className="w-full"
                        >
                          <button type="button" onClick={() => startDocumentWorkflow('REVIEW')} className={`w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${documentTypeChosen && documentType === 'REVIEW' ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 text-amber-950' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                            <RefreshCw className="w-5 h-5 shrink-0 text-amber-600" />
                            <div><div className="text-xs font-black">SPO Riviu</div><div className="text-[10px] text-slate-400">Revisi berkala / tahunan</div></div>
                          </button>
                        </AdminTooltip>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/40 px-3.5 py-2.5">
                        <div className="flex items-center gap-2 min-w-0"><span className="text-emerald-700 font-black">✓</span><span className="text-xs font-black text-slate-800 truncate">{documentType === 'BARU' ? 'SPO Baru (2026)' : documentType === 'LAMA' ? 'SPO Eksisting' : 'SPO Riviu'}</span></div>
                        <span className="text-[10px] text-slate-400">Tahap selesai</span>
                      </div>
                    )}
                    {workflowStep === 1 && documentTypeChosen && (
                      <div className="flex justify-end pt-1">
                        <button type="button" onClick={() => setWorkflowStep(2)} className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 px-1.5 py-1">Selanjutnya →</button>
                      </div>
                    )}
                  </section>

                  {/* 2. Unit / Hierarchy — tampil setelah jenis dipilih. */}
                  {workflowStep >= 2 && documentTypeChosen && (
                  <section className={`bg-slate-50 rounded-2xl border border-slate-200 space-y-3 ${workflowStep >= 3 ? 'p-3' : 'p-3.5 sm:p-4'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-emerald-600" />
                        <span>2. Unit Kerja / Hierarki SPO</span>
                      </h3>
                      {documentType === 'LAMA' && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                          Unit Pendaftaran Format Lama
                        </span>
                      )}
                    </div>

                    {workflowStep >= 3 ? (
                      <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/40 px-3.5 py-2.5">
                        <div className="flex items-center gap-2 min-w-0"><span className="text-emerald-700 font-black">✓</span><span className="text-xs font-black text-slate-800 truncate">{hasGlobalHierarchyAccess ? (activeCategory?.name || selectedCatCode || 'Pilih Hirarki Tujuan') : (activeAssignment?.unitName || activeCategory?.name || selectedCatCode)}{subHierarchyCode ? ` · ${subHierarchyCode}` : ''}</span></div>
                        <span className="text-[10px] text-slate-400 shrink-0">Tahap selesai</span>
                      </div>
                    ) : hasValidUserAssignment ? (
                      <>
                        {hasGlobalHierarchyAccess && (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <div>
                                <label className="block text-[10px] uppercase tracking-wider font-bold text-emerald-700">Identitas Akses User</label>
                                <p className="text-[11px] text-slate-500 mt-0.5"><span>Akses global <strong className="text-emerald-700">ALL</strong>.</span> Pilih hirarki tujuan SPO untuk menentukan lokasi/identitas dokumen dan penomorannya.</p>
                              </div>
                              <span className="shrink-0 inline-flex items-center rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-black text-emerald-700">ALL — SEMUA HIRARKI</span>
                            </div>
                            <div className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">HIRARKI TUJUAN SPO</div>
                            <select
                              value={selectedCatCode}
                              onChange={(e) => {
                                const nextCategory = e.target.value;
                                setSelectedCatCode(nextCategory);
                                setSelectedSubCode('');
                                setSelectedInstCode('');
                                setSelectedPoliCode('');
                                setSelectedSubUnitCode('');
                                setSelectedHierarchyOverride('');
                              }}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-emerald-200 bg-white text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                              aria-label="Pilih hirarki tujuan SPO"
                            >
                              <option value="">Pilih hirarki tujuan SPO...</option>
                              {categoriesList.filter((c) => c.active !== false).map((category) => (
                                <option key={category.code} value={category.code}>[{category.code}] {category.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

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

                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 px-3 py-2.5 flex items-center gap-2 min-w-0">
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 shrink-0">{hasGlobalHierarchyAccess ? 'Hirarki Tujuan' : 'Hirarki Akun'}</div>
                            <div className="text-sm font-black text-slate-900 truncate">{hasGlobalHierarchyAccess ? (activeCategory?.name || 'Pilih Hirarki Tujuan') : (activeAssignment?.unitName || activeCategory?.name || selectedCatCode)}</div>
                            <div className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 shrink-0">{hasGlobalHierarchyAccess && !selectedCatCode ? 'BELUM DIPILIH' : `${selectedCatCode}${selectedHierarchyOverride ? ` ${selectedHierarchyOverride}` : ''}`}</div>
                          </div>
                        </div>

                        {(() => {
                          const assignmentPath = getAssignmentPath(activeAssignment);
                          const currentPath = [selectedSubCode, selectedInstCode, selectedPoliCode, selectedSubUnitCode].filter(Boolean);
                          const prefix = assignmentPath;
                          const prefixIsValid = prefix.every((v, i) => currentPath[i] === v);
                          const safeCurrent = prefixIsValid ? currentPath : [...prefix];

                          const selectors: React.ReactNode[] = [];
                          let opsLevel = prefix.length;

                          while (opsLevel < 4) {
                            const parentPath = safeCurrent.slice(0, opsLevel);
                            const children = getHierarchyChildren(selectedCatCode, parentPath);
                            if (!children.length) break;

                            const value = safeCurrent[opsLevel] || '';
                            const levelLabel = opsLevel === 0
                              ? 'Pilih Sub Bagian / Unit'
                              : opsLevel === 1
                                ? 'Pilih Instalasi / Unit'
                                : opsLevel === 2
                                  ? 'Pilih Poli / Unit'
                                  : 'Pilih Sub Unit';
                            const selectorLevel = opsLevel;

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
                            opsLevel += 1;
                          }

                          if (!selectors.length) return null;

                          return (
                            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
                              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                                Pilihan Turunan Unit
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
                        Akun User belum memiliki assignment hirarki yang valid. Pengajuan SPO tidak dapat dilanjutkan.
                      </div>
                    )}

                    {workflowStep === 2 && (
                      <div className="flex items-center justify-between pt-1">
                        <button type="button" onClick={goBackWorkflow} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-1.5 py-1">← Kembali</button>
                        <button type="button" onClick={() => hierarchyReady && setWorkflowStep(3)} disabled={!hierarchyReady} className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 disabled:text-slate-300 disabled:cursor-not-allowed px-1.5 py-1">Selanjutnya →</button>
                      </div>
                    )}
                  </section>
                  )}

                  {/* Tahap 3 baru dibuka setelah hirarki dikonfirmasi. */}
                  {workflowStep >= 3 && (
                    <>
                  {/* Nomor SPO diterbitkan ditampilkan ringkas di bawah form setelah berhasil. */}
                  {/* 3. Formulir SPO EKSISTING — Live Form Khusus dengan 2 Opsi: Upload DOCX (Live Form A4) atau Upload PDF (SPO Fisik Asli) */}
                  {documentType === 'LAMA' ? (
                    <section className="rounded-2xl border border-purple-200 bg-white p-4 sm:p-6 space-y-6 shadow-xs">
                      {/* Header Section */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-purple-100">
                        <div>
                          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-950">
                            <BookOpen className="w-4 h-4 text-purple-700" />
                            <span>3. Live Form SPO Existing Aktif</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            Daftarkan SPO Eksisting yang sudah berlaku. Nomor lama/legacy asli <strong>wajib dipertahankan</strong> dan tidak digenerate ulang oleh sistem.
                          </p>
                        </div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-200 text-purple-800 text-[11px] font-bold shrink-0">
                          <Lock className="w-3.5 h-3.5 text-purple-600" />
                          <span>Nomor Asli Dipertahankan</span>
                        </div>
                      </div>

                      {/* Switcher 2 Opsi: Upload DOCX vs Upload PDF */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setExistingMode('docx')}
                          className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                            existingMode === 'docx'
                              ? 'border-purple-600 bg-purple-50/80 ring-2 ring-purple-500/20 shadow-xs'
                              : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70 text-slate-700'
                          }`}
                        >
                          <div className={`p-2 rounded-lg shrink-0 ${existingMode === 'docx' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-900">Opsi 1: Upload DOCX → Live Form A4</span>
                              {existingMode === 'docx' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-200 text-purple-900">Aktif</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                              Otomatis mendeteksi nomor naskah lama, judul, tanggal, dan seluruh isi batang tubuh SPO ke lembar kerja A4 untuk diverifikasi.
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setExistingMode('pdf')}
                          className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                            existingMode === 'pdf'
                              ? 'border-purple-600 bg-purple-50/80 ring-2 ring-purple-500/20 shadow-xs'
                              : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70 text-slate-700'
                          }`}
                        >
                          <div className={`p-2 rounded-lg shrink-0 ${existingMode === 'pdf' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                            <FileCheck2 className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-900">Opsi 2: Upload PDF (SPO Fisik Asli)</span>
                              {existingMode === 'pdf' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-200 text-purple-900">Aktif</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                              Untuk naskah yang sudah aktif & bertanda tangan Direktur. Deteksi nomor & metadata, pratinjau dokumen asli di layar, simpan tanpa modifikasi PDF.
                            </p>
                          </div>
                        </button>
                      </div>

                      {/* Dropdown Opsional: Pilih dokumen terdaftar untuk digantikan jika ada */}
                      {sops && sops.length > 0 && (
                        <div className="rounded-xl border border-purple-200 bg-purple-50/30 p-3">
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

                      {/* KONTEN OPSI 1: UPLOAD DOCX -> LIVE FORM A4 */}
                      {existingMode === 'docx' && (
                        <div className="space-y-5">
                          {/* Dropzone Upload DOCX */}
                          <div className="rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/40 p-5 text-center hover:bg-purple-50/70 transition-colors">
                            <input
                              type="file"
                              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                              onChange={handleDocxUpload}
                              className="hidden"
                              id="existing-docx-file-input"
                            />
                            <label
                              htmlFor="existing-docx-file-input"
                              className="cursor-pointer flex flex-col items-center justify-center gap-2"
                            >
                              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 shadow-2xs">
                                {isParsingDocx ? <Loader2 className="w-6 h-6 animate-spin text-purple-600" /> : <FileUp className="w-6 h-6" />}
                              </div>
                              <div className="text-xs font-bold text-purple-950">
                                {isParsingDocx ? 'Sedang Membaca & Mengekstrak Dokumen Word...' : 'Klik atau Tarik Berkas Word (.docx) ke Sini'}
                              </div>
                              <p className="text-[11px] text-slate-600 max-w-lg">
                                Parser akan otomatis mendeteksi <strong>Nomor SPO Lama</strong>, <strong>Judul</strong>, <strong>Tanggal</strong>, serta mengisi Pengertian, Tujuan, Kebijakan, Prosedur, Alur, dan Unit Terkait langsung ke Lembar Kerja A4 di bawah.
                              </p>
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-colors mt-1">
                                <FileUp className="w-4 h-4" />
                                <span>Pilih Berkas Word (.docx)</span>
                              </span>
                            </label>

                            {parsedDocxSummary && (
                              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>Terekstrak dari {parsedDocxSummary.fileName}: {parsedDocxSummary.fields.join(', ')}</span>
                              </div>
                            )}
                          </div>

                          {/* Verifikasi Nomor Lama & Metadata */}
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                Verifikasi Identitas & Nomor Legacy Dokumen
                              </span>
                              <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                                Wajib Diperiksa
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-800 mb-1">
                                  Nomor SPO Eksisting / Lama <span className="text-rose-500">*</span>
                                </label>
                                <div className="relative">
                                  <input
                                    type="text"
                                    required
                                    value={manualLegacyNumber}
                                    onChange={(e) => setManualLegacyNumber(e.target.value.toUpperCase())}
                                    placeholder="Contoh: 440/102/SPO/PEL/2023 atau SOEGIRI / 015 / 2024"
                                    className="w-full pl-3 pr-24 py-2.5 rounded-xl border border-purple-300 bg-white font-mono text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                                  />
                                  <span className="absolute right-2 top-2 px-2 py-0.5 rounded bg-purple-100 text-[10px] font-bold text-purple-800">
                                    Dipertahankan
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-1">
                                  Nomor ini akan disimpan persis seperti dokumen asli tanpa digenerate ulang.
                                </p>
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-800 mb-1">
                                  Tanggal Pengesahan Asli
                                </label>
                                <input
                                  type="date"
                                  value={effectiveDate}
                                  onChange={(e) => setEffectiveDate(e.target.value)}
                                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-800 mb-1">
                                  No. Revisi Asli
                                </label>
                                <input
                                  type="text"
                                  value={revisionNumber}
                                  onChange={(e) => setRevisionNumber(e.target.value)}
                                  placeholder="00"
                                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-mono text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-800 mb-1">
                                Judul SPO Eksisting <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Contoh: Prosedur Pelayanan Pasien Gawat Darurat"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                              />
                            </div>
                          </div>

                          {/* Lembar Kerja A4 Live Template untuk SPO Eksisting */}
                          <div className="pt-2">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                                <FileText className="w-4 h-4 text-purple-600" />
                                <span>Lembar Kerja A4 — Verifikasi Isi Naskah Batang Tubuh</span>
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Anda dapat langsung mengedit atau melengkapi naskah di bawah
                              </span>
                            </div>

                            <SopLiveTemplate
                              title={title}
                              onTitleChange={setTitle}
                              sopNumber={manualLegacyNumber || '[Ketik/Ekstrak Nomor SPO Lama]'}
                              version={revisionNumber || '00'}
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
                              missingSections={missingSections}
                            />
                          </div>
                        </div>
                      )}

                      {/* KONTEN OPSI 2: UPLOAD PDF (SPO FISIK ASLI) */}
                      {existingMode === 'pdf' && (
                        <div className="space-y-5">
                          {/* Dropzone Upload PDF */}
                          <div className="rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/40 p-5 text-center hover:bg-purple-50/70 transition-colors">
                            <input
                              ref={pdfInputRef}
                              type="file"
                              accept="application/pdf,.pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePdfUploadForExisting(file);
                              }}
                              className="hidden"
                              id="existing-pdf-file-input"
                            />
                            <label
                              htmlFor="existing-pdf-file-input"
                              className="cursor-pointer flex flex-col items-center justify-center gap-2"
                            >
                              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 shadow-2xs">
                                {isParsingPdf ? <Loader2 className="w-6 h-6 animate-spin text-purple-600" /> : <FileUp className="w-6 h-6" />}
                              </div>
                              <div className="text-xs font-bold text-purple-950">
                                {isParsingPdf ? 'Sedang Membaca Berkas & Metadata PDF Asli...' : 'Klik atau Tarik Berkas PDF Scan Asli ke Sini'}
                              </div>
                              <p className="text-[11px] text-slate-600 max-w-lg">
                                Unggah berkas PDF SPO yang sudah bertanda tangan basah Direktur. Metadata nomor, judul, dan tanggal akan dideteksi otomatis, dan naskah asli akan dipratinjau secara langsung di sebelah kanan.
                              </p>
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-colors mt-1">
                                <FileUp className="w-4 h-4" />
                                <span>Pilih Berkas PDF Scan Asli</span>
                              </span>
                            </label>

                            {parsedPdfSummary && (
                              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>{parsedPdfSummary.fileName} — {parsedPdfSummary.fields.join(' • ')}</span>
                              </div>
                            )}
                          </div>

                          {/* 2-Column Layout: Form Verifikasi (Kiri) + Pratinjau PDF Asli (Kanan) */}
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                            {/* Kolom Kiri: Form Verifikasi Metadata */}
                            <div className="lg:col-span-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                                  Verifikasi Data Dokumen PDF
                                </span>
                                <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                                  Tanpa Modifikasi PDF
                                </span>
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-800 mb-1">
                                  Nomor SPO Eksisting Resmi <span className="text-rose-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={manualLegacyNumber}
                                  onChange={(e) => setManualLegacyNumber(e.target.value.toUpperCase())}
                                  placeholder="Contoh: 440/102/SPO/PEL/2023 atau SOEGIRI / 015 / 2024"
                                  className="w-full px-3.5 py-2.5 rounded-xl border border-purple-300 bg-white font-mono text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                <p className="text-[10px] text-slate-500 mt-1">
                                  Nomor resmi dari naskah asli. Nomor ini tidak akan diubah atau digenerate ulang.
                                </p>
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-800 mb-1">
                                  Judul SPO Eksisting <span className="text-rose-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={title}
                                  onChange={(e) => setTitle(e.target.value)}
                                  placeholder="Contoh: Prosedur Triase Gawat Darurat"
                                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-bold text-slate-800 mb-1">
                                    Tanggal Ditetapkan
                                  </label>
                                  <input
                                    type="date"
                                    value={effectiveDate}
                                    onChange={(e) => setEffectiveDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-800 mb-1">
                                    No. Revisi
                                  </label>
                                  <input
                                    type="text"
                                    value={revisionNumber}
                                    onChange={(e) => setRevisionNumber(e.target.value)}
                                    placeholder="00"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                                  />
                                </div>
                              </div>

                              {/* Jaminan Integritas Dokumen Asli */}
                              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs space-y-1">
                                <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                                  <Shield className="w-4 h-4 text-emerald-700 shrink-0" />
                                  <span>Jaminan Integritas Berkas Asli</span>
                                </div>
                                <p className="text-[11px] text-emerald-800 leading-relaxed">
                                  Dokumen PDF yang diunggah akan disimpan utuh sebagai dokumen asli bertanda tangan Direktur. Sistem tidak akan menambahkan watermark atau mengubah naskah fisik ini. Dokumen akan langsung berstatus <strong>AKTIF</strong> di Library dan siap untuk diajukan <strong>Riviu</strong> sewaktu-waktu.
                                </p>
                              </div>
                            </div>

                            {/* Kolom Kanan: Pratinjau PDF Asli */}
                            <div className="lg:col-span-7 rounded-xl border border-slate-300 bg-slate-900 overflow-hidden shadow-xs flex flex-col h-[520px]">
                              <div className="flex items-center justify-between px-4 py-2.5 bg-white text-black border-b border-slate-200" style={{ backgroundColor: '#ffffff' }}>
                                <div className="flex items-center gap-2 text-xs font-bold text-black">
                                  <Eye className="w-4 h-4 text-[#8506ff]" />
                                  <span className="text-black" style={{ color: '#000000' }}>Pratinjau PDF Dokumen Asli</span>
                                </div>
                                {pdfPreviewUrl && (
                                  <a
                                    href={pdfPreviewUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8506ff] hover:text-purple-800"
                                  >
                                    <span style={{ color: '#8506ff' }}>Buka Tab Baru</span>
                                    <ExternalLink className="w-3.5 h-3.5 text-[#8506ff]" />
                                  </a>
                                )}
                              </div>

                              <div className="flex-1 bg-slate-100 flex items-center justify-center relative overflow-hidden">
                                {pdfPreviewUrl && selectedFile ? (
                                  <DocumentViewer
                                    file={selectedFile}
                                    fileName={selectedFile.name}
                                    heightClass="h-full w-full"
                                  />
                                ) : (
                                  <div className="text-center p-8 text-slate-400 space-y-3">
                                    <FileCheck2 className="w-12 h-12 mx-auto text-slate-300" />
                                    <div className="text-xs font-bold text-slate-600">Belum Ada File PDF yang Diunggah</div>
                                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                                      Silakan unggah berkas PDF scan asli pada dropzone di atas untuk melihat pratinjau langsung di sini sebelum verifikasi disimpan.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
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
                                {accessibleSops.filter((s) => s.status === 'AKTIF').map((s) => (
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

                          {/* Tombol Import / Upload Naskah DOCX */}
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              ref={docxInputRef}
                              type="file"
                              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                              onChange={handleDocxUpload}
                              className="hidden"
                              id="docx-sop-uploader-userview"
                            />
                            <label
                              htmlFor="docx-sop-uploader-userview"
                              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                                isParsingDocx
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-wait'
                                  : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700 shadow-2xs hover:shadow-xs'
                              }`}
                              title="Unggah berkas Word (.docx) untuk otomatis mengekstrak judul, tanggal, pengertian, tujuan, kebijakan, prosedur, alur, dan unit terkait."
                            >
                              {isParsingDocx ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                  <span>Mengekstrak Naskah DOCX...</span>
                                </>
                              ) : (
                                <>
                                  <FileUp className="w-3.5 h-3.5 text-white" />
                                  <span>Pilih Berkas Word (.docx)</span>
                                </>
                              )}
                            </label>
                          </div>
                        </div>

                        {/* Prominent Upload .DOCX Dropzone Card di Tahap 3 */}
                        <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-4 sm:p-5 text-center hover:bg-blue-50/70 transition-colors">
                          <label
                            htmlFor="docx-sop-uploader-userview"
                            className="cursor-pointer flex flex-col items-center justify-center gap-2"
                          >
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 shadow-2xs">
                              {isParsingDocx ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
                            </div>
                            <div>
                              <span className="text-xs font-bold text-blue-950 block">
                                {isParsingDocx ? 'Sedang Membaca & Mengekstrak Dokumen Word...' : 'Unggah Berkas Naskah Draf Word (.docx)'}
                              </span>
                              <p className="text-[11px] text-slate-600 max-w-lg mt-0.5">
                                Klik untuk memilih berkas Word (.docx). Sistem akan otomatis membaca naskah dan mengisi <strong>Judul, Tanggal, Pengertian, Tujuan, Kebijakan, Prosedur, Alur, dan Unit Terkait</strong> langsung ke lembar kerja A4 di bawah.
                              </p>
                            </div>
                          </label>
                        </div>

                        {/* Banner status hasil import DOCX */}
                        {parsedDocxSummary && (
                          <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-blue-50/90 border border-blue-200 text-xs">
                            <div className="flex items-start gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                              <div>
                                <div className="font-bold text-blue-950">
                                  Naskah DOCX Berhasil Diimpor: <span className="font-mono text-blue-800">{parsedDocxSummary.fileName}</span>
                                </div>
                                <div className="text-[11px] text-blue-800 mt-0.5">
                                  Bagian terisi otomatis: {parsedDocxSummary.fields.join(', ') || 'Semua Bagian Naskah'}. Silakan teliti dan lengkapi naskah pada lembar kerja di bawah jika diperlukan.
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setParsedDocxSummary(null)}
                              className="text-blue-500 hover:text-blue-800 p-1"
                              title="Tutup info"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="pt-1">
                          <SopLiveTemplate
                            title={title}
                            onTitleChange={setTitle}
                            sopNumber={documentType === 'REVIEW' ? '[Nomor Riviu Akan Terbit Otomatis]' : 'Otomatis'}
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
                            showPageHint={false}
                            missingSections={missingSections}
                          />
                        </div>
                      </section>

                      {/* Bukti dokumen hanya untuk SPO Riviu. SPO Baru tidak memiliki upload. */}
                      {documentType === 'REVIEW' && (
                      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-black text-slate-700">
                              Bukti Dokumen SPO Lama (PDF)
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">Wajib hanya jika SPO rujukan tidak berasal dari dokumen Aktif di aplikasi.</div>
                          </div>
                          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer hover:bg-slate-50">
                            <Upload className="w-4 h-4" />
                            Pilih File
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
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
                        {documentType === 'REVIEW' && (
                          <label className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 text-[11px] text-amber-950 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={externalReviewSignedConfirmed}
                              onChange={(e) => setExternalReviewSignedConfirmed(e.target.checked)}
                              className="mt-0.5 accent-amber-600"
                            />
                            <span>Saya memastikan PDF SPO lama yang diunggah sudah ditandatangani Direktur. Konfirmasi ini wajib jika SPO rujukan tidak berasal dari dokumen Aktif di aplikasi.</span>
                          </label>
                        )}
                      </section>
                      )}
                    </>
                  )}
                    </>
                  )}

                  {/* Final action hanya boleh muncul setelah tahap 3 tercapai. */}
                  {workflowStep >= 3 && (
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                      <AdminTooltip
                        title="Kembali ke Langkah Sebelumnya"
                        content="Kembali ke pemilihan unit atau jenis naskah untuk melakukan penyesuaian data."
                        side="top"
                      >
                        <button type="button" onClick={goBackWorkflow} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">← Kembali</button>
                      </AdminTooltip>
                      <div className="flex items-center gap-3">
                        <AdminTooltip
                          title="Batal Pengisian"
                          content="Batalkan pengisian formulir dan kembali ke daftar naskah SPO."
                          side="top"
                        >
                          <button
                            type="button"
                            onClick={() => setSpoSubTab('list')}
                            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
                          >
                            Batal
                          </button>
                        </AdminTooltip>

                        <AdminTooltip
                          title="Daftarkan & Usulkan"
                          content="Simpan draf naskah SPO ke pangkalan data dan kirimkan usulan pengesahan ke verifikator/Direktur."
                          side="top"
                        >
                          <button
                            type="submit"
                            disabled={isSubmitting || !hasValidUserAssignment}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-black shadow-xs cursor-pointer"
                          >
                            {isSubmitting ? 'Menyimpan...' : (
                              <>
                                <PlusCircle className="w-4 h-4" />
                                <span>Daftarkan & Usulkan SPO</span>
                              </>
                            )}
                          </button>
                        </AdminTooltip>
                      </div>
                    </div>
                  )}
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
          <UserPasswordTab
            userSession={userSession}
            onLogout={onLogout}
            onUpdatePassword={onUpdatePassword}
            onShowToast={onShowToast}
          />
        )}

        {/* TAB ADMIN HUB */}
        {activeTab === 'admin' && (
          <AdminHubPage
            userSession={userSession}
            userAccounts={users}
            sops={sops}
            onOpenUserManagement={onOpenUserManagement}
            onOpenMasterData={onOpenMasterData}
            onOpenSecurity={onOpenSecurity}
            onOpenBackupRestore={onOpenBackupRestore}
            onOpenMaintenance={onOpenMaintenance}
            onLogout={onLogout}
            onUpdatePassword={onUpdatePassword}
            onShowToast={onShowToast}
            onStandardizeAllNumbers={onStandardizeAllNumbers}
          />
        )}
      </main>


      {/* Nomor Terbit Modal */}
      {userSession.role === 'admin' && showIssuedNumbers && (
        <div className="fixed inset-0 z-[75] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowIssuedNumbers(false); }}>
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900">Nomor Terbit</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">Nomor yang tersedia untuk SPO Existing.</p>
              </div>
              <button type="button" onClick={() => setShowIssuedNumbers(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 cursor-pointer" aria-label="Tutup">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-5">
              <div className="relative mb-4">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={issuedNumberSearch}
                  onChange={(e) => setIssuedNumberSearch(e.target.value)}
                  placeholder="Cari nomor atau judul SPO..."
                  className="w-full text-xs pl-10 pr-4 py-3 border border-slate-300 rounded-xl bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[minmax(180px,0.9fr)_minmax(0,1.6fr)] bg-slate-50 border-b border-slate-200 px-4 py-2.5 text-[10px] uppercase tracking-wider font-black text-slate-500">
                  <span>Nomor</span><span>Judul SPO</span>
                </div>
                <div className="max-h-[55vh] overflow-auto">
                  {issuedNumberRegister.filter((row) => {
                    const q = issuedNumberSearch.trim().toLowerCase();
                    if (!q) return true;
                    return String(row.sopNumber || '').toLowerCase().includes(q) || String(row.title || '').toLowerCase().includes(q);
                  }).length === 0 ? (
                    <div className="px-4 py-12 text-center text-xs text-slate-500">Belum ada nomor terbit yang tersedia.</div>
                  ) : issuedNumberRegister.filter((row) => {
                    const q = issuedNumberSearch.trim().toLowerCase();
                    if (!q) return true;
                    return String(row.sopNumber || '').toLowerCase().includes(q) || String(row.title || '').toLowerCase().includes(q);
                  }).map((row) => (
                    <div key={row.id} className="grid grid-cols-[minmax(180px,0.9fr)_minmax(0,1.6fr)] items-center gap-4 px-4 py-3.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-black text-slate-900 break-all">{row.sopNumber}</span>
                        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(row.sopNumber); onShowToast?.('success', 'Nomor Disalin', row.sopNumber); } catch { onShowToast?.('error', 'Gagal Menyalin', 'Nomor tidak dapat disalin ke clipboard.'); } }} className="shrink-0 p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 cursor-pointer" title="Salin nomor" aria-label={`Salin nomor ${row.sopNumber}`}><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="text-xs font-semibold text-slate-700 break-words">{row.title || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Issue SOP Number Modal */}
      {userSession.role === 'admin' && (
        <IssueSopNumberModal
          open={showIssueNumberModal}
          title={issueTitle}
          effectiveDate={issueEffectiveDate}
          hierarchyOptions={issueHierarchyOptions}
          selectedHierarchyId={issueHierarchyId}
          isIssuingNumber={isIssuingNumber}
          onTitleChange={setIssueTitle}
          onEffectiveDateChange={setIssueEffectiveDate}
          onHierarchyChange={setIssueHierarchyId}
          onClose={() => setShowIssueNumberModal(false)}
          onSubmit={handleIssueNumber}
        />
      )}

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
