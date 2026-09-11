import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  FileText,
  FileCheck,
  Handshake,
  BookOpen,
  Download,
  Eye,
  X,
  List,
  Grid2X2,
  Settings,
  Search,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Printer,
  Sparkles,
  ExternalLink,
  Layers,
  ShieldCheck,
  Building2,
  Calendar,
  FileDown,
  FolderTree,
  SlidersHorizontal,
  ArrowUpRight,
  Tag,
  Filter
} from 'lucide-react';

import {
  SopDocument,
  LibraryDocument,
  UserSession,
  MainMenuTab
} from '../types';

import { formatBytes } from '../utils/numbering';
import { getLibraryDocumentUrl } from '../lib/documentLibraryService';
import { getSKDocumentUrl } from '../lib/skService';
import { getMOUDocumentUrl } from '../lib/mouService';
import { DocumentViewer } from './DocumentViewer';
import { getSoegiriHierarchyInfo, parseHierarchyFromSopNumber } from '../lib/soegiriStructure';

/**
 * Extracts normalized sub-division code (e.g. "1.1.3", "1.2", "2.1") from SOP document
 */
function getDocSubCode(s: SopDocument): string {
  if (s.subHierarchyCode && typeof s.subHierarchyCode === 'string' && s.subHierarchyCode.trim()) {
    return s.subHierarchyCode.trim();
  }
  const parsed = parseHierarchyFromSopNumber(s.sopNumber);
  if (parsed) return parsed;
  if (s.subCode) return String(s.subCode).trim();
  return '';
}

/**
 * Matches document sub-division code against selected filter (exact or hierarchical prefix)
 */
function matchSubCode(docSubCode: string, targetSubCode: string): boolean {
  if (!targetSubCode || targetSubCode === 'ALL') return true;
  if (!docSubCode) return false;
  return docSubCode === targetSubCode || docSubCode.startsWith(targetSubCode + '.');
}

interface DashboardOverviewPageProps {
  sops: SopDocument[];
  documents: LibraryDocument[];
  userSession: UserSession;
  onNavigate: (tab: MainMenuTab) => void;
  onOpenPrintRegister?: () => void;
  onViewSop?: (sop: SopDocument) => void;
  onViewLibraryDoc?: (doc: LibraryDocument) => void;
}

export const DashboardOverviewPage: React.FC<
  DashboardOverviewPageProps
