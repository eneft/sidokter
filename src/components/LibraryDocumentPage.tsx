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
  ShieldAlert,
  RefreshCw,
  Scale,
  AlertTriangle,
  ExternalLink,
  AlertCircle,
  Sparkles,
  BookOpen
} from 'lucide-react';
import { LibraryDocument, LibraryDocumentType, SkCategory, UserSession } from '../types';
import { deleteSK, updateSK, uploadSK, getSKDocumentUrl } from '../lib/skService';
import { deleteMOU, updateMOU, uploadMOU, getMOUDocumentUrl } from '../lib/mouService';
import { formatBytes } from '../utils/numbering';
import { triggerFileDownload } from '../utils/fileStorage';
import { DocumentViewer } from './DocumentViewer';
import { AdminTooltip } from './AdminTooltip';
import { createSingleFlightGuard } from '../lib/libraryDocumentCreatePolicy';

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
  const hasStructuralBadge = Array.isArray(userSession.badges) && userSession.badges.some((b) => String(b).toUpperCase() === 'STRUKTURAL');
  // Role Admin memiliki wewenang manajemen tata naskah global SK & MOU tanpa memerlukan badge Struktural/admin
  const hasProtectedDocumentAccess = isAdmin || hasStructuralBadge;
  const canUpload = hasProtectedDocumentAccess;
  const [search, setSearch] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [skCategoryFilter, setSkCategoryFilter] = useState<'ALL' | 'POKOK' | 'PERUBAHAN'>('ALL');
  const [viewer, setViewer] = useState<LibraryDocument | null>(null);
  
  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<SkCategory>('POKOK');
  const [title, setTitle] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // SK Perubahan specific form state
  const [originalSkSourceMode, setOriginalSkSourceMode] = useState<'SELECT' | 'MANUAL'>('SELECT');
  const [selectedOriginalSkId, setSelectedOriginalSkId] = useState<string>('');
  const [originalSkNumber, setOriginalSkNumber] = useState<string>('');
  const [originalSkTitle, setOriginalSkTitle] = useState<string>('');
  const [revisionReason, setRevisionReason] = useState<string>('');
  const [revisionType, setRevisionType] = useState<string>('Perubahan Regulasi & Ketentuan');
  
  // Edit modal state
  const [editDoc, setEditDoc] = useState<LibraryDocument | null>(null);
  const [editIsRevisionSK, setEditIsRevisionSK] = useState<boolean>(false);
  const [editOriginalSkNumber, setEditOriginalSkNumber] = useState<string>('');
  const [editOriginalSkTitle, setEditOriginalSkTitle] = useState<string>('');
  const [editRevisionReason, setEditRevisionReason] = useState<string>('');
  const [editRevisionType, setEditRevisionType] = useState<string>('Perubahan Regulasi & Ketentuan');
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<LibraryDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadSubmissionGuard = useRef(createSingleFlightGuard());

  // Available SK list for referencing in SK Perubahan
  const availableBaseSkDocs = useMemo(() => {
    return documents
      .filter((d) => d.type === 'SK' && !d.isRevisionSK && d.skCategory !== 'PERUBAHAN')
      .sort((a, b) => (b.documentNumber || b.title).localeCompare(a.documentNumber || a.title));
  }, [documents]);

  // Map of revisions keyed by originalSkId and originalSkNumber
  const revisionsMap = useMemo(() => {
    const map = new Map<string, LibraryDocument[]>();
    documents
      .filter((d) => d.type === 'SK' && (d.isRevisionSK || d.skCategory === 'PERUBAHAN'))
      .forEach((rev) => {
        if (rev.originalSkId) {
          const list = map.get(rev.originalSkId) || [];
          list.push(rev);
          map.set(rev.originalSkId, list);
        }
        if (rev.originalSkNumber) {
          const key = rev.originalSkNumber.trim().toLowerCase();
          const list = map.get(key) || [];
          list.push(rev);
          map.set(key, list);
        }
      });
    return map;
  }, [documents]);

  // Helper: Find SK Perubahan documents that revise this base SK
  const getRevisionsForDoc = (doc: LibraryDocument): LibraryDocument[] => {
    if (doc.type !== 'SK' || doc.isRevisionSK || doc.skCategory === 'PERUBAHAN') return [];
    const byId = revisionsMap.get(doc.id) || [];
    const byNumber = doc.documentNumber ? revisionsMap.get(doc.documentNumber.trim().toLowerCase()) || [] : [];
    const combined = [...byId];
    byNumber.forEach((item) => {
      if (!combined.some((c) => c.id === item.id)) combined.push(item);
    });
    return combined;
  };

  // Helper: Find the original SK doc referenced by an SK Perubahan
  const getOriginalDoc = (revDoc: LibraryDocument): LibraryDocument | undefined => {
    if (!revDoc.isRevisionSK && revDoc.skCategory !== 'PERUBAHAN') return undefined;
    if (revDoc.originalSkId) {
      const found = documents.find((d) => d.id === revDoc.originalSkId);
      if (found) return found;
    }
    if (revDoc.originalSkNumber) {
      const cleanNum = revDoc.originalSkNumber.trim().toLowerCase();
      return documents.find((d) => d.type === 'SK' && d.documentNumber && d.documentNumber.trim().toLowerCase() === cleanNum);
    }
    return undefined;
  };

  // SK Counts for tabs
  const skCounts = useMemo(() => {
    if (type !== 'SK') return { total: 0, pokok: 0, perubahan: 0 };
    const allSK = documents.filter((d) => d.type === 'SK');
    const perubahan = allSK.filter((d) => d.isRevisionSK || d.skCategory === 'PERUBAHAN').length;
    const pokok = allSK.length - perubahan;
    return {
      total: allSK.length,
      pokok,
      perubahan
    };
  }, [documents, type]);

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

      // Category filter for SK
      if (type === 'SK' && skCategoryFilter !== 'ALL') {
        const isRev = Boolean(d.isRevisionSK || d.skCategory === 'PERUBAHAN');
        if (skCategoryFilter === 'POKOK' && isRev) return false;
        if (skCategoryFilter === 'PERUBAHAN' && !isRev) return false;
      }

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
      const matchOrigNumber = (d.originalSkNumber || '').toLowerCase().includes(q);
      const matchOrigTitle = (d.originalSkTitle || '').toLowerCase().includes(q);
      const matchReason = (d.revisionReason || '').toLowerCase().includes(q);
      const matchRevType = (d.revisionType || '').toLowerCase().includes(q);

      return (
        matchTitle ||
        matchNumber ||
        matchPartner ||
        matchFile ||
        matchDesc ||
        matchOrigNumber ||
        matchOrigTitle ||
        matchReason ||
        matchRevType
      );
    });
  }, [documents, search, type, selectedYear, skCategoryFilter]);

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
      triggerFileDownload(url, doc.fileName || `${type}.pdf`, doc.storagePath);
    } catch (e: any) {
      onShowToast?.('error', 'Download Gagal',
        e?.message || 'Dokumen tidak dapat diunduh.');
    }
  };

  const openUpload = (mode: SkCategory = 'POKOK') => {
    if (!canUpload) return;
    setUploadMode(mode);
    setTitle('');
    setDocumentNumber('');
    setPartnerName('');
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setExpiryDate('');
    setDescription('');
    setFile(null);
    // SK Perubahan resets
    setSelectedOriginalSkId('');
    setOriginalSkNumber('');
    setOriginalSkTitle('');
    setRevisionReason('');
    setRevisionType('Perubahan Regulasi & Ketentuan');
    setOriginalSkSourceMode('SELECT');
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

    // SK Perubahan edit states
    setEditIsRevisionSK(Boolean(doc.isRevisionSK || doc.skCategory === 'PERUBAHAN'));
    setEditOriginalSkNumber(doc.originalSkNumber || '');
    setEditOriginalSkTitle(doc.originalSkTitle || '');
    setEditRevisionReason(doc.revisionReason || '');
    setEditRevisionType(doc.revisionType || 'Perubahan Regulasi & Ketentuan');
  };

  const submitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpload) {
      onShowToast?.('error', 'Akses Ditolak', `${type} hanya dapat diakses oleh User dengan badge STRUKTURAL.`);
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

    const isUploadingPerubahan = type === 'SK' && uploadMode === 'PERUBAHAN';
    if (isUploadingPerubahan && !revisionReason.trim()) {
      onShowToast?.('error', 'Dasar Perubahan Wajib Diisi', 'Mohon sebutkan dasar atau alasan perubahan kebijakan/aturan.');
      return;
    }

    // React state updates are asynchronous and cannot by themselves reject two
    // submit events delivered in the same tick (for example a rapid double-click).
    if (!uploadSubmissionGuard.current.tryStart()) return;

    try {
      setSaving(true);
      const metadata = {
        documentNumber: documentNumber.trim() || undefined,
        partnerName: type === 'MOU' ? partnerName.trim() : undefined,
        effectiveDate,
        expiryDate: type === 'MOU' ? expiryDate : undefined,
        description: description.trim() || undefined,
        status: 'AKTIF',
        isRevisionSK: isUploadingPerubahan,
        skCategory: isUploadingPerubahan ? ('PERUBAHAN' as const) : ('POKOK' as const),
        originalSkId: isUploadingPerubahan && originalSkSourceMode === 'SELECT' && selectedOriginalSkId ? selectedOriginalSkId : undefined,
        originalSkNumber: isUploadingPerubahan ? originalSkNumber.trim() : undefined,
        originalSkTitle: isUploadingPerubahan ? originalSkTitle.trim() : undefined,
        revisionReason: isUploadingPerubahan ? revisionReason.trim() : undefined,
        revisionType: isUploadingPerubahan ? revisionType.trim() : undefined
      };

      if (type === 'SK') {
        await uploadSK(file, title, userSession.name, userSession.role, metadata, userSession.badges);
      } else {
        await uploadMOU(file, title, userSession.name, userSession.role, metadata, userSession.badges);
      }
      setUploadOpen(false);
      setTitle('');
      setDocumentNumber('');
      setPartnerName('');
      setFile(null);
      onShowToast?.(
        'success',
        isUploadingPerubahan ? 'SK Perubahan Berhasil Diunggah' : 'Upload Berhasil',
        isUploadingPerubahan
          ? `SK Perubahan "${title}" berhasil disimpan dan direlasikan ke tata naskah.`
          : `Dokumen ${type} "${title}" berhasil ditambahkan.`
      );
    } catch (e: any) {
      onShowToast?.('error', 'Upload Gagal', e?.message || 'Dokumen tidak dapat disimpan ke server.');
    } finally {
      uploadSubmissionGuard.current.finish();
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
      const updates: Record<string, any> = {
        title: title.trim(),
        documentNumber: documentNumber.trim() || undefined,
        partnerName: type === 'MOU' ? partnerName.trim() : undefined,
        effectiveDate,
        expiryDate: type === 'MOU' ? expiryDate : undefined,
        description: description.trim() || undefined,
      };

      if (type === 'SK') {
        updates.isRevisionSK = editIsRevisionSK;
        updates.skCategory = editIsRevisionSK ? 'PERUBAHAN' : 'POKOK';
        updates.originalSkNumber = editIsRevisionSK ? editOriginalSkNumber.trim() || undefined : undefined;
        updates.originalSkTitle = editIsRevisionSK ? editOriginalSkTitle.trim() || undefined : undefined;
        updates.revisionReason = editIsRevisionSK ? editRevisionReason.trim() || undefined : undefined;
        updates.revisionType = editIsRevisionSK ? editRevisionType.trim() || undefined : undefined;
      }

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

  if (!hasProtectedDocumentAccess) {
    return (
      <section className="min-h-[55vh] flex items-center justify-center animate-in fade-in duration-200">
        <div className="w-full max-w-xl bg-white rounded-3xl border border-amber-200 p-8 sm:p-10 text-center shadow-xs">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-black text-slate-900">Akses Terbatas</h2>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Anda tidak punya akses ke dokumen {type}.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-black">
            <ShieldAlert className="w-4 h-4" />
            <span>Memerlukan badge STRUKTURAL</span>
          </div>
          {onBack && (
            <button type="button" onClick={onBack} className="mt-6 text-xs font-bold text-slate-500 hover:text-slate-900">
              ← Kembali
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors shrink-0"
                title="Kembali"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-black text-slate-900">
                  {type === 'SK' ? 'Surat Keputusan (SK)' : 'MOU / PKS'}
                </h1>
                <span className="text-[11px] font-bold text-slate-500">{filtered.length} dokumen</span>
              </div>
            </div>
          </div>

          {canUpload && (
            <button
              type="button"
              onClick={() => openUpload('POKOK')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{type === 'SK' ? 'Upload SK' : 'Upload MOU / PKS'}</span>
            </button>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={type === 'SK' ? 'Cari nomor atau judul SK...' : 'Cari nomor, judul, atau mitra...'}
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {type === 'SK' && (
            <div className="flex items-center gap-1 overflow-x-auto">
              {([
                { id: 'ALL' as const, label: 'Semua', count: skCounts.total },
                { id: 'POKOK' as const, label: 'SK Pokok', count: skCounts.pokok },
                { id: 'PERUBAHAN' as const, label: 'SK Perubahan', count: skCounts.perubahan },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSkCategoryFilter(tab.id)}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                    skCategoryFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label} <span className="opacity-70">{tab.count}</span>
                </button>
              ))}
            </div>
          )}

          {availableYears.length > 0 && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full lg:w-auto px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Semua Tahun</option>
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Compact document register */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <h3 className="text-sm font-bold text-slate-800">
            {search ? 'Tidak ada dokumen yang sesuai pencarian' : `Belum ada dokumen ${type}`}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {search ? 'Coba kata kunci lain atau ubah filter.' : 'Belum ada dokumen yang terdaftar.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(190px,1.15fr)_minmax(280px,2fr)_minmax(130px,0.8fr)_110px_152px] items-center gap-3 bg-slate-50 border-b border-slate-200 px-4 py-2.5 text-[10px] uppercase tracking-wider font-black text-slate-500">
            <div>Nomor</div>
            <div>{type === 'SK' ? 'Judul SK' : 'Judul / Mitra'}</div>
            <div>{type === 'SK' ? 'Kategori' : 'Masa Berlaku'}</div>
            <div>Tanggal</div>
            <div className="text-right">Aksi</div>
          </div>

          <div className="divide-y divide-slate-100">
            {filtered.map((doc) => {
              const formattedDate = new Date(doc.effectiveDate || doc.createdAt).toLocaleDateString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric'
              });
              const expiryLabel = doc.expiryDate
                ? new Date(doc.expiryDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
              const isPerubahan = type === 'SK' && (doc.isRevisionSK || doc.skCategory === 'PERUBAHAN');
              const revisionsForDoc = getRevisionsForDoc(doc);
              const originalDoc = isPerubahan ? getOriginalDoc(doc) : undefined;

              return (
                <div key={doc.id} className="px-3.5 sm:px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(190px,1.15fr)_minmax(280px,2fr)_minmax(130px,0.8fr)_110px_152px] items-center gap-2 md:gap-3">
                    <div className="min-w-0 flex items-center justify-between gap-2 md:block">
                      <span className="font-mono text-xs font-black text-slate-700 break-all md:break-normal md:whitespace-normal">
                        {doc.documentNumber || '—'}
                      </span>
                      <span className={`md:hidden shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        isPerubahan ? 'bg-amber-50 text-amber-800 border border-amber-200' : type === 'SK' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {isPerubahan ? 'Perubahan' : type === 'SK' ? 'SK Pokok' : 'MOU'}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => resolveAndSetViewer(doc)}
                        className="block text-left text-[13px] font-semibold text-slate-900 hover:text-emerald-700 hover:underline underline-offset-2 leading-snug"
                      >
                        {doc.title}
                      </button>
                      {type === 'MOU' && doc.partnerName && (
                        <div className="mt-0.5 text-[11px] text-slate-500 truncate">{doc.partnerName}</div>
                      )}
                      {isPerubahan && (
                        <div className="mt-0.5 text-[10px] text-amber-800 flex flex-wrap items-center gap-1">
                          <span>Merevisi:</span>
                          {originalDoc ? (
                            <button type="button" onClick={() => resolveAndSetViewer(originalDoc)} className="font-bold hover:underline">
                              {doc.originalSkNumber || doc.originalSkTitle || 'SK terdahulu'}
                            </button>
                          ) : (
                            <span className="font-bold">{doc.originalSkNumber || doc.originalSkTitle || 'SK terdahulu'}</span>
                          )}
                        </div>
                      )}
                      {!isPerubahan && revisionsForDoc.length > 0 && (
                        <div className="mt-0.5 text-[10px] text-amber-700 flex flex-wrap items-center gap-1">
                          <span>Perubahan:</span>
                          {revisionsForDoc.map((rev, index) => (
                            <React.Fragment key={rev.id}>
                              {index > 0 && <span>·</span>}
                              <button type="button" onClick={() => resolveAndSetViewer(rev)} className="font-bold hover:underline">
                                {rev.documentNumber || rev.title}
                              </button>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                      <div className="md:hidden mt-1 text-[10px] text-slate-400 flex items-center gap-2">
                        <span>{formattedDate}</span>
                        {type === 'MOU' && doc.expiryDate && <span>• s.d. {expiryLabel}</span>}
                      </div>
                    </div>

                    <div className="hidden md:flex items-center">
                      {type === 'SK' ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isPerubahan
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {isPerubahan ? 'SK Perubahan' : 'SK Pokok'}
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-600">{expiryLabel}</span>
                      )}
                    </div>

                    <div className="hidden md:block text-[11px] text-slate-500">{formattedDate}</div>

                    <div className="flex items-center gap-1 md:justify-end">
                      <button type="button" onClick={() => resolveAndSetViewer(doc)} className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50" title="Lihat PDF">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => downloadLibraryDoc(doc)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Download PDF">
                        <Download className="w-4 h-4" />
                      </button>
                      {isAdmin && (
                        <>
                          <button type="button" onClick={() => handleOpenEdit(doc)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Edit dokumen">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => setDeleteConfirmDoc(doc)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50" title="Hapus dokumen">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upload Modal (Admin & User) */}
      {uploadOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
            <div className={`px-6 py-4.5 border-b flex items-center justify-between ${
              type === 'SK' && uploadMode === 'PERUBAHAN' 
                ? 'bg-amber-50/70 border-amber-200' 
                : 'bg-white border-slate-100'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${
                  type === 'SK' && uploadMode === 'PERUBAHAN'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : type === 'SK' 
                    ? 'bg-emerald-50 text-emerald-700' 
                    : 'bg-blue-50 text-blue-700'
                }`}>
                  {type === 'SK' && uploadMode === 'PERUBAHAN' ? <RefreshCw className="w-5 h-5 text-amber-800" /> : <Upload className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {type === 'SK' && uploadMode === 'PERUBAHAN'
                      ? 'Upload SK Perubahan (Revisi Aturan)'
                      : `Upload Dokumen ${type}`}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {type === 'SK' && uploadMode === 'PERUBAHAN'
                      ? 'Unggah SK yang direvisi karena adanya perubahan kebijakan, regulasi, atau aturan'
                      : 'Unggah berkas PDF resmi ke sistem SIDOKTER SOEGIRI'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Type selector toggle for SK */}
            {type === 'SK' && (
              <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Tipe SK:</span>
                <button
                  type="button"
                  onClick={() => setUploadMode('POKOK')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    uploadMode === 'POKOK'
                      ? 'bg-white text-emerald-800 shadow-xs border border-emerald-300 ring-1 ring-emerald-100'
                      : 'text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  <FileCheck className="w-4 h-4 text-emerald-600" />
                  <span>SK Pokok / Penetapan Baru</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUploadMode('PERUBAHAN')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    uploadMode === 'PERUBAHAN'
                      ? 'bg-amber-500 text-slate-950 shadow-xs font-black border border-amber-600/40'
                      : 'text-amber-900 bg-amber-50/70 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>SK Perubahan (Revisi)</span>
                </button>
              </div>
            )}

            <form onSubmit={submitUpload} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Revision link section */}
              {type === 'SK' && uploadMode === 'PERUBAHAN' && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-slate-600" />
                      <span>SK Terdahulu yang Direvisi / Diubah</span>
                    </label>
                    <div className="inline-flex rounded-lg bg-slate-200 p-0.5 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setOriginalSkSourceMode('SELECT')}
                        className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                          originalSkSourceMode === 'SELECT' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                        }`}
                      >
                        Pilih dari Sistem
                      </button>
                      <button
                        type="button"
                        onClick={() => setOriginalSkSourceMode('MANUAL')}
                        className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                          originalSkSourceMode === 'MANUAL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                        }`}
                      >
                        Input Manual
                      </button>
                    </div>
                  </div>

                  {originalSkSourceMode === 'SELECT' ? (
                    <div>
                      <select
                        value={selectedOriginalSkId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedOriginalSkId(val);
                          const matched = availableBaseSkDocs.find((d) => d.id === val);
                          if (matched) {
                            setOriginalSkNumber(matched.documentNumber || '');
                            setOriginalSkTitle(matched.title || '');
                          } else {
                            setOriginalSkNumber('');
                            setOriginalSkTitle('');
                          }
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                      >
                        <option value="">-- Pilih SK yang ingin direvisi dari perpustakaan --</option>
                        {availableBaseSkDocs.map((sk) => (
                          <option key={sk.id} value={sk.id}>
                            {sk.documentNumber ? `[${sk.documentNumber}] ` : ''}{sk.title}
                          </option>
                        ))}
                      </select>
                      {availableBaseSkDocs.length === 0 && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Belum ada SK Pokok terdaftar. Anda dapat beralih ke "Input Manual" di atas.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <span className="block text-[11px] font-bold text-slate-600 mb-1">Nomor SK Terdahulu:</span>
                        <input
                          type="text"
                          value={originalSkNumber}
                          onChange={(e) => setOriginalSkNumber(e.target.value)}
                          placeholder="188/010/KEP/413.204/2024"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                      </div>
                      <div>
                        <span className="block text-[11px] font-bold text-slate-600 mb-1">Judul SK Terdahulu:</span>
                        <input
                          type="text"
                          value={originalSkTitle}
                          onChange={(e) => setOriginalSkTitle(e.target.value)}
                          placeholder="Contoh: SK Standar Pelayanan Rawat Inap..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Alasan / Dasar Perubahan */}
                  <div>
                    <label className="block text-[11px] font-black text-slate-800 mb-1">
                      Dasar & Alasan Perubahan Kebijakan / Aturan <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      required={uploadMode === 'PERUBAHAN'}
                      value={revisionReason}
                      onChange={(e) => setRevisionReason(e.target.value)}
                      placeholder="Jelaskan dasar atau alasan perubahan SK secara singkat dan spesifik..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                    />

                  </div>

                  {/* Sifat / Ruang Lingkup Perubahan */}
                  <div>
                    <label className="block text-[11px] font-black text-slate-800 mb-1">
                      Ruang Lingkup Perubahan
                    </label>
                    <select
                      value={revisionType}
                      onChange={(e) => setRevisionType(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                    >
                      <option value="Perubahan Regulasi & Ketentuan">Perubahan Regulasi & Ketentuan</option>
                      <option value="Perubahan Susunan Personel / Tim Kerja">Perubahan Susunan Personel / Tim Kerja</option>
                      <option value="Revisi Standar Operasional Prosedur (SOP)">Revisi Standar Operasional Prosedur (SOP)</option>
                      <option value="Pembaruan Lampiran & Ketentuan Teknis">Pembaruan Lampiran & Ketentuan Teknis</option>
                      <option value="Perubahan Menyeluruh / Penggantian">Perubahan Menyeluruh / Penggantian</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Judul Dokumen Baru */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Judul Dokumen {type === 'SK' && uploadMode === 'PERUBAHAN' ? 'SK Perubahan' : type} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    type === 'SK' && uploadMode === 'PERUBAHAN'
                      ? 'Contoh: Perubahan Atas Keputusan Direktur No. 188/010 Tentang SOP IGD...'
                      : type === 'SK'
                      ? 'Contoh: Penetapan Tim Pelayanan Kanker Terpadu...'
                      : 'Contoh: Kerja Sama Layanan Rujukan Kesehatan...'
                  }
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
                  Keterangan / Ringkasan Dokumen <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Catatan ringkas mengenai isi atau tujuan penetapan dokumen ini..."
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

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
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
                  className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-50 text-white text-xs font-black shadow-xs cursor-pointer ${
                    type === 'SK' && uploadMode === 'PERUBAHAN'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {saving ? (
                    'Mengunggah...'
                  ) : (
                    <>
                      {type === 'SK' && uploadMode === 'PERUBAHAN' ? <RefreshCw className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                      <span>{type === 'SK' && uploadMode === 'PERUBAHAN' ? 'Simpan SK Perubahan' : 'Simpan Dokumen'}</span>
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
        <div className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
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

            <form onSubmit={submitEdit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* SK Perubahan toggle in edit modal */}
              {type === 'SK' && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editIsRevisionSK}
                      onChange={(e) => setEditIsRevisionSK(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                      <span>Tandai sebagai SK Perubahan (Revisi Aturan)</span>
                    </span>
                  </label>

                  {editIsRevisionSK && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-200/70">
                      <div>
                        <span className="block text-[11px] font-bold text-slate-600 mb-1">Nomor SK Terdahulu:</span>
                        <input
                          type="text"
                          value={editOriginalSkNumber}
                          onChange={(e) => setEditOriginalSkNumber(e.target.value)}
                          placeholder="Contoh: 188/010/KEP/413.204/2024"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                      </div>
                      <div>
                        <span className="block text-[11px] font-bold text-slate-600 mb-1">Judul SK Terdahulu:</span>
                        <input
                          type="text"
                          value={editOriginalSkTitle}
                          onChange={(e) => setEditOriginalSkTitle(e.target.value)}
                          placeholder="Judul SK yang direvisi"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                        />
                      </div>
                      <div>
                        <span className="block text-[11px] font-bold text-slate-600 mb-1">Dasar & Alasan Perubahan:</span>
                        <textarea
                          rows={2}
                          value={editRevisionReason}
                          onChange={(e) => setEditRevisionReason(e.target.value)}
                          placeholder="Alasan perubahan kebijakan atau aturan..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                        />
                      </div>
                      <div>
                        <span className="block text-[11px] font-bold text-slate-600 mb-1">Ruang Lingkup Perubahan:</span>
                        <select
                          value={editRevisionType}
                          onChange={(e) => setEditRevisionType(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                        >
                          <option value="Perubahan Regulasi & Ketentuan">Perubahan Regulasi & Ketentuan</option>
                          <option value="Perubahan Susunan Personel / Tim Kerja">Perubahan Susunan Personel / Tim Kerja</option>
                          <option value="Revisi Standar Operasional Prosedur (SOP)">Revisi Standar Operasional Prosedur (SOP)</option>
                          <option value="Pembaruan Lampiran & Ketentuan Teknis">Pembaruan Lampiran & Ketentuan Teknis</option>
                          <option value="Perubahan Menyeluruh / Penggantian">Perubahan Menyeluruh / Penggantian</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                  {viewer.isRevisionSK || viewer.skCategory === 'PERUBAHAN' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                      <RefreshCw className="w-3 h-3 text-amber-700" />
                      <span>SK PERUBAHAN</span>
                    </span>
                  ) : (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                      viewer.type === 'SK' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'
                    }`}>
                      {viewer.type === 'SK' ? 'SK POKOK' : viewer.type}
                    </span>
                  )}
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
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Context Sub-bar if SK Perubahan or has revisions */}
            {(viewer.isRevisionSK || viewer.skCategory === 'PERUBAHAN') && (
              <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-900">
                  <Scale className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    <strong className="text-amber-950">SK Perubahan Regulasi:</strong> Merevisi {viewer.originalSkNumber ? `[${viewer.originalSkNumber}] ` : ''}
                    {viewer.originalSkTitle || 'SK Terdahulu'}.
                    {viewer.revisionReason && <span className="ml-1 text-amber-800 italic">Dasar: {viewer.revisionReason}</span>}
                  </span>
                </div>
                {getOriginalDoc(viewer) && (
                  <button
                    type="button"
                    onClick={() => resolveAndSetViewer(getOriginalDoc(viewer)!)}
                    className="px-2.5 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-950 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Buka SK Asli</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* If Original SK has revisions, show notice */}
            {!(viewer.isRevisionSK || viewer.skCategory === 'PERUBAHAN') && getRevisionsForDoc(viewer).length > 0 && (
              <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    <strong className="text-amber-950">Catatan Revisi:</strong> Terdapat {getRevisionsForDoc(viewer).length} SK Perubahan yang merevisi SK ini.
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {getRevisionsForDoc(viewer).map((rev) => (
                    <button
                      key={rev.id}
                      type="button"
                      onClick={() => resolveAndSetViewer(rev)}
                      className="px-2.5 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3 text-amber-800" />
                      <span>Lihat {rev.documentNumber || 'SK Perubahan'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Body: Embedded Document Viewer */}
            <div className="flex-1 min-h-0 bg-slate-100">
              <DocumentViewer
                fileUrl={viewer.downloadUrl}
                fileName={viewer.fileName}
                storagePath={viewer.storagePath}
                heightClass="h-full w-full"
                showPdfDownloadAction={false}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
