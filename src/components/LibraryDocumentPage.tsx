import React, { useMemo, useRef, useState } from 'react';
import { 
  ArrowLeft, 
  Download, 
  Edit3, 
  Eye, 
  FileText, 
  FileCheck, 
  Handshake, 
  Plus, 
  Search, 
  Trash2, 
  Upload, 
  X, 
  Calendar, 
  Building2, 
  CheckCircle2,
  FileDown,
  Clock,
  Filter,
  ShieldAlert
} from 'lucide-react';
import { LibraryDocument, LibraryDocumentType, UserSession } from '../types';
import { deleteSK, updateSK, uploadSK, getSKDocumentUrl } from '../lib/skService';
import { deleteMOU, updateMOU, uploadMOU, getMOUDocumentUrl } from '../lib/mouService';
import { formatBytes } from '../utils/numbering';
import { DocumentViewer } from './DocumentViewer';

interface Props {
  type: LibraryDocumentType;
  documents: LibraryDocument[];
  userSession: UserSession;
  onBack?: () => void;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const LibraryDocumentPage: React.FC<Props> = ({ 
  type, 
  documents, 
  userSession, 
  onBack, 
  onShowToast 
}) => {
  const isAdmin = userSession.role === 'admin';
  const canUpload = isAdmin || userSession.role === 'petugas';
  const [search, setSearch] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [viewer, setViewer] = useState<LibraryDocument | null>(null);
  
  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Edit modal state
  const [editDoc, setEditDoc] = useState<LibraryDocument | null>(null);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<LibraryDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Available years from documents
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    documents
      .filter((d) => d.type === type)
      .forEach((d) => {
        const dateStr = d.effectiveDate || d.createdAt;
        if (dateStr) {
          const y = new Date(dateStr).getFullYear();
          if (!isNaN(y)) years.add(y.toString());
        }
      });
    return Array.from(years).sort().reverse();
  }, [documents, type]);

  // Filtered documents
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (d.type !== type) return false;

      // Year filter
      if (selectedYear !== 'ALL') {
        const dateStr = d.effectiveDate || d.createdAt;
        if (dateStr) {
          const y = new Date(dateStr).getFullYear().toString();
          if (y !== selectedYear) return false;
        }
      }

      if (!q) return true;
      const matchTitle = (d.title || '').toLowerCase().includes(q);
      const matchNumber = (d.documentNumber || '').toLowerCase().includes(q);
      const matchPartner = (d.partnerName || '').toLowerCase().includes(q);
      const matchFile = (d.fileName || '').toLowerCase().includes(q);
      const matchDesc = (d.description || '').toLowerCase().includes(q);

      return matchTitle || matchNumber || matchPartner || matchFile || matchDesc;
    });
  }, [documents, search, type, selectedYear]);

  const resolveAndSetViewer = async (doc: LibraryDocument) => {
    try {
      const url = await (type === 'SK' ? getSKDocumentUrl(doc) : getMOUDocumentUrl(doc));
      if (!url) {
        onShowToast?.(
          'error',
          'File PDF Tidak Ditemukan',
          `File ${doc.fileName || 'dokumen'} tidak tersedia di penyimpanan.`
        );
        return;
      }
      setViewer({ ...doc, downloadUrl: url });
    } catch (e: any) {
      onShowToast?.(
        'error',
        'Gagal Membuka PDF',
        e?.message || 'Dokumen tidak dapat dibuka.'
      );
    }
  };

  const downloadLibraryDoc = async (doc: LibraryDocument) => {
    try {
      const url = await (type === 'SK' ? getSKDocumentUrl(doc) : getMOUDocumentUrl(doc));
      if (!url) {
        onShowToast?.('error', 'File PDF Tidak Ditemukan',
          `File ${doc.fileName || 'dokumen'} tidak tersedia di penyimpanan.`);
        return;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Gagal mengambil PDF (HTTP ${response.status}).`);

      const blob = await response.blob();
      if (!blob.size) throw new Error('File PDF kosong.');

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.fileName || `${type}.pdf`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch (e: any) {
      onShowToast?.('error', 'Download Gagal',
        e?.message || 'Dokumen tidak dapat diunduh.');
    }
  };

  const openUpload = () => {
    if (!canUpload) return;
    setTitle('');
    setDocumentNumber('');
    setPartnerName('');
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setExpiryDate('');
    setDescription('');
    setFile(null);
    setUploadOpen(true);
  };

  const handleOpenEdit = (doc: LibraryDocument) => {
    if (!isAdmin) return;
    setEditDoc(doc);
    setTitle(doc.title);
    setDocumentNumber(doc.documentNumber || '');
    setPartnerName(doc.partnerName || '');
    setEffectiveDate(doc.effectiveDate || doc.createdAt.slice(0, 10));
    setExpiryDate(doc.expiryDate || '');
    setDescription(doc.description || '');
  };

  const submitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpload) {
      onShowToast?.('error', 'Akses Ditolak', 'Hanya Admin atau Petugas yang dapat mengunggah dokumen.');
      return;
    }
    if (!file) {
      onShowToast?.('error', 'File Belum Dipilih', 'Pilih file PDF dokumen.');
      return;
    }
    if (!title.trim()) {
      onShowToast?.('error', 'Judul Wajib Diisi', `Judul dokumen ${type} tidak boleh kosong.`);
      return;
    }

    try {
      setSaving(true);
      const metadata = {
        documentNumber,
        partnerName: type === 'MOU' ? partnerName : undefined,
        effectiveDate,
        expiryDate: type === 'MOU' ? expiryDate : undefined,
        description,
        status: 'AKTIF',
      };

      if (type === 'SK') {
        await uploadSK(file, title, userSession.name, userSession.role, metadata);
      } else {
        await uploadMOU(file, title, userSession.name, userSession.role, metadata);
      }
      setUploadOpen(false);
      setTitle('');
      setDocumentNumber('');
      setPartnerName('');
      setFile(null);
      onShowToast?.('success', 'Upload Berhasil', `Dokumen ${type} "${title}" berhasil ditambahkan.`);
    } catch (e: any) {
      onShowToast?.('error', 'Upload Gagal', e?.message || 'Dokumen tidak dapat disimpan ke server.');
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editDoc) return;
    if (!title.trim()) {
      onShowToast?.('error', 'Judul Kosong', `Judul dokumen ${type} wajib diisi.`);
      return;
    }

    try {
      setSaving(true);
      const updates = {
        title,
        documentNumber,
        partnerName: type === 'MOU' ? partnerName : undefined,
        effectiveDate,
        expiryDate: type === 'MOU' ? expiryDate : undefined,
        description,
      };

      if (type === 'SK') {
        await updateSK(editDoc.id, updates, userSession.name, userSession.role);
      } else {
        await updateMOU(editDoc.id, updates, userSession.name, userSession.role);
      }
      setEditDoc(null);
      onShowToast?.('success', 'Dokumen Diperbarui', `Dokumen ${type} berhasil diperbarui.`);
    } catch (e: any) {
      onShowToast?.('error', 'Edit Gagal', e?.message || 'Dokumen tidak dapat diperbarui.');
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async () => {
    if (!isAdmin || !deleteConfirmDoc) return;
    try {
      setDeleting(true);
      if (type === 'SK') {
        await deleteSK(deleteConfirmDoc, userSession.role);
      } else {
        await deleteMOU(deleteConfirmDoc, userSession.role);
      }
      if (viewer?.id === deleteConfirmDoc.id) setViewer(null);
      setDeleteConfirmDoc(null);
      onShowToast?.('success', 'Dokumen Dihapus', `Dokumen ${type} berhasil dihapus.`);
    } catch (e: any) {
      onShowToast?.('error', 'Hapus Gagal', e?.message || 'Dokumen tidak dapat dihapus.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-5 animate-in fade-in duration-200">
      {/* Top Banner / Header */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
                title="Kembali"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className={`p-3 rounded-2xl ${type === 'SK' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
              {type === 'SK' ? <FileCheck className="w-6 h-6" /> : <Handshake className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                  {type === 'SK' ? 'Dokumen Surat Keputusan (SK)' : 'Dokumen Kerja Sama (MOU / PKS)'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                  {filtered.length} Dokumen
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {type === 'SK'
                  ? 'Surat Keputusan Direktur RSUD Dr. Soegiri Lamongan yang sah dan aktif.'
                  : 'Perjanjian Kerja Sama & Nota Kesepahaman RSUD Dr. Soegiri dengan instansi mitra.'}
              </p>
            </div>
          </div>

          {/* Upload Trigger: Admin & Petugas */}
          {canUpload ? (
            <button
              type="button"
              onClick={openUpload}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold shadow-sm shadow-emerald-200 transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Upload {type} Baru</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Akses Petugas: Lihat & Download</span>
            </div>
          )}
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-5 flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={type === 'SK' ? 'Cari judul SK, nomor SK, atau file...' : 'Cari judul MOU, nama mitra kerja sama, nomor MOU...'}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {availableYears.length > 0 && (
            <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              <span className="text-[11px] font-bold text-slate-500 shrink-0 ml-1">Tahun:</span>
              <button
                type="button"
                onClick={() => setSelectedYear('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                  selectedYear === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua
              </button>
              {availableYears.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setSelectedYear(year)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                    selectedYear === year
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Documents Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-800">
            {search ? 'Tidak ada dokumen yang sesuai pencarian' : `Belum ada dokumen ${type}`}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search
              ? 'Coba gunakan kata kunci pencarian yang lain atau reset filter tahun.'
              : canUpload
              ? `Klik tombol "Upload ${type} Baru" di atas untuk menambahkan berkas PDF resmi.`
              : `Belum ada dokumen ${type} yang dipublikasikan ke sistem.`}
          </p>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSelectedYear('ALL'); }}
              className="mt-4 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
            >
              Reset Pencarian
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((doc) => {
            const formattedDate = doc.effectiveDate
              ? new Date(doc.effectiveDate).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : new Date(doc.createdAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });

            return (
              <div
                key={doc.id}
                className="bg-white rounded-3xl border border-slate-200 p-5 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-emerald-200 transition-all group"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                      type === 'SK' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-blue-50 text-blue-800 border border-blue-200'
                    }`}>
                      {type}
                    </span>

                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formattedDate}</span>
                    </span>
                  </div>

                  {/* Document Number */}
                  {doc.documentNumber && (
                    <div className="mt-3 font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50/60 px-2.5 py-1 rounded-lg border border-emerald-100 inline-block max-w-full truncate">
                      {doc.documentNumber}
                    </div>
                  )}

                  {/* Partner Name for MOU */}
                  {type === 'MOU' && doc.partnerName && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">{doc.partnerName}</span>
                    </div>
                  )}

                  {/* Title */}
                  <h3 className="mt-2.5 text-sm font-black text-slate-900 leading-snug line-clamp-2 group-hover:text-emerald-800 transition-colors">
                    {doc.title}
                  </h3>

                  {/* Description if available */}
                  {doc.description && (
                    <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">
                      {doc.description}
                    </p>
                  )}

                  {/* File info */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate max-w-[170px]">{doc.fileName}</span>
                    <span className="font-semibold">{formatBytes(doc.fileSize)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => resolveAndSetViewer(doc)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadLibraryDoc(doc)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>

                  {/* Admin Manage Actions */}
                  {isAdmin && (
                    <div className="flex items-center justify-end gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(doc)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteConfirmDoc(doc)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal (Admin & Petugas) */}
      {uploadOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${type === 'SK' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Upload Dokumen {type}</h3>
                  <p className="text-[11px] text-slate-500">Unggah berkas PDF resmi ke sistem SIDOKTER SOEGIRI</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitUpload} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Judul Dokumen {type} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={type === 'SK' ? 'Contoh: Penetapan Tim Pelayanan Kanker Terpadu...' : 'Contoh: Kerja Sama Layanan Rujukan Kesehatan...'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nomor {type} <span className="text-slate-400 font-normal">(Opsional)</span>
                  </label>
                  <input
                    type="text"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    placeholder={type === 'SK' ? '188/025/KEP/413.204/2026' : '001/PKS/RSUD-SGR/2026'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanggal Terbit / Penetapan
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {type === 'MOU' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nama Mitra Kerjasama <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={partnerName}
                      onChange={(e) => setPartnerName(e.target.value)}
                      placeholder="Contoh: BPJS Kesehatan Cabang Bojonegoro"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Masa Berlaku Hingga <span className="text-slate-400 font-normal">(Opsional)</span>
                    </label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Keterangan / Ringkasan <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Catatan ringkas mengenai isi atau tujuan dokumen ini..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>

              {/* PDF File Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  File Dokumen PDF <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={inputRef}
                  type="file"
                  required
                  accept="application/pdf,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-bold hover:file:bg-emerald-100 cursor-pointer"
                />
                {file && (
                  <p className="mt-1.5 text-[11px] font-bold text-emerald-700">
                    ✓ {file.name} ({formatBytes(file.size)})
                  </p>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUploadOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving || !file}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black shadow-xs cursor-pointer"
                >
                  {saving ? (
                    'Mengunggah...'
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Simpan Dokumen</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal (Admin only) */}
      {editDoc && (
        <div className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Edit Dokumen {type}</h3>
                  <p className="text-[11px] text-slate-500">Perbarui metadata dokumen resmi</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditDoc(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Judul Dokumen <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nomor {type}
                  </label>
                  <input
                    type="text"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanggal Terbit / Penetapan
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {type === 'MOU' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nama Mitra Kerjasama
                    </label>
                    <input
                      type="text"
                      value={partnerName}
                      onChange={(e) => setPartnerName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Masa Berlaku Hingga
                    </label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Keterangan / Ringkasan
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditDoc(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black shadow-xs cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmDoc && (
        <div className="fixed inset-0 z-[85] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-900">Hapus Dokumen {type}?</h3>
            <p className="text-xs text-slate-500 mt-1">
              Dokumen <strong className="text-slate-800">"{deleteConfirmDoc.title}"</strong> akan dihapus permanen dari sistem SIDOKTER SOEGIRI dan file Storage.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteConfirmDoc(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={executeDelete}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black shadow-xs cursor-pointer"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus Dokumen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {viewer && (
        <div className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
          <div className="w-full h-full max-w-6xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-slate-200">
            {/* Modal Header */}
            <div className="h-16 shrink-0 px-5 sm:px-6 border-b border-slate-200 flex items-center justify-between gap-3 bg-white">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                    viewer.type === 'SK' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'
                  }`}>
                    {viewer.type}
                  </span>
                  {viewer.documentNumber && (
                    <span className="text-xs font-mono font-bold text-slate-600 truncate">
                      {viewer.documentNumber}
                    </span>
                  )}
                </div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 truncate mt-0.5">
                  {viewer.title}
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => downloadLibraryDoc(viewer)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  <span className="hidden sm:inline">Download PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewer(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Embedded Document Viewer */}
            <div className="flex-1 min-h-0 bg-slate-100">
              <DocumentViewer
                fileUrl={viewer.downloadUrl}
                fileName={viewer.fileName}
                heightClass="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
