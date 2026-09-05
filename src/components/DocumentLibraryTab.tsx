import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, Download, Eye, FileText, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { LibraryDocument, LibraryDocumentType, UserSession } from '../types';
import { deleteLibraryDocument, uploadLibraryDocument } from '../lib/documentLibraryService';
import { formatBytes } from '../utils/numbering';
import { getNamedFileFromLocalCache } from '../utils/fileStorage';
import { DocumentViewer } from './DocumentViewer';

interface DocumentLibraryTabProps {
  documents: LibraryDocument[];
  userSession: UserSession;
  onRefresh?: () => void;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const DocumentLibraryTab: React.FC<DocumentLibraryTabProps> = ({
  documents, userSession, onShowToast
}) => {
  const [typeFilter, setTypeFilter] = useState<'ALL' | LibraryDocumentType>('ALL');
  const [search, setSearch] = useState('');
  const [viewer, setViewer] = useState<LibraryDocument | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<LibraryDocumentType>('SK');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((doc) =>
      (typeFilter === 'ALL' || doc.type === typeFilter) &&
      (!q || doc.title.toLowerCase().includes(q) || doc.fileName.toLowerCase().includes(q))
    );
  }, [documents, search, typeFilter]);

  const submitUpload = async () => {
    if (!file || !title.trim()) {
      onShowToast?.('error', 'Data Belum Lengkap', 'Pilih PDF dan isi judul dokumen.');
      return;
    }
    try {
      setSaving(true);
      await uploadLibraryDocument(file, type, title, userSession.name || userSession.username, userSession.role);
      setTitle('');
      setFile(null);
      setIsUploadOpen(false);
      onShowToast?.('success', 'Dokumen Berhasil Diunggah', `${type} berhasil masuk ke Library.`);
    } catch (err) {
      onShowToast?.('error', 'Upload Gagal', err instanceof Error ? err.message : 'Dokumen tidak dapat disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (doc: LibraryDocument) => {
    if (!window.confirm(`Hapus dokumen "${doc.title}" dari Library?`)) return;
    try {
      await deleteLibraryDocument(doc, userSession.role);
      onShowToast?.('success', 'Dokumen Dihapus', `${doc.type} telah dihapus dari Library.`);
      if (viewer?.id === doc.id) setViewer(null);
    } catch (err) {
      onShowToast?.('error', 'Penghapusan Gagal', err instanceof Error ? err.message : 'Dokumen tidak dapat dihapus.');
    }
  };

  const resolveLibraryUrl = async (doc: LibraryDocument) => {
    if (!doc.downloadUrl.startsWith('local://')) return doc.downloadUrl;
    return await getNamedFileFromLocalCache(`library_${doc.id}`);
  };

  const openLibraryDoc = async (doc: LibraryDocument) => {
    const url = await resolveLibraryUrl(doc);
    if (url) setViewer({ ...doc, downloadUrl: url });
  };

  const downloadLibraryDoc = async (doc: LibraryDocument) => {
    const url = await resolveLibraryUrl(doc);
    if (!url) return;
    const a = document.createElement('a'); a.href = url; a.download = doc.fileName; a.click();
  };

  return (
    <section id="document-library" className="space-y-4">
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700"><BookOpen className="w-5 h-5" /></div>
              <h2 className="text-lg font-black text-slate-900">Library Dokumen</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">SK dan MOU cukup upload PDF, lalu bisa dilihat dan di-download.</p>
          </div>
          {userSession.role === 'admin' && (
            <button type="button" onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
              <Plus className="w-4 h-4" /> Upload SK / MOU
            </button>
          )}
        </div>

        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari dokumen..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}
            className="sm:w-40 px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold">
            <option value="ALL">Semua</option>
            <option value="SK">SK</option>
            <option value="MOU">MOU</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <FileText className="w-10 h-10 mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700">Belum ada dokumen</p>
          <p className="text-xs text-slate-500 mt-1">Upload PDF SK atau MOU untuk menambah Library.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(doc => (
            <div key={doc.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[10px] font-black text-slate-700">{doc.type}</span>
                  <span className="text-[10px] text-slate-400">{formatBytes(doc.fileSize)}</span>
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900 leading-snug">{doc.title}</h3>
                <p className="mt-1 text-[10px] text-slate-500 truncate">{doc.fileName}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => openLibraryDoc(doc)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
                  <Eye className="w-3.5 h-3.5" /> Lihat PDF
                </button>
                <button type="button" onClick={() => downloadLibraryDoc(doc)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                {userSession.role === 'admin' && (
                  <button type="button" onClick={() => remove(doc)}
                    className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-[11px] font-bold">
                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isUploadOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">Upload Dokumen Library</h3>
              <button onClick={() => setIsUploadOpen(false)} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="mt-5 space-y-4">
              <select value={type} onChange={e => setType(e.target.value as LibraryDocumentType)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold">
                <option value="SK">SK</option><option value="MOU">MOU</option>
              </select>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Judul dokumen"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:ring-2 focus:ring-emerald-500" />
              <input ref={inputRef} type="file" accept="application/pdf,.pdf"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="w-full text-xs file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-bold" />
              {file && <p className="text-[11px] text-slate-500">{file.name} • {formatBytes(file.size)}</p>}
              <button type="button" disabled={saving} onClick={submitUpload}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black">
                {saving ? 'Mengunggah...' : <><Upload className="w-4 h-4 inline mr-2" />Simpan ke Library</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-[90] bg-slate-950/80 flex items-center justify-center p-3 sm:p-6">
          <div className="w-full h-full max-w-6xl bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="h-14 shrink-0 px-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-black text-slate-900 truncate">{viewer.title}</h3>
                <p className="text-[10px] text-slate-500 truncate">{viewer.fileName}</p>
              </div>
              <button onClick={() => setViewer(null)} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 min-h-0">
              <DocumentViewer fileUrl={viewer.downloadUrl} fileName={viewer.fileName} heightClass="h-full w-full" />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
