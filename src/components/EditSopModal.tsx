import React, { useState, useEffect } from 'react';
import {
  X,
  Edit3,
  CheckCircle2,
  History,
  Tag,
  Calendar,
  Building2,
  AlertCircle,
  BookOpen,
  FileCheck2,
  Wand2,
  Hash
} from 'lucide-react';

import {
  SopDocument,
  SopCategory,
  Division,
  SopStatus,
  RevisionLog,
  UserSession
} from '../types';

import { RichTextEditor } from './RichTextEditor';
import { SopLiveTemplate } from './SopLiveTemplate';
import { HospitalLogo } from './HospitalLogo';
import {
  standardizeSopDocument,
  checkDuplicateSopNumber,
  getNextSequenceNumber,
  getPaddedNumber,
  parseSopNumber
} from '../utils/numbering';
import { SOEGIRI_HOSPITAL_INFO, SOEGIRI_MASTER_CATEGORIES } from '../utils/soegiriStructure';
import { HierarchyPicker } from './HierarchyPicker';

interface EditSopModalProps {
  isOpen: boolean;
  sop: SopDocument | null;
  onClose: () => void;
  onSubmit: (updatedSop: SopDocument) => void;
  divisions: Division[];
  categories: SopCategory[];
  userSession?: UserSession | null;
  sops?: SopDocument[];
}

