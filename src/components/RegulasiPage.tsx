import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Download,
  Edit3,
  Eye,
  FileText,
  Filter,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { LibraryDocument, RegulationType, UserSession } from '../types';
import {
  deleteRegulation,
  getRegulationDocumentUrl,
  subscribeToRegulationDocuments,
  updateRegulation,
  uploadRegulation
} from '../lib/regulationService';
import { formatBytes } from '../utils/numbering';
import { triggerFileDownload } from '../utils/fileStorage';
import { DocumentViewer } from './DocumentViewer';
import { createSingleFlightGuard } from '../lib/libraryDocumentCreatePolicy';

interface Props {
  userSession: UserSession;
  onBack?: () => void;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

type RegulationStatus = 'BERLAKU' | 'DICABUT';

const currentYear = () => String(new Date().getFullYear());

const regulationYearOf = (doc: LibraryDocument) => {
  if (doc.regulationYear) return String(doc.regulationYear);
  const source = doc.effectiveDate || doc.createdAt;
  const year = source ? new Date(source).getFullYear() : NaN;
  return Number.isFinite(year) ? String(year) : '-';
};

export const RegulasiPage: React.FC<Props> = ({ userSession, onBack, onShowToast }) => {
  const isAdmin = userSession.role === 'admin';
  const hasStructuralBadge = Array.isArray(userSession.badges)
    && userSession.badges.some((badge) => String(badge).toUpperCase() === 'STRUKTURAL');
  const hasAccess = isAdmin || hasStructuralBadge;

  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'ALL' | RegulationType>('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RegulationStatus>('ALL');
  const [viewer, setViewer] = useState<LibraryDocument | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<LibraryDocument | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<LibraryDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const submitGuard = useRef(createSingleFlightGuard());

  const [regulationType, setRegulationType] = useState<RegulationType>('PERDA');
  const [documentNumber, setDocumentNumber] = useState('');
  const [regulationYear, setRegulationYear] = useState(currentYear());
  const [title, setTitle] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [status, setStatus] = useState<RegulationStatus>('BERLAKU');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!hasAccess) return;
    return subscribeToRegulationDocuments(
      (rows) => setDocuments(rows),
      (error) => console.warn('REGULASI subscription notice:', error?.message || error)
    );
  }, [hasAccess]);

  const availableYears = useMemo(() => {
    return Array.from(new Set(documents.map(regulationYearOf).filter((year) => year !== '-'))).sort().reverse();
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((doc) => {
      const kind = (doc.regulationType || '').toUpperCase();
      const year = regulationYearOf(doc);
      const docStatus = String(doc.status || 'BERLAKU').toUpperCase();
      if (kindFilter !== 'ALL' && kind !== kindFilter) return false;
      if (yearFilter !== 'ALL' && year !== yearFilter) return false;
      if (statusFilter !== 'ALL' && docStatus !== statusFilter) return false;
      if (!q) return true;
      return [doc.title, doc.documentNumber, doc.description, kind, year, doc.fileName]
        .some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [documents, search, kindFilter, yearFilter, statusFilter]);

  const resetForm = () => {
    setRegulationType('PERDA');
    setDocumentNumber('');
    setRegulationYear(currentYear());
    setTitle('');
    setEffectiveDate('');
    setStatus('BERLAKU');
    setDescription('');
    setFile(null);
  };

  const openUpload = () => {
    if (!hasAccess) return;
    resetForm();
    setUploadOpen(true);
  };

  const openEdit = (doc: LibraryDocument) => {
    if (!isAdmin) return;
    setEditDoc(doc);
    setRegulationType((doc.regulationType || 'PERDA') as RegulationType);
    setDocumentNumber(doc.documentNumber || '');
    setRegulationYear(regulationYearOf(doc) === '-' ? currentYear() : regulationYearOf(doc));
    setTitle(doc.title || '');
    setEffectiveDate(doc.effectiveDate || '');
    setStatus(String(doc.status || 'BERLAKU').toUpperCase() === 'DICABUT' ? 'DICABUT' : 'BERLAKU');
    setDescription(doc.description || '');
  };

  const openViewer = async (doc: LibraryDocument) => {
    try {
      const url = await getRegulationDocumentUrl(doc);
      if (!url) throw new Error('File PDF tidak ditemukan di penyimpanan.');
      setViewer({ ...doc, downloadUrl: url });
    } catch (error: any) {
      onShowToast?.('error', 'Gagal Membuka Regulasi', error?.message || 'Dokumen tidak dapat dibuka.');
    }
  };

  const downloadDoc = async (doc: LibraryDocument) => {
    try {
      const url = await getRegulationDocumentUrl(doc);
      if (!url) throw new Error('File PDF tidak ditemukan di penyimpanan.');
      triggerFileDownload(url, doc.fileName || `${doc.regulationType || 'REGULASI'}.pdf`, doc.storagePath);
    } catch (error: any) {
      onShowToast?.('error', 'Download Gagal', error?.message || 'Dokumen tidak dapat diunduh.');
    }
  };

  const validateMetadata = () => {
    if (!title.trim()) return 'Tentang / Judul regulasi wajib diisi.';
    if (!documentNumber.trim()) return 'Nomor regulasi wajib diisi.';
    if (!/^\d{4}$/.test(regulationYear.trim())) return 'Tahun regulasi harus 4 digit.';
    return '';
  };

  const submitUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasAccess) return;
    const invalid = validateMetadata();
    if (invalid) {
      onShowToast?.('error', 'Data Belum Lengkap', invalid);
      return;
    }
    if (!file) {
      onShowToast?.('error', 'File Belum Dipilih', 'Pilih file PDF PERDA/PERBUP.');
      return;
    }
    if (!submitGuard.current.tryStart()) return;
    try {
      setSaving(true);
      await uploadRegulation(
        file,
        title.trim(),
        userSession.name,
        userSession.role,
        {
          regulationType,
          regulationYear: regulationYear.trim(),
          documentNumber: documentNumber.trim(),
          effectiveDate: effectiveDate || undefined,
          status,
          description: description.trim() || undefined
        },
        userSession.badges
      );
      setUploadOpen(false);
      resetForm();
      onShowToast?.('success', 'Regulasi Berhasil Ditambahkan', `${regulationType} Nomor ${documentNumber}/${regulationYear} tersimpan sebagai PDF asli.`);
    } catch (error: any) {
      onShowToast?.('error', 'Upload Gagal', error?.message || 'Regulasi gagal disimpan.');
    } finally {
      setSaving(false);
      submitGuard.current.finish();
    }
  };

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editDoc || !isAdmin) return;
    const invalid = validateMetadata();
    if (invalid) {
      onShowToast?.('error', 'Data Belum Lengkap', invalid);
      return;
    }
    try {
      setSaving(true);
      await updateRegulation(
        editDoc.id,
        {
          regulationType,
          regulationYear: regulationYear.trim(),
          documentNumber: documentNumber.trim(),
          title: title.trim(),
          effectiveDate: effectiveDate || undefined,
          status,
          description: description.trim() || undefined
        },
        userSession.name,
        userSession.role
      );
      setEditDoc(null);
      onShowToast?.('success', 'Metadata Diperbarui', 'Data regulasi berhasil diperbarui tanpa mengubah file PDF asli.');
    } catch (error: any) {
      onShowToast?.('error', 'Gagal Memperbarui', error?.message || 'Metadata regulasi gagal diperbarui.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteDoc || !isAdmin) return;
    try {
      setDeleting(true);
      await deleteRegulation(deleteDoc, userSession.role);
      setDeleteDoc(null);
      onShowToast?.('success', 'Regulasi Dihapus', 'Dokumen regulasi berhasil dihapus.');
    } catch (error: any) {
      onShowToast?.('error', 'Gagal Menghapus', error?.message || 'Regulasi tidak dapat dihapus.');
    } finally {
      setDeleting(false);
    }
  };

  if (!hasAccess) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-amber-600" />
          <h1 className="text-lg font-black text-slate-900">Anda tidak punya akses</h1>
          <p className="mt-2 text-sm font-medium text-slate-600">Memerlukan badge <span className="font-black text-amber-700">STRUKTURAL</span> untuk membuka REGULASI.</p>
          {onBack && (
            <button type="button" onClick={onBack} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Kembali
            </button>
          )}
        </div>
      </main>
    );
  }

  const FormFields = ({ includeFile }: { includeFile: boolean }) => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-bold text-slate-700">
          <span>Jenis Regulasi *</span>
          <select value={regulationType} onChange={(e) => setRegulationType(e.target.value as RegulationType)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500">
            <option value="PERDA">PERDA</option>
            <option value="PERBUP">PERBUP</option>
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-bold text-slate-700">
          <span>Status *</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as RegulationStatus)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500">
            <option value="BERLAKU">BERLAKU</option>
            <option value="DICABUT">DICABUT</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-bold text-slate-700">
          <span>Nomor *</span>
          <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="Contoh: 18" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
        </label>
        <label className="space-y-1.5 text-xs font-bold text-slate-700">
          <span>Tahun *</span>
          <input value={regulationYear} onChange={(e) => setRegulationYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="2026" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
        </label>
      </div>
      <label className="block space-y-1.5 text-xs font-bold text-slate-700">
        <span>Tentang / Judul *</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul resmi PERDA/PERBUP" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
      </label>
      <label className="block space-y-1.5 text-xs font-bold text-slate-700">
        <span>Tanggal Ditetapkan</span>
        <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
      </label>
      <label className="block space-y-1.5 text-xs font-bold text-slate-700">
        <span>Keterangan</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Keterangan atau relevansi regulasi (opsional)" className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
      </label>
      {includeFile && (
        <label className="block space-y-1.5 text-xs font-bold text-slate-700">
          <span>File PDF *</span>
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white" />
            <p className="mt-2 text-[11px] text-slate-500">PDF disimpan apa adanya di Firebase Storage. Maksimal 15 MB.</p>
          </div>
        </label>
      )}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {onBack && (
            <button type="button" onClick={onBack} className="mt-0.5 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800" aria-label="Kembali">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-600" />
              <h1 className="text-xl font-black tracking-tight text-slate-900">REGULASI</h1>
            </div>
            <p className="mt-1 text-xs font-medium text-slate-500">Repository PERDA dan PERBUP — file PDF resmi dipertahankan tanpa konversi.</p>
          </div>
        </div>
        <button type="button" onClick={openUpload} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> Tambah Regulasi
        </button>
      </div>

      <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_160px_150px_150px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nomor, judul, atau keterangan..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500" />
        </div>
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as any)} className="w-full appearance-none rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs font-bold outline-none focus:border-emerald-500">
            <option value="ALL">Semua Jenis</option>
            <option value="PERDA">PERDA</option>
            <option value="PERBUP">PERBUP</option>
          </select>
        </div>
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold outline-none focus:border-emerald-500">
          <option value="ALL">Semua Tahun</option>
          {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold outline-none focus:border-emerald-500">
          <option value="ALL">Semua Status</option>
          <option value="BERLAKU">BERLAKU</option>
          <option value="DICABUT">DICABUT</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Nomor</th>
                <th className="px-4 py-3">Tahun</th>
                <th className="min-w-[320px] px-4 py-3">Tentang</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocuments.map((doc) => {
                const kind = (doc.regulationType || 'PERDA') as RegulationType;
                const docStatus = String(doc.status || 'BERLAKU').toUpperCase();
                return (
                  <tr key={doc.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">{kind}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-black text-slate-800">{doc.documentNumber || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-slate-600">{regulationYearOf(doc)}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-black text-slate-800">{doc.title}</div>
                      {doc.description && <div className="mt-1 line-clamp-1 text-[11px] text-slate-500">{doc.description}</div>}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                        <FileText className="h-3 w-3" /> {doc.fileName} · {formatBytes(doc.fileSize || 0)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${docStatus === 'DICABUT' ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-100' : 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'}`}>{docStatus}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => void openViewer(doc)} className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" title="Preview"><Eye className="h-4 w-4" /></button>
                        <button type="button" onClick={() => void downloadDoc(doc)} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700" title="Download"><Download className="h-4 w-4" /></button>
                        {isAdmin && (
                          <>
                            <button type="button" onClick={() => openEdit(doc)} className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-700" title="Edit metadata"><Edit3 className="h-4 w-4" /></button>
                            <button type="button" onClick={() => setDeleteDoc(doc)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="Hapus"><Trash2 className="h-4 w-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredDocuments.length && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <BookOpen className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                    <p className="text-sm font-black text-slate-600">Belum ada regulasi yang sesuai.</p>
                    <p className="mt-1 text-xs text-slate-400">Tambahkan PERDA/PERBUP atau ubah filter pencarian.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {uploadOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <form onSubmit={submitUpload} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <div><h2 className="text-base font-black text-slate-900">Tambah Regulasi</h2><p className="text-[11px] text-slate-500">PERDA / PERBUP</p></div>
              <button type="button" onClick={() => setUploadOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5"><FormFields includeFile /></div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
              <button type="button" onClick={() => setUploadOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Batal</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Upload className="h-4 w-4" /> {saving ? 'Menyimpan...' : 'Simpan Regulasi'}</button>
            </div>
          </form>
        </div>
      )}

      {editDoc && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <form onSubmit={submitEdit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <div><h2 className="text-base font-black text-slate-900">Edit Metadata Regulasi</h2><p className="text-[11px] text-slate-500">File PDF asli tidak diubah.</p></div>
              <button type="button" onClick={() => setEditDoc(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5"><FormFields includeFile={false} /></div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
              <button type="button" onClick={() => setEditDoc(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Batal</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
            </div>
          </form>
        </div>
      )}

      {deleteDoc && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <Trash2 className="mb-4 h-9 w-9 text-rose-600" />
            <h2 className="text-lg font-black text-slate-900">Hapus regulasi?</h2>
            <p className="mt-2 text-sm text-slate-600">Dokumen <span className="font-black">{deleteDoc.title}</span> akan dihapus dari repository SIDOKTER.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteDoc(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Batal</button>
              <button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{deleting ? 'Menghapus...' : 'Hapus'}</button>
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-900">{viewer.regulationType || 'REGULASI'} No. {viewer.documentNumber || '-'} Tahun {regulationYearOf(viewer)}</div>
                <div className="truncate text-[11px] text-slate-500">{viewer.title}</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void downloadDoc(viewer)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Unduh</button>
                <button type="button" onClick={() => setViewer(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <DocumentViewer fileUrl={viewer.downloadUrl} storagePath={viewer.storagePath} fileName={viewer.fileName} heightClass="h-full" className="min-h-0 flex-1" showPdfDownloadAction={false} />
          </div>
        </div>
      )}
    </main>
  );
};
