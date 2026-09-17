import type { SopDocument } from '../types';

export type ExistingPdfStorageSlot = 'signedScan' | 'file' | 'oldFile';

export interface ExistingPdfSource {
  url?: string;
  storagePath?: string;
  slot: ExistingPdfStorageSlot;
}

/**
 * Keep each URL paired with the Storage path that describes the same binary.
 * Mixing fields from different legacy slots can make the protected resolver
 * probe a valid URL with an unrelated fallback path.
 */
export function getExistingPdfSources(sop: SopDocument): ExistingPdfSource[] {
  const record = sop as SopDocument & Record<string, unknown>;
  return [
    {
      url: record.signedScanUrl as string | undefined,
      storagePath: record.signedScanStoragePath as string | undefined,
      slot: 'signedScan' as const
    },
    {
      url: record.fileUrl as string | undefined,
      storagePath: record.storagePath as string | undefined,
      slot: 'file' as const
    },
    {
      url: record.oldFileUrl as string | undefined,
      storagePath: record.oldStoragePath as string | undefined,
      slot: 'oldFile' as const
    }
  ].filter((source) => Boolean(source.url || source.storagePath));
}
