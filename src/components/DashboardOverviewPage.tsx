import React, { useMemo, useState } from 'react';
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
    storagePath?: string;
  } | null>(null);

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

    // SK/MOU from Dashboard Dokumen Digital Soegiri must open the uploaded PDF directly in DocumentViewer,
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

  return (
    <div className="space-y-6 animate-in fade-in duration-200">

      {/* 1. Hero Greeting */}
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


        </div>
      </section>

      {/* 2. Dokumen Digital Soegiri — embedded dashboard repository */}

      <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-5 sm:p-6 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700 shrink-0">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black text-slate-900">DOKUMEN DIGITAL SOEGIRI</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-200">
                    {archiveCounts.ALL} Dokumen Sah
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                  Repository arsip digital resmi seluruh dokumen regulasi yang telah disahkan dan berlaku di RSUD Dr. Soegiri.
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 shrink-0">
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
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative w-full md:min-w-[200px] bg-slate-50/80 rounded-xl border border-slate-200 px-2.5 py-1 flex items-center">
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
          <div className="overflow-hidden">
            <div className="w-full min-w-0">
              <div className="hidden md:grid grid-cols-[44px_minmax(180px,1.6fr)_minmax(120px,1.15fr)_minmax(100px,0.8fr)_minmax(120px,1fr)_110px_110px] gap-3 px-5 py-3 bg-slate-50/70 border-b border-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-500">
                <span>No</span><span>Judul Dokumen</span><span>Nomor Dokumen</span><span>Jenis</span><span>Unit / Mitra</span><span>Tanggal</span><span className="text-right">Aksi</span>
              </div>
              {archiveDocs.map((row, i) => (
                <div key={`${row.type}-${row.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[44px_minmax(180px,1.6fr)_minmax(120px,1.15fr)_minmax(100px,0.8fr)_minmax(120px,1fr)_110px_110px] gap-x-3 gap-y-1.5 md:gap-3 items-center px-3.5 sm:px-4 md:px-5 py-3 md:py-3.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 transition-colors">
                  <span className="hidden md:block text-xs text-slate-400">{i + 1}</span>
                  <div className="order-3 col-span-2 md:order-none md:col-span-1 min-w-0">
                    <div className="text-[13px] sm:text-sm font-bold text-slate-900 leading-snug md:truncate">{row.title}</div>
                    <div className="mt-0.5 text-[10px] md:text-[11px] text-slate-400 min-w-0 flex items-center gap-1.5">
                      <span className="truncate">{row.fileName || 'Dokumen resmi'}{row.fileSize ? ` • ${formatBytes(row.fileSize)}` : ''}</span>
                      {row.subCode && (
                        <span className="shrink-0 inline-block px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono text-[9px] font-bold border border-slate-200" title={`Sub-divisi: ${row.subCode}`}>
                          Sub: {row.subCode}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="order-1 md:order-none font-mono text-xs md:text-[11px] font-black md:font-bold text-slate-700 break-all md:truncate">{row.number || '—'}</span>
                  <span className={`order-2 md:order-none justify-self-end md:justify-self-start w-fit px-2 py-0.5 md:py-1 rounded-full md:rounded-md text-[9px] md:text-[10px] font-black border md:border-0 ${row.type === 'SPO' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : row.type === 'SK' ? 'bg-teal-50 text-teal-800 border-teal-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>{row.type === 'SPO' ? 'SPO' : row.type === 'SK' ? 'SK Direktur' : 'MOU / PKS'}</span>
                  <span className="order-4 md:order-none text-[10px] md:text-[11px] font-semibold text-slate-600 truncate">{row.unit || 'RSUD Dr. Soegiri'}</span>
                  <span className="order-5 md:order-none justify-self-end md:justify-self-start text-[10px] md:text-[11px] text-slate-400 md:text-slate-500 whitespace-nowrap">{row.date ? new Date(row.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                  <div className="order-6 col-span-2 md:order-none md:col-span-1 flex justify-end gap-1.5 mt-1 md:mt-0"><button type="button" onClick={() => handleArchiveOpen(row)} className="p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer" title="Lihat"><Eye className="w-4 h-4" /></button>{(row.doc || row.sop) && <button type="button" onClick={() => handleArchiveDownload(row)} className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer" title={`Download ${row.type} PDF`} aria-label={`Download ${row.type} PDF`}><Download className="w-4 h-4" /></button>}</div>
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
                storagePath={pdfViewer.storagePath || pdfViewer.doc?.storagePath}
                heightClass="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
