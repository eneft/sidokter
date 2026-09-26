/**
 * FIREBASE CLOUD STORAGE SERVICE - SIDOKTER SOEGIRI
 * File biner SPO authoritative disimpan di Firebase Cloud Storage.
 * Browser cache hanya optimasi/fallback legacy dan bukan sumber kebenaran.
 */
import { getNamedFileFromLocalCache, normalizeStorageUrl } from '../utils/fileStorage';
import { getPersistedClientSession, getCurrentAuthToken, refreshUserSessionProfile } from './authService';
import { firebaseConfig } from './firebase';

export interface UploadResult {
  success: boolean;
  fileId: string;
  url: string;
  fileName: string;
  fileSize: number;
  storagePath?: string;
}

export type StorageResourceType = 'SPO' | 'SK' | 'MOU' | 'REGULASI' | 'OTHER';

/**
 * Uploads a file (File object, Blob, or base64 DataURL) to the cloud storage endpoint.
 * Returns the authenticated download/view URL (e.g. /api/storage/files/:fileId).
 */
export async function uploadFileToCloudStorage(
  fileOrData: File | Blob | string,
  fileName: string,
  customId?: string,
  resourceType: StorageResourceType = 'SPO'
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
  if (!session?.sessionId) {
    throw new Error('Sesi login tidak valid atau telah berakhir. Silakan login kembali.');
  }

  let bearer = await getCurrentAuthToken();
  if (!bearer) {
    try {
      await refreshUserSessionProfile(session);
      bearer = await getCurrentAuthToken();
    } catch {
      // Sesi SIDOKTER tetap valid melalui X-Session-Id & X-Soegiri-Auth-Uid
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Session-Id': session.sessionId,
  };
  if (session.authUid) {
    headers['X-Soegiri-Auth-Uid'] = session.authUid;
  }
  if (session.username) {
    headers['X-User-Username'] = session.username;
  }
  if (bearer) {
    headers['Authorization'] = `Bearer ${bearer}`;
  }

  const projectId = firebaseConfig.projectId || 'sidokter-soegiri';
  const DIRECT_STORAGE_UPLOAD_URL = `https://asia-southeast2-${projectId}.cloudfunctions.net/storageApi/upload`;

  const sendUpload = (url: string, customHeaders = headers) => fetch(url, {
    method: 'POST',
    headers: customHeaders,
    body: JSON.stringify({
      fileData: fileDataUrl,
      fileName,
      fileType,
      id: customId,
      resourceType
    })
  });

  let response: Response;
  try {
    response = await sendUpload('/api/storage/upload');
  } catch (netErr) {
    console.warn('[cloudStorageService] Network error calling /api/storage/upload, trying direct Cloud Function:', netErr);
    try {
      response = await sendUpload(DIRECT_STORAGE_UPLOAD_URL);
    } catch {
      throw new Error('Gagal terhubung ke layanan penyimpanan dokumen.');
    }
  }

  // If /api/storage/upload returned 404 or 405 (e.g. Firebase Hosting rewrite unconfigured), failover to direct Cloud Function
  if (response.status === 404 || response.status === 405) {
    console.warn(`[cloudStorageService] /api/storage/upload returned HTTP ${response.status}. Failing over to ${DIRECT_STORAGE_UPLOAD_URL}...`);
    try {
      const failoverRes = await sendUpload(DIRECT_STORAGE_UPLOAD_URL);
      if (failoverRes.ok || failoverRes.status < response.status) {
        response = failoverRes;
      }
    } catch (e) {
      console.warn('[cloudStorageService] Failover to direct storageApi error:', e);
    }
  }

  // If upload failed and Authorization header was sent, retry without it using SIDOKTER session headers
  if (!response.ok && headers['Authorization']) {
    console.warn('[cloudStorageService] Upload failed with Authorization header; retrying with session headers only...');
    const retryHeaders = { ...headers };
    delete retryHeaders['Authorization'];
    try {
      const retryUrl = response.url && response.url.includes('cloudfunctions.net') ? DIRECT_STORAGE_UPLOAD_URL : '/api/storage/upload';
      const retryRes = await sendUpload(retryUrl, retryHeaders);
      if (retryRes.ok) {
        response = retryRes;
      }
    } catch {}
  }

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      throw new Error(errJson.message || 'Sesi login tidak valid atau telah berakhir. Silakan login kembali.');
    }
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
export function buildStoragePathUrl(storagePath: string): string {
  const cleanPath = String(storagePath || '').replace(/^\/+/, '');
  return `/api/storage/path/${encodeURIComponent(cleanPath)}`;
}

export async function resolveViewableUrl(
  rawUrlOrPath: string | undefined | null,
  cacheKey?: string
): Promise<string | null> {
  if (!rawUrlOrPath) return null;

  const normalized = normalizeStorageUrl(rawUrlOrPath);

  // 1. A durable Firebase/API reference is authoritative. Never let a
  // browser-local cache shadow it.
  if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('/api/storage/')) {
    return normalized;
  }

  // 2. Data/blob URLs are only acceptable as an explicit upload/legacy payload.
  if (normalized.startsWith('data:') || normalized.startsWith('blob:')) {
    return normalized;
  }

  // 3. Legacy local references may use the local cache, but only when the
  // caller explicitly passes local://. A missing cloud reference must not
  // silently become a PC-specific file.
  if (normalized.startsWith('local://')) {
    const id = normalized.replace('local://', '');
    const cached = await getNamedFileFromLocalCache(`library_${id}`) ||
                   await getNamedFileFromLocalCache(`cloud_${id}`);
    return cached || null;
  }

  // 4. If no authoritative cloud reference exists, an optional cache key is
  // allowed only for explicitly offline/legacy callers.
  if (cacheKey && typeof navigator !== 'undefined' && navigator.onLine === false) {
    const cached = await getNamedFileFromLocalCache(cacheKey);
    if (cached) return cached;
  }

  return normalized;
}
