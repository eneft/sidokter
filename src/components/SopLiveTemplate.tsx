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
  ListOrdered,
  ImagePlus,
  ImageIcon,
  Type,
  Table2,
  Rows3,
  Columns3,
  Merge,
  Split,
  MoveHorizontal,
  Trash2,
  Maximize,
  Maximize2,
  Minimize,
  Minimize2,
  WrapText,
  RotateCcw,
} from 'lucide-react';
import type { TableCommand } from '../utils/editorTableCommands';
import { RichTextEditor, type RichTextEditorHandle, type RichTextFormattingState } from './RichTextEditor';
import { HospitalLogo } from './HospitalLogo';
import { DirectorSignature } from './DirectorSignature';
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
  /** Render official director TTD/stamp only for an active non-PDF document. */
  showSignatureAndStamp?: boolean;
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
  showSignatureAndStamp = false,
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
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [activeToolMode, setActiveToolMode] = useState<'text' | 'table' | 'image'>('text');
  const tableFileInputRef = useRef<HTMLInputElement>(null);
  const pengertianEditorRef = useRef<RichTextEditorHandle>(null);
  const tujuanEditorRef = useRef<RichTextEditorHandle>(null);
  const kebijakanEditorRef = useRef<RichTextEditorHandle>(null);
  const prosedurEditorRef = useRef<RichTextEditorHandle>(null);
  const alurEditorRef = useRef<RichTextEditorHandle>(null);
  const unitTerkaitEditorRef = useRef<RichTextEditorHandle>(null);
  const [activeFormatting, setActiveFormatting] = useState<RichTextFormattingState>({
    bold: false, italic: false, underline: false, align: 'left',
    orderedList: false, unorderedList: false, fontSize: null, inTable: false,
    context: 'text', tableAutoFit: false, canMerge: false, canSplit: false,
    tableAlign: 'left',
  });

  const handleTableCommand = (command: TableCommand) => getActiveEditor()?.executeTableCommand(command);
  const handleTableAlignment = (alignment: 'left' | 'center' | 'right') => getActiveEditor()?.alignTable(alignment);

  useEffect(() => {
    if (!activeFormatting.inTable) setShowTableMenu(false);
  }, [activeFormatting.inTable]);

  const getActiveEditor = (): RichTextEditorHandle | null => ({
    pengertian: pengertianEditorRef.current,
    tujuan: tujuanEditorRef.current,
    kebijakan: kebijakanEditorRef.current,
    prosedur: prosedurEditorRef.current,
    alur: alurEditorRef.current,
    unitTerkait: unitTerkaitEditorRef.current,
  })[activeTableSection];

  const handleExecCommand = (cmd: string, val: string = '') => {
    getActiveEditor()?.executeCommand(cmd, val || undefined);
  };

  const handleInsertList = (type: '1' | 'a') => {
    getActiveEditor()?.insertCustomList(type);
  };

  const handleInsertImageToActiveSection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await getActiveEditor()?.insertImageFiles(files);
    if (tableFileInputRef.current) {
      tableFileInputRef.current.value = '';
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

          {/* One context-aware toolbar. Editor chrome stays outside document HTML. */}
          <div className="live-spo-context-toolbar sticky top-2 z-30 w-full max-w-[900px] mx-auto bg-white text-slate-700 rounded-xl shadow-sm border border-slate-200 px-2 py-1 flex items-center gap-1 text-xs select-none overflow-visible">
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-slate-400 font-semibold uppercase hidden sm:inline">Bagian:</span>
              <select value={activeTableSection} onChange={(e) => setActiveTableSection(e.target.value as typeof activeTableSection)} className="h-6 max-w-32 text-[10px] font-bold bg-white border border-slate-200 rounded px-1">
                <option value="pengertian">PENGERTIAN</option><option value="tujuan">TUJUAN</option><option value="kebijakan">KEBIJAKAN</option><option value="prosedur">PROSEDUR</option><option value="alur">ALUR</option><option value="unitTerkait">UNIT TERKAIT</option>
              </select>
            </div>
            <div className="toolbar-mode-switch" aria-label="Mode toolbar">
              <button type="button" aria-pressed={activeToolMode === 'text'} onMouseDown={e=>e.preventDefault()} onClick={()=>setActiveToolMode('text')} title="Mode Teks" aria-label="Mode Teks"><Type /></button>
              <button type="button" aria-pressed={activeToolMode === 'table'} onMouseDown={e=>e.preventDefault()} onClick={()=>setActiveToolMode('table')} title="Mode Tabel" aria-label="Mode Tabel"><Table2 /></button>
              <button type="button" aria-pressed={activeToolMode === 'image'} onMouseDown={e=>e.preventDefault()} onClick={()=>setActiveToolMode('image')} title="Mode Gambar" aria-label="Mode Gambar"><ImageIcon /></button>
            </div>

            {activeToolMode === 'text' && <>
              <div className="toolbar-command-group">
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>handleExecCommand('undo')} title="Batalkan" aria-label="Batalkan" className="toolbar-icon"><Undo2 /></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>handleExecCommand('redo')} title="Ulangi" aria-label="Ulangi" className="toolbar-icon"><Redo2 /></button>
              </div>
