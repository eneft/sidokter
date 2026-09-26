from pathlib import Path


def must_replace(text: str, old: str, new: str, label: str, count: int = 1) -> str:
    found = text.count(old)
    if found < count:
        raise SystemExit(f'{label}: expected at least {count} match(es), found {found}')
    return text.replace(old, new, count)


Path('src/lib/runtimeEndpoints.ts').write_text("""const DEFAULT_REGION = 'asia-southeast2';

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
  const suffix = cleanPath ? `/${cleanPath.replace(/^\\/+/, '')}` : '';
  return `https://${region}-${projectId}.cloudfunctions.net/${functionName}${suffix}`;
}

export function storageApiUrl(path = '', projectId = 'sidokter-soegiri'): string {
  const cleanPath = String(path || '').trim();
  const suffix = cleanPath ? `/${cleanPath.replace(/^\\/+/, '')}` : '';
  if (isCapacitorNativeRuntime()) return buildCloudFunctionUrl('storageApi', projectId, suffix);
  return `/api/storage${suffix}`;
}

export function normalizeStorageApiUrl(url: string | null | undefined, projectId = 'sidokter-soegiri'): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  const direct = trimmed.match(/^https?:\\/\\/[^/]*cloudfunctions\\.net\\/storageApi(\\/.*)?$/i);
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
  return /^\\/api\\/storage\\/(?:files|path|sop)(?:\\/|$)/i.test(value) ||
    /^https?:\\/\\/[^/]*cloudfunctions\\.net\\/storageApi\\/(?:files|path|sop)(?:\\/|$)/i.test(value);
}

export function publicWebBaseUrl(): string {
  const envUrl = String((import.meta as any).env?.VITE_PUBLIC_WEB_ORIGIN || '').trim().replace(/\\/$/, '');
  if (envUrl) return envUrl;
  if (!isCapacitorNativeRuntime() && typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
    return window.location.origin;
  }
  return 'https://sidokter.vercel.app';
}
""")

# authService
p = Path('src/lib/authService.ts')
s = p.read_text()
s = must_replace(s, "import { signInWithCustomToken, signOut } from 'firebase/auth';", "import { signInWithCustomToken, signOut } from 'firebase/auth';\nimport { isCapacitorNativeRuntime } from './runtimeEndpoints';", 'auth import')
s = must_replace(s, "const PRIMARY_AUTH_API_URL = (rawAuthEnvUrl.startsWith('http://') || rawAuthEnvUrl.startsWith('https://'))\n  ? rawAuthEnvUrl.replace(/\\/$/, '')\n  : isClientDirect\n    ? DIRECT_CLOUD_AUTH_URL\n    : (rawAuthEnvUrl || '/api/auth');", "const nativeClient = isCapacitorNativeRuntime();\nconst PRIMARY_AUTH_API_URL = (rawAuthEnvUrl.startsWith('http://') || rawAuthEnvUrl.startsWith('https://'))\n  ? rawAuthEnvUrl.replace(/\\/$/, '')\n  : (isClientDirect || nativeClient)\n    ? DIRECT_CLOUD_AUTH_URL\n    : (rawAuthEnvUrl || '/api/auth');", 'auth primary')
s = must_replace(s, "  const timer = window.setInterval(check, 60000);\n  return () => {\n    stopped = true;\n    window.clearInterval(timer);\n  };", "  const onVisibilityChange = () => {\n    if (!stopped && typeof document !== 'undefined' && document.visibilityState === 'visible') void check();\n  };\n  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);\n\n  const timer = window.setInterval(check, 60000);\n  return () => {\n    stopped = true;\n    window.clearInterval(timer);\n    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);\n  };", 'session foreground')
p.write_text(s)

# hierarchyService
p = Path('src/lib/hierarchyService.ts')
s = p.read_text()
s = must_replace(s, "import { auth, authPersistenceReady, db, firebaseConfig } from './firebase';", "import { auth, authPersistenceReady, db, firebaseConfig } from './firebase';\nimport { isCapacitorNativeRuntime } from './runtimeEndpoints';", 'hierarchy import')
s = must_replace(s, "    first = await requestOne('/api/hierarchy');", "    first = await requestOne(isCapacitorNativeRuntime() ? DIRECT_CLOUD_HIERARCHY_URL : '/api/hierarchy');", 'hierarchy primary')
p.write_text(s)

