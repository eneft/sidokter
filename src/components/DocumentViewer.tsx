import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  FileText,
  AlertCircle,
  Loader2,
  FileCheck2,
  Download,
  FileType,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';
import { dataUrlToBlob, triggerFileDownload } from '../utils/fileStorage';

// Configure pdfjs worker using bundled worker
try {
  if (typeof window !== 'undefined' && pdfjsLib) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    } catch {
      const version = (pdfjsLib as any).version || '6.2.108';
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
    }
  }
} catch (e) {
  // Ignore worker initialization warning
}

interface DocumentViewerProps {
  fileUrl: string;
  fileName?: string;
  className?: string;
  heightClass?: string;
}

// Sub-component to render individual PDF page seamlessly
const PdfPageItem: React.FC<{ pdfDoc: any; pageNumber: number; customScale?: number }> = ({ 
  pdfDoc, 
  pageNumber,
  customScale = 1.35
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let renderTask: any = null;
    let isCancelled = false;

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        // Auto-scale with crisp resolution
        const viewport = page.getViewport({ scale: customScale });
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
  }, [pdfDoc, pageNumber, customScale]);

  if (renderError) {
    return (
      <div className="flex flex-col items-center justify-center p-4 bg-slate-100 text-slate-500 rounded-lg text-xs my-2">
        Halaman {pageNumber} tidak dapat dirender.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center px-1 sm:px-4 py-2 sm:py-3 mb-2 last:mb-0 w-full max-w-full overflow-x-auto touch-pan-x">
      <div className="relative shadow-[0_8px_30px_rgba(15,23,42,0.08)] rounded-sm overflow-hidden bg-white border border-slate-200 max-w-full">
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
  fileName = 'Dokumen_SPO.pdf',
  className = '',
  heightClass = 'h-[500px]'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [detectedType, setDetectedType] = useState<'pdf' | 'image' | 'word' | 'excel' | 'unknown'>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [fallbackBlobUrl, setFallbackBlobUrl] = useState<string | null>(null);
  const [pdfScale, setPdfScale] = useState<number>(1.2);

  const lowerName = (fileName || '').toLowerCase();
  const isImageFile = fileUrl.startsWith('data:image/') || /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(lowerName);
  const isWordFile = fileUrl.includes('application/vnd.openxmlformats-officedocument.wordprocessingml') || 
                     fileUrl.includes('application/msword') || 
                     /\.(docx?|rtf)$/i.test(lowerName);
  const isExcelFile = fileUrl.includes('spreadsheet') || fileUrl.includes('excel') || /\.(xlsx?|csv)$/i.test(lowerName);

  // Load Document safely
  useEffect(() => {
    let isCancelled = false;

    if (!fileUrl) {
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

        if (fileUrl.startsWith('data:')) {
          blob = dataUrlToBlob(fileUrl);
          arrayBuffer = await blob.arrayBuffer();
        } else if (fileUrl.startsWith('blob:') || fileUrl.startsWith('http')) {
          const res = await fetch(fileUrl);
          blob = await res.blob();
          arrayBuffer = await blob.arrayBuffer();
        } else {
          // Plain text or raw string
          blob = new Blob([fileUrl], { type: 'application/pdf' });
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
          // It is not a valid PDF file. Do NOT pass to PDF.js to avoid "Invalid PDF structure" error.
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

        // Load via PDF.js
        const version = (pdfjsLib as any).version || '4.0.379';
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
      } catch (err: any) {
        // Catch any PDF.js parsing error gracefully without crashing
        if (!isCancelled) {
          setError('Pratinjau PDF tidak dapat dirender secara langsung. Silakan unduh dokumen untuk membukanya.');
          setLoading(false);
        }
      }
    };

    inspectAndLoadPdf();

    return () => {
      isCancelled = true;
      if (fallbackBlobUrl) {
        URL.revokeObjectURL(fallbackBlobUrl);
      }
    };
  }, [fileUrl, fileName, isImageFile, isWordFile, isExcelFile]);

  const handleDownload = () => {
    triggerFileDownload(fileUrl, fileName);
  };

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-white rounded-2xl border border-slate-200 shadow-[0_10px_35px_rgba(15,23,42,0.07)] overflow-hidden ${heightClass} ${className}`}
    >
      {/* Compact preview controls — same visual language as the official SPO preview */}
      <div className="flex items-center justify-end gap-1.5 px-2 sm:px-3 py-1.5 bg-transparent shrink-0 no-print">
        {detectedType === 'pdf' && totalPages > 0 && (
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white/95 p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setPdfScale((prev) => Math.max(0.75, Number((prev - 0.2).toFixed(2))))}
              className="px-2 py-1 rounded-md text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Perkecil zoom"
            >
              −
            </button>
            <span className="px-2 text-[11px] font-semibold text-slate-600 min-w-[48px] text-center">
              {Math.round(pdfScale * 100 / 1.35)}%
            </span>
            <button
              type="button"
              onClick={() => setPdfScale((prev) => Math.min(2.2, Number((prev + 0.2).toFixed(2))))}
              className="px-2 py-1 rounded-md text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Perbesar zoom"
            >
              +
            </button>
          </div>
        )}

        {totalPages > 0 && (
          <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm">
            {totalPages} hal
          </span>
        )}

        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white/95 text-[11px] font-semibold text-slate-600 hover:text-indigo-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-sm"
          title="Unduh berkas"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Unduh</span>
        </button>
      </div>

      {/* Document canvas */}
      <div className="flex-1 bg-slate-50/80 overflow-y-auto overflow-x-hidden flex flex-col items-center p-3 sm:p-5 relative">
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