> = ({
  sops,
  documents,
  userSession,
  onNavigate,
  onOpenPrintRegister,
  onViewSop,
  onViewLibraryDoc,
}) => {
  const isAdmin = userSession.role === 'admin';

  const GEMES_REMINDERS = [
    'Jangan lupa GEMES — Salam, Senyum, Sapa, Sentuh, dan Doakan Semoga Cepat Sembuh.',
    'Jangan lupa GEMES — hadirkan pelayanan yang ramah, peduli, dan humanis.',
    'Jangan lupa GEMES — sapa dengan ramah, layani dengan peduli, dan hadirkan kenyamanan bagi pasien.',
    'Jangan lupa GEMES — tetap utamakan nilai humanisme dan kekeluargaan dalam setiap pelayanan.'
  ];

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'Selamat pagi';
    if (hour >= 11 && hour < 15) return 'Selamat siang';
    if (hour >= 15 && hour < 19) return 'Selamat sore';
    return 'Selamat malam';
  };

  const getGEMESReminder = () => {
    try {
      const storedIndex = Number.parseInt(sessionStorage.getItem('sidokter.gemes.loginIndex') || '1', 10);
      const index = Number.isFinite(storedIndex) && storedIndex > 0 ? storedIndex - 1 : 0;
      return GEMES_REMINDERS[index % GEMES_REMINDERS.length];
    } catch {
      return GEMES_REMINDERS[0];
    }
  };

  const [globalSearch, setGlobalSearch] = useState('');
  const [selectedSubDivision, setSelectedSubDivision] = useState<string>('ALL');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<'ALL' | 'SPO' | 'SK' | 'MOU'>('ALL');
  const [archiveSubDivisionFilter, setArchiveSubDivisionFilter] = useState<string>('ALL');
  const [archiveView, setArchiveView] = useState<'LIST' | 'CARD'>('LIST');
  const [pdfViewer, setPdfViewer] = useState<{
    url: string;
    title: string;
    type: 'SK' | 'MOU';
    fileName?: string;
    documentNumber?: string;
    doc?: LibraryDocument;
  } | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close suggestions popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasStructuralBadge = Array.isArray(userSession.badges) && userSession.badges.some((b) => String(b).toUpperCase() === 'STRUKTURAL');
  // Admin Root or STRUKTURAL badge grants SK/MOU access; VERIFIKATOR alone does not
  const canAccessProtectedDocs = userSession.role === 'admin' || hasStructuralBadge;

  // Extract all distinct sub-division codes available in catalog with descriptive labels
  const availableSubDivisions = useMemo(() => {
    const codeMap = new Map<string, { code: string; divisionCode?: string; label: string; count: number }>();
    sops.forEach((s) => {
      const sub = getDocSubCode(s);
      if (!sub) return;
      const key = sub;
      const current = codeMap.get(key);
      if (current) {
        current.count++;
      } else {
        const hInfo = getSoegiriHierarchyInfo({ categoryCode: s.divisionCode, hierarchyCode: sub });
        const lastPart = hInfo.path && hInfo.path.length > 0
          ? hInfo.path.slice(-2).join(' · ')
          : (s.divisionName || s.divisionCode || 'Sub-Unit');
        const displayLabel = `${sub} - ${lastPart}`;
        codeMap.set(key, {
          code: sub,
          divisionCode: s.divisionCode,
          label: displayLabel,
          count: 1
        });
      }
    });

    return Array.from(codeMap.values()).sort((a, b) => {
      return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [sops]);

  // Real-time suggestions for quick search (matching sub-divisions and top matching documents)
  const realtimeSuggestions = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();

    // 1. Matching sub-divisions
    const matchingSubs = availableSubDivisions.filter((sub) => {
      if (!q) return true;
      return (
        sub.code.toLowerCase().includes(q) ||
        sub.label.toLowerCase().includes(q) ||
        (sub.divisionCode || '').toLowerCase().includes(q)
      );
    }).slice(0, 4);

    // 2. Top matching documents
    const matchedSops = sops.filter((s) => {
      const subCode = getDocSubCode(s);
      if (selectedSubDivision !== 'ALL' && !matchSubCode(subCode, selectedSubDivision)) {
        return false;
      }
      if (!q) return true;
      const hInfo = getSoegiriHierarchyInfo({ categoryCode: s.divisionCode, hierarchyCode: subCode });
      const hierarchyText = (hInfo.path || []).join(' ').toLowerCase();
      return (
        (s.title || '').toLowerCase().includes(q) ||
        (s.sopNumber || '').toLowerCase().includes(q) ||
        (s.divisionName || '').toLowerCase().includes(q) ||
        (s.divisionCode || '').toLowerCase().includes(q) ||
        subCode.toLowerCase().includes(q) ||
        hierarchyText.includes(q)
      );
    }).slice(0, 5);

    const matchedDocs = selectedSubDivision !== 'ALL' ? [] : documents.filter((d) => {
      if (!q) return false;
      return (
        (d.title || '').toLowerCase().includes(q) ||
        (d.documentNumber || '').toLowerCase().includes(q) ||
        (d.partnerName || '').toLowerCase().includes(q) ||
        (d.fileName || '').toLowerCase().includes(q)
      );
    }).slice(0, 3);

    return {
      subDivisions: matchingSubs,
      sops: matchedSops,
      docs: matchedDocs,
      totalCount: matchedSops.length + matchedDocs.length,
    };
  }, [globalSearch, selectedSubDivision, availableSubDivisions, sops, documents]);

  const archiveDocs = useMemo(() => {
    const activeSops = sops.filter((s) => s.status === 'AKTIF');
    const q = archiveSearch.trim().toLowerCase();
    const rows: Array<{
      id: string;
      type: 'SPO' | 'SK' | 'MOU';
      title: string;
      number?: string;
      unit?: string;
      subCode?: string;
      divisionCode?: string;
      date?: string;
      fileName?: string;
      fileSize?: number;
      sop?: SopDocument;
      doc?: LibraryDocument;
    }> = [];

    if (archiveFilter === 'ALL' || archiveFilter === 'SPO') {
      activeSops.forEach((s) => {
        const subCode = getDocSubCode(s);
        if (archiveSubDivisionFilter !== 'ALL' && !matchSubCode(subCode, archiveSubDivisionFilter)) {
          return;
        }
        rows.push({
          id: s.id,
          type: 'SPO',
          title: s.title,
          number: s.sopNumber,
          unit: s.divisionName,
          subCode: subCode || undefined,
          divisionCode: s.divisionCode,
          date: s.effectiveDate || s.createdAt,
          fileName: s.fileName,
          sop: s
        });
      });
    }
    if (canAccessProtectedDocs && archiveSubDivisionFilter === 'ALL') {
      documents.forEach((d) => {
        if (archiveFilter !== 'ALL' && archiveFilter !== d.type) return;
        rows.push({
          id: d.id,
          type: d.type,
          title: d.title,
          number: d.documentNumber,
          unit: d.partnerName,
          date: d.effectiveDate || d.createdAt,
          fileName: d.fileName,
          fileSize: d.fileSize,
          doc: d
        });
      });
    }

    return rows.filter((r) => {
      if (!q) return true;
      return [r.title, r.number, r.unit, r.fileName, r.subCode].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [sops, documents, archiveFilter, archiveSearch, archiveSubDivisionFilter, canAccessProtectedDocs]);

  const archiveCounts = useMemo(() => {
    const sopsMatchingSub = sops.filter((s) =>
      s.status === 'AKTIF' && (archiveSubDivisionFilter === 'ALL' || matchSubCode(getDocSubCode(s), archiveSubDivisionFilter))
    );
    const docsCount = archiveSubDivisionFilter === 'ALL' && canAccessProtectedDocs ? documents.length : 0;
    return {
      ALL: sopsMatchingSub.length + docsCount,
      SPO: sopsMatchingSub.length,
      SK: archiveSubDivisionFilter === 'ALL' && canAccessProtectedDocs ? documents.filter((d) => d.type === 'SK').length : 0,
      MOU: archiveSubDivisionFilter === 'ALL' && canAccessProtectedDocs ? documents.filter((d) => d.type === 'MOU').length : 0,
    };
  }, [sops, documents, canAccessProtectedDocs, archiveSubDivisionFilter]);

  const handleArchiveOpen = async (row: typeof archiveDocs[number]) => {
    if (row.type === 'SPO' && row.sop && onViewSop) {
      onViewSop(row.sop);
      return;
    }

    // SK/MOU from Dashboard Arsip Digital must open the uploaded PDF directly in DocumentViewer,
    // never navigate away.
    if ((row.type === 'SK' || row.type === 'MOU') && row.doc) {
      try {
        const url = row.type === 'SK'
          ? await getSKDocumentUrl(row.doc)
          : await getMOUDocumentUrl(row.doc);
        if (url) {
          setPdfViewer({
            url,
            title: row.doc.title || row.title,
            type: row.type,
            fileName: row.doc.fileName || `${row.type}_${row.doc.documentNumber || row.doc.id}.pdf`,
            documentNumber: row.doc.documentNumber,
            doc: row.doc
          });
        }
      } catch {
        // Keep the dashboard in place if the uploaded PDF cannot be resolved.
      }
      return;
    }

    if (row.doc && onViewLibraryDoc) {
      onViewLibraryDoc(row.doc);
    }
  };

  const handleArchiveDownload = async (row: {
    id?: string;
    type: 'SPO' | 'SK' | 'MOU';
    title?: string;
    number?: string;
    fileName?: string;
    sop?: SopDocument;
    doc?: LibraryDocument;
  }) => {
    try {
      let url: string | undefined;
      let fileName = row.fileName || `${row.type}.pdf`;
      if (row.type === 'SPO' && row.sop) {
        url = row.sop.signedScanUrl || row.sop.fileUrl;
        fileName = row.sop.signedScanFileName || row.sop.fileName || `${row.sop.sopNumber || 'SPO'}.pdf`;
      } else if (row.doc) {
        url = await (row.type === 'SK' ? getSKDocumentUrl(row.doc) : getMOUDocumentUrl(row.doc));
        fileName = row.doc.fileName || `${row.type}_${row.doc.documentNumber || row.doc.id}.pdf`;
      }
      if (!url) return;

      if (url.startsWith('data:') || url.startsWith('blob:')) {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) return;
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch {
      // No navigation; failed download remains non-blocking.
    }
  };

  // Statistics calculation
  const totalSop = sops.length;

  const activeSop = sops.filter(
    (s) => s.status === 'AKTIF'
  ).length;

  const pendingSop = sops.filter(
    (s) => s.status === 'DRAFT'
  ).length;

  const draftSop = sops.filter(
    (s) => s.status === 'DRAFT' || s.status === 'DRAFT' || s.isNumberReservation
  ).length;

  const skDocs = useMemo(
    () =>
      documents.filter(
        (d) => d.type === 'SK'
      ),
    [documents]
  );

  const mouDocs = useMemo(
    () =>
      documents.filter(
        (d) => d.type === 'MOU'
      ),
    [documents]
  );

  const totalFinalDocs =
    activeSop + documents.length;

  // Global search & sub-division filter results
  const searchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q && selectedSubDivision === 'ALL') return null;

    const matchedSops = sops
      .filter((s) => {
        const subCode = getDocSubCode(s);
        if (selectedSubDivision !== 'ALL' && !matchSubCode(subCode, selectedSubDivision)) {
          return false;
        }
        if (!q) return true;
        const hInfo = getSoegiriHierarchyInfo({ categoryCode: s.divisionCode, hierarchyCode: subCode });
        const hierarchyText = (hInfo.path || []).join(' ').toLowerCase();
        return (
          (s.title || '').toLowerCase().includes(q) ||
          (s.sopNumber || '').toLowerCase().includes(q) ||
          (s.divisionName || '').toLowerCase().includes(q) ||
          (s.divisionCode || '').toLowerCase().includes(q) ||
          subCode.toLowerCase().includes(q) ||
          hierarchyText.includes(q)
        );
      })
      .slice(0, 15);

    const matchedDocs = selectedSubDivision !== 'ALL' ? [] : documents
      .filter((d) => {
        if (!q) return false;
        return (
          (d.title || '').toLowerCase().includes(q) ||
          (d.documentNumber || '').toLowerCase().includes(q) ||
          (d.partnerName || '').toLowerCase().includes(q) ||
          (d.fileName || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 10);

    return {
      sops: matchedSops,
      docs: matchedDocs,
      totalMatches: matchedSops.length + matchedDocs.length,
    };
  }, [globalSearch, selectedSubDivision, sops, documents]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">

      {/* 1. Hero Greeting & Global Search */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 rounded-3xl text-white p-6 sm:p-8 shadow-xl relative overflow-hidden">

        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 max-w-4xl">

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              SIDOKTER SOEGIRI • RSUD Dr. Soegiri Lamongan
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-tight">
            {getTimeGreeting()},{' '}
            {userSession.name || 'Pengguna'} 👋
          </h1>

          <p className="text-sm sm:text-base text-slate-300 mt-2 max-w-2xl leading-relaxed">
            Satu sistem untuk mengelola, mengakses, dan menjaga dokumen resmi RSUD Dr. Soegiri Lamongan.
          </p>

          <p className="text-sm sm:text-base text-white/90 mt-3 max-w-3xl leading-relaxed font-medium">
            💙 {getGEMESReminder()}
          </p>

          {/* Quick Search with Real-time Suggestions & Sub-division filtering */}
          <div className="mt-6 max-w-3xl" ref={searchContainerRef}>
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Sub-division filter selector */}
              <div className="relative shrink-0 sm:w-60 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-1.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-400 transition-all flex items-center">
                <SlidersHorizontal className="w-4 h-4 text-emerald-300 ml-2.5 shrink-0 focus-within:text-slate-700" />
                <select
                  value={selectedSubDivision}
                  onChange={(e) => {
                    setSelectedSubDivision(e.target.value);
                  }}
                  className="w-full bg-transparent px-2 py-1.5 text-xs text-white font-semibold outline-none focus:text-slate-900 cursor-pointer"
                  aria-label="Filter sub-divisi"
                >
                  <option value="ALL" className="text-slate-900 font-normal">
                    Semua Sub-Divisi ({sops.length})
                  </option>
                  {availableSubDivisions.map((sub) => (
                    <option key={sub.code} value={sub.code} className="text-slate-900 font-normal">
                      [{sub.code}] {sub.label} ({sub.count})
                    </option>
                  ))}
                </select>
                {selectedSubDivision !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedSubDivision('ALL')}
                    className="mr-2 text-slate-300 hover:text-white focus-within:text-slate-500 cursor-pointer"
                    title="Reset filter sub-divisi"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Main Search Input */}
              <div className="relative flex-1 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-1.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-400 transition-all">
                <div className="flex items-center">
                  <Search className="w-5 h-5 text-slate-300 ml-3 shrink-0 focus-within:text-slate-700" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={globalSearch}
                    onFocus={() => setShowSuggestions(true)}
                    onChange={(e) => {
                      setGlobalSearch(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setShowSuggestions(false);
                      if (e.key === 'Enter') setShowSuggestions(false);
                    }}
                    placeholder="Cari nomor, judul, kode sub-divisi (cth: 1.1.3)..."
                    className="w-full bg-transparent px-3 py-2 text-sm text-white placeholder-slate-400 focus:text-slate-900 focus:placeholder-slate-500 outline-none"
                  />
                  {globalSearch && (
                    <button
                      type="button"
                      onClick={() => setGlobalSearch('')}
                      className="mr-2 p-1 rounded-lg text-slate-400 hover:text-white focus-within:text-slate-600 cursor-pointer"
                      title="Hapus kata kunci"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Real-time suggestions dropdown */}
                {showSuggestions && (
                  <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-slate-700">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Saran Real-Time</span>
                        {globalSearch && (
                          <span className="text-slate-400 font-normal truncate max-w-[180px]">
                            "{globalSearch}"
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSuggestions(false)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                        title="Tutup saran"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 p-1">
                      {/* Sub-division quick chips/suggestions */}
                      {realtimeSuggestions.subDivisions.length > 0 && (
                        <div className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                              <FolderTree className="w-3 h-3 text-emerald-600" />
                              Saran Sub-Divisi
                            </span>
                            {selectedSubDivision !== 'ALL' && (
                              <button
                                type="button"
                                onClick={() => setSelectedSubDivision('ALL')}
                                className="text-[10px] font-bold text-emerald-600 hover:underline cursor-pointer"
                              >
                                Reset Filter
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {realtimeSuggestions.subDivisions.map((sub) => {
                              const isSelected = selectedSubDivision === sub.code;
                              return (
                                <button
                                  key={sub.code}
                                  type="button"
                                  onClick={() => {
                                    setSelectedSubDivision(isSelected ? 'ALL' : sub.code);
                                    setShowSuggestions(false);
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-emerald-600 text-white shadow-xs'
                                      : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/60'
                                  }`}
                                >
                                  <span className="font-mono font-black text-[11px]">{sub.code}</span>
                                  <span className="truncate max-w-[160px]">{sub.label.split(' - ')[1] || sub.label}</span>
                                  <span className={`text-[10px] px-1 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-emerald-200/60 text-emerald-800 font-bold'}`}>
                                    {sub.count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Matching live documents */}
                      {realtimeSuggestions.sops.length > 0 || realtimeSuggestions.docs.length > 0 ? (
                        <div className="py-2">
                          <div className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <FileText className="w-3 h-3 text-emerald-600" />
                            Dokumen Ditemukan ({realtimeSuggestions.totalCount})
                          </div>
                          {realtimeSuggestions.sops.map((sop) => {
                            const subCode = getDocSubCode(sop);
                            return (
                              <button
                                key={sop.id}
                                type="button"
                                onClick={() => {
                                  setShowSuggestions(false);
                                  if (onViewSop) onViewSop(sop);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-emerald-50/60 rounded-xl transition-colors flex items-center justify-between gap-2 group cursor-pointer"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800">
                                      SPO
                                    </span>
                                    <span className="font-mono text-[11px] font-bold text-slate-700">
                                      {sop.sopNumber || 'Tanpa nomor'}
                                    </span>
                                    {subCode && (
                                      <span className="px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[9px] font-bold">
                                        Sub: {subCode}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs font-bold text-slate-900 truncate group-hover:text-emerald-700">
                                    {sop.title}
                                  </div>
                                </div>
                                <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 shrink-0" />
                              </button>
                            );
                          })}
                          {realtimeSuggestions.docs.map((doc) => (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => {
                                setShowSuggestions(false);
                                handleArchiveOpen({
                                  id: doc.id,
                                  type: doc.type,
                                  title: doc.title,
                                  number: doc.documentNumber,
                                  unit: doc.partnerName,
                                  fileName: doc.fileName,
                                  fileSize: doc.fileSize,
                                  doc
                                });
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-xl transition-colors flex items-center justify-between gap-2 group cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                                    doc.type === 'SK' ? 'bg-teal-100 text-teal-800' : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {doc.type}
                                  </span>
                                  {doc.documentNumber && (
                                    <span className="font-mono text-[11px] font-bold text-slate-700">
                                      {doc.documentNumber}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs font-bold text-slate-900 truncate group-hover:text-emerald-700">
                                  {doc.title}
                                </div>
                              </div>
                              <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 shrink-0" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        globalSearch && (
                          <div className="p-4 text-center text-xs text-slate-500">
                            Tidak ditemukan dokumen yang cocok dengan kata kunci "{globalSearch}".
                          </div>
                        )
                      )}
                    </div>

                    <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        {selectedSubDivision !== 'ALL' ? (
                          <span>Filter sub-divisi: <strong className="text-emerald-700 font-mono">[{selectedSubDivision}]</strong></span>
                        ) : (
                          <span>Pilih dokumen untuk langsung membuka pratinjau</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowSuggestions(false)}
                        className="font-bold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Tutup Saran ×
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Active sub-division filter chip */}
            {selectedSubDivision !== 'ALL' && (
              <div className="mt-2.5 flex items-center gap-2 text-xs">
                <span className="text-slate-300">Filter Aktif:</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 font-bold text-[11px]">
                  <FolderTree className="w-3 h-3 text-emerald-400" />
                  Sub-Divisi: {selectedSubDivision}
                  {availableSubDivisions.find(s => s.code === selectedSubDivision)?.label && (
                    <span className="text-emerald-300/80 font-normal max-w-xs truncate hidden sm:inline">
                      ({availableSubDivisions.find(s => s.code === selectedSubDivision)?.label.split(' - ')[1]})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedSubDivision('ALL')}
                    className="ml-1 text-emerald-300 hover:text-white cursor-pointer"
                    title="Hapus filter sub-divisi"
                  >
                    ×
                  </button>
                </span>
              </div>
            )}
          </div>

        </div>
      </section>

      {/* Search Results */}
      {searchResults && (
        <section className="bg-white rounded-3xl border border-emerald-200 p-6 shadow-md animate-in fade-in duration-150">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">

            <div className="flex items-center gap-2 flex-wrap">
              <Search className="w-4 h-4 text-emerald-600" />

              <h2 className="text-sm font-black text-slate-900">
                Hasil Pencarian: {globalSearch ? `"${globalSearch}"` : 'Semua Dokumen'}
              </h2>

              {selectedSubDivision !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-xs font-mono font-bold border border-emerald-200">
                  <FolderTree className="w-3 h-3 text-emerald-600" />
                  Sub-Divisi: {selectedSubDivision}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500">
                {searchResults.totalMatches} dokumen ditemukan
              </span>
              <button
                type="button"
                onClick={() => {
                  setGlobalSearch('');
                  setSelectedSubDivision('ALL');
                }}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
              >
                Reset Pencarian
              </button>
            </div>

          </div>

          {searchResults.totalMatches === 0 ? (

            <div className="py-8 text-center text-xs text-slate-500">
              Tidak ada dokumen yang cocok dengan kata kunci atau sub-divisi tersebut.
            </div>

          ) : (

            <div className="divide-y divide-slate-100 mt-2">

              {searchResults.sops.map(
                (sop) => {
                  const subCode = getDocSubCode(sop);
                  return (
                    <div
                      key={sop.id}
                      className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded-xl"
                    >

                      <div className="min-w-0">

                        <div className="flex items-center gap-2 mb-0.5">

                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-800">
                            SPO
                          </span>

                          <span className="font-mono text-xs font-bold text-slate-700">
                            {sop.sopNumber}
                          </span>

                          {subCode && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200" title={`Kode Sub-divisi: ${subCode}`}>
                              Sub-kode: {subCode}
                            </span>
                          )}

                        </div>

                        <div className="text-sm font-bold text-slate-900 truncate">
                          {sop.title}
                        </div>

                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          onViewSop &&
                          onViewSop(sop)
                        }
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 transition-colors cursor-pointer"
                      >
                        Buka SPO
                      </button>

                    </div>
                  );
                }
              )}

              {searchResults.docs.map(
                (doc) => (
                  <div
                    key={doc.id}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded-xl"
                  >

                    <div className="min-w-0">

                      <div className="flex items-center gap-2 mb-0.5">

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            doc.type === 'SK'
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-blue-50 text-blue-800'
                          }`}
                        >
                          {doc.type}
                        </span>

                        {doc.documentNumber && (
                          <span className="font-mono text-xs font-bold text-slate-700">
                            {doc.documentNumber}
                          </span>
                        )}

                      </div>

                      <div className="text-sm font-bold text-slate-900 truncate">
                        {doc.title}
                      </div>

                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const url = doc.type === 'SK'
                            ? await getSKDocumentUrl(doc)
                            : await getMOUDocumentUrl(doc);
                          if (url) {
                            setPdfViewer({
                              url,
                              title: doc.title,
                              type: doc.type,
                              fileName: doc.fileName || `${doc.type}_${doc.documentNumber || doc.id}.pdf`,
                              documentNumber: doc.documentNumber,
                              doc
                            });
                          } else {
                            onNavigate(
                              doc.type === 'SK'
                                ? 'sk'
                                : 'mou'
                            );
                          }
                        } catch {
                          onNavigate(
                            doc.type === 'SK'
                              ? 'sk'
                              : 'mou'
                          );
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold shrink-0 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Buka {doc.type}
                    </button>

                  </div>
                )
              )}

            </div>
          )}

        </section>
      )}

      {/* 2. Key Metrics Statistics */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">

        {/* SPO Card */}
        <button
          type="button"
          onClick={() =>
            onNavigate('spo')
          }
          className="bg-white rounded-3xl border border-slate-200 p-5 text-left shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all group cursor-pointer"
        >

          <div className="flex items-center justify-between">

            <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <FileText className="w-5 h-5" />
            </div>

            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
              Pedoman Prosedur
            </span>

          </div>

          <div className="mt-4 text-2xl sm:text-3xl font-black text-slate-900">
            {totalSop}
          </div>

          <div className="text-xs sm:text-sm font-bold text-slate-700 mt-1 flex items-center justify-between">

            <span>
              Dokumen SPO
            </span>

            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-700 transition-colors" />

          </div>

          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">

            <span>
              Aktif:{' '}
              <strong className="text-emerald-700">
                {activeSop}
              </strong>
            </span>

            <div className="flex items-center gap-2">
              {pendingSop > 0 && (
                <span className="text-amber-700 font-bold">
                  {pendingSop}{' '}
                  Menunggu
                </span>
              )}

              {draftSop > 0 && (
                <span className="text-sky-700 font-bold">
                  {draftSop}{' '}
                  Draft
                </span>
              )}
            </div>

          </div>

        </button>

        {/* SK Card */}
        <button
          type="button"
          onClick={() =>
            onNavigate('sk')
          }
          className="bg-white rounded-3xl border border-slate-200 p-5 text-left shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all group cursor-pointer"
        >

          <div className="flex items-center justify-between">

            <div className="p-2.5 rounded-2xl bg-teal-50 text-teal-700 group-hover:bg-teal-600 group-hover:text-white transition-colors">
              <FileCheck className="w-5 h-5" />
            </div>

            <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
              Surat Keputusan
            </span>

          </div>

          <div className="mt-4 text-2xl sm:text-3xl font-black text-slate-900">
            {skDocs.length}
          </div>

          <div className="text-xs sm:text-sm font-bold text-slate-700 mt-1 flex items-center justify-between">

            <span>
              Dokumen SK
            </span>

            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-700 transition-colors" />

          </div>

          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 truncate">
            SK Direktur RSUD Dr. Soegiri
          </div>

        </button>

        {/* MOU Card */}
        <button
          type="button"
          onClick={() =>
            onNavigate('mou')
          }
          className="bg-white rounded-3xl border border-slate-200 p-5 text-left shadow-2xs hover:shadow-md hover:border-blue-300 transition-all group cursor-pointer"
        >

          <div className="flex items-center justify-between">

            <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Handshake className="w-5 h-5" />
            </div>

            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
              Kerja Sama
            </span>

          </div>

          <div className="mt-4 text-2xl sm:text-3xl font-black text-slate-900">
            {mouDocs.length}
          </div>

          <div className="text-xs sm:text-sm font-bold text-slate-700 mt-1 flex items-center justify-between">

            <span>
              Dokumen MOU
            </span>

            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-700 transition-colors" />

          </div>

          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 truncate">
            PKS & Nota Kesepahaman Mitra
          </div>

        </button>


      </section>


      {/* 3. Arsip Digital — embedded dashboard repository */}
      <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-5 sm:p-6 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700 shrink-0">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black text-slate-900">Arsip Digital</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-200">
                    {archiveCounts.ALL} Dokumen Sah
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                  Repository arsip digital resmi seluruh dokumen regulasi yang telah disahkan dan berlaku di RSUD Dr. Soegiri.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold text-slate-500">Tampilan:</span>
              <button type="button" onClick={() => setArchiveView('LIST')} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${archiveView === 'LIST' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                <List className="w-3.5 h-3.5" /> List
              </button>
              <button type="button" onClick={() => setArchiveView('CARD')} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${archiveView === 'CARD' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                <Grid2X2 className="w-3.5 h-3.5" /> Card
              </button>
            </div>
          </div>

          {!canAccessProtectedDocs && (
            <div className="mt-4 px-3.5 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
              Anda tidak punya akses ke dokumen SK dan MOU. Akses tersebut memerlukan badge STRUKTURAL.
            </div>
          )}

          <div className="mt-5 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} placeholder="Cari arsip berdasarkan judul, nomor, kode sub-divisi, atau unit..." className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500" />
              {archiveSearch && <button type="button" onClick={() => setArchiveSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button>}
            </div>

            {/* Sub-division filter for archive */}
            <div className="flex items-center gap-2">
              <div className="relative min-w-[200px] bg-slate-50/80 rounded-xl border border-slate-200 px-2.5 py-1 flex items-center">
                <FolderTree className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <select
                  value={archiveSubDivisionFilter}
                  onChange={(e) => setArchiveSubDivisionFilter(e.target.value)}
                  className="w-full bg-transparent px-2 py-1.5 text-xs text-slate-800 font-semibold outline-none cursor-pointer"
                  aria-label="Filter sub-divisi arsip"
                >
                  <option value="ALL">Semua Sub-Divisi</option>
                  {availableSubDivisions.map((sub) => (
                    <option key={sub.code} value={sub.code}>
                      [{sub.code}] {sub.label} ({sub.count})
                    </option>
                  ))}
                </select>
                {archiveSubDivisionFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setArchiveSubDivisionFilter('ALL')}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer ml-1"
                    title="Reset sub-divisi"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(canAccessProtectedDocs ? [
                ['ALL', 'Semua', archiveCounts.ALL], ['SPO', 'SPO', archiveCounts.SPO], ['SK', 'SK Direktur', archiveCounts.SK], ['MOU', 'MOU / PKS', archiveCounts.MOU]
              ] : [['ALL', 'Semua', archiveCounts.SPO], ['SPO', 'SPO', archiveCounts.SPO]]).map(([id, label, count]) => (
                <button key={id} type="button" onClick={() => setArchiveFilter(id as typeof archiveFilter)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold shrink-0 ${archiveFilter === id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {label}<span className={`text-[10px] px-1.5 rounded-md ${archiveFilter === id ? 'bg-white/20' : 'bg-slate-200'}`}>{count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {archiveDocs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3"><BookOpen className="w-6 h-6" /></div>
            <h3 className="text-base font-extrabold text-slate-800">Tidak ada dokumen yang ditemukan</h3>
            <p className="text-xs text-slate-500 mt-1">Belum ada dokumen yang sesuai dengan pencarian atau filter.</p>
          </div>
        ) : archiveView === 'LIST' ? (
          <div className="overflow-x-auto">
            <div className="w-full min-w-0">
              <div className="grid grid-cols-[44px_minmax(180px,1.7fr)_minmax(120px,1.25fr)_minmax(100px,1fr)_minmax(100px,1fr)_110px] gap-3 px-5 py-3 bg-slate-50/70 border-b border-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-500">
                <span>No</span><span>Judul Dokumen</span><span>Nomor Dokumen</span><span>Jenis</span><span>Tanggal / Unit</span><span className="text-right">Aksi</span>
              </div>
              {archiveDocs.map((row, i) => (
                <div key={`${row.type}-${row.id}`} className="grid grid-cols-[44px_minmax(180px,1.7fr)_minmax(120px,1.25fr)_minmax(100px,1fr)_minmax(100px,1fr)_110px] gap-3 items-center px-5 py-3.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                  <span className="text-xs text-slate-400">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{row.title}</div>
                    <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5">
                      <span>{row.fileName || 'Dokumen resmi'}{row.fileSize ? ` • ${formatBytes(row.fileSize)}` : ''}</span>
                      {row.subCode && (
                        <span className="inline-block px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono text-[9px] font-bold border border-slate-200" title={`Sub-divisi: ${row.subCode}`}>
                          Sub: {row.subCode}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-slate-700 truncate">{row.number || '—'}</span>
                  <span className={`w-fit px-2 py-1 rounded-md text-[10px] font-black ${row.type === 'SPO' ? 'bg-emerald-50 text-emerald-800' : row.type === 'SK' ? 'bg-teal-50 text-teal-800' : 'bg-blue-50 text-blue-800'}`}>{row.type === 'SPO' ? 'SPO' : row.type === 'SK' ? 'SK Direktur' : 'MOU / PKS'}</span>
                  <div className="min-w-0"><div className="text-[11px] font-semibold text-slate-600 truncate">{row.unit || 'RSUD Dr. Soegiri'}</div><div className="text-[10px] text-slate-400">{row.date ? new Date(row.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div></div>
                  <div className="flex justify-end gap-1.5"><button type="button" onClick={() => handleArchiveOpen(row)} className="p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer" title="Lihat"><Eye className="w-4 h-4" /></button>{(row.doc || row.sop) && <button type="button" onClick={() => handleArchiveDownload(row)} className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer" title={`Download ${row.type} PDF`} aria-label={`Download ${row.type} PDF`}><Download className="w-4 h-4" /></button>}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {archiveDocs.map((row) => (
              <article key={`${row.type}-${row.id}`} className="rounded-2xl border border-slate-200 p-4 hover:border-emerald-300 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-black ${row.type === 'SPO' ? 'bg-emerald-50 text-emerald-800' : row.type === 'SK' ? 'bg-teal-50 text-teal-800' : 'bg-blue-50 text-blue-800'}`}>{row.type === 'SPO' ? 'SPO' : row.type === 'SK' ? 'SK Direktur' : 'MOU / PKS'}</span>
                    {row.subCode && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200" title={`Sub-divisi: ${row.subCode}`}>
                        Sub: {row.subCode}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">{row.date ? new Date(row.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                </div>
                <h3 className="mt-3 text-sm font-black text-slate-900 leading-snug line-clamp-2">{row.title}</h3>
                <p className="mt-1 font-mono text-[10px] font-bold text-emerald-800 truncate">{row.number || 'Tanpa nomor'}</p>
                <p className="mt-2 text-[11px] text-slate-500 truncate">{row.unit || 'RSUD Dr. Soegiri'}</p>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2"><button type="button" onClick={() => handleArchiveOpen(row)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"><Eye className="w-3.5 h-3.5" /> Buka</button>{(row.doc || row.sop) && <button type="button" onClick={() => handleArchiveDownload(row)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"><Download className="w-3.5 h-3.5" /> Download PDF</button>}</div>
              </article>
            ))}
          </div>
        )}
      </section>

      {pdfViewer && pdfViewer.url && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
          <div className="w-full h-full max-w-6xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-slate-200">
            <div className="h-16 shrink-0 px-5 sm:px-6 border-b border-slate-200 flex items-center justify-between gap-3 bg-white">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                    pdfViewer.type === 'SPO' ? 'bg-emerald-50 text-emerald-800' : pdfViewer.type === 'SK' ? 'bg-teal-50 text-teal-800' : 'bg-blue-50 text-blue-800'
                  }`}>
                    {pdfViewer.type === 'SPO' ? 'SPO' : pdfViewer.type === 'SK' ? 'SK Direktur' : 'MOU / PKS'}
                  </span>
                  {pdfViewer.documentNumber && (
                    <span className="text-xs font-mono font-bold text-slate-600 truncate">
                      {pdfViewer.documentNumber}
                    </span>
                  )}
                </div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 truncate mt-0.5">
                  {pdfViewer.title}
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    if (pdfViewer.doc) {
                      await handleArchiveDownload({
                        id: pdfViewer.doc.id,
                        type: pdfViewer.type,
                        title: pdfViewer.title,
                        number: pdfViewer.documentNumber,
                        fileName: pdfViewer.fileName,
                        doc: pdfViewer.doc
                      });
                    } else if (pdfViewer.url) {
                      const a = document.createElement('a');
                      a.href = pdfViewer.url;
                      a.download = pdfViewer.fileName || `${pdfViewer.type}.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                  title={`Download ${pdfViewer.type} PDF`}
                >
                  <FileDown className="w-4 h-4" />
                  <span className="hidden sm:inline">Download PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPdfViewer(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 bg-slate-100">
              <DocumentViewer
                fileUrl={pdfViewer.url}
                fileName={pdfViewer.fileName || `${pdfViewer.type}.pdf`}
                heightClass="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