<select
  aria-label="Ukuran huruf"
  value={activeFormatting.fontSize || '12pt'}
  onChange={(e) =>
    getActiveEditor()?.applyFontSize(
      e.target.value as '8pt' | '10pt' | '12pt'
    )
  }
  className="h-6 w-14 shrink-0 rounded border border-slate-200 bg-white px-1 text-[10px] font-semibold"
>
  <option value="12pt">12 pt</option>
  <option value="10pt">10 pt</option>
  <option value="8pt">8 pt</option>
</select>
              <div className="toolbar-command-group">
                {[[Bold,'bold','Tebal',activeFormatting.bold],[Italic,'italic','Miring',activeFormatting.italic],[Underline,'underline','Garis bawah',activeFormatting.underline]].map(([Icon,command,title,active])=><button key={String(command)} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>handleExecCommand(String(command))} title={String(title)} aria-label={String(title)} aria-pressed={Boolean(active)} className={`toolbar-icon ${active?'is-active':''}`}><Icon /></button>)}
              </div>
              <div className="toolbar-command-group">
                {[[AlignLeft,'justifyLeft','left','Rata kiri'],[AlignCenter,'justifyCenter','center','Rata tengah'],[AlignRight,'justifyRight','right','Rata kanan'],[AlignJustify,'justifyFull','justify','Rata penuh']].map(([Icon,command,alignment,title])=>{const active=activeFormatting.align===alignment;return <button key={String(command)} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>handleExecCommand(String(command))} title={String(title)} aria-label={String(title)} aria-pressed={active} className={`toolbar-icon ${active?'is-active':''}`}><Icon /></button>})}
              </div>
              <div className="toolbar-command-group">
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>handleExecCommand('outdent')} title="Kurangi indentasi" aria-label="Kurangi indentasi" className="toolbar-icon"><IndentDecrease /></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>handleExecCommand('indent')} title="Tambah indentasi" aria-label="Tambah indentasi" className="toolbar-icon"><IndentIncrease /></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>handleInsertList('1')} title="Penomoran" aria-label="Penomoran" aria-pressed={activeFormatting.orderedList} className={`toolbar-icon ${activeFormatting.orderedList?'is-active':''}`}><ListOrdered /></button>
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>handleExecCommand('insertUnorderedList')} title="Bullet" aria-label="Bullet" aria-pressed={activeFormatting.unorderedList} className={`toolbar-icon ${activeFormatting.unorderedList?'is-active':''}`}><List /></button>
              </div>
              <div className="toolbar-command-group">
                <input ref={tableFileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" multiple onChange={handleInsertImageToActiveSection} className="hidden" />
                <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>{if(tableFileInputRef.current){tableFileInputRef.current.value='';tableFileInputRef.current.click();}}} className="toolbar-icon" title="Sisipkan Gambar" aria-label="Sisipkan Gambar"><ImagePlus /></button>
                <div className="relative"><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>setShowInsertMenu(v=>!v)} className="toolbar-icon" title="Sisipkan Tabel" aria-label="Sisipkan Tabel" aria-expanded={showInsertMenu}><Table2 /></button>{showInsertMenu&&<div className="insert-menu-popover absolute top-full right-0 z-50 mt-1 w-40 rounded-md border bg-white p-2 shadow-xl"><p className="mb-1 text-[10px] font-bold">Sisipkan Tabel</p><div className="grid grid-cols-3 gap-1">{[[2,2],[2,3],[3,3],[4,4],[5,5]].map(([r,c])=><button key={`${r}-${c}`} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>{getActiveEditor()?.insertTable(r,c);setShowInsertMenu(false)}} className="rounded border p-1 text-[10px] hover:bg-indigo-50">{r}×{c}</button>)}</div></div>}</div>
              </div>
            </>}

            {activeToolMode === 'table' && <div className="toolbar-command-group table-command-group">
              <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e=>e.preventDefault()} onClick={()=>getActiveEditor()?.toggleTableAutoFit()} aria-pressed={activeFormatting.tableAutoFit} className={`toolbar-icon ${activeFormatting.tableAutoFit?'is-active':''}`} title="Sesuaikan Lebar Tabel" aria-label="Sesuaikan Lebar Tabel"><Maximize2 /></button>
              <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e=>e.preventDefault()} onClick={()=>handleTableCommand('add-row')} className="toolbar-icon" title="Tambah Baris" aria-label="Tambah Baris"><Rows3 /></button>
              <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e=>e.preventDefault()} onClick={()=>handleTableCommand('add-column')} className="toolbar-icon" title="Tambah Kolom" aria-label="Tambah Kolom"><Columns3 /></button>
              <button type="button" disabled={!activeFormatting.canMerge} onMouseDown={e=>e.preventDefault()} onClick={()=>handleTableCommand('merge-right')} className="toolbar-icon" title="Gabung Sel" aria-label="Gabung Sel"><Merge /></button>
              <button type="button" disabled={!activeFormatting.canSplit} onMouseDown={e=>e.preventDefault()} onClick={()=>handleTableCommand('split-cell')} className="toolbar-icon" title="Pisahkan Sel" aria-label="Pisahkan Sel"><Split /></button>
              <div className="relative"><button type="button" disabled={!activeFormatting.inTable} onMouseDown={e=>e.preventDefault()} onClick={()=>setShowTableMenu(v=>!v)} aria-expanded={showTableMenu} className="toolbar-icon" title="Posisi Tabel" aria-label="Posisi Tabel"><MoveHorizontal /></button>{showTableMenu&&<div className="table-tools-menu table-position-menu right-0">{([[AlignLeft,'left','Posisi kiri'],[AlignCenter,'center','Posisi tengah'],[AlignRight,'right','Posisi kanan']] as const).map(([Icon,alignment,title])=><button type="button" key={alignment} aria-pressed={activeFormatting.tableAlign===alignment} className={activeFormatting.tableAlign===alignment?'is-active':''} title={title} aria-label={title} onMouseDown={e=>e.preventDefault()} onClick={()=>{handleTableAlignment(alignment);setActiveFormatting(current=>({...current,tableAlign:alignment}));setShowTableMenu(false)}}><Icon /></button>)}</div>}</div>
              <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e=>e.preventDefault()} onClick={()=>handleTableCommand('delete-row')} className="toolbar-icon toolbar-danger" title="Hapus Baris" aria-label="Hapus Baris"><Rows3 /></button>
              <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e=>e.preventDefault()} onClick={()=>handleTableCommand('delete-column')} className="toolbar-icon toolbar-danger" title="Hapus Kolom" aria-label="Hapus Kolom"><Columns3 /></button>
              <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e=>e.preventDefault()} onClick={()=>handleTableCommand('delete-table')} className="toolbar-icon toolbar-danger" title="Hapus Tabel" aria-label="Hapus Tabel"><Trash2 /></button>
            </div>}

            {activeToolMode === 'image' && <div className="toolbar-command-group image-command-group">
              {([[Minimize2,25,'Lebar gambar 25%'],[Minimize,50,'Lebar gambar 50%'],[Maximize,75,'Lebar gambar 75%'],[Maximize2,100,'Lebar gambar 100%']] as const).map(([Icon,percent,title])=><button key={percent} type="button" disabled={activeFormatting.context!=='image'} onMouseDown={e=>e.preventDefault()} onClick={()=>getActiveEditor()?.applyImageWidth(percent)} title={title} aria-label={title} aria-pressed={activeFormatting.imageWidth===percent} className={`toolbar-icon ${activeFormatting.imageWidth===percent?'is-active':''}`}><Icon /></button>)}
              {([[AlignLeft,'left','Posisi gambar kiri'],[AlignCenter,'center','Posisi gambar tengah'],[AlignRight,'right','Posisi gambar kanan']] as const).map(([Icon,alignment,title])=><button key={alignment} type="button" disabled={activeFormatting.context!=='image'} onMouseDown={e=>e.preventDefault()} onClick={()=>getActiveEditor()?.applyImageAlignment(alignment)} title={title} aria-label={title} aria-pressed={activeFormatting.imageAlign===alignment} className={`toolbar-icon ${activeFormatting.imageAlign===alignment?'is-active':''}`}><Icon /></button>)}
              <button type="button" disabled={activeFormatting.context!=='image'} onMouseDown={e=>e.preventDefault()} onClick={()=>getActiveEditor()?.applyImageWrap(activeFormatting.imageWrap==='top-bottom'?'square':'top-bottom')} title="Bungkus Teks pada Gambar" aria-label="Bungkus Teks pada Gambar" aria-pressed={activeFormatting.imageWrap!=='top-bottom'} className={`toolbar-icon ${activeFormatting.imageWrap!=='top-bottom'?'is-active':''}`}><WrapText /></button>
              <button type="button" disabled={activeFormatting.context!=='image'} onMouseDown={e=>e.preventDefault()} onClick={()=>getActiveEditor()?.resetImage()} className="toolbar-icon" title="Atur Ulang Gambar" aria-label="Atur Ulang Gambar"><RotateCcw /></button>
              <button type="button" disabled={activeFormatting.context!=='image'} onMouseDown={e=>e.preventDefault()} onClick={()=>getActiveEditor()?.deleteImage()} className="toolbar-icon toolbar-danger" title="Hapus Gambar" aria-label="Hapus Gambar"><Trash2 /></button>
            </div>}
          </div>

          <div className="sop-live-a4-page-stack">
            <table className="sop-official-table sop-live-a4-document font-bookman text-black" style={{ border: '1px solid #000' }}>
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
                  <td className="border border-black p-0 text-center font-extrabold uppercase align-middle bg-white whitespace-normal [word-break:normal] [overflow-wrap:break-word] sop-document-type-label">
                    <div className="sop-document-type-label-inner">
                      <div>STANDAR</div>
                      <div>PROSEDUR</div>
                      <div>OPERASIONAL</div>
                    </div>
                  </td>
                  <td className="border border-black p-2 text-center align-top bg-white">
                    <div className="text-[10px] font-bookman">Tanggal terbit</div>
                    {dateEditable ? (
                      <input value={effectiveDate} onChange={(e) => onEffectiveDateChange(e.target.value)} type="date" className="w-full mt-1 text-center text-xs font-bold border-0 outline-none bg-transparent" />
                    ) : (
                      <div className="mt-1 text-xs font-bold">{effectiveDate || '……………'}</div>
                    )}
                  </td>
                  <td colSpan={2} className="border border-black p-2 text-center align-top bg-white relative overflow-visible">
                    <div className="text-[11px] font-bookman text-black leading-tight">Ditetapkan,</div>
                    <div className="font-bold text-xs sm:text-[13px] font-bookman text-black leading-tight mt-0.5 relative z-0 whitespace-normal [word-break:normal] [overflow-wrap:break-word]">Direktur RSUD Dr. Soegiri Lamongan</div>
                    {showSignatureAndStamp ? (
                      <div className="relative -my-5 sm:-my-6 flex items-center justify-center w-full max-w-[260px] mx-auto z-10 pointer-events-none">
                        <DirectorSignature className="h-[96px] sm:h-[106px] w-auto max-w-[260px]" />
                      </div>
                    ) : (
                      <div className="h-[38px] my-1" aria-hidden="true" />
                    )}
                    <div className="relative z-0 space-y-0.5">
                      <div className="font-bold text-xs sm:text-sm underline font-bookman text-black leading-tight whitespace-normal [word-break:normal] [overflow-wrap:break-word]">{approverName || SOEGIRI_HOSPITAL_INFO.director.name}</div>
                      <div className="text-[10px] sm:text-[11px] font-bookman text-black leading-tight whitespace-normal [word-break:normal] [overflow-wrap:break-word]">{SOEGIRI_HOSPITAL_INFO.director.rank}</div>
                      <div className="font-bold text-[10px] sm:text-[11px] font-bookman text-black leading-tight whitespace-normal [word-break:normal] [overflow-wrap:break-word]">NIP. {SOEGIRI_HOSPITAL_INFO.director.nip}</div>
                    </div>
                  </td>
                </tr>

                <tr >
                  <td className={`border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word]`}>
                    <div className="flex flex-col gap-0.5">
                      <span>PENGERTIAN</span>
                      
                    </div>
                  </td>
                  <td colSpan={3} className={`border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content`}>
                    <RichTextEditor
                      ref={pengertianEditorRef}
                      label=""
                      value={pengertian}
                      onChange={onPengertianChange}
                      placeholder="Isi pengertian..."
                      minHeight="85px"
                      allowImageUpload={true}
                      hideToolbar={true}
                      variant="seamless"
                      onFocus={() => setActiveTableSection('pengertian')}
                      onFormattingChange={setActiveFormatting}
                    />
                  </td>
                </tr>
                <tr >
                  <td className={`border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word]`}>
                    <div className="flex flex-col gap-0.5">
                      <span>TUJUAN</span>
                      
                    </div>
                  </td>
                  <td colSpan={3} className={`border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content`}>
                    <RichTextEditor
                      ref={tujuanEditorRef}
                      label=""
                      value={tujuan}
                      onChange={onTujuanChange}
                      placeholder="Isi tujuan..."
                      minHeight="85px"
                      allowImageUpload={true}
                      hideToolbar={true}
                      variant="seamless"
                      onFocus={() => setActiveTableSection('tujuan')}
                      onFormattingChange={setActiveFormatting}
                    />
                  </td>
                </tr>
                <tr >
                  <td className={`border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word]`}>
                    <div className="flex flex-col gap-0.5">
                      <span>KEBIJAKAN</span>
                      
                    </div>
                  </td>
                  <td colSpan={3} className={`border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content`}>
                    <RichTextEditor
                      ref={kebijakanEditorRef}
                      label=""
                      value={kebijakan}
                      onChange={onKebijakanChange}
                      placeholder="Isi kebijakan / dasar hukum..."
                      minHeight="85px"
                      allowImageUpload={true}
                      hideToolbar={true}
                      variant="seamless"
                      onFocus={() => setActiveTableSection('kebijakan')}
                      onFormattingChange={setActiveFormatting}
                    />
                  </td>
                </tr>
                <tr >
                  <td className={`border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word]`}>
                    <div className="flex flex-col gap-0.5">
                      <span>PROSEDUR</span>
                      
                    </div>
                  </td>
                  <td colSpan={3} className={`border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content`}>
                    <RichTextEditor
                      ref={prosedurEditorRef}
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
                      onFormattingChange={setActiveFormatting}
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
                  <td colSpan={3} className="border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content">
                    <RichTextEditor
                      ref={alurEditorRef}
                      label=""
                      value={alur}
                      onChange={onAlurChange}
                      placeholder="Opsional — isi bagan alir / alur kerja..."
                      minHeight="85px"
                      allowImageUpload={true}
                      hideToolbar={true}
                      variant="seamless"
                      onFocus={() => setActiveTableSection('alur')}
                      onFormattingChange={setActiveFormatting}
                    />
                  </td>
                </tr>
                <tr >
                  <td className={`border border-black p-2 font-bold uppercase align-top text-xs font-bookman whitespace-normal [word-break:normal] [overflow-wrap:break-word]`}>
                    <div className="flex flex-col gap-0.5">
                      <span>UNIT TERKAIT</span>
                      
                    </div>
                  </td>
                  <td colSpan={3} className={`border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content`}>
                    <RichTextEditor
                      ref={unitTerkaitEditorRef}
                      label=""
                      value={unitTerkait}
                      onChange={onUnitTerkaitChange}
                      placeholder="Sebutkan instalasi, ruangan, atau tim kerja terkait..."
                      minHeight="85px"
                      allowImageUpload={true}
                      hideToolbar={true}
                      variant="seamless"
                      onFocus={() => setActiveTableSection('unitTerkait')}
                      onFormattingChange={setActiveFormatting}
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
