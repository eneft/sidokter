import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
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
  Check,
  ZoomIn
} from 'lucide-react';
import type { TableCommand } from '../utils/editorTableCommands';
import { RichTextEditor, type LiveSopFontSize, type RichTextEditorHandle, type RichTextFormattingState } from './RichTextEditor';
import { HospitalLogo } from './HospitalLogo';
import { DirectorSignature } from './DirectorSignature';
import { SOEGIRI_HOSPITAL_INFO } from '../utils/soegiriStructure';
import { 
  buildOfficialBlocks, 
  computeCanonicalA4Pages,
  LIVE_SOP_SECTION_MIN_HEIGHT_PX,
  type OfficialBlock, 
  type OfficialSectionKey 
} from '../utils/canonicalA4Pagination';

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
  /** Sticky offset for the desktop context toolbar. Defaults to modal-friendly top-2. */
  toolbarStickyTopClassName?: string;
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
  missingSections = [],
  toolbarStickyTopClassName = 'top-2',
  showSignatureAndStamp = false,
}) => {
  // ---------------------------------------------------------------------------
  // Canonical Zoom/Scale Viewport
  // Desktop, tablet, and mobile render the EXACT same canonical A4 DOM.
  // Smaller viewports visually scale the pages without reflow.
  // ---------------------------------------------------------------------------
  const [zoomMode, setZoomMode] = useState<'fit' | '50%' | '75%' | '100%'>('fit');
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewportRef.current) return;
    const updateWidth = () => {
      if (viewportRef.current) {
        setViewportWidth(viewportRef.current.clientWidth);
      }
    };
    updateWidth();
    const obs = new ResizeObserver(updateWidth);
    obs.observe(viewportRef.current);
    return () => obs.disconnect();
  }, []);

  const calculatedScale = useMemo(() => {
    if (zoomMode === '50%') return 0.5;
    if (zoomMode === '75%') return 0.75;
    if (zoomMode === '100%') return 1;
    // 'fit' mode: 210mm at 96 DPI is ~793.7px
    const a4Px = 793.7;
    if (viewportWidth > 0 && viewportWidth < a4Px + 32) {
      return Math.max(0.35, Math.min(1, (viewportWidth - 32) / a4Px));
    }
    return 1;
  }, [zoomMode, viewportWidth]);

  // ---------------------------------------------------------------------------
  // Canonical A4 Multi-Page Pagination
  // Uses the single canonical engine shared with Preview and PDF.
  // ---------------------------------------------------------------------------
  const [activeTableSection, setActiveTableSection] = useState<
    'pengertian' | 'tujuan' | 'kebijakan' | 'prosedur' | 'alur' | 'unitTerkait'
  >('pengertian');
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [activeToolMode, setActiveToolMode] = useState<'text' | 'table' | 'image'>('text');
  const tableFileInputRef = useRef<HTMLInputElement>(null);

  // Maintain active editor references. Multi-page sections can mount more than
  // one RichTextEditor, so toolbar ownership must be tied to the fragment that
  // the user actually focused instead of whichever fragment mounted last.
  const editorRefs = useRef<{ [key: string]: RichTextEditorHandle | null }>({});
  const activeEditorRef = useRef<RichTextEditorHandle | null>(null);
  const activeEditorKeyRef = useRef<string | null>(null);

  const [activeFormatting, setActiveFormatting] = useState<RichTextFormattingState>({
    bold: false,
    italic: false,
    underline: false,
    align: 'left',
    orderedList: false,
    unorderedList: false,
    fontSize: null,
    inTable: false,
    context: 'text',
    tableAutoFit: false,
    canMerge: false,
    canSplit: false,
    tableAlign: 'left',
  });

  const getActiveEditor = (): RichTextEditorHandle | null => {
    const activeKey = activeEditorKeyRef.current;
    if (activeKey) {
      const focusedFragment = editorRefs.current[activeKey];
      if (focusedFragment) return focusedFragment;
    }
    return activeEditorRef.current || editorRefs.current[activeTableSection] || null;
  };

  const handleTableCommand = (command: TableCommand) => getActiveEditor()?.executeTableCommand(command);
  const handleTableAlignment = (alignment: 'left' | 'center' | 'right') => getActiveEditor()?.alignTable(alignment);

  useEffect(() => {
    if (!activeFormatting.inTable) setShowTableMenu(false);
  }, [activeFormatting.inTable]);

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

  // ---------------------------------------------------------------------------
  // Canonical Blocks & Debounced Multi-Page Assembly
  // ---------------------------------------------------------------------------
  const rawSections = useMemo(
    () => ({
      pengertian,
      tujuan,
      kebijakan,
      prosedur,
      alur,
      unitTerkait
    }),
    [pengertian, tujuan, kebijakan, prosedur, alur, unitTerkait]
  );

  const officialBlocks = useMemo(() => {
    return buildOfficialBlocks(rawSections);
  }, [rawSections]);

  const [debouncedBlocks, setDebouncedBlocks] = useState<OfficialBlock[]>(officialBlocks);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBlocks(officialBlocks);
    }, 250);
    return () => clearTimeout(timer);
  }, [officialBlocks]);

  // Scoped physical-page measurements for THIS LiveSPO instance.  Pagination
  // must not borrow a header from Preview/another modal through document.querySelector.
  const liveMeasureRootRef = useRef<HTMLDivElement>(null);
  const [livePageMetrics, setLivePageMetrics] = useState<{ headerHeightPx: number; publicationHeightPx: number } | null>(null);

  useEffect(() => {
    const root = liveMeasureRootRef.current;
    if (!root) return;

    let frame = 0;
    const measure = () => {
      frame = requestAnimationFrame(() => {
        const header = root.querySelector<HTMLElement>('[data-live-measure-header]');
        const publication = root.querySelector<HTMLElement>('[data-live-measure-publication]');
        if (!header || !publication) return;
        const headerHeightPx = header.getBoundingClientRect().height;
        const publicationHeightPx = publication.getBoundingClientRect().height;
        if (headerHeightPx <= 0 || publicationHeightPx <= 0) return;
        setLivePageMetrics((prev) =>
          prev && Math.abs(prev.headerHeightPx - headerHeightPx) < 0.5 && Math.abs(prev.publicationHeightPx - publicationHeightPx) < 0.5
            ? prev
            : { headerHeightPx, publicationHeightPx }
        );
      });
    };

    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(root);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [title, sopNumber, version, effectiveDate, approverName]);

  const calculatedPages = useMemo(() => {
    // Never paginate from guessed KOP geometry. Until the scoped physical A4
    // shell has been measured, keep the source flow intact for this first frame.
    if (!livePageMetrics) return [];
    return computeCanonicalA4Pages(debouncedBlocks, livePageMetrics);
  }, [debouncedBlocks, livePageMetrics]);

  const totalPages = Math.max(1, calculatedPages.length);

  // Track missing sections for validation indicators
  const isPengertianMissing = missingSections.includes('PENGERTIAN');
  const isTujuanMissing = missingSections.includes('TUJUAN');
  const isKebijakanMissing = missingSections.includes('KEBIJAKAN');
  const isProsedurMissing = missingSections.includes('PROSEDUR');
  const isUnitTerkaitMissing = missingSections.includes('UNIT TERKAIT');

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

  const sectionsNav = [
    { id: 'pengertian', label: '1. Pengertian', isMissing: isPengertianMissing, hasData: hasContent(pengertian), req: true },
    { id: 'tujuan', label: '2. Tujuan', isMissing: isTujuanMissing, hasData: hasContent(tujuan), req: true },
    { id: 'kebijakan', label: '3. Kebijakan', isMissing: isKebijakanMissing, hasData: hasContent(kebijakan), req: true },
    { id: 'prosedur', label: '4. Prosedur', isMissing: isProsedurMissing, hasData: hasContent(prosedur), req: true },
    { id: 'alur', label: '5. Alur', isMissing: false, hasData: hasContent(alur), req: false },
    { id: 'unitTerkait', label: '6. Unit Terkait', isMissing: isUnitTerkaitMissing, hasData: hasContent(unitTerkait), req: true },
  ];

  const scrollToSection = (sectionKey: typeof activeTableSection) => {
    setActiveTableSection(sectionKey);
    const target = editorRefs.current[sectionKey];
    if (target) {
      // focus() will publish the exact page-fragment key through onFocus. Keep
      // this fallback only for the tiny interval before that focus event fires.
      activeEditorRef.current = target;
      target.focus();
    }
  };

  // ---------------------------------------------------------------------------
  // Render Official Hospital Header for Page X
  // ---------------------------------------------------------------------------
  const renderOfficialHeader = (pageNumber: number, total: number) => {
    return (
      <thead>
        <tr>
          <th rowSpan={2} className="border border-black p-3 text-center align-middle bg-white w-[28%] font-normal">
            <HospitalLogo imgClassName="w-[54px] h-[54px] mx-auto" className="mb-1" />
            <div className="font-extrabold text-[11px] leading-tight uppercase text-black">RSUD Dr. SOEGIRI</div>
            <div className="font-extrabold text-[11px] leading-tight uppercase text-black">LAMONGAN</div>
          </th>
          <th colSpan={3} className="border border-black p-3 text-center align-middle bg-white w-[72%] font-normal">
            {titleEditable && pageNumber === 1 ? (
              <textarea
                rows={1}
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="JUDUL STANDAR PROSEDUR OPERASIONAL"
                className="w-full min-h-[20px] text-center font-extrabold uppercase text-xs sm:text-sm bg-transparent border-0 outline-none placeholder:text-slate-400 font-bookman leading-snug resize-none overflow-hidden whitespace-normal [word-break:normal] [overflow-wrap:break-word] [hyphens:none] text-black"
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />
            ) : (
              <div className="text-center font-extrabold uppercase text-xs sm:text-sm min-h-[20px] whitespace-normal [word-break:normal] [overflow-wrap:break-word] [hyphens:none] font-bookman leading-snug text-black">
                {title || 'JUDUL STANDAR PROSEDUR OPERASIONAL'}
              </div>
            )}
          </th>
        </tr>
        <tr>
          <th className="border border-black p-2 text-center align-top bg-white w-[24%] font-normal">
            <div className="font-bold text-[10px] uppercase font-bookman text-black">NO. DOKUMEN</div>
            <div className={`text-xs font-bold mt-1 whitespace-normal [word-break:normal] [overflow-wrap:break-word] ${sopNumber?.includes('Akan Terbit') || sopNumber?.includes('Belum') ? 'text-indigo-600 italic font-sans text-[11px]' : 'text-black'}`}>
              {sopNumber || '……/……/……/2026'}
            </div>
          </th>
          <th className="border border-black p-2 text-center align-top bg-white w-[24%] font-normal">
            <div className="font-bold text-[10px] uppercase font-bookman text-black">NO. REVISI</div>
            <div className="text-xs font-bold mt-1 whitespace-normal [word-break:normal] [overflow-wrap:break-word] text-black">
              {version || '00'}
            </div>
          </th>
          <th className="border border-black p-2 text-center align-top bg-white w-[24%] font-normal">
            <div className="font-bold text-[10px] uppercase font-bookman text-black">HALAMAN</div>
            <div className="text-xs font-bold mt-1 whitespace-normal [word-break:normal] [overflow-wrap:break-word] text-black">
              {pageNumber} / {total}
            </div>
          </th>
        </tr>
      </thead>
    );
  };

  // ---------------------------------------------------------------------------
  // Render Official Publication Row (Page 1 only)
  // ---------------------------------------------------------------------------
  const renderPublicationRow = () => {
    return (
      <tr>
        <td className="border border-black p-0 text-center font-extrabold uppercase align-middle bg-white whitespace-normal [word-break:normal] [overflow-wrap:break-word] sop-document-type-label w-[28%]">
          <div className="sop-document-type-label-inner text-black font-extrabold">
            <div>STANDAR</div>
            <div>PROSEDUR</div>
            <div>OPERASIONAL</div>
          </div>
        </td>
        <td className="border border-black p-2 text-center align-top bg-white w-[24%]">
          <div className="text-[10px] font-bookman text-black">Tanggal terbit</div>
          {dateEditable ? (
            <input
              value={effectiveDate}
              onChange={(e) => onEffectiveDateChange(e.target.value)}
              type="date"
              className="w-full mt-1 text-center text-xs font-bold border-0 outline-none bg-transparent text-black"
            />
          ) : (
            <div className="mt-1 text-xs font-bold text-black">{effectiveDate || '……………'}</div>
          )}
        </td>
        <td colSpan={2} className="border border-black p-2 text-center align-top bg-white relative overflow-visible w-[48%]">
          <div className="text-[11px] font-bookman text-black leading-tight">Ditetapkan,</div>
          <div className="font-bold text-xs sm:text-[13px] font-bookman text-black leading-tight mt-0.5 relative z-0 whitespace-normal [word-break:normal] [overflow-wrap:break-word]">
            Direktur RSUD Dr. Soegiri Lamongan
          </div>
          {showSignatureAndStamp ? (
            <div className="relative -my-5 sm:-my-6 flex items-center justify-center w-full max-w-[260px] mx-auto z-10 pointer-events-none">
              <DirectorSignature className="h-[96px] sm:h-[106px] w-auto max-w-[260px]" />
            </div>
          ) : (
            <div className="h-[36px] my-1" aria-hidden="true" />
          )}
          <div className="relative z-0 space-y-0.5">
            <div className="font-bold text-xs sm:text-sm underline font-bookman text-black leading-tight whitespace-normal [word-break:normal] [overflow-wrap:break-word]">
              {approverName || SOEGIRI_HOSPITAL_INFO.director.name}
            </div>
            <div className="text-[10px] sm:text-[11px] font-bookman text-black leading-tight whitespace-normal [word-break:normal] [overflow-wrap:break-word]">
              {SOEGIRI_HOSPITAL_INFO.director.rank}
            </div>
            <div className="font-bold text-[10px] sm:text-[11px] font-bookman text-black leading-tight whitespace-normal [word-break:normal] [overflow-wrap:break-word]">
              NIP. {SOEGIRI_HOSPITAL_INFO.director.nip}
            </div>
          </div>
        </td>
      </tr>
    );
  };

  // ---------------------------------------------------------------------------
  // Helper to map OfficialSectionKey to active state and callbacks
  // ---------------------------------------------------------------------------
  const getSectionConfig = (key: OfficialSectionKey) => {
    switch (key) {
      case 'PENGERTIAN':
        return {
          id: 'pengertian' as const,
          val: pengertian,
          onChange: onPengertianChange,
          placeholder: 'Isi pengertian...',
          minHeight: `${LIVE_SOP_SECTION_MIN_HEIGHT_PX}px`,
          isMissing: isPengertianMissing
        };
      case 'TUJUAN':
        return {
          id: 'tujuan' as const,
          val: tujuan,
          onChange: onTujuanChange,
          placeholder: 'Isi tujuan...',
          minHeight: `${LIVE_SOP_SECTION_MIN_HEIGHT_PX}px`,
          isMissing: isTujuanMissing
        };
      case 'KEBIJAKAN':
        return {
          id: 'kebijakan' as const,
          val: kebijakan,
          onChange: onKebijakanChange,
          placeholder: 'Isi rujukan Keputusan Direktur / Kebijakan RSUD Dr. Soegiri...',
          minHeight: `${LIVE_SOP_SECTION_MIN_HEIGHT_PX}px`,
          isMissing: isKebijakanMissing
        };
      case 'PROSEDUR':
        return {
          id: 'prosedur' as const,
          val: prosedur,
          onChange: onProsedurChange,
          placeholder: '1. Langkah persiapan...\n2. Langkah pelaksanaan...\n3. Langkah penutupan...',
          minHeight: `${LIVE_SOP_SECTION_MIN_HEIGHT_PX}px`,
          isMissing: isProsedurMissing
        };
      case 'ALUR / BAGAN ALIR':
        return {
          id: 'alur' as const,
          val: alur,
          onChange: onAlurChange,
          placeholder: 'Opsional — sisipkan bagan alur atau deskripsi alur kerja...',
          minHeight: `${LIVE_SOP_SECTION_MIN_HEIGHT_PX}px`,
          isMissing: false
        };
      case 'UNIT TERKAIT':
        return {
          id: 'unitTerkait' as const,
          val: unitTerkait,
          onChange: onUnitTerkaitChange,
          placeholder: 'Sebutkan instalasi, ruangan, atau tim kerja terkait...',
          minHeight: `${LIVE_SOP_SECTION_MIN_HEIGHT_PX}px`,
          isMissing: isUnitTerkaitMissing
        };
    }
  };

  return (
    <div className="space-y-3.5 animate-fadeIn">
      {/* =======================================================================
          TOP CONTROLS: SECTION CHIPS & CANONICAL A4 SCALING CONTROLS
          Desktop, tablet, and mobile all operate on canonical A4 geometry.
         ======================================================================= */}
      <div className="sticky top-0 z-20 -mx-1 px-1 py-1.5 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="flex items-center justify-between gap-2">
          {/* Quick Jump Navigation Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-0.5">
            {sectionsNav.map((sec) => {
              const isActive = activeTableSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => scrollToSection(sec.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 border touch-manipulation cursor-pointer ${
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

          {/* Zoom / Scale Viewer Controls */}
          <div className="flex items-center gap-1.5 shrink-0 bg-slate-100/90 border border-slate-200 rounded-lg px-2 py-1 text-xs">
            <ZoomIn className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-600 hidden sm:inline">Skala:</span>
            <select
              aria-label="Skala A4"
              value={zoomMode}
              onChange={(e) => setZoomMode(e.target.value as any)}
              className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="fit">Otomatis (Fit)</option>
              <option value="50%">50%</option>
              <option value="75%">75%</option>
              <option value="100%">100% (A4 Fisik)</option>
            </select>
            <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-1 py-0.5 rounded">
              {Math.round(calculatedScale * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* =======================================================================
          RICH TEXT CONTEXT TOOLBAR
          Stays pinned above document for desktop, tablet, and mobile.
         ======================================================================= */}
      <div className={`live-spo-context-toolbar sticky ${toolbarStickyTopClassName} z-30 w-full max-w-[900px] mx-auto bg-white text-slate-700 rounded-xl shadow-sm border border-slate-200 px-2 py-1 flex items-center gap-1 text-xs select-none overflow-visible`}>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-slate-400 font-semibold uppercase hidden sm:inline">Bagian:</span>
          <select
            value={activeTableSection}
            onChange={(e) => scrollToSection(e.target.value as typeof activeTableSection)}
            className="h-6 max-w-32 text-[10px] font-bold bg-white border border-slate-200 rounded px-1"
          >
            <option value="pengertian">PENGERTIAN</option>
            <option value="tujuan">TUJUAN</option>
            <option value="kebijakan">KEBIJAKAN</option>
            <option value="prosedur">PROSEDUR</option>
            <option value="alur">ALUR</option>
            <option value="unitTerkait">UNIT TERKAIT</option>
          </select>
        </div>

        <div className="toolbar-mode-switch" aria-label="Mode toolbar">
          <button type="button" aria-pressed={activeToolMode === 'text'} onMouseDown={(e) => e.preventDefault()} onClick={() => setActiveToolMode('text')} title="Mode Teks" aria-label="Mode Teks"><Type /></button>
          <button type="button" aria-pressed={activeToolMode === 'table'} onMouseDown={(e) => e.preventDefault()} onClick={() => setActiveToolMode('table')} title="Mode Tabel" aria-label="Mode Tabel"><Table2 /></button>
          <button type="button" aria-pressed={activeToolMode === 'image'} onMouseDown={(e) => e.preventDefault()} onClick={() => setActiveToolMode('image')} title="Mode Gambar" aria-label="Mode Gambar"><ImageIcon /></button>
        </div>

        {activeToolMode === 'text' && (
          <>
            <div className="toolbar-command-group">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleExecCommand('undo')} title="Batalkan" aria-label="Batalkan" className="toolbar-icon"><Undo2 /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleExecCommand('redo')} title="Ulangi" aria-label="Ulangi" className="toolbar-icon"><Redo2 /></button>
            </div>
            <select
              aria-label="Ukuran huruf"
              value={activeFormatting.fontSize || '12pt'}
              onChange={(e) => getActiveEditor()?.applyFontSize(e.target.value as LiveSopFontSize)}
              className="h-6 w-14 shrink-0 rounded border border-slate-200 bg-white px-1 text-[10px] font-semibold"
            >
              <option value="12pt">12 pt</option>
              <option value="10pt">10 pt</option>
              <option value="8pt">8 pt</option>
            </select>
            <div className="toolbar-command-group">
              {[[Bold, 'bold', 'Tebal', activeFormatting.bold], [Italic, 'italic', 'Miring', activeFormatting.italic], [Underline, 'underline', 'Garis bawah', activeFormatting.underline]].map(([Icon, command, label, active]) => (
                <button key={String(command)} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleExecCommand(String(command))} title={String(label)} aria-label={String(label)} aria-pressed={Boolean(active)} className={`toolbar-icon ${active ? 'is-active' : ''}`}><Icon /></button>
              ))}
            </div>
            <div className="toolbar-command-group">
              {[[AlignLeft, 'justifyLeft', 'left', 'Rata kiri'], [AlignCenter, 'justifyCenter', 'center', 'Rata tengah'], [AlignRight, 'justifyRight', 'right', 'Rata kanan'], [AlignJustify, 'justifyFull', 'justify', 'Rata penuh']].map(([Icon, command, alignment, label]) => {
                const active = activeFormatting.align === alignment;
                return (
                  <button key={String(command)} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleExecCommand(String(command))} title={String(label)} aria-label={String(label)} aria-pressed={active} className={`toolbar-icon ${active ? 'is-active' : ''}`}><Icon /></button>
                );
              })}
            </div>
            <div className="toolbar-command-group">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleExecCommand('outdent')} title="Kurangi indentasi" aria-label="Kurangi indentasi" className="toolbar-icon"><IndentDecrease /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleExecCommand('indent')} title="Tambah indentasi" aria-label="Tambah indentasi" className="toolbar-icon"><IndentIncrease /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleInsertList('1')} title="Penomoran" aria-label="Penomoran" aria-pressed={activeFormatting.orderedList} className={`toolbar-icon ${activeFormatting.orderedList ? 'is-active' : ''}`}><ListOrdered /></button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleExecCommand('insertUnorderedList')} title="Bullet" aria-label="Bullet" aria-pressed={activeFormatting.unorderedList} className={`toolbar-icon ${activeFormatting.unorderedList ? 'is-active' : ''}`}><List /></button>
            </div>
            <div className="toolbar-command-group">
              <input ref={tableFileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" multiple onChange={handleInsertImageToActiveSection} className="hidden" />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { if (tableFileInputRef.current) { tableFileInputRef.current.value = ''; tableFileInputRef.current.click(); } }} className="toolbar-icon" title="Sisipkan Gambar" aria-label="Sisipkan Gambar"><ImagePlus /></button>
              <div className="relative">
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowInsertMenu((v) => !v)} className="toolbar-icon" title="Sisipkan Tabel" aria-label="Sisipkan Tabel" aria-expanded={showInsertMenu}><Table2 /></button>
                {showInsertMenu && (
                  <div className="insert-menu-popover absolute top-full right-0 z-50 mt-1 w-40 rounded-md border bg-white p-2 shadow-xl">
                    <p className="mb-1 text-[10px] font-bold">Sisipkan Tabel</p>
                    <div className="grid grid-cols-3 gap-1">
                      {[[2, 2], [2, 3], [3, 3], [4, 4], [5, 5]].map(([r, c]) => (
                        <button key={`${r}-${c}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { getActiveEditor()?.insertTable(r, c); setShowInsertMenu(false); }} className="rounded border p-1 text-[10px] hover:bg-indigo-50">{r}×{c}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeToolMode === 'table' && (
          <div className="toolbar-command-group table-command-group">
            <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e => e.preventDefault()} onClick={() => getActiveEditor()?.toggleTableAutoFit()} aria-pressed={activeFormatting.tableAutoFit} className={`toolbar-icon ${activeFormatting.tableAutoFit ? 'is-active' : ''}`} title="Sesuaikan Lebar Tabel" aria-label="Sesuaikan Lebar Tabel"><Maximize2 /></button>
            <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e => e.preventDefault()} onClick={() => handleTableCommand('add-row')} className="toolbar-icon" title="Tambah Baris" aria-label="Tambah Baris"><Rows3 /></button>
            <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e => e.preventDefault()} onClick={() => handleTableCommand('add-column')} className="toolbar-icon" title="Tambah Kolom" aria-label="Tambah Kolom"><Columns3 /></button>
            <button type="button" disabled={!activeFormatting.canMerge} onMouseDown={e => e.preventDefault()} onClick={() => handleTableCommand('merge-right')} className="toolbar-icon" title="Gabung Sel" aria-label="Gabung Sel"><Merge /></button>
            <button type="button" disabled={!activeFormatting.canSplit} onMouseDown={e => e.preventDefault()} onClick={() => handleTableCommand('split-cell')} className="toolbar-icon" title="Pisahkan Sel" aria-label="Pisahkan Sel"><Split /></button>
            <div className="relative">
              <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e => e.preventDefault()} onClick={() => setShowTableMenu((v) => !v)} aria-expanded={showTableMenu} className="toolbar-icon" title="Posisi Tabel" aria-label="Posisi Tabel"><MoveHorizontal /></button>
              {showTableMenu && (
                <div className="table-tools-menu table-position-menu right-0">
                  {([[AlignLeft, 'left', 'Posisi kiri'], [AlignCenter, 'center', 'Posisi tengah'], [AlignRight, 'right', 'Posisi kanan']] as const).map(([Icon, alignment, label]) => (
                    <button type="button" key={alignment} aria-pressed={activeFormatting.tableAlign === alignment} className={activeFormatting.tableAlign === alignment ? 'is-active' : ''} title={label} aria-label={label} onMouseDown={e => e.preventDefault()} onClick={() => { handleTableAlignment(alignment); setActiveFormatting((current) => ({ ...current, tableAlign: alignment })); setShowTableMenu(false); }}><Icon /></button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e => e.preventDefault()} onClick={() => handleTableCommand('delete-row')} className="toolbar-icon toolbar-danger" title="Hapus Baris" aria-label="Hapus Baris"><Rows3 /></button>
            <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e => e.preventDefault()} onClick={() => handleTableCommand('delete-column')} className="toolbar-icon toolbar-danger" title="Hapus Kolom" aria-label="Hapus Kolom"><Columns3 /></button>
            <button type="button" disabled={!activeFormatting.inTable} onMouseDown={e => e.preventDefault()} onClick={() => handleTableCommand('delete-table')} className="toolbar-icon toolbar-danger" title="Hapus Tabel" aria-label="Hapus Tabel"><Trash2 /></button>
          </div>
        )}

        {activeToolMode === 'image' && (
          <div className="toolbar-command-group image-command-group">
            {([[Minimize2, 25, 'Lebar gambar 25%'], [Minimize, 50, 'Lebar gambar 50%'], [Maximize, 75, 'Lebar gambar 75%'], [Maximize2, 100, 'Lebar gambar 100%']] as const).map(([Icon, percent, label]) => (
              <button key={percent} type="button" disabled={activeFormatting.context !== 'image'} onMouseDown={(e) => e.preventDefault()} onClick={() => getActiveEditor()?.applyImageWidth(percent)} title={label} aria-label={label} aria-pressed={activeFormatting.imageWidth === percent} className={`toolbar-icon ${activeFormatting.imageWidth === percent ? 'is-active' : ''}`}><Icon /></button>
            ))}
            {([[AlignLeft, 'left', 'Posisi gambar kiri'], [AlignCenter, 'center', 'Posisi gambar tengah'], [AlignRight, 'right', 'Posisi gambar kanan']] as const).map(([Icon, alignment, label]) => (
              <button key={alignment} type="button" disabled={activeFormatting.context !== 'image'} onMouseDown={(e) => e.preventDefault()} onClick={() => getActiveEditor()?.applyImageAlignment(alignment)} title={label} aria-label={label} aria-pressed={activeFormatting.imageAlign === alignment} className={`toolbar-icon ${activeFormatting.imageAlign === alignment ? 'is-active' : ''}`}><Icon /></button>
            ))}
            <button type="button" disabled={activeFormatting.context !== 'image'} onMouseDown={(e) => e.preventDefault()} onClick={() => getActiveEditor()?.applyImageWrap(activeFormatting.imageWrap === 'top-bottom' ? 'square' : 'top-bottom')} title="Bungkus Teks pada Gambar" aria-label="Bungkus Teks pada Gambar" aria-pressed={activeFormatting.imageWrap !== 'top-bottom'} className={`toolbar-icon ${activeFormatting.imageWrap !== 'top-bottom' ? 'is-active' : ''}`}><WrapText /></button>
            <button type="button" disabled={activeFormatting.context !== 'image'} onMouseDown={(e) => e.preventDefault()} onClick={() => getActiveEditor()?.resetImage()} className="toolbar-icon" title="Atur Ulang Gambar" aria-label="Atur Ulang Gambar"><RotateCcw /></button>
            <button type="button" disabled={activeFormatting.context !== 'image'} onMouseDown={(e) => e.preventDefault()} onClick={() => getActiveEditor()?.deleteImage()} className="toolbar-icon toolbar-danger" title="Hapus Gambar" aria-label="Hapus Gambar"><Trash2 /></button>
          </div>
        )}
      </div>

      {/* Scoped canonical A4 measurement shell. It uses the exact same 170mm
          table geometry, header and publication row as the visible LiveSPO page. */}
      <div
        ref={liveMeasureRootRef}
        aria-hidden="true"
        className="fixed pointer-events-none invisible"
        style={{ left: '-10000px', top: 0, width: '210mm' }}
      >
        <div
          className="bg-white printable-paper font-bookman"
          style={{
            width: '210mm', height: '297mm', padding: '20mm',
            boxSizing: 'border-box', overflow: 'visible'
          }}
        >
          <table
            className="sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed"
            style={{ border: '1px solid #000000', borderCollapse: 'collapse', width: '100%' }}
          >
            <colgroup>
              <col style={{ width: '28%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
            {React.cloneElement(renderOfficialHeader(2, 2), { 'data-live-measure-header': true })}
            <tbody>
              {React.cloneElement(renderPublicationRow(), { 'data-live-measure-publication': true })}
            </tbody>
          </table>
        </div>
      </div>

      {/* =======================================================================
          CANONICAL A4 WYSIWYG MULTI-PAGE VIEWPORT
          - Physical page: 210mm x 297mm
          - Margins: 20mm on all sides
          - Effective content width: 170mm
          - Renders natural multi-page flow (Page 1 -> Page 2 -> Page 3...)
         ======================================================================= */}
      <div ref={viewportRef} className="sop-canonical-viewport w-full flex flex-col items-center overflow-x-auto overflow-y-visible py-2">
        <div
          style={{
            transform: calculatedScale < 1 ? `scale(${calculatedScale})` : undefined,
            transformOrigin: 'top center',
            width: '210mm',
            marginBottom: calculatedScale < 1 ? `-${Math.round((1 - calculatedScale) * (totalPages * 1123 + (totalPages - 1) * 36))}px` : undefined
          }}
          className="flex flex-col items-center transition-transform duration-150"
        >
          {!livePageMetrics && (
            <div className="w-[210mm] h-[297mm] bg-white border border-slate-200 shadow-sm flex items-center justify-center text-xs text-slate-500 font-sans">
              Menyiapkan layout A4…
            </div>
          )}

          {calculatedPages.map((pageBlocks, pageIndex) => {
            const isFirstPage = pageIndex === 0;
            const isContinuationPage = pageIndex < totalPages - 1;

            // Group blocks on this page by their official section
            const pageSectionGroups: { section: OfficialSectionKey; blocks: OfficialBlock[] }[] = [];
            pageBlocks.forEach((block) => {
              const last = pageSectionGroups[pageSectionGroups.length - 1];
              if (last && last.section === block.section) {
                last.blocks.push(block);
              } else {
                pageSectionGroups.push({ section: block.section, blocks: [block] });
              }
            });

            // All six official sections are already structural canonical blocks.
            // Do not inject page-local fallback rows here; pagination alone owns page flow.

            return (
              <React.Fragment key={`live-a4-page-${pageIndex}`}>
                {/* Visual Page Break Separator for Page 2+ */}
                {!isFirstPage && (
                  <div className="sop-page-gap my-6 flex items-center justify-center gap-3 text-xs font-bold text-slate-500 select-none w-full">
                    <div className="h-px bg-slate-300 w-28" />
                    <span className="bg-slate-100 border border-slate-300 px-3 py-1 rounded-full shadow-2xs">
                      HALAMAN {pageIndex + 1} DARI {totalPages} (A4 FISIK 210 × 297 mm)
                    </span>
                    <div className="h-px bg-slate-300 w-28" />
                  </div>
                )}

                {/* Physical A4 Page Container */}
                <div
                  data-page-index={pageIndex}
                  className="sop-live-a4-page bg-white font-bookman shadow-md rounded-xs border border-slate-300"
                  style={{
                    width: '210mm',
                    height: '297mm',
                    minHeight: '297mm',
                    maxHeight: '297mm',
                    padding: '20mm 20mm 20mm 20mm',
                    boxSizing: 'border-box',
                    backgroundColor: '#ffffff',
                    overflow: 'hidden',
                    position: 'relative',
                    marginBottom: isFirstPage && totalPages > 1 ? '0' : '24px'
                  }}
                >
                  <div
                    className="sop-a4-content-frame"
                    style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                  >
                  <table
                    className={`sop-official-table w-full border-collapse font-bookman text-black text-sm bg-white table-fixed ${isContinuationPage ? 'sop-continuation-page-table' : ''}`}
                    style={{
                      border: '1px solid #000000',
                      borderBottom: isContinuationPage ? '0' : '1px solid #000000',
                      borderCollapse: 'collapse',
                      width: '100%',
                      flexShrink: 0
                    }}
                  >
                    <colgroup>
                      <col style={{ width: '28%' }} />
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '24%' }} />
                    </colgroup>

                    {/* Header */}
                    {renderOfficialHeader(pageIndex + 1, totalPages)}

                    {/* Batang Tubuh Body */}
                    <tbody>
                      {isFirstPage && renderPublicationRow()}

                      {pageSectionGroups.map((group, groupIdx) => {
                        const cfg = getSectionConfig(group.section);
                        const isSectionActive = activeTableSection === cfg.id;

                        // If the section is contained entirely on this page, use cfg.val directly
                        // to avoid unnecessary HTML serialization differences
                        const isMultiPageSection =
                          calculatedPages.filter((p) => p.some((b) => b.section === group.section)).length > 1;

                        const fragmentHtml = isMultiPageSection
                          ? (group.blocks.length > 0 ? group.blocks.map((b) => b.html).join('') : cfg.val)
                          : cfg.val;

                        const editorKey = `${pageIndex}-${cfg.id}`;
                        const extendToPageBottom =
                          isContinuationPage && groupIdx === pageSectionGroups.length - 1;

                        return (
                          <tr
                            key={`page-${pageIndex}-group-${groupIdx}-${cfg.id}`}
                            data-sop-suppress-bottom-border={extendToPageBottom ? 'true' : undefined}
                          >
                            <td
                              className={`border border-black p-2.5 font-bold uppercase align-top text-black font-bookman sop-batang-tubuh-title whitespace-normal [word-break:normal] [overflow-wrap:break-word] w-[28%] ${cfg.isMissing ? 'text-rose-700' : 'text-black'}`}
                              style={{ borderBottom: extendToPageBottom ? '0' : undefined }}
                            >
                              {group.section === 'ALUR / BAGAN ALIR' ? (
                                <><div>ALUR /</div><div>BAGAN ALIR</div></>
                              ) : group.section === 'UNIT TERKAIT' ? (
                                <><div>UNIT</div><div>TERKAIT</div></>
                              ) : (
                                group.section
                              )}
                            </td>
                            <td
                              colSpan={3}
                              className={`border border-black p-2.5 align-top font-bookman sop-batang-tubuh-content w-[72%] ${
                                isSectionActive ? 'bg-indigo-50/10' : 'bg-white'
                              }`}
                              style={{ borderBottom: extendToPageBottom ? '0' : undefined }}
                            >
                              <RichTextEditor
                                ref={(el) => {
                                  const previous = editorRefs.current[editorKey];
                                  if (el) {
                                    editorRefs.current[editorKey] = el;
                                    // The section alias is only a navigation fallback. It must
                                    // never steal toolbar ownership from a focused fragment.
                                    if (!editorRefs.current[cfg.id]) {
                                      editorRefs.current[cfg.id] = el;
                                    }
                                    if (activeEditorKeyRef.current === editorKey) {
                                      activeEditorRef.current = el;
                                    }
                                    return;
                                  }

                                  delete editorRefs.current[editorKey];
                                  if (editorRefs.current[cfg.id] === previous) {
                                    const replacementKey = Object.keys(editorRefs.current).find(
                                      (key) => key.endsWith(`-${cfg.id}`) && Boolean(editorRefs.current[key])
                                    );
                                    editorRefs.current[cfg.id] = replacementKey
                                      ? editorRefs.current[replacementKey]
                                      : null;
                                  }
                                  if (activeEditorKeyRef.current === editorKey) {
                                    activeEditorKeyRef.current = null;
                                    activeEditorRef.current = editorRefs.current[cfg.id] || null;
                                  }
                                }}
                                label=""
                                value={fragmentHtml}
                                onChange={(newPartHtml) => {
                                  // If this section is split across multiple pages, reassemble it cleanly
                                  if (totalPages > 1 && calculatedPages.length > 1) {
                                    const allPartsForSection: string[] = [];
                                    calculatedPages.forEach((p, pIdx) => {
                                      if (pIdx === pageIndex) {
                                        allPartsForSection.push(newPartHtml);
                                      } else {
                                        const otherBlocks = p.filter((b) => b.section === group.section);
                                        if (otherBlocks.length > 0) {
                                          allPartsForSection.push(otherBlocks.map((b) => b.html).join(''));
                                        }
                                      }
                                    });
                                    cfg.onChange(allPartsForSection.join(''));
                                  } else {
                                    cfg.onChange(newPartHtml);
                                  }
                                }}
                                placeholder={cfg.placeholder}
                                minHeight={cfg.minHeight}
                                allowImageUpload={true}
                                hideToolbar={true}
                                variant="seamless"
                                onFocus={() => {
                                  setActiveTableSection(cfg.id);
                                  activeEditorKeyRef.current = editorKey;
                                  const currentEl = editorRefs.current[editorKey] || editorRefs.current[cfg.id];
                                  if (currentEl) {
                                    activeEditorRef.current = currentEl;
                                  }
                                }}
                                onFormattingChange={(formatting) => {
                                  // Inactive fragments still emit formatting while pagination
                                  // remounts. Only the focused owner may drive the shared toolbar.
                                  if (activeEditorKeyRef.current === editorKey) {
                                    setActiveFormatting(formatting);
                                  }
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {isContinuationPage && (
                    <div
                      aria-hidden="true"
                      data-sop-page-continuation-fill="true"
                      style={{
                        flex: '1 1 auto',
                        minHeight: 0,
                        position: 'relative',
                        boxSizing: 'border-box',
                        backgroundColor: '#ffffff',
                        borderLeft: '1px solid #000000',
                        borderRight: '1px solid #000000',
                        borderBottom: '1px solid #000000'
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute', top: 0, bottom: 0, left: '28%',
                          borderLeft: '1px solid #000000'
                        }}
                      />
                    </div>
                  )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="text-[11px] text-slate-500 max-w-[900px] mx-auto px-1 text-center sm:text-left">
        <b>SopLiveEditor Canonical A4:</b> Dokumen berukuran fisik 210 × 297 mm dengan margin 20 mm di semua sisi. Konten yang melebihi kapasitas halaman akan otomatis mengalir ke halaman berikutnya secara natural, identik dengan Preview dan PDF.
      </div>
    </div>
  );
};
