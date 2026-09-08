import React, { useState, useEffect } from 'react';
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
  ArrowRight,
  ArrowLeft,
  Layers,
  Check,
  Clock
} from 'lucide-react';

import {
  SopDocument,
  SopCategory,
  Division,
  SopStatus,
  RevisionLog,
  UserSession
} from '../types';

import { SopLiveTemplate } from './SopLiveTemplate';
import {
  standardizeSopDocument,
  checkDuplicateSopNumber,
  getNextSequenceNumber,
  getPaddedNumber,
  parseSopNumber
} from '../utils/numbering';
import { SOEGIRI_HOSPITAL_INFO, SOEGIRI_MASTER_CATEGORIES } from '../utils/soegiriStructure';
import { HierarchyPicker } from './HierarchyPicker';

export interface EditSopModalProps {
  isOpen: boolean;
  sop: SopDocument | null;
  onClose: () => void;
  onSubmit: (updatedSop: SopDocument) => void;
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
  if (!sop) return null;

  const isAdmin = !userSession || userSession.role === 'admin';
  const isExisting = Boolean(sop.documentType === 'LAMA' || sop.jenis_spo === 'EKSISTING' || sop.isLegacySop);

  const [activeTab, setActiveTab] = useState<'info' | 'konten' | 'revisi'>('info');
  const [validationMessage, setValidationMessage] = useState<string[]>([]);

  // =========================================================
  // INFORMASI DOKUMEN
  // =========================================================
  const [title, setTitle] = useState(sop.title || '');
  const [version, setVersion] = useState(sop.revisionNumber || sop.version || '00');
  const [status, setStatus] = useState<SopStatus>(sop.status || 'AKTIF');
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
    setStatus(sop.status || 'AKTIF');
    setEffectiveDate(sop.effectiveDate || '');
    setReviewPeriodMonths(sop.reviewPeriodMonths || 36);
    setCreatorName(sop.creatorName || userSession?.name || '');
    setApproverName(sop.approverName || '');
    setSummary(sop.summary || '');
    setTags(sop.tags || []);
    setConfidentialityLevel(sop.confidentialityLevel || 'Internal');
    setLocationOrFolder(sop.locationOrFolder || '');
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
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setActiveTab('info');
      setValidationMessage(['Judul SPO wajib diisi.']);
      return;
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
      status: isExisting
        ? status === 'DIARSIPKAN'
          ? 'DIARSIPKAN'
          : 'AKTIF'
        : isAdmin
        ? status
        : sop.status || 'DRAFT',
      effectiveDate,
      reviewPeriodMonths: Number(reviewPeriodMonths) || 36,
      nextReviewDate: nextReview,
      creatorName: creatorName.trim(),
      approverName: approverName.trim(),
      summary: summary.trim() || stripHtml(normalizedPengertian),
      tags,
      confidentialityLevel,
      locationOrFolder: locationOrFolder.trim(),
      pengertian: normalizedPengertian,
      tujuan: normalizedTujuan,
      kebijakan: normalizedKebijakan,
      prosedur: normalizedProsedur,
      alur: normalizedAlur || undefined,
      unitTerkait: normalizedUnitTerkait,
      revisionHistory: updatedHistory,
      updatedAt: new Date().toISOString()
    };

    onSubmit(updated);
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
              
              {/* Card 1: Identitas & Registrasi Nomor SPO */}
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

                {/* Grid Baris: Revisi, Status, Kerahasiaan */}
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
                    {isExisting ? (
                      <div className="w-full text-xs font-bold border border-emerald-200 rounded-xl px-3 py-2 bg-emerald-50 text-emerald-800">
                        {status === 'DIARSIPKAN' ? 'DIARSIPKAN' : 'AKTIF — SPO EKSISTING'}
                      </div>
                    ) : isAdmin ? (
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as SopStatus)}
                        className="w-full text-xs font-bold border border-slate-300 rounded-xl px-3 py-2 text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                      >
                        <option value="DRAFT">DRAFT</option>
                        <option value="AKTIF">AKTIF (Berlaku)</option>
                        <option value="DIARSIPKAN">DIARSIPKAN</option>
                      </select>
                    ) : (
                      <div className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-100 text-slate-700">
                        {sop.status || 'DRAFT'}
                      </div>
                    )}
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

                {/* Lokasi Fisik Arsip */}
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
              </div>
            </div>
          )}

          {/* =============================================== */}
          {/* TAB 2: BATANG TUBUH SPO (ISI NASKAH)             */}
          {/* =============================================== */}
          {activeTab === 'konten' && !isExisting && (
            <div className="space-y-3">
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
          {/* MODAL STICKY FOOTER                             */}
          {/* =============================================== */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/40">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {activeTab === 'info' && !isExisting && (
                <button
                  type="button"
                  onClick={() => setActiveTab('konten')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-xl transition-colors cursor-pointer border border-teal-200"
                >
                  <span>Batang Tubuh SPO</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              {activeTab === 'konten' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('info')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Kembali ke Info</span>
                </button>
              )}
            </div>

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
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};

export const EditSopModal: React.FC<EditSopModalProps> = (props) => {
  if (!props.isOpen || !props.sop) return null;
  return <EditSopModalContent {...props} />;
};
