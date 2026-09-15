import React, { useEffect, useRef, useState } from 'react';
import '../lib/pdfPolyfill';
import { getPersistedClientSession, getCurrentAuthToken } from '../lib/authService';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { 
  AlertCircle,
  Loader2,
  Download,
  FileType,
  FileSpreadsheet
} from 'lucide-react';
import { dataUrlToBlob, triggerFileDownload, getProtectedStorageHeaders, buildStoragePathUrl } from '../utils/fileStorage';

// Configure pdfjs worker using bundled worker or fallback
try {
  if (typeof window !== 'undefined' && pdfjsLib) {
    try {
      if (pdfjsWorker) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
      } else {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      }
    } catch {
      const version = (pdfjsLib as any).version || '6.3.289';
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
    }
  }
} catch (e) {
  // Ignore worker initialization warning
}

export interface DocumentViewerProps {
  fileUrl?: string;
  file?: File | Blob | null;
  fileName?: string;
  storagePath?: string;
  className?: string;
  heightClass?: string;
}

// Sub-component to render individual PDF page seamlessly
const PdfPageItem: React.FC<{ pdfDoc: any; pageNumber: number; customScale?: number; fitWidth?: number }> = ({ 
  pdfDoc, 
  pageNumber,
  customScale = 1.35,
  fitWidth = 0
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageHostRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let renderTask: any = null;
    let isCancelled = false;

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        // Fit the PDF page to the available viewer width. This keeps the
        // document as large as possible without changing its aspect ratio.
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(280, fitWidth || pageHostRef.current?.clientWidth || 0);
        const fittedScale = fitWidth > 0
          ? Math.max(0.5, availableWidth / baseViewport.width)
          : customScale;
        const viewport = page.getViewport({ scale: fittedScale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
          transform: transform
        });

        await renderTask.promise;
        if (!isCancelled) {
          setRendered(true);
          setRenderError(false);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          if (!isCancelled) {
            setRenderError(true);
          }
        }
      }
    };

    render();

    return () => {
      isCancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, pageNumber, customScale, fitWidth]);

  if (renderError) {
    return (
      <div className="flex flex-col items-center justify-center p-4 bg-slate-100 text-slate-500 rounded-lg text-xs my-2">
        Halaman {pageNumber} tidak dapat dirender.
      </div>
    );
  }

  return (
    <div ref={pageHostRef} className="w-full flex flex-col items-center py-1 mb-1 last:mb-0">
      <div className="relative overflow-hidden bg-white max-w-full w-full">
        {!rendered && (
          <div className="w-[320px] sm:w-[600px] h-[450px] sm:h-[800px] max-w-full flex items-center justify-center bg-white text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
          </div>
        )}
        <canvas 
          ref={canvasRef} 
          className={`max-w-full h-auto block transition-opacity duration-200 ${rendered ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
        />
      </div>
    </div>
  );
};

// Check if Uint8Array has PDF header (%PDF-)
function hasPdfHeader(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 5) return false;
  // Look for "%PDF-" in the first 1024 bytes (some PDFs have leading whitespace/BOM)
  const maxSearch = Math.min(bytes.length - 4, 1024);
  for (let i = 0; i < maxSearch; i++) {
    if (
      bytes[i] === 0x25 && // %
      bytes[i + 1] === 0x50 && // P
      bytes[i + 2] === 0x44 && // D
      bytes[i + 3] === 0x46 && // F
      bytes[i + 4] === 0x2D // -
    ) {
      return true;
    }
  }
  return false;
}

// Check if bytes match ZIP / DOCX / XLSX (PK..)
function hasZipHeader(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 4) return false;
  return bytes[0] === 0x50 && bytes[1] === 0x4B && (bytes[2] === 0x03 || bytes[2] === 0x05);
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  fileUrl,
  file,
  fileName,
  storagePath,
  className = '',
  heightClass = 'h-[500px]'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerContentRef = useRef<HTMLDivElement>(null);
  const [viewerWidth, setViewerWidth] = useState(0);

  const effectiveFileName = fileName || (file as any)?.name || 'Dokumen_SPO.pdf';
  const effectiveFileUrl = fileUrl || (storagePath ? buildStoragePathUrl(storagePath) : '');

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [detectedType, setDetectedType] = useState<'pdf' | 'image' | 'word' | 'excel' | 'unknown'>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [fallbackBlobUrl, setFallbackBlobUrl] = useState<string | null>(null);
  const pdfScale = 1.0;

  useEffect(() => {
    const el = viewerContentRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const updateWidth = () => setViewerWidth(Math.max(0, el.clientWidth));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const lowerName = effectiveFileName.toLowerCase();
  const isImageFile = (file?.type?.startsWith('image/') ?? false) || effectiveFileUrl.startsWith('data:image/') || /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(lowerName);
  const isWordFile = effectiveFileUrl.includes('application/vnd.openxmlformats-officedocument.wordprocessingml') || 
                     effectiveFileUrl.includes('application/msword') || 
                     /\.(docx?|rtf)$/i.test(lowerName);
  const isExcelFile = effectiveFileUrl.includes('spreadsheet') || effectiveFileUrl.includes('excel') || /\.(xlsx?|csv)$/i.test(lowerName);

  // Load Document safely
  useEffect(() => {
    let isCancelled = false;

    if (!file && !effectiveFileUrl) {
      setLoading(false);
      setError('Berkas dokumen tidak tersedia.');
      return;
    }

    // Direct Image Handling
    if (isImageFile) {
      setDetectedType('image');
      setLoading(false);
      return;
    }

    // Direct Word Document Handling
    if (isWordFile) {
      setDetectedType('word');
      setLoading(false);
      return;
    }

    // Direct Excel Handling
    if (isExcelFile) {
      setDetectedType('excel');
      setLoading(false);
      return;
    }

    const inspectAndLoadPdf = async () => {
      setLoading(true);
      setError(null);

      try {
        let arrayBuffer: ArrayBuffer;
        let blob: Blob;

        if (file) {
          blob = file;
          arrayBuffer = await file.arrayBuffer();
        } else if (effectiveFileUrl.startsWith('data:')) {
          blob = dataUrlToBlob(effectiveFileUrl);
          arrayBuffer = await blob.arrayBuffer();
        } else if (effectiveFileUrl.startsWith('blob:') || effectiveFileUrl.startsWith('http') || effectiveFileUrl.startsWith('/')) {
          const headers: Record<string, string> = {};
          if (effectiveFileUrl.startsWith('/api/storage/files/') || effectiveFileUrl.startsWith('/api/storage/')) {
            const session = getPersistedClientSession();
            const token = await getCurrentAuthToken();
            if (session?.sessionId) headers['X-Session-Id'] = session.sessionId;
            if (session?.authUid) headers['X-Soegiri-Auth-Uid'] = session.authUid;
            if (session?.username) headers['X-User-Username'] = session.username;
            if (token) headers['Authorization'] = `Bearer ${token}`;
          }
          let res = await fetch(effectiveFileUrl, { headers });
          if (res.status === 404 && storagePath) {
            res = await fetch(buildStoragePathUrl(storagePath), { headers });
          }
          if (!res.ok) {
            throw new Error(`Gagal mengunduh file dari server (HTTP ${res.status}).`);
          }
          blob = await res.blob();
          arrayBuffer = await blob.arrayBuffer();
        } else if (effectiveFileUrl.startsWith('local://')) {
          const id = effectiveFileUrl.replace('local://', '');
          const fallbackServerUrl = `/api/storage/files/${id}`;
          const session = getPersistedClientSession();
          const token = await getCurrentAuthToken();
          const headers: Record<string, string> = {};
          if (session?.sessionId) headers['X-Session-Id'] = session.sessionId;
          if (session?.authUid) headers['X-Soegiri-Auth-Uid'] = session.authUid;
          if (session?.username) headers['X-User-Username'] = session.username;
          if (token) headers['Authorization'] = `Bearer ${token}`;
          let res = await fetch(fallbackServerUrl, { headers });
          if (res.status === 404 && storagePath) res = await fetch(buildStoragePathUrl(storagePath), { headers });
          if (!res.ok) {
            throw new Error('File tidak ditemukan di penyimpanan server.');
          }
          blob = await res.blob();
          arrayBuffer = await blob.arrayBuffer();
        } else {
          // Plain text or raw string
          blob = new Blob([effectiveFileUrl], { type: 'application/pdf' });
          arrayBuffer = await blob.arrayBuffer();
        }

        const uint8Array = new Uint8Array(arrayBuffer);

        // Check if buffer is empty
        if (uint8Array.length === 0) {
          if (!isCancelled) {
            setError('Berkas dokumen kosong atau tidak memiliki data.');
            setLoading(false);
          }
          return;
        }

        // Check if it is actually a Word/ZIP file disguised or with generic mime
        if (hasZipHeader(uint8Array) || isWordFile) {
          if (!isCancelled) {
            setDetectedType('word');
            setLoading(false);
          }
          return;
        }

        // Check if valid PDF header exists
        const isValidPdf = hasPdfHeader(uint8Array);

        if (!isValidPdf) {
          if (!isCancelled) {
            setDetectedType('unknown');
            setError('Berkas bukan format PDF yang valid atau mengalami kerusakan.');
            setLoading(false);
          }
          return;
        }

        // It is a valid PDF! Create safe object url for fallback and load via PDF.js
        const objectUrl = URL.createObjectURL(blob);
        if (!isCancelled) {
          setFallbackBlobUrl(objectUrl);
          setDetectedType('pdf');
        }

        // Attempt PDF.js canvas rendering
        try {
          const version = (pdfjsLib as any).version || '6.3.289';
          const loadingTask = pdfjsLib.getDocument({
            data: uint8Array,
            cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/cmaps/`,
            cMapPacked: true,
            verbosity: 0
          });

          const doc = await loadingTask.promise;
          if (!isCancelled) {
            setPdfDoc(doc);
            setTotalPages(doc.numPages);
            setLoading(false);
          }
        } catch (canvasErr: any) {
          console.warn('[DocumentViewer] PDF.js failed to render document:', canvasErr);
          if (!isCancelled) {
            setError('PDF tidak dapat dirender oleh PDF.js. Silakan coba lagi atau unduh dokumen.');
            setLoading(false);
          }
        }
      } catch (err: any) {
        console.warn('[DocumentViewer] Error loading document:', err);
        if (!isCancelled) {
          if (effectiveFileUrl && (effectiveFileUrl.includes('.pdf') || effectiveFileUrl.startsWith('/api/storage/files/'))) {
            setFallbackBlobUrl(effectiveFileUrl);
            setDetectedType('pdf');
            setLoading(false);
          } else {
            setError('Pratinjau PDF tidak dapat dirender secara langsung. Silakan unduh dokumen untuk membukanya.');
            setLoading(false);
          }
        }
      }
    };

    inspectAndLoadPdf();

    return () => {
      isCancelled = true;
      // Release the PDF.js document/worker resources when the source changes
      // or the viewer unmounts. This is important when users open many PDFs.
      setPdfDoc((currentDoc) => {
        if (currentDoc) {
          try { currentDoc.destroy(); } catch { /* ignore cleanup errors */ }
        }
        return null;
      });
      setTotalPages(0);
      if (fallbackBlobUrl) {
        URL.revokeObjectURL(fallbackBlobUrl);
        setFallbackBlobUrl(null);
      }
    };
  }, [file, effectiveFileUrl, effectiveFileName, storagePath, isImageFile, isWordFile, isExcelFile]);

  const handleDownload = () => {
    if (file) {
      const url = URL.createObjectURL(file);
      triggerFileDownload(url, effectiveFileName, storagePath);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else if (fallbackBlobUrl) {
      triggerFileDownload(fallbackBlobUrl, effectiveFileName, storagePath);
    } else if (effectiveFileUrl) {
      triggerFileDownload(effectiveFileUrl, effectiveFileName, storagePath);
    }
  };

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-white overflow-hidden ${heightClass} ${className}`}
    >
      {/* Minimal PDF.js toolbar */}
      {detectedType === 'pdf' && !error && totalPages > 0 && (
        <div className="flex items-center justify-between gap-2 px-3 py-1 border-b border-slate-100 bg-white shrink-0 no-print min-h-[34px]">
          <span className="text-[11px] font-semibold text-slate-500">PDF · {totalPages} halaman</span>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-slate-200 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
            title="Unduh dokumen"
          >
            <Download className="w-3 h-3" />
            <span>Unduh</span>
          </button>
        </div>
      )}

      {/* Document canvas */}
      <div ref={viewerContentRef} className="flex-1 bg-slate-50/80 overflow-y-auto overflow-x-hidden flex flex-col items-center p-0 relative">
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
            <span className="text-xs font-medium">Memeriksa dan memuat dokumen...</span>
          </div>
        )}

        {/* Word Document Dedicated View */}
        {!loading && detectedType === 'word' && (
          <div className="max-w-md m-auto p-6 bg-white rounded-2xl border border-blue-200 text-center space-y-4 shadow-sm">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-200">
              <FileType className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900">Dokumen Microsoft Word</h4>
              <p className="text-xs text-slate-500 font-mono break-all">{fileName}</p>
              <p className="text-xs text-slate-500 leading-relaxed pt-2">
                Pratinjau visual langsung di peramban hanya tersedia untuk format PDF dan Gambar. Berkas Word dapat diunduh untuk diedit atau dibuka di aplikasi Microsoft Word.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Dokumen Word</span>
            </button>
          </div>
        )}

        {/* Excel Dedicated View */}
        {!loading && detectedType === 'excel' && (
          <div className="max-w-md m-auto p-6 bg-white rounded-2xl border border-emerald-200 text-center space-y-4 shadow-sm">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900">Dokumen Spreadsheet (Excel)</h4>
              <p className="text-xs text-slate-500 font-mono break-all">{fileName}</p>
              <p className="text-xs text-slate-500 leading-relaxed pt-2">
                Silakan unduh dokumen untuk membukanya di aplikasi spreadsheet (Microsoft Excel / Google Sheets).
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Berkas Excel</span>
            </button>
          </div>
        )}

        {/* Error / Non-PDF View with Download action */}
        {!loading && error && detectedType !== 'word' && detectedType !== 'excel' && (
          <div className="max-w-md m-auto p-6 bg-white rounded-2xl border border-slate-200 text-center space-y-4 shadow-sm">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800">Pratinjau Tidak Dapat Ditampilkan</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                {error}
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Berkas Asli ({fileName})</span>
              </button>
            </div>
          </div>
        )}

        {/* Image Preview */}
        {!loading && !error && detectedType === 'image' && (
          <div className="w-full flex items-center justify-center p-2">
            <img 
              src={fileUrl} 
              alt={fileName} 
              className="max-w-full max-h-full object-contain rounded-lg shadow-xl"
            />
          </div>
        )}

        {/* PDF Page Canvas Rendering */}
        {!loading && !error && detectedType === 'pdf' && (
          <div className="w-full flex flex-col items-center">
            {pageNumbers.map((pageNum) => (
              <PdfPageItem 
                key={pageNum} 
                pdfDoc={pdfDoc} 
                pageNumber={pageNum} 
                customScale={pdfScale}
                fitWidth={viewerWidth}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
