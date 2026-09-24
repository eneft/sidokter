import React, { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
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
  /** Let the parent own vertical scrolling by expanding a PDF to all pages. */
  singleScroll?: boolean;
  /** Hide the inline PDF download action when the parent already provides one. */
  showPdfDownloadAction?: boolean;
}

type DocumentType = 'pdf' | 'image' | 'word' | 'excel' | 'unknown';
type ProtectedStorageSlot = 'file' | 'signedScan' | 'oldFile';

function protectedStorageSlotFor(url: string): ProtectedStorageSlot | undefined {
  const protectedFileId = url.match(/^\/api\/storage\/files\/([^?#]+)/)?.[1];
  if (!protectedFileId) return undefined;

  let decodedFileId = protectedFileId;
  try {
    decodedFileId = decodeURIComponent(protectedFileId);
  } catch {
    // Keep matching against the original value when a legacy URL is malformed.
  }

  const slot = decodedFileId.match(/_(file|signedScan|oldFile)(?:\.[a-zA-Z0-9]+)?$/)?.[1];
  return slot as ProtectedStorageSlot | undefined;
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
  return url.startsWith('/api/storage/files/') ||
    url.startsWith('/api/storage/path') ||
    url.startsWith('/api/storage/sop/');
}

function withOptimizedPreviewIntent(url: string, fileName: string): string {
  if (!requiresProtectedHeaders(url) || documentTypeFor(fileName) !== 'pdf') return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}preview=1`;
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
  heightClass = 'h-[500px]',
  singleScroll = false,
  showPdfDownloadAction = true
}) => {
  const effectiveFileName = fileName || (file as File | undefined)?.name || 'Dokumen_SPO.pdf';
  const effectiveFileUrl = fileUrl || (storagePath ? buildStoragePathUrl(storagePath) : '');
  const [loading, setLoading] = useState(true);
  const [detectedType, setDetectedType] = useState<DocumentType>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfAspectHeight, setPdfAspectHeight] = useState<number | null>(null);
  const [viewerWidth, setViewerWidth] = useState(0);
  const viewerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!singleScroll || !viewerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setViewerWidth(entry.contentRect.width));
    observer.observe(viewerRef.current);
    return () => observer.disconnect();
  }, [singleScroll]);

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
      setPdfAspectHeight(null);

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
                  protectedStorageSlotFor(normalizedUrl)
                );
            if (!resolvedUrl || resolvedUrl.startsWith('local://')) {
              throw new Error('Dokumen belum memiliki referensi Firebase Storage yang dapat diakses.');
            }
            const previewRequestUrl = withOptimizedPreviewIntent(resolvedUrl, effectiveFileName);
            const headers = requiresProtectedHeaders(resolvedUrl)
              ? await getProtectedStorageHeaders()
              : undefined;
            const response = await fetch(previewRequestUrl, { headers, cache: 'default' });
            if (!response.ok) {
              throw new Error(`Dokumen tidak ditemukan di server (HTTP ${response.status}).`);
            }
            blob = await response.blob();
          }
        }

        if (!blob.size) throw new Error('Berkas dokumen kosong atau tidak memiliki data.');
        const type = documentTypeFor(effectiveFileName, blob.type);
        if (singleScroll && type === 'pdf') {
          // Read only page geometry. The iframe still renders the original
          // binary; no regenerated or screenshot PDF is introduced.
          try {
            const pdf = await PDFDocument.load(await blob.arrayBuffer(), { updateMetadata: false });
            const pages = pdf.getPages();
            const aspectHeight = pages.reduce((total, page) => {
              const { width, height } = page.getSize();
              return total + (width > 0 ? height / width : 0);
            }, 0);
            setPdfAspectHeight(aspectHeight + Math.max(0, pages.length - 1) * 0.035);
          } catch (geometryError) {
            // Keep the original browser preview available for encrypted or
            // unusual PDFs whose page boxes cannot be inspected client-side.
            console.warn('[DocumentViewer] PDF page geometry unavailable:', geometryError);
          }
        }
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
  }, [file, effectiveFileUrl, effectiveFileName, storagePath, singleScroll]);

  const naturalPdfHeight = singleScroll && pdfAspectHeight && viewerWidth
    ? Math.ceil(viewerWidth * pdfAspectHeight + 64)
    : undefined;

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
    <div ref={viewerRef} className={`flex flex-col bg-white overflow-hidden ${singleScroll ? 'h-auto' : heightClass} ${className}`}>
      {detectedType === 'pdf' && !error && (
        <div className="flex items-center justify-between gap-2 px-3 py-1 border-b border-slate-100 bg-white shrink-0 no-print min-h-[34px]">
          <span className="text-[11px] font-semibold text-slate-500">PDF</span>
          {showPdfDownloadAction && (
            <button type="button" onClick={handleDownload} className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-slate-200 text-[10px] font-semibold text-slate-600 hover:bg-slate-50" title="Unduh dokumen">
              <Download className="w-3 h-3" />
              <span>Unduh</span>
            </button>
          )}
        </div>
      )}

      <div className={`${singleScroll ? '' : 'flex-1 min-h-0 overflow-auto'} bg-slate-50/80 flex flex-col items-center p-0 relative`}>
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
            <span className="text-xs font-medium">Memuat dokumen...</span>
          </div>
        )}

        {!loading && detectedType === 'pdf' && previewUrl && (
          <iframe
            title={`Pratinjau ${effectiveFileName}`}
            src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            className={`w-full border-0 bg-white ${singleScroll ? '' : 'h-full min-h-[420px]'}`}
            style={singleScroll ? { height: `${naturalPdfHeight || 600}px` } : undefined}
          />
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
