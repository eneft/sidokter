import { SupportingEvidence } from '../types';

export function isValidRevision(value: string | undefined): boolean {
  return /^\d+$/.test(String(value ?? '').trim());
}

export function validateSupportingEvidence(items: SupportingEvidence[] | undefined): SupportingEvidence[] {
  const evidence = Array.isArray(items) ? items : [];
  evidence.forEach((item, index) => {
    if (!item.id || !item.originalName || !item.mimeType || !Number.isFinite(item.size) || item.size < 0) {
      throw new Error(`Metadata Bukti Dukung Riviu #${index + 1} tidak lengkap.`);
    }
    if (!item.dataUrl && !(item.fileUrl && item.storagePath)) {
      throw new Error(`Bukti Dukung Riviu #${index + 1} belum berhasil tersimpan.`);
    }
  });
  return evidence;
}

/** Read-time compatibility for explicitly named historical evidence arrays/objects.
 * oldFile is deliberately excluded because it represents the source SPO. */
export function normalizeSupportingEvidence(record: Record<string, any>): SupportingEvidence[] {
  if (Array.isArray(record.supportingEvidence)) return record.supportingEvidence.filter(Boolean);
  const legacy = record.reviewEvidence || record.supportingEvidenceFile;
  return legacy && (legacy.fileUrl || legacy.storagePath || legacy.dataUrl)
    ? [{
        id: legacy.id || 'legacy-evidence-1',
        category: legacy.category || 'LAINNYA',
        description: legacy.description,
        originalName: legacy.originalName || legacy.fileName || 'Bukti_Dukung_Riviu',
        mimeType: legacy.mimeType || legacy.fileType || 'application/octet-stream',
        size: Number(legacy.size || legacy.fileSize || 0),
        fileUrl: legacy.fileUrl,
        storagePath: legacy.storagePath,
        dataUrl: legacy.dataUrl,
      }]
    : [];
}
