/**
 * FIREBASE CLOUD STORAGE SERVICE - SIDOKTER SOEGIRI
 * File biner SPO authoritative disimpan di Firebase Cloud Storage.
 * Browser cache hanya optimasi/fallback legacy dan bukan sumber kebenaran.
 */
import { getNamedFileFromLocalCache } from '../utils/fileStorage';
import { getPersistedClientSession, getCurrentAuthToken } from './authService';

export interface UploadResult {
  success: boolean;
  fileId: string;
  url: string;
  fileName: string;
  fileSize: number;
  storagePath?: string;
}

/**
 * Uploads a file (File object, Blob, or base64 DataURL) to the cloud storage endpoint.
 * Returns the authenticated download/view URL (e.g. /api/storage/files/:fileId).
 */
export async function uploadFileToCloudStorage(
  fileOrData: File | Blob | string,
  fileName: string,
  customId?: string
): Promise<UploadResult> {
  let fileDataUrl: string;
  let fileType = 'application/pdf';

  if (typeof fileOrData === 'string') {
    fileDataUrl = fileOrData;
    const match = fileOrData.match(/data:([^;]+);/);
    if (match && match[1]) fileType = match[1];
  } else {
    fileType = fileOrData.type || 'application/pdf';
    fileDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Gagal membaca file untuk diunggah.'));
      reader.readAsDataURL(fileOrData);
    });
  }

  const session = getPersistedClientSession();
  const bearer = await getCurrentAuthToken();
  if (!session?.sessionId || !bearer) throw new Error('Sesi login Firebase tidak valid. Silakan login kembali.');
  const response = await fetch('/api/storage/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': session.sessionId,
      'Authorization': `Bearer ${bearer}`,
    },
    body: JSON.stringify({
      fileData: fileDataUrl,
      fileName,
      fileType,
      id: customId
    })
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.message || `Gagal mengunggah file ke cloud storage (HTTP ${response.status})`);
  }

  const result: UploadResult = await response.json();

  return result;
}

/**
 * Ensures a file reference is accessible over the network.
 * If given a data URL, automatically uploads it to cloud storage and returns the permanent cloud URL.
 * If already a remote URL, returns it directly.
 */
export async function ensureCloudFileUrl(
  input: string | undefined | null,
  fileName: string,
  customId?: string
): Promise<string | null> {
  if (!input) return null;

  // Already a permanent URL
  if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('/api/storage/')) {
    return input;
  }

  // If it's a data URL, upload to cloud storage
  if (input.startsWith('data:')) {
    try {
      const uploaded = await uploadFileToCloudStorage(input, fileName, customId);
      return uploaded.url;
    } catch (err) {
      console.warn('[cloudStorage] Auto-upload to cloud storage failed:', err);
      return null;
    }
  }

  return input;
}

/**
 * Resolves a document URL to a viewable URL.
 * A durable Firebase Storage reference is authoritative. Local IndexedDB/cache
 * is used only for legacy/offline fallback when no durable reference exists.
 */
export async function resolveViewableUrl(
  rawUrlOrPath: string | undefined | null,
  cacheKey?: string
): Promise<string | null> {
  if (!rawUrlOrPath) return null;

  // 1. Local data/blob references are already self-contained.
  if (rawUrlOrPath.startsWith('data:') || rawUrlOrPath.startsWith('blob:')) {
    return rawUrlOrPath;
  }

  // 2. A durable remote reference is authoritative. Never let a browser-local
  // cache shadow a valid cloud reference; otherwise PC-A can appear healthy
  // while PC-B reports a missing document.
  if (rawUrlOrPath.startsWith('http://') || rawUrlOrPath.startsWith('https://') || rawUrlOrPath.startsWith('/api/storage/')) {
    return rawUrlOrPath;
  }

  // 3. Only use local cache as a legacy/offline fallback.
  if (cacheKey) {
    const cached = await getNamedFileFromLocalCache(cacheKey);
    if (cached) return cached;
  }

  // 3. If it's a legacy local reference (e.g. local://id)
  if (rawUrlOrPath.startsWith('local://')) {
    const id = rawUrlOrPath.replace('local://', '');
    const cached = await getNamedFileFromLocalCache(`library_${id}`) ||
                   await getNamedFileFromLocalCache(`cloud_${id}`);
    if (cached) return cached;

    return null;
  }

  // 4. Remote / Cloud URL
  return rawUrlOrPath;
}
