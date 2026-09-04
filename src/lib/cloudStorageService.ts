/**
 * CLOUD STORAGE SERVICE - SIDOKTER SOEGIRI
 * Mengelola upload dan unduh file biner fisik (PDF, gambar, hasil scan)
 * ke penyimpanan cloud server agar file dapat diakses permanen dari semua perangkat.
 */
import { saveNamedFileToLocalCache, getNamedFileFromLocalCache } from '../utils/fileStorage';
import { authenticatedFetch } from './authService';

export interface UploadResult {
  success: boolean;
  fileId: string;
  url: string;
  fileName: string;
  fileSize: number;
}

/**
 * Uploads a file (File object, Blob, or base64 DataURL) to the cloud storage endpoint.
 * Returns the permanent public download/view URL (e.g. /api/storage/files/:fileId).
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

  const response = await authenticatedFetch('/api/storage/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  // Cache locally as well for instant zero-latency preview
  if (result.fileId && fileDataUrl) {
    void saveNamedFileToLocalCache(`cloud_${result.fileId}`, fileDataUrl);
    if (customId) void saveNamedFileToLocalCache(`library_${customId}`, fileDataUrl);
  }

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
      return input;
    }
  }

  return input;
}

/**
 * Resolves a document URL to a viewable URL.
 * Checks local IndexedDB/cache first for fast loading;
 * If not in local cache, uses the cloud URL and caches it locally in the background.
 */
export async function resolveViewableUrl(
  rawUrlOrPath: string | undefined | null,
  cacheKey?: string
): Promise<string | null> {
  if (!rawUrlOrPath) return null;

  // 1. If we have a local cache key, check local cache first
  if (cacheKey) {
    const cached = await getNamedFileFromLocalCache(cacheKey);
    if (cached) return cached;
  }

  // 2. If it's a data URL or blob URL, return it directly
  if (rawUrlOrPath.startsWith('data:') || rawUrlOrPath.startsWith('blob:')) {
    return rawUrlOrPath;
  }

  // 3. If it's a legacy local reference (e.g. local://id)
  if (rawUrlOrPath.startsWith('local://')) {
    const id = rawUrlOrPath.replace('local://', '');
    const cached = await getNamedFileFromLocalCache(`library_${id}`) ||
                   await getNamedFileFromLocalCache(`cloud_${id}`);
    if (cached) return cached;

    // Check if available on server storage
    const serverUrl = `/api/storage/files/${id}`;
    try {
      const headCheck = await authenticatedFetch(serverUrl, { method: 'HEAD' });
      if (headCheck.ok) return serverUrl;
    } catch {}

    return null;
  }

  // 4. Remote / Cloud URL
  return rawUrlOrPath;
}
