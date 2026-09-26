import { LibraryDocument, LibraryDocumentType, UserRole } from '../types';
import { deleteNamedFileFromLocalCache, getNamedFileFromLocalCache, buildStoragePathUrl, resolveProtectedStorageUrl, normalizeStorageUrl, isProtectedStorageUrl } from '../utils/fileStorage';
import { safeSetLocalStorage } from '../utils/storageQuota';
import { saveLibraryDocToFirestore, deleteLibraryDocFromFirestore, subscribeToFirestoreLibraryDocs, fetchLibraryDocsFromFirestore } from './firestoreService';
import { uploadFileToCloudStorage, resolveViewableUrl } from './cloudStorageService';
import { upsertLibraryDocumentById } from './libraryDocumentCreatePolicy';

import { getPersistedClientSession, getCurrentAuthToken } from './authService';
const LIBRARY_KEY = 'soegiri_offline_library_v1';
const subscribers = new Set<() => void>();
let firestoreSyncInitialized = false;

function getDocuments(): LibraryDocument[] {
  try { const raw = localStorage.getItem(LIBRARY_KEY); return raw ? JSON.parse(raw) as LibraryDocument[] : []; } catch { return []; }
}
function saveDocuments(documents: LibraryDocument[]) {
  safeSetLocalStorage(LIBRARY_KEY, JSON.stringify(documents));
  subscribers.forEach((fn) => fn());
}

function initFirestoreSync() {
  if (firestoreSyncInitialized) return;
  firestoreSyncInitialized = true;

  // Initial fetch from Firestore
  void fetchLibraryDocsFromFirestore().then((cloudDocs) => {
    // Firestore is authoritative. An empty successful snapshot means the
    // cloud collection is empty and must clear stale browser cache.
    if (cloudDocs !== null) saveDocuments(cloudDocs);
  });

  // Real-time snapshot listener
  subscribeToFirestoreLibraryDocs((cloudDocs) => {
    // Snapshot contents are the source of truth, including an empty set.
    saveDocuments(Array.isArray(cloudDocs) ? cloudDocs : []);
  });
}

export function subscribeToLibraryDocuments(onData: (documents: LibraryDocument[]) => void, onError?: (err: any) => void) {
  initFirestoreSync();
  const emit = () => { try { onData(getDocuments().sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())); } catch(e) { onError?.(e); } };
  emit(); subscribers.add(emit);
  const onStorage = (e: StorageEvent) => { if (e.key === LIBRARY_KEY) emit(); };
  window.addEventListener('storage', onStorage);
  return () => { subscribers.delete(emit); window.removeEventListener('storage', onStorage); };
}