# cloudStorageService
p = Path('src/lib/cloudStorageService.ts')
s = p.read_text()
s = must_replace(s, "import { firebaseConfig } from './firebase';", "import { firebaseConfig } from './firebase';\nimport { normalizeStorageApiUrl, storageApiUrl } from './runtimeEndpoints';", 'cloud storage import')
s = must_replace(s, "  const DIRECT_STORAGE_UPLOAD_URL = `https://asia-southeast2-${projectId}.cloudfunctions.net/storageApi/upload`;", "  const DIRECT_STORAGE_UPLOAD_URL = `https://asia-southeast2-${projectId}.cloudfunctions.net/storageApi/upload`;\n  const PRIMARY_STORAGE_UPLOAD_URL = storageApiUrl('/upload', projectId);", 'storage primary const')
s = must_replace(s, "    response = await sendUpload('/api/storage/upload');", "    response = await sendUpload(PRIMARY_STORAGE_UPLOAD_URL);", 'storage upload route')
s = must_replace(s, "      const retryUrl = response.url && response.url.includes('cloudfunctions.net') ? DIRECT_STORAGE_UPLOAD_URL : '/api/storage/upload';", "      const retryUrl = response.url && response.url.includes('cloudfunctions.net') ? DIRECT_STORAGE_UPLOAD_URL : PRIMARY_STORAGE_UPLOAD_URL;", 'storage retry')
s = must_replace(s, "  const result: UploadResult = await response.json();\n\n  return result;", "  const result: UploadResult = await response.json();\n  return { ...result, url: normalizeStorageApiUrl(result.url, projectId) };", 'storage returned url')
s = must_replace(s, "  if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('/api/storage/')) {\n    return input;\n  }", "  if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('/api/storage/')) {\n    return normalizeStorageApiUrl(input, firebaseConfig.projectId || 'sidokter-soegiri');\n  }", 'ensure cloud url')
s = must_replace(s, "  return `/api/storage/path/${encodeURIComponent(cleanPath)}`;", "  return storageApiUrl(`/path/${encodeURIComponent(cleanPath)}`, firebaseConfig.projectId || 'sidokter-soegiri');", 'cloud storage path')
p.write_text(s)

# fileStorage
p = Path('src/utils/fileStorage.ts')
s = p.read_text()
s = must_replace(s, "import { firebaseConfig } from '../lib/firebase';", "import { firebaseConfig } from '../lib/firebase';\nimport { isProtectedStorageApiUrl, normalizeStorageApiUrl, storageApiUrl } from '../lib/runtimeEndpoints';", 'file storage import')
s = must_replace(s, "  return `/api/storage/path/${encodeURIComponent(cleanPath)}`;", "  return storageApiUrl(`/path/${encodeURIComponent(cleanPath)}`, firebaseConfig.projectId || 'sidokter-soegiri');", 'file storage path')
s = must_replace(s, "  const cfMatch = trimmed.match(/^https?:\\/\\/[^/]*cloudfunctions\\.net\\/storageApi\\/(files|path|sop)\\/(.*)$/i);\n  if (cfMatch) {\n    return `/api/storage/${cfMatch[1]}/${cfMatch[2]}`;\n  }\n  return trimmed;", "  return normalizeStorageApiUrl(trimmed, firebaseConfig.projectId || 'sidokter-soegiri');", 'normalize storage')
s = must_replace(s, "export async function resolveProtectedStorageUrl(", "export function isProtectedStorageUrl(url: string | null | undefined): boolean {\n  return isProtectedStorageApiUrl(url);\n}\n\nexport async function resolveProtectedStorageUrl(", 'protected helper')
s = must_replace(s, "  const isProtectedUrl = (value: string | undefined | null): boolean =>\n    Boolean(\n      value &&\n      (\n        value.startsWith('/api/storage/files/') ||\n        value.startsWith('/api/storage/path') ||\n        value.startsWith('/api/storage/sop/')\n      )\n    );", "  const isProtectedUrl = (value: string | undefined | null): boolean => isProtectedStorageUrl(value);", 'protected resolver predicate')
s = must_replace(s, "    normalizedUrl?.startsWith('/api/storage/files/') ||\n    normalizedUrl?.startsWith('/api/storage/path') ||\n    normalizedUrl?.startsWith('/api/storage/sop/') ||", "    isProtectedStorageUrl(normalizedUrl) ||", 'download predicate')
s = must_replace(s, "        const canGuessLegacyName = !fallbackStoragePath && !normalizedUrl?.startsWith('/api/storage/sop/');", "        const canGuessLegacyName = !fallbackStoragePath && !/\\/(?:api\\/storage|storageApi)\\/sop\\//i.test(normalizedUrl || '');", 'legacy predicate')
s = must_replace(s, "            const candidateRes = await fetch(candidateUrl, { headers });", "            const candidateRes = await fetch(normalizeStorageUrl(candidateUrl), { headers });", 'fallback runtime url')
p.write_text(s)

