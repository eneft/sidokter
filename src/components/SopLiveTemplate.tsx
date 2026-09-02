import React, { useState, useEffect, useRef } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Building2, 
  Calendar, 
  FileText, 
  HelpCircle, 
  Check, 
  Sparkles,
  ChevronRight,
  Info,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  IndentDecrease,
  IndentIncrease,
  List,
  ImagePlus,
  Palette,
  RotateCcw,
  Maximize2,
  Type
} from 'lucide-react';
import { RichTextEditor, PRESET_COLORS, compressImageToDataUrl } from './RichTextEditor';
import { HospitalLogo } from './HospitalLogo';
import { SOEGIRI_HOSPITAL_INFO } from '../utils/soegiriStructure';

interface SopLiveTemplateProps {
  title: string;
  onTitleChange: (value: string) => void;
  sopNumber: string;
  version: string;
  effectiveDate: string;
  onEffectiveDateChange: (value: string) => void;
  approverName: string;
  pengertian: string;
  onPengertianChange: (value: string) => void;
  tujuan: string;
  onTujuanChange: (value: string) => void;
  kebijakan: string;
  onKebijakanChange: (value: string) => void;
  prosedur: string;
  onProsedurChange: (value: string) => void;
  alur: string;
  onAlurChange: (value: string) => void;
  unitTerkait: string;
  onUnitTerkaitChange: (value: string) => void;
  titleEditable?: boolean;
  dateEditable?: boolean;
  showPageHint?: boolean;
  missingSections?: string[];
}

