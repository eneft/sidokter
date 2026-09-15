import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface SopPdfData {
  title?: string;
  sopNumber?: string;
  version?: string;
  effectiveDate?: string;
  approverName?: string;
  direkturNama?: string;
  direkturPangkat?: string;
  direkturNip?: string;
  divisionName?: string;
  hierarchyDescription?: string;
  creatorUnit?: string;
  pengertian?: string;
  tujuan?: string;
  kebijakan?: string;
  prosedur?: string;
  unitTerkait?: string;
  status?: string;
  jenis_spo?: string;
  summary?: string;
}

function stripHtml(html: string = ''): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let currentLine = '';
    for (const word of words) {
      if (!word) continue;
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Single word exceeds width, force break
          lines.push(word);
          currentLine = '';
        }
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  return lines;
}

export async function generateOfficialSopPdfBuffer(sop: SopPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 45;
  const contentWidth = pageWidth - (marginX * 2);

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 45;

  // Header - RSUD Dr. Soegiri
  page.drawText('PEMERINTAH KABUPATEN LAMONGAN', {
    x: marginX,
    y,
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1)
  });
  y -= 14;

  page.drawText('DINAS KESEHATAN - RSUD Dr. SOEGIRI LAMONGAN', {
    x: marginX,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0, 0.2, 0.45)
  });
  y -= 12;

  page.drawText('Jl. Kusuma Bangsa No. 7 Lamongan (62214) | Telp. (0322) 321718', {
    x: marginX,
    y,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4)
  });
  y -= 8;

  // Divider line
  page.drawLine({
    start: { x: marginX, y },
    end: { x: marginX + contentWidth, y },
    thickness: 1.5,
    color: rgb(0, 0.2, 0.45)
  });
  y -= 18;

  // Standar Prosedur Operasional Box
  const boxTop = y;
  const title = String(sop.title || 'STANDAR PROSEDUR OPERASIONAL').toUpperCase();
  const titleLines = wrapText(title, contentWidth - 20, fontBold, 11);
  const boxHeight = Math.max(75, 45 + titleLines.length * 14);

  page.drawRectangle({
    x: marginX,
    y: boxTop - boxHeight,
    width: contentWidth,
    height: boxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.2,
    color: rgb(0.98, 0.99, 1.0)
  });

  let titleY = boxTop - 18;
  page.drawText('STANDAR PROSEDUR OPERASIONAL (SPO)', {
    x: marginX + 10,
    y: titleY,
    size: 10,
    font: fontBold,
    color: rgb(0, 0.2, 0.45)
  });
  titleY -= 14;

  for (const tLine of titleLines) {
    page.drawText(tLine, {
      x: marginX + 10,
      y: titleY,
      size: 11,
      font: fontBold,
      color: rgb(0, 0, 0)
    });
    titleY -= 13;
  }

  y = boxTop - boxHeight - 8;

  // Metadata Table Box
  const metaBoxHeight = 44;
  page.drawRectangle({
    x: marginX,
    y: y - metaBoxHeight,
    width: contentWidth,
    height: metaBoxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: rgb(1, 1, 1)
  });

  const colWidth = contentWidth / 3;
  // Divider 1
  page.drawLine({
    start: { x: marginX + colWidth, y },
    end: { x: marginX + colWidth, y: y - metaBoxHeight },
    thickness: 0.8,
    color: rgb(0, 0, 0)
  });
  // Divider 2
  page.drawLine({
    start: { x: marginX + (colWidth * 2), y },
    end: { x: marginX + (colWidth * 2), y: y - metaBoxHeight },
    thickness: 0.8,
    color: rgb(0, 0, 0)
  });

  // Col 1: No. Dokumen & Revisi
  page.drawText('No. Dokumen:', { x: marginX + 6, y: y - 14, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(String(sop.sopNumber || '-').slice(0, 32), { x: marginX + 6, y: y - 26, size: 8.5, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText('No. Revisi: ' + String(sop.version || '00'), { x: marginX + 6, y: y - 37, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  // Col 2: Tanggal Terbit & Status
  page.drawText('Tanggal Terbit:', { x: marginX + colWidth + 6, y: y - 14, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(String(sop.effectiveDate || '-').slice(0, 20), { x: marginX + colWidth + 6, y: y - 26, size: 8.5, font: fontBold, color: rgb(0, 0, 0) });
  page.drawText('Status: ' + String(sop.status || 'AKTIF'), { x: marginX + colWidth + 6, y: y - 37, size: 8, font: fontBold, color: rgb(0, 0.5, 0.2) });

  // Col 3: Ditetapkan Oleh
  page.drawText('Ditetapkan Oleh:', { x: marginX + (colWidth * 2) + 6, y: y - 14, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  const signer = String(sop.approverName || sop.direkturNama || 'Direktur RSUD Dr. Soegiri').slice(0, 30);
  page.drawText(signer, { x: marginX + (colWidth * 2) + 6, y: y - 26, size: 8.5, font: fontBold, color: rgb(0, 0, 0) });
  const unit = String(sop.creatorUnit || sop.hierarchyDescription || sop.divisionName || 'RSUD Dr. Soegiri Lamongan').slice(0, 30);
  page.drawText(unit, { x: marginX + (colWidth * 2) + 6, y: y - 37, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  y -= (metaBoxHeight + 16);

  // Sections
  const sections: { title: string; content?: string }[] = [
    { title: 'I. PENGERTIAN', content: sop.pengertian || sop.summary },
    { title: 'II. TUJUAN', content: sop.tujuan },
    { title: 'III. KEBIJAKAN', content: sop.kebijakan },
    { title: 'IV. PROSEDUR', content: sop.prosedur },
    { title: 'V. UNIT TERKAIT', content: sop.unitTerkait }
  ];

  const ensureSpace = (neededHeight: number) => {
    if (y - neededHeight < 55) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - 50;
      // Repeat small header on continuation pages
      page.drawText(`SPO: ${String(sop.title || '').slice(0, 50)} (${sop.sopNumber || '-'})`, {
        x: marginX,
        y,
        size: 8,
        font: fontItalic,
        color: rgb(0.5, 0.5, 0.5)
      });
      y -= 10;
      page.drawLine({
        start: { x: marginX, y },
        end: { x: marginX + contentWidth, y },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7)
      });
      y -= 18;
    }
  };

  for (const sec of sections) {
    const rawText = stripHtml(sec.content || '');
    if (!rawText) continue;

    ensureSpace(35);

    // Section title banner
    page.drawRectangle({
      x: marginX,
      y: y - 16,
      width: contentWidth,
      height: 16,
      color: rgb(0.92, 0.94, 0.98)
    });
    page.drawText(sec.title, {
      x: marginX + 6,
      y: y - 12,
      size: 9,
      font: fontBold,
      color: rgb(0, 0.2, 0.45)
    });
    y -= 24;

    const wrappedLines = wrapText(rawText, contentWidth - 12, fontRegular, 9);
    for (const line of wrappedLines) {
      ensureSpace(14);
      if (line.trim()) {
        page.drawText(line, {
          x: marginX + 6,
          y,
          size: 9,
          font: fontRegular,
          color: rgb(0.1, 0.1, 0.1)
        });
      }
      y -= 13;
    }
    y -= 10;
  }

  // Draw footer on all pages
  const totalPages = doc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const p = doc.getPage(i);
    p.drawLine({
      start: { x: marginX, y: 38 },
      end: { x: marginX + contentWidth, y: 38 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8)
    });
    p.drawText(`Halaman ${i + 1} dari ${totalPages}  •  Dokumen Resmi SIDOKTER - RSUD Dr. Soegiri Lamongan`, {
      x: marginX,
      y: 25,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5)
    });
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

export async function generateOfficialLibraryPdfBuffer(docData: {
  title?: string;
  documentNumber?: string;
  type?: string;
  category?: string;
  year?: string | number;
  signer?: string;
  summary?: string;
  effectiveDate?: string;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 45;
  const contentWidth = pageWidth - (marginX * 2);

  const page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 50;

  // Header
  page.drawText('PEMERINTAH KABUPATEN LAMONGAN', { x: marginX, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 14;
  page.drawText('DINAS KESEHATAN - RSUD Dr. SOEGIRI LAMONGAN', { x: marginX, y, size: 11, font: fontBold, color: rgb(0, 0.2, 0.45) });
  y -= 12;
  page.drawText('Jl. Kusuma Bangsa No. 7 Lamongan (62214) | Telp. (0322) 321718', { x: marginX, y, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
  y -= 8;
  page.drawLine({ start: { x: marginX, y }, end: { x: marginX + contentWidth, y }, thickness: 1.5, color: rgb(0, 0.2, 0.45) });
  y -= 25;

  const docTypeLabel = String(docData.type || 'DOKUMEN REGULASI').toUpperCase();
  page.drawText(`ARSIP DOKUMEN RESMI - ${docTypeLabel}`, { x: marginX, y, size: 11, font: fontBold, color: rgb(0, 0.2, 0.45) });
  y -= 18;

  const titleLines = wrapText(String(docData.title || '-').toUpperCase(), contentWidth - 20, fontBold, 12);
  for (const tl of titleLines) {
    page.drawText(tl, { x: marginX, y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
    y -= 15;
  }
  y -= 10;

  // Metadata Box
  page.drawRectangle({
    x: marginX,
    y: y - 70,
    width: contentWidth,
    height: 70,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: rgb(0.98, 0.99, 1.0)
  });

  page.drawText(`Nomor Dokumen : ${docData.documentNumber || '-'}`, { x: marginX + 10, y: y - 18, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Kategori / Tahun : ${docData.category || '-'} / ${docData.year || '-'}`, { x: marginX + 10, y: y - 34, size: 9, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`Penandatangan : ${docData.signer || 'Direktur RSUD Dr. Soegiri'}`, { x: marginX + 10, y: y - 50, size: 9, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`Tanggal Berlaku : ${docData.effectiveDate || '-'}`, { x: marginX + 10, y: y - 64, size: 8.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  y -= 90;

  if (docData.summary) {
    page.drawText('RINGKASAN / KETERANGAN:', { x: marginX, y, size: 9.5, font: fontBold, color: rgb(0, 0.2, 0.45) });
    y -= 15;
    const sumLines = wrapText(stripHtml(docData.summary), contentWidth, fontRegular, 9);
    for (const sl of sumLines) {
      if (y < 60) break;
      page.drawText(sl, { x: marginX, y, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
      y -= 13;
    }
  }

  // Footer
  page.drawLine({ start: { x: marginX, y: 38 }, end: { x: marginX + contentWidth, y: 38 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  page.drawText('Dokumen Resmi SIDOKTER - RSUD Dr. Soegiri Lamongan', { x: marginX, y: 25, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

