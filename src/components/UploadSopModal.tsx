import React, { useRef, useState, useEffect } from 'react';
import { 
  X, 
  FilePlus, 
  Layers, 
  Building2, 
  FileText, 
  BookOpen, 
  RefreshCw, 
  ListOrdered, 
  CheckCircle2, 
  Copy, 
  Check, 
  Printer, 
  Eye, 
  Trash2,
  Lock,
  AlertTriangle,
  Info,
  Upload
} from 'lucide-react';
import { Division, SopCategory, SopDocument, NumberingConfig, SopStatus, UserSession } from '../types';
import { generateSopNumber, getNextSequenceNumber, formatBytes, standardizeSopDocument, getUsedSequencesForUnit, checkDuplicateSopNumber, isNewSopFormat, normalizeSopNumberInput, matchMasterHierarchyPattern } from '../utils/numbering';
import { saveFileToLocalCache } from '../utils/fileStorage';
import { 
  SOEGIRI_MASTER_CATEGORIES, 
  SOEGIRI_HOSPITAL_INFO,
  SoegiriCategory,
  buildSubHierarchyCode,
  getSoegiriHierarchyInfo
} from '../utils/soegiriStructure';
import { subscribeToHierarchyMaster } from '../lib/hierarchyService';
import { RichTextEditor } from './RichTextEditor';
import { HierarchyPicker } from './HierarchyPicker';
import { SopLiveTemplate } from './SopLiveTemplate';

interface UploadSopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (sop: Omit<SopDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'>) => Promise<SopDocument>;
  divisions: Division[];
  categories: SopCategory[];
  numberingConfig: NumberingConfig;
  sops?: SopDocument[];
  onViewDetail?: (sop: SopDocument) => void;
  userSession?: UserSession | null;
  onCheckReservedNumber?: (sopNumber: string) => Promise<boolean>;
}

