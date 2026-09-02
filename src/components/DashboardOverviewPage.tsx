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
  Calendar
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
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<'ALL' | 'SPO' | 'SK' | 'MOU'>('ALL');
  const [archiveView, setArchiveView] = useState<'LIST' | 'CARD'>('LIST');
  const [pdfViewer, setPdfViewer] = useState<{ url: string; title: string; type: 'SK' | 'MOU' } | null>(null);

  const hasStructuralBadge = Array.isArray(userSession.badges) && userSession.badges.some((b) => String(b).toUpperCase() === 'STRUKTURAL');
  const canAccessProtectedDocs = isAdmin || hasStructuralBadge;

  const archiveDocs = useMemo(() => {
    const activeSops = sops.filter((s) => s.status === 'AKTIF');
    const q = archiveSearch.trim().toLowerCase();
    const rows: Array<{
      id: string; type: 'SPO' | 'SK' | 'MOU'; title: string; number?: string;
      unit?: string; date?: string; fileName?: string; fileSize?: number; sop?: SopDocument; doc?: LibraryDocument;
    }> = [];

    if (archiveFilter === 'ALL' || archiveFilter === 'SPO') {
      activeSops.forEach((s) => rows.push({
        id: s.id, type: 'SPO', title: s.title, number: s.sopNumber, unit: s.divisionName,
        date: s.effectiveDate || s.createdAt, fileName: s.fileName, sop: s
      }));
    }
    if (canAccessProtectedDocs) {
      documents.forEach((d) => {
        if (archiveFilter !== 'ALL' && archiveFilter !== d.type) return;
        rows.push({
          id: d.id, type: d.type, title: d.title, number: d.documentNumber,
          unit: d.partnerName, date: d.effectiveDate || d.createdAt, fileName: d.fileName,
          fileSize: d.fileSize, doc: d
        });
      });
    }

    return rows.filter((r) => {
      if (!q) return true;
      return [r.title, r.number, r.unit, r.fileName].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [sops, documents, archiveFilter, archiveSearch, canAccessProtectedDocs]);

  const archiveCounts = useMemo(() => ({
    ALL: sops.filter((s) => s.status === 'AKTIF').length + (canAccessProtectedDocs ? documents.length : 0),
    SPO: sops.filter((s) => s.status === 'AKTIF').length,
    SK: canAccessProtectedDocs ? documents.filter((d) => d.type === 'SK').length : 0,
    MOU: canAccessProtectedDocs ? documents.filter((d) => d.type === 'MOU').length : 0,
  }), [sops, documents, canAccessProtectedDocs]);

  const handleArchiveOpen = (row: typeof archiveDocs[number]) => {
    if (row.type === 'SPO' && row.sop && onViewSop) {
      onViewSop(row.sop);
      return;
    }
    if (row.doc && onViewLibraryDoc) {
      onViewLibraryDoc(row.doc);
      return;
    }
    if (row.type === 'SK' || row.type === 'MOU') onNavigate(row.type === 'SK' ? 'sk' : 'mou');
  };

  const handleArchiveDownload = async (row: typeof archiveDocs[number]) => {
    try {
      let url: string | undefined;
      let fileName = row.fileName || `${row.type}.pdf`;
      if (row.type === 'SPO' && row.sop) {
        url = row.sop.signedScanDataUrl || row.sop.fileDataUrl;
        fileName = row.sop.signedScanFileName || row.sop.fileName || `${row.sop.sopNumber}.pdf`;
      } else if (row.doc) {
        url = await getLibraryDocumentUrl(row.doc);
        fileName = row.doc.fileName || fileName;
      }
      if (!url) return;
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

  // Global search
  const searchResults = useMemo(() => {
    const q =
      globalSearch
        .trim()
        .toLowerCase();

    if (!q) return null;

    const matchedSops = sops
      .filter(
        (s) =>
          (s.title || '')
            .toLowerCase()
            .includes(q) ||
          (s.sopNumber || '')
            .toLowerCase()
            .includes(q) ||
          (s.divisionName || '')
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 5);

    const matchedDocs = documents
      .filter(
        (d) =>
          (d.title || '')
            .toLowerCase()
            .includes(q) ||
          (d.documentNumber || '')
            .toLowerCase()
            .includes(q) ||
          (d.partnerName || '')
            .toLowerCase()
            .includes(q) ||
          (d.fileName || '')
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 5);

    return {
      sops: matchedSops,
      docs: matchedDocs,
      totalMatches:
        matchedSops.length +
        matchedDocs.length,
    };
  }, [
    globalSearch,
    sops,
    documents,
  ]);

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

          {/* Quick Search */}
          <div className="mt-6 max-w-2xl">
            <div className="relative bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-1.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-400 transition-all">

              <div className="flex items-center">

                <Search className="w-5 h-5 text-slate-300 ml-3 shrink-0 focus-within:text-slate-700" />

                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) =>
                    setGlobalSearch(
                      e.target.value
                    )
                  }
                  placeholder="Cari cepat nomor atau judul dokumen (SPO, SK, MOU)..."
                  className="w-full bg-transparent px-3 py-2 text-sm text-white placeholder-slate-400 focus:text-slate-900 focus:placeholder-slate-500 outline-none"
                />

                {globalSearch && (
                  <button
                    type="button"
                    onClick={() =>
                      setGlobalSearch('')
                    }
                    className="mr-2 p-1 rounded-lg text-slate-400 hover:text-white"
                  >
                    ×
                  </button>
                )}

              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Search Results */}
      {searchResults && (
        <section className="bg-white rounded-3xl border border-emerald-200 p-6 shadow-md animate-in fade-in duration-150">

          <div className="flex items-center justify-between pb-4 border-b border-slate-100">

            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-600" />

              <h2 className="text-sm font-black text-slate-900">
                Hasil Pencarian Cepat: "
                {globalSearch}"
              </h2>
            </div>

            <span className="text-xs font-bold text-slate-500">
              {searchResults.totalMatches}{' '}
              dokumen ditemukan
            </span>

          </div>

          {searchResults.totalMatches === 0 ? (

            <div className="py-8 text-center text-xs text-slate-500">
              Tidak ada dokumen yang cocok dengan kata kunci tersebut.
            </div>

          ) : (

            <div className="divide-y divide-slate-100 mt-2">

              {searchResults.sops.map(
                (sop) => (
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
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shrink-0"
                    >
                      Buka SPO
                    </button>

                  </div>
                )
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
                      onClick={() =>
                        onNavigate(
                          doc.type === 'SK'
                            ? 'sk'
                            : 'mou'
                        )
                      }
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold shrink-0"
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
              <input value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} placeholder="Cari arsip berdasarkan judul, nomor, atau unit..." className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500" />
              {archiveSearch && <button type="button" onClick={() => setArchiveSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(canAccessProtectedDocs ? [
                ['ALL', 'Semua', archiveCounts.ALL], ['SPO', 'SPO Final', archiveCounts.SPO], ['SK', 'SK Direktur', archiveCounts.SK], ['MOU', 'MOU / PKS', archiveCounts.MOU]
              ] : [['ALL', 'SPO Final', archiveCounts.SPO], ['SPO', 'SPO Final', archiveCounts.SPO]]).map(([id, label, count]) => (
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
            <h3 className="text-base font-extrabold text-slate-800">Tidak ada dokumen final yang ditemukan</h3>
            <p className="text-xs text-slate-500 mt-1">Belum ada dokumen final yang sesuai dengan pencarian atau filter.</p>
          </div>
        ) : archiveView === 'LIST' ? (
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[44px_1.7fr_1.25fr_1fr_1fr_130px] gap-3 px-5 py-3 bg-slate-50/70 border-b border-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-500">
                <span>No</span><span>Judul Dokumen</span><span>Nomor Dokumen</span><span>Jenis</span><span>Tanggal / Unit</span><span className="text-right">Aksi</span>
              </div>
              {archiveDocs.map((row, i) => (
                <div key={`${row.type}-${row.id}`} className="grid grid-cols-[44px_1.7fr_1.25fr_1fr_1fr_130px] gap-3 items-center px-5 py-3.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                  <span className="text-xs text-slate-400">{i + 1}</span>
                  <div className="min-w-0"><div className="text-sm font-bold text-slate-900 truncate">{row.title}</div><div className="text-[11px] text-slate-400 truncate">{row.fileName || 'Dokumen resmi'}{row.fileSize ? ` • ${formatBytes(row.fileSize)}` : ''}</div></div>
                  <span className="font-mono text-[11px] font-bold text-slate-700 truncate">{row.number || '—'}</span>
                  <span className={`w-fit px-2 py-1 rounded-md text-[10px] font-black ${row.type === 'SPO' ? 'bg-emerald-50 text-emerald-800' : row.type === 'SK' ? 'bg-teal-50 text-teal-800' : 'bg-blue-50 text-blue-800'}`}>{row.type === 'MOU' ? 'MOU / PKS' : `${row.type} Final`}</span>
                  <div className="min-w-0"><div className="text-[11px] font-semibold text-slate-600 truncate">{row.unit || 'RSUD Dr. Soegiri'}</div><div className="text-[10px] text-slate-400">{row.date ? new Date(row.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div></div>
                  <div className="flex justify-end gap-1.5"><button type="button" onClick={() => handleArchiveOpen(row)} className="p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100" title="Lihat"><Eye className="w-4 h-4" /></button>{(row.doc || row.sop) && <button type="button" onClick={() => handleArchiveDownload(row)} className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title="Download"><Download className="w-4 h-4" /></button>}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {archiveDocs.map((row) => (
              <article key={`${row.type}-${row.id}`} className="rounded-2xl border border-slate-200 p-4 hover:border-emerald-300 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-2"><span className={`px-2 py-1 rounded-md text-[10px] font-black ${row.type === 'SPO' ? 'bg-emerald-50 text-emerald-800' : row.type === 'SK' ? 'bg-teal-50 text-teal-800' : 'bg-blue-50 text-blue-800'}`}>{row.type === 'MOU' ? 'MOU / PKS' : `${row.type} Final`}</span><span className="text-[10px] text-slate-400">{row.date ? new Date(row.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span></div>
                <h3 className="mt-3 text-sm font-black text-slate-900 leading-snug line-clamp-2">{row.title}</h3>
                <p className="mt-1 font-mono text-[10px] font-bold text-emerald-800 truncate">{row.number || 'Tanpa nomor'}</p>
                <p className="mt-2 text-[11px] text-slate-500 truncate">{row.unit || 'RSUD Dr. Soegiri'}</p>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2"><button type="button" onClick={() => handleArchiveOpen(row)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"><Eye className="w-3.5 h-3.5" /> Buka</button>{(row.doc || row.sop) && <button type="button" onClick={() => handleArchiveDownload(row)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"><Download className="w-3.5 h-3.5" /> PDF</button>}</div>
              </article>
            ))}
          </div>
        )}
      </section>

      {pdfViewer && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="w-full h-full max-w-6xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="h-16 shrink-0 px-5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[10px] font-black">{pdfViewer.type}</span>
                  <h3 className="text-sm font-black text-slate-900 truncate">{pdfViewer.title}</h3>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Pratinjau dokumen PDF</p>
              </div>
              <button type="button" onClick={() => setPdfViewer(null)} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100" title="Tutup"><X className="w-5 h-5" /></button>
            </div>
            <iframe src={pdfViewer.url} title={pdfViewer.title} className="flex-1 w-full bg-slate-100" />
          </div>
        </div>
      )}

    </div>
  );
};
