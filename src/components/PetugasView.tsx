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
  FileCheck
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
import { generateSopNumber, getNextSequenceNumber, formatBytes, standardizeSopDocument } from '../utils/numbering';
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
import { RichTextEditor } from './RichTextEditor';
import { SopLiveTemplate } from './SopLiveTemplate';
import { PetugasLibraryTab } from './PetugasLibraryTab';
import { PetugasPasswordTab } from './PetugasPasswordTab';
import { SKPage } from './SKPage';
import { MOUPage } from './MOUPage';
import { FinalLibraryPage } from './FinalLibraryPage';
import { DashboardOverviewPage } from './DashboardOverviewPage';
import { AdminHubPage } from './AdminHubPage';

interface PetugasViewProps {
  userSession: UserSession;
  onLogout: () => void;
  sops: SopDocument[];
  libraryDocuments: LibraryDocument[];
  onAddSop: (sop: Omit<SopDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'>) => Promise<SopDocument>;
  onIssueSopNumber?: (params: { divisionCode: string; subHierarchyCode?: string; dateStr?: string }) => Promise<string>;
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

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIssuingNumber, setIsIssuingNumber] = useState(false);
  const [showIssueNumberModal, setShowIssueNumberModal] = useState(false);
  const [issuedSopNumber, setIssuedSopNumber] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [latestCreatedSop, setLatestCreatedSop] = useState<SopDocument | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

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
    try {
      setIsIssuingNumber(true);
      setSubmitError(null);
      const number = await onIssueSopNumber({
        divisionCode: selectedCatCode,
        subHierarchyCode: subHierarchyCode || undefined,
        dateStr: effectiveDate
      });
      setIssuedSopNumber(number);
      setShowIssueNumberModal(false);
      onShowToast?.('success', 'Nomor SPO Diterbitkan', `Nomor ${number} telah dikunci dan tidak akan diterbitkan ulang.`);
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
    setSubmitError(null);
    setIssuedSopNumber(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

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

    if (documentType === 'LAMA') {
      if (!manualLegacyNumber.trim()) {
        setSubmitError('Nomor SPO Lama resmi wajib diisi.');
        return;
      }
      if (!selectedFile) {
        setSubmitError('Wajib mengunggah scan file PDF asli SPO Eksisting yang sudah bertanda tangan.');
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const isLegacy = documentType === 'LAMA';
      const isReview = documentType === 'REVIEW';

      const sopData: Omit<SopDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'> = {
        sequenceNumber: 0,
        title: title.trim(),
        divisionId: selectedCatCode,
        divisionCode: selectedCatCode,
        divisionName: activeCategory?.name || selectedCatCode,
        categoryId: selectedCatCode,
        categoryName: selectedCatCode,
        version: isReview ? (revisionNumber || '01') : isLegacy ? (revisionNumber || '00') : '00',
        status: isLegacy ? 'AKTIF' : 'MENUNGGU_PENGESAHAN',
        effectiveDate,
        reviewPeriodMonths: Number(reviewPeriodMonths) || 12,
        nextReviewDate: '',
        creatorName: userSession.name,
        creatorUnit: userSession.unitName || selectedCatCode,
        approverName: isLegacy ? legacyApprover : '',
        summary: summary.trim(),
        tags: [selectedCatCode, subHierarchyCode].filter(Boolean),
        subHierarchyCode,
        subCode: selectedSubCode,
        instalasiCode: selectedInstCode,
        poliCode: selectedPoliCode,
        subUnitCode: selectedSubUnitCode || undefined,
        hierarchyDescription: hierarchyInfo.conclusion || undefined,
        documentType: isLegacy ? 'LAMA' : 'BARU',
        jenis_spo: isLegacy ? 'EKSISTING' : isReview ? 'RIVIU' : 'BARU',
        isLegacySop: isLegacy,
        legacySopNumber: isLegacy ? manualLegacyNumber.trim() : undefined,
        sopNumber: isLegacy ? manualLegacyNumber.trim() : '',
        existingSopId: isReview ? existingSopId : undefined,
        pengertian: pengertian.trim() || undefined,
        tujuan: tujuan.trim() || undefined,
        kebijakan: kebijakan.trim() || undefined,
        prosedur: prosedur.trim() || undefined,
        unitTerkait: unitTerkait.trim() || undefined,
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

                <button
                  type="button"
                  onClick={() => setSpoSubTab('input')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    spoSubTab === 'input'
                      ? 'bg-emerald-600 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>+ Usulkan / Input SPO</span>
                </button>
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

                  {/* 2. Unit / Hierarchy */}
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

                  {/* 3. Opsi cepat: terbitkan nomor saja */}
                  <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-xl bg-white border border-emerald-200 text-emerald-700 flex items-center justify-center">
                            <FileCheck2 className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Terbitkan Nomor SPO Saja</h3>
                            <p className="text-[10px] text-slate-500 mt-0.5">Nomor diambil dari register otomatis dan dikunci agar tidak pernah sama.</p>
                          </div>
                        </div>
                        {issuedSopNumber && (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Nomor diterbitkan</span>
                            <span className="font-mono text-sm font-black text-emerald-800">{issuedSopNumber}</span>
                            <button type="button" onClick={() => navigator.clipboard?.writeText(issuedSopNumber)} className="text-[10px] font-bold text-emerald-700 hover:underline">Salin</button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowIssueNumberModal(true)}
                        disabled={isIssuingNumber || !hasValidPetugasAssignment || !onIssueSopNumber}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black shrink-0"
                      >
                        {isIssuingNumber ? 'Menerbitkan...' : 'Terbitkan Nomor SPO'}
                      </button>
                    </div>
                  </section>

                  {/* 3. Compact SPO detail summary + modal trigger */}
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">3. Rincian SPO</h3>
                        <div className="mt-2 text-sm font-black text-slate-900 truncate">
                          {title.trim() || 'Judul SPO belum diisi'}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                            title.trim() ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {title.trim() ? 'Judul ✓' : 'Judul belum diisi'}
                          </span>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                            pengertian.trim() && tujuan.trim() && kebijakan.trim() && prosedur.trim() && unitTerkait.trim()
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {pengertian.trim() && tujuan.trim() && kebijakan.trim() && prosedur.trim() && unitTerkait.trim()
                              ? 'Batang tubuh lengkap ✓'
                              : 'Batang tubuh belum lengkap'}
                          </span>
                          {selectedFile && (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-50 text-blue-700">
                              Lampiran ✓
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsDetailModalOpen(true)}
                        disabled={!hasValidPetugasAssignment}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-black shrink-0"
                      >
                        <FilePlus className="w-4 h-4" />
                        <span>Isi / Edit Rincian SPO</span>
                      </button>
                    </div>
                  </section>

                  {/* File upload is part of the compact main form */}
                  <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-black text-slate-700">
                          {documentType === 'LAMA' ? 'Lampiran PDF SPO Eksisting (Wajib)' : 'Lampiran Dokumen (Opsional)'}
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

            {/* SPO Detail Modal */}
            {isDetailModalOpen && (
              <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-0 sm:p-5">
                <div className="w-full h-full sm:h-auto sm:max-h-[94vh] sm:max-w-4xl bg-white sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
                  <div className="shrink-0 px-5 sm:px-7 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-black text-emerald-700">Rincian SPO</div>
                      <h3 className="text-lg sm:text-xl font-black text-slate-900">Judul & Batang Tubuh SPO</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDetailModalOpen(false)}
                      className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"
                      aria-label="Tutup"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 sm:p-7">
                    <div className="space-y-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Judul Standar Prosedur Operasional <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Contoh: Prosedur Penerimaan Pasien Rawat Inap"
                          className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">Tanggal Ditetapkan / Berlaku</label>
                          <input
                            type="date"
                            value={effectiveDate}
                            onChange={(e) => setEffectiveDate(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">Periode Riviu Berkala</label>
                          <select
                            value={reviewPeriodMonths}
                            onChange={(e) => setReviewPeriodMonths(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                          >
                            <option value="12">Setiap 1 Tahun (12 Bulan)</option>
                            <option value="24">Setiap 2 Tahun (24 Bulan)</option>
                            <option value="36">Setiap 3 Tahun (36 Bulan)</option>
                          </select>
                        </div>
                      </div>

                      {documentType === 'LAMA' && (
                        <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 space-y-3">
                          <div className="text-xs font-black text-purple-900">Rincian SPO Eksisting</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-purple-900 mb-1.5">
                                Nomor SPO Lama <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={manualLegacyNumber}
                                onChange={(e) => setManualLegacyNumber(e.target.value)}
                                placeholder="Contoh: 001/SPO/PEL/2024"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-purple-300 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-purple-900 mb-1.5">Tanggal Pengesahan Asli</label>
                              <input
                                type="date"
                                value={legacySignedDate}
                                onChange={(e) => setLegacySignedDate(e.target.value)}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-purple-300 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-500"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {documentType === 'REVIEW' && (
                        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                          <label className="block text-xs font-bold text-amber-900 mb-1.5">Nomor Revisi</label>
                          <input
                            type="text"
                            value={revisionNumber}
                            onChange={(e) => setRevisionNumber(e.target.value)}
                            placeholder="01"
                            className="w-full sm:max-w-xs px-3.5 py-2.5 rounded-xl border border-amber-300 text-xs bg-white outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      )}

                      <div className="border-t border-slate-100 pt-5">
                        <div className="mb-4">
                          <div className="text-xs font-black uppercase tracking-wider text-slate-700">Batang Tubuh SPO</div>
                          <div className="text-[10px] text-slate-400 mt-1">
                            Urutan: Pengertian → Tujuan → Kebijakan → Prosedur → Alur (opsional) → Unit Terkait.
                          </div>
                        </div>

                        {[
                          ['Pengertian', pengertian, setPengertian, 'Jelaskan pengertian/definisi istilah dan ruang lingkup yang perlu dipahami.'],
                          ['Tujuan', tujuan, setTujuan, 'Sebagai acuan penerapan langkah-langkah untuk ...'],
                          ['Kebijakan', kebijakan, setKebijakan, 'Tuliskan kebijakan Direktur/Pimpinan yang mendasari SPO.'],
                          ['Prosedur', prosedur, setProsedur, 'Tuliskan langkah-langkah kerja secara runtut dan menggunakan kalimat perintah aktif.'],
                          ['Alur (Opsional)', alur, setAlur, 'Tambahkan alur proses jika diperlukan.'],
                          ['Unit Terkait', unitTerkait, setUnitTerkait, 'Tuliskan unit-unit yang terkait dalam pelaksanaan SPO.']
                        ].map(([label, value, setter, placeholder]) => (
                          <div key={label as string} className="mb-4 last:mb-0">
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              {label}
                              {label !== 'Alur (Opsional)' && <span className="text-rose-500"> *</span>}
                            </label>
                            <textarea
                              rows={label === 'Prosedur' ? 7 : label === 'Alur (Opsional)' ? 4 : 4}
                              value={value as string}
                              onChange={(e) => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                              placeholder={placeholder as string}
                              className="w-full px-3.5 py-3 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 px-5 sm:px-7 py-4 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsDetailModalOpen(false)}
                      className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50"
                    >
                      Selesai Nanti
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!title.trim() || !pengertian.trim() || !tujuan.trim() || !kebijakan.trim() || !prosedur.trim() || !unitTerkait.trim()) {
                          setSubmitError('Lengkapi Judul, Pengertian, Tujuan, Kebijakan, Prosedur, dan Unit Terkait.');
                          return;
                        }
                        setSubmitError(null);
                        setIsDetailModalOpen(false);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black"
                    >
                      Simpan Rincian
                    </button>
                  </div>
                </div>
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


      {/* Issue SPO Number Modal - top-level, independent from form/overflow */}
      {showIssueNumberModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-sop-number-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isIssuingNumber) setShowIssueNumberModal(false);
          }}
        >
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
              <div>
                <h3 id="issue-sop-number-title" className="text-base font-black text-slate-900">
                  Terbitkan Nomor SPO
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Isi data berikut sebelum nomor resmi diterbitkan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIssueNumberModal(false)}
                disabled={isIssuingNumber}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 text-xl leading-none"
                aria-label="Tutup"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  Judul SPO <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: SPO Pelayanan Pasien Rawat Jalan"
                  autoFocus
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  Tanggal Berlaku <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  Revisi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={revisionNumber}
                  onChange={(e) => setRevisionNumber(e.target.value)}
                  placeholder="00"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowIssueNumberModal(false)}
                disabled={isIssuingNumber}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleIssueNumber}
                disabled={
                  isIssuingNumber ||
                  !title.trim() ||
                  !effectiveDate ||
                  !String(revisionNumber).trim()
                }
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black"
              >
                {isIssuingNumber ? 'Menerbitkan...' : 'Terbitkan Nomor'}
              </button>
            </div>
          </div>
        </div>
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