export async function uploadDocument(file: File, type: LibraryDocumentType, title: string, uploadedBy?: string, actorRole?: UserRole, metadata?: any, actorBadges?: string[]): Promise<LibraryDocument> {
  const hasStructuralBadge = Array.isArray(actorBadges) && actorBadges.some((b) => String(b).toUpperCase() === 'STRUKTURAL');
  if (actorRole !== 'admin' && !hasStructuralBadge) {
    throw new Error(`Akses ditolak. Dokumen ${type} hanya dapat diakses oleh User dengan badge STRUKTURAL.`);
  }
  if (!['SK','MOU','REGULASI'].includes(type)) throw new Error('Jenis dokumen tidak valid.');
  if (!file || file.type !== 'application/pdf') throw new Error('File harus berupa PDF.');
  // Keep the client validation aligned with the Firebase Storage API hard
  // limit. Allowing 20 MB here previously let a user finish the form only to
  // have the authoritative upload rejected at 15 MB.
  if (file.size > 15 * 1024 * 1024) throw new Error('Ukuran PDF maksimal 15 MB.');
  if (!title.trim()) throw new Error('Judul dokumen wajib diisi.');
  const id = `library-${type.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  // Upload to Cloud Server Storage so all other devices can access it permanently
  let cloudUrl = '';
  let cloudStoragePath = '';
  try {
    const uploadRes = await uploadFileToCloudStorage(file, file.name, id, type);
    if (!uploadRes?.url || !uploadRes.storagePath) throw new Error('Cloud storage tidak mengembalikan referensi file permanen.');
    cloudUrl = uploadRes.url;
    cloudStoragePath = uploadRes.storagePath;
  } catch (uploadErr) {
    await deleteNamedFileFromLocalCache(`library_${id}`).catch(() => {});
    throw uploadErr instanceof Error ? uploadErr : new Error('Gagal mengunggah file ke cloud storage.');
  }

  const isRevisionSK = Boolean(metadata?.isRevisionSK || metadata?.skCategory === 'PERUBAHAN');
  const skCategory = metadata?.skCategory || (isRevisionSK ? 'PERUBAHAN' : 'POKOK');

  const now = new Date().toISOString();
  const document: LibraryDocument = {
    id,
    type,
    title: title.trim(),
    documentNumber: metadata?.documentNumber?.trim() || undefined,
    partnerName: metadata?.partnerName?.trim() || undefined,
    effectiveDate: metadata?.effectiveDate || undefined,
    expiryDate: metadata?.expiryDate || undefined,
    description: metadata?.description?.trim() || undefined,
    status: metadata?.status || 'AKTIF',
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    storagePath: cloudStoragePath,
    downloadUrl: cloudUrl,
    createdAt: now,
    updatedAt: now,
    uploadedBy,
    // Regulasi daerah
    regulationType: type === 'REGULASI' && ['PERDA', 'PERBUP'].includes(String(metadata?.regulationType || '').toUpperCase())
      ? String(metadata.regulationType).toUpperCase() as any
      : undefined,
    regulationYear: type === 'REGULASI'
      ? (String(metadata?.regulationYear || '').trim() || undefined)
      : undefined,
    // SK Perubahan fields
    isRevisionSK: type === 'SK' ? isRevisionSK : undefined,
    skCategory: type === 'SK' ? skCategory : undefined,
    originalSkId: type === 'SK' && metadata?.originalSkId ? String(metadata.originalSkId).trim() : undefined,
    originalSkNumber: type === 'SK' && metadata?.originalSkNumber ? String(metadata.originalSkNumber).trim() : undefined,
    originalSkTitle: type === 'SK' && metadata?.originalSkTitle ? String(metadata.originalSkTitle).trim() : undefined,
    revisionReason: type === 'SK' && metadata?.revisionReason ? String(metadata.revisionReason).trim() : undefined,
    revisionType: type === 'SK' && metadata?.revisionType ? String(metadata.revisionType).trim() : undefined
  };
  // The Firestore library record is the cross-PC metadata source of truth.
  // Do not report an upload as successful until both durable layers commit.
  try {
    await saveLibraryDocToFirestore(document, { throwOnError: true });
  } catch (metadataError) {
    throw metadataError instanceof Error ? metadataError : new Error('Gagal menyimpan metadata dokumen ke Firestore.');
  }
  // setDoc can publish its onSnapshot before this continuation runs. Reconcile
  // the optimistic cache by the canonical Firestore document ID rather than
  // appending a second copy of the same logical document.
  saveDocuments(upsertLibraryDocumentById(getDocuments(), document));
  return document;
}

export async function updateDocument(id:string, updates:any, updatedBy?:string, actorRole?:UserRole):Promise<void>{
  if(actorRole!=='admin') throw new Error('Akses ditolak. Hanya Admin yang dapat mengedit dokumen.');
  const all=getDocuments(); const i=all.findIndex(d=>d.id===id); if(i<0) throw new Error('Dokumen tidak ditemukan.');
  const previous = all[i];
  all[i]={...all[i],...updates,title:String(updates.title ?? all[i].title).trim(),updatedAt:new Date().toISOString(),updatedBy};
  try {
    await saveLibraryDocToFirestore(all[i], { throwOnError: true });
  } catch (metadataError) {
    all[i] = previous;
    throw metadataError instanceof Error ? metadataError : new Error('Gagal memperbarui metadata dokumen di Firestore.');
  }
  saveDocuments(all);
}
export async function deleteDocument(document:LibraryDocument,actorRole?:UserRole):Promise<void>{
  if(actorRole!=='admin') throw new Error('Akses ditolak. Hanya Admin yang dapat menghapus dokumen.');
  await deleteNamedFileFromLocalCache(`library_${document.id}`);
  saveDocuments(getDocuments().filter(d=>d.id!==document.id));
  void deleteLibraryDocFromFirestore(document.id);
  // Delete from server storage if cloud url
  if (document.downloadUrl && isProtectedStorageUrl(normalizeStorageUrl(document.downloadUrl))) {
    const normalizedDeleteUrl = normalizeStorageUrl(document.downloadUrl);
    const fileId = normalizedDeleteUrl.split('/files/')[1] || '';
    const session = getPersistedClientSession();
    void getCurrentAuthToken().then((token) => fetch(normalizeStorageUrl(`/api/storage/files/${fileId}`), {
      method: 'DELETE',
      headers: {
        ...(session?.sessionId ? { 'X-Session-Id': session.sessionId } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    })).catch(() => {});
  }
}
export async function getDocumentUrl(document: LibraryDocument): Promise<string | null> {
  // 1. Direct downloadUrl or storagePath
  if (document.downloadUrl) {
    const normalizedDownloadUrl = normalizeStorageUrl(document.downloadUrl);
    const viewUrl = isProtectedStorageUrl(normalizedDownloadUrl)
      ? await resolveProtectedStorageUrl(normalizedDownloadUrl, document.storagePath)
      : await resolveViewableUrl(normalizedDownloadUrl);
    if (viewUrl) return viewUrl;
  }
  if (document.storagePath) {
    // A storagePath is an objectPath, not a file id and must be resolved by
    // the protected storage API. Do not return the raw path as a browser URL.
    return buildStoragePathUrl(document.storagePath);
  }

  // 2. Predictable server storage endpoints
  const candidates = [
    document.id,
    `library_${document.id}`,
    `sk_${document.id}`,
    `mou_${document.id}`,
    `regulasi_${document.id}`
  ];

  for (const cand of candidates) {
    const fallbackServerUrl = normalizeStorageUrl(`/api/storage/files/${cand}`);
    try {
      const session = getPersistedClientSession();
      const token = await getCurrentAuthToken();
      const head = await fetch(fallbackServerUrl, {
        method: 'HEAD',
        headers: {
          ...(session?.sessionId ? { 'X-Session-Id': session.sessionId } : {}),
          ...(session?.authUid ? { 'X-Soegiri-Auth-Uid': session.authUid } : {}),
          ...(session?.username ? { 'X-User-Username': session.username } : {}),
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (head.ok) return fallbackServerUrl;
    } catch {}
  }

  // 3. Local persistent cache fallback
  const localCached = await getNamedFileFromLocalCache(`library_${document.id}`) ||
                      await getNamedFileFromLocalCache(`cloud_${document.id}`);
  if (localCached) return localCached;

  return null;
}

export async function getLibraryDocumentsForBackup(type?: LibraryDocumentType): Promise<LibraryDocument[]> {
  return getDocuments().filter((d) => !type || d.type === type);
}
export async function getLibraryFilesForBackup(type?: LibraryDocumentType): Promise<Record<string,string>> {
  const out: Record<string,string> = {};
  for (const d of getDocuments().filter((x) => !type || x.type === type)) {
    const data = await getNamedFileFromLocalCache(`library_${d.id}`);
    if (data) out[`library_${d.id}`] = data;
  }
  return out;
}
export async function restoreLibraryDocuments(documents: LibraryDocument[], files: Record<string,string> = {}): Promise<void> {
  const valid = documents.filter((d) => d && (d.type === 'SK' || d.type === 'MOU' || d.type === 'REGULASI'));
  saveDocuments(valid);
}

/**
 * Compatibility aliases for legacy Library UI components.
 * Canonical API remains uploadDocument/deleteDocument/getDocumentUrl.
 * These aliases keep existing callers working while the document domains
 * (SPO/SK/MOU/REGULASI) remain separated at the service layer.
 */
export const uploadLibraryDocument = uploadDocument;
export const deleteLibraryDocument = deleteDocument;
export const getLibraryDocumentUrl = getDocumentUrl;
