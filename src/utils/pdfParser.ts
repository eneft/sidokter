/**
 * Utility untuk ekstraksi metadata otomatis dari berkas PDF SPO Eksisting.
 * Mengekstrak nomor dokumen, judul, tanggal, dan metadata dari nama berkas dan stream PDF.
 */

export interface ParsedSopPdf {
  sopNumber?: string;
  title?: string;
  effectiveDate?: string;
  revisionNumber?: string;
  detectedFields: string[];
  fileName: string;
  fileSize: number;
}

/**
 * Membersihkan dan memformat judul hasil deteksi.
 */
function cleanTitle(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\.pdf$/i, '')
    .replace(/^SPO[\s_\-]+/i, '')
    .replace(/^STANDAR\s+PROSEDUR\s+OPERASIONAL[\s_\-]+/i, '')
    .replace(/[\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mencoba mendeteksi nomor SPO dari teks/nama file berdasarkan pola umum RS.
 */
function extractSopNumber(text: string): string | null {
  if (!text) return null;

  // Pola 1: Format Standar Soegiri 4 segmen: PEL / 1.1.3 / 001 / 2024 atau PEL-1.1.3-001-2024
  const p1 = text.match(/\b([A-Z]{2,6}\s*[\/\-_.]\s*[0-9A-Z.]+\s*[\/\-_.]\s*\d{2,4}\s*[\/\-_.]\s*\d{4})\b/i);
  if (p1 && p1[1]) {
    return p1[1].replace(/[\-_.]/g, '/').replace(/\s*\/\s*/g, ' / ').trim();
  }

  // Pola 2: Format Standar Soegiri 3 segmen: PEL / 001 / 2024
  const p2 = text.match(/\b([A-Z]{2,6}\s*[\/\-_.]\s*\d{2,4}\s*[\/\-_.]\s*\d{4})\b/i);
  if (p2 && p2[1]) {
    return p2[1].replace(/[\-_.]/g, '/').replace(/\s*\/\s*/g, ' / ').trim();
  }

  // Pola 3: Format Dinkes / Pemkab: 440/102/SPO/PEL/2023 atau 440-102-SPO-2023
  const p3 = text.match(/\b(\d{2,4}\s*[\/\-_.]\s*\d{1,4}\s*[\/\-_.]\s*[A-Z0-9\/\-_.]+\s*[\/\-_.]\s*\d{4})\b/i);
  if (p3 && p3[1]) {
    return p3[1].replace(/[\-_.]/g, '/').replace(/\s*\/\s*/g, '/').trim();
  }

  // Pola 4: SOEGIRI / 012 / 2023
  const p4 = text.match(/\b(SOEGIRI\s*[\/\-_.]\s*\d{1,4}\s*[\/\-_.]\s*\d{4})\b/i);
  if (p4 && p4[1]) {
    return p4[1].replace(/[\-_.]/g, '/').replace(/\s*\/\s*/g, ' / ').trim();
  }

  // Pola 5: Nomor dengan kata kunci SPO: SPO-001-2023 atau SPO/PEL/001/2023
  const p5 = text.match(/\b(SPO\s*[\/\-_.]\s*[A-Z0-9\/\-_.]+\s*[\/\-_.]\s*\d{4})\b/i);
  if (p5 && p5[1]) {
    return p5[1].replace(/[\-_.]/g, '/').replace(/\s*\/\s*/g, '/').trim();
  }

  return null;
}

/**
 * Mencoba mengekstrak tanggal dari teks atau nama file (format YYYY-MM-DD atau tahun).
 */
function extractDate(text: string): string | null {
  if (!text) return null;

  // YYYY-MM-DD
  const isoMatch = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) return isoMatch[0];

  // DD-MM-YYYY
  const idMatch = text.match(/\b(0[1-9]|[12]\d|3[01])[\/\-](0[1-9]|1[0-2])[\/\-](20\d{2})\b/);
  if (idMatch) return `${idMatch[3]}-${idMatch[2]}-${idMatch[1]}`;

  // Hanya tahun 20xx
  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (yearMatch) return `${yearMatch[1]}-01-02`;

  return null;
}

/**
 * Membaca berkas PDF dan mendeteksi metadata SPO Eksisting secara otomatis.
 */
export async function parseSopMetadataFromPdf(file: File): Promise<ParsedSopPdf> {
  const result: ParsedSopPdf = {
    fileName: file.name,
    fileSize: file.size,
    detectedFields: []
  };

  const nameWithoutExt = file.name.replace(/\.pdf$/i, '');

  // 1. Ekstraksi dari nama berkas
  const numFromName = extractSopNumber(nameWithoutExt);
  if (numFromName) {
    result.sopNumber = numFromName;
    result.detectedFields.push('Nomor SPO');
  }

  const dateFromName = extractDate(nameWithoutExt);
  if (dateFromName) {
    result.effectiveDate = dateFromName;
    result.detectedFields.push('Tanggal');
  }

  // Coba judul dari nama berkas (dengan menghapus nomor yang terdeteksi)
  let titleCandidate = nameWithoutExt;
  if (result.sopNumber) {
    // Hapus nomor terdeteksi dari nama berkas untuk mendapatkan sisa judul
    const strippedNum = result.sopNumber.replace(/\s*\/\s*/g, '[\\s/\\-_.]+');
    try {
      titleCandidate = titleCandidate.replace(new RegExp(strippedNum, 'i'), '');
    } catch {
      // Abaikan jika regex spesial karakter gagal
    }
  }

  const cleanedTitle = cleanTitle(titleCandidate);
  if (cleanedTitle && cleanedTitle.length >= 4) {
    result.title = cleanedTitle;
    result.detectedFields.push('Judul');
  }

  // 2. Baca sebagian buffer PDF (64KB pertama) untuk mencari metadata bawaan
  try {
    const slice = file.slice(0, 65536);
    const arrayBuffer = await slice.arrayBuffer();
    const textDecoder = new TextDecoder('latin1');
    const pdfText = textDecoder.decode(arrayBuffer);

    // Cek /Title (...), /Title <...>
    if (!result.title) {
      const pdfTitleMatch = pdfText.match(/\/Title\s*\(([^)]+)\)/i);
      if (pdfTitleMatch && pdfTitleMatch[1]) {
        const titleFromPdf = cleanTitle(pdfTitleMatch[1]);
        if (titleFromPdf && titleFromPdf.length >= 4 && !titleFromPdf.toLowerCase().includes('untitled')) {
          result.title = titleFromPdf;
          if (!result.detectedFields.includes('Judul')) {
            result.detectedFields.push('Judul (PDF Metadata)');
          }
        }
      }
    }

    // Cek nomor dokumen di dalam teks PDF jika belum didapat dari nama file
    if (!result.sopNumber) {
      const insideNumMatch = extractSopNumber(pdfText);
      if (insideNumMatch) {
        result.sopNumber = insideNumMatch;
        if (!result.detectedFields.includes('Nomor SPO')) {
          result.detectedFields.push('Nomor SPO (Isi PDF)');
        }
      }
    }

    // Cek CreationDate / ModDate: (D:YYYYMMDD...)
    if (!result.effectiveDate) {
      const dateMatch = pdfText.match(/\/CreationDate\s*\(D:(\d{4})(\d{2})(\d{2})/i);
      if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
        result.effectiveDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        if (!result.detectedFields.includes('Tanggal')) {
          result.detectedFields.push('Tanggal (PDF)');
        }
      }
    }
  } catch (err) {
    console.warn('PDF buffer metadata scan warning:', err);
  }

  result.revisionNumber = '00';

  return result;
}
