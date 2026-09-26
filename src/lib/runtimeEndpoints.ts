const DEFAULT_REGION = 'asia-southeast2';

export function isCapacitorNativeRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const protocol = String(window.location?.protocol || '').toLowerCase();
  if (protocol === 'capacitor:' || protocol === 'ionic:') return true;
  try {
    return Boolean((window as any).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function buildCloudFunctionUrl(
  functionName: string,
  projectId = 'sidokter-soegiri',
  path = '',
  region = DEFAULT_REGION
): string {
  const cleanPath = String(path || '').trim();
  const suffix = cleanPath ? `/${cleanPath.replace(/^\/+/, '')}` : '';
  return `https://${region}-${projectId}.cloudfunctions.net/${functionName}${suffix}`;
}

export function storageApiUrl(path = '', projectId = 'sidokter-soegiri'): string {
  const cleanPath = String(path || '').trim();
  const suffix = cleanPath ? `/${cleanPath.replace(/^\/+/, '')}` : '';
  if (isCapacitorNativeRuntime()) return buildCloudFunctionUrl('storageApi', projectId, suffix);
  return `/api/storage${suffix}`;
}

export function normalizeStorageApiUrl(url: string | null | undefined, projectId = 'sidokter-soegiri'): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  const direct = trimmed.match(/^https?:\/\/[^/]*cloudfunctions\.net\/storageApi(\/.*)?$/i);
  if (direct) {
    const suffix = direct[1] || '';
    return isCapacitorNativeRuntime() ? trimmed : `/api/storage${suffix}`;
  }
  if (trimmed.startsWith('/api/storage')) {
    const suffix = trimmed.slice('/api/storage'.length);
    return isCapacitorNativeRuntime() ? buildCloudFunctionUrl('storageApi', projectId, suffix) : trimmed;
  }
  return trimmed;
}

export function isProtectedStorageApiUrl(url: string | null | undefined): boolean {
  const value = String(url || '').trim();
  return /^\/api\/storage\/(?:files|path|sop)(?:\/|$)/i.test(value) ||
    /^https?:\/\/[^/]*cloudfunctions\.net\/storageApi\/(?:files|path|sop)(?:\/|$)/i.test(value);
}

export function publicWebBaseUrl(): string {
  const envUrl = String((import.meta as any).env?.VITE_PUBLIC_WEB_ORIGIN || '').trim().replace(/\/$/, '');
  if (envUrl) return envUrl;
  if (!isCapacitorNativeRuntime() && typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
    return window.location.origin;
  }
  return 'https://sidokter.vercel.app';
}