export const UploadSopModal: React.FC<UploadSopModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  divisions,
  categories,
  numberingConfig,
  sops = [],
  onViewDetail,
  userSession,
  onCheckReservedNumber
}) => {
  const primaryAssignment = userSession?.assignments?.[0];
  const isPetugas = userSession?.role === 'petugas' && (primaryAssignment?.divisionCode || userSession?.divisionCode) !== 'ALL';
  const defaultCat = isPetugas ? (primaryAssignment?.divisionCode || userSession?.divisionCode || 'PEL') : 'PEL';
  const defaultSub = isPetugas ? (primaryAssignment?.subCode || userSession?.subCode || (defaultCat === 'PEN' ? '1' : '1')) : '1';
  const defaultInst = isPetugas ? (primaryAssignment?.instCode || userSession?.instCode || (defaultCat === 'PEN' ? '2' : '1')) : '1';
  const defaultPoli = isPetugas ? (primaryAssignment?.poliCode || userSession?.poliCode || (defaultCat === 'PEN' ? '1' : '3')) : '3';
  const defaultSubUnit = isPetugas ? (primaryAssignment?.subUnitCode || userSession?.subUnitCode || '') : '';

  // Cascading Selection State
  const [selectedCatCode, setSelectedCatCode] = useState<string>(defaultCat);
  const [selectedSubCode, setSelectedSubCode] = useState<string>(defaultSub);
  const [selectedInstCode, setSelectedInstCode] = useState<string>(defaultInst);
  const [selectedPoliCode, setSelectedPoliCode] = useState<string>(defaultPoli);
  const [selectedSubUnitCode, setSelectedSubUnitCode] = useState<string>(defaultSubUnit);
  const [selectedHierarchyOverride, setSelectedHierarchyOverride] = useState<string>(primaryAssignment?.hierarchyCode || '');

  // Core Form Fields
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<SopStatus>('DRAFT');
  const [isCurrentNumberReserved, setIsCurrentNumberReserved] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [reviewPeriodMonths, setReviewPeriodMonths] = useState(12);
  const [creatorName, setCreatorName] = useState('');
  const [approverName, setApproverName] = useState(SOEGIRI_HOSPITAL_INFO.director.name);

  // Indonesian Standard Body Fields
  const [pengertian, setPengertian] = useState('');
  const [tujuan, setTujuan] = useState('');
  const [kebijakan, setKebijakan] = useState('');
  const [alur, setAlur] = useState('');
  const [prosedur, setProsedur] = useState('');
  const [unitTerkait, setUnitTerkait] = useState('');

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | undefined>(undefined);

  // Review & Legacy Document Feature States
  const [documentType, setDocumentType] = useState<'BARU' | 'LAMA' | 'REVIEW'>('BARU');
  const [manualLegacyNumber, setManualLegacyNumber] = useState('');

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (documentType !== 'LAMA' || !manualLegacyNumber.trim() || !onCheckReservedNumber) {
        setIsCurrentNumberReserved(false);
        return;
      }
      try {
        const reserved = await onCheckReservedNumber(normalizeSopNumberInput(manualLegacyNumber));
        if (!cancelled) setIsCurrentNumberReserved(Boolean(reserved));
      } catch {
        if (!cancelled) setIsCurrentNumberReserved(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [manualLegacyNumber, documentType, onCheckReservedNumber]);
  const [oldSopNumber, setOldSopNumber] = useState('');
  const [revisionNumber, setRevisionNumber] = useState('01');
  const [adminManualSequence, setAdminManualSequence] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [selectedOldFile, setSelectedOldFile] = useState<File | null>(null);
  const [oldFileDataUrl, setOldFileDataUrl] = useState<string | undefined>(undefined);

  const [activeTab, setActiveTab] = useState<'info' | 'konten' | 'lampiran'>('info');
  const [missingSections, setMissingSections] = useState<string[]>([]);

  // Result Banner / Success Pop-Up State
  const [latestCreatedSop, setLatestCreatedSop] = useState<SopDocument | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [categoriesList, setCategoriesList] = useState<SoegiriCategory[]>(() => SOEGIRI_MASTER_CATEGORIES);

  useEffect(() => {
    return subscribeToHierarchyMaster((cats) => {
      setCategoriesList(cats);
    });
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  // Synchronous lock prevents rapid double-clicks before React re-renders.
  const submitLockRef = useRef(false);
  const [submitError, setSubmitError] = useState('');

  // Active category navigation objects
  const activeCategory = categoriesList.find((c) => c.code === selectedCatCode) || categoriesList[0];
  const availableSubKoors = activeCategory?.subs || [];
  const activeSubKoor = availableSubKoors.find((s) => s.code === selectedSubCode) || availableSubKoors[0];
  const availableInstalasis = activeSubKoor?.instalasis || [];
  const activeInstalasi = availableInstalasis.find((i) => i.code === selectedInstCode) || availableInstalasis[0];
  const availablePolis = activeInstalasi?.polis || [];
  const activePoli = availablePolis.find((p) => p.code === selectedPoliCode);
  const availableSubUnits = activePoli?.subUnits || [];

  // Cascading Handlers
  const handleCategoryChange = (catCode: string) => {
    setSelectedCatCode(catCode);
    const newCat = categoriesList.find((c) => c.code === catCode);
    const firstSub = newCat?.subs?.[0];
    const firstInst = firstSub?.instalasis?.[0];
    const firstPoli = firstInst?.polis?.[0];
    setSelectedSubCode(firstSub?.code || '');
    setSelectedInstCode(firstInst?.code || '');
    setSelectedPoliCode(firstPoli?.code || '');
    setSelectedSubUnitCode(firstPoli?.subUnits?.[0]?.code || '');
    setSelectedHierarchyOverride('');
  };

  const handleSubKoorChange = (subCode: string) => {
    setSelectedHierarchyOverride('');
    setSelectedSubCode(subCode);
    const cat = categoriesList.find((c) => c.code === selectedCatCode);
    const subObj = cat?.subs?.find((s) => s.code === subCode);
    const firstInst = subObj?.instalasis?.[0];
    const firstPoli = firstInst?.polis?.[0];
    setSelectedInstCode(firstInst?.code || '');
    setSelectedPoliCode(firstPoli?.code || '');
    setSelectedSubUnitCode(firstPoli?.subUnits?.[0]?.code || '');
  };

  const handleInstalasiChange = (instCode: string) => {
    setSelectedHierarchyOverride('');
    setSelectedInstCode(instCode);
    const cat = categoriesList.find((c) => c.code === selectedCatCode);
    const subObj = cat?.subs?.find((s) => s.code === selectedSubCode);
    const inst = subObj?.instalasis?.find((i) => i.code === instCode);
    const firstPoli = inst?.polis?.[0];
    setSelectedPoliCode(firstPoli?.code || '');
    setSelectedSubUnitCode(firstPoli?.subUnits?.[0]?.code || '');
  };

  const handlePoliChange = (pCode: string) => {
    setSelectedHierarchyOverride('');
    setSelectedPoliCode(pCode);
    const p = availablePolis.find((item) => item.code === pCode);
    setSelectedSubUnitCode(p?.subUnits?.[0]?.code || '');
  };

  // Compute hierarchy code & descriptions
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

  // Calculate Next Review Date
  const calculateNextReviewDate = () => {
    if (!effectiveDate) return '';
    const d = new Date(effectiveDate);
    d.setMonth(d.getMonth() + Number(reviewPeriodMonths));
    return d.toISOString().split('T')[0];
  };

  // File Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!title) {
        const cleanName = file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .trim();
        setTitle(cleanName);
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setFileDataUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearFile = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedFile(null);
    setFileDataUrl(undefined);
    const fileInput = document.getElementById('admin-upload-file-input') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
  };

  const handleOldFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedOldFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setOldFileDataUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearOldFile = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedOldFile(null);
    setOldFileDataUrl(undefined);
    const oldFileInput = document.getElementById('admin-upload-old-file-input') as HTMLInputElement | null;
    if (oldFileInput) oldFileInput.value = '';
  };

  const resetForm = () => {
    setTitle('');
    setPengertian('');
    setTujuan('');
    setKebijakan('');
    setProsedur('');
    setUnitTerkait('');
    handleClearFile();
    handleClearOldFile();
    setDocumentType('BARU');
    setManualLegacyNumber('');
    setOldSopNumber('');
    setRevisionNumber('01');
    setAdminManualSequence('');
    setReviewReason('');
    setActiveTab('info');
    setMissingSections([]);
    setLatestCreatedSop(null);
    setIsSuccessModalOpen(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const stripHtml = (html: string) => {
    return (html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // A rich-text section is considered filled when it contains either
  // readable text OR a valid embedded image / diagram.
  const hasRichContent = (html: string = '') => {
    if (!html || !html.trim()) return false;

    const source = html.trim();

    // Image-only content must be valid even when textContent is empty.
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError('');

    if (!title.trim()) {
      alert("Silakan isi Judul SPO terlebih dahulu.");
      return;
    }

    if (documentType === 'LAMA') {
      const cleanNum = normalizeSopNumberInput(manualLegacyNumber);
      if (!cleanNum) {
        alert("Silakan masukkan Nomor SPO Lama yang sudah ada.");
        return;
      }
      if (!selectedFile && !fileDataUrl) {
        alert("Untuk pencatatan SPO Eksisting, Anda WAJIB mengunggah Berkas Dokumen SPO Resmi yang sudah ditandatangani Direktur!");
        return;
      }

      const isNewFormat = isNewSopFormat(cleanNum);
      const dup = checkDuplicateSopNumber(sops || [], cleanNum);

      // Format baru yang belum menjadi dokumen boleh dipakai Existing hanya
      // bila nomor tersebut sudah RESERVED melalui menu Terbitkan Nomor.
      let isReservedNumber = false;
      if (isNewFormat && !dup.isDuplicate && onCheckReservedNumber) {
        isReservedNumber = await onCheckReservedNumber(cleanNum);
      }
      if (isNewFormat && !dup.isDuplicate && !isReservedNumber) {
        setSubmitError(`Nomor dengan pola penomoran baru Master Hirarki ("${cleanNum}") belum terdaftar atau belum di-reserve. Gunakan menu "Terbitkan Nomor" terlebih dahulu.`);
        alert(`Nomor dengan pola penomoran baru Master Hirarki ("${cleanNum}") belum terdaftar atau belum di-reserve.\n\nGunakan menu "Terbitkan Nomor" terlebih dahulu.`);
        return;
      }

      // Validasi aturan: Tidak boleh mereplace SPO yang sudah berstatus AKTIF
      if (dup.isDuplicate && dup.matchedDoc) {
        if (dup.matchedDoc.status === 'AKTIF') {
          setSubmitError(`Nomor SPO "${cleanNum}" sudah terdaftar dengan status AKTIF ("${dup.matchedDoc.title}"). Dokumen berstatus Aktif tidak dapat digantikan melalui alur SPO Eksisting.`);
          alert(`Nomor SPO "${cleanNum}" sudah terdaftar dengan status AKTIF ("${dup.matchedDoc.title}").\n\nSesuai aturan Rumah Sakit, dokumen berstatus Aktif TIDAK DAPAT digantikan dengan SPO Eksisting. Silakan gunakan alur "SPO Riviu" jika ingin melakukan revisi/pembaruan terhadap SPO Aktif.`);
          return;
        }
      }
    } else {
      // Wajibkan pengisian seluruh Batang Tubuh SPO untuk SPO Baru & Review (Pengertian, Tujuan, Kebijakan, Prosedur, Unit Terkait)
      // Kolom yang hanya berisi gambar/diagram tetap dianggap terisi secara sah.
      const missingList: string[] = [];
      if (!hasRichContent(pengertian)) missingList.push('PENGERTIAN');
      if (!hasRichContent(tujuan)) missingList.push('TUJUAN');
      if (!hasRichContent(kebijakan)) missingList.push('KEBIJAKAN');
      if (!hasRichContent(prosedur)) missingList.push('PROSEDUR');
      if (!hasRichContent(unitTerkait)) missingList.push('UNIT TERKAIT');

      if (missingList.length > 0) {
        setMissingSections(missingList);
        setActiveTab('konten');
        alert(
          `SPO belum dapat diterbitkan!\n\nBagian wajib berikut masih kosong (belum diisi teks maupun gambar):\n• ${missingList.join('\n• ')}\n\nSilakan lengkapi bagian tersebut dengan mengetik teks atau menyisipkan gambar/diagram/flowchart. (Bagian ALUR bersifat opsional).`
        );
        return;
      }
      setMissingSections([]);
    }

    if (documentType === 'REVIEW') {
      if (!oldSopNumber.trim()) {
        alert("Silakan isi Nomor atau Judul SPO Lama yang Diriviu terlebih dahulu.");
        return;
      }
      const reviewNumber = normalizeSopNumberInput(oldSopNumber);
      const referenced = sops.find((s) => normalizeSopNumberInput(s.sopNumber) === reviewNumber || normalizeSopNumberInput(s.legacySopNumber) === reviewNumber);
      if (!referenced) {
        alert(`SPO rujukan "${reviewNumber}" tidak ditemukan di database.`);
        return;
      }
      if (referenced.status !== 'AKTIF') {
        alert(`SPO rujukan "${reviewNumber}" harus berstatus AKTIF.`);
        return;
      }
      const pattern = matchMasterHierarchyPattern(reviewNumber);
      const selectedDiv = String(selectedCatCode || '').trim().toUpperCase();
      const selectedSub = String(subHierarchyCode || '').trim();
      if (pattern.isMatch) {
        if (String(pattern.categoryCode || '').trim().toUpperCase() !== selectedDiv || String(pattern.subHierarchyCode || '').trim() !== selectedSub) {
          alert(`Nomor SPO rujukan tidak sesuai dengan hirarki yang dipilih. Nomor: ${pattern.categoryCode}${pattern.subHierarchyCode ? ` / ${pattern.subHierarchyCode}` : ''}; pilihan: ${selectedDiv}${selectedSub ? ` / ${selectedSub}` : ''}.`);
          return;
        }
      } else if (String(referenced.divisionCode || '').trim().toUpperCase() !== selectedDiv || String(referenced.subHierarchyCode || '').trim() !== selectedSub) {
        alert('SPO format lama tidak sesuai dengan hirarki yang dipilih. Gunakan hirarki yang tersimpan pada SPO rujukan.');
        return;
      }
      if (!revisionNumber.trim()) {
        alert("Silakan isi No. Revisi Baru sebagai pedoman perubahan SPO!");
        return;
      }
      if (!selectedOldFile && !oldFileDataUrl) {
        alert("Untuk SPO Riviu, Anda WAJIB mengunggah Berkas Dokumen SPO Lama yang akan diriviu sebagai bukti dukung perubahan SPO!");
        return;
      }
    }

    // SPO Existing memakai nomor yang dimasukkan/terdeteksi; jangan menjalankan
    // generator nomor sama sekali pada jalur ini. Generator hanya untuk Baru/Riviu.
    const generated = documentType === 'LAMA'
      ? { sopNumber: '', sequenceNumber: 0 }
      : (() => {
          const autoSequence = getNextSequenceNumber(numberingConfig, selectedCatCode, subHierarchyCode, sops, effectiveDate ? effectiveDate.slice(0, 4) : undefined);
          const manualSequence = userSession?.role === 'admin' && adminManualSequence.trim()
            ? Number(adminManualSequence.trim())
            : undefined;

          if (manualSequence !== undefined && (!Number.isInteger(manualSequence) || manualSequence < 1)) {
            throw new Error('Nomor urut Admin harus berupa angka bulat minimal 1.');
          }

          if (manualSequence !== undefined) {
            const used = getUsedSequencesForUnit(sops || [], selectedCatCode, subHierarchyCode, effectiveDate ? effectiveDate.slice(0, 4) : undefined);
            if (used.has(manualSequence)) {
              throw new Error(`Nomor urut ${String(manualSequence).padStart(3, '0')} sudah digunakan pada unit/kode ini. Silakan pilih nomor lain.`);
            }
          }

          const selectedSequence = manualSequence ?? autoSequence;
          const rawGenerated = generateSopNumber({
            config: numberingConfig,
            divisionCode: selectedCatCode,
            subHierarchyCode,
            categoryCode: selectedCatCode,
            dateStr: effectiveDate,
            sequenceNum: selectedSequence
          });

          try {
            const mockDoc: SopDocument = {
              id: 'temp-preview',
              sopNumber: rawGenerated.sopNumber,
              sequenceNumber: rawGenerated.sequenceNumber,
              title: title.trim() || 'Pratinjau',
              divisionId: selectedCatCode,
              divisionCode: selectedCatCode,
              divisionName: activeCategory?.name || selectedCatCode,
              categoryId: selectedCatCode,
              categoryName: selectedCatCode,
              version: '00',
              status: 'DRAFT',
              effectiveDate,
              reviewPeriodMonths: 12,
              nextReviewDate: '',
              creatorName: '',
              approverName: '',
              summary: '',
              tags: [],
              subHierarchyCode,
              subCode: selectedSubCode,
              instalasiCode: selectedInstCode,
              poliCode: selectedPoliCode,
              subUnitCode: selectedSubUnitCode || undefined,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              revisionHistory: [],
              confidentialityLevel: 'Internal'
            };
            const std = standardizeSopDocument(mockDoc);
            return { sopNumber: std.sopNumber, sequenceNumber: std.sequenceNumber };
          } catch {
            return rawGenerated;
          }
        })();

    const finalSopNumber = documentType === 'LAMA'
      ? normalizeSopNumberInput(manualLegacyNumber)
      : (documentType === 'REVIEW' ? '' : generated.sopNumber);

    const finalSeqNum = documentType === 'LAMA' ? 0 : (documentType === 'REVIEW' ? 0 : generated.sequenceNumber);
    const nextReviewDate = calculateNextReviewDate();

    const div = (divisions || []).find((d) => d.code === selectedCatCode);
    const cat = (categories || []).find((c) => c.code === selectedCatCode) || categories?.[0];
    const effectiveYear = new Date(effectiveDate || '2026').getFullYear();

    const newSopDoc: Omit<SopDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'> = {
      sopNumber: finalSopNumber,
      sequenceNumber: finalSeqNum,
      title: title.trim(),
      divisionId: div?.id || `soegiri-${selectedCatCode.toLowerCase()}`,
      divisionCode: selectedCatCode,
      divisionName: activeCategory?.name || selectedCatCode,
      categoryId: cat?.id || 'cat-pelayanan',
      categoryName: cat?.name || 'Pelayanan Medis & Asuhan Pasien',
      version: documentType === 'REVIEW' ? (revisionNumber || '01') : '00',
      status: documentType === 'LAMA' ? 'AKTIF' : 'DRAFT',
      effectiveDate,
      reviewPeriodMonths: Number(reviewPeriodMonths),
      nextReviewDate,
      creatorName: creatorName.trim(),
      approverName: approverName.trim() || SOEGIRI_HOSPITAL_INFO.director.name,
      summary: stripHtml(pengertian) || `Standar Prosedur Operasional ${title.trim()}`,
      tags: [
        selectedCatCode.toLowerCase(),
        documentType === 'LAMA' ? `spo-${effectiveYear}` : 'spo-2026',
        'soegiri',
        ...(documentType === 'LAMA' ? ['sop-lama', 'berlaku'] : [])
      ],

      // Soegiri Specific fields
      subHierarchyCode,
      subHierarchyPath: hierarchyInfo.path,
      hierarchyDescription: hierarchyInfo.conclusion,
      subCode: selectedSubCode,
      instalasiCode: selectedInstCode,
      poliCode: selectedPoliCode,
      subUnitCode: selectedSubUnitCode || undefined,

      // Indonesian Hospital Standard Content
      pengertian: pengertian.trim(),
      tujuan: tujuan.trim(),
      kebijakan: kebijakan.trim(),
      alur: alur.trim() ? alur.trim() : undefined,
      prosedur: prosedur.trim(),
      unitTerkait: unitTerkait.trim(),
      revisionNumber: documentType === 'REVIEW' ? (revisionNumber || '01') : '00',
      halaman: '1 / 1',
      direkturNama: SOEGIRI_HOSPITAL_INFO.director.name,
      direkturNip: SOEGIRI_HOSPITAL_INFO.director.nip,
      direkturPangkat: SOEGIRI_HOSPITAL_INFO.director.rank,

      fileName: documentType === 'LAMA' ? (selectedFile?.name || 'Dokumen_SPO_Lama.pdf') : (selectedFile ? selectedFile.name : `SPO_${selectedCatCode}_${subHierarchyCode || '0'}_${finalSeqNum ? String(finalSeqNum).padStart(3, '0') : 'BARU'}.pdf`),
      fileSize: selectedFile ? selectedFile.size : 1250000,
      fileType: selectedFile ? selectedFile.type : 'application/pdf',
      fileDataUrl,
      confidentialityLevel: 'Internal',
      locationOrFolder: `SPO Eksisting ${effectiveYear} / ${activeCategory?.name || 'Sentral'}`,

      // Review & Legacy Document Fields
      jenis_spo: documentType === 'LAMA' ? 'EKSISTING' : (documentType === 'REVIEW' ? 'RIVIU' : 'BARU'),
      documentType,
      // Existing PDFs are always authoritative for preview, including when they
      // replace a Draft/new-format record and the final type is normalized to BARU.
      // Existing PDF is authoritative; this flag survives the final save so
      // SopDetailModal never falls back to the generated A4 template.
      isExistingReplacement: documentType === 'LAMA',
      isReviewDocument: documentType === 'REVIEW',
      isLegacySop: documentType === 'LAMA',
      legacySopNumber: documentType === 'LAMA' ? manualLegacyNumber.trim() : undefined,
      oldSopNumber: documentType === 'REVIEW' ? oldSopNumber.trim() : undefined,
      reviewReason: documentType === 'REVIEW' ? reviewReason.trim() : undefined,
      oldFileName: documentType === 'REVIEW' ? selectedOldFile?.name : undefined,
      oldFileSize: documentType === 'REVIEW' ? selectedOldFile?.size : undefined,
      oldFileType: documentType === 'REVIEW' ? selectedOldFile?.type : undefined,
      oldFileDataUrl: documentType === 'REVIEW' ? oldFileDataUrl : undefined,
      signedScanFileName: documentType === 'LAMA' ? (selectedFile?.name || 'Dokumen_SPO_Lama.pdf') : undefined,
      signedScanFileSize: documentType === 'LAMA' ? selectedFile?.size : undefined,
      signedScanFileType: documentType === 'LAMA' ? selectedFile?.type || 'application/pdf' : undefined,
      signedScanDataUrl: documentType === 'LAMA' ? fileDataUrl : undefined,
    };

    // Hard marker: Existing submissions may consume only an existing Draft/issued number.
    // This marker prevents the parent from ever treating the submission as a new-number flow.
    if (documentType === 'LAMA') {
      (newSopDoc as any).numberReservationPurpose = 'EXISTING_REPLACE_ONLY';
    }

    const newGeneratedId = `sop-${Date.now()}`;
    if (fileDataUrl) {
      saveFileToLocalCache(newGeneratedId, 'file', fileDataUrl);
      saveFileToLocalCache(newGeneratedId, 'signedScan', fileDataUrl);
    }
    if (documentType === 'REVIEW' && oldFileDataUrl) {
      saveFileToLocalCache(newGeneratedId, 'oldFile', oldFileDataUrl);
    }

    // Lock synchronously immediately before the authoritative save.
    // This prevents two rapid clicks from creating two different SOP IDs.
    if (isSubmitting || submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    let savedSop: SopDocument;
    try {
      savedSop = await onSubmit(newSopDoc);
    } catch (err) {
      console.error('Gagal mendaftarkan SPO:', err);
      setSubmitError('Dokumen belum berhasil disimpan ke server. Periksa koneksi dan coba lagi. Nomor belum dianggap terdaftar sampai proses ini berhasil.');
      setIsSubmitting(false);
      submitLockRef.current = false;
      return;
    }
    setIsSubmitting(false);
    submitLockRef.current = false;

    const fullSop: SopDocument = savedSop || {
      ...newSopDoc,
      id: newGeneratedId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revisionHistory: []
    };

    if (fullSop && fullSop.id !== newGeneratedId) {
      if (fileDataUrl) {
        saveFileToLocalCache(fullSop.id, 'file', fileDataUrl);
        saveFileToLocalCache(fullSop.id, 'signedScan', fileDataUrl);
      }
      if (oldFileDataUrl || (documentType === 'LAMA' && fileDataUrl)) {
        saveFileToLocalCache(fullSop.id, 'oldFile', (oldFileDataUrl || fileDataUrl)!);
      }
    }

    // Show success popup
    setLatestCreatedSop(fullSop);
    setIsSuccessModalOpen(true);
  };

  const handleCopyNewNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const previewSopNumber = (() => {
    if (documentType === 'LAMA') return manualLegacyNumber || 'Belum diisi';
    if (userSession?.role === 'admin' && adminManualSequence.trim()) {
      const n = Number(adminManualSequence.trim());
      if (Number.isInteger(n) && n > 0) {
        return generateSopNumber({
          config: numberingConfig,
          divisionCode: selectedCatCode,
          subHierarchyCode,
          categoryCode: selectedCatCode,
          dateStr: effectiveDate,
          sequenceNum: n
        }).sopNumber;
      }
    }
    return '[Nomor Akan Terbit Otomatis]';
  })();

  return (
    <>
      {/* Success dialog: intentionally light and concise. */}
      {isSuccessModalOpen && latestCreatedSop && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-6 sm:p-7">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 shrink-0 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">Pendaftaran berhasil</div>
                  <h2 className="mt-1 text-xl font-extrabold text-slate-900">Nomor SPO berhasil didaftarkan</h2>
                  <p className="mt-1 text-sm text-slate-500">Data sudah tersimpan dan nomor ini resmi tercatat di register.</p>
                </div>
                <button type="button" onClick={handleClose} className="ml-auto p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Tutup"><X className="w-5 h-5" /></button>
              </div>

              <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Nomor SPO resmi</div>
                <div className="mt-1 text-xl sm:text-2xl font-black font-mono tracking-wide text-slate-900 break-all">{latestCreatedSop.sopNumber}</div>
                <div className="mt-2 text-sm font-semibold text-slate-700 truncate">{latestCreatedSop.title}</div>
              </div>

              {latestCreatedSop.status === 'DRAFT' && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Nomor sudah resmi terdaftar. Dokumen masih <strong>BELUM AKTIF</strong> sampai proses pengesahan/tanda tangan Direktur selesai.
                </div>
              )}

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">

                {onViewDetail && <button type="button" onClick={() => { setIsSuccessModalOpen(false); onClose(); onViewDetail(latestCreatedSop); }} className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold flex items-center justify-center gap-2"><Eye className="w-4 h-4" /> Buka SPO</button>}
                <button type="button" onClick={handleClose} className="sm:col-span-2 py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold">Selesai</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSubmitting && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full border-4 border-emerald-100 border-t-emerald-600 animate-spin" />
            <div className="mt-4 text-base font-extrabold text-slate-900">Mendaftarkan SPO…</div>
            <p className="mt-1 text-sm text-slate-500">Nomor sedang dicatat ke register. Jangan tutup halaman.</p>
          </div>
        </div>
      )}
      {submitError && !isSubmitting && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{submitError}</div>
      )}

      {/* MAIN FORM MODAL */}
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
        <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
          
          {/* Header Modal */}
          <div className="bg-white text-slate-900 p-5 sm:px-6 flex items-center justify-between border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
                <FilePlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Input SPO
                </h2>
                <p className="text-xs text-slate-500">
                  Lengkapi dokumen sesuai format SPO RSUD Dr. Soegiri.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab navigasi: hanya tampilkan tab naskah & lampiran jika BUKAN SPO Eksisting */}
          {documentType !== 'LAMA' && (
            <div className="flex border-b border-slate-200 bg-slate-50/50 px-3 sm:px-6 pt-2 shrink-0 overflow-x-auto no-scrollbar touch-pan-x">
              <button type="button" onClick={() => setActiveTab('info')} className={`px-3 sm:px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap touch-manipulation ${activeTab === 'info' ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>Informasi Dokumen</button>
              <button type="button" onClick={() => setActiveTab('konten')} className={`px-3 sm:px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap touch-manipulation ${activeTab === 'konten' ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                <span>Isi Standar SPO (Batang Tubuh)</span>
                {missingSections.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                    !
                  </span>
                )}
              </button>
              <button type="button" onClick={() => setActiveTab('lampiran')} className={`px-3 sm:px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap touch-manipulation ${activeTab === 'lampiran' ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>Lampiran & Review</button>
            </div>
          )}

          {/* Form Scrollable Area */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
            {(activeTab === 'info' || documentType === 'LAMA') && (
              <div className="space-y-6">
            
            {/* 1. Klasifikasi Hierarki RSUD Dr. Soegiri */}
            <div className="bg-slate-50 rounded-xl p-4 sm:p-5 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>1. Pilih Klasifikasi Unit Kerja / Hierarki SPO</span>
                </h3>
                <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200 font-mono">
                  Format: {subHierarchyCode ? `${selectedCatCode} / ${subHierarchyCode}` : selectedCatCode}
                </span>
              </div>

              <div>
                <HierarchyPicker
                  value={{ divisionCode: selectedCatCode, hierarchyCode: selectedHierarchyOverride, hierarchyPath: hierarchyInfo.path }}
                  onChange={(v) => {
                    setSelectedCatCode(v.divisionCode);
                    setSelectedHierarchyOverride(v.hierarchyCode);
                    const parts = v.hierarchyCode.split('.').filter(Boolean);
                    setSelectedSubCode(parts[0] || ''); setSelectedInstCode(parts[1] || ''); setSelectedPoliCode(parts[2] || ''); setSelectedSubUnitCode(parts[3] || '');
                  }}
                  allowedDivisionCodes={isPetugas ? [defaultCat] : undefined}
                  allowedHierarchyCodes={isPetugas && primaryAssignment?.hierarchyCode ? { [defaultCat]: primaryAssignment.hierarchyCode } : undefined}
                  disabled={false}
                  label="Pilih Unit Kerja / Hirarki"
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 flex items-center justify-between">
                <div className="truncate">
                  <span className="font-semibold text-slate-700">Jalur Hirarki:</span> {hierarchyInfo.path?.length ? hierarchyInfo.path.join(' → ') : 'Semua hirarki'}
                </div>
                <span className="font-mono font-bold text-indigo-700 shrink-0 ml-2">{selectedCatCode}{subHierarchyCode ? ` / ${subHierarchyCode}` : ''}</span>
              </div>
            </div>

            {/* 2. Informasi Utama SPO */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>2. Informasi Dokumen SPO</span>
                </span>
                {documentType === 'REVIEW' && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 text-amber-700 animate-spin-slow" />
                    Mode Dokumen Review
                  </span>
                )}
                {documentType === 'LAMA' && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-purple-700" />
                    Mode SPO Eksisting
                  </span>
                )}
              </h3>

              {/* TIPE DOKUMEN SELECTOR */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Jenis Penginputan SPO <span className="text-rose-500">*</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setDocumentType('BARU');
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                      documentType === 'BARU'
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm ring-2 ring-indigo-400'
                        : 'bg-white text-slate-800 border-slate-300 hover:border-indigo-300'
                    }`}
                  >
                    <FileText className={`w-5 h-5 shrink-0 mt-0.5 ${documentType === 'BARU' ? 'text-white' : 'text-indigo-600'}`} />
                    <div>
                      <div className="text-xs font-bold">1. SPO Baru (2026)</div>
                      <div className={`text-[11px] mt-0.5 leading-snug ${documentType === 'BARU' ? 'text-indigo-100' : 'text-slate-500'}`}>
                        Penerbitan dokumen standar prosedur baru 2026
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDocumentType('LAMA');
                      if (!effectiveDate || new Date(effectiveDate).getFullYear() >= 2026) {
                        setEffectiveDate('2024-01-02');
                      }
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                      documentType === 'LAMA'
                        ? 'bg-purple-600 text-white border-purple-700 shadow-sm ring-2 ring-purple-400'
                        : 'bg-white text-slate-800 border-slate-300 hover:border-purple-300'
                    }`}
                  >
                    <BookOpen className={`w-5 h-5 shrink-0 mt-0.5 ${documentType === 'LAMA' ? 'text-white' : 'text-purple-600'}`} />
                    <div>
                      <div className="text-xs font-bold">2. SPO Eksisting</div>
                      <div className={`text-[11px] mt-0.5 leading-snug ${documentType === 'LAMA' ? 'text-purple-100' : 'text-slate-500'}`}>
                        Input SPO terbitan sebelum 2026 yang masih berlaku
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDocumentType('REVIEW');
                      if (!revisionNumber || revisionNumber === '00') setRevisionNumber('01');
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                      documentType === 'REVIEW'
                        ? 'bg-amber-600 text-white border-amber-700 shadow-sm ring-2 ring-amber-400'
                        : 'bg-white text-slate-800 border-slate-300 hover:border-amber-300'
                    }`}
                  >
                    <RefreshCw className={`w-5 h-5 shrink-0 mt-0.5 ${documentType === 'REVIEW' ? 'text-white' : 'text-amber-600'}`} />
                    <div>
                      <div className="text-xs font-bold">3. SPO Riviu</div>
                      <div className={`text-[11px] mt-0.5 leading-snug ${documentType === 'REVIEW' ? 'text-amber-100' : 'text-slate-500'}`}>
                        Pembaruan SPO berdasarkan regulasi/SK baru
                      </div>
                    </div>
                  </button>
                </div>

                {/* Input Detail SPO Lama jika mode LAMA */}
                {documentType === 'LAMA' && (
                  <div className="mt-3 pt-3 border-t border-purple-200 space-y-4 bg-purple-50/90 p-4 rounded-xl border border-purple-300">
                    <div className="flex items-center gap-2 text-xs font-bold text-purple-950">
                      <BookOpen className="w-4 h-4 text-purple-700" />
                      <span>Form Pengunggahan & Penggantian (Replace) SPO Eksisting</span>
                    </div>

                    <p className="text-xs text-purple-900 leading-relaxed">
                      Cukup masukkan <strong>Nomor SPO</strong> yang sudah ada dan <strong>Unggah File PDF Resmi</strong> yang sudah bertandatangan Direktur. Dokumen di Library dengan nomor yang sama akan otomatis digantikan (replace) dan diaktifkan.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-purple-200">
                      <div className="md:col-span-2 space-y-1">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <label className="block text-xs font-bold text-purple-950">
                            Nomor SPO Eksisting / Lama <span className="text-rose-500">*</span>
                          </label>
                          <span className="text-[10px] font-semibold text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-md">
                            Input Nomor Asli
                          </span>
                        </div>
                        <input
                          type="text"
                          required={documentType === 'LAMA'}
                          value={manualLegacyNumber}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setManualLegacyNumber(val);
                            const clean = normalizeSopNumberInput(val);
                            if (clean) {
                              const dup = checkDuplicateSopNumber(sops || [], clean);
                              if (dup.isDuplicate && dup.matchedDoc) {
                                if (!title.trim() && dup.matchedDoc.title) {
                                  setTitle(dup.matchedDoc.title);
                                }
                                if (dup.matchedDoc.effectiveDate) {
                                  setEffectiveDate(dup.matchedDoc.effectiveDate);
                                }
                              }
                            }
                          }}
                          onBlur={() => {
                            if (manualLegacyNumber.trim()) {
                              setManualLegacyNumber(normalizeSopNumberInput(manualLegacyNumber));
                            }
                          }}
                          placeholder="Contoh: SOEGIRI / 398 / 2025 atau 440/102/SPO/PEL/2023"
                          className="w-full text-xs sm:text-sm border border-purple-300 rounded-xl px-3.5 py-2 text-slate-900 bg-white font-mono font-bold focus:ring-2 focus:ring-purple-500 shadow-2xs"
                        />

                        {manualLegacyNumber.trim() && (() => {
                          const normalized = normalizeSopNumberInput(manualLegacyNumber);
                          const patternMatch = matchMasterHierarchyPattern(normalized);
                          const isNewFormat = patternMatch.isMatch;
                          const dup = checkDuplicateSopNumber(sops || [], normalized);

                          return (
                            <div className="mt-2 space-y-1.5">
                              {/* Preview Normalisasi Standar */}
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

                              {dup.isDuplicate && dup.matchedDoc ? (
                                (() => {
                                  const status = dup.matchedDoc.status;
                                  const statusLabel =
                                    status === 'DRAFT' ? 'Draft'
                                      : status === 'AKTIF' ? 'Aktif'
                                      : status === 'DIARSIPKAN' ? 'Diarsipkan'
                                      : status || 'Draft';

                                  if (status === 'AKTIF') {
                                    return (
                                      <div className="p-2 rounded-lg bg-rose-100/90 border border-rose-300 text-rose-900 text-[11px] font-medium flex items-center gap-1.5">
                                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                        <span>
                                          <strong>Ditolak:</strong> Nomor sudah terdaftar dengan status <strong>Aktif</strong> ({dup.matchedDoc.title}). Dokumen aktif tidak dapat diganti via SPO Eksisting. Silakan gunakan alur "SPO Riviu".
                                        </span>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div className="p-2 rounded-lg bg-emerald-100/90 border border-emerald-300 text-emerald-950 text-[11px] font-medium flex items-center gap-1.5">
                                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                                      <span>
                                        <strong>Boleh Replace:</strong> Ditemukan dokumen terdaftar berstatus <strong>{statusLabel}</strong> ({dup.matchedDoc.title}). Unggahan ini akan mengaktifkan dokumen tersebut.
                                      </span>
                                    </div>
                                  );
                                })()
                              ) : isCurrentNumberReserved ? (
                                <div className="p-2 rounded-lg bg-emerald-100/90 border border-emerald-300 text-emerald-950 text-[11px] font-medium flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                                  <span><strong>Nomor Terbit Ditemukan:</strong> Nomor ini sudah diterbitkan dan dapat digunakan untuk SPO Existing → Replace Draft. Sistem tidak akan membuat nomor baru.</span>
                                </div>
                              ) : isNewFormat ? (
                                <div className="p-2 rounded-lg bg-rose-100/90 border border-rose-300 text-rose-900 text-[11px] font-medium flex items-center gap-1.5">
                                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                  <span>
                                    <strong>Pola Master Hirarki Belum Terdaftar:</strong> Nomor sesuai pola penomoran Master Hirarki ({patternMatch.hierarchyName || patternMatch.categoryName || patternMatch.categoryCode}) wajib diterbitkan melalui menu "Terbitkan Nomor" terlebih dahulu.
                                  </span>
                                </div>
                              ) : (
                                <div className="p-2 rounded-lg bg-sky-100/90 border border-sky-300 text-sky-950 text-[11px] font-medium flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4 text-sky-700 shrink-0" />
                                  <span>
                                    <strong>Nomor Format Eksisting Siap Diregistrasi:</strong> Nomor ini akan otomatis didaftarkan sebagai SPO Eksisting Aktif di sistem.
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-purple-950">
                          No. Revisi Dokumen <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required={documentType === 'LAMA'}
                          value={revisionNumber}
                          onChange={(e) => setRevisionNumber(e.target.value)}
                          placeholder="Contoh: 00 atau 01"
                          className="w-full text-xs sm:text-sm border border-purple-300 rounded-xl px-3.5 py-2 text-slate-900 bg-white font-mono font-bold focus:ring-2 focus:ring-purple-500 shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Upload File PDF Resmi langsung di dalam Card SPO Eksisting */}
                    <div className="p-3.5 rounded-xl border-2 border-dashed border-purple-300 bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                          <Upload className="w-4 h-4 text-purple-700" />
                          Upload Berkas PDF SPO Resmi (Sudah Bertanda Tangan) <span className="text-rose-500">*</span>
                        </span>
                        {selectedFile && (
                          <button
                            type="button"
                            onClick={handleClearFile}
                            className="px-2 py-0.5 text-[10px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 rounded transition-colors flex items-center gap-1 cursor-pointer"
                            title="Hapus Berkas"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Hapus Berkas</span>
                          </button>
                        )}
                      </div>

                      <input
                        id="admin-upload-file-input"
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handleFileChange}
                        className="text-xs text-slate-700 w-full file:mr-3 file:py-1.5 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer shadow-2xs"
                      />

                      {selectedFile ? (
                        <div className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 truncate">
                          ✓ {selectedFile.name} ({formatBytes(selectedFile.size)})
                        </div>
                      ) : (
                        <p className="text-[11px] text-purple-900 font-medium">
                          * Unggah pindaian/scan dokumen PDF resmi yang sudah bertanda tangan Direktur RSUD Dr. Soegiri untuk menggantikan dokumen di Library.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Input Detail SPO Review jika mode REVIEW */}
                {documentType === 'REVIEW' && (
                  <div className="mt-3 pt-3 border-t border-amber-200 space-y-3 bg-amber-50/90 p-3.5 rounded-xl border border-amber-300">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                      <RefreshCw className="w-4 h-4 text-amber-700" />
                      <span>Detail Rujukan Dokumen SPO Lama yang Direview & Pedoman Revisi</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-amber-950 mb-1">
                          Nomor / Judul SPO Lama yang Direview <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required={documentType === 'REVIEW'}
                          value={oldSopNumber}
                          onChange={(e) => setOldSopNumber(e.target.value)}
                          placeholder="Contoh: PEL / 1.1.3 / 015 / 2023 - SPO Pelayanan Rekam Jantung EKG"
                          className="w-full text-xs sm:text-sm border border-amber-300 rounded-xl px-3.5 py-2 text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-amber-950 mb-1">
                          No. Revisi <span className="text-rose-500">*</span>
                          <span className="text-[10px] text-amber-800 font-normal ml-1">(Pedoman Perubahan)</span>
                        </label>
                        <input
                          type="text"
                          required={documentType === 'REVIEW'}
                          value={revisionNumber}
                          onChange={(e) => setRevisionNumber(e.target.value)}
                          placeholder="Contoh: 01"
                          className="w-full text-xs sm:text-sm border border-amber-300 rounded-xl px-3.5 py-2 text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-amber-950 mb-1">
                        Dasar Kebijakan / Alasan Review
                      </label>
                      <textarea
                        rows={2}
                        value={reviewReason}
                        onChange={(e) => setReviewReason(e.target.value)}
                        placeholder="Contoh: Perbaruan Regulasi Berdasarkan SK Direktur RSUD Dr. Soegiri & Permenkes Terbaru 2026"
                        className="w-full text-xs sm:text-sm border border-amber-300 rounded-xl p-2.5 text-slate-900 bg-white focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Judul Standar Prosedur Operasional (SPO) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Tata Cara Penerimaan Pasien Baru Rawat Jalan Poliklinik Jantung"
                  className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:ring-2 focus:ring-indigo-500 font-medium whitespace-normal [word-break:normal] [overflow-wrap:break-word] [hyphens:none] resize-y shadow-2xs"
                />
              </div>

              {userSession?.role === 'admin' && documentType !== 'LAMA' && (
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Urut Dokumen (opsional)</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={adminManualSequence}
                      onChange={(e) => setAdminManualSequence(e.target.value)}
                      placeholder="Kosongkan untuk otomatis"
                      className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Admin dapat mengoreksi nomor urut. Nomor yang sudah dipakai tidak dapat digunakan ulang.</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600">
                    {previewSopNumber === '[Nomor Akan Terbit Otomatis]' ? 'Nomor dibuat otomatis dari daftar SPO aktif.' : <>Preview: <strong className="font-mono text-slate-900">{previewSopNumber}</strong></>}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Efektif/Berlaku
                  </label>
                  <input
                    type="date"
                    required
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status Dokumen Awal
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as SopStatus)}
                    className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="DRAFT">Draft</option>

                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Penyusun / Unit Kerja
                  </label>
                  <input
                    type="text"
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    placeholder="Nama Penyusun / Tim"
                    className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Penandatangan (Direktur)
                  </label>
                  <input
                    type="text"
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

              </div>
            )}

            {/* 3. Isi Standar Naskah SPO — template live yang sama dengan Edit/Revisi */}
            {activeTab === 'konten' && documentType !== 'LAMA' && (
              <SopLiveTemplate
                title={title}
                onTitleChange={setTitle}
                sopNumber={previewSopNumber}
                version={documentType === 'REVIEW' ? (revisionNumber || '01') : '00'}
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
                missingSections={missingSections}
              />
            )}

            {activeTab === 'lampiran' && (
              <div className="space-y-4">
            {/* 4. File Upload Attachment - Khusus Mode SPO Eksisting atau SPO Riviu */}
            {(documentType === 'REVIEW' || documentType === 'LAMA') && (
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                  <span>{documentType === 'LAMA' ? '3. Unggah Dokumen Resmi SPO Eksisting (Sudah Ditandatangani Direktur)' : '4. Lampiran Bukti Dukung SPO Lama (PDF / DOCX)'}</span>
                  {documentType === 'REVIEW' ? (
                    <span className="text-[11px] font-bold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                      Wajib Unggah SPO Lama Sebagai Bukti Dukung *
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-purple-900 bg-purple-100 px-2.5 py-0.5 rounded-full border border-purple-300">
                      Wajib Unggah Berkas Asli SPO *
                    </span>
                  )}
                </label>

                {documentType === 'REVIEW' ? (
                  /* UPLOAD MODE FOR SPO RIVIU: ONLY OLD SPO AS SUPPORTING PROOF */
                  <div className="p-4 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-amber-700" />
                        Berkas SPO Lama Yang Diriviu (Bukti Dukung Perubahan SPO) <span className="text-rose-500">*</span>
                      </span>
                      {selectedOldFile && (
                        <button
                          type="button"
                          onClick={handleClearOldFile}
                          className="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          title="Hapus Berkas"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus Berkas</span>
                        </button>
                      )}
                    </div>
                    <input
                      id="admin-upload-old-file-input"
                      type="file"
                      accept=".pdf,.doc,.docx,image/*"
                      onChange={handleOldFileChange}
                      className="text-xs text-slate-700 w-full file:mr-3 file:py-1.5 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white hover:file:bg-amber-700 cursor-pointer shadow-2xs"
                    />
                    {selectedOldFile ? (
                      <div className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 truncate">
                        ✓ {selectedOldFile.name} ({formatBytes(selectedOldFile.size)})
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-900 leading-relaxed">
                        * Unggah salinan/pindaian berkas naskah SPO lama yang diriviu sebagai bukti dukung perubahan tata naskah SPO RSUD Dr. Soegiri.
                      </p>
                    )}
                  </div>
                ) : (
                  /* SINGLE UPLOAD MODE (LAMA) */
                  <div className="p-4 rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-purple-600" />
                        Pilih Berkas SPO Resmi Yang Sudah Bertanda Tangan Direktur (PDF / DOCX / Gambar) <span className="text-rose-500">*</span>
                      </span>
                      {selectedFile && (
                        <button
                          type="button"
                          onClick={handleClearFile}
                          className="px-2 py-0.5 text-[10px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 rounded transition-colors flex items-center gap-1 cursor-pointer"
                          title="Clear / Hapus Berkas"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Hapus Berkas</span>
                        </button>
                      )}
                    </div>

                    <input
                      id="admin-upload-file-input"
                      type="file"
                      accept=".pdf,.doc,.docx,image/*"
                      onChange={handleFileChange}
                      className="text-xs text-slate-700 w-full file:mr-3 file:py-1.5 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
                    />

                    {selectedFile ? (
                      <div className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 truncate">
                        ✓ {selectedFile.name} ({formatBytes(selectedFile.size)})
                      </div>
                    ) : (
                      <p className="text-[11px] text-purple-900 font-medium">
                        * Unggah pindaian/scan dokumen SPO lama resmi yang sudah bertanda tangan Direktur RSUD Dr. Soegiri untuk langsung dipratinjau dan diunduh di sistem.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

              </div>
            )}

            {/* Bottom Actions inside form */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-xl border border-slate-300 transition-colors cursor-pointer"
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-indigo-200 cursor-pointer"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{isSubmitting ? 'Mendaftarkan…' : 'Daftarkan & Terbitkan Nomor SPO'}</span>
              </button>
            </div>

          </form>

        </div>
      </div>
    </>
  );
};
