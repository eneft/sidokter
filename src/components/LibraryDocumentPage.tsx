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
import { DocumentViewer } from './DocumentViewer';
import { AdminTooltip } from './AdminTooltip';

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

          {/* Upload Trigger: Admin & User */}
          {canUpload ? (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {type === 'SK' && (
                <AdminTooltip
                  title="Upload SK Perubahan"
                  content="Unggah SK revisi karena perubahan kebijakan, regulasi Kemenkes, atau ketentuan operasional rumah sakit."
                >
                  <button
                    type="button"
                    onClick={() => openUpload('PERUBAHAN')}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 text-xs font-black shadow-sm shadow-amber-200 transition-all cursor-pointer border border-amber-400"
                  >
                    <RefreshCw className="w-4 h-4 text-slate-950" />
                    <span>Upload SK Perubahan</span>
                  </button>
                </AdminTooltip>
              )}

              <AdminTooltip
                title={type === 'SK' ? 'Upload SK Pokok' : `Upload ${type} Baru`}
                content={type === 'SK' ? 'Unggah SK penetapan awal baru ke dalam sistem tata naskah.' : `Unggah berkas ${type} resmi baru.`}
              >
                <button
                  type="button"
                  onClick={() => openUpload('POKOK')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold shadow-sm shadow-emerald-200 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{type === 'SK' ? 'Upload SK Baru' : `Upload ${type} Baru`}</span>
                </button>
              </AdminTooltip>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Akses User: Lihat & Download</span>
            </div>
          )}
        </div>

        {/* SK Category Tabs (for SK only) */}
        {type === 'SK' && (
          <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 mr-1">Kategori SK:</span>
            <button
              type="button"
              onClick={() => setSkCategoryFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                skCategoryFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Semua SK</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                skCategoryFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {skCounts.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSkCategoryFilter('POKOK')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                skCategoryFilter === 'POKOK'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>SK Pokok / Penetapan Awal</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                skCategoryFilter === 'POKOK' ? 'bg-emerald-800 text-white' : 'bg-emerald-200 text-emerald-900'
              }`}>
                {skCounts.pokok}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSkCategoryFilter('PERUBAHAN')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                skCategoryFilter === 'PERUBAHAN'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-xs border border-amber-600/30'
                  : 'bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
              <span>SK Perubahan (Revisi Kebijakan)</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                skCategoryFilter === 'PERUBAHAN' ? 'bg-amber-600 text-white' : 'bg-amber-200 text-amber-950'
              }`}>
                {skCounts.perubahan}
              </span>
            </button>
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="mt-4 flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={type === 'SK' ? 'Cari judul SK, nomor SK, SK terdahulu, alasan perubahan, atau file...' : 'Cari judul MOU, nama mitra kerja sama, nomor MOU...'}
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

            const isPerubahan = type === 'SK' && (doc.isRevisionSK || doc.skCategory === 'PERUBAHAN');
            const revisionsForDoc = getRevisionsForDoc(doc);
            const originalDoc = isPerubahan ? getOriginalDoc(doc) : undefined;

            return (
              <div
                key={doc.id}
                className={`bg-white rounded-3xl border p-5 flex flex-col justify-between shadow-2xs hover:shadow-md transition-all group ${
                  isPerubahan 
                    ? 'border-amber-200/90 hover:border-amber-300 ring-1 ring-amber-100' 
                    : 'border-slate-200 hover:border-emerald-200'
                }`}
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {isPerubahan ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                        <RefreshCw className="w-3 h-3 text-amber-700" />
                        <span>SK PERUBAHAN</span>
                      </span>
                    ) : (
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                        type === 'SK' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}>
                        {type === 'SK' ? 'SK POKOK' : type}
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formattedDate}</span>
                    </span>
                  </div>

                  {/* Document Number */}
                  {doc.documentNumber && (
                    <div className={`mt-3 font-mono text-[11px] font-bold px-2.5 py-1 rounded-lg border inline-block max-w-full truncate ${
                      isPerubahan 
                        ? 'text-amber-900 bg-amber-50/80 border-amber-200'
                        : 'text-emerald-700 bg-emerald-50/60 border-emerald-100'
                    }`}>
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
                  <h3 className={`mt-2.5 text-sm font-black leading-snug line-clamp-2 transition-colors ${
                    isPerubahan 
                      ? 'text-slate-900 group-hover:text-amber-900' 
                      : 'text-slate-900 group-hover:text-emerald-800'
                  }`}>
                    {doc.title}
                  </h3>

                  {/* Description if available */}
                  {doc.description && (
                    <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">
                      {doc.description}
                    </p>
                  )}

                  {/* Context for SK Perubahan */}
                  {isPerubahan && (
                    <div className="mt-3 p-3 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-1.5">
                      <div className="flex items-center justify-between gap-1 text-[11px] font-black text-amber-950">
                        <span className="flex items-center gap-1">
                          <Scale className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>Merevisi SK Terdahulu:</span>
                        </span>
                        {originalDoc && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              resolveAndSetViewer(originalDoc);
                            }}
                            className="text-[10px] font-extrabold text-amber-800 hover:text-amber-950 underline inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>Lihat SK Asli</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>

                      <div className="text-xs font-bold text-amber-900 line-clamp-1">
                        {doc.originalSkNumber ? <span className="font-mono">{doc.originalSkNumber} - </span> : ''}
                        <span>{doc.originalSkTitle || 'SK Terdahulu'}</span>
                      </div>

                      {doc.revisionReason && (
                        <div className="text-[11px] text-amber-800 line-clamp-2 leading-relaxed">
                          <span className="font-bold text-amber-950">Dasar Perubahan: </span>
                          {doc.revisionReason}
                        </div>
                      )}

                      {doc.revisionType && (
                        <div className="pt-0.5">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300/70">
                            {doc.revisionType}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notice on Base SK if revisions exist */}
                  {!isPerubahan && revisionsForDoc.length > 0 && (
                    <div className="mt-3 p-2.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900">
                      <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-950">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Telah Diterbitkan SK Perubahan:</span>
                      </div>
                      <div className="mt-1.5 space-y-1">
                        {revisionsForDoc.map((rev) => (
                          <div key={rev.id} className="flex items-center justify-between gap-1 text-[11px]">
                            <span className="truncate text-amber-800 font-medium">
                              {rev.documentNumber || rev.title}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                resolveAndSetViewer(rev);
                              }}
                              className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-black text-[10px] shrink-0 cursor-pointer"
                            >
                              Buka
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
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
                    <AdminTooltip
                      title="Lihat PDF"
                      content={`Buka dan tinjau berkas PDF ${doc.title} langsung di pratinjau.`}
                    >
                      <button
                        type="button"
                        onClick={() => resolveAndSetViewer(doc)}
                        className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-white text-xs font-bold shadow-xs transition-colors cursor-pointer ${
                          isPerubahan 
                            ? 'bg-amber-600 hover:bg-amber-700'
                            : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Lihat PDF</span>
                      </button>
                    </AdminTooltip>

                    <AdminTooltip
                      title="Download PDF"
                      content="Unduh salinan berkas PDF resmi ke perangkat Anda."
                    >
                      <button
                        type="button"
                        onClick={() => downloadLibraryDoc(doc)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    </AdminTooltip>
                  </div>

                  {/* Admin Manage Actions */}
                  {isAdmin && (
                    <div className="flex items-center justify-end gap-1 pt-1">
                      <AdminTooltip
                        title="Edit Dokumen"
                        content="Ubah metadata seperti judul, nomor, atau informasi perubahan."
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(doc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      </AdminTooltip>

                      <AdminTooltip
                        title="Hapus Dokumen"
                        content="Hapus berkas dan metadata dokumen ini dari sistem."
                      >
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmDoc(doc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus</span>
                        </button>
                      </AdminTooltip>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
              {/* Informative alert for SK Perubahan */}
              {type === 'SK' && uploadMode === 'PERUBAHAN' && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/90 text-amber-950 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-black text-amber-900">
                    <Scale className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Dokumen SK Perubahan Kebijakan & Aturan</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Gunakan opsi ini jika SK ini merevisi, mengubah klausul, mengganti susunan lampiran, atau menyesuaikan aturan dari SK terdahulu karena kebijakan baru atau regulasi Kemenkes.
                  </p>
                </div>
              )}

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
                      placeholder="Jelaskan alasan perubahan, contoh: Penyesuaian Permenkes No. 24/2022 tentang Rekam Medis, perubahan alur rujukan, atau penyesuaian susunan tim..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                    />

                    {/* Quick suggestion chips */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                      <span className="text-slate-400 font-semibold mr-0.5">Saran Cepat:</span>
                      {[
                        'Penyesuaian Permenkes / Regulasi Baru',
                        'Perubahan Struktur Organisasi & Tim',
                        'Evaluasi SOP & Alur Pelayanan Klinis',
                        'Pembaruan Ketentuan Tarif & Fasilitas',
                        'Efisiensi & Rekomendasi Akreditasi RS'
                      ].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            setRevisionReason((prev) => (prev ? `${prev}; ${tag}` : tag));
                          }}
                          className="px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-amber-400 hover:text-amber-900 text-slate-600 transition-colors cursor-pointer"
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
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
                heightClass="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