# DocumentViewer
p = Path('src/components/DocumentViewer.tsx')
s = p.read_text()
s = must_replace(s, "  resolveProtectedStorageUrl\n} from '../utils/fileStorage';", "  resolveProtectedStorageUrl,\n  isProtectedStorageUrl\n} from '../utils/fileStorage';", 'viewer import')
s = must_replace(s, "  const protectedFileId = url.match(/^\\/api\\/storage\\/files\\/([^?#]+)/)?.[1];", "  const protectedFileId = url.match(/\\/(?:api\\/storage|storageApi)\\/files\\/([^?#]+)/i)?.[1];", 'viewer slot')
s = must_replace(s, "function requiresProtectedHeaders(url: string): boolean {\n  return url.startsWith('/api/storage/files/') ||\n    url.startsWith('/api/storage/path') ||\n    url.startsWith('/api/storage/sop/');\n}", "function requiresProtectedHeaders(url: string): boolean {\n  return isProtectedStorageUrl(url);\n}", 'viewer protected predicate')
p.write_text(s)

# documentLibraryService
p = Path('src/lib/documentLibraryService.ts')
s = p.read_text()
s = must_replace(s, "import { deleteNamedFileFromLocalCache, getNamedFileFromLocalCache, buildStoragePathUrl, resolveProtectedStorageUrl } from '../utils/fileStorage';", "import { deleteNamedFileFromLocalCache, getNamedFileFromLocalCache, buildStoragePathUrl, resolveProtectedStorageUrl, normalizeStorageUrl, isProtectedStorageUrl } from '../utils/fileStorage';", 'library import')
s = must_replace(s, "  if (document.downloadUrl && document.downloadUrl.startsWith('/api/storage/files/')) {\n    const fileId = document.downloadUrl.replace('/api/storage/files/', '');", "  if (document.downloadUrl && isProtectedStorageUrl(normalizeStorageUrl(document.downloadUrl))) {\n    const normalizedDeleteUrl = normalizeStorageUrl(document.downloadUrl);\n    const fileId = normalizedDeleteUrl.split('/files/')[1] || '';", 'library delete predicate')
s = must_replace(s, "    void getCurrentAuthToken().then((token) => fetch(`/api/storage/files/${fileId}`, {", "    void getCurrentAuthToken().then((token) => fetch(normalizeStorageUrl(`/api/storage/files/${fileId}`), {", 'library delete fetch')
s = must_replace(s, "    const viewUrl = document.downloadUrl.startsWith('/api/storage/files/')\n      ? await resolveProtectedStorageUrl(document.downloadUrl, document.storagePath)\n      : await resolveViewableUrl(document.downloadUrl);", "    const normalizedDownloadUrl = normalizeStorageUrl(document.downloadUrl);\n    const viewUrl = isProtectedStorageUrl(normalizedDownloadUrl)\n      ? await resolveProtectedStorageUrl(normalizedDownloadUrl, document.storagePath)\n      : await resolveViewableUrl(normalizedDownloadUrl);", 'library view')
s = must_replace(s, "    const fallbackServerUrl = `/api/storage/files/${cand}`;", "    const fallbackServerUrl = normalizeStorageUrl(`/api/storage/files/${cand}`);", 'library head')
p.write_text(s)

