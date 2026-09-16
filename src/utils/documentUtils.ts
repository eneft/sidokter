import { SopDocument } from '../types';

/**
 * Memeriksa apakah sebuah dokumen SPO berbentuk file PDF:
 * - Dokumen Eksisting / Lama / Warisan yang diunggah berupa scan berkas PDF fisik
 * - Dokumen dengan tipe MIME 'application/pdf'
 * - Dokumen dengan ekstensi nama berkas '.pdf'
 * - Dokumen dengan payload data URL 'data:application/pdf'
 */
export function isPdfSopDocument(sop?: Partial<SopDocument> | null): boolean {
  if (!sop) return false;

  const values = [
    sop.existingSourceFormat,
    sop.fileType,
    (sop as any).signedScanFileType,
    (sop as any).oldFileType,
    sop.fileName,
    (sop as any).signedScanFileName,
    (sop as any).oldFileName,
    (sop as any).storagePath,
    (sop as any).signedScanStoragePath,
    (sop as any).oldStoragePath,
    sop.fileUrl,
    (sop as any).signedScanUrl,
    (sop as any).oldFileUrl,
    sop.fileDataUrl,
    (sop as any).signedScanDataUrl,
    (sop as any).oldFileDataUrl,
  ].map(v => String(v || '').toLowerCase());

  // A document is a PDF only when an actual PDF signal exists. Being Existing
  // by itself is NOT enough: Existing DOCX must continue through LiveForm/A4.
  return values.some(v =>
    v.includes('application/pdf') ||
    v.endsWith('.pdf') ||
    v.includes('.pdf?') ||
    v.includes('_signedscan.pdf') ||
    v.includes('_oldfile.pdf') ||
    v.includes('_file.pdf') ||
    v.startsWith('data:application/pdf')
  );
}

/**
 * Rule TTD + stempel SPO aktif.
 *
 * WAJIB untuk dua alur yang menghasilkan SPO aktif baru:
 *   1) SPO Baru
 *   2) SPO Riviu
 *
 * SPO Existing PDF tidak mendapat overlay TTD/stempel baru. Existing DOCX
 * adalah sumber import LiveForm dan hasil finalnya boleh mendapat TTD/stempel.
 *
 * Jangan menentukan rule ini dari MIME/ekstensi file. Berkas PDF pada SPO
 * Baru/Riviu tetap harus menampilkan TTD + stempel pada naskah final.
 */
export function shouldShowSignatureAndStamp(sop?: Partial<SopDocument> | null): boolean {
  if (!sop) return false;
  const status = String(sop.status || '').trim().toUpperCase();
  if (status !== 'AKTIF') return false;

  const jenis = String(
    sop.jenis_spo ||
    sop.documentType ||
    ''
  ).trim().toUpperCase();

  const isRiviu = jenis === 'RIVIU' || jenis === 'REVIEW' || sop.isReviewDocument === true;
  const isExisting =
    sop.jenis_spo === 'EKSISTING' ||
    sop.documentType === 'EKSISTING' ||
    sop.documentType === 'LAMA' ||
    sop.isLegacySop === true;

  // Existing DOCX is an import source that produces the official generated A4 layout
  // with Director signature and hospital stamp.
  // Raw uploaded legacy PDF without live content keeps the physical scanned signature without overlay.
  if (isExisting && !isRiviu) {
    const isExistingDocx =
      sop.existingSourceFormat === 'DOCX' ||
      String(sop.fileType || '').toLowerCase().includes('wordprocessingml') ||
      String(sop.fileType || '').toLowerCase().includes('msword') ||
      String(sop.fileName || '').toLowerCase().endsWith('.docx') ||
      String(sop.fileName || '').toLowerCase().endsWith('.doc');

    const hasLiveContent = Boolean(
      (sop.prosedur && sop.prosedur.trim().length > 0) ||
      (sop.pengertian && sop.pengertian.trim().length > 0)
    );

    // Only skip if strictly a raw legacy PDF without DOCX or live text content
    if (!isExistingDocx && !hasLiveContent && Boolean(sop.fileUrl || sop.fileDataUrl || sop.storagePath)) {
      return false;
    }
    return true;
  }

  // All active SPO Baru, Riviu, and standard active documents receive official TTD + stamp
  return true;
}
