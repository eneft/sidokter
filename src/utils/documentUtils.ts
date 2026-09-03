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
 * Memeriksa apakah tanda tangan & stempel Direktur berhak ditampilkan:
 * Sesuai aturan tata kelola naskah dinas RSUD Dr. Soegiri:
 * "Hanya dokumen yg telah aktif saja yg ada ttd dan stamp, kecuali file berbentuk pdf. tidak perlu ada ttd stamp"
 * 
 * Kriteria:
 * 1. Dokumen WAJIB berstatus 'AKTIF'
 * 2. Dokumen BUKAN berbentuk file PDF
 */
export function shouldShowSignatureAndStamp(sop?: Partial<SopDocument> | null): boolean {
  if (!sop) return false;
  const isAktif = sop.status === 'AKTIF';
  const isPdf = isPdfSopDocument(sop);
  return isAktif && !isPdf;
}