export const SopLiveTemplate: React.FC<SopLiveTemplateProps> = ({
  title,
  onTitleChange,
  sopNumber,
  version,
  effectiveDate,
  onEffectiveDateChange,
  approverName,
  pengertian,
  onPengertianChange,
  tujuan,
  onTujuanChange,
  kebijakan,
  onKebijakanChange,
  prosedur,
  onProsedurChange,
  alur,
  onAlurChange,
  unitTerkait,
  onUnitTerkaitChange,
  titleEditable = true,
  dateEditable = true,
  showPageHint = true,
  missingSections = [],
}) => {
  // Responsive mode is automatic: cards for mobile/tablet, official A4 table for large desktop.
  const [isCompactViewport, setIsCompactViewport] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1024;
    }
    return false;
  });

  const [activeSectionId, setActiveSectionId] = useState<string>('sec-pengertian');
  const [activeTableSection, setActiveTableSection] = useState<'pengertian' | 'tujuan' | 'kebijakan' | 'prosedur' | 'alur' | 'unitTerkait'>('pengertian');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [activeColor, setActiveColor] = useState('#0f172a');
  const tableFileInputRef = useRef<HTMLInputElement>(null);

  const handleExecCommand = (cmd: string, val: string = '') => {
    document.execCommand(cmd, false, val);
  };

  const handleApplyColor = (color: string) => {
    setActiveColor(color);
    document.execCommand('foreColor', false, color);
    setShowColorPicker(false);
  };

  const handleInsertList = (type: '1' | 'a') => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    document.execCommand('insertOrderedList');
    if (type === 'a') {
      const parentList = selection.anchorNode?.parentElement?.closest('ol');
      if (parentList) {
        parentList.type = 'a';
        parentList.style.listStyleType = 'lower-alpha';
      }
    }
  };

  const handleInsertImageToActiveSection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const dataUrl = await compressImageToDataUrl(file);
        if (dataUrl) {
          const figureHtml = `<figure data-align="center" data-width="80%" style="text-align: center; margin: 8px auto; max-width: 100%;"><img src="${dataUrl}" style="max-width: 100%; height: auto; border-radius: 4px;" alt="Lampiran Bagan SPO" /><figcaption style="font-size: 11px; color: #64748b; margin-top: 4px; font-family: Bookman Old Style, serif;">Gambar / Bagan Alur</figcaption></figure><p><br></p>`;
          if (activeTableSection === 'pengertian') onPengertianChange((pengertian || '') + figureHtml);
          else if (activeTableSection === 'tujuan') onTujuanChange((tujuan || '') + figureHtml);
          else if (activeTableSection === 'kebijakan') onKebijakanChange((kebijakan || '') + figureHtml);
          else if (activeTableSection === 'prosedur') onProsedurChange((prosedur || '') + figureHtml);
          else if (activeTableSection === 'alur') onAlurChange((alur || '') + figureHtml);
          else if (activeTableSection === 'unitTerkait') onUnitTerkaitChange((unitTerkait || '') + figureHtml);
        }
      }
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setIsCompactViewport(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const viewMode: 'cards' | 'table' = isCompactViewport ? 'cards' : 'table';

  const hasContent = (html: string = '') => {
    if (!html || !html.trim()) return false;
    const src = html.trim();
    if (/<img\b|data-sop-image|data-storage-image|figure-wrapper|<figure\b/i.test(src)) return true;
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = src;
      const txt = (tmp.textContent || tmp.innerText || '').trim();
      return txt.length > 0;
    } catch {
      return src.length > 0;
    }
  };

  const isPengertianMissing = missingSections.includes('PENGERTIAN');
  const isTujuanMissing = missingSections.includes('TUJUAN');
  const isKebijakanMissing = missingSections.includes('KEBIJAKAN');
  const isProsedurMissing = missingSections.includes('PROSEDUR');
  const isUnitTerkaitMissing = missingSections.includes('UNIT TERKAIT');

  const sectionsNav = [
    { id: 'sec-pengertian', label: '1. Pengertian', isMissing: isPengertianMissing, hasData: hasContent(pengertian), req: true },
    { id: 'sec-tujuan', label: '2. Tujuan', isMissing: isTujuanMissing, hasData: hasContent(tujuan), req: true },
    { id: 'sec-kebijakan', label: '3. Kebijakan', isMissing: isKebijakanMissing, hasData: hasContent(kebijakan), req: true },
    { id: 'sec-prosedur', label: '4. Prosedur', isMissing: isProsedurMissing, hasData: hasContent(prosedur), req: true },
    { id: 'sec-alur', label: '5. Alur', isMissing: false, hasData: hasContent(alur), req: false },
    { id: 'sec-unit', label: '6. Unit Terkait', isMissing: isUnitTerkaitMissing, hasData: hasContent(unitTerkait), req: true },
  ];

  const scrollToSection = (id: string) => {
    setActiveSectionId(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-3.5">
      {/* ========================================================================= */}
      {/* 1. MODE KARTU RESPONSIF (OPTIMIZED FOR MOBILE, TOUCH & FULL-WIDTH EDITING) */}
      {/* ========================================================================= */}
      {viewMode === 'cards' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Quick Jump Navigation Chips */}
          <div className="sticky top-0 z-20 -mx-1 px-1 py-1.5 bg-white/95 backdrop-blur-md border-b border-slate-200">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-0.5">
              {sectionsNav.map((sec) => {
                const isActive = activeSectionId === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => scrollToSection(sec.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 border touch-manipulation cursor-pointer ${
                      sec.isMissing
                        ? 'bg-rose-50 text-rose-700 border-rose-300'
                        : sec.hasData
                        ? isActive
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        : isActive
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{sec.label}</span>
                    {sec.isMissing ? (
                      <span className="w-4 h-4 rounded-full bg-rose-200 text-rose-800 text-[10px] flex items-center justify-center font-bold">!</span>
                    ) : sec.hasData ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <span className="text-[10px] opacity-60">({sec.req ? 'Wajib' : 'Opsional'})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dokumen Header Info Card */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <HospitalLogo imgClassName="w-7 h-7" className="shrink-0" />
                <div>
                  <div className="text-[11px] font-bold text-slate-900 leading-tight">RSUD Dr. SOEGIRI LAMONGAN</div>
                  <div className="text-[10px] text-slate-500 font-semibold">Standar Prosedur Operasional (SPO)</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Rev: {version || '00'}
              </span>
            </div>

            {/* Judul Input */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Judul SPO <span className="text-rose-500">*</span>
              </label>
              {titleEditable ? (
                <textarea
                  rows={2}
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="Ketik Judul Standar Prosedur Operasional..."
                  className="w-full text-xs sm:text-sm font-bold uppercase rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bookman bg-slate-50/50 resize-none"
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${target.scrollHeight}px`;
                  }}
                />
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-50 font-bold uppercase text-xs sm:text-sm font-bookman text-slate-900">
                  {title || 'JUDUL STANDAR PROSEDUR OPERASIONAL'}
                </div>
              )}
            </div>

            {/* Metrik Info Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs">
              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Nomor Dokumen</span>
                <span className="font-mono font-bold text-slate-800 text-[11px] truncate block">
                  {sopNumber || 'Otomatis'}
                </span>
              </div>
              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Tanggal Terbit</span>
                {dateEditable ? (
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => onEffectiveDateChange(e.target.value)}
                    className="w-full text-[11px] font-bold text-slate-800 bg-transparent border-0 p-0 focus:outline-none"
                  />
                ) : (
                  <span className="font-bold text-slate-800 text-[11px]">{effectiveDate || '-'}</span>
                )}
              </div>
              <div className="col-span-2 sm:col-span-1 bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Ditetapkan Oleh</span>
                <span className="font-bold text-slate-800 text-[11px] truncate block">
                  {approverName || SOEGIRI_HOSPITAL_INFO.director.name}
                </span>
              </div>
            </div>
          </div>

          {/* Section 1: PENGERTIAN */}
          <div id="sec-pengertian" className={`p-3 sm:p-3.5 rounded-xl bg-white border transition-all ${isPengertianMissing ? 'border-rose-300 ring-2 ring-rose-200 bg-rose-50/20' : 'border-slate-200 shadow-2xs'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">1</span>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase font-bookman">PENGERTIAN</h4>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isPengertianMissing ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-slate-100 text-slate-600'}`}>
                {isPengertianMissing ? '⚠️ Wajib Diisi' : 'Wajib (Teks / Gambar)'}
              </span>
            </div>
            <RichTextEditor
              label=""
              value={pengertian}
              onChange={onPengertianChange}
              placeholder="Jelaskan definisi, istilah, atau lingkup dari SPO ini..."
              minHeight="90px"
              allowImageUpload={true}
            />
          </div>

          {/* Section 2: TUJUAN */}
          <div id="sec-tujuan" className={`p-3 sm:p-3.5 rounded-xl bg-white border transition-all ${isTujuanMissing ? 'border-rose-300 ring-2 ring-rose-200 bg-rose-50/20' : 'border-slate-200 shadow-2xs'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">2</span>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase font-bookman">TUJUAN</h4>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isTujuanMissing ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-slate-100 text-slate-600'}`}>
                {isTujuanMissing ? '⚠️ Wajib Diisi' : 'Wajib (Teks / Gambar)'}
              </span>
            </div>
            <RichTextEditor
              label=""
              value={tujuan}
              onChange={onTujuanChange}
              placeholder="Jelaskan tujuan dan hasil yang ingin dicapai melalui prosedur ini..."
              minHeight="90px"
              allowImageUpload={true}
            />
          </div>

          {/* Section 3: KEBIJAKAN */}
          <div id="sec-kebijakan" className={`p-3 sm:p-3.5 rounded-xl bg-white border transition-all ${isKebijakanMissing ? 'border-rose-300 ring-2 ring-rose-200 bg-rose-50/20' : 'border-slate-200 shadow-2xs'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">3</span>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase font-bookman">KEBIJAKAN</h4>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isKebijakanMissing ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-slate-100 text-slate-600'}`}>
                {isKebijakanMissing ? '⚠️ Wajib Diisi' : 'Wajib (Teks / Gambar)'}
              </span>
            </div>
            <RichTextEditor
              label=""
              value={kebijakan}
              onChange={onKebijakanChange}
              placeholder="Isi rujukan Keputusan Direktur / Kebijakan RSUD Dr. Soegiri..."
              minHeight="90px"
              allowImageUpload={true}
            />
          </div>

          {/* Section 4: PROSEDUR */}
          <div id="sec-prosedur" className={`p-3 sm:p-3.5 rounded-xl bg-white border transition-all ${isProsedurMissing ? 'border-rose-300 ring-2 ring-rose-200 bg-rose-50/20' : 'border-slate-200 shadow-2xs'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">4</span>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase font-bookman">PROSEDUR</h4>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isProsedurMissing ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-slate-100 text-slate-600'}`}>
                {isProsedurMissing ? '⚠️ Wajib Diisi' : 'Wajib (Teks / Gambar)'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mb-1.5">
              💡 Gunakan tombol penomoran <b>1.</b> atau <b>a.</b> di toolbar untuk membuat langkah kerja terstruktur.
            </p>
            <RichTextEditor
              label=""
              value={prosedur}
              onChange={onProsedurChange}
              placeholder={'1. Langkah persiapan...\n2. Langkah pelaksanaan...\n3. Langkah penutupan...'}
              minHeight="130px"
              allowImageUpload={true}
              imageUploadNote="Gambar/diagram dapat disisipkan bila diperlukan."
            />
          </div>

          {/* Section 5: ALUR / BAGAN ALIR (Opsional) */}
          <div id="sec-alur" className="p-3 sm:p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">5</span>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase font-bookman">ALUR / BAGAN ALIR</h4>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                Opsional
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mb-1.5">
              Bagan alir / diagram flowchart operasional dapat disisipkan lewat tombol "Gambar" di toolbar.
            </p>
            <RichTextEditor
              label=""
              value={alur}
              onChange={onAlurChange}
              placeholder="Opsional — sisipkan bagan alur atau deskripsi alur kerja..."
              minHeight="90px"
              allowImageUpload={true}
            />
          </div>

          {/* Section 6: UNIT TERKAIT */}
          <div id="sec-unit" className={`p-3 sm:p-3.5 rounded-xl bg-white border transition-all ${isUnitTerkaitMissing ? 'border-rose-300 ring-2 ring-rose-200 bg-rose-50/20' : 'border-slate-200 shadow-2xs'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">6</span>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase font-bookman">UNIT TERKAIT</h4>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isUnitTerkaitMissing ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-slate-100 text-slate-600'}`}>
                {isUnitTerkaitMissing ? '⚠️ Wajib Diisi' : 'Wajib (Teks / Gambar)'}
              </span>
            </div>
            <RichTextEditor
              label=""
              value={unitTerkait}
              onChange={onUnitTerkaitChange}
              placeholder="Sebutkan instalasi, ruangan, atau tim kerja terkait..."
              minHeight="90px"
              allowImageUpload={true}
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MODE LEMBAR TABEL RESMI (OFFICIAL HOSPITAL TABLE VIEW FOR DESKTOP/PRINT) */}
      {/* ========================================================================= */}
      {viewMode === 'table' && (
        <div className="space-y-2.5 animate-fadeIn">
          {showPageHint && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-900 flex items-start gap-2 max-w-[900px] mx-auto">
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Pratinjau langsung format naskah SPO resmi</div>
                <div className="mt-0.5 text-[11px] text-indigo-700 leading-relaxed">
                  Posisi pengisian dibuat mengikuti lembar SPO resmi RSUD Dr. Soegiri. Gunakan Text Tool di atas kolom untuk mengatur format dan penomoran.
                </div>
              </div>
            </div>
          )}

          {/* DEDICATED TOP TEXT TOOLBAR - POSITIONED DIRECTLY ABOVE THE COLUMNS */}
          <div className="sticky top-2 z-30 w-full max-w-[900px] mx-auto bg-white text-slate-700 rounded-xl shadow-sm border border-slate-200 px-2 py-1 flex items-center justify-between gap-1 text-xs select-none backdrop-blur-md">
            {/* Active Column / Section Indicator & Switcher */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:inline">
                Bagian:
              </span>
              <select
                value={activeTableSection}
                onChange={(e) => setActiveTableSection(e.target.value as any)}
                title="Pilih Kolom Batang Tubuh yang Sedang Diedit"
                className="h-6 text-[11px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-0 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
              >
                <option value="pengertian">1. PENGERTIAN</option>
                <option value="tujuan">2. TUJUAN</option>
                <option value="kebijakan">3. KEBIJAKAN</option>
                <option value="prosedur">4. PROSEDUR</option>
                <option value="alur">5. ALUR / BAGAN</option>
                <option value="unitTerkait">6. UNIT TERKAIT</option>
              </select>
            </div>

            <div className="w-px h-4 bg-slate-200 mx-0.5 shrink-0" />

            {/* Undo & Redo */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('undo')}
                title="Undo (Ctrl+Z)"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('redo')}
                title="Redo (Ctrl+Y)"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-px h-4 bg-slate-200 mx-0.5 shrink-0" />

            {/* Font Styling (B, I, U, S) */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('bold')}
                title="Tebal / Bold (Ctrl+B)"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('italic')}
                title="Miring / Italic (Ctrl+I)"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('underline')}
                title="Garis Bawah / Underline (Ctrl+U)"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Font Color Picker */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowColorPicker(!showColorPicker)}
                title="Warna Teks"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center justify-center gap-0.5"
              >
                <Palette className="w-3.5 h-3.5" />
                <span
                  className="w-2 h-2 rounded-full border border-slate-500 inline-block shrink-0"
                  style={{ backgroundColor: activeColor }}
                />
              </button>

              {showColorPicker && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-white text-slate-900 border border-slate-200 rounded-lg shadow-xl p-2 w-44 space-y-1.5 animate-fadeIn">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                    Pilih Warna Teks:
                  </span>
                  <div className="grid grid-cols-4 gap-1">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c.color}
                        type="button"
                        onClick={() => handleApplyColor(c.color)}
                        title={c.name}
                        className="w-7 h-7 rounded border border-slate-300 hover:scale-105 transition-transform cursor-pointer flex items-center justify-center"
                        style={{ backgroundColor: c.color }}
                      />
                    ))}
                  </div>
                  <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[10px]">
                    <span className="text-slate-600">Kustom:</span>
                    <input
                      type="color"
                      value={activeColor}
                      onChange={(e) => handleApplyColor(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer border-0 p-0"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-slate-200 mx-0.5 shrink-0" />

            {/* Alignments */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('justifyLeft')}
                title="Rata Kiri (Ctrl+L)"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('justifyCenter')}
                title="Rata Tengah (Ctrl+E)"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('justifyRight')}
                title="Rata Kanan (Ctrl+R)"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('justifyFull')}
                title="Rata Kiri Kanan / Justify (Ctrl+J)"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
              >
                <AlignJustify className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-px h-4 bg-slate-200 mx-0.5 shrink-0 hidden md:block" />

            {/* Indentations */}
            <div className="hidden md:flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('outdent')}
                title="Kurangi Indentasi (Shift+Tab)"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
              >
                <IndentDecrease className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('indent')}
                title="Tambah Indentasi (Tab)"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer flex items-center justify-center"
              >
                <IndentIncrease className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-px h-4 bg-slate-200 mx-0.5 shrink-0" />

            {/* Presets SPO Numbering */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleInsertList('1')}
                title="Nomor Utama (1., 2., 3...)"
                className="h-6 px-1.5 text-[10px] font-bold rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 cursor-pointer flex items-center justify-center transition-colors"
              >
                1.
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleInsertList('a')}
                title="Sub-Poin Huruf (a., b., c...)"
                className="h-6 px-1.5 text-[10px] font-bold rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 cursor-pointer flex items-center justify-center transition-colors"
              >
                a.
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('insertUnorderedList')}
                title="Poin / Bullet List (•)"
                className="w-6 h-6 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 cursor-pointer flex items-center justify-center transition-colors"
              >
                <List className="w-3.5 h-3.5 text-indigo-400" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleExecCommand('removeFormat')}
                title="Reset Format"
                className="w-6 h-6 p-1 rounded hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 cursor-pointer flex items-center justify-center transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-px h-4 bg-slate-200 mx-0.5 shrink-0" />

            {/* Gambar / Bagan Upload Tool */}
            <div className="flex items-center shrink-0">
              <input
                ref={tableFileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml"
                multiple
                onChange={handleInsertImageToActiveSection}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => {
                  if (tableFileInputRef.current) {
                    tableFileInputRef.current.value = '';
                    tableFileInputRef.current.click();
                  }
                }}
                title="Sisipkan Gambar/Bagan ke Bagian Aktif"
                className="h-6 px-2 inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded text-[10px] font-bold transition-all cursor-pointer shadow-xs"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Gambar</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar rounded-xl border border-slate-300 bg-white shadow-sm mx-auto w-full max-w-[900px]">
            <table className="w-full min-w-[620px] sm:min-w-[720px] border-collapse table-fixed font-bookman text-black" style={{ border: '1px solid #000' }}>
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '24%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td rowSpan={2} className="border border-black p-3 text-center align-middle bg-white">
                    <HospitalLogo imgClassName="w-[58px] h-[58px] mx-auto" className="mb-1" />
                    <div className="font-extrabold text-[11px] leading-tight uppercase">RSUD Dr. SOEGIRI</div>
                    <div className="font-extrabold text-[11px] leading-tight uppercase">LAMONGAN</div>
                  </td>
                  <td colSpan={3} className="border border-black p-3 text-center align-middle bg-white">
                    {titleEditable ? (
                      <textarea
                        rows={2}
                        value={title}
                        onChange={(e) => onTitleChange(e.target.value)}
                        placeholder="JUDUL STANDAR PROSEDUR OPERASIONAL"
                        className="w-full text-center font-extrabold uppercase text-xs sm:text-sm bg-transparent border-0 outline-none placeholder:text-slate-400 font-bookman leading-snug resize-none overflow-hidden whitespace-normal [word-break:normal] [overflow-wrap:break-word] [hyphens:none]"
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = `${target.scrollHeight}px`;
                        }}
                      />
                    ) : (
                      <div className="text-center font-extrabold uppercase text-xs sm:text-sm min-h-[20px] whitespace-normal [word-break:normal] [overflow-wrap:break-word] [hyphens:none] font-bookman leading-snug">{title || 'JUDUL STANDAR PROSEDUR OPERASIONAL'}</div>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black p-2 text-center align-top bg-white">
                    <div className="font-bold text-[10px] uppercase font-bookman">NO. DOKUMEN</div>
                    <div className={`text-xs font-bold mt-1 whitespace-normal [word-break:normal] [overflow-wrap:break-word] ${sopNumber?.includes('Akan Terbit') || sopNumber?.includes('Belum') ? 'text-indigo-600 italic font-sans text-[11px]' : ''}`}>
                      {sopNumber || '……/……/……/2026'}
                    </div>
                  </td>
                  <td className="border border-black p-2 text-center align-top bg-white"><div className="font-bold text-[10px] uppercase font-bookman">NO. REVISI</div><div className="text-xs font-bold mt-1 whitespace-normal [word-break:normal] [overflow-wrap:break-word]">{version || '00'}</div></td>
                  <td className="border border-black p-2 text-center align-top bg-white"><div className="font-bold text-[10px] uppercase font-bookman">HALAMAN</div><div className="text-xs font-bold mt-1 whitespace-normal [word-break:normal] [overflow-wrap:break-word]">Otomatis</div></td>
                </tr>
                <tr>
                  <td className="border border-black p-2.5 text-center font-extrabold text-[11px] leading-tight uppercase align-middle bg-white whitespace-normal [word-break:normal] [overflow-wrap:break-word]">STANDAR<br/>PROSEDUR<br/>OPERASIONAL</td>
                  <td className="border border-black p-2 text-center align-top bg-white">
                    <div className="text-[10px] font-bookman">Tanggal terbit</div>
                    {dateEditable ? (
                      <input value={effectiveDate} onChange={(e) => onEffectiveDateChange(e.target.value)} type="date" className="w-full mt-1 text-center text-xs font-bold border-0 outline-none bg-transparent" />
                    ) : (
                      <div className="mt-1 text-xs font-bold">{effectiveDate || '……………'}</div>
                    )}
                  </td>
                  <td colSpan={2} className="border border-black p-2 text-center align-top bg-white">
                    <div className="text-[11px] font-bookman text-black leading-tight">Ditetapkan,</div>
                    <div className="font-bold text-xs sm:text-[13px] font-bookman text-black leading-tight mt-0.5 whitespace-normal [word-break:normal] [overflow-wrap:break-word]">Direktur RSUD Dr. Soegiri Lamongan</div>
                    <div className="h-6 sm:h-7" />
                    <div className="font-bold text-xs sm:text-sm underline font-bookman text-black leading-tight whitespace-normal [word-break:normal] [overflow-wrap:break-word]">{approverName || SOEGIRI_HOSPITAL_INFO.director.name}</div>
                    <div className="text-[10px] sm:text-[11px] font-bookman text-black leading-tight whitespace-normal [word-break:normal] [overflow-wrap:break-word]">{SOEGIRI_HOSPITAL_INFO.director.rank}</div>
                    <div className="font-bold text-[10px] sm:text-[11px] font-bookman text-black leading-tight whitespace-normal [word-break:normal] [overflow-wrap:break-word]">NIP. {SOEGIRI_HOSPITAL_INFO.director.nip}</div>
                  </td>
                </tr>

                <tr >
                  <td className={`border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word]`}>
                    <div className="flex flex-col gap-0.5">
                      <span>PENGERTIAN</span>
                      
                    </div>
                  </td>
                  <td colSpan={3} className={`border border-black p-1 sm:p-1.5 align-top font-bookman sop-batang-tubuh-content`}>
                    <RichTextEditor
                      label=""
                      value={pengertian}
                      onChange={onPengertianChange}
                      placeholder="Isi pengertian..."
                      minHeight="85px"
                      allowImageUpload={true}
                      hideToolbar={true}
                      variant="seamless"
                      onFocus={() => setActiveTableSection('pengertian')}
                    />
                  </td>
                </tr>
                <tr >
                  <td className={`border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word]`}>
                    <div className="flex flex-col gap-0.5">
                      <span>TUJUAN</span>
                      
                    </div>
                  </td>
                  <td colSpan={3} className={`border border-black p-1 sm:p-1.5 align-top font-bookman sop-batang-tubuh-content`}>
                    <RichTextEditor
                      label=""
                      value={tujuan}
                      onChange={onTujuanChange}
                      placeholder="Isi tujuan..."
                      minHeight="85px"
                      allowImageUpload={true}
                      hideToolbar={true}
                      variant="seamless"
                      onFocus={() => setActiveTableSection('tujuan')}
                    />
                  </td>
                </tr>
                <tr >
                  <td className={`border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word]`}>
                    <div className="flex flex-col gap-0.5">
                      <span>KEBIJAKAN</span>
                      
                    </div>
                  </td>
                  <td colSpan={3} className={`border border-black p-1 sm:p-1.5 align-top font-bookman sop-batang-tubuh-content`}>
                    <RichTextEditor
                      label=""
                      value={kebijakan}
                      onChange={onKebijakanChange}
                      placeholder="Isi kebijakan / dasar hukum..."
                      minHeight="85px"
                      allowImageUpload={true}
                      hideToolbar={true}
                      variant="seamless"
                      onFocus={() => setActiveTableSection('kebijakan')}
                    />
                  </td>
                </tr>
                <tr >
                  <td className={`border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word]`}>
                    <div className="flex flex-col gap-0.5">
                      <span>PROSEDUR</span>
                      
                    </div>
                  </td>
                  <td colSpan={3} className={`border border-black p-1 sm:p-1.5 align-top font-bookman sop-batang-tubuh-content`}>
                    <RichTextEditor
                      label=""
                      value={prosedur}
                      onChange={onProsedurChange}
                      placeholder={'1. Isi langkah pertama...\n2. Isi langkah berikutnya...'}
                      minHeight="120px"
                      allowImageUpload={true}
                      imageUploadNote="Gambar/diagram dapat disisipkan bila diperlukan."
                      hideToolbar={true}
                      variant="seamless"
                      onFocus={() => setActiveTableSection('prosedur')}
                    />
                  </td>
                </tr>
                <tr>
                  <td className="border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word]">
                    <div className="flex flex-col gap-0.5">
                      <span>ALUR / BAGAN ALIR</span>
                      <span className="text-[9px] font-normal text-slate-500 tracking-normal normal-case">
                        (Opsional)
                      </span>
                    </div>
                  </td>
                  <td colSpan={3} className="border border-black p-1 sm:p-1.5 align-top font-bookman sop-batang-tubuh-content">
                    <RichTextEditor
                      label=""
                      value={alur}
                      onChange={onAlurChange}
                      placeholder="Opsional — isi bagan alir / alur kerja..."
                      minHeight="85px"
                      allowImageUpload={true}
                      hideToolbar={true}
                      variant="seamless"
                      onFocus={() => setActiveTableSection('alur')}
                    />
                  </td>
                </tr>
                <tr >
                  <td className={`border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word]`}>
                    <div className="flex flex-col gap-0.5">
                      <span>UNIT TERKAIT</span>
                      
                    </div>
                  </td>
                  <td colSpan={3} className={`border border-black p-1 sm:p-1.5 align-top font-bookman sop-batang-tubuh-content`}>
                    <RichTextEditor
                      label=""
                      value={unitTerkait}
                      onChange={onUnitTerkaitChange}
                      placeholder="Sebutkan instalasi, ruangan, atau tim kerja terkait..."
                      minHeight="85px"
                      allowImageUpload={true}
                      hideToolbar={true}
                      variant="seamless"
                      onFocus={() => setActiveTableSection('unitTerkait')}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {showPageHint && (
            <div className="text-[11px] text-slate-500 max-w-[900px] mx-auto px-1">
              <b>Catatan:</b> tampilan ini adalah acuan posisi saat pengisian. Saat dicetak, isi tidak dipaksa menjadi satu halaman; sistem melanjutkan flow ke halaman berikutnya dan tetap berhenti sebelum margin bawah.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
