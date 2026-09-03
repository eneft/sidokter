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
import { generateSopNumber, getNextSequenceNumber, formatBytes, standardizeSopDocument, checkDuplicateSopNumber, detectHierarchyFromSopNumber, isNewSopFormat, normalizeSopNumberInput, matchMasterHierarchyPattern } from '../utils/numbering';
import { saveFileToLocalCache } from '../utils/fileStorage';
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
import { AdminHubPage } from './AdminHubPage';
import IssueSopNumberModal from './IssueSopNumberModal';
import { getAllNumberReservations, SopNumberReservation } from '../lib/sopService';

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
  onOpenMaintenance
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

  const hasStructuralBadge = userSession.role === 'user' && Array.isArray(userSession.badges) && userSession.badges.some((b) => String(b).toUpperCase() === 'STRUKTURAL');
  // ALL pada assignment adalah hak akses global ke seluruh master hirarki.
  // Ini berbeda dari badge: badge menentukan hak akses dokumen, sedangkan ALL
  // menentukan cakupan hirarki yang boleh dipilih sebagai TUJUAN SPO.
  const hasAllHierarchyAssignment = normalizedAssignments.some((a) => String(a.divisionCode || '').toUpperCase() === 'ALL');
  const hasGlobalHierarchyAccess = userSession.role === 'admin' || hasAllHierarchyAssignment;
  const hasAllDivisionsAccess = hasGlobalHierarchyAccess || hasStructuralBadge;

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if ((documentType === 'LAMA' || documentType === 'REVIEW') && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        onShowToast?.('error', 'Format File Salah', documentType === 'REVIEW' ? 'SPO rujukan Riviu dari luar aplikasi wajib berupa file PDF.' : 'SPO Eksisting wajib berupa file PDF asli.');
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
      if (!selectedFile) {
        setSubmitError('Wajib mengunggah scan file PDF asli SPO Eksisting yang sudah bertanda tangan.');
        return;
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
        // Workflow identity is authoritative: data inherited from an existing
        // document must NEVER turn the Existing workflow into Riviu/Review.
        // App.tsx will finalize an Existing replacement's document identity later
        // (for example, a replacement of a Draft may remain documentType=BARU),
        // but the submit boundary itself is always explicitly EKSISTING.
        documentType: isLegacy ? 'LAMA' : (isReview ? 'RIVIU' : 'BARU'),
        jenis_spo: isLegacy ? 'EKSISTING' : (isReview ? 'RIVIU' : 'BARU'),
        isLegacySop: isLegacy ? (matchedExistingDoc ? Boolean(matchedExistingDoc.isLegacySop) : !isNewFormat) : false,
        legacySopNumber: isLegacy ? (isNewFormat && matchedExistingDoc ? undefined : cleanNum) : undefined,
        sopNumber: isLegacy ? cleanNum : (finalIssuedNumber || oldSopNumber || ''),
        existingSopId: isReview ? (selectedExistingSopIdForReview || existingSopId || undefined) : undefined,
        // Preserve the distinction: Existing replacement of a DRAFT is still a BARU document type,
        // but preview must use the uploaded original PDF instead of generating the official template.
        isExistingReplacement: isLegacy && Boolean(matchedExistingDoc),
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
        onOpenUserManagement={onOpenUserManagement}
        onOpenMasterData={onOpenMasterData}
        onOpenSecurity={onOpenSecurity}
        onOpenBackupRestore={onOpenBackupRestore}
        onOpenMaintenance={onOpenMaintenance}
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
                  {/* 1. Jenis SPO — tahap pertama, lalu otomatis menjadi summary setelah lanjut. */}
                  <section className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                        <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </span>
                        <span>1. Jenis Dokumen SPO</span>
                      </h3>
                      {workflowStep >= 2 && documentTypeChosen && <span className="text-[10px] font-bold text-emerald-700 shrink-0">✓ Selesai</span>}
                    </div>
                    {workflowStep === 1 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button type="button" onClick={() => startDocumentWorkflow('BARU')} className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${documentTypeChosen && documentType === 'BARU' ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                          <FileText className="w-5 h-5 shrink-0 text-emerald-600" />
                          <div><div className="text-xs font-black">SPO Baru (2026)</div><div className="text-[10px] text-slate-400">Penomoran otomatis</div></div>
                        </button>
                        <button type="button" onClick={() => startDocumentWorkflow('LAMA')} className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${documentTypeChosen && documentType === 'LAMA' ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-500/20 text-purple-950' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                          <BookOpen className="w-5 h-5 shrink-0 text-purple-600" />
                          <div><div className="text-xs font-black">SPO Eksisting</div><div className="text-[10px] text-slate-400">Scan PDF sah bertandatangan</div></div>
                        </button>
                        <button type="button" onClick={() => startDocumentWorkflow('REVIEW')} className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${documentTypeChosen && documentType === 'REVIEW' ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 text-amber-950' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                          <RefreshCw className="w-5 h-5 shrink-0 text-amber-600" />
                          <div><div className="text-xs font-black">SPO Riviu</div><div className="text-[10px] text-slate-400">Revisi berkala / tahunan</div></div>
                        </button>
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
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <label className="block text-xs font-bold text-purple-950">
                              Nomor SPO Eksisting / Lama <span className="text-rose-500">*</span>
                            </label>
                            <span className="text-[10px] font-semibold text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-md">
                              Input Nomor Asli
                            </span>
                          </div>
                          <input
                            type="text"
                            required
                            value={manualLegacyNumber}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              setManualLegacyNumber(val);
                              const clean道德 = normalizeSopNumberInput(val);
                              if (clean道德) {
                                const matched = sops?.find((s) => 
                                  (s.sopNumber && normalizeSopNumberInput(s.sopNumber) === clean道德) ||
                                  (s.legacySopNumber && normalizeSopNumberInput(s.legacySopNumber) === clean道德)
                                );
                                setExistingSopId(matched?.id || '');
                                if (matched) {
                                  if (!title.trim() && matched.title) {
                                    setTitle(matched.title);
                                  }
                                  if (matched.effectiveDate) {
                                    setEffectiveDate(matched.effectiveDate);
                                  }
                                } else {
                                  const reservation = issuedNumberRegister.find((row) =>
                                    normalizeSopNumberInput(row.sopNumber) === clean道德
                                  );
                                  if (reservation) {
                                    if (!title.trim() && reservation.title) setTitle(reservation.title);
                                    if (reservation.effectiveDate) setEffectiveDate(reservation.effectiveDate);
                                  }
                                }
                              } else {
                                setExistingSopId('');
                              }
                            }}
                            onBlur={() => {
                              if (manualLegacyNumber.trim()) {
                                setManualLegacyNumber(normalizeSopNumberInput(manualLegacyNumber));
                              }
                            }}
                            placeholder="Contoh: SOEGIRI / 398 / 2025 atau 440/102/SPO/PEL/2023"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-purple-300 bg-white font-mono text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                          />

                          {/* Informasi Deteksi Otomatis Nomor & Hirarki */}
                          {manualLegacyNumber.trim() && (() => {
                            const normalized = normalizeSopNumberInput(manualLegacyNumber);
                            const patternMatch = matchMasterHierarchyPattern(normalized);
                            const isNewFormat = patternMatch.isMatch;
                            const matched = sops?.find((s) => 
                              (s.sopNumber && normalizeSopNumberInput(s.sopNumber) === normalized) ||
                              (s.legacySopNumber && normalizeSopNumberInput(s.legacySopNumber) === normalized) ||
                              (existingSopId && s.id === existingSopId)
                            );
                            const reserved = !matched
                              ? issuedNumberRegister.find((row) => normalizeSopNumberInput(row.sopNumber) === normalized) || null
                              : null;

                            return (
                              <div className="mt-2 space-y-2">
                                {/* Normalisasi Format Tag */}
                                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-purple-100/70 border border-purple-200 text-[11px]">
                                  <span className="text-purple-900 font-medium truncate">
                                    Standar Penulisan: <strong className="font-mono text-purple-950 font-bold">{normalized}</strong>
                                  </span>
                                  <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border shadow-2xs ${
                                    isNewFormat
                                      ? 'bg-purple-600 text-white border-purple-700'
                                      : 'bg-white text-slate-700 border-slate-300'
                                  }`}>
                                    {isNewFormat ? `Master Hirarki: ${patternMatch.categoryCode}` : 'Format Eksisting'}
                                  </span>
                                </div>

                                {matched ? (
                                  (() => {
                                    const isAktif = matched.status === 'AKTIF';
                                    const statusLabel持 =
                                      matched.status === 'DRAFT'
                                        ? 'Draft'
                                        : matched.status === 'DRAFT' || matched.status === 'DRAFT' || matched.isNumberReservation
                                        ? 'Draft'
                                        : matched.status === 'AKTIF'
                                        ? 'Aktif'
                                        : matched.status || 'Belum Aktif';
                                    const unitName = matched.hierarchyDescription || matched.divisionName || (matched as any).unitName || matched.divisionCode || 'Unit kerja terdaftar';

                                    if (isAktif) {
                                      return (
                                        <div className="rounded-xl border border-rose-300 bg-rose-50/95 p-3 space-y-1 text-rose-950">
                                          <div className="flex items-center gap-1.5 text-xs font-black text-rose-700">
                                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                            <span>Nomor Terdaftar Status AKTIF (Tidak Boleh Diganti)</span>
                                          </div>
                                          <div className="text-xs font-bold text-slate-900 line-clamp-1">{matched.title}</div>
                                          <div className="text-[11px] text-rose-800">
                                            <span className="font-semibold">Unit/Hirarki:</span> {unitName}
                                          </div>
                                          <div className="text-[10px] font-semibold text-rose-700">
                                            Sesuai aturan, dokumen berstatus <strong>AKTIF</strong> tidak dapat diganti melalui SPO Eksisting. Silakan gunakan menu <strong>SPO Riviu</strong>.
                                          </div>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 space-y-1">
                                        <div className="flex items-center gap-1.5 text-xs font-black text-emerald-900">
                                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                          <span>{isNewFormat ? 'Pola Master Hirarki Terdaftar' : 'Nomor Eksisting Terdaftar'} ({statusLabel持})</span>
                                        </div>
                                        <div className="text-xs font-bold text-slate-900 line-clamp-1">{matched.title}</div>
                                        <div className="text-[11px] text-emerald-800">
                                          <span className="font-semibold">Hirarki:</span> {unitName}
                                        </div>
                                        <div className="text-[10px] text-emerald-700 font-medium">
                                          ✅ Boleh replace & lengkapi berkas untuk mengaktifkan dokumen ini di sistem.
                                        </div>
                                      </div>
                                    );
                                  })()
                                ) : reserved ? (
                                  <div className="rounded-xl border border-emerald-300 bg-emerald-50/95 p-3 space-y-1 text-emerald-950">
                                    <div className="flex items-center gap-1.5 text-xs font-black text-emerald-800">
                                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                      <span>Nomor Terbit Ditemukan</span>
                                    </div>
                                    <div className="text-xs font-bold text-slate-900 line-clamp-1">{reserved.title || 'Nomor SPO Terbit'}</div>
                                    <div className="text-[11px] text-emerald-800">
                                      <span className="font-semibold">Hirarki:</span> {reserved.subHierarchyCode ? `${reserved.divisionCode} / ${reserved.subHierarchyCode}` : reserved.divisionCode}
                                    </div>
                                    <div className="text-[10px] text-emerald-700 font-medium">
                                      Nomor ini sudah diterbitkan dan dapat digunakan untuk <strong>SPO Existing → Replace Draft</strong>. Sistem tidak akan membuat nomor baru.
                                    </div>
                                  </div>
                                ) : isNewFormat ? (
                                  /* Pola Master Hirarki namun belum ada di database */
                                  <div className="rounded-xl border border-rose-300 bg-rose-50/95 p-3 space-y-1 text-rose-950">
                                    <div className="flex items-center gap-1.5 text-xs font-black text-rose-700">
                                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                      <span>❌ Pola Master Hirarki Belum Terdaftar (Wajib via SPO Baru)</span>
                                    </div>
                                    <div className="text-[11px] text-rose-900 leading-relaxed">
                                      Nomor ini sesuai <strong>Pola Penomoran Baru Master Hirarki RSUD Dr. Soegiri</strong> ({patternMatch.hierarchyName || patternMatch.categoryName || patternMatch.categoryCode}) namun belum terdaftar di sistem.
                                    </div>
                                    <div className="text-[10px] font-semibold text-rose-700 bg-rose-100/70 p-1.5 rounded-lg border border-rose-200">
                                      Silakan gunakan menu <strong>"SPO Baru"</strong> agar nomor urut diterbitkan secara resmi dan terstruktur sesuai master hirarki unit kerja.
                                    </div>
                                  </div>
                                ) : (
                                  /* Format Lama / Bebas belum ada di database */
                                  <div className="rounded-xl border border-blue-200 bg-blue-50/90 p-3 space-y-1.5">
                                    <div className="flex items-center gap-1.5 text-xs font-black text-blue-900">
                                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                                      <span>✅ Nomor Format Eksisting Siap Diregistrasi</span>
                                    </div>
                                    <div className="text-[11px] text-blue-950 leading-relaxed">
                                      Dokumen akan didaftarkan sebagai <strong>SPO Eksisting Aktif</strong> dengan nomor asli tetap dipertahankan.
                                    </div>
                                    <div className="text-[10px] text-blue-800 font-semibold bg-blue-100/80 px-2 py-1 rounded-md">
                                      Hirarki: Mengikuti pilihan unit pada Bagian 2 di atas ({activeAssignment?.unitName || activeCategory?.name || selectedCatCode}).
                                    </div>
                                  </div>
                                )}
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

                        </div>

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
                      <button type="button" onClick={goBackWorkflow} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-1.5 py-1">← Kembali</button>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setSpoSubTab('list')}
                          className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-1.5 py-1 cursor-pointer"
                        >
                          Batal
                        </button>
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
      </main>


      {/* Nomor Terbit Modal */}
      {showIssuedNumbers && (
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