# SopDetailModal
p = Path('src/components/SopDetailModal.tsx')
s = p.read_text()
s = must_replace(s, "import { triggerFileDownload, openDocumentPreview, getFileFromPersistentCacheAsync, resolveProtectedStorageUrl } from '../utils/fileStorage';", "import { triggerFileDownload, openDocumentPreview, getFileFromPersistentCacheAsync, resolveProtectedStorageUrl, normalizeStorageUrl } from '../utils/fileStorage';", 'sop import storage')
s = must_replace(s, "import { shouldShowSignatureAndStamp } from '../utils/documentUtils';", "import { shouldShowSignatureAndStamp } from '../utils/documentUtils';\nimport { buildCloudFunctionUrl, isCapacitorNativeRuntime, publicWebBaseUrl } from '../lib/runtimeEndpoints';", 'sop runtime import')
s = must_replace(s, "        const pathUrl = storagePath.startsWith('/api/storage/') ? storagePath : buildStoragePathUrl(storagePath);", "        const pathUrl = storagePath.startsWith('/api/storage/') ? normalizeStorageUrl(storagePath) : buildStoragePathUrl(storagePath);", 'sop storage path')
s = must_replace(s, "      const legacyServerUrl = `/api/storage/sop/${encodeURIComponent(sop.id)}`;", "      const legacyServerUrl = normalizeStorageUrl(`/api/storage/sop/${encodeURIComponent(sop.id)}`);", 'sop legacy route')
s = must_replace(s, "      baseUrl: window.location.origin,", "      baseUrl: publicWebBaseUrl(),", 'sop pdf base')
s = must_replace(s, "    const endpoints = [\n      '/api/pdf',\n      'https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/pdfApi',", "    const directPdfEndpoint = buildCloudFunctionUrl('pdfApi', 'sidokter-soegiri');\n    const endpoints = [\n      ...(isCapacitorNativeRuntime() ? [] : ['/api/pdf']),\n      directPdfEndpoint,", 'sop pdf endpoints')
p.write_text(s)

# CORS policies
p = Path('functions/index.js')
s = p.read_text()
target = "  const local = /^http:\\/\\/localhost:\\d+$/;"
if s.count(target) != 3:
    raise SystemExit(f'CORS policy: expected 3 local regexes, found {s.count(target)}')
s = s.replace(target, target + "\n  const native = /^(?:capacitor|ionic):\\/\\/localhost$/;")
s = s.replace("local.test(origin) || vercel.test(origin)", "local.test(origin) || native.test(origin) || vercel.test(origin)")
p.write_text(s)

Path('tests/ios-runtime-endpoints.test.ts').write_text("""import { strict as assert } from 'node:assert';
import {
  buildCloudFunctionUrl,
  isCapacitorNativeRuntime,
  isProtectedStorageApiUrl,
  normalizeStorageApiUrl,
  storageApiUrl,
} from '../src/lib/runtimeEndpoints';

const originalWindow = (globalThis as any).window;
const setWindow = (protocol: string, origin: string) => {
  (globalThis as any).window = {
    location: { protocol, origin },
    Capacitor: { isNativePlatform: () => protocol === 'capacitor:' }
  };
};

setWindow('https:', 'https://sidokter.vercel.app');
assert.equal(isCapacitorNativeRuntime(), false);
assert.equal(storageApiUrl('/files/abc', 'sidokter-soegiri'), '/api/storage/files/abc');
assert.equal(normalizeStorageApiUrl('https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/storageApi/files/abc', 'sidokter-soegiri'), '/api/storage/files/abc');

setWindow('capacitor:', 'capacitor://localhost');
assert.equal(isCapacitorNativeRuntime(), true);
assert.equal(storageApiUrl('/files/abc', 'sidokter-soegiri'), 'https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/storageApi/files/abc');
assert.equal(normalizeStorageApiUrl('/api/storage/path/sidokter%2Fspo%2Fa.pdf', 'sidokter-soegiri'), 'https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/storageApi/path/sidokter%2Fspo%2Fa.pdf');
assert.equal(isProtectedStorageApiUrl('/api/storage/files/abc'), true);
assert.equal(isProtectedStorageApiUrl('https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/storageApi/files/abc'), true);
assert.equal(buildCloudFunctionUrl('authApi', 'sidokter-soegiri'), 'https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/authApi');

(globalThis as any).window = originalWindow;
console.log('iOS runtime endpoint contract: OK');
""")

print('Stage 4 patch applied successfully')
