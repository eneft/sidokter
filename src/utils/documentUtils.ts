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

  // 1. Dokumen eksisting / legacy (merupakan hasil pindaian scan PDF fisik)
  if (
    sop.isLegacySop === true ||
    sop.jenis_spo === 'EKSISTING' ||
    sop.documentType === 'LAMA' ||
    sop.documentType === 'EKSISTING' ||
    sop.isExistingReplacement === true
  ) {
    return true;
  }

  // 2. Cek MIME type berkas
  const fileType = String(
    sop.fileType ||
    (sop as any).oldFileType ||
    (sop as any).signedScanFileType ||
    ''
  ).toLowerCase();
  if (fileType.includes('pdf')) {
    return true;
  }

  // 3. Cek ekstensi nama berkas
  const fileName = String(
    sop.fileName ||
    (sop as any).oldFileName ||
    (sop as any).signedScanFileName ||
    ''
  ).toLowerCase().trim();
  if (fileName.endsWith('.pdf')) {
    return true;
  }

  // 4. Cek payload data URL
  const fileDataUrl = String(
    sop.fileDataUrl ||
    (sop as any).oldFileDataUrl ||
    (sop as any).signedScanDataUrl ||
    ''
  );
  if (fileDataUrl.startsWith('data:application/pdf')) {
    return true;
  }

  return false;
}

/**
 * Rule TTD + stempel SPO aktif.
 *
 * WAJIB untuk dua alur yang menghasilkan SPO aktif baru:
 *   1) SPO Baru
 *   2) SPO Riviu
 *
 * SPO Existing tidak mendapat overlay TTD/stempel baru karena dokumen
 * existing harus mempertahankan naskah fisik/scan resminya.
 *
 * Jangan menentukan rule ini dari MIME/ekstensi file. Berkas PDF pada SPO
 * Baru/Riviu tetap harus menampilkan TTD + stempel pada naskah final.
 */
export function shouldShowSignatureAndStamp(sop?: Partial<SopDocument> | null): boolean {
  if (!sop || sop.status !== 'AKTIF') return false;

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

  if (isExisting && !isRiviu) return false;

  return jenis === 'BARU' || isRiviu;
}
