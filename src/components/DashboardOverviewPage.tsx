import React, { useMemo, useState } from 'react';
import {
  FileText,
  FileCheck,
  Handshake,
  BookOpen,
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

  const [globalSearch, setGlobalSearch] = useState('');

  // Statistics calculation
  const totalSop = sops.length;

  const activeSop = sops.filter(
    (s) => s.status === 'AKTIF'
  ).length;

  const pendingSop = sops.filter(
    (s) => s.status === 'MENUNGGU_PENGESAHAN'
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

  // Recent SPO
  const recentSops = useMemo(() => {
    return [...sops]
      .sort(
        (a, b) =>
          new Date(
            b.createdAt || 0
          ).getTime() -
          new Date(
            a.createdAt || 0
          ).getTime()
      )
      .slice(0, 5);
  }, [sops]);

  // Recent SK
  const recentSk = useMemo(() => {
    return [...skDocs]
      .sort(
        (a, b) =>
          new Date(
            b.createdAt || 0
          ).getTime() -
          new Date(
            a.createdAt || 0
          ).getTime()
      )
      .slice(0, 3);
  }, [skDocs]);

  // Recent MOU
  const recentMou = useMemo(() => {
    return [...mouDocs]
      .sort(
        (a, b) =>
          new Date(
            b.createdAt || 0
          ).getTime() -
          new Date(
            a.createdAt || 0
          ).getTime()
      )
      .slice(0, 3);
  }, [mouDocs]);

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
            Selamat datang,{' '}
            {userSession.name ||
              'Pengguna'} 👋
          </h1>

          <p className="text-sm sm:text-base text-slate-300 mt-2 max-w-2xl leading-relaxed">
            Pusat dokumentasi regulasi terintegrasi untuk Standar Prosedur Operasional (SPO), Surat Keputusan (SK), Nota Kesepahaman (MOU), dan Arsip RSUD Dr. SOEGIRI LAMONGAN.
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
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

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

            {pendingSop > 0 && (
              <span className="text-amber-700 font-bold">
                {pendingSop}{' '}
                Menunggu
              </span>
            )}

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

        {/* Library Card - TETAP */}
        <button
          type="button"
          onClick={() =>
            onNavigate('library')
          }
          className="bg-white rounded-3xl border border-slate-200 p-5 text-left shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all group cursor-pointer"
        >

          <div className="flex items-center justify-between">

            <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <BookOpen className="w-5 h-5" />
            </div>

            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md">
             Dokumen Soegri
            </span>

          </div>

          <div className="mt-4 text-2xl sm:text-3xl font-black text-slate-900">
            {totalFinalDocs}
          </div>

          <div className="text-xs sm:text-sm font-bold text-slate-700 mt-1 flex items-center justify-between">

            <span>
              Total Dokumen
            </span>

            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-700 transition-colors" />

          </div>

          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 truncate">
            Semua Dokumen Aktif & Sah
          </div>

        </button>

      </section>


      {/* 4. Recent SPO & SK/MOU */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Recent SPO */}
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">

          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">

            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />

              <h2 className="text-sm font-black text-slate-900">
                SPO Terbaru
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                onNavigate('spo')
              }
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
            >
              <span>
                Lihat Semua
              </span>

              <ChevronRight className="w-3.5 h-3.5" />
            </button>

          </div>

          <div className="divide-y divide-slate-100">

            {recentSops.length === 0 ? (

              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada data SPO terdaftar.
              </div>

            ) : (

              recentSops.map(
                (sop) => (
                  <div
                    key={sop.id}
                    className="p-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3"
                  >

                    <div className="min-w-0 flex-1">

                      <div className="flex items-center gap-2 mb-1">

                        <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {sop.sopNumber ||
                            'Menunggu'}
                        </span>

                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            sop.status ===
                            'AKTIF'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {sop.status ===
                          'AKTIF'
                            ? 'AKTIF'
                            : 'MENUNGGU PENGESAHAN'}
                        </span>

                      </div>

                      <div className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                        {sop.title}
                      </div>

                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {sop.divisionName}{' '}
                        •{' '}
                        {sop.effectiveDate ||
                          '2026'}
                      </div>

                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onViewSop &&
                        onViewSop(sop)
                      }
                      className="p-2 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 transition-colors cursor-pointer shrink-0"
                      title="Buka SPO"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                  </div>
                )
              )

            )}

          </div>
        </div>

        {/* Recent SK & MOU */}
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">

          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">

            <div className="flex items-center gap-2">

              <FileCheck className="w-4 h-4 text-blue-600" />

              <h2 className="text-sm font-black text-slate-900">
                SK & MOU Terbaru
              </h2>

            </div>

            <div className="flex items-center gap-2">

              <button
                type="button"
                onClick={() =>
                  onNavigate('sk')
                }
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
              >
                SK
              </button>

              <span className="text-slate-300">
                •
              </span>

              <button
                type="button"
                onClick={() =>
                  onNavigate('mou')
                }
                className="text-xs font-bold text-blue-700 hover:text-blue-900 cursor-pointer"
              >
                MOU
              </button>

            </div>

          </div>

          <div className="divide-y divide-slate-100">

            {recentSk.length === 0 &&
            recentMou.length === 0 ? (

              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada dokumen SK atau MOU.
              </div>

            ) : (

              <>

                {recentSk.map(
                  (doc) => (
                    <div
                      key={doc.id}
                      className="p-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3"
                    >

                      <div className="min-w-0 flex-1">

                        <div className="flex items-center gap-2 mb-1">

                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            SK
                          </span>

                          {doc.documentNumber && (
                            <span className="font-mono text-[10px] font-bold text-slate-600 truncate">
                              {doc.documentNumber}
                            </span>
                          )}

                        </div>

                        <div className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                          {doc.title}
                        </div>

                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {doc.fileName}{' '}
                          •{' '}
                          {formatBytes(
                            doc.fileSize
                          )}
                        </div>

                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          onNavigate('sk')
                        }
                        className="p-2 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 transition-colors cursor-pointer shrink-0"
                        title="Buka Halaman SK"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                    </div>
                  )
                )}

                {recentMou.map(
                  (doc) => (
                    <div
                      key={doc.id}
                      className="p-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3"
                    >

                      <div className="min-w-0 flex-1">

                        <div className="flex items-center gap-2 mb-1">

                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                            MOU
                          </span>

                          {doc.partnerName && (
                            <span className="text-[11px] font-bold text-slate-600 truncate">
                              {doc.partnerName}
                            </span>
                          )}

                        </div>

                        <div className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                          {doc.title}
                        </div>

                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {doc.fileName}{' '}
                          •{' '}
                          {formatBytes(
                            doc.fileSize
                          )}
                        </div>

                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          onNavigate('mou')
                        }
                        className="p-2 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 transition-colors cursor-pointer shrink-0"
                        title="Buka Halaman MOU"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                    </div>
                  )
                )}

              </>
            )}

          </div>
        </div>

      </section>

    </div>
  );
};