export const EditSopModal: React.FC<EditSopModalProps> = ({
  isOpen,
  sop,
  onClose,
  onSubmit,
  divisions,
  categories,
  userSession,
  sops = []
}) => {
  if (!isOpen || !sop) return null;

  const isAdmin = !userSession || userSession.role === 'admin';
  const isExisting = Boolean(sop && (sop.documentType === 'LAMA' || sop.jenis_spo === 'EKSISTING' || sop.isLegacySop));

  const [activeTab, setActiveTab] =
    useState<'info' | 'konten' | 'revisi'>('info');
  const [validationMessage, setValidationMessage] = useState<string[]>([]);

  // =========================================================
  // INFORMASI DOKUMEN
  // =========================================================

  const [title, setTitle] = useState(sop.title || '');

  const [version, setVersion] = useState(
    sop.revisionNumber || sop.version || '00'
  );

  const [status, setStatus] = useState<SopStatus>(
    sop.status || 'AKTIF'
  );

  const [effectiveDate, setEffectiveDate] = useState(
    sop.effectiveDate || ''
  );

  const [reviewPeriodMonths, setReviewPeriodMonths] =
    useState(sop.reviewPeriodMonths || 36);

  const [creatorName, setCreatorName] = useState(
    sop.creatorName || ''
  );

  const [approverName, setApproverName] = useState(
    sop.approverName || ''
  );

  const [summary, setSummary] = useState(
    sop.summary || ''
  );

  const [tagInput, setTagInput] = useState('');

  const [tags, setTags] = useState<string[]>(
    sop.tags || []
  );

  const [confidentialityLevel, setConfidentialityLevel] =
    useState<'Publik' | 'Internal' | 'Rahasia'>(
      sop.confidentialityLevel || 'Internal'
    );

  const [locationOrFolder, setLocationOrFolder] =
    useState(sop.locationOrFolder || '');

  // =========================================================
  // BATANG TUBUH SPO
  //
  // 1. PENGERTIAN
  // 2. TUJUAN
  // 3. KEBIJAKAN
  // 4. PROSEDUR
  // 5. UNIT TERKAIT
  //
  // ALUR = BAGIAN TAMBAHAN / OPSIONAL
  // =========================================================

  const [pengertian, setPengertian] = useState(
    sop.pengertian || sop.summary || ''
  );

  const [tujuan, setTujuan] = useState(
    sop.tujuan || ''
  );

  const [kebijakan, setKebijakan] = useState(
    sop.kebijakan ||
      'SK Direktur RSUD Dr. Soegiri Lamongan Nomor 188/SPO/DIR/2026'
  );

  const [prosedur, setProsedur] = useState(
    sop.prosedur || ''
  );

  const [alur, setAlur] = useState(
    sop.alur || ''
  );

  const [unitTerkait, setUnitTerkait] = useState(
    sop.unitTerkait ||
      (
        sop.divisionName
          ? `${sop.divisionName}${
              sop.categoryName
                ? `, ${sop.categoryName}`
                : ''
            }`
          : ''
      )
  );

  // =========================================================
  // NOMOR SPO & UNIT
  // =========================================================

  const [divisionId, setDivisionId] = useState(sop.divisionId || '');
  const [divisionCode, setDivisionCode] = useState(sop.divisionCode || '');
  const [divisionName, setDivisionName] = useState(sop.divisionName || '');
  const [categoryId, setCategoryId] = useState(sop.categoryId || '');
  const [categoryName, setCategoryName] = useState(sop.categoryName || '');

  const [sopNumber, setSopNumber] = useState(
    sop.sopNumber || ''
  );

  const [subHierarchyCode, setSubHierarchyCode] =
    useState(sop.subHierarchyCode || '');
  const [hierarchyPath, setHierarchyPath] = useState<string[]>(sop.subHierarchyPath || []);

  // =========================================================
  // LOG REVISI
  // =========================================================

  const [addRevisionLog, setAddRevisionLog] =
    useState(false);

  const [revisionNotes, setRevisionNotes] =
    useState('');

  const [revisionAuthor, setRevisionAuthor] =
    useState(sop.creatorName || '');

  // =========================================================
  // SINKRONISASI DATA SAAT DOKUMEN BERUBAH
  // =========================================================

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

    setSubHierarchyCode(
      sop.subHierarchyCode || ''
    );
    setHierarchyPath(sop.subHierarchyPath || []);

    setVersion(
      sop.revisionNumber ||
        sop.version ||
        '00'
    );

    setStatus(
      sop.status || 'AKTIF'
    );

    setEffectiveDate(
      sop.effectiveDate || ''
    );

    setReviewPeriodMonths(
      sop.reviewPeriodMonths || 36
    );

    setCreatorName(
      sop.creatorName || ''
    );

    setApproverName(
      sop.approverName || ''
    );

    setSummary(
      sop.summary || ''
    );

    setTags(
      sop.tags || []
    );

    setConfidentialityLevel(
      sop.confidentialityLevel ||
        'Internal'
    );

    setLocationOrFolder(
      sop.locationOrFolder || ''
    );

    // BATANG TUBUH

    setPengertian(
      sop.pengertian ||
        sop.summary ||
        ''
    );

    setTujuan(
      sop.tujuan || ''
    );

    setKebijakan(
      sop.kebijakan ||
        'SK Direktur RSUD Dr. Soegiri Lamongan Nomor 188/SPO/DIR/2026'
    );

    setProsedur(
      sop.prosedur || ''
    );

    setAlur(
      sop.alur || ''
    );

    setUnitTerkait(
      sop.unitTerkait ||
        (
          sop.divisionName
            ? `${sop.divisionName}${
                sop.categoryName
                  ? `, ${sop.categoryName}`
                  : ''
              }`
            : ''
        )
    );

    // LOG REVISI

    setAddRevisionLog(false);

    setRevisionNotes('');

    setRevisionAuthor(
      sop.creatorName || ''
    );

    setTagInput('');
  }, [sop, isOpen]);

  // =========================================================
  // TAG
  // =========================================================

  const handleAddTag = (
    e: React.KeyboardEvent
  ) => {
    if (
      e.key !== 'Enter' &&
      e.key !== ','
    ) {
      return;
    }

    e.preventDefault();

    const val = tagInput
      .trim()
      .replace(/^#/, '');

    if (
      val &&
      !tags.includes(val)
    ) {
      setTags([
        ...tags,
        val
      ]);

      setTagInput('');
    }
  };

  const handleRemoveTag = (
    tagToRemove: string
  ) => {
    setTags(
      tags.filter(
        tag => tag !== tagToRemove
      )
    );
  };

  // =========================================================
  // BERSIHKAN HTML
  // =========================================================

  const stripHtml = (
    html: string = ''
  ) => {
    if (!html) return '';

    const temp =
      document.createElement('div');

    temp.innerHTML = html;

    return (
      temp.textContent ||
      temp.innerText ||
      ''
    )
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // A rich-text section is considered filled when it contains either
  // readable text OR a valid embedded image. This is important for SPO
  // sections that intentionally consist of a diagram/image only.
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

  // =========================================================
  // NORMALISASI HTML
  //
  // Tidak mengubah isi teks.
  // Hanya membuang elemen kosong yang tidak diperlukan.
  // =========================================================

  const normalizeHtml = (
    html: string = ''
  ) => {
    if (!html) return '';

    return html
      .replace(
        /<p>\s*(?:&nbsp;|\s)*<\/p>/gi,
        ''
      )
      .replace(
        /<div>\s*(?:&nbsp;|\s)*<\/div>/gi,
        ''
      )
      .trim();
  };

  // =========================================================
  // SUBMIT
  // =========================================================

  const handleSubmit = (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    // -------------------------------------------------------
    // VALIDASI JUDUL
    // -------------------------------------------------------

    if (!title.trim()) {
      alert(
        'Silakan isi Judul SPO terlebih dahulu.'
      );

      setActiveTab('info');

      return;
    }

    // -------------------------------------------------------
    // VALIDASI BATANG TUBUH (Hanya untuk SPO Baru / Standar, bukan SPO Eksisting)
    // Semua bagian wajib kecuali ALUR. Konten berupa gambar saja
    // tetap dianggap terisi.
    // -------------------------------------------------------
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
        alert(
          `SPO belum dapat diperbarui / diterbitkan!\n\nBagian wajib berikut masih kosong (belum diisi teks maupun gambar):\n• ${missingSections.join('\n• ')}\n\nSilakan lengkapi bagian tersebut dengan mengetik teks atau menyisipkan gambar/diagram. (Bagian ALUR bersifat opsional).`
        );
        return;
      }
    }

    setValidationMessage([]);

    // -------------------------------------------------------
    // RIWAYAT REVISI
    // -------------------------------------------------------

    const updatedHistory: RevisionLog[] = [
      ...(sop.revisionHistory || [])
    ];

    if (
      addRevisionLog &&
      revisionNotes.trim()
    ) {
      const newLog: RevisionLog = {
        id: `rev-${Date.now()}`,

        version:
          version.trim() ||
          sop.version ||
          '00',

        date:
          new Date()
            .toISOString()
            .split('T')[0],

        author:
          revisionAuthor.trim() ||
          'Admin SPO',

        notes:
          revisionNotes.trim()
      };

      updatedHistory.push(
        newLog
      );
    }

    // -------------------------------------------------------
    // TANGGAL REVIEW BERIKUTNYA
    // -------------------------------------------------------

    let nextReview =
      sop.nextReviewDate;

    if (effectiveDate) {
      const d =
        new Date(
          `${effectiveDate}T00:00:00`
        );

      if (
        !Number.isNaN(
          d.getTime()
        )
      ) {
        d.setMonth(
          d.getMonth() +
            Number(
              reviewPeriodMonths || 36
            )
        );

        nextReview =
          d.toISOString()
            .split('T')[0];
      }
    }

    // -------------------------------------------------------
    // NORMALISASI ISI
    // -------------------------------------------------------

    const normalizedPengertian =
      normalizeHtml(
        pengertian
      );

    const normalizedTujuan =
      normalizeHtml(
        tujuan
      );

    const normalizedKebijakan =
      normalizeHtml(
        kebijakan
      );

    const normalizedProsedur =
      normalizeHtml(
        prosedur
      );

    const normalizedAlur =
      normalizeHtml(
        alur
      );

    const normalizedUnitTerkait =
      normalizeHtml(
        unitTerkait
      );

    // Final content guard: image-only sections remain valid after normalization.
    const finalMissingSections: string[] = [];
    if (!hasRichContent(normalizedPengertian)) finalMissingSections.push('PENGERTIAN');
    if (!hasRichContent(normalizedTujuan)) finalMissingSections.push('TUJUAN');
    if (!hasRichContent(normalizedKebijakan)) finalMissingSections.push('KEBIJAKAN');
    if (!hasRichContent(normalizedProsedur)) finalMissingSections.push('PROSEDUR');
    if (!hasRichContent(normalizedUnitTerkait)) finalMissingSections.push('UNIT TERKAIT');

    if (finalMissingSections.length > 0) {
      setValidationMessage(finalMissingSections);
      setActiveTab('konten');
      alert(
        `SPO belum dapat diterbitkan. Bagian berikut belum diisi:\n\n• ${finalMissingSections.join('\n• ')}\n\nALUR bersifat opsional. Kolom yang hanya berisi gambar tetap dianggap terisi.`
      );
      return;
    }

    // -------------------------------------------------------
    // DATA SPO FINAL
    // -------------------------------------------------------

    const trimmedSopNumber = sopNumber.trim() || sop.sopNumber || '';
    const parsed = parseSopNumber(trimmedSopNumber);
    const seqNum = (parsed && parsed.sequenceNumber > 0) ? parsed.sequenceNumber : sop.sequenceNumber;

    const updated: SopDocument = {
      ...sop,

      divisionId: divisionId || sop.divisionId,
      divisionCode: divisionCode || sop.divisionCode,
      divisionName: divisionName || sop.divisionName,
      categoryId: categoryId || sop.categoryId,
      categoryName: categoryName || sop.categoryName,

      title:
        title.trim(),

      sopNumber:
        trimmedSopNumber,

      sequenceNumber:
        seqNum,

      subHierarchyCode:
        subHierarchyCode.trim(),

      version:
        version.trim() ||
        '00',

      revisionNumber:
        version.trim() ||
        '00',

      status:
        isExisting
          ? (status === 'TIDAK_AKTIF' ? 'TIDAK_AKTIF' : 'AKTIF')
          : (isAdmin
              ? status
              : (sop.status || 'MENUNGGU_PENGESAHAN')),

      effectiveDate,

      reviewPeriodMonths:
        Number(
          reviewPeriodMonths
        ) || 36,

      nextReviewDate:
        nextReview,

      creatorName:
        creatorName.trim(),

      approverName:
        approverName.trim(),

      summary:
        summary.trim() ||
        stripHtml(
          normalizedPengertian
        ),

      tags,

      confidentialityLevel,

      locationOrFolder:
        locationOrFolder.trim(),

      // =====================================================
      // BATANG TUBUH SPO
      // =====================================================

      pengertian:
        normalizedPengertian,

      tujuan:
        normalizedTujuan,

      kebijakan:
        normalizedKebijakan,

      // PENTING:
      // PROSEDUR DISIMPAN UTUH.
      // TIDAK DIPOTONG DAN TIDAK DIBERI PAGE BREAK DI SINI.
      prosedur:
        normalizedProsedur,

      // ALUR OPSIONAL
      alur:
        normalizedAlur ||
        undefined,

      unitTerkait:
        normalizedUnitTerkait,

      revisionHistory:
        updatedHistory,

      updatedAt:
        new Date().toISOString()
    };

    onSubmit(updated);

    onClose();
  };

  const handleAdminHierarchyChange = (value: { divisionCode: string; hierarchyCode: string; hierarchyPath: string[] }) => {
    const newDivision = value.divisionCode.trim().toUpperCase();
    const newHierarchy = value.hierarchyCode.trim();
    const oldDivision = (sop.divisionCode || '').trim().toUpperCase();
    const oldHierarchy = (sop.subHierarchyCode || '').trim();

    setDivisionCode(newDivision);
    setSubHierarchyCode(newHierarchy);
    setHierarchyPath(value.hierarchyPath || []);

    const matched = SOEGIRI_MASTER_CATEGORIES.find(c => c.code === newDivision);
    if (matched) {
      setDivisionId(matched.id);
      setDivisionName(matched.name);
      setCategoryId(matched.code);
      if (!categoryName || categoryName === sop.categoryName) setCategoryName(matched.name);
    }

    // Perubahan hirarki harus menghasilkan nomor baru pada counter hirarki tujuan.
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

  // =========================================================
  // STANDARDISASI NOMOR & CEK DUPLIKASI
  // =========================================================

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

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">

      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">

        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">

          <div className="flex items-center gap-3">

            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-xs">

              <Edit3 className="w-5 h-5" />

            </div>

            <div>

              <h2 className="text-base font-bold text-slate-900">
                Edit & Revisi Dokumen SPO
              </h2>

              <p className="text-xs text-slate-500 font-mono">
                {sop.sopNumber}
              </p>

            </div>

          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

        </div>

        {/* ================================================= */}
        {/* TAB */}
        {/* ================================================= */}

        <div className="flex border-b border-slate-200 bg-slate-50/50 px-3 sm:px-6 pt-2 overflow-x-auto no-scrollbar touch-pan-x shrink-0">

          <button
            type="button"
            onClick={() =>
              setActiveTab('info')
            }
            className={`px-3 sm:px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap touch-manipulation ${
              activeTab === 'info'
                ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Informasi Dokumen
          </button>

          {!isExisting && (
            <button
              type="button"
              onClick={() =>
                setActiveTab('konten')
              }
              className={`px-3 sm:px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap touch-manipulation ${
                activeTab === 'konten'
                  ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Isi Standar SPO (Batang Tubuh)</span>
              {validationMessage.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                  !
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              setActiveTab('revisi')
            }
            className={`px-3 sm:px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap touch-manipulation ${
              activeTab === 'revisi'
                ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Catatan Log Revisi
          </button>

        </div>

        {/* ================================================= */}
        {/* FORM */}
        {/* ================================================= */}

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-5"
        >

          {validationMessage.length > 0 && (
            <div className="sticky top-0 z-20 p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 shadow-sm">
              <div className="flex items-start gap-2">
                <span className="text-base leading-none">⚠️</span>
                <div className="text-xs">
                  <p className="font-bold">SPO belum dapat diterbitkan</p>
                  <p className="mt-1">Kolom berikut belum diisi:</p>
                  <ul className="mt-1 list-disc pl-4 font-semibold">
                    {validationMessage.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                  <p className="mt-1 text-amber-700">ALUR bersifat opsional. Kolom yang hanya berisi gambar tetap dianggap terisi.</p>
                </div>
              </div>
            </div>
          )}

          {/* ================================================= */}
          {/* TAB INFORMASI */}
          {/* ================================================= */}

          {activeTab === 'info' && (
            <div className="space-y-4">

              {/* NOMOR & IDENTITAS UNIT */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">

                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Hash className="w-4 h-4 text-indigo-600" />
                    <span>
                      Nomor Registrasi & Kode Unit SPO
                    </span>
                    {isAdmin && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full">
                        Akses Bebas Admin
                      </span>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleStandardizeCurrentNumber}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer w-fit"
                        title="Format nomor otomatis sesuai kaidah Tata Naskah 2026"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Format Tata Naskah 2026</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleUseNextAvailableNumber}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer w-fit"
                        title="Ambil nomor urut berikutnya yang masih kosong / bebas duplikat"
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer w-fit"
                          title="Kembalikan ke nomor dan unit semula"
                        >
                          <span>Reset ke Semula</span>
                        </button>
                      )}
                    </div>
                  )}

                </div>

                {duplicateCheck.isDuplicate && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                    <span className="font-bold text-amber-600">⚠️ Peringatan:</span>
                    <div className="flex-1">
                      Nomor <strong className="font-mono">{sopNumber}</strong> saat ini juga digunakan oleh dokumen <em>"{duplicateCheck.duplicateWith?.title}"</em>. Sebagai Admin Anda tetap bebas menyimpannya, atau klik <strong>Cari No. Bebas Duplikat</strong> di atas untuk nomor urut yang unik.
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Nomor SPO Resmi (Bebas Diubah oleh Admin) <span className="text-rose-500">*</span>
                    </label>

                    {isAdmin ? (
                      <input
                        type="text"
                        value={sopNumber}
                        onChange={(e) =>
                          setSopNumber(
                            e.target.value
                          )
                        }
                        className="w-full text-sm font-mono font-bold border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
                        placeholder="Contoh: PEN / 2.4 / 001 / 2026 atau format nomor bebas lainnya"
                        required
                      />
                    ) : (
                      <div className="w-full text-xs font-mono font-bold border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 bg-slate-100">
                        {sopNumber}
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-slate-500">
                      {isAdmin
                        ? 'Admin memiliki akses penuh merubah nomor dokumen sesuai kebutuhan (format standar maupun nomor khusus).'
                        : 'Nomor SPO bersifat terkunci dan hanya dapat diubah oleh Admin Tata Naskah.'}
                    </p>
                  </div>

                  {isAdmin && (
                    <div className="pt-2 border-t border-slate-200/70 space-y-3">
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                        <strong>Koreksi hirarki:</strong> pilih hirarki yang benar. Jika hirarki berubah, nomor urut akan dihitung ulang dari counter hirarki tujuan.
                      </div>
                      <HierarchyPicker
                        value={{ divisionCode, hierarchyCode: subHierarchyCode, hierarchyPath }}
                        onChange={handleAdminHierarchyChange}
                        label="Hirarki Dokumen"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Unit / Kategori Penyusun</label>
                          <input
                            type="text"
                            value={categoryName || sop.categoryName || ''}
                            onChange={(e) => setCategoryName(e.target.value)}
                            className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500"
                            placeholder="Contoh: Instalasi Gizi"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Path Hirarki</label>
                          <div className="w-full min-h-[38px] text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-600 bg-slate-50">
                            {hierarchyPath.length ? hierarchyPath.join(' → ') : 'Semua hirarki'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* JUDUL */}
              <div>

                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Judul Standar Prosedur Operasional (SPO)
                  <span className="text-rose-500">
                    {' '}*
                  </span>
                </label>

                <textarea
                  rows={2}
                  required
                  value={title}
                  onChange={(e) =>
                    setTitle(e.target.value)
                  }
                  className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs whitespace-normal [word-break:normal] [overflow-wrap:break-word] [hyphens:none] resize-y"
                />

              </div>

              {/* STATUS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                <div>

                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    No. Revisi
                  </label>

                  <input
                    type="text"
                    value={version}
                    onChange={(e) =>
                      setVersion(
                        e.target.value
                      )
                    }
                    className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2 font-mono text-slate-800"
                  />

                </div>

                <div>

                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status Dokumen
                  </label>

                  {isExisting ? (
                    <div className="w-full text-sm font-bold border border-emerald-200 rounded-xl px-3.5 py-2.5 bg-emerald-50 text-emerald-800">
                      {status === 'TIDAK_AKTIF' ? 'TIDAK AKTIF' : 'AKTIF — SPO EKSISTING'}
                    </div>
                  ) : isAdmin ? (
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as SopStatus)}
                      className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="DRAFT">BELUM UPLOAD</option>
                      <option value="MENUNGGU_PENGESAHAN">MENUNGGU PENGESAHAN</option>
                      <option value="AKTIF">AKTIF</option>
                      <option value="TIDAK_AKTIF">TIDAK AKTIF</option>
                    </select>
                  ) : (
                    <div className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3.5 py-2.5 bg-slate-100 text-slate-700">
                      {sop.status === 'DRAFT' || sop.status === 'BELUM_UPLOAD' || sop.isNumberReservation ? 'BELUM UPLOAD' : sop.status === 'MENUNGGU_PENGESAHAN' ? 'MENUNGGU PENGESAHAN' : sop.status}
                    </div>
                  )}

                </div>

                <div>

                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tingkat Kerahasiaan
                  </label>

                  <select
                    value={confidentialityLevel}
                    onChange={(e) =>
                      setConfidentialityLevel(
                        e.target.value as
                          | 'Publik'
                          | 'Internal'
                          | 'Rahasia'
                      )
                    }
                    className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2 text-slate-800"
                  >
                    <option value="Internal">
                      Internal RSUD Soegiri
                    </option>

                    <option value="Publik">
                      Publik
                    </option>

                    <option value="Rahasia">
                      Rahasia
                    </option>
                  </select>

                </div>

              </div>

              {/* TANGGAL / PENYUSUN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div>

                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Terbit / Berlaku
                  </label>

                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) =>
                      setEffectiveDate(
                        e.target.value
                      )
                    }
                    className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2 text-slate-800"
                  />

                </div>

                <div>

                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Penyusun
                  </label>

                  <input
                    type="text"
                    value={creatorName}
                    onChange={(e) =>
                      setCreatorName(
                        e.target.value
                      )
                    }
                    className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2 text-slate-800"
                  />

                </div>

              </div>

              {/* LOKASI */}
              <div>

                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lokasi Fisik / Binder Penyimpanan
                </label>

                <input
                  type="text"
                  value={locationOrFolder}
                  onChange={(e) =>
                    setLocationOrFolder(
                      e.target.value
                    )
                  }
                  className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2 text-slate-800"
                />

              </div>

            </div>
          )}

          {/* ================================================= */}
          {/* TAB KONTEN */}
          {/* ================================================= */}

          {activeTab === 'konten' && (
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
          )}

          {/* ================================================= */}
          {/* TAB REVISI */}
          {/* ================================================= */}

          {activeTab === 'revisi' && (
            <div className="space-y-4">

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">

                <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs text-slate-800">

                  <input
                    type="checkbox"
                    checked={addRevisionLog}
                    onChange={(e) =>
                      setAddRevisionLog(
                        e.target.checked
                      )
                    }
                    className="w-4 h-4 text-indigo-600 rounded"
                  />

                  <span>
                    Tambahkan catatan riwayat revisi
                  </span>

                </label>

                {addRevisionLog && (
                  <div className="mt-3 space-y-3 pt-3 border-t border-slate-200">

                    <div>

                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Keterangan Perubahan / Alasan Revisi
                      </label>

                      <textarea
                        rows={3}
                        value={revisionNotes}
                        onChange={(e) =>
                          setRevisionNotes(
                            e.target.value
                          )
                        }
                        placeholder="Contoh: Pembaruan tata laksana..."
                        className="w-full text-xs border border-slate-300 rounded-lg p-2 text-slate-800"
                      />

                    </div>

                    <div>

                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Petugas Perevisi
                      </label>

                      <input
                        type="text"
                        value={revisionAuthor}
                        onChange={(e) =>
                          setRevisionAuthor(
                            e.target.value
                          )
                        }
                        className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                      />

                    </div>

                  </div>
                )}

              </div>

              <div>

                <span className="text-xs font-bold text-slate-700 block mb-2">
                  Riwayat Revisi Terdahulu:
                </span>

                <div className="space-y-2">

                  {sop.revisionHistory?.length ? (
                    sop.revisionHistory.map(
                      (log) => (
                        <div
                          key={log.id}
                          className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs"
                        >

                          <div className="flex items-center justify-between font-bold text-slate-800">

                            <span>
                              Rev: {log.version}
                            </span>

                            <span className="text-[10px] text-slate-500">
                              {log.date}
                            </span>

                          </div>

                          <p className="text-slate-600 text-[11px] mt-1">
                            {log.notes}
                          </p>

                          <span className="text-[10px] text-slate-400">
                            Oleh: {log.author}
                          </span>

                        </div>
                      )
                    )
                  ) : (
                    <div className="text-xs text-slate-400 italic">
                      Belum ada riwayat revisi.
                    </div>
                  )}

                </div>

              </div>

            </div>
          )}

          {/* ================================================= */}
          {/* FOOTER */}
          {/* ================================================= */}

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>

            <button
              type="submit"
              className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >

              <CheckCircle2 className="w-4 h-4" />

              <span>
                Simpan Perubahan
              </span>

            </button>

          </div>

        </form>

      </div>

    </div>
  );
};