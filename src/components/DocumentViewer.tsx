import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  Download,
  FileType,
  FileSpreadsheet
} from 'lucide-react';
import {
  dataUrlToBlob,
  triggerFileDownload,
  getProtectedStorageHeaders,
  buildStoragePathUrl,
  normalizeStorageUrl,
  resolveProtectedStorageUrl
} from '../utils/fileStorage';

export interface DocumentViewerProps {
  fileUrl?: string;
  file?: File | Blob | null;
  fileName?: string;
  storagePath?: string;
  className?: string;
  heightClass?: string;
}

type DocumentType = 'pdf' | 'image' | 'word' | 'excel' | 'unknown';
type ProtectedEvidenceSlot = 'signedScan' | 'oldFile';

function protectedEvidenceSlotFor(url: string): ProtectedEvidenceSlot | undefined {
  const protectedFileId = url.match(/^\/api\/storage\/files\/([^?#]+)/)?.[1];
  if (!protectedFileId) return undefined;

  let decodedFileId = protectedFileId;
  try {
    decodedFileId = decodeURIComponent(protectedFileId);
  } catch {
    // Keep matching against the original value when a legacy URL is malformed.
  }

  // signedScan and oldFile identify distinct evidence binaries and must never
  // fall through to the live document. The primary "file" slot is excluded:
  // older uploads legitimately use an unsuffixed ID as its compatible alias.
  const slot = decodedFileId.match(/_(signedScan|oldFile)(?:\.[a-zA-Z0-9]+)?$/)?.[1];
  return slot as ProtectedEvidenceSlot | undefined;
}

function documentTypeFor(fileName: string, mimeType = ''): DocumentType {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf';
  if (lowerMime.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(lowerName)) return 'image';
  if (lowerMime.includes('word') || lowerMime.includes('officedocument.wordprocessingml') || /\.(docx?|rtf)$/i.test(lowerName)) return 'word';
  if (lowerMime.includes('spreadsheet') || lowerMime.includes('excel') || /\.(xlsx?|csv)$/i.test(lowerName)) return 'excel';
  return 'unknown';
}

function requiresProtectedHeaders(url: string): boolean {
  return url.startsWith('/api/storage/files/') || url.startsWith('/api/storage/path');
}

/**
 * Displays document binaries using browser-native viewers. Protected Firebase
 * Storage files are fetched with the existing session headers first, then
 * exposed to the iframe as a short-lived Blob URL; no public storage URL or
 * custom PDF rendering engine is required.
 */
export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  fileUrl,
  file,
  fileName,
  storagePath,
  className = '',
  heightClass = 'h-[500px]'
}) => {
  const effectiveFileName = fileName || (file as File | undefined)?.name || 'Dokumen_SPO.pdf';
  const effectiveFileUrl = fileUrl || (storagePath ? buildStoragePathUrl(storagePath) : '');
  const [loading, setLoading] = useState(true);
  const [detectedType, setDetectedType] = useState<DocumentType>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const setPreview = (url: string, type: DocumentType) => {
      if (!cancelled) {
        setPreviewUrl(url);
        setDetectedType(type);
        setLoading(false);
      }
    };

    const loadDocument = async () => {
      setLoading(true);
      setError(null);
      setPreviewUrl(null);
      setDetectedType('unknown');

      if (!file && !effectiveFileUrl) {
        if (!cancelled) {
          setError('Berkas dokumen tidak tersedia.');
          setLoading(false);
        }
        return;
      }

      try {
        let blob: Blob;
        if (file) {
          blob = file;
        } else {
          const normalizedUrl = normalizeStorageUrl(effectiveFileUrl);
          if (normalizedUrl.startsWith('data:')) {
            blob = dataUrlToBlob(normalizedUrl);
          } else {
            // Prefer the durable Firebase Storage object path whenever a
            // legacy browser-local URL is paired with cloud metadata. For
            // protected URLs, retain the existing fallback probing so stale
            // file IDs can still resolve through their authoritative path.
            const resolvedUrl = normalizedUrl.startsWith('local://') && storagePath
              ? buildStoragePathUrl(storagePath)
              : await resolveProtectedStorageUrl(
                  normalizedUrl,
                  storagePath,
                  protectedEvidenceSlotFor(normalizedUrl)
                );
            if (!resolvedUrl || resolvedUrl.startsWith('local://')) {
              throw new Error('Dokumen belum memiliki referensi Firebase Storage yang dapat diakses.');
            }
            const headers = requiresProtectedHeaders(resolvedUrl)
              ? await getProtectedStorageHeaders()
              : undefined;
            const response = await fetch(resolvedUrl, { headers });
            if (!response.ok) {
              throw new Error(`Dokumen tidak ditemukan di server (HTTP ${response.status}).`);
            }
            blob = await response.blob();
          }
        }

        if (!blob.size) throw new Error('Berkas dokumen kosong atau tidak memiliki data.');
        const type = documentTypeFor(effectiveFileName, blob.type);
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl, type);
      } catch (loadError) {
        console.warn('[DocumentViewer] Error loading document:', loadError);
        if (!cancelled) {
          setError('Pratinjau dokumen tidak dapat dimuat. Silakan unduh berkas asli.');
          setLoading(false);
        }
      }
    };

    void loadDocument();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, effectiveFileUrl, effectiveFileName]);

  const handleDownload = () => {
    if (file) {
      const url = URL.createObjectURL(file);
      triggerFileDownload(url, effectiveFileName, storagePath);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else if (effectiveFileUrl) {
      triggerFileDownload(effectiveFileUrl, effectiveFileName, storagePath);
    }
  };

  return (
    <div className={`flex flex-col bg-white overflow-hidden ${heightClass} ${className}`}>
      {detectedType === 'pdf' && !error && (
        <div className="flex items-center justify-between gap-2 px-3 py-1 border-b border-slate-100 bg-white shrink-0 no-print min-h-[34px]">
          <span className="text-[11px] font-semibold text-slate-500">PDF</span>
          <button type="button" onClick={handleDownload} className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-slate-200 text-[10px] font-semibold text-slate-600 hover:bg-slate-50" title="Unduh dokumen">
            <Download className="w-3 h-3" />
            <span>Unduh</span>
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 bg-slate-50/80 overflow-auto flex flex-col items-center p-0 relative">
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
            <span className="text-xs font-medium">Memuat dokumen...</span>
          </div>
        )}

        {!loading && detectedType === 'pdf' && previewUrl && (
          <iframe title={`Pratinjau ${effectiveFileName}`} src={previewUrl} className="w-full h-full min-h-[420px] border-0 bg-white" />
        )}

        {!loading && detectedType === 'image' && previewUrl && (
          <div className="w-full flex items-center justify-center p-2">
            <img src={previewUrl} alt={effectiveFileName} className="max-w-full max-h-full object-contain rounded-lg shadow-xl" />
          </div>
        )}

        {!loading && (detectedType === 'word' || detectedType === 'excel') && (
          <div className="max-w-md m-auto p-6 bg-white rounded-2xl border border-slate-200 text-center space-y-4 shadow-sm">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto border ${detectedType === 'word' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
              {detectedType === 'word' ? <FileType className="w-7 h-7" /> : <FileSpreadsheet className="w-7 h-7" />}
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900">{detectedType === 'word' ? 'Dokumen Microsoft Word' : 'Dokumen Spreadsheet (Excel)'}</h4>
              <p className="text-xs text-slate-500 font-mono break-all">{effectiveFileName}</p>
              <p className="text-xs text-slate-500 leading-relaxed pt-2">Silakan unduh dokumen untuk membukanya di aplikasi yang sesuai.</p>
            </div>
            <button type="button" onClick={handleDownload} className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer">
              <Download className="w-4 h-4" />
              <span>Unduh Dokumen</span>
            </button>
          </div>
        )}

        {!loading && (error || detectedType === 'unknown') && (
          <div className="max-w-md m-auto p-6 bg-white rounded-2xl border border-slate-200 text-center space-y-4 shadow-sm">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800">Pratinjau Tidak Dapat Ditampilkan</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{error || 'Jenis berkas tidak didukung untuk pratinjau.'}</p>
            </div>
            <button type="button" onClick={handleDownload} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer">
              <Download className="w-4 h-4" />
              <span>Unduh Berkas Asli ({effectiveFileName})</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
